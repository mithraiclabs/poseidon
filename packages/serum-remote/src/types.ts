import { BN, web3 } from "@project-serum/anchor";

export type BoundedStrategyParams = {
  transferAmount: BN;
  boundPrice: BN;
  reclaimDate: BN;
  reclaimAddress: web3.PublicKey;
  depositAddress: web3.PublicKey;
  orderSide: number;
  bound: number;
};
