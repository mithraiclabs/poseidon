use anchor_lang::{accounts::program_account::ProgramAccount, prelude::*};
use anchor_spl::token::{self, Token, TokenAccount, Transfer};

use crate::{authority_signer_seeds, constants::AUTHORITY_SEED, state::BoundedStrategy};

#[derive(Accounts)]
pub struct Reclaim<'info> {
    /// The BoundedStrategy account
    strategy: Account<'info, BoundedStrategy>,
    /// The PDA that has authority over the order payer
    /// CHECK: TODO: add check
    authority: AccountInfo<'info>,
    /// The account where the assets to trade with are
    #[account(mut)]
    order_payer: Account<'info, TokenAccount>,
    /// The account that will receive the assets
    #[account(mut)]
    reclaim_account: Account<'info, TokenAccount>,

    token_program: Program<'info, Token>,
}

pub fn handler(ctx: Context<Reclaim>) -> Result<()> {
    let bounded_strategy = &ctx.accounts.strategy;
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
    Ok(())
}
