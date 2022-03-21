use anchor_lang::prelude::*;
use anchor_spl::{
    dex::{self, InitOpenOrders, serum_dex::state::Market},
    token::{self, Mint, Token, TokenAccount, Transfer},
};
use std::convert::identity;
use safe_transmute::to_bytes::transmute_to_bytes;

use crate::{
    authority_signer_seeds,
    constants::{AUTHORITY_SEED, BOUNDED_STRATEGY_SEED, ORDER_PAYER_SEED},
    errors::ErrorCode,
    state::BoundedStrategy,
};

#[derive(Accounts)]
#[instruction(transfer_amount: u64, bound_price: u64, reclaim_date: i64)]
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
    seeds = [strategy.key().as_ref(), ORDER_PAYER_SEED.as_bytes()],
    payer = payer,
    bump,
    token::mint = mint,
    token::authority = authority
  )]
    pub order_payer: Box<Account<'info, TokenAccount>>,
    #[account(
    init,
    seeds = [serum_market.key().as_ref(), mint.key().as_ref(), &bound_price.to_le_bytes(), &reclaim_date.to_le_bytes(), BOUNDED_STRATEGY_SEED.as_bytes()],
    payer = payer,
    bump,
    space = std::mem::size_of::<BoundedStrategy>() + 608
  )]
    pub strategy: Box<Account<'info, BoundedStrategy>>,
    #[account(
      mut,
    constraint = reclaim_account.mint == mint.key()
      @ ErrorCode::BadReclaimAddress
  )]
    pub reclaim_account: Account<'info, TokenAccount>,
    /// The account where swapped assets will be transferred to
    pub deposit_account: Account<'info, TokenAccount>,

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
    transfer_amount: u64,
    bound_price: u64,
    reclaim_date: i64,
    order_side: u8,
    bound: u8,
) -> Result<()> {
    {
        // Validate market and mint information
        let market =
            Market::load(&ctx.accounts.serum_market, &ctx.accounts.dex_program.key()).unwrap();
        let coin_mint = Pubkey::new(&transmute_to_bytes(&identity(market.coin_mint)));
        let pc_mint = Pubkey::new(&transmute_to_bytes(&identity(market.pc_mint)));
        if order_side == 0 && ctx.accounts.mint.key() != pc_mint {
            // If Bidding the assets to transfer must the the price currency mint
            return Err(error!(ErrorCode::BidsRequireQuoteCurrency))
        } else if order_side == 1 && ctx.accounts.mint.key() != coin_mint {
            return Err(error!(ErrorCode::AsksRequireBaseCurrency))
        }
        
    }

    // TODO: May want to create the account in the instruction to avoid client
    //  bugs when creating but not initializing.

    // Initialize Serum OpenOrders account
    let init_open_orders_accounts = InitOpenOrders {
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
        signer_seeds: &[authority_signer_seeds!(&ctx, authority_bump)],
    };
    dex::init_open_orders(init_ctx)?;

    // Transfer the assets
    let cpi_accounts = Transfer {
        from: ctx.accounts.reclaim_account.to_account_info(),
        to: ctx.accounts.order_payer.to_account_info(),
        authority: ctx.accounts.payer.to_account_info().clone(),
    };
    let cpi_ctx = CpiContext::new(ctx.accounts.token_program.to_account_info(), cpi_accounts);
    token::transfer(cpi_ctx, transfer_amount)?;

    let bounded_strategy = &mut ctx.accounts.strategy;
    bounded_strategy.serum_market = ctx.accounts.serum_market.key();
    bounded_strategy.authority = ctx.accounts.authority.key();
    bounded_strategy.order_payer = ctx.accounts.order_payer.key();
    bounded_strategy.bounded_price = bound_price;
    bounded_strategy.reclaim_date = reclaim_date;
    bounded_strategy.reclaim_address = ctx.accounts.reclaim_account.key();
    bounded_strategy.deposit_address = ctx.accounts.deposit_account.key();
    bounded_strategy.order_side = order_side;
    bounded_strategy.bound = bound;
    bounded_strategy.open_orders = ctx.accounts.open_orders.key();
    bounded_strategy.authority_bump = authority_bump;

    Ok(())
}

impl<'info> InitBoundedStrategy<'info> {
    pub fn valid_arguments(
        transfer_amount: u64,
        bound_price: u64,
        reclaim_date: i64,
        order_side: u8,
        bound: u8,
    ) -> Result<()> {
        // Validate reclaim date is in the future
        if reclaim_date < Clock::get()?.unix_timestamp {
            return Err(error!(ErrorCode::ReclaimDateHasPassed));
        }
        // Validate bound price is greater than 0
        if bound_price == 0 {
            return Err(error!(ErrorCode::BoundPriceIsZero));
        }
        // Validate the order side is 0 (Bid) or 1 (Ask)
        if order_side != 0 && order_side != 1 {
            return Err(error!(ErrorCode::NonBinaryOrderSide));
        }
        // Validate the Bound is 0 (Lower Bound) or 1 (Upper Bound)
        if bound != 0 && bound != 1 {
            return Err(error!(ErrorCode::NonBinaryBound));
        }
        if bound == 0 && order_side == 0 {
            return Err(error!(ErrorCode::NoLowerBoundedBids))
        }
        if bound == 1 && order_side == 1 {
            return Err(error!(ErrorCode::NoUpperBoundedAsks))
        }
        // Validate transfer amount > 0
        if transfer_amount == 0 {
            return Err(error!(ErrorCode::TransferAmountCantBe0))
        }
        Ok(())
    }
}
