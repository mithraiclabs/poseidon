import { Program, web3 } from "@project-serum/anchor";
import { Market, OpenOrders } from "@project-serum/serum";
import { BoundedStrategy } from "../types";
import { SerumRemote } from "../serum_remote";
import { TOKEN_PROGRAM_ID } from "@project-serum/serum/lib/token-instructions";

export const boundedTradeIx = async (
  program: Program<SerumRemote>,
  strategyKey: web3.PublicKey,
  serumMarket: Market,
  boundedStrategy: BoundedStrategy
) => {
  const vaultSigner = await web3.PublicKey.createProgramAddress(
    [
      serumMarket.address.toBuffer(),
      // @ts-ignore
      serumMarket._decoded.vaultSignerNonce.toArrayLike(Buffer, "le", 8),
    ],
    serumMarket.programId
  );
  const openOrders = await OpenOrders.load(
    program.provider.connection,
    boundedStrategy.openOrders,
    serumMarket.programId
  );
  console.log(
    "***open Orders",
    openOrders.market.toString(),
    openOrders.owner.toString()
  );
  console.log({
    accounts: {
      payer: program.provider.wallet.publicKey.toString(),
      strategy: strategyKey.toString(),
      serumMarket: serumMarket.address.toString(),
      bids: serumMarket.bidsAddress.toString(),
      asks: serumMarket.asksAddress.toString(),
      openOrders: boundedStrategy.openOrders.toString(),
      orderPayer: boundedStrategy.orderPayer.toString(),
      authority: boundedStrategy.authority.toString(),
      // @ts-ignore
      requestQueue: serumMarket._decoded.requestQueue.toString(),
      // @ts-ignore
      eventQueue: serumMarket._decoded.eventQueue.toString(),
      // @ts-ignore
      coinVault: serumMarket._decoded.baseVault.toString(),
      // @ts-ignore
      pcVault: serumMarket._decoded.quoteVault.toString(),
      serumVaultSigner: vaultSigner.toString(),
      depositAccount: boundedStrategy.depositAddress.toString(),
      dexProgram: serumMarket.programId.toString(),
      tokenProgramId: TOKEN_PROGRAM_ID.toString(),
      rent: web3.SYSVAR_RENT_PUBKEY.toString(),
    },
  });
  return program.instruction.boundedTrade({
    accounts: {
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
  });
};
