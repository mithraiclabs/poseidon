import { BN, web3 } from "@coral-xyz/anchor";
import { Market } from "@project-serum/serum";
import { getProgramId } from "../utils";
import { SolCluster } from "../types";
import OpenBookDex from "./openBookDex";
import Raydium, { SERUM_V3_PROGRAM_ID } from "./raydium";
import { LIQUIDITY_STATE_LAYOUT_V4 } from "@raydium-io/raydium-sdk";

/**
 *
 * Given an array of Market IDs, determine what DEX they belong to and return the correct accounts
 * @param connection
 * @param marketIds
 */
export const getTradeAccounts = async (
  connection: web3.Connection,
  cluster: SolCluster,
  marketIds: web3.PublicKey[],
  strategyKey: web3.PublicKey,
  tradeSourceAccount: web3.PublicKey,
  tradeDestinationAccount: web3.PublicKey,
  destinationMint: web3.PublicKey
) => {
  const programId = getProgramId(cluster);
  // Load the accounts for each market
  const accountInfos = await connection.getMultipleAccountsInfo(marketIds);

  const openBookProgramId = OpenBookDex.programId(cluster);
  const raydiumProgramId = Raydium.programId(cluster);

  const res: web3.AccountMeta[][] = [];
  const additionalDataArr: Buffer[] = [];
  await Promise.all(
    accountInfos.map(async (acct, index) => {
      let legAccounts: web3.AccountMeta[] = [];
      let legAdditionalData: Buffer = Buffer.from([]);
      // Determine which DEX each market belongs to.
      switch (acct.owner.toString()) {
        case openBookProgramId.toString(): {
          // Load the SerumMarket
          const serumMarket = await Market.load(
            connection,
            marketIds[index],
            {},
            openBookProgramId
          );
          // TODO: Handle creating trade accounts (note OpenOrders account and owner will have
          //  to be checked or created)

          legAdditionalData = new BN(
            // @ts-ignore
            serumMarket._baseSplTokenDecimals
          ).toArrayLike(Buffer, "le", 1);
          break;
        }
        case raydiumProgramId.toString(): {
          // Handle Raydium information
          const raydiumV4MarketInfo = LIQUIDITY_STATE_LAYOUT_V4.decode(
            acct.data
          );
          if (
            ![
              SERUM_V3_PROGRAM_ID.toString(),
              openBookProgramId.toString(),
            ].includes(raydiumV4MarketInfo.marketProgramId.toString())
          ) {
            throw new Error("Unsupported Raydium market");
          }
          const market = await Market.load(
            connection,
            raydiumV4MarketInfo.marketId,
            {},
            raydiumV4MarketInfo.marketProgramId
          );
          // TODO: Handle creating trade accounts

          legAdditionalData = Buffer.from([]);
          break;
        }
        default:
          throw new Error("Unknown market owner");
      }
      res[index] = legAccounts;
      additionalDataArr[index] = legAdditionalData;
    })
  );

  const additionalData = Buffer.concat(additionalDataArr);
  return {
    remainingAccounts: res.flat(),
    additionalData: additionalData,
  };
};
