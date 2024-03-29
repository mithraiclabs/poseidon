import { bs58 } from "@coral-xyz/anchor/dist/cjs/utils/bytes";
import { Provider, AnchorProvider } from "@project-serum/anchor";
import { DexInstructions, OpenOrders } from "@project-serum/serum";
import {
  Transaction,
  Keypair,
  TransactionMessage,
  sendAndConfirmRawTransaction,
  PublicKey,
  TransactionInstruction,
  VersionedTransaction,
  AddressLookupTableProgram,
  AccountMeta,
} from "@solana/web3.js";
import * as fs from "fs";
import { OPENBOOK_V3_PROGRAM_ID } from "./constants";

export const loadPayer = (keypairPath: string): Keypair => {
  if (keypairPath) {
    return Keypair.fromSecretKey(
      Buffer.from(
        JSON.parse(
          fs.readFileSync(keypairPath, {
            encoding: "utf-8",
          })
        )
      )
    );
  } else if (process.env.SECRET_KEY) {
    return Keypair.fromSecretKey(
      Buffer.from(JSON.parse(process.env.SECRET_KEY))
    );
  } else {
    throw new Error(
      "You must specify option --keypair or SECRET_KEY env variable"
    );
  }
};

export const closeOpenOrdersForPayer = async (
  provider: AnchorProvider,
  payer: Keypair
) => {
  const allOpenOrders = await OpenOrders.findForOwner(
    provider.connection,
    payer.publicKey,
    OPENBOOK_V3_PROGRAM_ID
  );
  const openOrdersTx = new Transaction();
  for (let _orders of allOpenOrders) {
    openOrdersTx.add(
      DexInstructions.closeOpenOrders({
        market: _orders.market,
        openOrders: _orders.publicKey,
        owner: payer.publicKey,
        solWallet: payer.publicKey,
        programId: OPENBOOK_V3_PROGRAM_ID,
      })
    );
  }
  if (openOrdersTx.instructions.length) {
    console.log(
      `Closing ${openOrdersTx.instructions.length} open orders accounts...`
    );
    try {
      const closeSign = await provider.sendAndConfirm(openOrdersTx, [payer]);
      console.log("Successufully closed open orders accounts!", { closeSign });
    } catch (error) {
      console.error("Open orders account closing tx failed", { error });
    }
  }
};

export const sendWithRetries = async (
  provider: Provider,
  transaction: Transaction,
  payer: Keypair,
  retries?: number
) => {
  const MAX_RETRIES = retries ?? 5;
  for (let i = 0; i < MAX_RETRIES; i++) {
    try {
      const tx = await provider.sendAndConfirm(transaction, [payer]);
      return tx;
    } catch (error) {
      console.log("Couldn't confirm tx, trying again in 10s", {
        error,
      });
      await wait(10000);
    }
  }
  return null;
};

export const compileAndSendV0Tx = async (
  provider: Provider,
  payerKeypair: Keypair,
  lookupTableAddress: PublicKey,
  instructions: TransactionInstruction[],
  onError: (err: Error) => void = (err: Error) => {
    console.log({ err });
  }
) => {
  let blockhash = await provider.connection
    .getLatestBlockhash()
    .then((res) => res.blockhash);
  const lookupTableAccount = await provider.connection
    .getAddressLookupTable(lookupTableAddress)
    .then((res) => res.value);
  // Wait until the current slot is greater than the last extended slot
  let currentSlot = lookupTableAccount.state.lastExtendedSlot as number;
  while (currentSlot <= lookupTableAccount.state.lastExtendedSlot) {
    currentSlot = await provider.connection.getSlot();
    await wait(250);
  }
  const messageV0 = new TransactionMessage({
    payerKey: payerKeypair.publicKey,
    recentBlockhash: blockhash,
    instructions,
  }).compileToV0Message([lookupTableAccount]);
  const transaction = new VersionedTransaction(messageV0);
  try {
    // Create an versioned transaction and send with the ALT
    const blockHeight = await provider.connection.getBlockHeight("processed");
    transaction.sign([payerKeypair]);
    const txSig = bs58.encode(transaction.signatures[0]);
    const confirmationStrategy = {
      signature: txSig,
      blockhash: blockhash,
      lastValidBlockHeight: blockHeight + 50,
    };
    const txid = await sendAndConfirmRawTransaction(
      provider.connection,
      Buffer.from(transaction.serialize()),
      confirmationStrategy,
      {
        skipPreflight: false,
      }
    );
    return txid;
  } catch (error) {
    onError(error);
  }
};

export const createLookUpTable = async (
  provider: Provider,
  remainingAccounts: AccountMeta[],
  payer: Keypair
) => {
  const payerKey = payer.publicKey;
  const initialTx = new Transaction();
  console.log({ lengtAccs: remainingAccounts.length });
  try {
    // Create ALT
    const slot = await provider.connection.getSlot();
    const [lookupTableInst, lookupTableAddress] =
      AddressLookupTableProgram.createLookupTable({
        authority: payerKey,
        payer: payerKey,
        recentSlot: slot,
      });
    initialTx.add(lookupTableInst);
    await provider.sendAndConfirm(initialTx, [payer], {
      skipPreflight: true,
    });
    // extend ALT with chunk of accounts
    const groups = splitIntoGroups(remainingAccounts.map((x) => x.pubkey));
    for (let addressGroup of groups) {
      const extTx = new Transaction();
      const extendInstruction = AddressLookupTableProgram.extendLookupTable({
        payer: payerKey,
        authority: payerKey,
        lookupTable: lookupTableAddress,
        addresses: addressGroup,
      });
      extTx.add(extendInstruction);
      await provider.sendAndConfirm(extTx, [payer], {});
      await wait(10000);
    }
    return Promise.resolve(lookupTableAddress);
  } catch (error) {
    console.log({ error }, " while creating lookup table");

    return Promise.reject();
  }
};

export const wait = (delayMS: number) =>
  new Promise((resolve) => setTimeout(resolve, delayMS));

export const splitIntoGroups = <T>(array: T[], groupSize: number = 20) => {
  const groups = [];
  for (let i = 0; i < array.length; i += groupSize) {
    groups.push(array.slice(i, i + groupSize));
  }
  return groups as T[][];
};
