use super::{leg::Leg, Dex, DexList};
use anchor_lang::prelude::*;

const MAX_LEGS: usize = 3;

#[derive(Default)]
pub(crate) struct Route<'a, 'info> {
    pub legs: [Option<Leg<'a, 'info>>; MAX_LEGS],
}

impl<'a, 'info> Route<'a, 'info> {
    pub fn create(
        remaining_accounts: &'a [AccountInfo<'info>],
        additional_data: Vec<u8>,
    ) -> Result<Self> {
        // Unpack & initalize the routes from remaining accounts
        let mut route = Route::default();
        let (mut account_cursor, mut leg_cursor): (usize, usize) = (0, 0);
        let mut added_data = additional_data;
        while let Some(dex_program) = remaining_accounts.get(account_cursor) {
            let dex = DexList::from_id(dex_program.key())?;
            let end_index = dex.get_end_account_idx(account_cursor);

            let account_infos = &remaining_accounts[account_cursor..end_index];
            // Create the Leg
            let leg = Leg::from_account_slice(dex, account_infos, &mut added_data)?;
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
        bounded_price_numerator: &u64,
        bounded_price_denominator: &u64,
        bound_direction: &u8,
    ) -> bool {
        // TODO: actually pull minimum trade size from each Leg and use that to determine the minimum input.
        let input_amount: u64 = 1_000_000;
        let mut output: u64 = 0;

        self.for_each_leg(|leg| output = leg.simulate_trade(input_amount));
        // Normalize input to output to determine whether the price per asset matches the
        //  bound. This must handle the case where output is less than input (i.e. the purchase price is < 1)
        let bounded_numerator = bounded_price_numerator * output;
        let executed_numerator = input_amount * bounded_price_denominator;

        // Check whether the execution price is out of bounds
        if bound_direction == &0 && executed_numerator < bounded_numerator {
            false
        } else if bound_direction == &1 && executed_numerator > bounded_numerator {
            false
        } else {
            true
        }
    }
    /// Return the mint that is the input to the trade route
    pub fn start_mint(&self) -> Result<Pubkey> {
        match &self.legs[0] {
            Some(leg) => leg.start_mint(),
            None => panic!("First leg cannot be blank"),
        }
    }

    /// Return the end mint of the final leg in the route.
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

    fn for_each_leg<F>(&self, mut f: F)
    where
        F: FnMut(&Leg),
    {
        for leg in self.legs.iter() {
            match leg {
                Some(leg) => {
                    f(&leg);
                }
                None => {}
            }
        }
    }
}

// TODO: Write unit tests for simple_price_check
#[cfg(test)]
mod test {
    use anchor_lang::prelude::AccountInfo;

    use crate::dexes::open_book_dex::OpenBookDex;
    use crate::dexes::serum_v3::OrderBookItem;
    use crate::dexes::{math::U128, Leg, Route};
    use crate::utils::U64F64;

    fn mock_open_book_route<'a, 'info>(
        route: &mut Route<'a, 'info>,
        accounts: &'a [AccountInfo<'info>],
    ) {
        // Create mock OpenBookDex
        let order_book = vec![
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
        ];

        let obd = OpenBookDex {
            trade_is_bid: true,
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
    /// Test for a successful buy
    fn test_simple_price_1() {
        let mock_accounts: Vec<AccountInfo> = vec![];
        let mut route = Route::default();
        mock_open_book_route(&mut route, &mock_accounts);

        // Lower bound
        let bound_direction = 0;
        // 92.75 USDC is input to get 1 SOL out. This creates a bounded price of 92.75 USDC / SOL
        let bounded_price_numerator = 92_750_000;
        let bounded_price_denominator = 1_000_000_000;

        let res = route.simple_price_check(
            &bounded_price_numerator,
            &bounded_price_denominator,
            &bound_direction,
        );
        assert!(res == true);
    }

    // TODO: Write a test for a failing buy
    // TODO: Write a test for a successful sell
    // TODO: Write a test for a failing sell
}
