use std::{num::NonZeroU64, convert::identity};

use anchor_lang::{prelude::*, error};
use anchor_spl::dex::serum_dex::{matching::{Side, OrderType}, self, instruction::SelfTradeBehavior, state::Market};
use arrayref::array_refs;
use safe_transmute::transmute_to_bytes;

use crate::{constants::OPEN_ORDERS_SEED, utils::spl_token_utils, errors::{self, ErrorCode}, state::BoundedStrategyV2, open_orders_seeds, open_orders_signer_seeds};

use super::{serum_v3::{OrderBookItem, buy_coin_amount_out, sell_coin_amount_out, Slab, self}, Dex, DexStatic};

pub const MAX_ORDER_BOOK_DEPTH: usize = 3;
const OPEN_ORDERS_MEM_SIZE: u64 = 3228;

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
    trade_is_bid: bool,
    order_book: Vec<OrderBookItem>,
    fee_numerator: u64,
    fee_denominator: u64,
    coin_lot_size: u64,
    pc_lot_size: u64,
    has_fee_discount_account: bool,
    base_decimals_factor: u64,
    accounts: &'a [AccountInfo<'info>]
}

/**
 * OpenBookDexInitialize ACCOUNT ORDER
 * 0 - dex_program
 * 1 - serum_market
 * 2 - OpenOrders account
 */
pub struct OpenBookDexInitialize<'a, 'info> {
    market: Market<'a>,
    accounts: &'a [AccountInfo<'info>]
}
impl<'a,'info> OpenBookDexInitialize<'a,'info> {
    fn open_orders_account(&self) -> &AccountInfo<'info> {
        &self.accounts[2]
    }

    fn dex_program(&self) -> &AccountInfo<'info> {
        &self.accounts[0]
    }

    fn from_account_slice(
        accounts: &'a [AccountInfo<'info>]
    ) -> anchor_lang::Result<OpenBookDexInitialize<'a, 'info>> {

        let market = Market::load(&accounts[1], accounts[0].key)
            .map_err(|_| errors::ErrorCode::FailedToLoadOpenBookDexMarket)?;

        Ok(Self {
            accounts,
            market,
        })
    }

    fn validate(&self, bounded_strategy: &BoundedStrategyV2) -> anchor_lang::Result<()> {
        // Validate market and mint information
        let coin_mint = Pubkey::new(&transmute_to_bytes(&identity(self.market.coin_mint)));
        let pc_mint = Pubkey::new(&transmute_to_bytes(&identity(self.market.pc_mint)));
        if bounded_strategy.order_side == 0 && bounded_strategy.collateral_mint != pc_mint {
            // If Bidding the assets to transfer must the the price currency mint
            return Err(error!(ErrorCode::BidsRequireQuoteCurrency));
        } else if bounded_strategy.order_side == 1 && bounded_strategy.collateral_mint != coin_mint {
            return Err(error!(ErrorCode::AsksRequireBaseCurrency));
        }
        Ok(())
    }
}

impl Dex for OpenBookDex<'_, '_> {
    fn simulate_trade(&self,tokens_in:u64) -> u64 {
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

    fn swap(&self, amount_in: u64) -> anchor_lang::Result<()> {
        let (max_pc_qty, max_coin_qty, limit_price, side) = if self.trade_is_bid {
            (
                NonZeroU64::new(amount_in).unwrap(),
                NonZeroU64::new(u64::MAX).unwrap(),
                NonZeroU64::new(u64::MAX).unwrap(),
                Side::Bid,
            )
        } else {
            (
                NonZeroU64::new(u64::MAX).unwrap(),
                NonZeroU64::new(amount_in).unwrap(),
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
            self.accounts[1].key,
            self.accounts[4].key,
            self.accounts[5].key,
            self.accounts[6].key,
            self.accounts[2].key,
            self.accounts[3].key,
            self.accounts[14].key,
            self.accounts[13].key,
            self.accounts[7].key,
            self.accounts[8].key,
            self.accounts[10].key,
            self.accounts[11].key,
            srm_account_referral,
            self.accounts[0].key,
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
        anchor_lang::solana_program::program::invoke_unchecked(&new_order_ix, self.accounts)
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
        anchor_lang::solana_program::program::invoke_unchecked(&settle_funds_ix, self.accounts)
            .unwrap();
        Ok(())
    }
}

impl<'a,'info> DexStatic<'a,'info> for OpenBookDex<'a,'info> {
    const ACCOUNTS_LEN: usize = 16;

    const INIT_ACCOUNTS_LEN: usize = 3;

    fn from_account_slice(
        accounts: &'a [AccountInfo<'info>],
        additional_data: &mut Vec<u8>,
    ) -> anchor_lang::Result<OpenBookDex<'a, 'info>> {
        let base_decimals = additional_data.pop().unwrap();
        let base_decimals_factor = 10_u64.pow(base_decimals.into());

        let base_mint = spl_token_utils::mint(&accounts[7].try_borrow_data()?);
        let source_mint = spl_token_utils::mint(&accounts[14].try_borrow_data()?);
        let trade_is_bid = source_mint != base_mint;

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
        OrderBookItem::simple_debug(&order_book);
        let fee_tier = serum_v3::fees::FeeTier::from_srm_and_msrm_balances(
            accounts[1].key
        );
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

    fn initialize(
        &self,
        payer: UncheckedAccount<'info>,
        accounts: &'a [AccountInfo<'info>],
        bounded_strategy: &Account<'info, BoundedStrategyV2>,
        program_id: &Pubkey,
    ) -> anchor_lang::Result<()> {
        let obd_init = OpenBookDexInitialize::from_account_slice(accounts)?;

        obd_init.validate(bounded_strategy)?;

        // create OpenOrders account
        let cpi_accounts = anchor_lang::system_program::CreateAccount {
            from: payer.to_account_info(),
            to: obd_init.open_orders_account().to_account_info(),
        };
        // Get the canonical OpenOrders bump
        let (open_orders_key, open_orders_bump) = Pubkey::find_program_address(open_orders_seeds!(bounded_strategy), program_id);
        if open_orders_key != obd_init.open_orders_account().key() {
            return Err(error!(ErrorCode::BadOpenOrdersKey))
        }
        let cpi_ctx = CpiContext {
            program: obd_init.dex_program().to_account_info(),
            accounts: cpi_accounts,
            remaining_accounts: Vec::new(),
            signer_seeds: &[open_orders_signer_seeds!(bounded_strategy, open_orders_bump)],
        };

        anchor_lang::system_program::create_account(
            cpi_ctx,
            Rent::get()?.minimum_balance(OPEN_ORDERS_MEM_SIZE as usize),
            OPEN_ORDERS_MEM_SIZE,
            obd_init.dex_program().key,
        )?;

        // TODO: Initialize the OpenOrders account
        Ok(())
    }
}