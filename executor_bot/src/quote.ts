import fetch from "cross-fetch";
import { Connection, PublicKey } from "@solana/web3.js";
import { BoundedStrategyV2 } from "@mithraic-labs/poseidon";
import { AccountLayout, getMint } from "@solana/spl-token";
import { JupiterQuoteResponse } from "./types/api";

export const getQuote = async ({
  boundedStrategy: {
    collateralAccount,
    collateralMint,
    depositAddress,
    boundedPriceNumerator,
    boundedPriceDenominator,
  },
  connection,
}: {
  boundedStrategy: BoundedStrategyV2;
  connection: Connection;
}) => {
  const [collateralAccountBuff, depositAccountBuff] =
    await connection.getMultipleAccountsInfo([
      collateralAccount,
      depositAddress,
    ]);
  const collateral = AccountLayout.decode(collateralAccountBuff.data);
  const deposit = AccountLayout.decode(depositAccountBuff.data);

  const [collateralMintInfo, depositMintInfo] = await Promise.all([
    getMint(connection, collateral.mint),
    getMint(connection, deposit.mint),
  ]);

  const [collateralMultiplier, depositMultiplier] = [
    Math.pow(10, collateralMintInfo.decimals),
    Math.pow(10, depositMintInfo.decimals),
  ];
  const numeratorAmount = Number(boundedPriceNumerator) / collateralMultiplier;
  const denominatorAmount = Number(boundedPriceDenominator) / depositMultiplier;
  const maxPrice = numeratorAmount / denominatorAmount;
  const amount = Number(collateral.amount) / (collateralMultiplier * maxPrice);
  console.log(amount);
  const { data: routes } = (await (
    await fetch(
      buildJupiterString(
        collateralMint.toString(),
        deposit.mint.toString(),
        (amount * collateralMultiplier).toFixed(0)
      )
    )
  ).json()) as JupiterQuoteResponse;

  for (let route of routes) {
    const { inAmount, outAmount, marketInfos } = route;
    for (let marketInfo of marketInfos) {
      if (!marketInfo.notEnoughLiquidity) {
        const routePrice =
          Number(inAmount) /
          collateralMultiplier /
          (Number(outAmount) / depositMultiplier);
        if (routePrice <= maxPrice) {
          return {
            marketIds: [new PublicKey(marketInfo.id)],
            destinationMint: deposit.mint,
          };
        }
      }
    }
  }

  return {
    marketIds: [],
    destinationMint: deposit.mint,
  };
};

const buildJupiterString = (
  inputMint: string,
  outputMint: string,
  amount: string
) => {
  const urlString =
    JUPITER_BASE +
    `inputMint=${inputMint}&outputMint=${outputMint}&amount=${amount}` +
    "&onlyDirectRoutes=true";
  return urlString;
};

const JUPITER_BASE = "https://quote-api.jup.ag/v4/quote?";
