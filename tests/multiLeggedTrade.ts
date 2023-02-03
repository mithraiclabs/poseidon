import * as anchor from "@project-serum/anchor";
import { BN } from "@project-serum/anchor";
import { splTokenProgram, SPL_TOKEN_PROGRAM_ID } from "@coral-xyz/spl-token";
import { Program, web3 } from "@project-serum/anchor";
import { Market } from "@project-serum/serum";
import { assert } from "chai";
import { parseTranactionError } from "../packages/serum-remote/src";
import OpenBookDex from "../packages/serum-remote/src/dexes/openBookDex";
import {
  deriveAllBoundedStrategyKeysV2,
  deriveTokenAccount,
} from "../packages/serum-remote/src/pdas";
import { SerumRemote } from "../target/types/serum_remote";
import {
  createAssociatedTokenInstruction,
  initNewTokenMintInstructions,
  loadPayer,
  OPEN_BOOK_DEX_ID,
  SOL_USDC_OPEN_BOOK_MARKET,
  USDC_MINT,
  wait,
} from "./utils";
import { createRaydiumPool } from "./utils/raydium";
import { Currency, CurrencyAmount } from "@raydium-io/raydium-sdk";
import Raydium from "../packages/serum-remote/src/dexes/raydium";

let timesRun = 0;
describe("OpenBook + Raydium Trade", () => {
  // Configure the client to use the local cluster.
  const program = anchor.workspace.SerumRemote as Program<SerumRemote>;
  const payerKey = program.provider.publicKey;
  const payerKeypair = loadPayer(process.env.ANCHOR_WALLET);
  const tokenProgram = splTokenProgram();

  let boundPriceNumerator = new anchor.BN(95_700_000);
  let boundPriceDenominator = new anchor.BN(1_000_000_000);
  let reclaimDate = new anchor.BN(new Date().getTime() / 1_000 + 3600);
  let reclaimAddress: web3.PublicKey;
  let depositAddress: web3.PublicKey;
  let orderSide = 0;
  let bound = 1;
  let transferAmount = new BN(10_000_000_000);
  let serumMarket: Market;
  let coinMint: web3.PublicKey, coinUsdcSerumMarket: Market;
  let boundedStrategyKey: web3.PublicKey, collateralAccount: web3.PublicKey;

  before(async () => {
    serumMarket = await Market.load(
      program.provider.connection,
      SOL_USDC_OPEN_BOOK_MARKET,
      {},
      OPEN_BOOK_DEX_ID
    );
    await program.provider.connection.requestAirdrop(
      payerKey,
      10_000_000_000_000
    );
    const transaction = new web3.Transaction();

    // This TX may fail with concurrent tests
    // TODO: Write more elegant solution
    const { instruction, associatedAddress } =
      await createAssociatedTokenInstruction(program.provider, USDC_MINT);
    const { instruction: baseMintAtaIx, associatedAddress: wSolAta } =
      await createAssociatedTokenInstruction(
        program.provider,
        serumMarket.baseMintAddress
      );
    reclaimAddress = wSolAta;
    const createAtaTx = new web3.Transaction()
      .add(instruction)
      .add(baseMintAtaIx);
    try {
      await program.provider.sendAndConfirm(createAtaTx);
    } catch (err) {}

    const mintToInstruction = await tokenProgram.methods
      .mintTo(transferAmount.muln(10))
      .accounts({
        mint: USDC_MINT,
        account: associatedAddress,
        owner: payerKey,
      })
      .instruction();
    transaction.add(mintToInstruction);

    // Send a bunch of SOL to the WSOL address
    const solTransferIx = web3.SystemProgram.transfer({
      fromPubkey: payerKey,
      toPubkey: wSolAta,
      lamports: 10_000_000_000,
    });
    transaction.add(solTransferIx);
    const syncWSolIx = await tokenProgram.methods
      .syncNative()
      .accounts({ account: wSolAta })
      .instruction();
    transaction.add(syncWSolIx);

    await program.provider.sendAndConfirm(transaction);

    const tx = new web3.Transaction();
    // Create a new mint
    const { instructions, mintAccount } = await initNewTokenMintInstructions(
      program.provider,
      payerKey,
      6
    );
    instructions.forEach((ix) => tx.add(ix));
    coinMint = mintAccount.publicKey;
    // Createa $COIN ATA for payer
    const { instruction: coinMintIx, associatedAddress: coinAta } =
      await createAssociatedTokenInstruction(
        program.provider,
        mintAccount.publicKey
      );
    tx.add(coinMintIx);
    depositAddress = coinAta;

    // Mint $COIN to payer
    const mintCoinIx = await tokenProgram.methods
      .mintTo(new BN(1_000_000_000_000))
      .accounts({
        mint: mintAccount.publicKey,
        account: coinAta,
        owner: payerKey,
      })
      .instruction();
    tx.add(mintCoinIx);
    await program.provider.sendAndConfirm(tx, [mintAccount]);

    // Spin up COIN/USDC pool on Raydium and deposit COIN/USDC liquidity
    const { serumMarketAddress: coinUsdcMarketAddress } =
      await createRaydiumPool(
        program.provider,
        payerKey,
        mintAccount.publicKey,
        6,
        USDC_MINT,
        6,
        new CurrencyAmount(
          new Currency(6, "COIN"),
          new BN(10_000_000_000).toString()
        ),
        new CurrencyAmount(
          new Currency(6, "USDC"),
          new BN(10_000_000_000).toString()
        )
      );
    coinUsdcSerumMarket = await Market.load(
      program.provider.connection,
      coinUsdcMarketAddress,
      {},
      OPEN_BOOK_DEX_ID
    );
  });
  beforeEach(async () => {
    timesRun += 1;
    // Sell 1 SOL for at least 1 COIN (after all legs, fees, etc)
    boundPriceNumerator = new anchor.BN(1_000_000_000);
    boundPriceDenominator = new anchor.BN(1_000_000);
    reclaimDate = new anchor.BN(new Date().getTime() / 1_000 + 3600 + timesRun);
    orderSide = 0;
    bound = 1;
    transferAmount = new BN(10_000_000);
  });

  // Test the BoundedStrategy account is created with the right info
  // As set up, this will be Buying COIN using SOL. Sell SOL for USDC on OpenBookDEX and buy COIN
  //  using USDC from Raydium
  it("Should store all the information for a BoundedStretegyV2", async () => {
    ({ boundedStrategy: boundedStrategyKey, collateralAccount } =
      await deriveAllBoundedStrategyKeysV2(
        program,
        serumMarket.baseMintAddress,
        {
          transferAmount,
          boundPriceNumerator,
          boundPriceDenominator,
          reclaimDate,
          reclaimAddress,
          depositAddress,
          orderSide,
          bound,
        }
      ));
    const reclaimTokenAccountBefore = await tokenProgram.account.account.fetch(
      reclaimAddress
    );
    const [leg1TradeDestinationAccount, _] = deriveTokenAccount(
      program,
      boundedStrategyKey,
      USDC_MINT
    );
    const initOpenBookRemainingAccounts = await OpenBookDex.initLegAccounts(
      program.programId,
      serumMarket,
      boundedStrategyKey,
      // Becuase this is the first leg, the Trade Source Account is still the collateralAccount
      collateralAccount,
      // Because this is a multi-leg route, with a following leg, the Trade Destination Account is a derived intermediary account
      leg1TradeDestinationAccount,
      USDC_MINT
    );
    const raydiumInitAccounts = Raydium.initLegAccounts(
      coinMint,
      6,
      USDC_MINT,
      6,
      coinUsdcSerumMarket,
      boundedStrategyKey,
      // Because this is the second leg, the Trade Source Account must use the leg 1 Trade Destination Account
      leg1TradeDestinationAccount,
      // Because this is the last leg, the Trade Destination Account is the deposit address
      depositAddress,
      coinMint
    );
    const remainingAccounts = [
      ...initOpenBookRemainingAccounts,
      ...raydiumInitAccounts,
    ];
    const additionalData = new BN(
      // @ts-ignore
      serumMarket._baseSplTokenDecimals
    ).toArrayLike(Buffer, "le", 1);
    const initialTx = new web3.Transaction();
    // Create ALT
    const slot = await program.provider.connection.getSlot();
    const [lookupTableInst, lookupTableAddress] =
      web3.AddressLookupTableProgram.createLookupTable({
        authority: payerKey,
        payer: payerKey,
        recentSlot: slot,
      });
    initialTx.add(lookupTableInst);
    // extend ALT with chunk of accounts
    const extendInstruction = web3.AddressLookupTableProgram.extendLookupTable({
      payer: payerKey,
      authority: payerKey,
      lookupTable: lookupTableAddress,
      addresses: remainingAccounts.map((x) => x.pubkey).slice(0, 20),
    });
    initialTx.add(extendInstruction);
    await program.provider.sendAndConfirm(initialTx, [], {
      skipPreflight: true,
    });

    // extend ALT with
    const secondExtendTx = new web3.Transaction();
    const extendInstruction2 = web3.AddressLookupTableProgram.extendLookupTable(
      {
        payer: payerKey,
        authority: payerKey,
        lookupTable: lookupTableAddress,
        addresses: remainingAccounts.map((x) => x.pubkey).slice(20),
      }
    );
    secondExtendTx.add(extendInstruction2);
    await program.provider.sendAndConfirm(secondExtendTx);

    const instruction = await program.methods
      .initBoundedStrategyV2(
        transferAmount,
        boundPriceNumerator,
        boundPriceDenominator,
        reclaimDate,
        orderSide,
        bound,
        additionalData
      )
      .accounts({
        payer: program.provider.publicKey,
        collateralAccount,
        mint: serumMarket.baseMintAddress,
        strategy: boundedStrategyKey,
        reclaimAccount: reclaimAddress,
        depositAccount: depositAddress,
        lookupTable: lookupTableAddress,
        tokenProgram: SPL_TOKEN_PROGRAM_ID,
        systemProgram: web3.SystemProgram.programId,
        rent: web3.SYSVAR_RENT_PUBKEY,
      })
      .remainingAccounts(remainingAccounts)
      .instruction();
    const instructions = [instruction];
    let blockhash = await program.provider.connection
      .getLatestBlockhash()
      .then((res) => res.blockhash);
    const lookupTableAccount = await program.provider.connection
      // @ts-ignore: This is actually on the object, the IDE is wrong
      .getAddressLookupTable(lookupTableAddress)
      .then((res) => res.value);
    // Wait until the current slot is greater than the last extended slot
    let currentSlot = lookupTableAccount.state.lastExtendedSlot as number;
    while (currentSlot <= lookupTableAccount.state.lastExtendedSlot) {
      currentSlot = await program.provider.connection.getSlot();
      await wait(250);
    }
    const messageV0 = new web3.TransactionMessage({
      payerKey: payerKey,
      recentBlockhash: blockhash,
      instructions,
    }).compileToV0Message([lookupTableAccount]);
    const transaction = new web3.VersionedTransaction(messageV0);
    try {
      // Create an versioned transaction and send with the ALT
      transaction.sign([payerKeypair]);
      const txid = await web3.sendAndConfirmRawTransaction(
        program.provider.connection,
        Buffer.from(transaction.serialize()),
        {
          skipPreflight: true,
        }
      );
    } catch (error) {
      console.error(error);
      const parsedError = parseTranactionError(error);
      console.log("error: ", parsedError.msg);
      assert.ok(false);
    }

    const boundedStrategy = await program.account.boundedStrategyV2.fetch(
      boundedStrategyKey
    );

    // Test that the information was stored on the BoundedStrategyV2 account
    assert.equal(
      boundedStrategy.collateralAccount.toString(),
      collateralAccount.toString()
    );
    assert.equal(
      boundedStrategy.collateralMint.toString(),
      serumMarket.baseMintAddress.toString()
    );
    assert.equal(
      boundedStrategy.boundedPriceNumerator.toString(),
      boundPriceNumerator.toString()
    );
    assert.equal(
      boundedStrategy.boundedPriceDenominator.toString(),
      boundPriceDenominator.toString()
    );
    assert.equal(
      boundedStrategy.reclaimDate.toString(),
      reclaimDate.toString()
    );
    assert.equal(
      boundedStrategy.reclaimAddress.toString(),
      reclaimAddress.toString()
    );
    assert.equal(
      boundedStrategy.depositAddress.toString(),
      depositAddress.toString()
    );
    assert.equal(boundedStrategy.orderSide, orderSide);
    assert.equal(boundedStrategy.bound, bound);
    assert.equal(
      boundedStrategy.lookupTable.toString(),
      lookupTableAddress.toString()
    );
    // check additional accounts array
    boundedStrategy.accountList.forEach((key, index) => {
      const expectedKey = remainingAccounts[index];
      if (expectedKey) {
        assert.ok(key.equals(expectedKey.pubkey));
      } else {
        assert.ok(key.equals(web3.SystemProgram.programId));
      }
    });

    // check additional data
    boundedStrategy.additionalData.forEach((byte, index) => {
      const expectedByte = additionalData[index];
      if (expectedByte) {
        assert.equal(byte, expectedByte);
      } else {
        assert.equal(byte, 0);
      }
    });

    // Check that the assets were transfered from the reclaimAddress to the orderPayer
    const reclaimTokenAccountAfter = await tokenProgram.account.account.fetch(
      reclaimAddress
    );
    const reclaimTokenDiff = reclaimTokenAccountAfter.amount.sub(
      reclaimTokenAccountBefore.amount
    );
    assert.equal(reclaimTokenDiff.toString(), transferAmount.neg().toString());

    const collateralTokenAccountAfter =
      await tokenProgram.account.account.fetch(collateralAccount);
    assert.equal(
      collateralTokenAccountAfter.amount.toString(),
      transferAmount.toString()
    );
  });
  // TODO: Test the execution of a BoundedTradeV2
  describe("Execution price is lower than the bounded price", () => {
    it("should execute the trade", async () => {
      const boundedStrategy = await program.account.boundedStrategyV2.fetch(
        boundedStrategyKey
      );
      const depositTokenAccountBefore =
        await tokenProgram.account.account.fetch(
          boundedStrategy.depositAddress
        );
      ////////////////// Get the reamining accounts ////////////
      const [leg1TradeDestinationAccount, _] = deriveTokenAccount(
        program,
        boundedStrategyKey,
        USDC_MINT
      );
      const openBookRemainingAccounts = await OpenBookDex.tradeAccounts(
        program.programId,
        serumMarket,
        boundedStrategyKey,
        // Becuase this is the first leg, the Trade Source Account is still the collateralAccount
        collateralAccount,
        // Because this is a multi-leg route, with a following leg, the Trade Destination Account is a derived intermediary account
        leg1TradeDestinationAccount,
        USDC_MINT
      );
      const raydiumRemainingAccounts = Raydium.tradeAccounts(
        coinMint,
        6,
        USDC_MINT,
        6,
        coinUsdcSerumMarket,
        boundedStrategyKey,
        // Because this is the second leg, the Trade Source Account must use the leg 1 Trade Destination Account
        leg1TradeDestinationAccount,
        // Because this is the last leg, the Trade Destination Account is the deposit address
        depositAddress,
        coinMint
      );
      const remainingAccounts = [
        ...openBookRemainingAccounts,
        ...raydiumRemainingAccounts,
      ];
      ////////////////////// Get the LUT info ///////////////
      const lookupTableAccount = await program.provider.connection
        // @ts-ignore: This is actually on the object, the IDE is wrong
        .getAddressLookupTable(boundedStrategy.lookupTable)
        .then((res) => res.value);
      const blockhash = await program.provider.connection
        .getLatestBlockhash()
        .then((res) => res.blockhash);
      // Create and send the BoundedTradeV2 transaction
      const ix = await program.methods
        .boundedTradeV2()
        .accounts({
          payer: program.provider.publicKey,
          strategy: boundedStrategyKey,
          orderPayer: boundedStrategy.collateralAccount,
          depositAccount: boundedStrategy.depositAddress,
        })
        .remainingAccounts(remainingAccounts)
        .instruction();

      const messageV0 = new web3.TransactionMessage({
        payerKey: payerKey,
        recentBlockhash: blockhash,
        instructions: [ix],
      }).compileToV0Message([lookupTableAccount]);
      const transaction = new web3.VersionedTransaction(messageV0);
      try {
        // Create an versioned transaction and send with the ALT
        transaction.sign([payerKeypair]);
        const txid = await web3.sendAndConfirmRawTransaction(
          program.provider.connection,
          Buffer.from(transaction.serialize()),
          {
            skipPreflight: true,
          }
        );
      } catch (error) {
        console.error(error);
        assert.ok(false);
      }

      // Validate that the deposit received the amount of SOL
      const depositTokenAccountAfter = await tokenProgram.account.account.fetch(
        boundedStrategy.depositAddress
      );
      const depositTokenDiff = depositTokenAccountAfter.amount.sub(
        depositTokenAccountBefore.amount
      );
      assert.equal(depositTokenDiff.toString(), "0");
    });
  });
});
