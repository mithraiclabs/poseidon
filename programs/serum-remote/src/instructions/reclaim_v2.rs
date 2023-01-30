use std::collections::VecDeque;

use anchor_lang::prelude::*;
use anchor_spl::token::{self, CloseAccount, Token, TokenAccount, Transfer};

use crate::{
    constants::BOUNDED_STRATEGY_SEED, dexes::Route, errors::ErrorCode, state::BoundedStrategyV2,
    strategy_signer_seeds,
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

    /// The account where the assets to trade with are
    #[account(mut)]
    pub collateral_account: Account<'info, TokenAccount>,

    /// The account that will receive the assets
    #[account(
      mut,
      constraint = reclaim_account.key() == strategy.reclaim_address
          @ ErrorCode::WrongReclaimAddress
  )]
    pub reclaim_account: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
}

pub fn handler<'info>(ctx: Context<'_, '_, '_, 'info, ReclaimV2<'info>>) -> Result<()> {
    let bounded_strategy = &ctx.accounts.strategy;
    if bounded_strategy.reclaim_date > Clock::get()?.unix_timestamp {
        return Err(ErrorCode::ReclaimDateHasNotPassed.into());
    }

    let route = Route::create(
        ctx.remaining_accounts,
        VecDeque::from(bounded_strategy.additional_data.to_vec()),
        false,
    )?;

    let cpi_accounts = Transfer {
        from: ctx.accounts.collateral_account.to_account_info(),
        to: ctx.accounts.reclaim_account.to_account_info(),
        authority: ctx.accounts.strategy.to_account_info().clone(),
    };

    let cpi_token_program = ctx.accounts.token_program.clone();
    let cpi_ctx = CpiContext {
        program: cpi_token_program.to_account_info(),
        accounts: cpi_accounts,
        signer_seeds: &[strategy_signer_seeds!(bounded_strategy)],
        remaining_accounts: Vec::new(),
    };
    token::transfer(cpi_ctx, ctx.accounts.collateral_account.amount)?;

    let cpi_accounts = CloseAccount {
        account: ctx.accounts.collateral_account.to_account_info(),
        destination: ctx.accounts.receiver.to_account_info(),
        authority: ctx.accounts.strategy.to_account_info(),
    };
    let cpi_ctx = CpiContext {
        program: cpi_token_program.to_account_info(),
        accounts: cpi_accounts,
        signer_seeds: &[strategy_signer_seeds!(bounded_strategy)],
        remaining_accounts: Vec::new(),
    };
    token::close_account(cpi_ctx)?;

    route.cleanup_accounts(&ctx)
}
