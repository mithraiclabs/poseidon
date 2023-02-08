import * as anchor from "@project-serum/anchor";
import { BN, Program, web3 } from "@project-serum/anchor";
import { splTokenProgram, SPL_TOKEN_PROGRAM_ID } from "@coral-xyz/spl-token";
import { Market, DexInstructions } from "@project-serum/serum";
import { assert } from "chai";
import {
  BoundedStrategy,
  parseTranactionError,
} from "../packages/serum-remote/src";
import { boundedTradeIx } from "../packages/serum-remote/src/instructions/boundedTrade";
import { initializeBoundedStrategy } from "../packages/serum-remote/src/instructions/initBoundedStrategy";
import { srSettleFundsIx } from "../packages/serum-remote/src/instructions/srSettleFunds";
import { deriveAllBoundedStrategyKeys } from "../packages/serum-remote/src/pdas";
import { SerumRemote } from "../target/types/serum_remote";
import {
  createAssociatedTokenInstruction,
  DEX_ID,
  SOL_USDC_SERUM_MARKET,
  USDC_MINT,
} from "./utils";

let openOrdersAccount: web3.PublicKey;

/**
 * SerumMarket is in the current state Bids and Asks
 * [ [ 92.687, 300, <BN: 16a0f>, <BN: bb8> ] ] [ [ 92.75, 191.5, <BN: 16a4e>, <BN: 77b> ] ]
 */

describe("BoundedTrade", () => {
  // Configure the client to use the local cluster.
  const program = anchor.workspace.SerumRemote as Program<SerumRemote>;

  const payerKey = program.provider.publicKey;
  const tokenProgram = splTokenProgram({ programId: SPL_TOKEN_PROGRAM_ID });

  let boundPrice = new anchor.BN(957);
  let reclaimDate = new anchor.BN(new Date().getTime() / 1_000 + 3600);
  let quoteAddress: web3.PublicKey;
  let baseAddress: web3.PublicKey;
  let orderSide = 1;
  let bound = 1;
  let serumMarket: Market;
  let highestBid: [number, number, anchor.BN, anchor.BN];
  let lowestAsk: [number, number, anchor.BN, anchor.BN];
  let quoteTransferAmount = new BN(10_000_000);
  let baseTransferAmount = new BN(10_000_000_000);
  let boundedStrategy: BoundedStrategy;
  let serumReferralKey: web3.PublicKey;
  let nonce = 1;
  let boundedStrategyKey: web3.PublicKey,
    authority: web3.PublicKey,
    orderPayer: web3.PublicKey;

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
    serumReferralKey = referralAta;
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
          boundPrice = lowestAsk[2].addn(10);
          const boundedParams = {
            boundPrice,
            reclaimDate: new anchor.BN(
              new Date().getTime() / 1_000 + 3600 + nonce
            ),
            reclaimAddress: quoteAddress,
            depositAddress: baseAddress,
            orderSide,
            bound,
            transferAmount: quoteTransferAmount,
          };
          await initializeBoundedStrategy(
            program,
            DEX_ID,
            serumMarket.address,
            serumMarket.quoteMintAddress,
            boundedParams
          );
          ({
            boundedStrategy: boundedStrategyKey,
            authority,
            orderPayer,
          } = await deriveAllBoundedStrategyKeys(
            program,
            serumMarket.address,
            serumMarket.quoteMintAddress,
            boundedParams
          ));
          boundedStrategy = await program.account.boundedStrategy.fetch(
            boundedStrategyKey
          );
        });
        it("should execute the trade", async () => {
          const depositTokenAccountBefore =
            await tokenProgram.account.account.fetch(baseAddress);
          // Create and send the BoundedTrade transaction
          const ix = await boundedTradeIx(
            program,
            boundedStrategyKey,
            serumMarket,
            boundedStrategy
          );
          const transaction = new web3.Transaction().add(ix);
          try {
            await program.provider.sendAndConfirm(transaction);
          } catch (error) {
            const parsedError = parseTranactionError(error);
            assert.ok(false);
          }
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
        it("The referral account should receive a commission", async () => {
          const referralAccountBefore =
            await tokenProgram.account.account.fetch(serumReferralKey);
          // Create and send the BoundedTrade transaction
          const ix = await boundedTradeIx(
            program,
            boundedStrategyKey,
            serumMarket,
            boundedStrategy,
            serumReferralKey
          );
          const consumeEventsIx = DexInstructions.consumeEvents({
            market: serumMarket.address,
            eventQueue: serumMarket.decoded.eventQueue,
            coinFee: baseAddress,
            pcFee: serumReferralKey,
            openOrdersAccounts: [boundedStrategy.openOrders],
            limit: 10,
            programId: DEX_ID,
          });
          const settleIx = await srSettleFundsIx(
            program,
            boundedStrategyKey,
            serumMarket,
            boundedStrategy,
            serumReferralKey
          );
          const transaction = new web3.Transaction()
            .add(ix)
            .add(consumeEventsIx)
            .add(settleIx);
          try {
            await program.provider.sendAndConfirm(transaction);
          } catch (error) {
            const parsedError = parseTranactionError(error);
            assert.ok(false);
          }
          const referralAccountAfter = await tokenProgram.account.account.fetch(
            serumReferralKey
          );

          const referralAmtDiff = referralAccountAfter.amount.sub(
            referralAccountBefore.amount
          );
          // add the test for the referral account.
          assert.ok(referralAmtDiff.toNumber() > 0);
        });
      });

      describe("Bounded price is lower than lowest ask", () => {
        beforeEach(async () => {
          boundPrice = lowestAsk[2].subn(10);
          const boundedParams = {
            boundPrice,
            reclaimDate,
            reclaimAddress: quoteAddress,
            depositAddress: baseAddress,
            orderSide,
            bound,
            transferAmount: quoteTransferAmount,
          };
          await initializeBoundedStrategy(
            program,
            DEX_ID,
            serumMarket.address,
            serumMarket.quoteMintAddress,
            boundedParams
          );
          ({
            boundedStrategy: boundedStrategyKey,
            authority,
            orderPayer,
          } = await deriveAllBoundedStrategyKeys(
            program,
            serumMarket.address,
            serumMarket.quoteMintAddress,
            boundedParams
          ));
          boundedStrategy = await program.account.boundedStrategy.fetch(
            boundedStrategyKey
          );
        });
        it("should error from bound validation", async () => {
          const ix = await boundedTradeIx(
            program,
            boundedStrategyKey,
            serumMarket,
            boundedStrategy
          );
          const transaction = new web3.Transaction().add(ix);
          try {
            await program.provider.sendAndConfirm(transaction);
            assert.ok(false);
          } catch (error) {
            const parsedError = parseTranactionError(error);
            assert.equal(parsedError.msg, "Market price is out of bounds");
          }
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
          boundPrice = highestBid[2].addn(10);
          const boundedParams = {
            boundPrice,
            reclaimDate,
            reclaimAddress: baseAddress,
            depositAddress: quoteAddress,
            orderSide,
            bound,
            transferAmount: quoteTransferAmount,
          };
          await initializeBoundedStrategy(
            program,
            DEX_ID,
            serumMarket.address,
            serumMarket.baseMintAddress,
            boundedParams
          );
          ({
            boundedStrategy: boundedStrategyKey,
            authority,
            orderPayer,
          } = await deriveAllBoundedStrategyKeys(
            program,
            serumMarket.address,
            serumMarket.baseMintAddress,
            boundedParams
          ));
          boundedStrategy = await program.account.boundedStrategy.fetch(
            boundedStrategyKey
          );
        });
        it("should error", async () => {
          const ix = await boundedTradeIx(
            program,
            boundedStrategyKey,
            serumMarket,
            boundedStrategy
          );
          const transaction = new web3.Transaction().add(ix);
          try {
            await program.provider.sendAndConfirm(transaction);
            assert.ok(false);
          } catch (error) {
            const parsedError = parseTranactionError(error);
            assert.equal(parsedError.msg, "Market price is out of bounds");
          }
          assert.ok(true);
        });
      });

      describe("Bounded price is lower than highest bid", () => {
        beforeEach(async () => {
          boundPrice = highestBid[2].subn(10);
          const boundedParams = {
            boundPrice,
            reclaimDate,
            reclaimAddress: baseAddress,
            depositAddress: quoteAddress,
            orderSide,
            bound,
            transferAmount: baseTransferAmount,
          };
          await initializeBoundedStrategy(
            program,
            DEX_ID,
            serumMarket.address,
            serumMarket.baseMintAddress,
            boundedParams
          );
          ({
            boundedStrategy: boundedStrategyKey,
            authority,
            orderPayer,
          } = await deriveAllBoundedStrategyKeys(
            program,
            serumMarket.address,
            serumMarket.baseMintAddress,
            boundedParams
          ));
          boundedStrategy = await program.account.boundedStrategy.fetch(
            boundedStrategyKey
          );
        });
        it("should execute the trade and settle the assets", async () => {
          const depositTokenAccountBefore =
            await tokenProgram.account.account.fetch(quoteAddress);
          // Create and send the BoundedTrade transaction
          const ix = await boundedTradeIx(
            program,
            boundedStrategyKey,
            serumMarket,
            boundedStrategy
          );
          const transaction = new web3.Transaction().add(ix);
          try {
            await program.provider.sendAndConfirm(transaction);
          } catch (error) {
            const parsedError = parseTranactionError(error);
            assert.ok(false);
          }
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
