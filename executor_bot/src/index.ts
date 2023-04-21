import { AnchorProvider, Program } from "@project-serum/anchor";
import {
  IDL,
  Poseidon,
  getProgramId,
  BoundedStrategyV2,
} from "@mithraic-labs/poseidon";
import config from "./config";
import NodeWallet from "@project-serum/anchor/dist/cjs/nodewallet";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";
import { getQuote } from "./quote";
import { Connection, Transaction, ComputeBudgetProgram } from "@solana/web3.js";
import {
  compileAndSendV0Tx,
  createLookUpTable,
  loadPayer,
  wait,
} from "./utils";
import { POLL_INTERVAL } from "./constants";

const connection = new Connection(config.jsonRpcUrl);
(async () => {
  const payer = loadPayer(config.solanaKeypairPath);
  const provider = new AnchorProvider(connection, new NodeWallet(payer), {});
  // Create new Serum Remote program
  const serumRemoteProgramId = getProgramId(config.cluster);
  const program = new Program<Poseidon>(IDL, serumRemoteProgramId, provider);
  console.log("starting");
  while (true) {
    // Query get program accounts to all bounded strategies.
    const boundedStrategies = await program.account.boundedStrategyV2.all();
    console.log({ boundedStrategies });
    const currentTime = new Date().getTime() / 1_000;
    for (let i = 0; i < boundedStrategies.length; i++) {
      const boundedStrategy = boundedStrategies[i];
      const strategy = boundedStrategy.account as BoundedStrategyV2;
      // handle reclaiming assets for those that have expired
      if (strategy.reclaimDate.toNumber() < currentTime) {
        console.log("reclaim->>>");
        const ix = program.instruction.reclaimV2({
          accounts: {
            receiver: payer.publicKey,
            strategy: boundedStrategy.publicKey,
            collateralAccount: strategy.collateralAccount,
            reclaimAccount: strategy.reclaimAddress,
            tokenProgram: TOKEN_PROGRAM_ID,
          },
        });
        await program.provider.sendAndConfirm(new Transaction().add(ix));
        console.log("executed tx for reclaim");
      } else {
        console.log("getting quote->>>");
        const { remainingAccounts, additionalData, createdTokenAccounts } =
          await getQuote({
            boundedStrategy: strategy,
            connection,
            payer,
          });

        if (remainingAccounts.length) {
          console.log({
            remainingAccounts: remainingAccounts.map((a) =>
              a.pubkey.toString()
            ),
          });

          const ix = await program.methods
            .boundedTradeV2(Buffer.from(additionalData))
            .accounts({
              payer: payer.publicKey,
              strategy: boundedStrategy.publicKey,
              orderPayer: strategy.collateralAccount,
              depositAccount: strategy.depositAddress,
              tokenProgram: TOKEN_PROGRAM_ID,
            })
            .remainingAccounts(remainingAccounts)
            .instruction();
          const modifyComputeUnits = ComputeBudgetProgram.setComputeUnitLimit({
            units: 400000,
          });
          const addPriorityFee = ComputeBudgetProgram.setComputeUnitPrice({
            microLamports: 1,
          });

          const lookupTableAddress = await createLookUpTable(
            program.provider,
            [
              ...modifyComputeUnits.keys,
              ...addPriorityFee.keys,
              ...remainingAccounts,
            ],
            payer
          );
          const tx = await compileAndSendV0Tx(
            program.provider,
            payer,
            lookupTableAddress,
            [modifyComputeUnits, addPriorityFee, ix],
            (err) => {
              console.error(err);
            }
          );
          if (tx) {
            console.log(tx, " done with executing v2 trade");

            // if (createdTokenAccounts.length) {
            //   const closeTx = new Transaction();
            //   for (let accToClose of createdTokenAccounts) {
            //     closeTx.add(
            //       closeAccount({
            //         source: accToClose,
            //         destination: payer.publicKey,
            //         owner: payer.publicKey,
            //       })
            //     );
            //   }
            //   const closeAccSign = await provider.sendAndConfirm(closeTx, [
            //     payer,
            //   ]);
            //   console.log({ closeAccSign });
            // }
          }
        }
      }
    }
    await wait(POLL_INTERVAL);
  }
})();
