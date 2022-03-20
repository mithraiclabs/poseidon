import { BN, web3 } from "@project-serum/anchor";

export type BoundedStrategy = {
  authority: web3.PublicKey;
  serumMarket: web3.PublicKey;
  openOrders: web3.PublicKey;
  orderPayer: web3.PublicKey;
  orderSide: number;
  reclaimDate: BN;
  reclaimAddress: web3.PublicKey;
  depositAddress: web3.PublicKey;
  bound: number;
  boundedPrice: BN;
};

export type BoundedStrategyParams = {
  transferAmount: BN;
  boundPrice: BN;
  reclaimDate: BN;
  reclaimAddress: web3.PublicKey;
  depositAddress: web3.PublicKey;
  orderSide: number;
  bound: number;
};
