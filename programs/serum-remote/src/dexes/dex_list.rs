use anchor_lang::{prelude::*, AnchorDeserialize, AnchorSerialize};

use crate::errors;

use super::{
    open_book_dex::{self, OpenBookDex},
    DexStatic,
};

#[derive(Debug, AnchorSerialize, AnchorDeserialize, PartialEq, Eq, Clone, Copy)]
#[repr(u32)]
pub enum DexList {
    OpenBookV3 = 0,
}

impl From<u8> for DexList {
    fn from(value: u8) -> Self {
        match value {
            0 => DexList::OpenBookV3,
            _ => panic!("Unknown DEX ID {}", value),
        }
    }
}

impl DexList {
    pub fn from_id(id: Pubkey) -> Result<Self> {
        if open_book_dex::check_id(&id) {
            Ok(DexList::OpenBookV3)
        } else {
            Err(errors::ErrorCode::UknownDexId.into())
        }
    }

    pub fn get_end_account_idx(&self, start: usize) -> usize {
        let accounts_len = match self {
            DexList::OpenBookV3 => OpenBookDex::ACCOUNTS_LEN,
        };
        start + accounts_len
    }
}
