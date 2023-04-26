import {
  Connection,
  PublicKey,
  Keypair,
  AccountMeta,
  Cluster,
} from "@solana/web3.js";
import {
  BoundedStrategyV2,
  raydiumTradeAccts,
  openbookData,
} from "@mithraic-labs/poseidon";
import { Jupiter } from "@jup-ag/core";
import {
  AccountLayout,
  getOrCreateAssociatedTokenAccount,
  MintLayout,
} from "@solana/spl-token2";
import JSBI from "jsbi";
import {
  JUPITER_EXCLUDED_AMMS,
  ONLY_DIRECT_ROUTE,
  OPENBOOK_V3_PROGRAM_ID,
} from "./constants";
import { Market } from "@project-serum/serum";
import config from "./config";
import { wait } from "./utils";

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
  boundedStrategy: BoundedStrategyV2;
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

  const [collateralMintBuf, depositMintBuf] =
    await connection.getMultipleAccountsInfo([collateral.mint, deposit.mint]);
  const [collateralMintInfo, depositMintInfo] = [
    MintLayout.decode(collateralMintBuf.data),
    MintLayout.decode(depositMintBuf.data),
  ];

  const [collateralMultiplier, depositMultiplier] = [
    Math.pow(10, collateralMintInfo.decimals),
    Math.pow(10, depositMintInfo.decimals),
  ];
  const numeratorAmount = Number(boundedPriceNumerator) / collateralMultiplier;
  const denominatorAmount = Number(boundedPriceDenominator) / depositMultiplier;

  const maxPrice = numeratorAmount / denominatorAmount;
  const collateralAmount = Number(collateral.amount) / collateralMultiplier;
  if (!collateralAmount) {
    console.log("Empty collateral account...");

    return {
      additionalData,
      remainingAccounts,
    };
  }

  const amount = collateralAmount / maxPrice;

  const jupiter = await Jupiter.load({
    connection,
    cluster: config.cluster as Cluster,
    user: payer.publicKey,
    ammsToExclude: JUPITER_EXCLUDED_AMMS,
  });

  try {
    console.log({
      collateralMint: collateral.mint.toString(),
      depositMint: deposit.mint.toString(),
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
            await wait(5000);
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
              if (
                marketInfo.minInAmount < JSBI.BigInt(Number(collateral.amount))
              ) {
                const { additionalData: aData, remainingAccounts: rAccounts } =
                  await openbookData(
                    connection,
                    ammId,
                    payer,
                    outputAccount,
                    inputAccount,
                    // jupiter doesn't have devnet routes
                    "mainnet-beta"
                  );
                additionalData.push(aData.values());
                remainingAccounts.push(...rAccounts);
                break;
              } else {
                remainingAccounts = [];
                additionalData = [];
              }
          }

          inputAccount = new PublicKey(outputAccount.toString());
        }
        if (!remainingAccounts.length) continue;
        return {
          additionalData,
          remainingAccounts,
        };
      }
    }
    return {
      additionalData,
      remainingAccounts,
    };
  } catch (error) {
    console.error({ error });
    return {
      additionalData: [],
      remainingAccounts: [],
    };
  }
};
