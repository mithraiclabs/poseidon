use anchor_lang::prelude::*;
use anchor_spl::{ dex, token::{Token, Mint, TokenAccount}};

use crate::{ errors::ErrorCode, state::BoundedStrategy};

#[derive(Accounts)]
#[instruction(bound_price: u64, reclaim_date: i64)]
pub struct InitBoundedStrategy<'info> {
  #[account(mut)]
  pub payer: Signer<'info>,
  // // TODO: add constraints
  // /// The PDA with authority over the Token accounts and OpenOrders account 
  // /// CHECK: add constraints
  // #[account(
  //   owner = *program_id
  // )]
  // pub strategy_authority: AccountInfo<'info>,
  // // TODO: add constraints
  // /// The OpenOrders account to create and initialize
  // /// CHECK: add constraints
  // #[account(
  //   owner = *program_id
  // )]
  // pub open_orders: AccountInfo<'info>,

  /// CHECK: Constraints are handled
  #[account(
    seeds = [bounded_strategy.key().as_ref(), b"authority"],
    bump,
  )]
  pub authority: AccountInfo<'info>,

  pub mint: Account<'info, Mint>,
  /// CHECK: Constraints are handled
  #[account(
    owner = dex::ID
  )]
  pub serum_market: AccountInfo<'info>,
  #[account(
    init,
    seeds = [serum_market.key().as_ref(), mint.key().as_ref(), b"orderPayer"],
    payer = payer,
    bump,
    token::mint = mint,
    token::authority = authority
  )]
  pub order_payer: Account<'info, TokenAccount>,
  #[account(
    init,
    seeds = [order_payer.key().as_ref(), &bound_price.to_le_bytes(), &reclaim_date.to_le_bytes(), b"boundedStrategy"],
    payer = payer,
    bump
  )]
  pub bounded_strategy: Account<'info, BoundedStrategy>,

  pub token_program: Program<'info, Token>,
  #[account(
    constraint = system_program.key() == anchor_lang::solana_program::system_program::ID
            @ ErrorCode::IncorrectSystemProgram,
  )]
  /// CHECK: Handled
  pub system_program: AccountInfo<'info>,
  pub rent: Sysvar<'info, Rent>,
}

pub fn handler(ctx: Context<InitBoundedStrategy>, bound_price: u64, reclaim_date: i64) -> Result<()> {
  Ok(())
}