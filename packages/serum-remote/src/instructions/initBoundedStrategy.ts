import { BN, Program, web3 } from "@project-serum/anchor";
import { SerumRemote } from "../serum_remote";
import { deriveAllBoundedStrategyKeys } from "../pdas";
import { TOKEN_PROGRAM_ID } from "@project-serum/anchor/dist/cjs/utils/token";
import { BoundedStrategyParams } from "../types";

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
