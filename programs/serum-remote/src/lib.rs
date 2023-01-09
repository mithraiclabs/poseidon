use anchor_lang::prelude::*;

pub mod constants;
pub mod errors;
pub mod instructions;
pub mod macros;
pub mod serum_utils;
pub mod state;

use crate::instructions::*;

declare_id!("oBRem4fksRF79j3wRkqMHdJfTzxbEEd73JgN3mFQjSK");

mod open_serum {
    #[cfg(not(feature = "devnet"))]
    #[cfg(not(feature = "localnet"))]
    anchor_lang::declare_id!("srmqPvymJeFKQ4zGQed1GFppgkRHL9kaELCbyksJtPX");
    #[cfg(feature = "devnet")]
    anchor_lang::declare_id!("EoTcMgcDRTJVZDMZWBoU6rhYHZfkNTVEAfz3uUJRcYGj");
    #[cfg(feature = "localnet")]
    anchor_lang::declare_id!("9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin");
}

#[program]
pub mod serum_remote {
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
}
