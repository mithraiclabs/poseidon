use anchor_lang::prelude::*;
use static_assertions::const_assert;

pub const MAX_ACCOUNTS: usize = 32;

#[account]
pub struct BoundedStrategyV2 {
    pub collateral_mint: Pubkey,
    /// The token account where the assets to be traded are held
    pub collateral_account: Pubkey,
    /// The side of the order book the market order will be placed
    /// 0 for Bid | Buy, 1 for Ask | Sell
    pub order_side: u8,
    /// The date at which the DAO's assets can be reclaimed
    pub reclaim_date: i64,
    /// The address that the assets are transferred to when being reclaimed.
    pub reclaim_address: Pubkey,
    /// The address where the swapped asset should be deposited
    pub deposit_address: Pubkey,
    /// 0 for lower bound, 1 for upper bound
    pub bound: u8,
    /// Using a numerator and denominator we can back out a price without having to use floating
    /// point math or account for token decimals when price checking.
    ///
    /// ### Example:
    /// Buying SOL with USDC for $92.75
    /// Use a numerator of 92_750_000 because USDC has 6 decimals. So 92_750_000 is 92.75 USDC.
    /// Use a denominator of 1_000_000_000 because SOL has 9 decimal places. So that's 1 SOL.
    /// 92.75 USDC / 1 SOL
    pub bounded_price_numerator: u64,
    pub bounded_price_denominator: u64,
    /// The bump for the strategy's derived address
    pub bump: u8,
    /// The address of the look up table. This needs to be stored on-chain for keeping clients
    /// in sync
    pub lookup_table: Pubkey,
    // A slice that holds the list of account addresses for the route
    // TODO: Extend this to 40+ keys
    pub account_list: [Pubkey; MAX_ACCOUNTS],
    /// A slice that holds additional data for DEXes in the route
    pub additional_data: [u8; 32],
}

impl BoundedStrategyV2 {
    pub const LEN: usize = 8 + std::mem::size_of::<BoundedStrategyV2>() + 320;
}
const_assert!(BoundedStrategyV2::LEN == 1576);
