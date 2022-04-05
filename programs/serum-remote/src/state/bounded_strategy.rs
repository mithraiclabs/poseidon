use anchor_lang::prelude::*;

#[account]
#[derive(Default)]
pub struct BoundedStrategy {
    /// The PDA authority that owns the order_payer and open_orders account
    pub authority: Pubkey,
    /// The address of the serum dex program this strategy trades on
    pub serum_dex_id: Pubkey,
    /// The Serum market where the execution will take place
    pub serum_market: Pubkey,
    /// The open_orders account that is owned by the authority and used to place orders
    pub open_orders: Pubkey,
    /// The SPL TokenAccount that contains the tokens that will be put into Serum for trading
    pub order_payer: Pubkey,
    /// The side of the order book the market order will be placed
    /// 0 for Bid, 1 for Ask
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
    pub authority_bump: u8,
}
