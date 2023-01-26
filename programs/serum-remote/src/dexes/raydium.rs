use anchor_lang::prelude::*;

use crate::utils::spl_token_utils;

use super::{CurveType, Dex, math::{mul_div_u64, constant_product_simulation}};

/**
 * RAYDIUM SWAP ACCOUNT ORDER
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
