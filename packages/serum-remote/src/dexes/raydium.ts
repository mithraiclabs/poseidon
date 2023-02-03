import { web3 } from "@project-serum/anchor";
import { Market } from "@project-serum/serum";
import {
  Liquidity,
  LIQUIDITY_PROGRAMID_TO_VERSION,
  LIQUIDITY_VERSION_TO_SERUM_VERSION,
  TOKEN_PROGRAM_ID,
} from "@raydium-io/raydium-sdk";
import OpenBookDex from "./openBookDex";

export default class Raydium {
  public static V4_PROGRAM_ID: web3.PublicKey = new web3.PublicKey(
    "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8"
  );

  static initLegAccounts(
    baseMint: web3.PublicKey,
    baseDecimals: number,
    quoteMint: web3.PublicKey,
    quoteDecimals: number,
    serumMarket: Market,
    strategyKey: web3.PublicKey,
    tradeSourceAccount: web3.PublicKey,
    tradeDestinationAccount: web3.PublicKey,
    destinationMint: web3.PublicKey
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
      { pubkey: associatedPoolKeys.id, isWritable: false, isSigner: false },
      {
        pubkey: associatedPoolKeys.authority,
        isWritable: false,
        isSigner: false,
      },
      {
        pubkey: associatedPoolKeys.openOrders,
        isWritable: false,
        isSigner: false,
      },
      {
        pubkey: associatedPoolKeys.targetOrders,
        isWritable: false,
        isSigner: false,
      },
      {
        pubkey: associatedPoolKeys.baseVault,
        isWritable: false,
        isSigner: false,
      },
      {
        pubkey: associatedPoolKeys.quoteVault,
        isWritable: false,
        isSigner: false,
      },
      {
        pubkey: associatedPoolKeys.marketProgramId,
        isWritable: false,
        isSigner: false,
      },
      {
        pubkey: associatedPoolKeys.marketId,
        isWritable: false,
        isSigner: false,
      },
      {
        pubkey: serumMarket.bidsAddress,
        isWritable: false,
        isSigner: false,
      },
      { pubkey: serumMarket.asksAddress, isWritable: false, isSigner: false },
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
      { pubkey: tradeSourceAccount, isWritable: false, isSigner: false },
      // If this is not the final Leg in a Route, than it must be writable.
      { pubkey: tradeDestinationAccount, isWritable: true, isSigner: false },
      { pubkey: strategyKey, isWritable: false, isSigner: false },
      { pubkey: TOKEN_PROGRAM_ID, isWritable: false, isSigner: false },
      { pubkey: destinationMint, isWritable: false, isSigner: false },
    ];
  }

  static tradeAccounts(
    baseMint: web3.PublicKey,
    baseDecimals: number,
    quoteMint: web3.PublicKey,
    quoteDecimals: number,
    serumMarket: Market,
    strategyKey: web3.PublicKey,
    tradeSourceAccount: web3.PublicKey,
    tradeDestinationAccount: web3.PublicKey,
    destinationMint: web3.PublicKey
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
      { pubkey: associatedPoolKeys.id, isWritable: false, isSigner: false },
      {
        pubkey: associatedPoolKeys.authority,
        isWritable: false,
        isSigner: false,
      },
      {
        pubkey: associatedPoolKeys.openOrders,
        isWritable: false,
        isSigner: false,
      },
      {
        pubkey: associatedPoolKeys.targetOrders,
        isWritable: false,
        isSigner: false,
      },
      {
        pubkey: associatedPoolKeys.baseVault,
        isWritable: false,
        isSigner: false,
      },
      {
        pubkey: associatedPoolKeys.quoteVault,
        isWritable: false,
        isSigner: false,
      },
      {
        pubkey: associatedPoolKeys.marketProgramId,
        isWritable: false,
        isSigner: false,
      },
      {
        pubkey: associatedPoolKeys.marketId,
        isWritable: false,
        isSigner: false,
      },
      {
        pubkey: serumMarket.bidsAddress,
        isWritable: false,
        isSigner: false,
      },
      { pubkey: serumMarket.asksAddress, isWritable: false, isSigner: false },
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
      { pubkey: tradeSourceAccount, isWritable: false, isSigner: false },
      // If this is not the final Leg in a Route, than it must be writable.
      { pubkey: tradeDestinationAccount, isWritable: true, isSigner: false },
      { pubkey: strategyKey, isWritable: false, isSigner: false },
      { pubkey: TOKEN_PROGRAM_ID, isWritable: false, isSigner: false },
      { pubkey: destinationMint, isWritable: false, isSigner: false },
    ];
  }
}
