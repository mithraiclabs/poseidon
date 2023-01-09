use anchor_lang::prelude::*;
use anchor_spl::{
    dex::{close_open_orders, CloseOpenOrders, Dex},
    token::{self, CloseAccount, Token, TokenAccount, Transfer},
};

use crate::{
    authority_signer_seeds, constants::AUTHORITY_SEED, errors::ErrorCode, state::BoundedStrategy,
};

#[derive(Accounts)]
pub struct Reclaim<'info> {
    /// The account that will receive the SOL
    /// CHECK: no need for checks
    #[account(mut)]
    pub receiver: UncheckedAccount<'info>,
    /// The BoundedStrategy account
    #[account(
        mut,
        close = receiver
    )]
    pub strategy: Account<'info, BoundedStrategy>,
    /// The PDA that has authority over the order payer
    /// CHECK: Checks made
    #[account(
        constraint = authority.key() == strategy.authority
            @ ErrorCode::AuthorityMisMatch,
    )]
    pub authority: UncheckedAccount<'info>,
    /// The account where the assets to trade with are
    #[account(mut)]
    pub order_payer: Account<'info, TokenAccount>,
    #[account(mut)]
    /// CHECK: Checks are handled by the Serum program
    pub open_orders: UncheckedAccount<'info>,
    /// CHECK: Check is handled by the Serum program
    pub serum_market: UncheckedAccount<'info>,
    /// The account that will receive the assets
    #[account(
        mut,
        constraint = reclaim_account.key() == strategy.reclaim_address
            @ ErrorCode::WrongReclaimAddress
    )]
    pub reclaim_account: Account<'info, TokenAccount>,

    pub token_program: Program<'info, Token>,
    pub dex_program: Program<'info, Dex>,
}

pub fn handler(ctx: Context<Reclaim>) -> Result<()> {
    let bounded_strategy = &ctx.accounts.strategy;
    if bounded_strategy.reclaim_date > Clock::get()?.unix_timestamp {
        return Err(ErrorCode::ReclaimDateHasNotPassed.into());
    }

    let cpi_accounts = Transfer {
        from: ctx.accounts.order_payer.to_account_info(),
        to: ctx.accounts.reclaim_account.to_account_info(),
        authority: ctx.accounts.authority.to_account_info().clone(),
    };
    let cpi_token_program = ctx.accounts.token_program.clone();
    let bump = bounded_strategy.authority_bump;
    let cpi_ctx = CpiContext {
        program: cpi_token_program.to_account_info(),
        accounts: cpi_accounts,
        signer_seeds: &[authority_signer_seeds!(ctx, bump)],
        remaining_accounts: Vec::new(),
    };
    token::transfer(cpi_ctx, ctx.accounts.order_payer.amount)?;

    // Close the OrderPayer account
    let cpi_accounts = CloseAccount {
        account: ctx.accounts.order_payer.to_account_info(),
        destination: ctx.accounts.receiver.to_account_info(),
        authority: ctx.accounts.authority.to_account_info(),
    };
    let cpi_ctx = CpiContext {
        program: cpi_token_program.to_account_info(),
        accounts: cpi_accounts,
        signer_seeds: &[authority_signer_seeds!(ctx, bump)],
        remaining_accounts: Vec::new(),
    };
    token::close_account(cpi_ctx)?;

    // Close the OpenOrders account
    let cpi_accounts = CloseOpenOrders {
        open_orders: ctx.accounts.open_orders.to_account_info(),
        authority: ctx.accounts.authority.to_account_info(),
        destination: ctx.accounts.receiver.to_account_info(),
        market: ctx.accounts.serum_market.to_account_info(),
    };
    let cpi_ctx = CpiContext {
        program: ctx.accounts.dex_program.to_account_info(),
        accounts: cpi_accounts,
        signer_seeds: &[authority_signer_seeds!(ctx, bump)],
        remaining_accounts: Vec::new(),
    };
    close_open_orders(cpi_ctx)?;
    Ok(())
}
