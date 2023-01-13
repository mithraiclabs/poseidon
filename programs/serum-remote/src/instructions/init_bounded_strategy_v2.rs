use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

use crate::{
    constants::{AUTHORITY_SEED, BOUNDED_STRATEGY_SEED, ORDER_PAYER_SEED},
    dexes::{DexList, Leg, Route},
    errors::{self, ErrorCode},
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
    #[account(
        init,
        seeds = [strategy.key().as_ref(), ORDER_PAYER_SEED.as_bytes()],
        payer = payer,
        bump,
        token::mint = mint,
        token::authority = authority
      )]
    pub collateral_account: Box<Account<'info, TokenAccount>>,

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

/// The ctx.remaining_accounts should contain a list of account infos in the
/// exact order that the Leg's require.
pub fn handler<'info>(
    ctx: Context<'_, '_, '_, 'info, InitBoundedStrategyV2<'info>>,
    transfer_amount: u64,
    bound_price: u64,
    reclaim_date: i64,
    order_side: u8,
    bound: u8,
    additional_data: Vec<u8>,
) -> Result<()> {
    // Set BoundedStrategy information
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
    bounded_strategy
        .additional_data
        .clone_from_slice(&additional_data[..]);
    // Copy the remaining accounts to the BoundedStrategy
    let keys: Vec<Pubkey> = ctx.remaining_accounts.iter().map(|x| x.key()).collect();
    bounded_strategy.account_list.clone_from_slice(&keys);

    // Unpack & initalize the routes from remaining accounts
    let mut route = Route::default();
    let (mut account_cursor, mut leg_cursor): (usize, usize) = (0, 0);
    let mut added_data = additional_data;
    while let Some(dex_program) = ctx.remaining_accounts.get(account_cursor) {
        let dex = DexList::from_id(dex_program.key())?;
        let end_index = dex.get_end_account_idx(account_cursor);

        let account_infos = &ctx.remaining_accounts[account_cursor..end_index];
        // Create the Leg
        let leg = Leg::from_account_slice(dex, account_infos, &mut added_data)?;
        // Initialize from the leg
        leg.initialize(&ctx)?;
        // Add the leg to the Route
        route.legs[leg_cursor] = Some(leg);

        account_cursor = end_index;
        leg_cursor += 1;
    }

    // Validate the start and end route mints lines up
    if ctx.accounts.deposit_account.mint != route.end_mint()? {
        return Err(error!(errors::ErrorCode::OutputMintMismatch));
    }
    if ctx.accounts.reclaim_account.mint != route.start_mint()? {
        return Err(error!(errors::ErrorCode::InputMintMismatch));
    }

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
