use anchor_lang::{prelude::*, AnchorSerialize, AnchorDeserialize};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct U64F64 {
    pub val: u128
}

impl U64F64 {
    pub const ONE: Self = U64F64 {val: 1 << 64};

    // #[inline(always)]
    // pub const fn add(self, other: U64F64) -> U64F64 {
    //     U64F64(self.0 + other.0)
    // }

    // #[inline(always)]
    // pub const fn div(self, other: U64F64) -> u128 {
    //     self.0 / other.0
    // }

    // #[inline(always)]
    // pub const fn mul_u64(self, other: u64) -> U64F64 {
    //     U64F64(self.0 * other as u128)
    // }

    // #[inline(always)]
    // pub const fn floor(self) -> u64 {
    //     (self.0 >> 64) as u64
    // }

    // #[inline(always)]
    // pub const fn frac_part(self) -> u64 {
    //     self.0 as u64
    // }

    // #[inline(always)]
    // pub const fn from_int(n: u64) -> Self {
    //     U64F64((n as u128) << 64)
    // }

    #[inline(always)]
    pub const fn to_le_bytes(&self) -> [u8; std::mem::size_of::<Self>()] {
        self.val.to_le_bytes()
    }
}