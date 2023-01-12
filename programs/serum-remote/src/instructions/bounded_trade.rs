use std::cmp;
use std::num::NonZeroU64;

use anchor_lang::prelude::*;
use anchor_spl::dex::serum_dex::matching::{OrderType, Side};
use anchor_spl::{
    dex::{
        self, new_order_v3,
        serum_dex::{declare_check_assert_macros, instruction::SelfTradeBehavior, state::Market},
        settle_funds, NewOrderV3, SettleFunds,
    },
    token::{Token, TokenAccount},
};

use crate::dexes::open_book_dex;
use crate::{authority_signer_seeds, settle_funds};
use crate::{
    constants::AUTHORITY_SEED,
    errors::ErrorCode,
    place_order,
    serum_utils::{get_best_bid_ask, FeeTier},
    state::BoundedStrategy,
};

#[derive(Accounts)]
pub struct BoundedTrade<'info> {
    /// Anyone can fire this transaction
    payer: Signer<'info>,
    /// The BoundedStrategy account
    strategy: Box<Account<'info, BoundedStrategy>>,
    /// CHECK: Checks are made when loading and interacting with the market
    #[account(
      mut,
    owner = open_book_dex::ID
  )]
    pub serum_market: UncheckedAccount<'info>,
    /// The Serum Market's bids account
    /// CHECK: Market checks are made when loading from the Market
    #[account(
      mut,
      owner = open_book_dex::ID
    )]
    pub bids: UncheckedAccount<'info>,
    /// The Serum Market's asks accoutn
    /// CHECK: Market checks are made when loading from the Market
    #[account(
      mut,
      owner = open_book_dex::ID
    )]
    pub asks: UncheckedAccount<'info>,

    #[account(
      mut,
      owner = open_book_dex::ID,
      constraint = open_orders.key() == strategy.open_orders
          @ ErrorCode::WrongOpenOrdersKey
    )]
    /// CHECK: Serum checks the OpenOrders owners
    pub open_orders: UncheckedAccount<'info>,
    #[account(
        mut,
        constraint = order_payer.key() == strategy.order_payer
            @ ErrorCode::OrderPayerMisMatch,
    )]
    pub order_payer: Box<Account<'info, TokenAccount>>,
    /// CHECK: Constraints are added
    #[account(
        constraint = authority.key() == strategy.authority
            @ ErrorCode::AuthorityMisMatch,
    )]
    pub authority: UncheckedAccount<'info>,
    #[account(mut,
      owner = open_book_dex::ID)]
    /// CHECK: Serum handles checks
    pub request_queue: UncheckedAccount<'info>,
    #[account(mut,
      owner = open_book_dex::ID)]
    /// CHECK: Serum handles checkss
    pub event_queue: UncheckedAccount<'info>,
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
    pub dex_program: Program<'info, dex::Dex>,
    /// The SPL Token program id
    pub token_program_id: Program<'info, Token>,
    pub rent: Sysvar<'info, Rent>,
}

declare_check_assert_macros!(SourceFileId::State);

pub fn handler<'a, 'b, 'c, 'info>(
    ctx: Context<'a, 'b, 'c, 'info, BoundedTrade<'info>>,
) -> Result<()> {
    let bounded_strategy = &ctx.accounts.strategy;

    let (best_bid, best_ask, coin_lot_size, pc_lot_size) = {
        // load the Serum market
        let mut market =
            Market::load(&ctx.accounts.serum_market, &ctx.accounts.dex_program.key()).unwrap();

        let (coin_lot_size, pc_lot_size) = (market.coin_lot_size, market.pc_lot_size);

        let (best_bid, best_ask) = get_best_bid_ask(
            &mut market,
            &ctx.accounts.bids.to_account_info(),
            &ctx.accounts.asks.to_account_info(),
        );
        (best_bid, best_ask, coin_lot_size, pc_lot_size)
    };

    // Order Side is BID
    if bounded_strategy.order_side == 0 {
        let best_ask_price = best_ask.price();
        let best_ask_u64 = u64::from(best_ask_price);
        // Conditional Upper Bound
        if bounded_strategy.bound == 1 {
            // Check if the ask is below the upper bound
            if best_ask_u64 < bounded_strategy.bounded_price {
                // Calculate the max base amount that can be bought. The
                // limiting factors are the quantity and the assets available in the TokenAccount
                let max_base_from_payer = ctx
                    .accounts
                    .order_payer
                    .amount
                    .checked_mul(coin_lot_size)
                    .unwrap()
                    .checked_div(best_ask_price.into())
                    .unwrap()
                    .checked_div(pc_lot_size)
                    .unwrap();
                let max_ask_qty = best_ask.quantity().checked_mul(coin_lot_size).unwrap();
                let max_base_purchase_amt = cmp::min(max_base_from_payer, max_ask_qty);
                let max_base_purchase_lots =
                    max_base_purchase_amt.checked_div(coin_lot_size).unwrap();
                let max_pc_qty = max_base_purchase_lots
                    .checked_mul(best_ask_u64)
                    .unwrap()
                    .checked_mul(pc_lot_size)
                    .unwrap();
                let serum_fees = FeeTier::Base.taker_fee(max_pc_qty);
                let max_pc_qty = serum_fees.checked_add(max_pc_qty).unwrap();
                // Execute the trade!
                let order = OrderInfo {
                    side: Side::Bid,
                    price: best_ask_price,
                    max_coin_qty: NonZeroU64::new(max_base_purchase_lots).unwrap(),
                    max_pc_qty: NonZeroU64::new(max_pc_qty).unwrap(),
                };
                let bump = bounded_strategy.authority_bump;
                let signer_seeds: &[&[u8]] = authority_signer_seeds!(&ctx, bump);
                place_order!(ctx, order, &[signer_seeds]);

                // Settle the trade!
                let wallets = SettleWallets {
                    pc_wallet: ctx.accounts.order_payer.to_account_info(),
                    coin_wallet: ctx.accounts.deposit_account.to_account_info(),
                };
                settle_funds!(&ctx, wallets, &[signer_seeds]);
            } else {
                return Err(error!(ErrorCode::MarketPriceIsOutOfBounds));
            }
        } else {
            return Err(error!(ErrorCode::NoLowerBoundedBids));
        }
    } else {
        // Order Side is ASK
        let best_bid_price = best_bid.price();
        let best_bid_u64 = u64::from(best_bid_price);
        // Handle Selling the base asset
        if bounded_strategy.bound == 0 {
            if best_bid_u64 > bounded_strategy.bounded_price {
                // Calculate max trade amount
                let payer_base_in_lots = ctx
                    .accounts
                    .order_payer
                    .amount
                    .checked_div(coin_lot_size)
                    .unwrap();
                let max_base_in_lots = cmp::min(payer_base_in_lots, best_bid.quantity());
                let max_pc_qty = max_base_in_lots
                    .checked_mul(best_bid_u64)
                    .unwrap()
                    .checked_mul(pc_lot_size)
                    .unwrap();
                let serum_fees = FeeTier::Base.taker_fee(max_pc_qty);
                let max_pc_qty = serum_fees.checked_add(max_pc_qty).unwrap();
                // Execute the trade!
                let order = OrderInfo {
                    side: Side::Ask,
                    price: best_bid_price,
                    max_coin_qty: NonZeroU64::new(max_base_in_lots).unwrap(),
                    max_pc_qty: NonZeroU64::new(max_pc_qty).unwrap(),
                };
                let bump = bounded_strategy.authority_bump;
                let signer_seeds: &[&[u8]] = authority_signer_seeds!(&ctx, bump);
                place_order!(ctx, order, &[signer_seeds]);

                // Settle the trade!
                let wallets = SettleWallets {
                    pc_wallet: ctx.accounts.deposit_account.to_account_info(),
                    coin_wallet: ctx.accounts.order_payer.to_account_info(),
                };
                settle_funds!(&ctx, wallets, &[signer_seeds]);
            } else {
                return Err(error!(ErrorCode::MarketPriceIsOutOfBounds));
            }
        } else {
            return Err(error!(ErrorCode::NoUpperBoundedAsks));
        }
    }
    Ok(())
}

#[derive(Debug)]
struct OrderInfo {
    side: Side,
    price: NonZeroU64,
    max_coin_qty: NonZeroU64,
    max_pc_qty: NonZeroU64,
}

pub struct SettleWallets<'info> {
    /// CHECK: blah
    pub coin_wallet: AccountInfo<'info>,
    /// CHECK: blah
    pub pc_wallet: AccountInfo<'info>,
}
