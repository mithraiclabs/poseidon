import { BN, Program, web3 } from "@coral-xyz/anchor";
import { Poseidon } from "./poseidon";
import { BoundedStrategyParams, BoundedStrategyParamsV2 } from "./types";

const textEncoder = new TextEncoder();

export const deriveBoundedStrategy = (
  program: Program<Poseidon>,
  serumMarket: web3.PublicKey,
  mint: web3.PublicKey,
  boundPrice: BN,
  reclaimDate: BN
) =>
  web3.PublicKey.findProgramAddressSync(
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
  program: Program<Poseidon>,
  mint: web3.PublicKey,
  boundPriceNumerator: BN,
  boundPriceDenominator: BN,
  reclaimDate: BN
) =>
  web3.PublicKey.findProgramAddressSync(
    [
      mint.toBuffer(),
      boundPriceNumerator.toArrayLike(Buffer, "le", 8),
      boundPriceDenominator.toArrayLike(Buffer, "le", 8),
      reclaimDate.toArrayLike(Buffer, "le", 8),
      textEncoder.encode("boundedStrategy"),
    ],
    program.programId
  );

export const deriveCollateralAccount = (
  program: Program<Poseidon>,
  strategy: web3.PublicKey
) =>
  web3.PublicKey.findProgramAddressSync(
    [strategy.toBuffer(), textEncoder.encode("orderPayer")],
    program.programId
  );

export const deriveAuthority = (
  program: Program<Poseidon>,
  strategy: web3.PublicKey
) =>
  web3.PublicKey.findProgramAddressSync(
    [strategy.toBuffer(), textEncoder.encode("authority")],
    program.programId
  );

export const deriveOpenOrders = (
  program: Program<Poseidon>,
  strategy: web3.PublicKey
) =>
  web3.PublicKey.findProgramAddressSync(
    [strategy.toBuffer(), textEncoder.encode("openOrders")],
    program.programId
  );

export const deriveAllBoundedStrategyKeys = (
  program: Program<Poseidon>,
  serumMarket: web3.PublicKey,
  mint: web3.PublicKey,
  boundedStrategyParams: BoundedStrategyParams
) => {
  const { boundPrice, reclaimDate } = boundedStrategyParams;
  const [boundedStrategy] = deriveBoundedStrategy(
    program,
    serumMarket,
    mint,
    boundPrice,
    reclaimDate
  );
  const [orderPayer] = deriveCollateralAccount(program, boundedStrategy);
  const [authority] = deriveAuthority(program, boundedStrategy);
  const [openOrders] = deriveOpenOrders(program, boundedStrategy);
  return { orderPayer, boundedStrategy, authority, openOrders };
};

export const deriveAllBoundedStrategyKeysV2 = (
  program: Program<Poseidon>,
  mint: web3.PublicKey,
  boundedStrategyParams: BoundedStrategyParamsV2
) => {
  const { boundPriceNumerator, boundPriceDenominator, reclaimDate } =
    boundedStrategyParams;
  const [boundedStrategy] = deriveBoundedStrategyV2(
    program,
    mint,
    boundPriceNumerator,
    boundPriceDenominator,
    reclaimDate
  );
  const [collateralAccount] = deriveCollateralAccount(program, boundedStrategy);
  return { collateralAccount, boundedStrategy };
};

export const deriveTokenAccount = (
  program: Program<Poseidon>,
  strategyKey: web3.PublicKey,
  mint: web3.PublicKey
): [web3.PublicKey, number] =>
  web3.PublicKey.findProgramAddressSync(
    [strategyKey.toBuffer(), mint.toBuffer()],
    program.programId
  );
