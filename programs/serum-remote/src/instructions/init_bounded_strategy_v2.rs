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

pub fn handler(
    ctx: Context<InitBoundedStrategyV2>,
    _transfer_amount: u64,
    bound_price: u64,
    reclaim_date: i64,
    order_side: u8,
    bound: u8,
    additional_data: Vec<u8>
) -> Result<()> {
    // TODO: Set BoundedStrategy information
    let authority_bump = match ctx.bumps.get("authority") {
        Some(bump) => *bump,
        None => {
            msg!("Wrong bump key. Available keys are {:?}", ctx.bumps.keys());
            panic!("Wrong bump key")
        }
    };
    let bounded_strategy = &mut ctx.accounts.strategy;
    bounded_strategy.collateral_mint = ctx.accounts.mint.key();
    bounded_strategy.authority = ctx.accounts.authority.key();
    bounded_strategy.bounded_price = bound_price;
    bounded_strategy.reclaim_date = reclaim_date;
    bounded_strategy.reclaim_address = ctx.accounts.reclaim_account.key();
    bounded_strategy.deposit_address = ctx.accounts.deposit_account.key();
    bounded_strategy.order_side = order_side;
    bounded_strategy.bound = bound;
    bounded_strategy.authority_bump = authority_bump;
    // TOOD: Double check that this won't error
    bounded_strategy.additional_data.clone_from_slice(&additional_data[..]);
    // TODO: Copy the remaining accounts to the BoundedStrategy
    // bounded_strategy.account_list = ctx.remaining_accounts;


    // TODO: Unpack & initalize the routes from remaining accounts

    // TODO: Transfer the assets

    Ok(())
}
