import { BN, Program, web3 } from "@project-serum/anchor";
import { SerumRemote } from "./serum_remote";
import { BoundedStrategyParams } from "./types";

const textEncoder = new TextEncoder();

export const deriveBoundedStrategy = (
  program: Program<SerumRemote>,
  serumMarket: web3.PublicKey,
  mint: web3.PublicKey,
  boundPrice: BN,
  reclaimDate: BN
) =>
  web3.PublicKey.findProgramAddress(
    [
      serumMarket.toBuffer(),
      mint.toBuffer(),
      boundPrice.toArrayLike(Buffer, "le", 8),
      reclaimDate.toArrayLike(Buffer, "le", 8),
      textEncoder.encode("boundedStrategy"),
    ],
    program.programId
  );

export const deriveBoundedStrategyV2 = (
  program: Program<SerumRemote>,
  mint: web3.PublicKey,
  boundPrice: BN,
  reclaimDate: BN
) =>
  web3.PublicKey.findProgramAddress(
    [
      mint.toBuffer(),
      boundPrice.toArrayLike(Buffer, "le", 8),
      reclaimDate.toArrayLike(Buffer, "le", 8),
      textEncoder.encode("boundedStrategy"),
    ],
    program.programId
  );

export const deriveCollateralAccount = (
  program: Program<SerumRemote>,
  strategy: web3.PublicKey
) =>
  web3.PublicKey.findProgramAddress(
    [strategy.toBuffer(), textEncoder.encode("orderPayer")],
    program.programId
  );

export const deriveAuthority = (
  program: Program<SerumRemote>,
  strategy: web3.PublicKey
) =>
  web3.PublicKey.findProgramAddress(
    [strategy.toBuffer(), textEncoder.encode("authority")],
    program.programId
  );

export const deriveOpenOrders = (
  program: Program<SerumRemote>,
  strategy: web3.PublicKey
) =>
  web3.PublicKey.findProgramAddress(
    [strategy.toBuffer(), textEncoder.encode("openOrders")],
    program.programId
  );

export const deriveAllBoundedStrategyKeys = async (
  program: Program<SerumRemote>,
  serumMarket: web3.PublicKey,
  mint: web3.PublicKey,
  boundedStrategyParams: BoundedStrategyParams
) => {
  const { boundPrice, reclaimDate } = boundedStrategyParams;
  const [boundedStrategy] = await deriveBoundedStrategy(
    program,
    serumMarket,
    mint,
    boundPrice,
    reclaimDate
  );
  const [orderPayer] = await deriveCollateralAccount(program, boundedStrategy);
  const [authority] = await deriveAuthority(program, boundedStrategy);
  const [openOrders] = await deriveOpenOrders(program, boundedStrategy);
  return { orderPayer, boundedStrategy, authority, openOrders };
};

export const deriveAllBoundedStrategyKeysV2 = async (
  program: Program<SerumRemote>,
  mint: web3.PublicKey,
  boundedStrategyParams: BoundedStrategyParams
) => {
  const { boundPrice, reclaimDate } = boundedStrategyParams;
  const [boundedStrategy] = await deriveBoundedStrategyV2(
    program,
    mint,
    boundPrice,
    reclaimDate
  );
  const [collateralAccount] = await deriveCollateralAccount(
    program,
    boundedStrategy
  );
  const [authority] = await deriveAuthority(program, boundedStrategy);
  return { collateralAccount, boundedStrategy, authority };
};
