import { Provider, web3 } from "@project-serum/anchor";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  MintLayout,
  Token,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";

export const USDC_MINT = new web3.PublicKey(
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
);
export const SOL_USDC_SERUM_MARKET = new web3.PublicKey(
  "9wFFyRfZBsuAha4YcuxcXLKwMxJR43S7fPfQLusDBzvT"
);
export const DEX_ID = new web3.PublicKey(
  "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin"
);

export const initNewTokenMintInstructions = async (
  provider: Provider,
  /** The owner for the new mint account */
  owner: web3.PublicKey,
  decimals: number
) => {
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
      fromPubkey: provider.wallet.publicKey,
      newAccountPubkey: mintAccount.publicKey,
      lamports: mintRentBalance,
      space: MintLayout.span,
      programId: TOKEN_PROGRAM_ID,
    })
  );
  instructions.push(
    Token.createInitMintInstruction(
      TOKEN_PROGRAM_ID,
      mintAccount.publicKey,
      decimals,
      owner,
      null
    )
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
  const associatedAddress = await Token.getAssociatedTokenAddress(
    ASSOCIATED_TOKEN_PROGRAM_ID,
    TOKEN_PROGRAM_ID,
    mint,
    owner || provider.wallet.publicKey
  );
  const instruction = Token.createAssociatedTokenAccountInstruction(
    ASSOCIATED_TOKEN_PROGRAM_ID,
    TOKEN_PROGRAM_ID,
    mint,
    associatedAddress,
    owner || provider.wallet.publicKey,
    provider.wallet.publicKey
  );
  return { instruction, associatedAddress };
};

export const wait = (delayMS: number) =>
  new Promise((resolve) => setTimeout(resolve, delayMS));
