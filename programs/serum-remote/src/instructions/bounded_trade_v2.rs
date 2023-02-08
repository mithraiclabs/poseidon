use std::collections::VecDeque;

use anchor_lang::prelude::*;
use anchor_spl::token::TokenAccount;

use crate::{
    constants::BOUNDED_STRATEGY_SEED,
    dexes::{is_in_bounds, Route},
    errors::ErrorCode,
    state::BoundedStrategyV2,
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
    additional_data: Vec<u8>,
) -> Result<()> {
    let starting_input_balance = ctx.accounts.order_payer.amount;
    let starting_destination_balance = ctx.accounts.deposit_account.amount;

    let bounded_strategy = &ctx.accounts.strategy;
    // Build the route
    let route = Route::create(
        ctx.remaining_accounts,
        VecDeque::from(additional_data.to_vec()),
        false,
    )?;
    // Validate that the route starts and ends with the right tokens
    if ctx.accounts.order_payer.mint != route.start_mint()? {
        return Err(error!(ErrorCode::InputMintMismatch));
    }
    if ctx.accounts.deposit_account.mint != route.end_mint()? {
        return Err(error!(ErrorCode::OutputMintMismatch));
    }

    // Get the input token account balance
    let input_tokens = ctx.accounts.order_payer.amount;
    // Test the maxiumum amount of tokens the payer has in order to off load all at once.
    let input_amount = if route.simple_price_check(
        input_tokens,
        &bounded_strategy.bounded_price_numerator,
        &bounded_strategy.bounded_price_denominator,
    ) {
        input_tokens
    } else {
        // Trade input calculation
        let input_amount = route.calculate_max_input(
            input_tokens,
            &bounded_strategy.bounded_price_numerator,
            &bounded_strategy.bounded_price_denominator,
            16,
        );
        if !route.simple_price_check(
            input_amount,
            &bounded_strategy.bounded_price_numerator,
            &bounded_strategy.bounded_price_denominator,
        ) {
            return Err(error!(ErrorCode::MarketPriceIsOutOfBounds));
        }
        input_amount
    };
    // Execute the trade route
    route.execute(
        input_amount,
        &[strategy_signer_seeds!(&ctx.accounts.strategy)],
    )?;

    // Sanity check the deltas for input and output accounts
    ctx.accounts.order_payer.reload()?;
    ctx.accounts.deposit_account.reload()?;

    let ending_input_balance = ctx.accounts.order_payer.amount;
    let ending_destination_balance = ctx.accounts.deposit_account.amount;
    let input_tokens_used = starting_input_balance
        .checked_sub(ending_input_balance)
        .unwrap();
    let destination_tokens_gained = ending_destination_balance
        .checked_sub(starting_destination_balance)
        .unwrap();

    if !is_in_bounds(
        input_tokens_used,
        destination_tokens_gained,
        &bounded_strategy.bounded_price_numerator,
        &bounded_strategy.bounded_price_denominator,
    ) {
        // If actual changes are out of bounds, rollback
        return Err(error!(ErrorCode::MarketPriceIsOutOfBounds));
    }

    Ok(())
}
