import * as anchor from "@coral-xyz/anchor";
import { BN } from "@coral-xyz/anchor";
import { splTokenProgram, SPL_TOKEN_PROGRAM_ID } from "@coral-xyz/spl-token";
import { Program, web3 } from "@coral-xyz/anchor";
import { Market } from "@project-serum/serum";
import { assert } from "chai";
import { parseTranactionError } from "../packages/poseidon/src";
import { deriveAllBoundedStrategyKeysV2 } from "../packages/poseidon/src/pdas";
import { Poseidon } from "../target/types/poseidon";
import {
  compileAndSendV0Tx,
  createAssociatedTokenInstruction,
  createLookUpTable,
  DEX_ID,
  loadPayer,
  SOL_USDC_SERUM_MARKET,
  USDC_MINT,
} from "./utils";
import { WRAPPED_SOL_MINT } from "@project-serum/serum/lib/token-instructions";

let timesRun = 0;
describe("InitBoundedStrategyV2", () => {
  // Configure the client to use the local cluster.
  const program = anchor.workspace.Poseidon as Program<Poseidon>;
  const payerKey = program.provider.publicKey;
  const payerKeypair = loadPayer(process.env.ANCHOR_WALLET);
  const tokenProgram = splTokenProgram();

  let boundPriceNumerator = new anchor.BN(95_700_000);
  let boundPriceDenominator = new anchor.BN(1_000_000_000);
  let reclaimDate = new anchor.BN(new Date().getTime() / 1_000 + 3600);
  let reclaimAddress: web3.PublicKey;
  let depositAddress: web3.PublicKey;
  let transferAmount = new BN(10_000_000);
  let serumMarket: Market;

  before(async () => {
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
    boundPriceNumerator = new anchor.BN(95_700_000);
    boundPriceDenominator = new anchor.BN(1_000_000_000);
    reclaimDate = new anchor.BN(new Date().getTime() / 1_000 + 3600 + timesRun);
    transferAmount = new BN(10_000_000);
  });

  // Test the BoundedStrategy account is created with the right info
  it("Should store all the information for a BoundedStretegyV2", async () => {
    const { boundedStrategy: boundedStrategyKey, collateralAccount } =
      await deriveAllBoundedStrategyKeysV2(program, USDC_MINT, {
        boundPriceNumerator,
        boundPriceDenominator,
        reclaimDate,
      });
    const reclaimTokenAccountBefore = await tokenProgram.account.account.fetch(
      reclaimAddress
    );

    const instruction = await program.methods
      .initBoundedStrategyV2(
        transferAmount,
        boundPriceNumerator,
        boundPriceDenominator,
        reclaimDate
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
      })
      .instruction();
    try {
      const tx = new web3.Transaction().add(instruction);
      await program.provider.sendAndConfirm(tx);
    } catch (err) {
      console.error(err);
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
