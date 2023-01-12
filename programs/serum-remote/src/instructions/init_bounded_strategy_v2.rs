use anchor_lang::prelude::*;
use anchor_spl::token::{Mint, Token, TokenAccount};

use crate::{
    constants::{AUTHORITY_SEED, BOUNDED_STRATEGY_SEED},
    errors::ErrorCode,
    state::BoundedStrategyV2,
};

#[derive(Accounts)]
#[instruction(transfer_amount: u64, bound_price: u64, reclaim_date: i64)]
pub struct InitBoundedStrategyV2<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    /// CHECK: Constraints are handled
    #[account(
    seeds = [strategy.key().as_ref(), AUTHORITY_SEED.as_bytes()],
    bump,
  )]
    pub authority: UncheckedAccount<'info>,

    pub mint: Account<'info, Mint>,
    /// TODO: The BoundedStrategy seeds will likely need another key. Otherwise DAO's and other
    /// users will be uniquely constrained by these values.
    #[account(
    init,
    seeds = [mint.key().as_ref(), &bound_price.to_le_bytes(), &reclaim_date.to_le_bytes(), BOUNDED_STRATEGY_SEED.as_bytes()],
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
    pub reclaim_account: Account<'info, TokenAccount>,
    /// The account where swapped assets will be transferred to
    #[account(
        constraint = deposit_account.owner == reclaim_account.owner
        @ ErrorCode::BadDepositAddress
    )]
    pub deposit_account: Account<'info, TokenAccount>,
    pub token_program: Program<'info, Token>,
    #[account(
    constraint = system_program.key() == anchor_lang::solana_program::system_program::ID
            @ ErrorCode::IncorrectSystemProgram,
  )]
    pub system_program: Program<'info, System>,
    pub rent: Sysvar<'info, Rent>,
}
