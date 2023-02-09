import { BN, web3 } from "@project-serum/anchor";
import { Market } from "@project-serum/serum";
import { TOKEN_PROGRAM_ID } from "@project-serum/serum/lib/token-instructions";
import { SolCluster } from "../types";

export default class OpenBookDex {
  public static V3_PROGRAM_ID = new web3.PublicKey(
    "srmqPvymJeFKQ4zGQed1GFppgkRHL9kaELCbyksJtPX"
  );

  static programId(cluster: SolCluster) {
    if (cluster === "devnet") {
      return this.V3_PROGRAM_ID;
    } else if (["mainnet", "mainnet-beta"].includes(cluster)) {
      return this.V3_PROGRAM_ID;
    } else {
      throw new Error("Unsupported cluster version");
    }
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

  static async tradeAccounts(
    serumMarket: Market,
    collateralAccount: web3.PublicKey,
    tradeDestinationAccount: web3.PublicKey,
    openOrdersKey: web3.PublicKey,
    openOrdersOwner: web3.PublicKey
  ): Promise<web3.AccountMeta[]> {
    const vaultSigner = await this.deriveVaultSigner(serumMarket);
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
      { pubkey: openOrdersOwner, isWritable: false, isSigner: false },
      { pubkey: collateralAccount, isWritable: false, isSigner: false },
      { pubkey: tradeDestinationAccount, isWritable: true, isSigner: false },
    ];
  }
}
