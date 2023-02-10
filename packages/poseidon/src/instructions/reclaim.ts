import { Program, web3 } from "@coral-xyz/anchor";
import { TOKEN_PROGRAM_ID } from "@coral-xyz/anchor/dist/cjs/utils/token";
import { Poseidon } from "../poseidon";
import { BoundedStrategy } from "../types";

export const reclaimIx = (
  program: Program<Poseidon>,
  strategyKey: web3.PublicKey,
  boundedStrategy: BoundedStrategy,
  dexProgramId: web3.PublicKey
) => {
  return program.instruction.reclaim({
    accounts: {
      // @ts-ignore: TODO: Remove after anchor npm upgrade
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
