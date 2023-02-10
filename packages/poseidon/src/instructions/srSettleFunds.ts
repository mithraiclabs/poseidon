import { Program, web3 } from "@coral-xyz/anchor";
import { Market } from "@project-serum/serum";
import { BoundedStrategy } from "../types";
import { Poseidon } from "../poseidon";
import { TOKEN_PROGRAM_ID } from "@project-serum/serum/lib/token-instructions";

export const srSettleFundsIx = async (
  program: Program<Poseidon>,
  strategyKey: web3.PublicKey,
  serumMarket: Market,
  boundedStrategy: BoundedStrategy,
  serumReferral: web3.PublicKey | undefined = undefined
) => {
  const vaultSigner = await web3.PublicKey.createProgramAddress(
    [
      serumMarket.address.toBuffer(),
      // @ts-ignore
      serumMarket._decoded.vaultSignerNonce.toArrayLike(Buffer, "le", 8),
    ],
    serumMarket.programId
  );
  return program.instruction.srSettleFunds({
    accounts: {
      strategy: strategyKey,
      reclaimAccount: boundedStrategy.reclaimAddress,
      serumMarket: serumMarket.address,
      openOrders: boundedStrategy.openOrders,
      authority: boundedStrategy.authority,
      // @ts-ignore
      coinVault: serumMarket._decoded.baseVault,
      // @ts-ignore
      pcVault: serumMarket._decoded.quoteVault,
      serumVaultSigner: vaultSigner,
      depositAccount: boundedStrategy.depositAddress,
      dexProgram: serumMarket.programId,
      tokenProgramId: TOKEN_PROGRAM_ID,
    },
    remainingAccounts: serumReferral
      ? [{ pubkey: serumReferral, isSigner: false, isWritable: true }]
      : undefined,
  });
};
