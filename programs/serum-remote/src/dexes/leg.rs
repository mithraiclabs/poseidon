use std::collections::VecDeque;

use anchor_lang::prelude::*;
use enum_dispatch::enum_dispatch;

use crate::dexes::Dex;

use super::{open_book_dex::OpenBookDex, raydium::RaydiumSwap, DexList, DexStatic};

#[enum_dispatch(Dex)]
pub(crate) enum Leg<'a, 'info> {
    OpenBookV3(OpenBookDex<'a, 'info>),
    Raydium(RaydiumSwap<'a, 'info>),
}

impl<'a, 'info> Leg<'a, 'info> {
    pub fn from_account_slice(
        dex: DexList,
        account_infos: &'a [AccountInfo<'info>],
        additional_data: &mut VecDeque<u8>,
        is_init: bool,
    ) -> Result<Self> {
        let res = match dex {
            DexList::OpenBookV3 => Leg::OpenBookV3(OpenBookDex::from_account_slice(
                account_infos,
                additional_data,
                is_init,
            )?),
            DexList::Raydium => Leg::Raydium(RaydiumSwap::from_account_slice(
                account_infos,
                additional_data,
                is_init,
            )?),
        };

        Ok(res)
    }

    /// Execute the full swap via CPI to the DEX
    pub fn swap(&self, tokens_in: u64, signers_seeds: &[&[&[u8]]]) -> Result<()> {
        match self {
            Leg::OpenBookV3(open_book_dex) => open_book_dex.swap(tokens_in, signers_seeds),
            Leg::Raydium(raydium_swap) => raydium_swap.swap(tokens_in, signers_seeds),
        }
    }
}
