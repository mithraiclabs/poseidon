import { web3 } from "@coral-xyz/anchor";
import { Market } from "@project-serum/serum";
import {
  Liquidity,
  LIQUIDITY_PROGRAMID_TO_VERSION,
  LIQUIDITY_VERSION_TO_SERUM_VERSION,
  TOKEN_PROGRAM_ID,
} from "@raydium-io/raydium-sdk";
import { SolCluster } from "../types";
import OpenBookDex from "./openBookDex";

export const SERUM_V3_PROGRAM_ID = new web3.PublicKey(
  "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin"
);

export default class Raydium {
  public static V4_PROGRAM_ID: web3.PublicKey = new web3.PublicKey(
    "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8"
  );
  public static V4_DEVNET_PROGRAM_ID: web3.PublicKey = new web3.PublicKey(
    "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8"
  );

  static programId(cluster: SolCluster) {
    if (cluster === "devnet") {
      return this.V4_DEVNET_PROGRAM_ID;
    } else if (["mainnet", "mainnet-beta"].includes(cluster)) {
      return this.V4_PROGRAM_ID;
    } else {
      throw new Error("Unsupported cluster version");
    }
  }

  static tradeAccounts(
    baseMint: web3.PublicKey,
    baseDecimals: number,
    quoteMint: web3.PublicKey,
    quoteDecimals: number,
    serumMarket: Market,
    tradeSourceAccount: web3.PublicKey,
    tradeSourceOwner: web3.PublicKey,
    tradeDestinationAccount: web3.PublicKey
  ): web3.AccountMeta[] {
    // find associated poolKeys for market
    const liquidityVersion =
      LIQUIDITY_PROGRAMID_TO_VERSION[this.V4_PROGRAM_ID.toString()];
    const associatedPoolKeys = Liquidity.getAssociatedPoolKeys({
      version: liquidityVersion,
      marketVersion: LIQUIDITY_VERSION_TO_SERUM_VERSION[liquidityVersion],
      baseMint,
      quoteMint,
      baseDecimals,
      quoteDecimals,
      marketId: serumMarket.address,
      programId: this.V4_PROGRAM_ID,
      marketProgramId: serumMarket.programId,
    });

    const vaultSigner = OpenBookDex.deriveVaultSigner(serumMarket);

    return [
      { pubkey: this.V4_PROGRAM_ID, isWritable: false, isSigner: false },
      { pubkey: associatedPoolKeys.id, isWritable: true, isSigner: false },
      {
        pubkey: associatedPoolKeys.authority,
        isWritable: false,
        isSigner: false,
      },
      {
        pubkey: associatedPoolKeys.openOrders,
        isWritable: true,
        isSigner: false,
      },
      {
        pubkey: associatedPoolKeys.targetOrders,
        isWritable: true,
        isSigner: false,
      },
      {
        pubkey: associatedPoolKeys.baseVault,
        isWritable: true,
        isSigner: false,
      },
      {
        pubkey: associatedPoolKeys.quoteVault,
        isWritable: true,
        isSigner: false,
      },
      {
        pubkey: associatedPoolKeys.marketProgramId,
        isWritable: false,
        isSigner: false,
      },
      {
        pubkey: associatedPoolKeys.marketId,
        isWritable: true,
        isSigner: false,
      },
      {
        pubkey: serumMarket.bidsAddress,
        isWritable: true,
        isSigner: false,
      },
      { pubkey: serumMarket.asksAddress, isWritable: true, isSigner: false },
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
      { pubkey: tradeSourceAccount, isWritable: true, isSigner: false },
      // If this is not the final Leg in a Route, than it must be writable.
      { pubkey: tradeDestinationAccount, isWritable: true, isSigner: false },
      { pubkey: tradeSourceOwner, isWritable: false, isSigner: false },
      { pubkey: TOKEN_PROGRAM_ID, isWritable: false, isSigner: false },
    ];
  }
}
