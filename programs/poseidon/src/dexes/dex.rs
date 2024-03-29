use std::collections::VecDeque;

use anchor_lang::prelude::*;
use enum_dispatch::enum_dispatch;

#[enum_dispatch]
pub trait Dex {
    /// Given the amount of tokens_in, return the amount of tokens returned
    fn simulate_trade(&self, tokens_in: u64) -> u64;

    /// Returns the balance of the input token account for the leg
    fn input_balance(&self) -> Result<u64>;

    /// Returns the mint of the starting token for the swap/trade
    fn start_mint(&self) -> Result<Pubkey>;

    /// Returns the mint of the token being swapped to
    fn end_mint(&self) -> Result<Pubkey>;
}

pub trait DexStatic<'a, 'info> {
    /// The number of accounts needed for the leg. Used to parse account infos slice.
    const ACCOUNTS_LEN: usize;

    /// The number of accounts needed for initializing trading on the DEX
    const INIT_ACCOUNTS_LEN: usize;

    /// Create the DEX instance from a slice of account infos.
    fn from_account_slice(
        accounts: &'a [AccountInfo<'info>],
        additional_data: &mut VecDeque<u8>,
    ) -> Result<Self>
    where
        Self: Sized;

    /// Execute the full swap via CPI to the DEX
    fn swap(&self, tokens_in: u64, signers_seeds: &[&[&[u8]]]) -> Result<()>;
}

#[derive(Clone, PartialEq)]
pub enum CurveType {
    ConstantProduct,
    Stable,
}
