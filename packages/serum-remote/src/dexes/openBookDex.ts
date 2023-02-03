import { BN, web3 } from "@project-serum/anchor";
import { Market } from "@project-serum/serum";
import { TOKEN_PROGRAM_ID } from "@project-serum/serum/lib/token-instructions";

export default class OpenBookDex {
  static deriveOpenOrders(
    remoteProgramId: web3.PublicKey,
    strategyKey: web3.PublicKey
  ): [web3.PublicKey, number] {
    const encoded = new TextEncoder().encode("openOrders");
    return web3.PublicKey.findProgramAddressSync(
      [strategyKey.toBuffer(), encoded],
      remoteProgramId
    );
  }

  static deriveVaultSigner(serumMarket: Market): web3.PublicKey {
    // @ts-ignore
    const nonce = serumMarket._decoded.vaultSignerNonce as BN;
    return web3.PublicKey.createProgramAddressSync(
      [serumMarket.address.toBuffer()].concat(
        nonce.toArrayLike(Buffer, "le", 8)
      ),
      serumMarket.programId
    );
  }

  static async initLegAccounts(
    remoteProgramId: web3.PublicKey,
    serumMarket: Market,
    strategyKey: web3.PublicKey,
    tradeSourceAccount: web3.PublicKey,
    tradeDestinationAccount: web3.PublicKey,
    destinationMint: web3.PublicKey
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
      { pubkey: openOrdersKey, isWritable: true, isSigner: false },
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
      { pubkey: TOKEN_PROGRAM_ID, isWritable: false, isSigner: false },
      { pubkey: web3.SYSVAR_RENT_PUBKEY, isWritable: false, isSigner: false },
      // This is the SRM referral account
      // TODO: Maybe actually implement this?
      { pubkey: web3.SYSVAR_RENT_PUBKEY, isWritable: false, isSigner: false },
      { pubkey: strategyKey, isWritable: false, isSigner: false },
      { pubkey: tradeSourceAccount, isWritable: false, isSigner: false },
      // If this is not the final Leg in a Route, than it must be writable.
      { pubkey: tradeDestinationAccount, isWritable: true, isSigner: false },
      { pubkey: destinationMint, isWritable: false, isSigner: false },
    ];
  }

  static async tradeAccounts(
    remoteProgramId: web3.PublicKey,
    serumMarket: Market,
    strategyKey: web3.PublicKey,
    collateralAccount: web3.PublicKey,
    tradeDestinationAccount: web3.PublicKey,
    destinationMint: web3.PublicKey
  ): Promise<web3.AccountMeta[]> {
    const openOrdersKey = (
      await this.deriveOpenOrders(remoteProgramId, strategyKey)
    )[0];

    const vaultSigner = await this.deriveVaultSigner(serumMarket);
    console.log(
      `collateralAccount ${collateralAccount.toString()}\ntradeDestinationAccount ${tradeDestinationAccount.toString()}`
    );
    return [
      { pubkey: serumMarket.programId, isWritable: false, isSigner: false },
      { pubkey: serumMarket.address, isWritable: true, isSigner: false },
      { pubkey: serumMarket.bidsAddress, isWritable: true, isSigner: false },
      { pubkey: serumMarket.asksAddress, isWritable: true, isSigner: false },
      { pubkey: openOrdersKey, isWritable: true, isSigner: false },
      {
        // @ts-ignore
        pubkey: serumMarket._decoded.requestQueue,
        isWritable: true,
        isSigner: false,
      },
      {
        // @ts-ignore
        pubkey: serumMarket._decoded.eventQueue,
        isWritable: true,
        isSigner: false,
      },
      {
        // @ts-ignore
        pubkey: serumMarket._decoded.baseVault,
        isWritable: true,
        isSigner: false,
      },
      {
        // @ts-ignore
        pubkey: serumMarket._decoded.quoteVault,
        isWritable: true,
        isSigner: false,
      },
      { pubkey: vaultSigner, isWritable: false, isSigner: false },
      { pubkey: TOKEN_PROGRAM_ID, isWritable: false, isSigner: false },
      { pubkey: web3.SYSVAR_RENT_PUBKEY, isWritable: false, isSigner: false },
      // This is the SRM referral account
      // TODO: Maybe actually implement this?
      { pubkey: web3.SYSVAR_RENT_PUBKEY, isWritable: false, isSigner: false },
      { pubkey: strategyKey, isWritable: false, isSigner: false },
      { pubkey: collateralAccount, isWritable: false, isSigner: false },
      { pubkey: tradeDestinationAccount, isWritable: true, isSigner: false },
      { pubkey: destinationMint, isWritable: false, isSigner: false },
    ];
  }

  static async reclaimAccounts(
    remoteProgramId: web3.PublicKey,
    serumMarket: Market,
    strategyKey: web3.PublicKey,
    collateralAccount: web3.PublicKey,
    destinationAccount: web3.PublicKey
  ): Promise<web3.AccountMeta[]> {
    const [[openOrdersKey], vaultSigner] = await Promise.all([
      this.deriveOpenOrders(remoteProgramId, strategyKey),
      this.deriveVaultSigner(serumMarket),
    ]);
    return [
      { pubkey: serumMarket.programId, isWritable: false, isSigner: false },
      { pubkey: serumMarket.address, isWritable: false, isSigner: false },
      { pubkey: serumMarket.bidsAddress, isWritable: false, isSigner: false },
      { pubkey: serumMarket.asksAddress, isWritable: false, isSigner: false },
      { pubkey: openOrdersKey, isWritable: true, isSigner: false },
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
      { pubkey: TOKEN_PROGRAM_ID, isWritable: false, isSigner: false },
      { pubkey: web3.SYSVAR_RENT_PUBKEY, isWritable: false, isSigner: false },
      // This is the SRM referral account
      // TODO: Maybe actually implement this?
      { pubkey: web3.SYSVAR_RENT_PUBKEY, isWritable: false, isSigner: false },
      { pubkey: strategyKey, isWritable: false, isSigner: false },
      { pubkey: collateralAccount, isWritable: true, isSigner: false },
      { pubkey: destinationAccount, isWritable: false, isSigner: false },
    ];
  }
}
