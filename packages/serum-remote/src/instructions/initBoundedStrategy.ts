import { BN, Program, web3 } from "@project-serum/anchor";
import { SerumRemote } from "../serum_remote";
import {
  deriveAuthority,
  deriveBoundedStrategy,
  deriveOrderPayer,
} from "../pdas";
import { TOKEN_PROGRAM_ID } from "@project-serum/anchor/dist/cjs/utils/token";

type BoundedStrategyParams = {
  boundPrice: BN;
  reclaimDate: BN;
};

export const initBoundedStrategyIx = async (
  program: Program<SerumRemote>,
  serumMarket: web3.PublicKey,
  mint: web3.PublicKey,
  boundedStrategyParams: BoundedStrategyParams
) => {
  const { boundPrice, reclaimDate } = boundedStrategyParams;
  const [orderPayer] = await deriveOrderPayer(program, serumMarket, mint);
  const [boundedStrategy] = await deriveBoundedStrategy(
    program,
    orderPayer,
    boundPrice,
    reclaimDate
  );
  const [authority] = await deriveAuthority(program, boundedStrategy);
  return program.instruction.initBoundedStrategy(boundPrice, reclaimDate, {
    accounts: {
      payer: program.provider.wallet.publicKey,
      authority,
      mint,
      serumMarket,
      orderPayer,
      boundedStrategy,
      tokenProgram: TOKEN_PROGRAM_ID,
      systemProgram: web3.SystemProgram.programId,
      rent: web3.SYSVAR_RENT_PUBKEY,
    },
  });
};
