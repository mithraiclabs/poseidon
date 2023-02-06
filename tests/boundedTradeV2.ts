import * as anchor from "@project-serum/anchor";
import { BN, Program, web3 } from "@project-serum/anchor";
import { splTokenProgram, SPL_TOKEN_PROGRAM_ID } from "@coral-xyz/spl-token";
import { Market } from "@project-serum/serum";
import { assert } from "chai";
import {
  BoundedStrategyV2,
  parseTranactionError,
} from "../packages/serum-remote/src";
import { deriveAllBoundedStrategyKeysV2 } from "../packages/serum-remote/src/pdas";
import { SerumRemote } from "../target/types/serum_remote";
import {
  compileAndSendV0Tx,
  createAssociatedTokenInstruction,
  createLookUpTable,
  DEX_ID,
  loadPayer,
  SOL_USDC_SERUM_MARKET,
  USDC_MINT,
} from "./utils";
import OpenBookDex from "../packages/serum-remote/src/dexes/openBookDex";
import { WRAPPED_SOL_MINT } from "@project-serum/serum/lib/token-instructions";

/**
 * SerumMarket is in the current state Bids and Asks
 * [23.709,29.329,"5c9d","7291"] [23.727,204.945,"5caf","032091"]
 */

describe("BoundedTradeV2", () => {
  // Configure the client to use the local cluster.
  const program = anchor.workspace.SerumRemote as Program<SerumRemote>;

  const payerKey = program.provider.publicKey;
  const payerKeypair = loadPayer(process.env.ANCHOR_WALLET);

  const tokenProgram = splTokenProgram({ programId: SPL_TOKEN_PROGRAM_ID });

  let quoteAddress: web3.PublicKey;
  let baseAddress: web3.PublicKey;
  let orderSide = 1;
  let bound = 1;
  let serumMarket: Market;
  let highestBid: [number, number, anchor.BN, anchor.BN];
  let lowestAsk: [number, number, anchor.BN, anchor.BN];
  let quoteTransferAmount = new BN(10_000_000);
  let baseTransferAmount = new BN(10_000_000_000);
  let boundedStrategy: BoundedStrategyV2;
  let nonce = 1;
  let boundedStrategyKey: web3.PublicKey;
  let initBoundedStrategy: (
    nonce: number,
    boundedPriceNumerator: BN,
    boundedPriceDenominator: BN,
    depositAddress: web3.PublicKey,
    reclaimAddress: web3.PublicKey,
    collateralMint: web3.PublicKey,
    destinationMint: web3.PublicKey,
    transferAmount: BN
  ) => Promise<{
    boundedStrategyKey: web3.PublicKey;
  }>;

  before(async () => {
    // Load the market
    serumMarket = await Market.load(
      program.provider.connection,
      SOL_USDC_SERUM_MARKET,
      {},
      DEX_ID
    );
    const [bids, asks] = await Promise.all([
      serumMarket.loadBids(program.provider.connection),
      serumMarket.loadAsks(program.provider.connection),
    ]);
    highestBid = bids.getL2(1)[0];
    lowestAsk = asks.getL2(1)[0];

    const referralOwner = new web3.Keypair();
    // This TX may fail with concurrent tests
    // TODO: Write more elegant solution
    const { instruction, associatedAddress } =
      await createAssociatedTokenInstruction(program.provider, USDC_MINT);
    quoteAddress = associatedAddress;
    const { instruction: baseMintAtaIx, associatedAddress: baseAta } =
      await createAssociatedTokenInstruction(
        program.provider,
        serumMarket.baseMintAddress
      );
    baseAddress = baseAta;
    const { instruction: createReferralIx, associatedAddress: referralAta } =
      await createAssociatedTokenInstruction(
        program.provider,
        USDC_MINT,
        referralOwner.publicKey
      );
    const createAtaTx = new web3.Transaction()
      .add(instruction)
      .add(baseMintAtaIx)
      .add(createReferralIx);
    try {
      await program.provider.sendAndConfirm(createAtaTx);
    } catch (err) {}

    await program.provider.connection.requestAirdrop(
      payerKey,
      baseTransferAmount.muln(10).toNumber()
    );

    const transaction = new web3.Transaction();
    const mintToInstruction = await tokenProgram.methods
      .mintTo(quoteTransferAmount.muln(10))
      .accounts({
        mint: USDC_MINT,
        account: associatedAddress,
        owner: payerKey,
      })
      .instruction();
    transaction.add(mintToInstruction);
    // Move SOL to wrapped SOL
    const transferBaseInstruction = web3.SystemProgram.transfer({
      fromPubkey: payerKey,
      toPubkey: baseAta,
      lamports: baseTransferAmount.muln(10).toNumber(),
    });
    transaction.add(transferBaseInstruction);
    // Sync the native account after the transfer
    const syncNativeIx = tokenProgram.instruction.syncNative({
      accounts: {
        account: baseAddress,
      },
    });
    transaction.add(syncNativeIx);
    await program.provider.sendAndConfirm(transaction);

    initBoundedStrategy = async (
      nonce: number,
      boundedPriceNumerator: BN,
      boundedPriceDenominator: BN,
      depositAddress: web3.PublicKey,
      reclaimAddress: web3.PublicKey,
      collateralMint: web3.PublicKey,
      destinationMint: web3.PublicKey,
      transferAmount: BN
    ) => {
      const reclaimDate = new anchor.BN(
        new Date().getTime() / 1_000 + 3600 + nonce
      );
      const { boundedStrategy: boundedStrategyKey, collateralAccount } =
        await deriveAllBoundedStrategyKeysV2(program, collateralMint, {
          transferAmount,
          boundPriceNumerator: boundedPriceNumerator,
          boundPriceDenominator: boundedPriceDenominator,
          reclaimDate,
          reclaimAddress,
          depositAddress,
          orderSide,
          bound,
        });
      const initAdditionalAccounts = await OpenBookDex.initLegAccounts(
        program.programId,
        serumMarket,
        boundedStrategyKey,
        collateralAccount,
        depositAddress,
        destinationMint
      );
      const additionalData = new BN(
        // @ts-ignore
        serumMarket._baseSplTokenDecimals
      ).toArrayLike(Buffer, "le", 1);
      const lookupTableAddress = await createLookUpTable(
        program.provider,
        initAdditionalAccounts
      );

      const instruction = await program.methods
        .initBoundedStrategyV2(
          transferAmount,
          boundedPriceNumerator,
          boundedPriceDenominator,
          reclaimDate,
          orderSide,
          bound,
          additionalData
        )
        .accounts({
          payer: program.provider.publicKey,
          collateralAccount,
          mint: collateralMint,
          lookupTable: lookupTableAddress,
          strategy: boundedStrategyKey,
          reclaimAccount: reclaimAddress,
          depositAccount: depositAddress,
          tokenProgram: SPL_TOKEN_PROGRAM_ID,
          systemProgram: web3.SystemProgram.programId,
          rent: web3.SYSVAR_RENT_PUBKEY,
        })
        .remainingAccounts(initAdditionalAccounts)
        .instruction();
      await compileAndSendV0Tx(
        program.provider,
        payerKeypair,
        lookupTableAddress,
        [instruction],
        (err) => {
          console.error(err);
          assert.ok(false);
        }
      );
      return {
        boundedStrategyKey,
      };
    };
  });
  beforeEach(() => {
    nonce += 1;
  });

  describe("Order side is Bid", () => {
    beforeEach(async () => {
      orderSide = 0;
    });
    describe("UpperBound", () => {
      beforeEach(() => {
        bound = 1;
      });
      describe("Bounded price is higher than lowest ask", () => {
        // This is a scenario where orders should execute
        beforeEach(async () => {
          const boundPriceNumerator = new anchor.BN(95_000_000);
          const boundPriceDenominator = new anchor.BN(1_000_000_000);
          ({ boundedStrategyKey } = await initBoundedStrategy(
            nonce,
            boundPriceNumerator,
            boundPriceDenominator,
            baseAddress,
            quoteAddress,
            serumMarket.quoteMintAddress,
            WRAPPED_SOL_MINT,
            quoteTransferAmount
          ));
          boundedStrategy = await program.account.boundedStrategyV2.fetch(
            boundedStrategyKey
          );
        });
        it("should execute the trade", async () => {
          const depositTokenAccountBefore =
            await tokenProgram.account.account.fetch(baseAddress);
          const remainingAccounts = await OpenBookDex.tradeAccounts(
            program.programId,
            serumMarket,
            boundedStrategyKey,
            boundedStrategy.collateralAccount,
            boundedStrategy.depositAddress,
            WRAPPED_SOL_MINT
          );
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
          await compileAndSendV0Tx(
            program.provider,
            payerKeypair,
            boundedStrategy.lookupTable,
            [ix],
            (err) => {
              assert.ok(false);
            }
          );
          // Calculate the maxmium amount of SOL that can be bought)
          const transferNum =
            quoteTransferAmount.toNumber() /
            // @ts-ignore
            serumMarket._quoteSplTokenMultiplier.toNumber();
          const maxPurchaseAmt = transferNum / lowestAsk[0];
          const maxPurcahseNative = new BN(
            Math.min(maxPurchaseAmt, lowestAsk[1]) *
              // @ts-ignore
              serumMarket._baseSplTokenMultiplier.toNumber()
          ) // The div and mul below are to chop off the precision that cannot trade with the market's lot size
            // @ts-ignore
            .div(serumMarket._decoded.baseLotSize)
            // @ts-ignore
            .mul(serumMarket._decoded.baseLotSize);

          // Validate that the deposit received the amount of SOL
          const depositTokenAccountAfter =
            await tokenProgram.account.account.fetch(baseAddress);
          const depositTokenDiff = depositTokenAccountAfter.amount.sub(
            depositTokenAccountBefore.amount
          );
          assert.equal(
            depositTokenDiff.toString(),
            maxPurcahseNative.toString()
          );
        });
      });

      describe("Bounded price is lower than lowest ask", () => {
        beforeEach(async () => {
          const boundPriceNumerator = new anchor.BN(20_000_000);
          const boundPriceDenominator = new anchor.BN(1_000_000_000);
          ({ boundedStrategyKey } = await initBoundedStrategy(
            nonce,
            boundPriceNumerator,
            boundPriceDenominator,
            baseAddress,
            quoteAddress,
            serumMarket.quoteMintAddress,
            WRAPPED_SOL_MINT,
            quoteTransferAmount
          ));
          boundedStrategy = await program.account.boundedStrategyV2.fetch(
            boundedStrategyKey
          );
        });
        it("should error from bound validation", async () => {
          const remainingAccounts = await OpenBookDex.tradeAccounts(
            program.programId,
            serumMarket,
            boundedStrategyKey,
            boundedStrategy.collateralAccount,
            boundedStrategy.depositAddress,
            WRAPPED_SOL_MINT
          );
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
          await compileAndSendV0Tx(
            program.provider,
            payerKeypair,
            boundedStrategy.lookupTable,
            [ix],
            (err) => {
              const parsedError = parseTranactionError(err);
              assert.equal(parsedError.msg, "Market price is out of bounds");
            }
          );
          assert.ok(true);
        });
      });
    });
    describe("LowerBound", () => {
      // LOWER BOUNDED BUYS WOULD BE STUPID AND SHOULDNT BE SUPPORTED
    });
  }); // End of UpperBound
  describe("Order side is Ask", () => {
    beforeEach(() => {
      orderSide = 1;
    });
    describe("UpperBound", () => {
      // UPPER BOUNDED SELLS WOULD BE STUPID AND SHOULDNT BE SUPPORTED
    });
    describe("LowerBound", () => {
      beforeEach(() => {
        bound = 0;
      });
      describe("Bounded price is higher than highest bid", () => {
        beforeEach(async () => {
          const boundPriceNumerator = new anchor.BN(1_000_000_000);
          const boundPriceDenominator = new anchor.BN(100_000_000);
          ({ boundedStrategyKey } = await initBoundedStrategy(
            nonce,
            boundPriceNumerator,
            boundPriceDenominator,
            quoteAddress,
            baseAddress,
            serumMarket.baseMintAddress,
            USDC_MINT,
            baseTransferAmount
          ));
          boundedStrategy = await program.account.boundedStrategyV2.fetch(
            boundedStrategyKey
          );
        });
        it("should error", async () => {
          const remainingAccounts = await OpenBookDex.tradeAccounts(
            program.programId,
            serumMarket,
            boundedStrategyKey,
            boundedStrategy.collateralAccount,
            boundedStrategy.depositAddress,
            USDC_MINT
          );
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
          await compileAndSendV0Tx(
            program.provider,
            payerKeypair,
            boundedStrategy.lookupTable,
            [ix],
            (err) => {
              const parsedError = parseTranactionError(err);
              assert.equal(parsedError.msg, "Market price is out of bounds");
            }
          );
          assert.ok(true);
        });
      });

      describe("Bounded price is lower than highest bid", () => {
        beforeEach(async () => {
          // Input 1 SOL and get at least 20 USDC for it
          const boundPriceNumerator = new anchor.BN(1_000_000_000);
          const boundPriceDenominator = new anchor.BN(20_000_000);

          ({ boundedStrategyKey } = await initBoundedStrategy(
            nonce,
            boundPriceNumerator,
            boundPriceDenominator,
            quoteAddress,
            baseAddress,
            serumMarket.baseMintAddress,
            USDC_MINT,
            baseTransferAmount
          ));
          boundedStrategy = await program.account.boundedStrategyV2.fetch(
            boundedStrategyKey
          );
        });
        it("should execute the trade and settle the assets", async () => {
          const depositTokenAccountBefore =
            await tokenProgram.account.account.fetch(quoteAddress);
          // Create and send the BoundedTrade transaction
          const remainingAccounts = await OpenBookDex.tradeAccounts(
            program.programId,
            serumMarket,
            boundedStrategyKey,
            boundedStrategy.collateralAccount,
            boundedStrategy.depositAddress,
            USDC_MINT
          );
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
          await compileAndSendV0Tx(
            program.provider,
            payerKeypair,
            boundedStrategy.lookupTable,
            [ix],
            (_) => {
              assert.ok(false);
            }
          );
          // Calculate the maxmium amount of SOL that can be sold
          const transferNum =
            baseTransferAmount.toNumber() /
            // @ts-ignore
            serumMarket._baseSplTokenMultiplier.toNumber();
          const maxSaleAmt = Math.min(transferNum, highestBid[1]);
          const maxSaleNative = new BN(
            Math.min(maxSaleAmt, highestBid[1]) *
              // @ts-ignore
              serumMarket._baseSplTokenMultiplier.toNumber()
          ) // The div and mul below are to chop off the precision that cannot trade with the market's lot size
            // @ts-ignore
            .div(serumMarket._decoded.baseLotSize)
            // @ts-ignore
            .mul(serumMarket._decoded.baseLotSize);
          // convert the native SOL sale amount to native USDC value
          const usdcBeforeFees = maxSaleNative
            .mul(highestBid[2])
            // @ts-ignore
            .div(serumMarket._quoteSplTokenMultiplier);
          // Subtract the Serum fees (hardcoded at 4bps for the base fee)
          const usdcReceived = usdcBeforeFees.sub(
            new BN(usdcBeforeFees.toNumber() * 0.0004)
          );

          // Validate that the deposit received the amount of USDC
          const depositTokenAccountAfter =
            await tokenProgram.account.account.fetch(quoteAddress);
          const depositTokenDiff = depositTokenAccountAfter.amount.sub(
            depositTokenAccountBefore.amount
          );
          assert.equal(depositTokenDiff.toString(), usdcReceived.toString());
        });
      });
    });
  }); // End of LowerBound
});
