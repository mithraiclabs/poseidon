import {
  Connection,
  PublicKey,
  Keypair,
  AccountMeta,
  Cluster,
} from "@solana/web3.js";
import * as Poseidon from "@mithraic-labs/poseidon";
import { Jupiter } from "@jup-ag/core";
import {
  getMint,
  AccountLayout,
  getOrCreateAssociatedTokenAccount,
} from "@solana/spl-token2";
import JSBI from "jsbi";
import { JUPITER_EXCLUDED_AMMS, ONLY_DIRECT_ROUTE } from "./constants";
import { openbookData, OPENBOOK_V3_PROGRAM_ID, raydiumTradeAccts } from "./dex";
import { Market } from "@project-serum/serum";
import config from "./config";

export const getQuote = async ({
  boundedStrategy: {
    collateralAccount,
    collateralMint,
    depositAddress,
    boundedPriceNumerator,
    boundedPriceDenominator,
  },
  connection,
  payer,
}: {
  boundedStrategy: Poseidon.BoundedStrategyV2;
  connection: Connection;
  payer: Keypair;
}) => {
  let remainingAccounts = [] as AccountMeta[];
  let additionalData = [];
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
  const collateralAmount = Number(collateral.amount) / collateralMultiplier;
  if (!collateralAmount)
    return {
      additionalData,
      remainingAccounts,
    };

  const amount = collateralAmount / maxPrice;

  // todo change this to be more robust (based on pricelots)
  const excludeOpenbook = amount < 1;
  const jupiter = await Jupiter.load({
    connection,
    cluster: config.cluster as Cluster,
    user: payer.publicKey,
    ammsToExclude: {
      ...JUPITER_EXCLUDED_AMMS,
      ...(excludeOpenbook && {
        // don't consider openbook markets for tiny trades
        Openbook: true,
      }),
    },
  });

  const routes = await jupiter.computeRoutes({
    inputMint: collateralMint,
    outputMint: deposit.mint,
    amount: JSBI.BigInt((amount * depositMultiplier).toFixed(0)),
    slippageBps: 15,
  });

  for (let route of routes.routesInfos) {
    const { inAmount, outAmount, marketInfos } = route;
    marketInfos.forEach((m) => {
      console.log({ Minfo: JSON.parse(JSON.stringify(m)) });
    });
    const routePrice =
      JSBI.toNumber(inAmount) /
      collateralMultiplier /
      (JSBI.toNumber(outAmount) / depositMultiplier);
    if (
      routePrice <= maxPrice &&
      !marketInfos.filter((m) => m.notEnoughLiquidity).length
    ) {
      let inputAccount = new PublicKey(collateralAccount);
      let outputAccount: PublicKey;
      for (let [index, marketInfo] of marketInfos.entries()) {
        const isDirectRoute =
          marketInfo.inputMint.equals(collateralMint) &&
          marketInfo.outputMint.equals(deposit.mint);
        if (ONLY_DIRECT_ROUTE && !isDirectRoute) continue;

        console.log("found supported market ", marketInfo.amm.label);

        console.log({
          keys: (marketInfo.amm as any).serumMarketKeys,
          amm: marketInfo.amm,
        });
        const ammId = new PublicKey(marketInfo.amm.id);

        if (!isDirectRoute && index !== marketInfos.length - 1) {
          // create accounts for intermediate trades
          const outputMint = marketInfo.outputMint;
          console.log("creating account for ", outputMint.toString());
          const tokenAccount = await getOrCreateAssociatedTokenAccount(
            connection,
            payer,
            outputMint,
            payer.publicKey
          );
          outputAccount = tokenAccount.address;
          console.log({ tokenAccount });
        } else outputAccount = new PublicKey(depositAddress);

        switch (marketInfo.amm.label) {
          case "Raydium":
            const srmMarket = await Market.load(
              connection,
              (marketInfo.amm as any).serumMarket,
              {},
              (marketInfo.amm as any).serumProgramId ?? OPENBOOK_V3_PROGRAM_ID
            );
            const raydiumRemainingAccounts = await raydiumTradeAccts(
              inputAccount,
              index === 0 ? collateral.owner : payer.publicKey,
              outputAccount,
              (marketInfo.amm as any).serumMarketKeys,
              ammId,
              (marketInfo.amm as any).serumMarket,
              srmMarket,
              (marketInfo.amm as any).ammOpenOrders,
              (marketInfo.amm as any).ammTargetOrders,
              (marketInfo.amm as any).poolCoinTokenAccount,
              (marketInfo.amm as any).poolPcTokenAccount,
              (marketInfo.amm as any).serumProgramId
            );
            remainingAccounts.push(...raydiumRemainingAccounts);
            break;
          default:
          case "Openbook":
            const { additionalData: aData, remainingAccounts: rAccounts } =
              await openbookData(
                connection,
                ammId,
                payer,
                outputAccount,
                inputAccount
              );
            additionalData.push(aData.values());
            remainingAccounts.push(...rAccounts);
            break;
        }

        inputAccount = new PublicKey(outputAccount.toString());
      }
    }
  }
  return {
    additionalData,
    remainingAccounts,
  };
};
