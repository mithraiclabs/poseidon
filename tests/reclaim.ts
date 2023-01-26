import * as anchor from "@project-serum/anchor";
import { BN, Program, web3 } from "@project-serum/anchor";
import { splTokenProgram } from "@coral-xyz/spl-token";
import { WRAPPED_SOL_MINT } from "@project-serum/serum/lib/token-instructions";
import { Token, TOKEN_PROGRAM_ID, u64 } from "@solana/spl-token";
import { assert } from "chai";
import {
  BoundedStrategy,
  parseTranactionError,
} from "../packages/serum-remote/src";
import { reclaimIx } from "../packages/serum-remote/src/instructions";
import { initializeBoundedStrategy } from "../packages/serum-remote/src/instructions/initBoundedStrategy";
import { deriveAllBoundedStrategyKeys } from "../packages/serum-remote/src/pdas";
import { SerumRemote } from "../target/types/serum_remote";
import {
  createAssociatedTokenInstruction,
  DEX_ID,
  SOL_USDC_SERUM_MARKET,
  USDC_MINT,
  wait,
} from "./utils";

let timesRun = 0;

describe("Reclaim", () => {
  // Configure the client to use the local cluster.
  const program = anchor.workspace.SerumRemote as Program<SerumRemote>;
  // @ts-ignore: TODO: Remove after anchor npm upgrade
  const payerKey = program.provider.wallet.publicKey;
  const tokenProgram = splTokenProgram();

  let boundPrice = new anchor.BN(957);
  let reclaimDate = new anchor.BN(new Date().getTime() / 1_000 + 3600);
  let quoteAddress: web3.PublicKey;
  let baseAddress: web3.PublicKey;
  let orderSide = 0;
  let bound = 1;
  let quoteTransferAmount = new BN(10_000_000);
  let baseTransferAmount = new BN(10_000_000_000);
  let boundedStrategy: BoundedStrategy;
  let boundedStrategyKey: web3.PublicKey,
    authority: web3.PublicKey,
    orderPayer: web3.PublicKey;

  before(async () => {
    await program.provider.connection.requestAirdrop(
      payerKey,
      baseTransferAmount.muln(10).toNumber()
    );
    // This TX may fail with concurrent tests
    // TODO: Write more elegant solution
    const [
      { instruction, associatedAddress },
      { instruction: baseMintAtaIx, associatedAddress: baseAta },
    ] = await Promise.all([
      createAssociatedTokenInstruction(program.provider, USDC_MINT),
      createAssociatedTokenInstruction(program.provider, WRAPPED_SOL_MINT),
    ]);
    quoteAddress = associatedAddress;
    baseAddress = baseAta;
    const createAtaTx = new web3.Transaction()
      .add(instruction)
      .add(baseMintAtaIx);
    try {
      await program.provider.sendAndConfirm(createAtaTx);
    } catch (err) {}

    const transaction = new web3.Transaction();
    const mintToInstruction = Token.createMintToInstruction(
      TOKEN_PROGRAM_ID,
      USDC_MINT,
      associatedAddress,
      payerKey,
      [],
      quoteTransferAmount.muln(10).toNumber()
    );
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
    timesRun += 1;
    reclaimDate = new anchor.BN(new Date().getTime() / 1_000 + 3600 + timesRun);
  });

  // Reclaim Date has not passed
  describe("Reclaim date has passed", () => {
    beforeEach(async () => {
      reclaimDate = new anchor.BN(
        new Date().getTime() / 1_000 + 3600 + timesRun
      );
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
    it("should error", async () => {
      const ix = reclaimIx(
        program,
        boundedStrategyKey,
        boundedStrategy,
        DEX_ID
      );
      const transaction = new web3.Transaction().add(ix);
      try {
        await program.provider.sendAndConfirm(transaction);
        assert.ok(false);
      } catch (error) {
        const parsedError = parseTranactionError(error);
        assert.equal(
          parsedError.msg,
          "Cannot reclaim assets before the reclaim date"
        );
      }
      assert.ok(true);
    });
  });

  describe("Reclaim date has passed", () => {
    beforeEach(async () => {
      reclaimDate = new anchor.BN(new Date().getTime() / 1_000 + 1);
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
      await wait(2_000);
    });
    it("should return the assets to the reclaim address", async () => {
      const reclaimAccountBefore = await tokenProgram.account.account.fetch(
        quoteAddress
      );
      const orderPayerBefore = await tokenProgram.account.account.fetch(
        orderPayer
      );

      const ix = reclaimIx(
        program,
        boundedStrategyKey,
        boundedStrategy,
        DEX_ID
      );
      const transaction = new web3.Transaction().add(ix);
      try {
        await program.provider.sendAndConfirm(transaction);
      } catch (error) {
        console.log("*** error", error);
        const parsedError = parseTranactionError(error);
        console.log("Error: ", parsedError.msg);
        assert.ok(false);
      }

      const reclaimAccountAfter = await tokenProgram.account.account.fetch(
        quoteAddress
      );
      const reclaimDiff = reclaimAccountAfter.amount.sub(
        reclaimAccountBefore.amount
      );
      assert.equal(reclaimDiff.toString(), orderPayerBefore.amount.toString());

      // Test that the OrderPayer was closed
      const orderPayerInfo = await program.provider.connection.getAccountInfo(
        orderPayer
      );
      assert.ok(!orderPayerInfo);
      // Test the OpenOrders account was closed
      const openOrdersInfo = await program.provider.connection.getAccountInfo(
        boundedStrategy.openOrders
      );
      assert.ok(!openOrdersInfo);
      // Test the strategy account was closed
      const boundedStrategyInfo =
        await program.provider.connection.getAccountInfo(boundedStrategyKey);
      assert.ok(!boundedStrategyInfo);
    });

    describe("Bad reclaim address", () => {
      let badReclaimAddress: web3.PublicKey;
      beforeEach(async () => {
        const { instruction, associatedAddress } =
          await createAssociatedTokenInstruction(
            program.provider,
            USDC_MINT,
            new web3.Keypair().publicKey
          );
        badReclaimAddress = associatedAddress;
        const createAtaTx = new web3.Transaction().add(instruction);
        try {
          await program.provider.sendAndConfirm(createAtaTx);
        } catch (err) {}
      });
      it("should error", async () => {
        const ix = reclaimIx(
          program,
          boundedStrategyKey,
          {
            ...boundedStrategy,
            reclaimAddress: badReclaimAddress,
          },
          DEX_ID
        );
        const transaction = new web3.Transaction().add(ix);
        try {
          await program.provider.sendAndConfirm(transaction);
          assert.ok(false);
        } catch (error) {
          const parsedError = parseTranactionError(error);
          assert.equal(parsedError.msg, "Cannot reclaim to different address");
        }
        assert.ok(true);
      });
    });
  });
});
