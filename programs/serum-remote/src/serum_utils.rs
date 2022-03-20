use std::convert::{TryFrom, TryInto};
use std::ops::DerefMut;

use anchor_lang::prelude::*;
use anchor_spl::dex::serum_dex::{
    critbit::{LeafNode, Slab, SlabView},
    declare_check_assert_macros,
    error::SourceFileId,
    matching::OrderBookState,
    state::Market,
};

declare_check_assert_macros!(SourceFileId::State);

pub fn get_best_bid_ask(
    market: &mut Market,
    market_bids: &AccountInfo,
    market_asks: &AccountInfo,
) -> (LeafNode, LeafNode) {
    let mut bids = market
        .load_bids_mut(market_bids)
        .or(check_unreachable!())
        .unwrap();
    let mut asks = market
        .load_asks_mut(market_asks)
        .or(check_unreachable!())
        .unwrap();

    let order_book_state: OrderBookState = OrderBookState {
        bids: bids.deref_mut(),
        asks: asks.deref_mut(),
        market_state: market.deref_mut(),
    };
    let best_bid = get_best(order_book_state.bids, true).unwrap();
    let best_ask = get_best(order_book_state.asks, false).unwrap();
    (best_bid, best_ask)
}

fn get_best(slab: &Slab, is_bids: bool) -> Option<LeafNode> {
    if !slab.is_empty() {
        let best_id = match is_bids {
            true => slab.find_max(),
            false => slab.find_min(),
        }
        .unwrap();

        let best: Option<LeafNode> = Some(*slab.get(best_id).unwrap().as_leaf().unwrap());
        return best;
    }

    None
}

#[repr(transparent)]
#[derive(Copy, Clone)]
pub struct U64F64(u128);

impl U64F64 {
    const ONE: Self = U64F64(1 << 64);

    #[inline(always)]
    pub const fn add(self, other: U64F64) -> U64F64 {
        U64F64(self.0 + other.0)
    }

    #[inline(always)]
    pub const fn sub(self, other: U64F64) -> U64F64 {
        U64F64(self.0 - other.0)
    }

    #[inline(always)]
    pub const fn div(self, other: U64F64) -> u128 {
        self.0 / other.0
    }

    #[inline(always)]
    pub const fn mul_u64(self, other: u64) -> U64F64 {
        U64F64(self.0 * other as u128)
    }

    #[inline(always)]
    pub const fn floor(self) -> u64 {
        (self.0 >> 64) as u64
    }

    #[inline(always)]
    pub const fn frac_part(self) -> u64 {
        self.0 as u64
    }

    #[inline(always)]
    pub const fn from_int(n: u64) -> Self {
        U64F64((n as u128) << 64)
    }

    #[inline(always)]
    pub fn to_int(self) -> u64 {
        u64::try_from(self.0 >> 64).unwrap()
    }
}

#[inline(always)]
pub const fn fee_tenth_of_bps(tenth_of_bps: u64) -> U64F64 {
    U64F64(((tenth_of_bps as u128) << 64) / 100_000)
}

#[derive(Copy, Clone, Debug)]
#[repr(u8)]
pub enum FeeTier {
    Base,
    SRM2,
    SRM3,
    SRM4,
    SRM5,
    SRM6,
    MSRM,
    Stable,
}

impl FeeTier {
    fn taker_rate(self) -> U64F64 {
        use FeeTier::*;
        match self {
            Base => fee_tenth_of_bps(40),
            SRM2 => fee_tenth_of_bps(39),
            SRM3 => fee_tenth_of_bps(38),
            SRM4 => fee_tenth_of_bps(36),
            SRM5 => fee_tenth_of_bps(34),
            SRM6 => fee_tenth_of_bps(32),
            MSRM => fee_tenth_of_bps(30),
            Stable => fee_tenth_of_bps(10),
        }
    }

    #[inline]
    pub fn taker_fee(self, pc_qty: u64) -> u64 {
        let rate = self.taker_rate();
        let exact_fee: U64F64 = rate.mul_u64(pc_qty);
        exact_fee.floor() + ((exact_fee.frac_part() != 0) as u64)
    }

    #[inline]
    pub fn remove_taker_fee(self, pc_qty_incl_fee: u64) -> u64 {
        let rate = self.taker_rate();
        U64F64::from_int(pc_qty_incl_fee)
            .div(U64F64::ONE.add(rate))
            .try_into()
            .unwrap()
    }
}
