use anchor_lang::prelude::*;
use static_assertions::const_assert;


#[derive(Debug, AnchorSerialize, AnchorDeserialize, PartialEq, Eq, Clone, Copy)]
#[repr(u32)]
pub enum DexList {
    OpenBookV3 = 0,
    RaydiumSwap = 1,
}

impl From<u8> for DexList {
    fn from(value: u8) -> Self {
        match value {
            0 => DexList::OpenBookV3,
            1 => DexList::RaydiumSwap,
            _ => panic!("Unknown DEX ID {}", value),
        }
    }
}

// Bytes: 32 * 4 + 1 + 8 + 32 * 2 + 1 + 8+ 1 + 32 + 4 + 32
#[account]
pub struct BoundedStrategy {
    /// The PDA authority that owns the order_payer and open_orders account
    pub authority: Pubkey,
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
    /// The address of the serum dex program this strategy trades on
    pub serum_dex_id: Pubkey,
    // /// The DexList ID
    pub dex_id: DexList,
    /// The public key for the liquidity venue that's being traded on.
    pub dex_program_id: Pubkey,
}

impl BoundedStrategy {
    pub const LEN: usize = 8 + std::mem::size_of::<BoundedStrategy>() + 564;
}
const_assert!(BoundedStrategy::LEN == 852);
