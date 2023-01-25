use std::{collections::VecDeque, convert::identity, num::NonZeroU64};

use anchor_lang::{error, prelude::*, solana_program::sysvar};
use anchor_spl::{
    dex::{
        serum_dex::{
            self,
            instruction::SelfTradeBehavior,
            matching::{OrderType, Side},
            state::{gen_vault_signer_key, Market},
        },
        InitOpenOrders,
    },
    token::{self, accessor::amount},
};
use arrayref::array_refs;
use safe_transmute::transmute_to_bytes;

use crate::{
    constants::{BOUNDED_STRATEGY_SEED, OPEN_ORDERS_SEED},
    errors::{self, ErrorCode},
    instructions::InitBoundedStrategyV2,
    open_orders_seeds, open_orders_signer_seeds,
    state::BoundedStrategyV2,
    strategy_signer_seeds,
    utils::spl_token_utils,
};

use super::{
    serum_v3::{self, buy_coin_amount_out, sell_coin_amount_out, OrderBookItem, Slab},
    Dex, DexStatic,
};

pub const MAX_ORDER_BOOK_DEPTH: usize = 3;
const OPEN_ORDERS_MEM_SIZE: u64 = 3228;

#[cfg(not(feature = "devnet"))]
#[cfg(not(feature = "localnet"))]
anchor_lang::declare_id!("srmqPvymJeFKQ4zGQed1GFppgkRHL9kaELCbyksJtPX");
#[cfg(feature = "devnet")]
anchor_lang::declare_id!("EoTcMgcDRTJVZDMZWBoU6rhYHZfkNTVEAfz3uUJRcYGj");
#[cfg(feature = "localnet")]
anchor_lang::declare_id!("9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin");

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

    fn vault_signer(&self) -> &AccountInfo<'info> {
        &self.accounts[9]
    }

    fn expected_vault_signer(&self, market: &Market) -> Pubkey {
        let res = gen_vault_signer_key(
            market.vault_signer_nonce,
            self.serum_market().key,
            self.dex_program().key,
        );
        match res {
            Ok(key) => key,
            Err(err) => panic!("market_vault_signer Error: {}", err),
        }
    }

    fn token_program_id(&self) -> &AccountInfo<'info> {
        &self.accounts[10]
    }

    fn rent(&self) -> &AccountInfo<'info> {
        &self.accounts[11]
    }

    fn payer_source_wallet(&self) -> &AccountInfo<'info> {
        &self.accounts[14]
    }

    fn payer_destination_wallet(&self) -> &AccountInfo<'info> {
        &self.accounts[15]
    }

    fn validate_init(&self, bounded_strategy: &BoundedStrategyV2) -> anchor_lang::Result<()> {
        let market = Market::load(self.serum_market(), self.dex_program().key)
            .map_err(|_| errors::ErrorCode::FailedToLoadOpenBookDexMarket)?;
        // Validate market and mint information
        let coin_mint = Pubkey::new(&transmute_to_bytes(&identity(market.coin_mint)));
        let pc_mint = Pubkey::new(&transmute_to_bytes(&identity(market.pc_mint)));
        if bounded_strategy.order_side == 0 && bounded_strategy.collateral_mint != pc_mint {
            // If Bidding the assets to transfer must the the price currency mint
            return Err(error!(ErrorCode::BidsRequireQuoteCurrency));
        } else if bounded_strategy.order_side == 1 && bounded_strategy.collateral_mint != coin_mint
        {
            return Err(error!(ErrorCode::AsksRequireBaseCurrency));
        }

        ////////////////// Validate the accounts data against the Market //////////////////
        // These are helpful for user feedback. Downstream programs should validate accounts,
        //  but validating market information on initialization is nice to have.
        if self.bids().key.to_bytes() != transmute_to_bytes(&identity(market.bids)) {
            return Err(error!(ErrorCode::IncorrectKeysForLeg));
        }
        if self.asks().key.to_bytes() != transmute_to_bytes(&identity(market.asks)) {
            return Err(error!(ErrorCode::IncorrectKeysForLeg));
        }
        if self.request_queue().key.to_bytes() != transmute_to_bytes(&identity(market.req_q)) {
            return Err(error!(ErrorCode::IncorrectKeysForLeg));
        }
        if self.event_queue().key.to_bytes() != transmute_to_bytes(&identity(market.event_q)) {
            return Err(error!(ErrorCode::IncorrectKeysForLeg));
        }
        if self.coin_vault().key.to_bytes() != transmute_to_bytes(&identity(market.coin_vault)) {
            return Err(error!(ErrorCode::IncorrectKeysForLeg));
        }
        if self.pc_vault().key.to_bytes() != transmute_to_bytes(&identity(market.pc_vault)) {
            return Err(error!(ErrorCode::IncorrectKeysForLeg));
        }
        if self.vault_signer().key != &self.expected_vault_signer(&market) {
            return Err(error!(ErrorCode::IncorrectKeysForLeg));
        }
        if self.token_program_id().key != &token::ID {
            return Err(error!(ErrorCode::IncorrectKeysForLeg));
        }
        if self.rent().key != &sysvar::rent::ID {
            return Err(error!(ErrorCode::IncorrectKeysForLeg));
        }

        Ok(())
    }
}

impl Dex for OpenBookDex<'_, '_> {
    fn simulate_trade(&self, tokens_in: u64) -> u64 {
        println!("trade_is_bid {}", self.trade_is_bid);
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
            println!("sell_coin_amount_out {} {:?} {} {} {} {}", tokens_in, self.order_book, self.fee_numerator, self.fee_denominator, self.base_decimals_factor, self.coin_lot_size);
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

    fn initialize(
        &self,
        ctx: &Context<'_, '_, '_, 'info, InitBoundedStrategyV2<'info>>,
    ) -> anchor_lang::Result<()> {
        self.validate_init(&ctx.accounts.strategy)?;

        // create OpenOrders account
        let cpi_accounts = anchor_lang::system_program::CreateAccount {
            from: ctx.accounts.payer.to_account_info(),
            to: self.open_orders_account().to_account_info(),
        };
        // Get the canonical OpenOrders bump
        let (open_orders_key, open_orders_bump) = Pubkey::find_program_address(
            open_orders_seeds!(&ctx.accounts.strategy),
            ctx.program_id,
        );
        if open_orders_key != self.open_orders_account().key() {
            return Err(error!(ErrorCode::BadOpenOrdersKey));
        }
        let cpi_ctx = CpiContext {
            program: self.dex_program().to_account_info(),
            accounts: cpi_accounts,
            remaining_accounts: Vec::new(),
            signer_seeds: &[open_orders_signer_seeds!(
                &ctx.accounts.strategy,
                open_orders_bump
            )],
        };

        anchor_lang::system_program::create_account(
            cpi_ctx,
            Rent::get()?.minimum_balance(OPEN_ORDERS_MEM_SIZE as usize),
            OPEN_ORDERS_MEM_SIZE,
            self.dex_program().key,
        )?;

        // Initialize the OpenOrders account
        let init_open_orders_accounts = InitOpenOrders {
            open_orders: self.open_orders_account().to_account_info(),
            authority: ctx.accounts.strategy.to_account_info(),
            market: self.serum_market().to_account_info(),
            rent: ctx.accounts.rent.to_account_info(),
        };

        let init_ctx = CpiContext {
            accounts: init_open_orders_accounts,
            program: self.dex_program().to_account_info(),
            remaining_accounts: vec![],
            signer_seeds: &[strategy_signer_seeds!(&ctx.accounts.strategy)],
        };
        let ix = serum_dex::instruction::init_open_orders(
            &ID,
            init_ctx.accounts.open_orders.key,
            init_ctx.accounts.authority.key,
            init_ctx.accounts.market.key,
            init_ctx.remaining_accounts.first().map(|acc| acc.key),
        )
        .map_err(|pe| ProgramError::from(pe))?;
        anchor_lang::solana_program::program::invoke_signed(
            &ix,
            &ToAccountInfos::to_account_infos(&init_ctx),
            init_ctx.signer_seeds,
        )?;
        Ok(())
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
        msg!("tib {} side {:?} max {} {} cls {}", self.trade_is_bid, side, max_coin_qty, max_pc_qty, self.coin_lot_size);
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
