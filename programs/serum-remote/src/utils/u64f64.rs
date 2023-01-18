use anchor_lang::{prelude::*, AnchorDeserialize, AnchorSerialize};

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Debug)]
pub struct U64F64 {
    pub val: u128,
}

impl U64F64 {
    pub const ONE: Self = U64F64 { val: 1 << 64 };

    #[inline(always)]
    pub const fn div(self, other: U64F64) -> u128 {
        self.val / other.val
    }

    #[inline(always)]
    pub const fn from_int(n: u64) -> Self {
        U64F64 {
            val: (n as u128) << 64,
        }
    }

    #[inline(always)]
    pub const fn to_le_bytes(&self) -> [u8; std::mem::size_of::<Self>()] {
        self.val.to_le_bytes()
    }
}
