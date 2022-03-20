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
  openOrdersAccount: web3.PublicKey,
  boundedStrategyParams: BoundedStrategyParams
) => {
  const { boundPrice, reclaimDate, reclaimAddress, orderSide, bound } =
    boundedStrategyParams;
  const { orderPayer, boundedStrategy, authority } =
    await deriveAllBoundedStrategyKeys(
      program,
      serumMarket,
      mint,
      boundedStrategyParams
    );
  return program.instruction.initBoundedStrategy(
    boundPrice,
    reclaimDate,
    orderSide,
    bound,
    {
      accounts: {
        payer: program.provider.wallet.publicKey,
        authority,
        mint,
        serumMarket,
        orderPayer,
        strategy: boundedStrategy,
        reclaimAccount: reclaimAddress,
        openOrders: openOrdersAccount,
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
  const { boundPrice, reclaimDate, reclaimAddress, orderSide, bound } =
    boundedStrategyParams;
  const openOrdersKey = new web3.Keypair();
  const ix = await OpenOrders.makeCreateAccountTransaction(
    program.provider.connection,
    // This argument is pointless
    web3.SystemProgram.programId,
    // This argument is the payer for the rent
    program.provider.wallet.publicKey,
    openOrdersKey.publicKey,
    dexProgramId
  );
  const transaction = new web3.Transaction().add(ix);
  const initBoundedStrategyInstruction = await initBoundedStrategyIx(
    program,
    dexProgramId,
    serumMarket,
    assetMint,
    openOrdersKey.publicKey,
    {
      boundPrice,
      reclaimDate,
      reclaimAddress,
      orderSide,
      bound,
    }
  );
  transaction.add(initBoundedStrategyInstruction);
  await program.provider.send(transaction, [openOrdersKey]);
};
