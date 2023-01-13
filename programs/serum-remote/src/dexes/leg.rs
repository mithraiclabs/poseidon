use anchor_lang::prelude::*;
use enum_dispatch::enum_dispatch;

use crate::{dexes::Dex, instructions::InitBoundedStrategyV2};

use super::{open_book_dex::OpenBookDex, DexList, DexStatic};

#[enum_dispatch(Dex)]
pub enum Leg<'a, 'info> {
    OpenBookV3(OpenBookDex<'a, 'info>),
}

impl<'a, 'info> Leg<'a, 'info> {
    pub fn from_account_slice(
        dex: DexList,
        account_infos: &'a [AccountInfo<'info>],
        additional_data: &mut Vec<u8>,
    ) -> Result<Self> {
        let res = match dex {
            DexList::OpenBookV3 => Leg::OpenBookV3(OpenBookDex::from_account_slice(
                account_infos,
                additional_data,
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
}
