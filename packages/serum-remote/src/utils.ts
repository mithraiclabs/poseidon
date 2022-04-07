import { parseIdlErrors, ProgramError, web3 } from "@project-serum/anchor";
import { IDL } from "./serum_remote";
import { Bound, OrderSide, SolCluster } from "./types";

const idlErrors = parseIdlErrors(IDL);

export const parseTranactionError = (error: any) =>
  ProgramError.parse(error, idlErrors);

export const getProgramId = (cluster: SolCluster) => {
  switch (cluster) {
    case "devnet":
      return new web3.PublicKey("8TJjyzq3iXc48MgV6TD5DumKKwfWKU14Jr9pwgnAbpzs");
    default:
      throw new Error("Unsupported cluster version");
  }
};

/**
 * Given a connection to any node, return the cluster name
 */
export const getClusterNameFromConnection = async (
  connection: web3.Connection
): Promise<SolCluster> => {
  const genesisHash = await connection.getGenesisHash();
  switch (genesisHash) {
    case "5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d":
      return "mainnet-beta";
    case "EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG":
      return "devnet";
    case "4uhcVJyU9pJkvQyS88uRDiswHXSCkY3zQawwpjk2NsNY":
      return "testnet";
    default:
      return "localnet";
  }
};

export const getDexId = (cluster: SolCluster) => {
  switch (cluster) {
    case "devnet":
      return new web3.PublicKey("DESVgJVGajEgKGXhb6XmqDHGz3VjdgP7rEVESBgxmroY");
    case "mainnet-beta":
      return new web3.PublicKey("9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin");
    default:
      throw new Error("Unsupported cluster version");
  }
};

export const boundOptions = (() => {
  const options: string[] = [];
  for (let bound in Bound) {
    if (isNaN(Number(bound))) {
      options.push(bound);
    }
  }
  return options;
})();

export const orderSideOptions = (() => {
  const options: string[] = [];
  for (let side in OrderSide) {
    if (isNaN(Number(side))) {
      options.push(side);
    }
  }
  return options;
})();
