use anchor_lang::{prelude::*, AnchorDeserialize, AnchorSerialize};

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
