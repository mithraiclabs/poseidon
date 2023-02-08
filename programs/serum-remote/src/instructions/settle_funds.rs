use anchor_lang::prelude::*;
use anchor_spl::{
    dex::SettleFunds,
    token::{Token, TokenAccount},
};

use crate::{
    authority_signer_seeds, constants::AUTHORITY_SEED, dexes::open_book_dex, errors::ErrorCode,
    instructions::bounded_trade::SettleWallets, settle_funds, state::BoundedStrategy,
};

#[derive(Accounts)]
pub struct SettleFundsAccounts<'info> {
    /// Either the PC or Coin wallet from the strategy
    #[account(
      mut,
      constraint = reclaim_account.key() == strategy.reclaim_address
        @ ErrorCode::WrongReclaimAddress
    )]
    reclaim_account: Account<'info, TokenAccount>,
    /// The BoundedStrategy account
    strategy: Box<Account<'info, BoundedStrategy>>,
    /// CHECK: Checks are made when loading and interacting with the market
    #[account(
        mut,
      owner = open_book_dex::ID
    )]
    pub serum_market: UncheckedAccount<'info>,
    #[account(
        mut,
        owner = open_book_dex::ID,
        constraint = open_orders.key() == strategy.open_orders
          @ ErrorCode::WrongOpenOrdersKey
      )]
    /// CHECK: Serum checks the OpenOrders owners
    pub open_orders: UncheckedAccount<'info>,
    /// CHECK: Constraints are added
    #[account(
          constraint = authority.key() == strategy.authority
              @ ErrorCode::AuthorityMisMatch,
      )]
    pub authority: UncheckedAccount<'info>,
    #[account(mut)]
    /// CHECK: Serum handles checks
    pub coin_vault: UncheckedAccount<'info>,
    #[account(mut)]
    /// CHECK: Serum handles checks
    pub pc_vault: UncheckedAccount<'info>,
    /// CHECK: Serum handles checks
    pub serum_vault_signer: UncheckedAccount<'info>,

    // Validate the key matches BoundedStrategy
    #[account(
          mut,
          constraint = deposit_account.key() == strategy.deposit_address
              @ ErrorCode::DepositAddressMisMatch
      )]
    pub deposit_account: Box<Account<'info, TokenAccount>>,

    /// The Serum program
    pub dex_program: Program<'info, open_book_dex::OpenBookDexV3>,
    /// The SPL Token program id
    pub token_program_id: Program<'info, Token>,
}

pub fn handler<'a, 'b, 'c, 'info>(
    ctx: Context<'a, 'b, 'c, 'info, SettleFundsAccounts<'info>>,
) -> Result<()> {
    let bounded_strategy = &ctx.accounts.strategy;
    // Settle the trade!
    let wallets = if ctx.accounts.strategy.order_side == 0 {
        // The user is buying, so the reclaim account is the PC wallet
        SettleWallets {
            pc_wallet: ctx.accounts.reclaim_account.to_account_info(),
            coin_wallet: ctx.accounts.deposit_account.to_account_info(),
        }
    } else {
        SettleWallets {
            pc_wallet: ctx.accounts.deposit_account.to_account_info(),
            coin_wallet: ctx.accounts.reclaim_account.to_account_info(),
        }
    };
    let bump = bounded_strategy.authority_bump;
    let signer_seeds: &[&[u8]] = authority_signer_seeds!(&ctx, bump);
    settle_funds!(&ctx, wallets, &[signer_seeds]);

    Ok(())
}
