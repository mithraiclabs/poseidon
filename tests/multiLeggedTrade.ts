import * as anchor from "@coral-xyz/anchor";
import { BN } from "@coral-xyz/anchor";
import { splTokenProgram, SPL_TOKEN_PROGRAM_ID } from "@coral-xyz/spl-token";
import { Program, web3 } from "@coral-xyz/anchor";
import { Market, OpenOrders } from "@project-serum/serum";
import { assert } from "chai";
import { parseTranactionError } from "../packages/poseidon/src";
import { openBookTradeAccounts } from "../packages/poseidon/src/dexes";
import { deriveAllBoundedStrategyKeysV2 } from "../packages/poseidon/src/pdas";
import { IDL, Poseidon } from "../target/types/poseidon";
import {
  compileAndSendV0Tx,
  createAssociatedTokenInstruction,
  createLookUpTable,
  initNewTokenMintInstructions,
  loadPayer,
  OPEN_BOOK_DEX_ID,
  SOL_USDC_OPEN_BOOK_MARKET,
  USDC_MINT,
  wait,
} from "./utils";
import { createRaydiumPool } from "./utils/raydium";
import { Currency, CurrencyAmount } from "@raydium-io/raydium-sdk";
import { raydiumTradeAccts } from "../packages/poseidon/src/dexes";
import { TOKEN_PROGRAM_ID } from "@coral-xyz/anchor/dist/cjs/utils/token";
import { Liquidity } from "@raydium-io/raydium-sdk";
import { LIQUIDITY_PROGRAM_ID_V4 } from "@raydium-io/raydium-sdk";

let timesRun = 0;
describe("OpenBook + Raydium Trade", () => {
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
  let orderSide = 0;
  let bound = 1;
  let transferAmount = new BN(10_000_000_000);
  let serumMarket: Market;
  let coinMint: web3.PublicKey, coinUsdcSerumMarket: Market;
  let boundedStrategyKey: web3.PublicKey, collateralAccount: web3.PublicKey;
  let additionalData: Buffer;

  before(async () => {
    serumMarket = await Market.load(
      program.provider.connection,
      SOL_USDC_OPEN_BOOK_MARKET,
      {},
      OPEN_BOOK_DEX_ID
    );
    additionalData = new BN(
      // @ts-ignore
      serumMarket._baseSplTokenDecimals
    ).toArrayLike(Buffer, "le", 1);
    await program.provider.connection.requestAirdrop(
      payerKey,
      10_000_000_000_000
    );
    const transaction = new web3.Transaction();

    // This TX may fail with concurrent tests
    // TODO: Write more elegant solution
    const { instruction, associatedAddress } =
      await createAssociatedTokenInstruction(program.provider, USDC_MINT);
    const { instruction: baseMintAtaIx, associatedAddress: wSolAta } =
      await createAssociatedTokenInstruction(
        program.provider,
        serumMarket.baseMintAddress
      );
    reclaimAddress = wSolAta;
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

    // Send a bunch of SOL to the WSOL address
    const solTransferIx = web3.SystemProgram.transfer({
      fromPubkey: payerKey,
      toPubkey: wSolAta,
      lamports: 10_000_000_000,
    });
    transaction.add(solTransferIx);
    const syncWSolIx = await tokenProgram.methods
      .syncNative()
      .accounts({ account: wSolAta })
      .instruction();
    transaction.add(syncWSolIx);

    await program.provider.sendAndConfirm(transaction);

    const tx = new web3.Transaction();
    // Create a new mint
    const { instructions, mintAccount } = await initNewTokenMintInstructions(
      program.provider,
      payerKey,
      6
    );
    instructions.forEach((ix) => tx.add(ix));
    coinMint = mintAccount.publicKey;
    // Createa $COIN ATA for payer
    const { instruction: coinMintIx, associatedAddress: coinAta } =
      await createAssociatedTokenInstruction(
        program.provider,
        mintAccount.publicKey
      );
    tx.add(coinMintIx);
    depositAddress = coinAta;

    // Mint $COIN to payer
    const mintCoinIx = await tokenProgram.methods
      .mintTo(new BN(1_000_000_000_000))
      .accounts({
        mint: mintAccount.publicKey,
        account: coinAta,
        owner: payerKey,
      })
      .instruction();
    tx.add(mintCoinIx);
    await program.provider.sendAndConfirm(tx, [mintAccount]);

    // Spin up COIN/USDC pool on Raydium and deposit COIN/USDC liquidity
    const { serumMarketAddress: coinUsdcMarketAddress } =
      await createRaydiumPool(
        program.provider,
        payerKey,
        mintAccount.publicKey,
        6,
        USDC_MINT,
        6,
        new CurrencyAmount(
          new Currency(6, "COIN"),
          new BN(10_000_000_000).toString()
        ),
        new CurrencyAmount(
          new Currency(6, "USDC"),
          new BN(10_000_000_000).toString()
        )
      );
    coinUsdcSerumMarket = await Market.load(
      program.provider.connection,
      coinUsdcMarketAddress,
      {},
      OPEN_BOOK_DEX_ID
    );
  });
  beforeEach(async () => {
    timesRun += 1;
    // Sell 1 SOL for at least 1 COIN (after all legs, fees, etc)
    boundPriceNumerator = new anchor.BN(1_000_000_000);
    boundPriceDenominator = new anchor.BN(1_000_000);
    reclaimDate = new anchor.BN(new Date().getTime() / 1_000 + 3600 + timesRun);
    orderSide = 0;
    bound = 1;
    transferAmount = new BN(10_000_000);
  });

  // Test the BoundedStrategy account is created with the right info
  // As set up, this will be Buying COIN using SOL. Sell SOL for USDC on OpenBookDEX and buy COIN
  //  using USDC from Raydium
  it("Should store all the information for a BoundedStretegyV2", async () => {
    ({ boundedStrategy: boundedStrategyKey, collateralAccount } =
      await deriveAllBoundedStrategyKeysV2(
        program,
        serumMarket.baseMintAddress,
        {
          boundPriceNumerator,
          boundPriceDenominator,
          reclaimDate,
        }
      ));
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
        mint: serumMarket.baseMintAddress,
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
      const parsedError = parseTranactionError(err);
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
      serumMarket.baseMintAddress.toString()
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
  // TODO: Test the execution of a BoundedTradeV2
  describe("Execution price is lower than the bounded price", () => {
    let traderKeypair = new web3.Keypair();
    let additionalData: Buffer;
    let traderOpenOrdersKeypair = new web3.Keypair();
    let traderUsdcKey: web3.PublicKey;
    let traderProgram: Program<Poseidon>;
    before(async () => {
      additionalData = new BN(
        // @ts-ignore
        serumMarket._baseSplTokenDecimals
      ).toArrayLike(Buffer, "le", 1);
      // Create a new payer for trading
      const signature = await program.provider.connection.requestAirdrop(
        traderKeypair.publicKey,
        10 * web3.LAMPORTS_PER_SOL
      );
      await program.provider.connection.confirmTransaction(signature);
      const traderWallet = new anchor.Wallet(traderKeypair);
      const traderProvider = new anchor.AnchorProvider(
        program.provider.connection,
        traderWallet,
        {}
      );
      traderProgram = new Program<Poseidon>(
        IDL,
        program.programId,
        traderProvider
      );
      const transaction = new web3.Transaction();
      // Create the OpenOrders accounts
      const ooIx = await OpenOrders.makeCreateAccountTransaction(
        program.provider.connection,
        serumMarket.address,
        traderKeypair.publicKey,
        traderOpenOrdersKeypair.publicKey,
        serumMarket.programId
      );
      transaction.add(ooIx);
      // Create the necessary token accounts. (only need the intermediary account which is USDC)
      const { instruction, associatedAddress } =
        await createAssociatedTokenInstruction(traderProvider, USDC_MINT);
      transaction.add(instruction);
      traderUsdcKey = associatedAddress;

      await traderProvider.sendAndConfirm(transaction, [
        traderOpenOrdersKeypair,
      ]);
    });
    it("should execute the trade", async () => {
      const boundedStrategy = await program.account.boundedStrategyV2.fetch(
        boundedStrategyKey
      );
      const depositTokenAccountBefore =
        await tokenProgram.account.account.fetch(
          boundedStrategy.depositAddress
        );
      ////////////////// Get the reamining accounts ////////////
      const openBookRemainingAccounts = await openBookTradeAccounts(
        serumMarket,
        // Becuase this is the first leg, the Trade Source Account is still the collateralAccount
        collateralAccount,
        // Because this is a multi-leg route, with a following leg, the Trade Destination Account is an intermediary token account
        traderUsdcKey,
        traderOpenOrdersKeypair.publicKey,
        traderKeypair.publicKey
      );
      // the keys taken from here would come from jupiter
      const associatedPoolKeys = Liquidity.getAssociatedPoolKeys({
        version: 4,
        marketVersion: 3,
        baseMint: coinMint,
        quoteMint: USDC_MINT,
        baseDecimals: 6,
        quoteDecimals: 6,
        marketId: coinUsdcSerumMarket.address,
        programId: LIQUIDITY_PROGRAM_ID_V4,
        marketProgramId: coinUsdcSerumMarket.programId,
      });
      const raydiumRemainingAccounts = await raydiumTradeAccts(
        traderUsdcKey,
        traderKeypair.publicKey,
        depositAddress,
        {
          serumCoinVaultAccount: coinUsdcSerumMarket.decoded.baseVault,
          serumEventQueue: coinUsdcSerumMarket.decoded.eventQueue,
          serumPcVaultAccount: coinUsdcSerumMarket.decoded.quoteVault,
        },
        associatedPoolKeys.id, // amm id
        coinUsdcSerumMarket.address,
        coinUsdcSerumMarket,
        associatedPoolKeys.openOrders, //ammOpenOrders: PublicKey,
        associatedPoolKeys.targetOrders, // ammTargetOrders: PublicKey,
        associatedPoolKeys.baseVault, //ammBaseVault: PublicKey,
        associatedPoolKeys.quoteVault, //ammQuoteVault: PublicKey,
        coinUsdcSerumMarket.programId
      );

      const remainingAccounts = [
        ...openBookRemainingAccounts,
        ...raydiumRemainingAccounts,
      ];
      // Create and send the BoundedTradeV2 transaction
      const ix = await traderProgram.methods
        .boundedTradeV2(additionalData)
        .accounts({
          payer: traderKeypair.publicKey,
          strategy: boundedStrategyKey,
          orderPayer: boundedStrategy.collateralAccount,
          depositAccount: boundedStrategy.depositAddress,
          tokenProgram: TOKEN_PROGRAM_ID,
        })
        .remainingAccounts(remainingAccounts)
        .instruction();
      // Create the necessary LUT
      const lookupTableAddress = await createLookUpTable(
        traderProgram.provider,
        remainingAccounts
      );
      await compileAndSendV0Tx(
        traderProgram.provider,
        traderKeypair,
        lookupTableAddress,
        [ix],
        (err) => {
          console.error(err);
          assert.ok(false);
        }
      );
      await wait(5000);
      // Validate that the deposit received the amount of SOL
      const depositTokenAccountAfter = await tokenProgram.account.account.fetch(
        boundedStrategy.depositAddress
      );
      const depositTokenDiff = depositTokenAccountAfter.amount.sub(
        depositTokenAccountBefore.amount
      );

      assert.equal(depositTokenDiff.toString(), "236396");
    });
  });
});
