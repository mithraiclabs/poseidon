import { AnchorProvider, Program } from "@project-serum/anchor";
import {
  IDL,
  Poseidon,
  getProgramId,
  BoundedStrategyV2,
} from "@mithraic-labs/poseidon";
import config from "./config";
import NodeWallet from "@project-serum/anchor/dist/cjs/nodewallet";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token2";
import { getQuote } from "./quote";
import { Connection, Transaction, ComputeBudgetProgram } from "@solana/web3.js";
import {
  closeOpenOrdersForPayer,
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
  console.log("starting up...");
  while (true) {
    console.log("loading bounded strategies...");
    // Query get program accounts to all bounded strategies.
    const boundedStrategies = await program.account.boundedStrategyV2.all();
    console.log({ boundedStrategies });
    const currentTime = new Date().getTime() / 1_000;
    for (let i = 0; i < boundedStrategies.length; i++) {
      const boundedStrategy = boundedStrategies[i];
      // build fails if we don't precast to 'unknown'
      const strategy = boundedStrategy.account as unknown as BoundedStrategyV2;
      if (strategy.reclaimDate.toNumber() < currentTime) {
        // handle reclaiming assets for those that have expired
        console.log("reclaiming funds for ", boundedStrategy.publicKey);
        const ix = program.instruction.reclaimV2({
          accounts: {
            receiver: payer.publicKey,
            strategy: boundedStrategy.publicKey,
            collateralAccount: strategy.collateralAccount,
            reclaimAccount: strategy.reclaimAddress,
            tokenProgram: TOKEN_PROGRAM_ID,
          },
        });
        const reclaimSignature = await program.provider.sendAndConfirm(
          new Transaction().add(ix)
        );
        console.log("executed tx for reclaim", { reclaimSignature });
      } else {
        // get all the accounts needed for this trade, in accordance with the max allowed price
        console.log("getting quote for ", boundedStrategy.publicKey);
        const { remainingAccounts, additionalData } = await getQuote({
          boundedStrategy: strategy,
          connection,
          payer,
        });

        if (remainingAccounts.length) {
          // this would mean that there wasn't a route mathcing the price set by the strategy
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
          // starting at 3 legs, the compute limit will get hit so we adjust that
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
          const v2TradeSignature = await compileAndSendV0Tx(
            program.provider,
            payer,
            lookupTableAddress,
            [modifyComputeUnits, addPriorityFee, ix],
            (err) => {
              console.error(err);
            }
          );
          if (v2TradeSignature) {
            console.log("Done with executing v2 trade", { v2TradeSignature });
          } else {
            console.log("Couldn't complete v2 trade");
          }
        } else {
          console.log("No route found");
        }
      }
    }
    await closeOpenOrdersForPayer(provider, payer);
    await wait(POLL_INTERVAL);
  }
})();
