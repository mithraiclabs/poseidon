import { Provider, web3 } from "@project-serum/anchor";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  MintLayout,
  Token,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";

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
