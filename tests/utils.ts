import { Provider, web3 } from "@project-serum/anchor";
import { MintLayout, Token, TOKEN_PROGRAM_ID } from "@solana/spl-token";

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
