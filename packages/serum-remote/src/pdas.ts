import { BN, Program, web3 } from "@project-serum/anchor";
import { SerumRemote } from "./serum_remote";

const textEncoder = new TextEncoder();

export const deriveOrderPayer = (
  program: Program<SerumRemote>,
  serumMarket: web3.PublicKey,
  mint: web3.PublicKey
) =>
  web3.PublicKey.findProgramAddress(
    [serumMarket.toBuffer(), mint.toBuffer(), textEncoder.encode("orderPayer")],
    program.programId
  );

export const deriveBoundedStrategy = (
  program: Program<SerumRemote>,
  orderPayer: web3.PublicKey,
  boundPrice: BN,
  reclaimDate: BN
) =>
  web3.PublicKey.findProgramAddress(
    [
      orderPayer.toBuffer(),
      boundPrice.toArrayLike(Buffer, "le", 8),
      reclaimDate.toArrayLike(Buffer, "le", 8),
      textEncoder.encode("boundedStrategy"),
    ],
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
