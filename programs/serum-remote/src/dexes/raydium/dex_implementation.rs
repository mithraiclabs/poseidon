use anchor_lang::prelude::*;

use crate::utils::spl_token_utils;

use super::{
    super::{
        math::{constant_product_simulation, mul_div_u64},
        CurveType, Dex, DexStatic,
    },
    base_total_accessor, bnt_accessor, qnt_accessor, quote_total_accessor, swap_base_in,
};

/**
 * RAYDIUM V4 SWAP ACCOUNT ORDER
 * 0 - Raydium program ID
 * 1 - amm_id
 * 2 - amm_authority
 * 3 - amm_open_orders
 * 4 - amm_target_orders
 * 5 - pool_coin_token_account
 * 6 - pool_pc_token_account
 * 7 - serum_program_id
 * 8 - serum_market
 * 9 - serum_bids
 * 10 - serum_asks
 * 11 - serum_event_queue
 * 12 - serum_coin_vault_account
 * 13 - serum_pc_vault_account
 * 14 - serum_vault_signer
 * 15 - user_source_token_account
 * 16 - user_destination_token_account
 * 17 - user_source_owner
 * 18 - SPL Token Program
 */
pub struct RaydiumSwap<'a, 'info> {
    fee_numerator: u64,
    fee_denominator: u64,
    base_is_input: bool,
    base_effective_balance: u64,
    quote_effective_balance: u64,
    curve_type: CurveType,
    accounts: &'a [AccountInfo<'info>],
}

impl<'a, 'info> RaydiumSwap<'a, 'info> {
    fn user_source_token_account(&self) -> &AccountInfo<'info> {
        &self.accounts[15]
    }

    fn user_destination_token_account(&self) -> &AccountInfo<'info> {
        &self.accounts[16]
    }

    // This account at index 19 should only exist during initialization
    fn destination_mint(&self) -> &AccountInfo<'info> {
        &self.accounts[19]
    }
}

impl Dex for RaydiumSwap<'_, '_> {
    fn input_balance(&self) -> Result<u64> {
        Ok(spl_token_utils::amount(
            &self.user_source_token_account().try_borrow_data()?,
        ))
    }

    fn simulate_trade(&self, tokens_in: u64) -> u64 {
        match self.curve_type {
            CurveType::ConstantProduct => {
                let (in_pool_balance, out_pool_balance) = if self.base_is_input {
                    (self.base_effective_balance, self.quote_effective_balance)
                } else {
                    (self.quote_effective_balance, self.base_effective_balance)
                };
                let post_fee_in = tokens_in
                    - mul_div_u64(tokens_in, self.fee_numerator, self.fee_denominator).unwrap();
                constant_product_simulation(post_fee_in, in_pool_balance, out_pool_balance)
            }
            CurveType::Stable => {
                todo!()
            }
        }
    }

    fn start_mint(&self) -> Result<Pubkey> {
        Ok(spl_token_utils::mint(
            &self.user_source_token_account().try_borrow_data()?,
        ))
    }

    fn end_mint(&self) -> Result<Pubkey> {
        Ok(spl_token_utils::mint(
            &self.user_destination_token_account().try_borrow_data()?,
        ))
    }
}

impl<'a, 'info> DexStatic<'a, 'info> for RaydiumSwap<'a, 'info> {
    const ACCOUNTS_LEN: usize = 19;
    const INIT_ACCOUNTS_LEN: usize = 20;

    fn destination_mint_account(&self) -> AccountInfo<'info> {
        self.destination_mint().to_account_info()
    }

    fn destination_token_account(&self) -> AccountInfo<'info> {
        self.user_destination_token_account().to_account_info()
    }

    fn from_account_slice(
        accounts: &'a [AccountInfo<'info>],
        _additional_data: &mut std::collections::VecDeque<u8>,
        _is_init: bool,
    ) -> Result<Self>
    where
        Self: Sized,
    {
        let user_source_token_account = &accounts[15];
        let serum_coin_vault_account = &accounts[12];
        let source_mint = spl_token_utils::mint(&user_source_token_account.try_borrow_data()?);
        let base_mint = spl_token_utils::mint(&serum_coin_vault_account.try_borrow_data()?);
        let base_is_input = base_mint == source_mint;

        let open_orders_account = &accounts[3];
        let base_pool_account = &accounts[5];
        let quote_pool_account = &accounts[6];
        let amm_account = &accounts[1];
        let oo_data = open_orders_account.try_borrow_data()?;
        let amm_data = amm_account.try_borrow_data()?;

        let base_pool_bal = spl_token_utils::amount(&base_pool_account.try_borrow_data()?);
        let quote_pool_bal = spl_token_utils::amount(&quote_pool_account.try_borrow_data()?);
        let quote_oo_bal = quote_total_accessor(&oo_data);
        let base_oo_bal = base_total_accessor(&oo_data);
        let quote_needed_take_pnl = qnt_accessor(&amm_data);
        let base_needed_take_pnl = bnt_accessor(&amm_data);

        let base_effective_balance = (base_pool_bal + base_oo_bal) - base_needed_take_pnl;
        let quote_effective_balance = (quote_pool_bal + quote_oo_bal) - quote_needed_take_pnl;

        let (fee_numerator, fee_denominator) = (25, 10_000);
        Ok(RaydiumSwap {
            fee_numerator,
            fee_denominator,
            base_is_input,
            base_effective_balance,
            quote_effective_balance,
            curve_type: CurveType::ConstantProduct,
            accounts,
        })
    }

    fn initialize(
        &self,
        _ctx: &Context<'_, '_, '_, 'info, crate::instructions::InitBoundedStrategyV2<'info>>,
    ) -> Result<()> {
        // Nothing to initialize for Raydium swapping
        Ok(())
    }

    fn swap(&self, tokens_in: u64, signers_seeds: &[&[&[u8]]]) -> Result<()> {
        let instruction = swap_base_in(
            self.accounts[0].key,
            self.accounts[1].key,
            self.accounts[2].key,
            self.accounts[3].key,
            self.accounts[4].key,
            self.accounts[5].key,
            self.accounts[6].key,
            self.accounts[7].key,
            self.accounts[8].key,
            self.accounts[9].key,
            self.accounts[10].key,
            self.accounts[11].key,
            self.accounts[12].key,
            self.accounts[13].key,
            self.accounts[14].key,
            self.accounts[15].key,
            self.accounts[16].key,
            self.accounts[17].key,
            tokens_in,
            1,
        )?;
        anchor_lang::solana_program::program::invoke_signed_unchecked(
            &instruction,
            self.accounts,
            signers_seeds,
        )
        .unwrap();
        Ok(())
    }

    fn cleanup_accounts(
        &self,
        ctx: &Context<'_, '_, 'a, 'info, crate::instructions::ReclaimV2<'info>>,
    ) -> Result<()> {
        Ok(())
    }
}
