import { parseIdlErrors, ProgramError, web3 } from "@project-serum/anchor";
import { IDL } from "./serum_remote";
import { Bound, OrderSide } from "./types";

type EndpointTypes = "mainnet" | "devnet" | "localnet";

const idlErrors = parseIdlErrors(IDL);

export const parseTranactionError = (error: any) =>
  ProgramError.parse(error, idlErrors);

export const getProgramId = (cluster: EndpointTypes) => {
  switch (cluster) {
    case "devnet":
      return new web3.PublicKey("8TJjyzq3iXc48MgV6TD5DumKKwfWKU14Jr9pwgnAbpzs");
    default:
      throw new Error("Unsupported cluster version");
  }
};

export const getDexId = (cluster: EndpointTypes) => {
  switch (cluster) {
    case "devnet":
      return new web3.PublicKey("DESVgJVGajEgKGXhb6XmqDHGz3VjdgP7rEVESBgxmroY");
    case "mainnet":
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
