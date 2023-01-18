#[macro_export]
macro_rules! strategy_signer_seeds {
    ($strategy:expr, $bump:ident) => {
        &[
            &$strategy.collateral_mint.as_ref(),
            &$strategy.bounded_price.to_le_bytes(),
            &$strategy.reclaim_date.to_le_bytes(),
            BOUNDED_STRATEGY_SEED.as_bytes(),
            &[$bump],
        ]
    };
}

#[macro_export]
macro_rules! authority_signer_seeds {
    ($ctx:expr, $bump:ident) => {
        &[
            &$ctx.accounts.strategy.key().to_bytes()[..],
            AUTHORITY_SEED.as_bytes(),
            &[$bump],
        ]
    };
}

#[macro_export]
macro_rules! open_orders_seeds {
    ($strategy:expr) => {
        &[&$strategy.key().to_bytes()[..], OPEN_ORDERS_SEED.as_bytes()]
    };
}

#[macro_export]
macro_rules! open_orders_signer_seeds {
    ($strategy:expr, $bump:ident) => {
        &[
            &$strategy.key().to_bytes()[..],
            OPEN_ORDERS_SEED.as_bytes(),
            &[$bump],
        ]
    };
}

#[macro_export]
macro_rules! place_order {
    ($ctx:expr, $order_info:expr, $signer_seeds:expr) => {
        let new_order_accounts = NewOrderV3 {
            market: $ctx.accounts.serum_market.to_account_info(),
            open_orders: $ctx.accounts.open_orders.to_account_info(),
            request_queue: $ctx.accounts.request_queue.to_account_info(),
            event_queue: $ctx.accounts.event_queue.to_account_info(),
            market_bids: $ctx.accounts.bids.to_account_info(),
            market_asks: $ctx.accounts.asks.to_account_info(),
            order_payer_token_account: $ctx.accounts.order_payer.to_account_info(),
            open_orders_authority: $ctx.accounts.authority.to_account_info(),
            coin_vault: $ctx.accounts.coin_vault.to_account_info(),
            pc_vault: $ctx.accounts.pc_vault.to_account_info(),
            token_program: $ctx.accounts.token_program_id.to_account_info(),
            rent: $ctx.accounts.rent.to_account_info(),
        };
        let new_order_ctx = CpiContext {
            accounts: new_order_accounts,
            program: $ctx.accounts.dex_program.to_account_info(),
            remaining_accounts: Vec::new(),
            signer_seeds: $signer_seeds,
        };
        let referral = new_order_ctx.remaining_accounts.get(0);
        let ix = anchor_spl::dex::serum_dex::instruction::new_order(
            new_order_ctx.accounts.market.key,
            new_order_ctx.accounts.open_orders.key,
            new_order_ctx.accounts.request_queue.key,
            new_order_ctx.accounts.event_queue.key,
            new_order_ctx.accounts.market_bids.key,
            new_order_ctx.accounts.market_asks.key,
            new_order_ctx.accounts.order_payer_token_account.key,
            new_order_ctx.accounts.open_orders_authority.key,
            new_order_ctx.accounts.coin_vault.key,
            new_order_ctx.accounts.pc_vault.key,
            new_order_ctx.accounts.token_program.key,
            new_order_ctx.accounts.rent.key,
            referral.map(|r| r.key),
            &open_book_dex::ID,
            $order_info.side,
            $order_info.price,
            $order_info.max_coin_qty,
            OrderType::ImmediateOrCancel,
            420,
            SelfTradeBehavior::DecrementTake,
            u16::MAX,
            $order_info.max_pc_qty,
        )
        .map_err(|pe| ProgramError::from(pe))?;
        anchor_lang::solana_program::program::invoke_signed(
            &ix,
            &ToAccountInfos::to_account_infos(&new_order_ctx),
            new_order_ctx.signer_seeds,
        )?;
    };
}

#[macro_export]
macro_rules! settle_funds {
    ($ctx:expr, $wallets:expr, $signer_seeds:expr) => {
        let settle_funds_accounts = SettleFunds {
            market: $ctx.accounts.serum_market.to_account_info(),
            open_orders: $ctx.accounts.open_orders.to_account_info(),
            open_orders_authority: $ctx.accounts.authority.to_account_info(),
            coin_vault: $ctx.accounts.coin_vault.to_account_info(),
            pc_vault: $ctx.accounts.pc_vault.to_account_info(),
            coin_wallet: $wallets.coin_wallet,
            pc_wallet: $wallets.pc_wallet,
            vault_signer: $ctx.accounts.serum_vault_signer.to_account_info(),
            token_program: $ctx.accounts.token_program_id.to_account_info(),
        };
        // Support optional referral account in remaining accounts
        let settle_funds_ctx = CpiContext {
            program: $ctx.accounts.dex_program.to_account_info(),
            accounts: settle_funds_accounts,
            remaining_accounts: $ctx.remaining_accounts.to_vec(),
            signer_seeds: $signer_seeds,
        };
        let referral = settle_funds_ctx.remaining_accounts.get(0);
        let ix = anchor_spl::dex::serum_dex::instruction::settle_funds(
            &open_book_dex::ID,
            settle_funds_ctx.accounts.market.key,
            settle_funds_ctx.accounts.token_program.key,
            settle_funds_ctx.accounts.open_orders.key,
            settle_funds_ctx.accounts.open_orders_authority.key,
            settle_funds_ctx.accounts.coin_vault.key,
            settle_funds_ctx.accounts.coin_wallet.key,
            settle_funds_ctx.accounts.pc_vault.key,
            settle_funds_ctx.accounts.pc_wallet.key,
            referral.map(|r| r.key),
            settle_funds_ctx.accounts.vault_signer.key,
        )
        .map_err(|pe| ProgramError::from(pe))?;
        anchor_lang::solana_program::program::invoke_signed(
            &ix,
            &ToAccountInfos::to_account_infos(&settle_funds_ctx),
            settle_funds_ctx.signer_seeds,
        )?;
    };
}
