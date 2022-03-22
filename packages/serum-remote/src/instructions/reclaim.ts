import { Program, web3 } from "@project-serum/anchor";
import { TOKEN_PROGRAM_ID } from "@project-serum/anchor/dist/cjs/utils/token";
import { SerumRemote } from "../serum_remote";
import { BoundedStrategy } from "../types";

export const reclaimIx = (
  program: Program<SerumRemote>,
  strategyKey: web3.PublicKey,
  boundedStrategy: BoundedStrategy,
  dexProgramId: web3.PublicKey
) => {
  return program.instruction.reclaim({
    accounts: {
      receiver: program.provider.wallet.publicKey,
      strategy: strategyKey,
      authority: boundedStrategy.authority,
      orderPayer: boundedStrategy.orderPayer,
      reclaimAccount: boundedStrategy.reclaimAddress,
      openOrders: boundedStrategy.openOrders,
      serumMarket: boundedStrategy.serumMarket,
      dexProgram: dexProgramId,
      tokenProgram: TOKEN_PROGRAM_ID,
    },
  });
};
