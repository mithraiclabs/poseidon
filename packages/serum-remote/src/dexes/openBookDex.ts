import { SPL_TOKEN_PROGRAM_ID } from "@coral-xyz/spl-token";
import { web3 } from "@project-serum/anchor";
import { Market } from "@project-serum/serum";

export default class OpenBookDex {
  static deriveOpenOrders(
    remoteProgramId: web3.PublicKey,
    strategyKey: web3.PublicKey
  ): Promise<[web3.PublicKey, number]> {
    const encoded = new TextEncoder().encode("openOrders");
    return web3.PublicKey.findProgramAddress(
      [strategyKey.toBuffer(), encoded],
      remoteProgramId
    );
  }

  static deriveVaultSigner(serumMarket: Market): Promise<web3.PublicKey> {
    // @ts-ignore
    const nonce = serumMarket._decoded.vaultSignerNonce as number;
    return web3.PublicKey.createProgramAddress(
      [serumMarket.address.toBuffer(), Buffer.from([nonce])],
      serumMarket.programId
    );
  }

  static async initLegAccounts(
    remoteProgramId: web3.PublicKey,
    serumMarket: Market,
    strategyKey: web3.PublicKey
  ): Promise<web3.AccountMeta[]> {
    const openOrdersKey = (
      await this.deriveOpenOrders(remoteProgramId, strategyKey)
    )[0];

    const vaultSigner = await this.deriveVaultSigner(serumMarket);
    return [
      { pubkey: serumMarket.programId, isWritable: false, isSigner: false },
      { pubkey: serumMarket.address, isWritable: false, isSigner: false },
      { pubkey: serumMarket.bidsAddress, isWritable: false, isSigner: false },
      { pubkey: serumMarket.asksAddress, isWritable: false, isSigner: false },
      { pubkey: openOrdersKey, isWritable: false, isSigner: false },
      {
        // @ts-ignore
        pubkey: serumMarket._decoded.requestQueue,
        isWritable: false,
        isSigner: false,
      },
      {
        // @ts-ignore
        pubkey: serumMarket._decoded.eventQueue,
        isWritable: false,
        isSigner: false,
      },
      {
        // @ts-ignore
        pubkey: serumMarket._decoded.baseVault,
        isWritable: false,
        isSigner: false,
      },
      {
        // @ts-ignore
        pubkey: serumMarket._decoded.quoteVault,
        isWritable: false,
        isSigner: false,
      },
      { pubkey: vaultSigner, isWritable: false, isSigner: false },
      { pubkey: SPL_TOKEN_PROGRAM_ID, isWritable: false, isSigner: false },
      { pubkey: web3.SYSVAR_RENT_PUBKEY, isWritable: false, isSigner: false },
    ];
  }
}
