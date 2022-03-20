import * as anchor from "@project-serum/anchor";
import { BN, Program, web3 } from "@project-serum/anchor";
import { Market, OpenOrders } from "@project-serum/serum";
import { assert } from "chai";
import { parseTranactionError } from "../packages/serum-remote/src";
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

  let boundPrice = new anchor.BN(957);
  let reclaimDate = new anchor.BN(new Date().getTime() / 1_000 + 3600);
  let reclaimAddress: web3.PublicKey;
  let depositAccount: web3.PublicKey;
  let orderSide = 1;
  let bound = 1;
  let serumMarket: Market;
  let highestBid: BN;
  let lowestAsk: BN;
  let boundedStrategy: web3.PublicKey,
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
    highestBid = bids.getL2(1)[0][2];
    lowestAsk = asks.getL2(1)[0][2];

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
    depositAccount = baseAta;
    const createAtaTx = new web3.Transaction()
      .add(instruction)
      .add(baseMintAtaIx);
    try {
      await program.provider.send(createAtaTx);
    } catch (err) {}
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
        beforeEach(() => {
          boundPrice = lowestAsk.addn(10);
        });
        it("should execute the trade", () => {
          // TODO: Write some tests
          assert.ok(true);
        });
      });

      describe("Bounded price is lower than lowest ask", () => {
        beforeEach(() => {
          boundPrice = lowestAsk.subn(10);
        });
        it("should error from bound validation", () => {
          // TODO: Write the test
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
//   initializeBoundedStrategy(
//     program,
//     DEX_ID,
//     SOL_USDC_SERUM_MARKET,
//     USDC_MINT,
//     { boundPrice, reclaimDate, reclaimAddress, orderSide, bound }
//   );
//   ({ boundedStrategy, authority, orderPayer } =
//     await deriveAllBoundedStrategyKeys(
//       program,
//       SOL_USDC_SERUM_MARKET,
//       USDC_MINT,
//       {
//         boundPrice,
//         reclaimDate,
//         reclaimAddress,
//         orderSide,
//         bound,
//       }
//     ));
// });
