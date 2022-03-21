import { Program, web3 } from "@project-serum/anchor";
import { TOKEN_PROGRAM_ID } from "@project-serum/anchor/dist/cjs/utils/token";
import { SerumRemote } from "../serum_remote";
import { BoundedStrategy } from "../types";

export const reclaimIx = (
  program: Program<SerumRemote>,
  strategyKey: web3.PublicKey,
  boundedStrategy: BoundedStrategy
) => {
  return program.instruction.reclaim({
    accounts: {
      strategy: strategyKey,
      authority: boundedStrategy.authority,
      orderPayer: boundedStrategy.orderPayer,
      reclaimAccount: boundedStrategy.reclaimAddress,
      tokenProgram: TOKEN_PROGRAM_ID,
    },
  });
};
