import { BN, Program, web3 } from "@project-serum/anchor";
import { SerumRemote } from "../serum_remote";
import { deriveAllBoundedStrategyKeys } from "../pdas";
import { TOKEN_PROGRAM_ID } from "@project-serum/anchor/dist/cjs/utils/token";
import { BoundedStrategyParams } from "../types";
import { OpenOrders } from "@project-serum/serum";

export const initBoundedStrategyIx = async (
  program: Program<SerumRemote>,
  dexProgram: web3.PublicKey,
  serumMarket: web3.PublicKey,
  mint: web3.PublicKey,
  boundedStrategyParams: BoundedStrategyParams
) => {
  const openOrdersKey = new web3.Keypair();
  const {
    boundPrice,
    reclaimDate,
    reclaimAddress,
    depositAddress,
    orderSide,
    bound,
    transferAmount,
  } = boundedStrategyParams;
  const { orderPayer, boundedStrategy, authority } =
    await deriveAllBoundedStrategyKeys(
      program,
      serumMarket,
      mint,
      boundedStrategyParams
    );
  const instruction = program.instruction.initBoundedStrategy(
    transferAmount,
    boundPrice,
    reclaimDate,
    orderSide,
    bound,
    new BN(OpenOrders.getLayout(dexProgram).span),
    {
      accounts: {
        payer: program.provider.wallet.publicKey,
        authority,
        mint,
        serumMarket,
        orderPayer,
        strategy: boundedStrategy,
        reclaimAccount: reclaimAddress,
        depositAccount: depositAddress,
        openOrders: openOrdersKey.publicKey,
        dexProgram,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: web3.SystemProgram.programId,
        rent: web3.SYSVAR_RENT_PUBKEY,
      },
    }
  );
  const transaction = new web3.Transaction().add(instruction);
  return { transaction, signers: [openOrdersKey], openOrdersKey };
};

export const initializeBoundedStrategy = async (
  program: Program<SerumRemote>,
  dexProgramId: web3.PublicKey,
  serumMarket: web3.PublicKey,
  assetMint: web3.PublicKey,
  boundedStrategyParams: BoundedStrategyParams
) => {
  const { transaction: initBoundedStrategyTx, signers } =
    await initBoundedStrategyIx(
      program,
      dexProgramId,
      serumMarket,
      assetMint,
      boundedStrategyParams
    );
  await program.provider.send(initBoundedStrategyTx, signers);
};
