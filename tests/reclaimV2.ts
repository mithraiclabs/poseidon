import { BN, Program, web3, workspace } from "@project-serum/anchor";
import { splTokenProgram, SPL_TOKEN_PROGRAM_ID } from "@coral-xyz/spl-token";
import { WRAPPED_SOL_MINT } from "@project-serum/serum/lib/token-instructions";
import { Token, TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { assert } from "chai";
import {
  BoundedStrategy,
  parseTranactionError,
} from "../packages/serum-remote/src";
import { deriveAllBoundedStrategyKeysV2 } from "../packages/serum-remote/src/pdas";
import { SerumRemote } from "../target/types/serum_remote";
import {
  createAssociatedTokenInstruction,
  DEX_ID,
  SOL_USDC_SERUM_MARKET,
  USDC_MINT,
  wait,
} from "./utils";
import { Market } from "@project-serum/serum";
import OpenBookDex from "../packages/serum-remote/src/dexes/openBookDex";

describe("ReclaimV2", () => {
  // Configure the client to use the local cluster.
  const program = workspace.SerumRemote as Program<SerumRemote>;
  // @ts-ignore: TODO: Remove after anchor npm upgrade
  const payerKey = program.provider.wallet.publicKey;
  const tokenProgram = splTokenProgram();

  let boundPriceNumerator = new BN(95_700_000);
  let boundPriceDenominator = new BN(1_000_000_000);
  let reclaimDate = new BN(new Date().getTime() / 1_000 + 3600);
  let reclaimAddress: web3.PublicKey;
  let depositAddress: web3.PublicKey;
  let orderSide = 0;
  let bound = 1;
  let transferAmount = new BN(10_000_000);
  let serumMarket: Market;
  let boundPrice = new BN(957);
  let baseAddress: web3.PublicKey;
  let quoteTransferAmount = new BN(10_000_000);
  let baseTransferAmount = new BN(10_000_000_000);
  let boundedStrategy: BoundedStrategy;
  let boundedStrategyKey: web3.PublicKey,
    authority: web3.PublicKey,
    collateralAddress: web3.PublicKey;

  const initBoundStrat = async (_reclaimDate: BN) => {
    reclaimDate = _reclaimDate;
    const {
      boundedStrategy: _boundedStrategyKey,
      collateralAccount: _collateralAccount,
    } = await deriveAllBoundedStrategyKeysV2(program, USDC_MINT, {
      transferAmount,
      boundPriceNumerator,
      boundPriceDenominator,
      reclaimDate: _reclaimDate,
      reclaimAddress,
      depositAddress,
      orderSide,
      bound,
    });
    boundedStrategyKey = _boundedStrategyKey;
    collateralAddress = _collateralAccount;
    const initAdditionalAccounts = await OpenBookDex.initLegAccounts(
      program.programId,
      serumMarket,
      boundedStrategyKey,
      collateralAddress,
      depositAddress,
      // This a dummy key for the destimation mint. It is not used in single leg transactions
      web3.SystemProgram.programId
    );
    const additionalData = new BN(
      // @ts-ignore
      serumMarket._baseSplTokenDecimals
    ).toArrayLike(Buffer, "le", 1);
    await program.methods
      .initBoundedStrategyV2(
        transferAmount,
        boundPriceNumerator,
        boundPriceDenominator,
        _reclaimDate,
        orderSide,
        bound,
        additionalData
      )
      .accounts({
        payer: program.provider.publicKey,
        collateralAccount: collateralAddress,
        mint: USDC_MINT,
        strategy: boundedStrategyKey,
        reclaimAccount: reclaimAddress,
        depositAccount: depositAddress,
        tokenProgram: SPL_TOKEN_PROGRAM_ID,
        systemProgram: web3.SystemProgram.programId,
        rent: web3.SYSVAR_RENT_PUBKEY,
      })
      .remainingAccounts(initAdditionalAccounts)
      .rpc();
    boundedStrategy = await program.account.boundedStrategyV2.fetch(
      boundedStrategyKey
    );
  };

  before(async () => {
    await program.provider.connection.requestAirdrop(
      payerKey,
      baseTransferAmount.muln(10).toNumber()
    );
    const [
      { instruction, associatedAddress },
      { instruction: baseMintAtaIx, associatedAddress: baseAta },
      _serumMarket,
    ] = await Promise.all([
      createAssociatedTokenInstruction(program.provider, USDC_MINT),
      createAssociatedTokenInstruction(program.provider, WRAPPED_SOL_MINT),
      Market.load(
        program.provider.connection,
        SOL_USDC_SERUM_MARKET,
        {},
        DEX_ID
      ),
    ]);
    reclaimAddress = associatedAddress;
    depositAddress = baseAta;
    baseAddress = baseAta;
    serumMarket = _serumMarket;
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

  describe("Prior to reclaim date", () => {
    beforeEach(async () => {
      await initBoundStrat(new BN(new Date().getTime() / 1_000 + 3600));
    });

    it("should error", async () => {
      try {
        await program.methods
          .reclaimV2()
          .accounts({
            receiver: program.provider.publicKey,
            strategy: boundedStrategyKey,
            collateralAccount: collateralAddress,
            reclaimAccount: reclaimAddress,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .rpc();
        throw new Error("should not get here");
      } catch (err) {
        assert.equal(
          err.error.errorMessage,
          "Cannot reclaim assets before the reclaim date"
        );
      }
      assert.ok(true);
    });
  });

  describe("Post reclaim date", () => {
    beforeEach(async () => {
      await initBoundStrat(new BN(new Date().getTime() / 1_000 + 1));
      await wait(2000);
    });

    it("should return assets", async () => {
      const [reclaimAccountBefore, collateralAccountBefore] = await Promise.all(
        [
          tokenProgram.account.account.fetch(reclaimAddress),
          tokenProgram.account.account.fetch(collateralAddress),
        ]
      );
      try {
        await program.methods
          .reclaimV2()
          .accounts({
            receiver: program.provider.publicKey,
            strategy: boundedStrategyKey,
            collateralAccount: collateralAddress,
            reclaimAccount: reclaimAddress,
            tokenProgram: TOKEN_PROGRAM_ID,
          })
          .rpc();
      } catch (err) {
        console.log(err);
        assert.ok(false);
      }

      const [reclaimAccountAfter, collateralAccountAfter, boundedStrategyInfo] =
        await Promise.all([
          tokenProgram.account.account.fetch(reclaimAddress),
          program.provider.connection.getAccountInfo(collateralAddress),
          program.provider.connection.getAccountInfo(boundedStrategyKey),
        ]);
      const reclaimDiff = reclaimAccountAfter.amount.sub(
        reclaimAccountBefore.amount
      );
      assert.equal(
        reclaimDiff.toString(),
        collateralAccountBefore.amount.toString()
      );
      assert.ok(!collateralAccountAfter);
      assert.ok(!boundedStrategyInfo);
    });
  });
});
