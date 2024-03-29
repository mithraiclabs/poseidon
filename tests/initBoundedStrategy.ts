import * as anchor from "@coral-xyz/anchor";
import { splTokenProgram } from "@coral-xyz/spl-token";
import { BN } from "@coral-xyz/anchor";
import { Program, web3 } from "@coral-xyz/anchor";
import { Market, OpenOrders } from "@project-serum/serum";
import { WRAPPED_SOL_MINT } from "@project-serum/serum/lib/token-instructions";
import { assert } from "chai";
import { parseTranactionError } from "../packages/poseidon/src";
import { initBoundedStrategyIx } from "../packages/poseidon/src/instructions/initBoundedStrategy";
import { deriveAllBoundedStrategyKeys } from "../packages/poseidon/src/pdas";
import { Poseidon } from "../target/types/poseidon";
import {
  createAssociatedTokenInstruction,
  DEX_ID,
  SOL_USDC_SERUM_MARKET,
  USDC_MINT,
} from "./utils";

let timesRun = 0;
describe("InitBoundedStrategy", () => {
  // Configure the client to use the local cluster.
  const program = anchor.workspace.Poseidon as Program<Poseidon>;
  // @ts-ignore: TODO: Remove after anchor npm upgrade
  const payerKey = program.provider.wallet.publicKey;
  const tokenProgram = splTokenProgram();

  let boundPrice = new anchor.BN(957);
  let reclaimDate = new anchor.BN(new Date().getTime() / 1_000 + 3600);
  let reclaimAddress: web3.PublicKey;
  let depositAddress: web3.PublicKey;
  let orderSide = 0;
  let bound = 1;
  let transferAmount = new BN(10_000_000);
  let serumMarket: Market;

  before(async () => {
    const accountInfo = await program.provider.connection.getAccountInfo(
      SOL_USDC_SERUM_MARKET
    );
    serumMarket = await Market.load(
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
    await program.provider.sendAndConfirm(transaction);
  });
  beforeEach(async () => {
    // timesRun is used to generate unique seeds for the strategy, otherwise
    //  the tests can fail with accounts already in use.
    timesRun += 1;
    boundPrice = new anchor.BN(957);
    reclaimDate = new anchor.BN(new Date().getTime() / 1_000 + 3600 + timesRun);
    orderSide = 0;
    bound = 1;
    transferAmount = new BN(10_000_000);
  });

  // Test the BoundedStrategy account is created with the right info
  it("Should store all the information for a BoundedStretegy", async () => {
    const {
      boundedStrategy: boundedStrategyKey,
      authority,
      orderPayer,
      openOrders: openOrdersKey,
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
    const reclaimTokenAccountBefore = await tokenProgram.account.account.fetch(
      reclaimAddress
    );

    const instruction = await initBoundedStrategyIx(
      program,
      DEX_ID,
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
    const transaction = new web3.Transaction().add(instruction);
    try {
      await program.provider.sendAndConfirm(transaction);
    } catch (error) {
      const parsedError = parseTranactionError(error);
      assert.ok(false);
    }

    const boundedStrategy = await program.account.boundedStrategy.fetch(
      boundedStrategyKey
    );

    // Test that the information was stored on the BoundedStrategy account

    assert.equal(
      boundedStrategy.serumMarket.toString(),
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
    assert.equal(boundedStrategy.serumDexId.toString(), DEX_ID.toString());
    // Check the OpenOrders address
    assert.equal(
      boundedStrategy.openOrders.toString(),
      openOrdersKey.toString()
    );

    const openOrders = await OpenOrders.load(
      program.provider.connection,
      openOrdersKey,
      DEX_ID
    );
    assert.ok(openOrders);

    // Check that the assets were transfered from the reclaimAddress to the orderPayer
    const reclaimTokenAccountAfter = await tokenProgram.account.account.fetch(
      reclaimAddress
    );
    const reclaimTokenDiff = reclaimTokenAccountAfter.amount.sub(
      reclaimTokenAccountBefore.amount
    );
    assert.equal(reclaimTokenDiff.toString(), transferAmount.neg().toString());

    const orderPayerTokenAccountAfter =
      await tokenProgram.account.account.fetch(orderPayer);
    const orderPayerTokenDiff = orderPayerTokenAccountAfter.amount;
    assert.equal(orderPayerTokenDiff.toString(), transferAmount.toString());
  });

  describe("Deposit address owner differs from reclaim address owner", () => {
    let badDepositAddress: web3.PublicKey;
    before(async () => {
      const { instruction: baseMintAtaIx, associatedAddress: baseAta } =
        await createAssociatedTokenInstruction(
          program.provider,
          serumMarket.baseMintAddress,
          new web3.Keypair().publicKey
        );
      badDepositAddress = baseAta;
      const tx = new web3.Transaction().add(baseMintAtaIx);
      await program.provider.sendAndConfirm(tx);
    });
    it("should error", async () => {
      const instruction = await initBoundedStrategyIx(
        program,
        DEX_ID,
        SOL_USDC_SERUM_MARKET,
        USDC_MINT,
        {
          transferAmount,
          boundPrice,
          reclaimDate,
          reclaimAddress,
          depositAddress: badDepositAddress,
          orderSide,
          bound,
        }
      );
      const transaction = new web3.Transaction().add(instruction);
      try {
        await program.provider.sendAndConfirm(transaction);
        assert.ok(false);
      } catch (error) {
        const parsedError = parseTranactionError(error);
        assert.equal(
          parsedError.msg,
          "Deposit address must have same owner as reclaim address"
        );
        assert.ok(true);
      }
    });
  });

  // Test reclaim date is in the future
  describe("reclaimDate is in the past", () => {
    beforeEach(() => {
      reclaimDate = new anchor.BN(new Date().getTime() / 1_000 - 3600);
    });
    it("should error", async () => {
      const instruction = await initBoundedStrategyIx(
        program,
        DEX_ID,
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
      const transaction = new web3.Transaction().add(instruction);
      try {
        await program.provider.sendAndConfirm(transaction);
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
      const instruction = await initBoundedStrategyIx(
        program,
        DEX_ID,
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
      const transaction = new web3.Transaction().add(instruction);
      try {
        await program.provider.sendAndConfirm(transaction);
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
      const instruction = await initBoundedStrategyIx(
        program,
        DEX_ID,
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
      const transaction = new web3.Transaction().add(instruction);
      try {
        await program.provider.sendAndConfirm(transaction);
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
      const instruction = await initBoundedStrategyIx(
        program,
        DEX_ID,
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
      const transaction = new web3.Transaction().add(instruction);
      try {
        await program.provider.sendAndConfirm(transaction);
        assert.ok(false);
      } catch (error) {
        const parsedError = parseTranactionError(error);
        assert.equal(parsedError.msg, "Bound must be 0 or 1");
        assert.ok(true);
      }
    });
  });

  describe("Bounded strategy is Lower Bounded Bid", () => {
    beforeEach(() => {
      bound = 0;
      orderSide = 0;
    });
    it("should error", async () => {
      const instruction = await initBoundedStrategyIx(
        program,
        DEX_ID,
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
      const transaction = new web3.Transaction().add(instruction);
      try {
        await program.provider.sendAndConfirm(transaction);
        assert.ok(false);
      } catch (error) {
        const parsedError = parseTranactionError(error);
        assert.equal(parsedError.msg, "Lower bounded bids are blocked");
        assert.ok(true);
      }
    });
  });

  describe("Bounded strategy is Upper Bounded Ask", () => {
    beforeEach(() => {
      bound = 1;
      orderSide = 1;
    });
    it("should error", async () => {
      const instruction = await initBoundedStrategyIx(
        program,
        DEX_ID,
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
      const transaction = new web3.Transaction().add(instruction);
      try {
        await program.provider.sendAndConfirm(transaction);
        assert.ok(false);
      } catch (error) {
        const parsedError = parseTranactionError(error);
        assert.equal(parsedError.msg, "Upper bounded asks are blocked");
        assert.ok(true);
      }
    });
  });

  // Validate transfer amount > 0
  describe("Transfer Amount is 0", () => {
    beforeEach(() => {
      transferAmount = new BN(0);
    });
    it("should error", async () => {
      const instruction = await initBoundedStrategyIx(
        program,
        DEX_ID,
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
      const transaction = new web3.Transaction().add(instruction);
      try {
        await program.provider.sendAndConfirm(transaction);
        assert.ok(false);
      } catch (error) {
        const parsedError = parseTranactionError(error);
        assert.equal(parsedError.msg, "Transfer amount cannot be 0");
        assert.ok(true);
      }
    });
  });
  // Validate order side and mint match the Serum market information
  describe("Order Side is Bid but mint is the base currency", () => {
    beforeEach(() => {
      orderSide = 0;
    });
    it("should error", async () => {
      const instruction = await initBoundedStrategyIx(
        program,
        DEX_ID,
        SOL_USDC_SERUM_MARKET,
        WRAPPED_SOL_MINT,
        {
          transferAmount,
          boundPrice,
          reclaimDate,
          reclaimAddress: depositAddress,
          depositAddress: reclaimAddress,
          orderSide,
          bound,
        }
      );
      const transaction = new web3.Transaction().add(instruction);
      try {
        await program.provider.sendAndConfirm(transaction);
        assert.ok(false);
      } catch (error) {
        const parsedError = parseTranactionError(error);
        assert.equal(
          parsedError.msg,
          "Strategy requires the quote currency to place bids"
        );
        assert.ok(true);
      }
    });
  });
  describe("Order Side is Ask but mint is the quote currency", () => {
    beforeEach(() => {
      orderSide = 1;
      bound = 0;
    });
    it("should error", async () => {
      const instruction = await initBoundedStrategyIx(
        program,
        DEX_ID,
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
      const transaction = new web3.Transaction().add(instruction);
      try {
        await program.provider.sendAndConfirm(transaction);
        assert.ok(false);
      } catch (error) {
        const parsedError = parseTranactionError(error);
        assert.equal(
          parsedError.msg,
          "Strategy requires the base currency to place asks"
        );
        assert.ok(true);
      }
    });
  });
});
