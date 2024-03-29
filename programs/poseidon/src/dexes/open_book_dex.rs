use std::{collections::VecDeque, num::NonZeroU64};

use anchor_lang::prelude::*;
use anchor_spl::dex::serum_dex::{
    self,
    instruction::SelfTradeBehavior,
    matching::{OrderType, Side},
    state::Market,
};
use arrayref::array_refs;

use crate::{errors, utils::spl_token_utils};

use super::{
    serum_v3::{self, buy_coin_amount_out, sell_coin_amount_out, OrderBookItem, Slab},
    Dex, DexStatic,
};

pub const MAX_ORDER_BOOK_DEPTH: usize = 3;

#[cfg(not(feature = "devnet"))]
anchor_lang::declare_id!("srmqPvymJeFKQ4zGQed1GFppgkRHL9kaELCbyksJtPX");
#[cfg(feature = "devnet")]
anchor_lang::declare_id!("EoTcMgcDRTJVZDMZWBoU6rhYHZfkNTVEAfz3uUJRcYGj");

#[derive(Clone)]
pub struct OpenBookDexV3;

impl anchor_lang::Id for OpenBookDexV3 {
    fn id() -> Pubkey {
        ID
    }
}

/**
 * OpenBookDex ACCOUNT ORDER
 * 0 - dex_program
 * 1 - serum_market
 * 2 - bids
 * 3 - asks
 * 4 - open_orders
 * 5 - request_queue
 * 6 - event_queue
 * 7 - coin_vault
 * 8 - pc_vault
 * 9 - serum_vault_signer
 * 10 - token_program_id
 * 11 - rent
 * 12 - serum_referral_account
 * 13 - payer account
 * 14 - payer_source_wallet
 * 15 - payer_destination_wallet
 */
pub struct OpenBookDex<'a, 'info> {
    pub trade_is_bid: bool,
    pub order_book: Vec<OrderBookItem>,
    pub fee_numerator: u64,
    pub fee_denominator: u64,
    pub coin_lot_size: u64,
    pub pc_lot_size: u64,
    pub has_fee_discount_account: bool,
    pub base_decimals_factor: u64,
    pub accounts: &'a [AccountInfo<'info>],
}

impl<'a, 'info> OpenBookDex<'a, 'info> {
    fn dex_program(&self) -> &AccountInfo<'info> {
        &self.accounts[0]
    }

    fn serum_market(&self) -> &AccountInfo<'info> {
        &self.accounts[1]
    }

    fn bids(&self) -> &AccountInfo<'info> {
        &self.accounts[2]
    }

    fn asks(&self) -> &AccountInfo<'info> {
        &self.accounts[3]
    }

    fn open_orders_account(&self) -> &AccountInfo<'info> {
        &self.accounts[4]
    }

    fn request_queue(&self) -> &AccountInfo<'info> {
        &self.accounts[5]
    }

    fn event_queue(&self) -> &AccountInfo<'info> {
        &self.accounts[6]
    }

    fn coin_vault(&self) -> &AccountInfo<'info> {
        &self.accounts[7]
    }

    fn pc_vault(&self) -> &AccountInfo<'info> {
        &self.accounts[8]
    }

    fn rent(&self) -> &AccountInfo<'info> {
        &self.accounts[11]
    }

    fn token_program_id(&self) -> &AccountInfo<'info> {
        &self.accounts[10]
    }

    fn payer_source_wallet(&self) -> &AccountInfo<'info> {
        &self.accounts[14]
    }

    fn payer_destination_wallet(&self) -> &AccountInfo<'info> {
        &self.accounts[15]
    }
}

impl Dex for OpenBookDex<'_, '_> {
    fn simulate_trade(&self, tokens_in: u64) -> u64 {
        if self.trade_is_bid {
            buy_coin_amount_out(
                tokens_in,
                &self.order_book,
                self.fee_numerator,
                self.fee_denominator,
                self.base_decimals_factor,
                self.pc_lot_size,
            )
        } else {
            sell_coin_amount_out(
                tokens_in,
                &self.order_book,
                self.fee_numerator,
                self.fee_denominator,
                self.base_decimals_factor,
                self.coin_lot_size,
            )
        }
    }

    fn input_balance(&self) -> anchor_lang::Result<u64> {
        let data = &self.accounts[14].try_borrow_data()?;
        Ok(spl_token_utils::amount(data))
    }

    fn start_mint(&self) -> Result<Pubkey> {
        Ok(spl_token_utils::mint(
            &self.payer_source_wallet().try_borrow_data()?,
        ))
    }

    fn end_mint(&self) -> Result<Pubkey> {
        Ok(spl_token_utils::mint(
            &self.payer_destination_wallet().try_borrow_data()?,
        ))
    }
}

impl<'a, 'info> DexStatic<'a, 'info> for OpenBookDex<'a, 'info> {
    const ACCOUNTS_LEN: usize = 16;

    const INIT_ACCOUNTS_LEN: usize = 3;

    fn from_account_slice(
        accounts: &'a [AccountInfo<'info>],
        additional_data: &mut VecDeque<u8>,
    ) -> anchor_lang::Result<OpenBookDex<'a, 'info>> {
        let base_decimals = additional_data.pop_front().unwrap();
        let base_decimals_factor = 10_u64.pow(base_decimals.into());

        let base_mint = spl_token_utils::mint(&accounts[7].try_borrow_data()?);
        let destination_mint = spl_token_utils::mint(&accounts[15].try_borrow_data()?);
        let trade_is_bid = destination_mint == base_mint;

        // Load the Serum Market to extract decimal data
        let market = Market::load(&accounts[1], accounts[0].key)
            .map_err(|_| errors::ErrorCode::FailedToLoadOpenBookDexMarket)?;

        let order_book = if trade_is_bid {
            // load asks
            let ob_data = &accounts[3].try_borrow_data()?;
            // Strip the padding
            let (_head, data, _tail) = array_refs![ob_data, 5 + 8; ..; 7];
            // Deref the order book
            let slab = Slab::new(data);
            slab.get_order_book_items(
                MAX_ORDER_BOOK_DEPTH,
                false,
                market.coin_lot_size,
                base_decimals_factor,
                market.pc_lot_size,
            )
        } else {
            // load bids
            let ob_data = &accounts[2].try_borrow_data()?;
            let (_head, data, _tail) = array_refs![ob_data, 5 + 8; ..; 7];
            let slab = Slab::new(data);
            slab.get_order_book_items(
                MAX_ORDER_BOOK_DEPTH,
                true,
                market.coin_lot_size,
                base_decimals_factor,
                market.pc_lot_size,
            )
        };

        let fee_tier = serum_v3::fees::FeeTier::from_srm_and_msrm_balances(accounts[1].key);
        let (fee_numerator, fee_denominator) = fee_tier.taker_rate_fraction();

        Ok(Self {
            order_book,
            trade_is_bid,
            accounts,
            fee_numerator,
            fee_denominator,
            has_fee_discount_account: false,
            base_decimals_factor,
            coin_lot_size: market.coin_lot_size,
            pc_lot_size: market.pc_lot_size,
        })
    }

    fn swap(&self, amount_in: u64, signers_seeds: &[&[&[u8]]]) -> anchor_lang::Result<()> {
        let (max_pc_qty, max_coin_qty, limit_price, side) = if self.trade_is_bid {
            (
                NonZeroU64::new(amount_in).unwrap(),
                NonZeroU64::new(u64::MAX).unwrap(),
                NonZeroU64::new(u64::MAX).unwrap(),
                Side::Bid,
            )
        } else {
            let max_coin_qty = amount_in.checked_div(self.coin_lot_size).unwrap();
            (
                NonZeroU64::new(u64::MAX).unwrap(),
                NonZeroU64::new(max_coin_qty).unwrap(),
                NonZeroU64::new(1_u64).unwrap(),
                Side::Ask,
            )
        };
        let srm_account_referral = if self.has_fee_discount_account {
            Some(self.accounts[12].key)
        } else {
            None
        };
        // Place ioc order
        let new_order_ix = serum_dex::instruction::new_order(
            self.serum_market().key,
            self.open_orders_account().key,
            self.request_queue().key,
            self.event_queue().key,
            self.bids().key,
            self.asks().key,
            self.accounts[14].key,
            self.accounts[13].key,
            self.coin_vault().key,
            self.pc_vault().key,
            self.token_program_id().key,
            self.rent().key,
            srm_account_referral,
            self.dex_program().key,
            side,
            limit_price,
            max_coin_qty,
            OrderType::ImmediateOrCancel,
            0,
            SelfTradeBehavior::DecrementTake,
            u16::MAX,
            max_pc_qty,
        )
        .unwrap();
        anchor_lang::solana_program::program::invoke_signed_unchecked(
            &new_order_ix,
            self.accounts,
            signers_seeds,
        )
        .unwrap();
        // Settle order
        let (coin_wallet, pc_wallet) = if self.trade_is_bid {
            (self.accounts[15].key, self.accounts[14].key)
        } else {
            (self.accounts[14].key, self.accounts[15].key)
        };
        let settle_funds_ix = serum_dex::instruction::settle_funds(
            self.accounts[0].key,
            self.accounts[1].key,
            self.accounts[10].key,
            self.accounts[4].key,
            self.accounts[13].key,
            self.accounts[7].key,
            coin_wallet,
            self.accounts[8].key,
            pc_wallet,
            Some(pc_wallet),
            self.accounts[9].key,
        )
        .unwrap();
        anchor_lang::solana_program::program::invoke_signed_unchecked(
            &settle_funds_ix,
            self.accounts,
            signers_seeds,
        )
        .unwrap();
        Ok(())
    }
}
