import { Market, OpenOrders } from "@project-serum/serum";
import { TOKEN_PROGRAM_ID } from "@raydium-io/raydium-sdk";
import {
  PublicKey,
  AccountMeta,
  SYSVAR_RENT_PUBKEY,
  Connection,
  Transaction,
  Keypair,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import BN from "bn.js";

export const OPENBOOK_V3_PROGRAM_ID = new PublicKey(
  "srmqPvymJeFKQ4zGQed1GFppgkRHL9kaELCbyksJtPX"
);

export const openBookTradeAccounts = async (
  serumMarket: Market,
  collateralAccount: PublicKey,
  tradeDestinationAccount: PublicKey,
  openOrdersKey: PublicKey,
  openOrdersOwner: PublicKey
): Promise<AccountMeta[]> => {
  const vaultSigner = await deriveVaultSigner(serumMarket);
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
    { pubkey: SYSVAR_RENT_PUBKEY, isWritable: false, isSigner: false },
    // This is the SRM referral account
    { pubkey: SYSVAR_RENT_PUBKEY, isWritable: false, isSigner: false },
    { pubkey: openOrdersOwner, isWritable: false, isSigner: false },
    { pubkey: collateralAccount, isWritable: false, isSigner: false },
    { pubkey: tradeDestinationAccount, isWritable: true, isSigner: false },
  ];
};

export const deriveVaultSigner = async (
  serumMarket: Market
): Promise<PublicKey> => {
  // @ts-ignore
  const nonce = serumMarket._decoded.vaultSignerNonce as BN;
  return await PublicKey.createProgramAddressSync(
    [serumMarket.address.toBuffer()].concat(nonce.toArrayLike(Buffer, "le", 8)),
    serumMarket.programId
  );
};

export const openbookData = async (
  connection: Connection,
  marketId: PublicKey,
  payer: Keypair,
  depositAccount: PublicKey,
  collateralAccount: PublicKey
) => {
  const openOrdersKeypair = new Keypair();
  const serumMarketOB = await Market.load(
    connection,
    marketId,
    {},
    OPENBOOK_V3_PROGRAM_ID
  );
  const openOrderAccts = await serumMarketOB.findOpenOrdersAccountsForOwner(
    connection,
    payer.publicKey
  );
  let openOrdersKey = openOrdersKeypair.publicKey;
  if (!openOrderAccts.length) {
    // create open order accounts
    const createOpenOrdersIx = await OpenOrders.makeCreateAccountTransaction(
      connection,
      marketId,
      payer.publicKey,
      openOrdersKey,
      OPENBOOK_V3_PROGRAM_ID
    );
    const openOrdersTx = new Transaction().add(createOpenOrdersIx);

    const latestBlockHash = await connection.getLatestBlockhash();
    openOrdersTx.recentBlockhash = latestBlockHash.blockhash;
    openOrdersTx.lastValidBlockHeight = latestBlockHash.lastValidBlockHeight;
    openOrdersTx.feePayer = payer.publicKey;
    console.log({
      payer: payer.publicKey.toString(),
    });

    const txid = await sendAndConfirmTransaction(connection, openOrdersTx, [
      payer,
      openOrdersKeypair,
    ]);

    console.log({ txid });
  } else {
    openOrdersKey = openOrderAccts[0].publicKey;
  }
  const remainingAccounts = await openBookTradeAccounts(
    serumMarketOB,
    collateralAccount,
    depositAccount,
    openOrdersKey,
    payer.publicKey
  );

  const additionalData = new BN(
    // @ts-ignore
    serumMarketOB._baseSplTokenDecimals
  ).toArrayLike(Buffer, "le", 1);
  return {
    remainingAccounts,
    additionalData,
  };
};
