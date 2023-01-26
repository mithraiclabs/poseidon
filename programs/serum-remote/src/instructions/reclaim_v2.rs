use anchor_lang::prelude::*;

use crate::{
  errors::ErrorCode,
  state::BoundedStrategyV2,
};

#[derive(Accounts)]
pub struct ReclaimV2<'info> {
    /// The account that will receive the SOL
    /// CHECK: no need for checks
    #[account(mut)]
    pub receiver: UncheckedAccount<'info>,

    /// The BoundedStrategyV2 account
    #[account(
      mut,
      close = receiver
    )]
    pub strategy: Box<Account<'info, BoundedStrategyV2>>,
}

pub fn handler(ctx: Context<ReclaimV2>) -> Result<()> {
  let bounded_strategy = &ctx.accounts.strategy;
  if bounded_strategy.reclaim_date > Clock::get()?.unix_timestamp {
    return Err(ErrorCode::ReclaimDateHasNotPassed.into());
  }
  Ok(())
}