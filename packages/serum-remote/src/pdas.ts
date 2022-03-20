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

export const deriveOrderPayer = (
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
  const [orderPayer] = await deriveOrderPayer(program, boundedStrategy);
  const [authority] = await deriveAuthority(program, boundedStrategy);
  return { orderPayer, boundedStrategy, authority };
};
