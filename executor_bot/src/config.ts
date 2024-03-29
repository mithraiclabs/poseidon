import { SolCluster } from "@mithraic-labs/poseidon";

export default {
  jsonRpcUrl: process.env.JSON_RPC_URL,
  solanaKeypairPath: process.env.SOLANA_KEYPAIR_PATH,
  cluster: (process.env.SOLANA_CLUSTER || "devnet") as SolCluster,
};
