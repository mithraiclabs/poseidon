import {
  TOKEN_PROGRAM_ID,
  findProgramAddress,
  LIQUIDITY_PROGRAM_ID_V4,
} from "@raydium-io/raydium-sdk";
import { PublicKey } from "@solana/web3.js";
import { Market } from "@project-serum/serum";
import { deriveVaultSigner } from "./openbook";

/**
 * RAYDIUM V4 SWAP ACCOUNT ORDER
 * 0 - Raydium program ID
 * 1 - amm_id
 * 2 - amm_authority
 * 3 - amm_open_orders
 * 4 - amm_target_orders
 * 5 - pool_coin_token_account
 * 6 - pool_pc_token_account
 * 7 - serum_program_id
 * 8 - serum_market
 * 9 - serum_bids
 * 10 - serum_asks
 * 11 - serum_event_queue
 * 12 - serum_coin_vault_account
 * 13 - serum_pc_vault_account
 * 14 - serum_vault_signer
 * 15 - user_source_token_account
 * 16 - user_destination_token_account
 * 17 - user_source_owner
 * 18 - SPL Token Program
 */
export const raydiumTradeAccts = async (
  tradeSourceAccount: PublicKey,
  tradeSourceOwner: PublicKey,
  tradeDestinationAccount: PublicKey,
  serumKeys: {
    serumEventQueue: PublicKey;
    serumCoinVaultAccount: PublicKey;
    serumPcVaultAccount: PublicKey;
  },
  marketId: PublicKey,
  serumMarketKey: PublicKey,
  serumMarket: Market,
  ammOpenOrders: PublicKey,
  ammTargetOrders: PublicKey,
  ammBaseVault: PublicKey,
  ammQuoteVault: PublicKey,
  serumProgramId: PublicKey
) => {
  // find associated poolKeys for market
  const raydium_prog = LIQUIDITY_PROGRAM_ID_V4;

  const ammAuthority = await findProgramAddress(
    // new Uint8Array(Buffer.from('amm authority'.replace('\u00A0', ' '), 'utf-8'))
    [
      Buffer.from([
        97, 109, 109, 32, 97, 117, 116, 104, 111, 114, 105, 116, 121,
      ]),
    ],
    raydium_prog
  );

  const vaultSigner = await deriveVaultSigner(serumMarket);
  return [
    { pubkey: raydium_prog, isWritable: false, isSigner: false },
    { pubkey: marketId, isWritable: true, isSigner: false },
    {
      pubkey: ammAuthority.publicKey,
      isWritable: false,
      isSigner: false,
    },
    {
      pubkey: ammOpenOrders,
      isWritable: true,
      isSigner: false,
    },
    {
      pubkey: ammTargetOrders,
      isWritable: true,
      isSigner: false,
    },
    {
      pubkey: ammBaseVault,
      isWritable: true,
      isSigner: false,
    },
    {
      pubkey: ammQuoteVault,
      isWritable: true,
      isSigner: false,
    },
    {
      pubkey: serumProgramId,
      isWritable: false,
      isSigner: false,
    },
    {
      pubkey: serumMarketKey,
      isWritable: true,
      isSigner: false,
    },
    {
      pubkey: serumMarket.bidsAddress,
      isWritable: true,
      isSigner: false,
    },
    {
      pubkey: serumMarket.asksAddress,
      isWritable: true,
      isSigner: false,
    },
    {
      // @ts-ignore
      pubkey: serumKeys.serumEventQueue,
      isWritable: true,
      isSigner: false,
    },
    {
      // @ts-ignore
      pubkey: serumKeys.serumCoinVaultAccount,
      isWritable: true,
      isSigner: false,
    },
    {
      // @ts-ignore
      pubkey: serumKeys.serumPcVaultAccount,
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
};
