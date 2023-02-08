use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

use crate::{
    constants::{BOUNDED_STRATEGY_SEED, ORDER_PAYER_SEED},
    errors::ErrorCode,
    state::BoundedStrategyV2,
};

#[derive(Accounts)]
#[instruction(transfer_amount: u64, bounded_price_numerator: u64, bounded_price_denominator: u64, reclaim_date: i64)]
pub struct InitBoundedStrategyV2<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(
        init,
        seeds = [strategy.key().as_ref(), ORDER_PAYER_SEED.as_bytes()],
        payer = payer,
        bump,
        token::mint = mint,
        token::authority = strategy
      )]
    pub collateral_account: Box<Account<'info, TokenAccount>>,

    pub mint: Box<Account<'info, Mint>>,
    /// TODO: The BoundedStrategy seeds will likely need another key. Otherwise DAO's and other
    /// users will be uniquely constrained by these values.
    #[account(
    init,
    seeds = [mint.key().as_ref(), &bounded_price_numerator.to_le_bytes(), &bounded_price_denominator.to_le_bytes(), &reclaim_date.to_le_bytes(), BOUNDED_STRATEGY_SEED.as_bytes()],
    payer = payer,
    bump,
    space = BoundedStrategyV2::LEN,
  )]
    pub strategy: Box<Account<'info, BoundedStrategyV2>>,
    #[account(
      mut,
    constraint = reclaim_account.mint == mint.key()
      @ ErrorCode::BadReclaimAddress
  )]
    pub reclaim_account: Box<Account<'info, TokenAccount>>,
    /// The account where swapped assets will be transferred to
    #[account(
        constraint = deposit_account.owner == reclaim_account.owner
        @ ErrorCode::BadDepositAddress
    )]
    pub deposit_account: Box<Account<'info, TokenAccount>>,
    pub token_program: Program<'info, Token>,
    #[account(
    constraint = system_program.key() == anchor_lang::solana_program::system_program::ID
            @ ErrorCode::IncorrectSystemProgram,
  )]
    pub system_program: Program<'info, System>,
}

/// The ctx.remaining_accounts should contain a list of account infos in the
/// exact order that the Leg's require.
pub fn handler<'info>(
    ctx: Context<'_, '_, '_, 'info, InitBoundedStrategyV2<'info>>,
    transfer_amount: u64,
    bounded_price_numerator: u64,
    bounded_price_denominator: u64,
    reclaim_date: i64,
) -> Result<()> {
    // Set BoundedStrategy information
    let strategy_bump = match ctx.bumps.get("strategy") {
        Some(bump) => *bump,
        None => {
            msg!("Wrong bump key. Available keys are {:?}", ctx.bumps.keys());
            panic!("Wrong bump key")
        }
    };
    let bounded_strategy = &mut ctx.accounts.strategy;
    bounded_strategy.collateral_account = ctx.accounts.collateral_account.key();
    bounded_strategy.collateral_mint = ctx.accounts.mint.key();
    bounded_strategy.bounded_price_numerator = bounded_price_numerator;
    bounded_strategy.bounded_price_denominator = bounded_price_denominator;
    bounded_strategy.reclaim_date = reclaim_date;
    bounded_strategy.reclaim_address = ctx.accounts.reclaim_account.key();
    bounded_strategy.deposit_address = ctx.accounts.deposit_account.key();
    bounded_strategy.bump = strategy_bump;

    // Transfer the assets to the remote execution program
    let cpi_accounts = Transfer {
        from: ctx.accounts.reclaim_account.to_account_info(),
        to: ctx.accounts.collateral_account.to_account_info(),
        authority: ctx.accounts.payer.to_account_info().clone(),
    };
    let cpi_ctx = CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts);
    token::transfer(cpi_ctx, transfer_amount)?;

    Ok(())
}
