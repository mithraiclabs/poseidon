import { splTokenProgram } from "@coral-xyz/spl-token";
import { Provider, web3 } from "@project-serum/anchor";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountInstruction,
  getAssociatedTokenAddress,
  MintLayout,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";

export const USDC_MINT = new web3.PublicKey(
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
);
export const SOL_USDC_SERUM_MARKET = new web3.PublicKey(
  "9wFFyRfZBsuAha4YcuxcXLKwMxJR43S7fPfQLusDBzvT"
);
export const SOL_USDC_OPEN_BOOK_MARKET = new web3.PublicKey(
  "8BnEgHoWFysVcuFFX7QztDmzuH8r5ZFvyP3sYwn1XTh6"
);
export const DEX_ID = new web3.PublicKey(
  "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin"
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
