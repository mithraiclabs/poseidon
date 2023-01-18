import * as anchor from "@project-serum/anchor";
import { BN } from "@project-serum/anchor";
import { splTokenProgram, SPL_TOKEN_PROGRAM_ID } from "@coral-xyz/spl-token";
import { Program, web3 } from "@project-serum/anchor";
import { Market, OpenOrders } from "@project-serum/serum";
import { WRAPPED_SOL_MINT } from "@project-serum/serum/lib/token-instructions";
import { Token, TOKEN_PROGRAM_ID, u64 } from "@solana/spl-token";
import { assert } from "chai";
import { parseTranactionError } from "../packages/serum-remote/src";
import OpenBookDex from "../packages/serum-remote/src/dexes/openBookDex";
import { initBoundedStrategyIx } from "../packages/serum-remote/src/instructions/initBoundedStrategy";
import {
  deriveAllBoundedStrategyKeys,
  deriveAllBoundedStrategyKeysV2,
} from "../packages/serum-remote/src/pdas";
import { SerumRemote } from "../target/types/serum_remote";
import {
  createAssociatedTokenInstruction,
  DEX_ID,
  SOL_USDC_SERUM_MARKET,
  USDC_MINT,
} from "./utils";

let timesRun = 0;
describe("InitBoundedStrategy", () => {
  // Configure the client to use the local cluster.
  const program = anchor.workspace.SerumRemote as Program<SerumRemote>;
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

    const mintToInstruction = Token.createMintToInstruction(
      TOKEN_PROGRAM_ID,
      USDC_MINT,
      associatedAddress,
      payerKey,
      [],
      transferAmount.muln(10).toNumber()
    );
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
  it("Should store all the information for a BoundedStretegyV2", async () => {
    const {
      boundedStrategy: boundedStrategyKey,
      authority,
      collateralAccount,
    } = await deriveAllBoundedStrategyKeysV2(program, USDC_MINT, {
      transferAmount,
      boundPrice,
      reclaimDate,
      reclaimAddress,
      depositAddress,
      orderSide,
      bound,
    });
    const reclaimTokenAccountBefore = await tokenProgram.account.account.fetch(
      reclaimAddress
    );
    const initAdditionalAccounts = await OpenBookDex.initLegAccounts(
      program.programId,
      serumMarket,
      boundedStrategyKey,
      collateralAccount,
      depositAddress
    );
    const additionalData = new BN(
      // @ts-ignore
      serumMarket._baseSplTokenDecimals
    ).toArrayLike(Buffer, "le", 1);
    const instruction = await program.methods
      .initBoundedStrategyV2(
        transferAmount,
        boundPrice,
        reclaimDate,
        orderSide,
        bound,
        additionalData
      )
      .accounts({
        payer: program.provider.publicKey,
        collateralAccount,
        mint: USDC_MINT,
        strategy: boundedStrategyKey,
        reclaimAccount: reclaimAddress,
        depositAccount: depositAddress,
        tokenProgram: SPL_TOKEN_PROGRAM_ID,
        systemProgram: web3.SystemProgram.programId,
        rent: web3.SYSVAR_RENT_PUBKEY,
      })
      .remainingAccounts(initAdditionalAccounts)
      .instruction();
    const transaction = new web3.Transaction().add(instruction);
    try {
      await program.provider.sendAndConfirm(transaction);
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
      USDC_MINT.toString()
    );
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
    // check additional accounts array
    boundedStrategy.accountList.forEach((key, index) => {
      const expectedKey = initAdditionalAccounts[index];
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
});
