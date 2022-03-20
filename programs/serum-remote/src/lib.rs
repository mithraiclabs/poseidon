use anchor_lang::prelude::*;

pub mod constants;
pub mod errors;
pub mod instructions;
pub mod macros;
pub mod state;

use crate::instructions::*;

declare_id!("Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS");

#[program]
pub mod serum_remote {
    use super::*;

    pub fn initialize(ctx: Context<Initialize>) -> Result<()> {
        Ok(())
    }

    #[access_control(InitBoundedStrategy::valid_arguments(
        bound_price,
        reclaim_date,
        order_side,
        bound
    ))]
    pub fn init_bounded_strategy(
        ctx: Context<InitBoundedStrategy>,
        bound_price: u64,
        reclaim_date: i64,
        order_side: u8,
        bound: u8,
    ) -> Result<()> {
        instructions::init_bounded_strategy::handler(
            ctx,
            bound_price,
            reclaim_date,
            order_side,
            bound,
        )
    }
}

#[derive(Accounts)]
pub struct Initialize {}
