import * as fs from "fs";
import * as anchor from "@project-serum/anchor";
import { Program, Provider, web3 } from "@project-serum/anchor";
import {
  getProgramId,
  instructions,
  SerumRemote,
  IDL,
} from "@mithraic-labs/serum-remote";
import config from "./config";
import NodeWallet from "@project-serum/anchor/dist/cjs/nodewallet";
import { Market } from "@project-serum/serum";

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
  const provider = new Provider(connection, new NodeWallet(payer), {});
  // Create new Serum Remote program
  const serumRemoteProgramId = getProgramId(config.cluster);
  const program = new Program<SerumRemote>(IDL, serumRemoteProgramId, provider);

  while (true) {
    // Query get program accounts to all bounded strategies.
    const boundedStrategies = await program.account.boundedStrategy.all();

    const currentTime = new Date().getTime() / 1_000;
    await Promise.all(
      boundedStrategies.map(async (boundedStrategy) => {
        // Backwards compatibility for old Devnet program. Can be removed April 12, 2022
        if (
          boundedStrategy.account.serumDexId.toString() ===
          web3.SystemProgram.programId.toString()
        ) {
          return;
        }
        const transaction = new web3.Transaction();
        // handle reclaiming assets for those that have expired
        if (boundedStrategy.account.reclaimDate.toNumber() < currentTime) {
          const ix = instructions.reclaimIx(
            program,
            boundedStrategy.publicKey,
            boundedStrategy.account,
            boundedStrategy.account.serumDexId
          );
          transaction.add(ix);
        } else {
          const serumMarket = await Market.load(
            connection,
            boundedStrategy.account.serumMarket,
            {},
            boundedStrategy.account.serumDexId
          );
          // Check the current price to see if the transaction should be sent
          const [bids, asks] = await Promise.all([
            serumMarket.loadBids(connection),
            serumMarket.loadAsks(connection),
          ]);

          const humanReadableBoundPrice = serumMarket.priceLotsToNumber(
            boundedStrategy.account.boundedPrice
          );
          const lowestAsk = asks.getL2(1)[0];
          const highestBid = bids.getL2(1)[0];

          if (
            (boundedStrategy.account.orderSide === 0 &&
              lowestAsk[0] < humanReadableBoundPrice) ||
            (boundedStrategy.account.orderSide === 1 &&
              highestBid[0] > humanReadableBoundPrice)
          ) {
            const ix = await instructions.boundedTradeIx(
              program,
              boundedStrategy.publicKey,
              serumMarket,
              boundedStrategy.account
            );
            transaction.add(ix);
          }

          if (transaction.instructions.length) {
            await program.provider.send(transaction);
          }
        }
      })
    );
    await wait(POLL_INTERVAL);
  }
})();
