import { BN, web3 } from "@project-serum/anchor";

export type BoundedStrategyParams = {
  boundPrice: BN;
  reclaimDate: BN;
  reclaimAddress: web3.PublicKey;
  orderSide: number;
  bound: number;
};
