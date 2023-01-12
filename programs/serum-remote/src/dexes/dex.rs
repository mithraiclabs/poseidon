use anchor_lang::prelude::*;
use enum_dispatch::enum_dispatch;

use crate::{state::BoundedStrategyV2, instructions::InitBoundedStrategyV2};

#[enum_dispatch]
pub trait Dex {
    /// Given the amount of tokens_in, return the amount of tokens returned
    fn simulate_trade(&self, tokens_in: u64) -> u64;

    /// Execute the full swap via CPI to the DEX
    fn swap(&self, tokens_in: u64) -> Result<()>;

    /// Returns the balance of the input token account for the leg
    fn input_balance(&self) -> Result<u64>;
}

pub trait DexStatic<'a, 'info> {
    /// The number of accounts needed for the leg. Used to parse account infos slice.
    const ACCOUNTS_LEN: usize;

    /// The number of accounts needed for initializing trading on the DEX
    const INIT_ACCOUNTS_LEN: usize;

    /// Create the DEX instance from a slice of account infos.
    fn from_account_slice(
        accounts: &'a [AccountInfo<'info>],
        additional_data: &mut Vec<u8>,
    ) -> Result<Self>
    where
        Self: Sized;

    /// Handles any initialization needed for the DEX
    fn initialize(
        &self,
        ctx: &Context<'_, '_, '_, 'info, InitBoundedStrategyV2<'info>>,
        payer: UncheckedAccount<'info>,
        accounts: &'a [AccountInfo<'info>],
        bounded_strategy: &Account<'info, BoundedStrategyV2>,
        program_id: &Pubkey,
    ) -> Result<()>;
}
