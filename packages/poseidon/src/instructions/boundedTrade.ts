import { Program, web3 } from "@coral-xyz/anchor";
import { Market } from "@project-serum/serum";
import { BoundedStrategy } from "../types";
import { Poseidon } from "../poseidon";
import { TOKEN_PROGRAM_ID } from "@project-serum/serum/lib/token-instructions";

export const boundedTradeIx = async (
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
  return program.instruction.boundedTrade({
    accounts: {
      // @ts-ignore: TODO: Remove after anchor npm upgrade
      payer: program.provider.wallet.publicKey,
      strategy: strategyKey,
      serumMarket: serumMarket.address,
      bids: serumMarket.bidsAddress,
      asks: serumMarket.asksAddress,
      openOrders: boundedStrategy.openOrders,
      orderPayer: boundedStrategy.orderPayer,
      authority: boundedStrategy.authority,
      // @ts-ignore
      requestQueue: serumMarket._decoded.requestQueue,
      // @ts-ignore
      eventQueue: serumMarket._decoded.eventQueue,
      // @ts-ignore
      coinVault: serumMarket._decoded.baseVault,
      // @ts-ignore
      pcVault: serumMarket._decoded.quoteVault,
      serumVaultSigner: vaultSigner,
      depositAccount: boundedStrategy.depositAddress,
      dexProgram: serumMarket.programId,
      tokenProgramId: TOKEN_PROGRAM_ID,
      rent: web3.SYSVAR_RENT_PUBKEY,
    },
    remainingAccounts: serumReferral
      ? [{ pubkey: serumReferral, isSigner: false, isWritable: true }]
      : undefined,
  });
};
