use anchor_lang::prelude::*;
use static_assertions::const_assert;

#[account]
pub struct BoundedStrategyV2 {
    pub collateral_mint: Pubkey,
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
    /// The price of the base asset that governs the bound. The decimals are
    /// equivalent to the price on the Serum Market's order book
    pub bounded_price: u64,
    /// The PDA authority that owns necessary accounts
    pub authority: Pubkey,
    pub authority_bump: u8,
    // A slice that holds the list of account addresses for the route
    pub account_list: [Pubkey; 30],
    /// A slice that holds additional data for DEXes in the route
    pub additional_data: [u8; 32],
}

impl BoundedStrategyV2 {
    pub const LEN: usize = 8 + std::mem::size_of::<BoundedStrategyV2>() + 320;
}
const_assert!(BoundedStrategyV2::LEN == 1472);
