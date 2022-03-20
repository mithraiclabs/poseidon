import * as anchor from "@project-serum/anchor";
import { Spl } from "@project-serum/anchor";
import { Program, web3 } from "@project-serum/anchor";
import { Market, OpenOrders } from "@project-serum/serum";
import { Token, TOKEN_PROGRAM_ID, u64 } from "@solana/spl-token";
import { assert } from "chai";
import { parseTranactionError } from "../packages/serum-remote/src";
import { initBoundedStrategyIx } from "../packages/serum-remote/src/instructions/initBoundedStrategy";
import { deriveAllBoundedStrategyKeys } from "../packages/serum-remote/src/pdas";
import { SerumRemote } from "../target/types/serum_remote";
import {
  createAssociatedTokenInstruction,
  DEX_ID,
  initNewTokenMintInstructions,
  SOL_USDC_SERUM_MARKET,
  USDC_MINT,
} from "./utils";

let openOrdersAccount: web3.PublicKey;

/**
 * SerumMarket is in the current state Bids and Asks
 * [ [ 92.687, 300, <BN: 16a0f>, <BN: bb8> ] ] [ [ 92.75, 191.5, <BN: 16a4e>, <BN: 77b> ] ]
 */

describe("InitBoundedStrategy", () => {
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
  let transferAmount = new u64(10_000_000);

  before(async () => {
    const serumMarket = await Market.load(
      program.provider.connection,
      SOL_USDC_SERUM_MARKET,
      {},
      DEX_ID
    );
    const transaction = new web3.Transaction();

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
  beforeEach(async () => {
    boundPrice = new anchor.BN(957);
    reclaimDate = new anchor.BN(new Date().getTime() / 1_000 + 3600);
    orderSide = 1;
    bound = 1;
    const openOrdersKey = new web3.Keypair();
    const ix = await OpenOrders.makeCreateAccountTransaction(
      program.provider.connection,
      // This argument is pointless
      web3.SystemProgram.programId,
      // This argument is the payer for the rent
      program.provider.wallet.publicKey,
      openOrdersKey.publicKey,
      DEX_ID
    );
    openOrdersAccount = openOrdersKey.publicKey;
    const transaction = new web3.Transaction().add(ix);
    await program.provider.send(transaction, [openOrdersKey]);
  });

  // Test the BoundedStrategy account is created with the right info
  it("Should store all the information for a BoundedStretegy", async () => {
    const {
      boundedStrategy: boundedStrategyKey,
      authority,
      orderPayer,
    } = await deriveAllBoundedStrategyKeys(
      program,
      SOL_USDC_SERUM_MARKET,
      USDC_MINT,
      {
        transferAmount,
        boundPrice,
        reclaimDate,
        reclaimAddress,
        depositAddress,
        orderSide,
        bound,
      }
    );
    const reclaimTokenAccountBefore = await splTokenProgram.account.token.fetch(
      reclaimAddress
    );

    const ix = await initBoundedStrategyIx(
      program,
      DEX_ID,
      SOL_USDC_SERUM_MARKET,
      USDC_MINT,
      openOrdersAccount,
      {
        transferAmount,
        boundPrice,
        reclaimDate,
        reclaimAddress,
        depositAddress,
        orderSide,
        bound,
      }
    );
    const transaction = new web3.Transaction().add(ix);
    try {
      await program.provider.send(transaction);
    } catch (error) {
      const parsedError = parseTranactionError(error);
      console.log("error: ", parsedError.msg);
      assert.ok(false);
    }

    const boundedStrategy = await program.account.boundedStrategy.fetch(
      boundedStrategyKey
    );

    // Test that the information was stored on the BoundedStrategy account

    assert.equal(
      boundedStrategy.seurmMarket.toString(),
      SOL_USDC_SERUM_MARKET.toString()
    );
    assert.equal(boundedStrategy.authority.toString(), authority.toString());
    assert.equal(boundedStrategy.orderPayer.toString(), orderPayer.toString());
    assert.equal(
      boundedStrategy.boundedPrice.toString(),
      boundPrice.toString()
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
    // Check the OpenOrders address
    assert.equal(
      boundedStrategy.openOrders.toString(),
      openOrdersAccount.toString()
    );

    const openOrders = await OpenOrders.load(
      program.provider.connection,
      openOrdersAccount,
      DEX_ID
    );
    assert.ok(openOrders);

    // TODO: Check that the assets were transfered from the reclaimAddress to the orderPayer
    const reclaimTokenAccountAfter = await splTokenProgram.account.token.fetch(
      reclaimAddress
    );
    const reclaimTokenDiff = reclaimTokenAccountAfter.amount.sub(
      reclaimTokenAccountBefore.amount
    );
    assert.equal(reclaimTokenDiff.toString(), transferAmount.neg().toString());

    const orderPayerTokenAccountAfter =
      await splTokenProgram.account.token.fetch(orderPayer);
    const orderPayerTokenDiff = orderPayerTokenAccountAfter.amount;
    assert.equal(orderPayerTokenDiff.toString(), transferAmount.toString());
  });

  // Test reclaim date is in the future
  describe("reclaimDate is in the past", () => {
    beforeEach(() => {
      reclaimDate = new anchor.BN(new Date().getTime() / 1_000 - 3600);
    });
    it("should error", async () => {
      const ix = await initBoundedStrategyIx(
        program,
        DEX_ID,
        SOL_USDC_SERUM_MARKET,
        USDC_MINT,
        openOrdersAccount,
        {
          transferAmount,
          boundPrice,
          reclaimDate,
          reclaimAddress,
          depositAddress,
          orderSide,
          bound,
        }
      );
      const transaction = new web3.Transaction().add(ix);
      try {
        await program.provider.send(transaction);
        assert.ok(false);
      } catch (error) {
        const parsedError = parseTranactionError(error);
        assert.equal(parsedError.msg, "Reclaim date must be in the future");
        assert.ok(true);
      }
    });
  });

  describe("bound price is 0", () => {
    beforeEach(() => {
      boundPrice = new anchor.BN(0);
    });
    it("should error", async () => {
      const ix = await initBoundedStrategyIx(
        program,
        DEX_ID,
        SOL_USDC_SERUM_MARKET,
        USDC_MINT,
        openOrdersAccount,
        {
          transferAmount,
          boundPrice,
          reclaimDate,
          reclaimAddress,
          depositAddress,
          orderSide,
          bound,
        }
      );
      const transaction = new web3.Transaction().add(ix);
      try {
        await program.provider.send(transaction);
        assert.ok(false);
      } catch (error) {
        const parsedError = parseTranactionError(error);
        assert.equal(parsedError.msg, "Bound price must be greater than 0");
        assert.ok(true);
      }
    });
  });

  describe("order side is not 0 or 1", () => {
    beforeEach(() => {
      orderSide = 2;
    });
    it("should error", async () => {
      const ix = await initBoundedStrategyIx(
        program,
        DEX_ID,
        SOL_USDC_SERUM_MARKET,
        USDC_MINT,
        openOrdersAccount,
        {
          transferAmount,
          boundPrice,
          reclaimDate,
          reclaimAddress,
          depositAddress,
          orderSide,
          bound,
        }
      );
      const transaction = new web3.Transaction().add(ix);
      try {
        await program.provider.send(transaction);
        assert.ok(false);
      } catch (error) {
        const parsedError = parseTranactionError(error);
        assert.equal(parsedError.msg, "Order side must be 0 or 1");
        assert.ok(true);
      }
    });
  });
  describe("Bound is not 0 or 1", () => {
    beforeEach(() => {
      bound = 2;
    });
    it("should error", async () => {
      const ix = await initBoundedStrategyIx(
        program,
        DEX_ID,
        SOL_USDC_SERUM_MARKET,
        USDC_MINT,
        openOrdersAccount,
        {
          transferAmount,
          boundPrice,
          reclaimDate,
          reclaimAddress,
          depositAddress,
          orderSide,
          bound,
        }
      );
      const transaction = new web3.Transaction().add(ix);
      try {
        await program.provider.send(transaction);
        assert.ok(false);
      } catch (error) {
        const parsedError = parseTranactionError(error);
        assert.equal(parsedError.msg, "Bound must be 0 or 1");
        assert.ok(true);
      }
    });
  });
});
