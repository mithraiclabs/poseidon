import * as anchor from "@project-serum/anchor";
import { BN, Program, Spl, web3 } from "@project-serum/anchor";
import { Market, OpenOrders } from "@project-serum/serum";
import { Token, TOKEN_PROGRAM_ID, u64 } from "@solana/spl-token";
import { assert } from "chai";
import {
  BoundedStrategy,
  parseTranactionError,
} from "../packages/serum-remote/src";
import { boundedTradeIx } from "../packages/serum-remote/src/instructions/boundedTrade";
import {
  initBoundedStrategyIx,
  initializeBoundedStrategy,
} from "../packages/serum-remote/src/instructions/initBoundedStrategy";
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
  anchor.setProvider(anchor.Provider.env());
  const program = anchor.workspace.SerumRemote as Program<SerumRemote>;
  const splTokenProgram = Spl.token();

  let boundPrice = new anchor.BN(957);
  let reclaimDate = new anchor.BN(new Date().getTime() / 1_000 + 3600);
  let reclaimAddress: web3.PublicKey;
  let depositAddress: web3.PublicKey;
  let orderSide = 1;
  let bound = 1;
  let serumMarket: Market;
  let highestBid: [number, number, anchor.BN, anchor.BN];
  let lowestAsk: [number, number, anchor.BN, anchor.BN];
  let transferAmount = new u64(10_000_000);
  let boundedStrategy: BoundedStrategy;
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

    // This TX may fail with concurrent tests
    // TODO: Write more elegant solution
    const { instruction, associatedAddress } =
      await createAssociatedTokenInstruction(program.provider, USDC_MINT);
    reclaimAddress = associatedAddress;
    const { instruction: baseMintAtaIx, associatedAddress: baseAta } =
      await createAssociatedTokenInstruction(
        program.provider,
        serumMarket.baseMintAddress
      );
    depositAddress = baseAta;
    const createAtaTx = new web3.Transaction()
      .add(instruction)
      .add(baseMintAtaIx);
    try {
      await program.provider.send(createAtaTx);
    } catch (err) {}

    const transaction = new web3.Transaction();
    const mintToInstruction = Token.createMintToInstruction(
      TOKEN_PROGRAM_ID,
      USDC_MINT,
      associatedAddress,
      program.provider.wallet.publicKey,
      [],
      transferAmount.muln(10).toNumber()
    );
    transaction.add(mintToInstruction);
    await program.provider.send(transaction);
  });

  describe("UpperBound", () => {
    beforeEach(async () => {
      bound = 1;
    });
    describe("Order side is Bid", () => {
      beforeEach(() => {
        orderSide = 0;
      });
      describe("Bounded price is higher than lowest ask", () => {
        // This is a scenario where orders should execute
        beforeEach(async () => {
          boundPrice = lowestAsk[2].addn(10);
          const boundedParams = {
            boundPrice,
            reclaimDate,
            reclaimAddress,
            depositAddress,
            orderSide,
            bound,
            transferAmount,
          };
          await initializeBoundedStrategy(
            program,
            DEX_ID,
            SOL_USDC_SERUM_MARKET,
            USDC_MINT,
            boundedParams
          );
          ({
            boundedStrategy: boundedStrategyKey,
            authority,
            orderPayer,
          } = await deriveAllBoundedStrategyKeys(
            program,
            SOL_USDC_SERUM_MARKET,
            USDC_MINT,
            boundedParams
          ));
          boundedStrategy = await program.account.boundedStrategy.fetch(
            boundedStrategyKey
          );
        });
        it("should execute the trade", async () => {
          const depositTokenAccountBefore =
            await splTokenProgram.account.token.fetch(depositAddress);
          // Create and send the BoundedTrade transaction
          const ix = await boundedTradeIx(
            program,
            boundedStrategyKey,
            serumMarket,
            boundedStrategy
          );
          const transaction = new web3.Transaction().add(ix);
          try {
            await program.provider.send(transaction);
          } catch (error) {
            const parsedError = parseTranactionError(error);
            console.log("error: ", parsedError.msg);
            assert.ok(false);
          }
          // Calculate the maxmium amount of SOL that can be bought)
          const transferNum =
            transferAmount.toNumber() /
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
            await splTokenProgram.account.token.fetch(depositAddress);
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
          boundPrice = lowestAsk[2].subn(10);
          const boundedParams = {
            boundPrice,
            reclaimDate,
            reclaimAddress,
            depositAddress,
            orderSide,
            bound,
            transferAmount,
          };
          await initializeBoundedStrategy(
            program,
            DEX_ID,
            SOL_USDC_SERUM_MARKET,
            USDC_MINT,
            boundedParams
          );
          ({
            boundedStrategy: boundedStrategyKey,
            authority,
            orderPayer,
          } = await deriveAllBoundedStrategyKeys(
            program,
            SOL_USDC_SERUM_MARKET,
            USDC_MINT,
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
            await program.provider.send(transaction);
            assert.ok(false);
          } catch (error) {
            const parsedError = parseTranactionError(error);
            assert.equal(parsedError.msg, "Market price is out of bounds");
          }
          assert.ok(true);
        });
      });
    });
    describe("Order side is Ask", () => {
      beforeEach(() => {
        orderSide = 1;
      });
    });
  }); // End of UpperBound
  describe("LowerBound", () => {
    beforeEach(() => {
      bound = 0;
    });
    describe("Order side is Bid", () => {
      beforeEach(() => {
        orderSide = 0;
      });
    });
    describe("Order side is Ask", () => {
      beforeEach(() => {
        orderSide = 1;
      });
    });
  }); // End of LowerBound
});

// beforeEach(async () => {
//   bound = 1;
// initializeBoundedStrategy(
//   program,
//   DEX_ID,
//   SOL_USDC_SERUM_MARKET,
//   USDC_MINT,
//   { boundPrice, reclaimDate, reclaimAddress, orderSide, bound }
// );
// ({ boundedStrategy, authority, orderPayer } =
//   await deriveAllBoundedStrategyKeys(
//     program,
//     SOL_USDC_SERUM_MARKET,
//     USDC_MINT,
//     {
//       boundPrice,
//       reclaimDate,
//       reclaimAddress,
//       orderSide,
//       bound,
//     }
//   ));
// });
