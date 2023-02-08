use std::collections::VecDeque;

use crate::{
    errors,
    instructions::{InitBoundedStrategyV2, ReclaimV2},
    token_account_seeds, token_account_signer_seeds,
};

use super::{leg::Leg, math::find_maximum_input, Dex, DexList};
use anchor_lang::prelude::*;

const MAX_LEGS: usize = 3;

#[derive(Default)]
pub(crate) struct Route<'a, 'info> {
    pub legs: [Option<Leg<'a, 'info>>; MAX_LEGS],
}

impl<'a, 'info> Route<'a, 'info> {
    pub fn create(
        remaining_accounts: &'a [AccountInfo<'info>],
        additional_data: VecDeque<u8>,
        is_init: bool,
    ) -> Result<Self> {
        // Unpack & initalize the routes from remaining accounts
        let mut route = Route::default();
        let (mut account_cursor, mut leg_cursor): (usize, usize) = (0, 0);
        let mut added_data = additional_data;
        while let Some(dex_program) = remaining_accounts.get(account_cursor) {
            let dex = DexList::from_id(dex_program.key())?;
            let end_index = dex.get_end_account_idx(account_cursor, is_init);

            let account_infos = &remaining_accounts[account_cursor..end_index];
            // Create the Leg
            let leg = Leg::from_account_slice(dex, account_infos, &mut added_data, is_init)?;

            // Add the leg to the Route
            route.legs[leg_cursor] = Some(leg);

            account_cursor = end_index;
            leg_cursor += 1;
        }
        Ok(route)
    }

    /// Simulate the route with the smallest lot possible, testing whether the trade fits the
    /// bounds
    pub fn simple_price_check(
        &self,
        input_amount: u64,
        bounded_price_numerator: &u64,
        bounded_price_denominator: &u64,
    ) -> bool {
        let output = self.simulate_execution(input_amount);

        is_in_bounds(
            input_amount,
            output,
            bounded_price_numerator,
            bounded_price_denominator,
        )
    }

    ///
    /// Return the mint that is the input to the trade route
    ///
    pub fn start_mint(&self) -> Result<Pubkey> {
        match &self.legs[0] {
            Some(leg) => leg.start_mint(),
            None => panic!("First leg cannot be blank"),
        }
    }

    ///
    /// Return the end mint of the final leg in the route.
    ///
    pub fn end_mint(&self) -> Result<Pubkey> {
        // Iterate in reverse returning the end_mint of the first leg
        for leg in self.legs.iter().rev() {
            match leg {
                Some(leg) => return leg.end_mint(),
                None => {}
            }
        }
        panic!("There must be at least one leg")
    }

    ///
    /// Creates any necessary TokenAccounts for the route.
    /// TODO: Gracefully handle when the SPL Token program errors because the token account
    /// exists. Without graceful handling, an adversary could block the usage
    ///
    pub fn initialize_intermediary_token_accounts(
        &self,
        ctx: &Context<'_, '_, 'a, 'info, InitBoundedStrategyV2<'info>>,
    ) -> Result<()> {
        // Get all the intermediary token mint addresses
        for (index, leg) in self.legs.iter().enumerate() {
            match leg {
                Some(leg) => {
                    // If this is the last leg, skip because the destination account is already checked at initialization
                    if self.legs.get(index + 1).is_none() || self.legs[index + 1].is_none() {
                        continue;
                    }
                    // Get the token account as account info
                    let destination_account = leg.destination_token_account();
                    let destination_key = destination_account.key();
                    let destination_mint = leg.destination_mint_account().key();
                    let destination_mint_account = leg.destination_mint_account();
                    // Create the Account with rent exemption
                    let cpi_accounts = anchor_lang::system_program::CreateAccount {
                        from: ctx.accounts.payer.to_account_info(),
                        to: destination_account.to_account_info(),
                    };
                    // Get the canonical TokenAccount bump
                    let (token_account_key, token_account_bump) = Pubkey::find_program_address(
                        token_account_seeds!(&ctx.accounts.strategy, destination_mint),
                        ctx.program_id,
                    );
                    if destination_key != token_account_key {
                        return Err(error!(errors::ErrorCode::BadTokenAccountKeyForLeg));
                    }
                    let cpi_ctx = CpiContext {
                        program: ctx.accounts.token_program.to_account_info(),
                        accounts: cpi_accounts,
                        remaining_accounts: Vec::new(),
                        signer_seeds: &[token_account_signer_seeds!(
                            &ctx.accounts.strategy,
                            destination_mint,
                            token_account_bump
                        )],
                    };
                    anchor_lang::system_program::create_account(
                        cpi_ctx,
                        Rent::get()?.minimum_balance(anchor_spl::token::TokenAccount::LEN),
                        anchor_spl::token::TokenAccount::LEN as u64,
                        ctx.accounts.token_program.key,
                    )?;
                    // Initialize the SPL Token account
                    let cpi_program = ctx.accounts.token_program.to_account_info();
                    let accounts = anchor_spl::token::InitializeAccount3 {
                        account: destination_account,
                        mint: destination_mint_account.to_account_info(),
                        authority: ctx.accounts.strategy.to_account_info(),
                    };
                    let cpi_ctx = anchor_lang::context::CpiContext::new(cpi_program, accounts);
                    anchor_spl::token::initialize_account3(cpi_ctx)?;
                }
                None => {}
            }
        }

        Ok(())
    }

    ///
    /// Find the maximum amount of tokens to input in the trade such that the execution price does
    /// not cross the bounded price.
    ///
    pub fn calculate_max_input(
        &self,
        input_tokens_available: u64,
        bounded_price_numerator: &u64,
        bounded_price_denominator: &u64,
        iterations: u8,
    ) -> u64 {
        find_maximum_input(
            |x| {
                self.simulate_bounded_execution(
                    x,
                    bounded_price_numerator,
                    bounded_price_denominator,
                )
            },
            0,
            input_tokens_available,
            iterations.into(),
        )
    }

    ///
    /// Execute all legs of the route
    ///
    pub fn execute(&self, input_tokens: u64, signers_seeds: &[&[&[u8]]]) -> Result<()> {
        for (index, leg) in self.legs.iter().enumerate() {
            match leg {
                Some(leg) => {
                    if index == 0 {
                        leg.swap(input_tokens, signers_seeds)?;
                    } else {
                        let amount = leg.input_balance()?;
                        leg.swap(amount, signers_seeds)?;
                    }
                }
                None => {}
            }
        }
        Ok(())
    }

    ///
    /// Close and clean up and accounts for each Leg
    ///
    pub fn cleanup_accounts(
        &self,
        ctx: &Context<'_, '_, 'a, 'info, ReclaimV2<'info>>,
    ) -> Result<()> {
        self.for_each_leg(|leg| leg.close_dex_accounts(ctx))
    }

    ///
    /// Simulates the trade execution but returns 0 if the execution price is out of bounds.
    /// This is required to adjust the curve and avoid input amounts where the execution
    /// price is outside the curve.
    ///
    fn simulate_bounded_execution(
        &self,
        input_amount: u64,
        bounded_price_numerator: &u64,
        bounded_price_denominator: &u64,
    ) -> u64 {
        let output = self.simulate_execution(input_amount);
        // Price check to ensure the input to output ratio is in bounds.
        if is_in_bounds(
            input_amount,
            output,
            bounded_price_numerator,
            bounded_price_denominator,
        ) {
            output
        } else {
            0
        }
    }

    ///
    /// Simulate the amount of output tokens you will receive if executing the Route
    ///
    fn simulate_execution(&self, input_amount: u64) -> u64 {
        let mut output: u64 = 0;
        self.for_each_leg(|leg| {
            output = leg.simulate_trade(input_amount);
            Ok(())
        })
        .unwrap();
        return output;
    }

    fn for_each_leg<F>(&self, mut f: F) -> Result<()>
    where
        F: FnMut(&Leg<'a, 'info>) -> Result<()>,
    {
        for leg in self.legs.iter() {
            match leg {
                Some(leg) => {
                    f(&leg)?;
                }
                None => {}
            }
        }
        Ok(())
    }
}

///
/// Check whether the execution price is out of bounds
///
fn is_in_bounds(
    input: u64,
    output: u64,
    bounded_price_numerator: &u64,
    bounded_price_denominator: &u64,
) -> bool {
    // Normalize input to output to determine whether the price per asset matches the
    //  bound. This must handle the case where output is less than input (i.e. the purchase price is < 1)
    let bounded_numerator = bounded_price_numerator * output;
    let executed_numerator = input * bounded_price_denominator;
    msg!(
        "i {} o {} bpn {} bpd {}",
        input,
        output,
        bounded_price_numerator,
        bounded_price_denominator
    );
    if executed_numerator > bounded_numerator {
        false
    } else {
        true
    }
}

// Write unit tests for simple_price_check
#[cfg(test)]
mod test {
    use anchor_lang::prelude::AccountInfo;

    use crate::dexes::open_book_dex::OpenBookDex;
    use crate::dexes::serum_v3::OrderBookItem;
    use crate::dexes::{math::U128, Leg, Route};

    fn mock_open_book_route<'a, 'info>(
        route: &mut Route<'a, 'info>,
        accounts: &'a [AccountInfo<'info>],
        trade_is_bid: bool,
    ) {
        let order_book = if trade_is_bid {
            vec![
                OrderBookItem {
                    price: 92750000,
                    quantity: 191300000000,
                    quantity_sum: 191300000000,
                    price_quantity_sum: U128::from(17_743_075_000_000_000_000 as i128),
                },
                OrderBookItem {
                    price: 92761000,
                    quantity: 977900000000,
                    quantity_sum: 1169200000000,
                    price_quantity_sum: U128::from(108_454_056_900_000_000_000 as i128),
                },
                OrderBookItem {
                    price: 92805000,
                    quantity: 383100000000,
                    quantity_sum: 1552300000000,
                    price_quantity_sum: U128::from(144_007_652_400_000_000_000 as i128),
                },
            ]
        } else {
            vec![
                OrderBookItem {
                    price: 92805000,
                    quantity: 383100000000,
                    quantity_sum: 383100000000,
                    price_quantity_sum: U128::from(92805000 * 383100000000 as i128),
                },
                OrderBookItem {
                    price: 92761000,
                    quantity: 977900000000,
                    quantity_sum: 1361000000000,
                    price_quantity_sum: U128::from(
                        92805000 * 383100000000 + 977900000000 * 92761000 as i128,
                    ),
                },
                OrderBookItem {
                    price: 92750000,
                    quantity: 191300000000,
                    quantity_sum: 1552300000000,
                    price_quantity_sum: U128::from(
                        92805000 * 383100000000
                            + 977900000000 * 92761000
                            + 92750000 * 191300000000 as i128,
                    ),
                },
            ]
        };

        // Create mock OpenBookDex
        let obd = OpenBookDex {
            trade_is_bid,
            order_book,
            fee_numerator: 20,
            fee_denominator: 100000,
            coin_lot_size: 100000000,
            pc_lot_size: 100,
            has_fee_discount_account: false,
            base_decimals_factor: 1_000_000_000,
            accounts,
        };
        // Create leg from OpenBookDex
        let leg = Leg::OpenBookV3(obd);
        // Create single legged route with OpenBookDex
        route.legs[0] = Some(leg);
    }

    #[test]
    /// Test for a successful lower bound (sell)
    fn test_simple_price_1() {
        let mock_accounts: Vec<AccountInfo> = vec![];
        let mut route = Route::default();
        mock_open_book_route(&mut route, &mock_accounts, false);

        // Sell 1 SOL for at least 92 USDC
        let bounded_price_numerator = 1_000_000_000;
        let bounded_price_denominator = 92_000_000;
        let res = route.simple_price_check(
            1_000_000_000,
            &bounded_price_numerator,
            &bounded_price_denominator,
        );
        assert!(res == true);
    }

    #[test]
    // Test for a failing lower bound (sell)
    fn test_simple_price_2() {
        let mock_accounts: Vec<AccountInfo> = vec![];
        let mut route = Route::default();
        mock_open_book_route(&mut route, &mock_accounts, false);

        // Sell 1 SOL for at least 95
        let bounded_price_numerator = 1_000_000_000;
        let bounded_price_denominator = 95_000_000;

        let res = route.simple_price_check(
            1_000_000_000,
            &bounded_price_numerator,
            &bounded_price_denominator,
        );
        assert!(res == false);
    }

    #[test]
    // Test for a successful upper bound (buy)
    fn test_simple_price_3() {
        let mock_accounts: Vec<AccountInfo> = vec![];
        let mut route = Route::default();
        mock_open_book_route(&mut route, &mock_accounts, true);

        // Buy 1 SOL for at most 93 USDC
        let bounded_price_numerator = 93_000_000;
        let bounded_price_denominator = 1_000_000_000;

        let res = route.simple_price_check(
            1_000_000_000,
            &bounded_price_numerator,
            &bounded_price_denominator,
        );
        assert!(res == true);
    }

    #[test]
    // Test for a failing upper bound (buy)
    fn test_simple_price_4() {
        let mock_accounts: Vec<AccountInfo> = vec![];
        let mut route = Route::default();
        mock_open_book_route(&mut route, &mock_accounts, true);

        // Buy 1 SOL for at most 90 USDC
        let bounded_price_numerator = 90_000_000;
        let bounded_price_denominator = 1_000_000_000;

        let res = route.simple_price_check(
            1_000_000_000,
            &bounded_price_numerator,
            &bounded_price_denominator,
        );
        assert!(res == false);
    }
}
