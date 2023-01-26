use std::collections::VecDeque;

use anchor_lang::prelude::*;
use enum_dispatch::enum_dispatch;

use crate::{dexes::Dex, instructions::InitBoundedStrategyV2};

use super::{open_book_dex::OpenBookDex, DexList, DexStatic};

#[enum_dispatch(Dex)]
pub(crate) enum Leg<'a, 'info> {
    OpenBookV3(OpenBookDex<'a, 'info>),
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
        };

        Ok(res)
    }

    pub fn initialize(
        &self,
        ctx: &Context<'_, '_, '_, 'info, InitBoundedStrategyV2<'info>>,
    ) -> Result<()> {
        match self {
            Leg::OpenBookV3(open_book_dex) => open_book_dex.initialize(ctx),
        }
    }

    /// Execute the full swap via CPI to the DEX
    pub fn swap(&self, tokens_in: u64, signers_seeds: &[&[&[u8]]]) -> Result<()> {
        match self {
            Leg::OpenBookV3(open_book_dex) => open_book_dex.swap(tokens_in, signers_seeds),
        }
    }

    pub fn destination_token_account(&self) -> AccountInfo<'info> {
        match self {
            Leg::OpenBookV3(open_book_dex) => open_book_dex.destination_token_account(),
        }
    }

    pub fn destination_mint_account(&self) -> AccountInfo<'info> {
        match self {
            Leg::OpenBookV3(open_book_dex) => open_book_dex.destination_mint_account(),
        }
    }
}
