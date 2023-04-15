import * as fs from "fs";
import * as anchor from "@project-serum/anchor";
import { AnchorProvider, Program, web3 } from "@project-serum/anchor";
import {
  IDL,
  Poseidon,
  getProgramId,
  BoundedStrategyV2,
  getTradeAccounts,
  SolCluster,
} from "@mithraic-labs/poseidon";
import config from "./config";
import NodeWallet from "@project-serum/anchor/dist/cjs/nodewallet";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { getQuote } from "./quote";

export const wait = (delayMS: number) =>
  new Promise((resolve) => setTimeout(resolve, delayMS));

// Poll the RPC node for new accounts and execution every 10 min
const POLL_INTERVAL = 600 * 1_000;

export const loadPayer = (keypairPath: string): anchor.web3.Keypair => {
  if (keypairPath) {
    return anchor.web3.Keypair.fromSecretKey(
      Buffer.from(
        JSON.parse(
          fs.readFileSync(keypairPath, {
            encoding: "utf-8",
          })
        )
      )
    );
  } else if (process.env.SECRET_KEY) {
    return anchor.web3.Keypair.fromSecretKey(
      Buffer.from(JSON.parse(process.env.SECRET_KEY))
    );
  } else {
    throw new Error(
      "You must specify option --keypair or SECRET_KEY env variable"
    );
  }
};

const connection = new web3.Connection(config.jsonRpcUrl);
(async () => {
  const payer = loadPayer(config.solanaKeypairPath);
  const provider = new AnchorProvider(connection, new NodeWallet(payer), {});
  // Create new Serum Remote program
  const serumRemoteProgramId = getProgramId(config.cluster);
  const program = new Program<Poseidon>(IDL, serumRemoteProgramId, provider);

  while (true) {
    // Query get program accounts to all bounded strategies.
    const boundedStrategies = await program.account.boundedStrategyV2.all();
    console.log({ boundedStrategies });
    const currentTime = new Date().getTime() / 1_000;
    await Promise.all(
      boundedStrategies.map(async (boundedStrategy) => {
        const transaction = new web3.Transaction();
        const strategy = boundedStrategy.account as BoundedStrategyV2;
        // handle reclaiming assets for those that have expired
        if (strategy.reclaimDate.toNumber() < currentTime) {
          const ix = program.instruction.reclaimV2({
            accounts: {
              receiver: payer.publicKey,
              strategy: boundedStrategy.publicKey,
              collateralAccount: strategy.collateralAccount,
              reclaimAccount: strategy.reclaimAddress,
              tokenProgram: TOKEN_PROGRAM_ID,
            },
          });
          transaction.add(ix);
        } else {
          const { marketIds, destinationMint } = await getQuote({
            boundedStrategy: strategy,
            connection,
          });
          if (marketIds.length) {
            const { remainingAccounts, additionalData } =
              await getTradeAccounts(
                connection,
                process.env.SOLANA_CLUSTER as SolCluster,
                marketIds,
                boundedStrategy.publicKey,
                strategy.collateralAccount,
                strategy.depositAddress,
                destinationMint
              );
            const ix = await program.methods
              .boundedTradeV2(additionalData)
              .accounts({
                payer: payer.publicKey,
                strategy: boundedStrategy.publicKey,
                orderPayer: strategy.collateralAccount,
                depositAccount: strategy.depositAddress,
                tokenProgram: TOKEN_PROGRAM_ID,
              })
              .remainingAccounts(remainingAccounts)
              .instruction();
            transaction.add(ix);
          }

          if (transaction.instructions.length) {
            await program.provider.sendAndConfirm(transaction);
          }
        }
      })
    );
    await wait(POLL_INTERVAL);
  }
})();
