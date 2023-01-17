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
  boundedStrategyParams: BoundedStrategyParams,
  opts: { owner?: web3.PublicKey } = {}
) => {
  const payerKey = program.provider.publicKey;
  const {
    boundPrice,
    reclaimDate,
    reclaimAddress,
    depositAddress,
    orderSide,
    bound,
    transferAmount,
  } = boundedStrategyParams;
  const { orderPayer, boundedStrategy, authority, openOrders } =
    await deriveAllBoundedStrategyKeys(
      program,
      serumMarket,
      mint,
      boundedStrategyParams
    );
  return program.instruction.initBoundedStrategy(
    transferAmount,
    boundPrice,
    reclaimDate,
    orderSide,
    bound,
    new BN(OpenOrders.getLayout(dexProgram).span),
    {
      accounts: {
        payer: opts.owner || payerKey,
        authority,
        mint,
        serumMarket,
        orderPayer,
        strategy: boundedStrategy,
        reclaimAccount: reclaimAddress,
        depositAccount: depositAddress,
        openOrders: openOrders,
        dexProgram,
        tokenProgram: TOKEN_PROGRAM_ID,
        systemProgram: web3.SystemProgram.programId,
        rent: web3.SYSVAR_RENT_PUBKEY,
      },
    }
  );
};

export const initializeBoundedStrategy = async (
  program: Program<SerumRemote>,
  dexProgramId: web3.PublicKey,
  serumMarket: web3.PublicKey,
  assetMint: web3.PublicKey,
  boundedStrategyParams: BoundedStrategyParams
) => {
  const instruction = await initBoundedStrategyIx(
    program,
    dexProgramId,
    serumMarket,
    assetMint,
    boundedStrategyParams
  );
  const initBoundedStrategyTx = new web3.Transaction().add(instruction);
  await program.provider.sendAndConfirm(initBoundedStrategyTx);
};
