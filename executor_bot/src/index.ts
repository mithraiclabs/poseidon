import * as fs from "fs";
import * as anchor from "@project-serum/anchor";
import { Program, Provider, web3 } from "@project-serum/anchor";
import { getProgramId, SerumRemote, IDL } from "@mithraic-labs/serum-remote";
import config from "./config";
import NodeWallet from "@project-serum/anchor/dist/cjs/nodewallet";

const AWS_SOLANA_KEY_FILE_PATH = "/run/secrets/solana_priv_key";
// Poll the RPC node for new accounts every 10 min
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
  // TODO: use dynamic cluster name
  // Create new Serum Remote program
  const serumRemoteProgramId = getProgramId("devnet");
  const program = new Program<SerumRemote>(IDL, serumRemoteProgramId, provider);

  // Query get program accounts to all bounded strategies.
  const boundedStrategies = await program.account.boundedStrategy.all();
  console.log("*** boundedStrategies", boundedStrategies);

  // TODO: check & handle which are executable

  // TODO: check & handle reclaiming assets for those that have expired
})();
