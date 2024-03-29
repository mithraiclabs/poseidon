use anchor_lang::prelude::*;

pub mod constants;
pub(crate) mod dexes;
pub mod errors;
pub mod instructions;
pub(crate) mod macros;
pub(crate) mod serum_utils;
pub mod state;
pub mod utils;

use crate::instructions::*;

declare_id!("8TJjyzq3iXc48MgV6TD5DumKKwfWKU14Jr9pwgnAbpzs");

mod address_lut_program {
    anchor_lang::declare_id!("AddressLookupTab1e1111111111111111111111111");
}

#[program]
pub mod poseidon {
    use super::*;

    #[access_control(InitBoundedStrategy::valid_arguments(
        transfer_amount,
        bound_price,
        reclaim_date,
        order_side,
        bound
    ))]
    pub fn init_bounded_strategy(
        ctx: Context<InitBoundedStrategy>,
        transfer_amount: u64,
        bound_price: u64,
        reclaim_date: i64,
        order_side: u8,
        bound: u8,
        open_orders_space: u64,
    ) -> Result<()> {
        instructions::init_bounded_strategy::handler(
            ctx,
            transfer_amount,
            bound_price,
            reclaim_date,
            order_side,
            bound,
            open_orders_space,
        )
    }

    pub fn bounded_trade<'a, 'b, 'c, 'info>(
        ctx: Context<'a, 'b, 'c, 'info, BoundedTrade<'info>>,
    ) -> Result<()> {
        instructions::bounded_trade::handler(ctx)
    }

    pub fn reclaim(ctx: Context<Reclaim>) -> Result<()> {
        instructions::reclaim::handler(ctx)
    }

    pub fn sr_settle_funds<'a, 'b, 'c, 'info>(
        ctx: Context<'a, 'b, 'c, 'info, SettleFundsAccounts<'info>>,
    ) -> Result<()> {
        instructions::settle_funds::handler(ctx)
    }

    pub fn init_bounded_strategy_v2<'info>(
        ctx: Context<'_, '_, '_, 'info, InitBoundedStrategyV2<'info>>,
        transfer_amount: u64,
        bounded_price_numerator: u64,
        bounded_price_denominator: u64,
        reclaim_date: i64,
    ) -> Result<()> {
        instructions::init_bounded_strategy_v2::handler(
            ctx,
            transfer_amount,
            bounded_price_numerator,
            bounded_price_denominator,
            reclaim_date,
        )
    }

    pub fn bounded_trade_v2<'a, 'b, 'c, 'info>(
        ctx: Context<'a, 'b, 'c, 'info, BoundedTradeV2<'info>>,
        additional_data: Vec<u8>,
    ) -> Result<()> {
        instructions::bounded_trade_v2::handler(ctx, additional_data)
    }

    pub fn reclaim_v2<'info>(ctx: Context<'_, '_, '_, 'info, ReclaimV2<'info>>) -> Result<()> {
        instructions::reclaim_v2::handler(ctx)
    }
}
