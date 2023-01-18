use anchor_lang::{prelude::*, system_program};
use anchor_spl::token::TokenAccount;

use crate::{dexes::Route, errors::ErrorCode, state::BoundedStrategyV2};

#[derive(Accounts)]
pub struct BoundedTradeV2<'info> {
    /// Anyone can fire this transaction
    payer: Signer<'info>,
    /// The BoundedStrategy account
    strategy: Box<Account<'info, BoundedStrategyV2>>,
    #[account(
        mut,
        constraint = order_payer.key() == strategy.collateral_account
            @ ErrorCode::OrderPayerMisMatch,
    )]
    pub order_payer: Box<Account<'info, TokenAccount>>,

    // Validate the key matches BoundedStrategy
    #[account(
        mut,
        constraint = deposit_account.key() == strategy.deposit_address
            @ ErrorCode::DepositAddressMisMatch
    )]
    pub deposit_account: Box<Account<'info, TokenAccount>>,
}

pub fn handler<'a, 'b, 'c, 'info>(
    ctx: Context<'a, 'b, 'c, 'info, BoundedTradeV2<'info>>,
) -> Result<()> {
    let bounded_strategy = &ctx.accounts.strategy;
    // Validate remaining_accounts equals matches the accounts list in BoundedStrategyV2
    for (index, key) in bounded_strategy.account_list.iter().enumerate() {
        if key != &system_program::ID && key != ctx.remaining_accounts[index].key {
            return Err(error!(ErrorCode::IncorrectKeysForLeg))
        }
    }
    // Build the route
    let _route = Route::create(
        ctx.remaining_accounts,
        bounded_strategy.additional_data.to_vec(),
    );
    // TODO: Simple price check
    // TODO: Trade input calculation
    // TODO: Execute the trade route
    Ok(())
}
