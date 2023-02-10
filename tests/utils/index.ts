import * as fs from "fs";
import { splTokenProgram } from "@coral-xyz/spl-token";
import { Provider, web3 } from "@project-serum/anchor";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddress,
  MintLayout,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { parseTranactionError } from "../../packages/poseidon/src";
import { bs58 } from "@project-serum/anchor/dist/cjs/utils/bytes";

export const USDC_MINT = new web3.PublicKey(
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
);
export const SOL_USDC_SERUM_MARKET = new web3.PublicKey(
  "8BnEgHoWFysVcuFFX7QztDmzuH8r5ZFvyP3sYwn1XTh6"
);
export const SOL_USDC_OPEN_BOOK_MARKET = new web3.PublicKey(
  "8BnEgHoWFysVcuFFX7QztDmzuH8r5ZFvyP3sYwn1XTh6"
);
export const DEX_ID = new web3.PublicKey(
  "srmqPvymJeFKQ4zGQed1GFppgkRHL9kaELCbyksJtPX"
);

export const OPEN_BOOK_DEX_ID = new web3.PublicKey(
  "srmqPvymJeFKQ4zGQed1GFppgkRHL9kaELCbyksJtPX"
);

export const initNewTokenMintInstructions = async (
  provider: Provider,
  /** The owner for the new mint account */
  owner: web3.PublicKey,
  decimals: number
) => {
  const tokenProgram = splTokenProgram();
  const payerKey = provider.publicKey;
  const mintAccount = new web3.Keypair();
  const instructions: web3.TransactionInstruction[] = [];
  // Create the Option Mint Account with rent exemption
  // Allocate memory for the account
  const mintRentBalance =
    await provider.connection.getMinimumBalanceForRentExemption(
      MintLayout.span
    );

  instructions.push(
    web3.SystemProgram.createAccount({
      fromPubkey: payerKey,
      newAccountPubkey: mintAccount.publicKey,
      lamports: mintRentBalance,
      space: MintLayout.span,
      programId: TOKEN_PROGRAM_ID,
    })
  );
  instructions.push(
    await tokenProgram.methods
      .initializeMint2(decimals, owner, null)
      .accounts({
        mint: mintAccount.publicKey,
      })
      .instruction()
  );
  return {
    instructions,
    mintAccount,
  };
};

export const createAssociatedTokenInstruction = async (
  provider: Provider,
  mint: web3.PublicKey,
  owner: web3.PublicKey | undefined = undefined
) => {
  const payerKey = provider.publicKey;
  const associatedAddress = await getAssociatedTokenAddress(
    mint,
    owner || payerKey
  );
  const instruction = createAssociatedTokenAccountInstruction(
    payerKey,
    associatedAddress,
    owner || payerKey,
    mint
  );
  return { instruction, associatedAddress };
};

export const wait = (delayMS: number) =>
  new Promise((resolve) => setTimeout(resolve, delayMS));

/**
 * simple but useful shortcut
 */
export default function tryCatch<T>(
  tryFunction: () => T,
  catchFunction?: (err: unknown) => T
): T {
  try {
    return tryFunction();
  } catch (err) {
    return catchFunction?.(err);
  }
}

export const loadPayer = (keypairPath: string): web3.Keypair => {
  if (keypairPath) {
    return web3.Keypair.fromSecretKey(
      Buffer.from(
        JSON.parse(
          fs.readFileSync(keypairPath, {
            encoding: "utf-8",
          })
        )
      )
    );
  } else if (process.env.SECRET_KEY) {
    return web3.Keypair.fromSecretKey(
      Buffer.from(JSON.parse(process.env.SECRET_KEY))
    );
  } else {
    throw new Error(
      "You must specify option --keypair or SECRET_KEY env variable"
    );
  }
};

export const createLookUpTable = async (
  provider: Provider,
  remainingAccounts: web3.AccountMeta[]
) => {
  const payerKey = provider.publicKey;
  const initialTx = new web3.Transaction();
  // Create ALT
  const slot = await provider.connection.getSlot();
  const [lookupTableInst, lookupTableAddress] =
    web3.AddressLookupTableProgram.createLookupTable({
      authority: payerKey,
      payer: payerKey,
      recentSlot: slot,
    });
  initialTx.add(lookupTableInst);
  // extend ALT with chunk of accounts
  const extendInstruction = web3.AddressLookupTableProgram.extendLookupTable({
    payer: payerKey,
    authority: payerKey,
    lookupTable: lookupTableAddress,
    addresses: remainingAccounts.map((x) => x.pubkey).slice(0, 20),
  });
  initialTx.add(extendInstruction);
  await provider.sendAndConfirm(initialTx, [], {
    skipPreflight: true,
  });

  // extend ALT with
  if (remainingAccounts.length > 20) {
    const secondExtendTx = new web3.Transaction();
    const extendInstruction2 = web3.AddressLookupTableProgram.extendLookupTable(
      {
        payer: payerKey,
        authority: payerKey,
        lookupTable: lookupTableAddress,
        addresses: remainingAccounts.map((x) => x.pubkey).slice(20),
      }
    );
    secondExtendTx.add(extendInstruction2);
    await provider.sendAndConfirm(secondExtendTx);
  }
  return lookupTableAddress;
};

export const compileAndSendV0Tx = async (
  provider: Provider,
  payerKeypair: web3.Keypair,
  lookupTableAddress: web3.PublicKey,
  instructions: web3.TransactionInstruction[],
  onError: (err: Error) => void = () => {}
) => {
  let blockhash = await provider.connection
    .getLatestBlockhash()
    .then((res) => res.blockhash);
  const lookupTableAccount = await provider.connection
    // @ts-ignore: This is actually on the object, the IDE is wrong
    .getAddressLookupTable(lookupTableAddress)
    .then((res) => res.value);
  // Wait until the current slot is greater than the last extended slot
  let currentSlot = lookupTableAccount.state.lastExtendedSlot as number;
  while (currentSlot <= lookupTableAccount.state.lastExtendedSlot) {
    currentSlot = await provider.connection.getSlot();
    await wait(250);
  }
  const messageV0 = new web3.TransactionMessage({
    payerKey: provider.publicKey,
    recentBlockhash: blockhash,
    instructions,
  }).compileToV0Message([lookupTableAccount]);
  const transaction = new web3.VersionedTransaction(messageV0);
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
    const txid = await web3.sendAndConfirmRawTransaction(
      provider.connection,
      Buffer.from(transaction.serialize()),
      confirmationStrategy,
      {
        skipPreflight: false,
      }
    );
  } catch (error) {
    onError(error);
  }
};
