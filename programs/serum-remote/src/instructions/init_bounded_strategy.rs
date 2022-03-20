use anchor_lang::prelude::*;
use anchor_spl::{
    dex::{self, InitOpenOrders},
    token::{Mint, Token, TokenAccount},
};

use crate::{
    authority_signer_seeds, constants::AUTHORITY_SEED, errors::ErrorCode, state::BoundedStrategy,
};

#[derive(Accounts)]
#[instruction(bound_price: u64, reclaim_date: i64)]
pub struct InitBoundedStrategy<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    /// CHECK: Constraints are handled
    #[account(
    seeds = [strategy.key().as_ref(), AUTHORITY_SEED.as_bytes()],
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
    pub order_payer: Box<Account<'info, TokenAccount>>,
    #[account(
    init,
    seeds = [order_payer.key().as_ref(), &bound_price.to_le_bytes(), &reclaim_date.to_le_bytes(), b"boundedStrategy"],
    payer = payer,
    bump
  )]
    pub strategy: Box<Account<'info, BoundedStrategy>>,
    #[account(
    constraint = reclaim_account.mint == mint.key()
      @ ErrorCode::BadReclaimAddress
  )]
    pub reclaim_account: Account<'info, TokenAccount>,

    /// The OpenOrders account to initialize
    /// CHECK: constraints handled
    #[account(
      mut,
      owner = dex::ID
    )]
    pub open_orders: AccountInfo<'info>,

    /// The Serum program
    pub dex_program: Program<'info, dex::Dex>,
    pub token_program: Program<'info, Token>,
    #[account(
    constraint = system_program.key() == anchor_lang::solana_program::system_program::ID
            @ ErrorCode::IncorrectSystemProgram,
  )]
    /// CHECK: Handled
    pub system_program: AccountInfo<'info>,
    pub rent: Sysvar<'info, Rent>,
}

pub fn handler(
    ctx: Context<InitBoundedStrategy>,
    bound_price: u64,
    reclaim_date: i64,
    order_side: u8,
    bound: u8,
) -> Result<()> {
    let mut init_open_orders_accounts = InitOpenOrders {
        open_orders: ctx.accounts.open_orders.to_account_info(),
        authority: ctx.accounts.authority.to_account_info(),
        market: ctx.accounts.serum_market.to_account_info(),
        rent: ctx.accounts.rent.to_account_info(),
    };

    let authority_bump = match ctx.bumps.get("authority") {
        Some(bump) => *bump,
        None => {
            msg!("Wrong bump key. Available keys are {:?}", ctx.bumps.keys());
            panic!("Wrong bump key")
        }
    };
    let init_ctx = CpiContext {
        accounts: init_open_orders_accounts,
        program: ctx.accounts.dex_program.to_account_info(),
        remaining_accounts: vec![],
        signer_seeds: authority_signer_seeds!(&ctx, authority_bump),
    };
    dex::init_open_orders(init_ctx)?;

    let bounded_strategy = &mut ctx.accounts.strategy;
    bounded_strategy.seurm_market = ctx.accounts.serum_market.key();
    bounded_strategy.authority = ctx.accounts.authority.key();
    bounded_strategy.order_payer = ctx.accounts.order_payer.key();
    bounded_strategy.bounded_price = bound_price;
    bounded_strategy.reclaim_date = reclaim_date;
    bounded_strategy.reclaim_address = ctx.accounts.reclaim_account.key();
    bounded_strategy.order_side = order_side;
    bounded_strategy.bound = bound;
    bounded_strategy.open_orders = ctx.accounts.open_orders.key();

    Ok(())
}
