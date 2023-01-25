use std::collections::VecDeque;

use anchor_lang::{prelude::*, system_program};
use anchor_spl::token::TokenAccount;

use crate::{
    constants::BOUNDED_STRATEGY_SEED, dexes::Route, errors::ErrorCode, state::BoundedStrategyV2,
    strategy_signer_seeds,
};

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
            return Err(error!(ErrorCode::IncorrectKeysForLeg));
        }
    }
    // Build the route
    let route = Route::create(
        ctx.remaining_accounts,
        VecDeque::from(bounded_strategy.additional_data.to_vec()),
    )?;
    // Get the input token account balance
    let input_tokens = ctx.accounts.order_payer.amount;
    // Test the maxiumum amount of tokens the payer has in order to off load all at once. 
    if route.simple_price_check(
        input_tokens,
        &bounded_strategy.bounded_price_numerator,
        &bounded_strategy.bounded_price_denominator,
        &bounded_strategy.bound,
    ) {
        return route.execute(
            input_tokens,
            &[strategy_signer_seeds!(&ctx.accounts.strategy)],
        );
    }
    // Trade input calculation
    let input_amount = route.calculate_max_input(
        input_tokens,
        &bounded_strategy.bounded_price_numerator,
        &bounded_strategy.bounded_price_denominator,
        &bounded_strategy.bound,
        16,
    );
    if !route.simple_price_check(
        input_amount,
        &bounded_strategy.bounded_price_numerator,
        &bounded_strategy.bounded_price_denominator,
        &bounded_strategy.bound,
    ) {
        return Err(error!(ErrorCode::MarketPriceIsOutOfBounds));
    }
    // Execute the trade route
    route.execute(
        input_amount,
        &[strategy_signer_seeds!(&ctx.accounts.strategy)],
    )?;
    Ok(())
}
