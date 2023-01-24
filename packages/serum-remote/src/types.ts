import { BN, web3 } from "@project-serum/anchor";

export type SolCluster = web3.Cluster | "localnet" | "mainnet";

export enum Bound {
  "Lower" = 0,
  "Upper" = 1,
}

export enum OrderSide {
  "Bid" = 0,
  "Ask" = 1,
}

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
  serumDexId: web3.PublicKey;
};

export type BoundedStrategyV2 = {
  collateralMint: web3.PublicKey;
  collateralAccount: web3.PublicKey;
  orderSide: number;
  reclaimDate: BN;
  reclaimAddress: web3.PublicKey;
  depositAddress: web3.PublicKey;
  bound: number;
  boundedPriceNumerator: BN;
  boundedPriceDenominator: BN;
  bump: number;
  accountList: web3.PublicKey[];
  additionalData: number[];
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

export type BoundedStrategyParamsV2 = {
  transferAmount: BN;
  boundPriceNumerator: BN;
  boundPriceDenominator: BN;
  reclaimDate: BN;
  reclaimAddress: web3.PublicKey;
  depositAddress: web3.PublicKey;
  orderSide: number;
  bound: number;
};
