import { BN, Provider, web3 } from "@project-serum/anchor";
import {
  BigNumberish,
  CurrencyAmount,
  Fraction,
  GetTokenAccountsByOwnerConfig,
  Liquidity,
  LIQUIDITY_PROGRAMID_TO_VERSION,
  LIQUIDITY_VERSION_TO_SERUM_VERSION,
  MarketV2,
  Percent,
  Price,
  Spl,
  SPL_ACCOUNT_LAYOUT,
  TEN,
  TokenAccount,
  TOKEN_PROGRAM_ID,
  ZERO,
} from "@raydium-io/raydium-sdk";
import tryCatch, { OPEN_BOOK_DEX_ID } from ".";

export const RAYDIUM_LIQUIDITY_PROGRAM_ID = new web3.PublicKey(
  "675kPX9MHTjS2zt1qfr1NYHuzeLXfQM9H24wFSUt1Mp8"
);
export const createRaydiumPool = async (
  provider: Provider,
  payer: web3.PublicKey,
  baseMint: web3.PublicKey,
  baseDecimals: number,
  quoteMint: web3.PublicKey,
  quoteDecimals: number,
  baseAmount: CurrencyAmount,
  quoteAmount: CurrencyAmount
) => {
  console.log("Raydium: getRichWalletTokenAccounts");
  // Get the payer's token accounts
  const { tokenAccountRawInfos } = await getRichWalletTokenAccounts({
    connection: provider.connection,
    owner: payer,
  });
  // Create the OpenBookDex Market
  const {
    transactions,
    address: { id: openBookMarketId },
  } = await MarketV2.makeCreateMarketTransaction({
    connection: provider.connection,
    wallet: payer,
    baseInfo: {
      mint: baseMint,
      decimals: baseDecimals,
    },
    quoteInfo: {
      mint: quoteMint,
      decimals: quoteDecimals,
    },
    lotSize: 100,
    tickSize: 100,
    dexProgramId: OPEN_BOOK_DEX_ID,
  });

  console.log("Raydium: makeCreateMarketTransaction 0");
  await provider.sendAndConfirm(
    transactions[0].transaction,
    transactions[0].signer,
    { skipPreflight: true }
  );
  console.log("Raydium: makeCreateMarketTransaction 1");
  await provider.sendAndConfirm(
    transactions[1].transaction,
    transactions[1].signer,
    { skipPreflight: true }
  );

  console.log("Raydium: getAssociatedPoolKeys");
  // find associated poolKeys for market
  const liquidityVersion =
    LIQUIDITY_PROGRAMID_TO_VERSION[RAYDIUM_LIQUIDITY_PROGRAM_ID.toString()];
  const associatedPoolKeys = await Liquidity.getAssociatedPoolKeys({
    version: liquidityVersion,
    marketVersion: LIQUIDITY_VERSION_TO_SERUM_VERSION[liquidityVersion],
    baseMint,
    quoteMint,
    baseDecimals,
    quoteDecimals,
    marketId: openBookMarketId,
    programId: RAYDIUM_LIQUIDITY_PROGRAM_ID,
    marketProgramId: OPEN_BOOK_DEX_ID,
  });

  console.log("Raydium: makeCreatePoolTransaction");
  const makePoolTx = Liquidity.makeCreatePoolTransaction({
    poolKeys: associatedPoolKeys,
    userKeys: {
      payer,
    },
  });
  await provider.sendAndConfirm(makePoolTx.transaction, makePoolTx.signers, {
    skipPreflight: true,
  });

  console.log(
    "Raydium: makeInitPoolTransaction",
    baseAmount.toString(),
    baseAmount.raw
  );
  // step2: init new pool (inject money into the created pool)
  const { transaction: initPoolTx, signers: initPoolSigners } =
    await Liquidity.makeInitPoolTransaction({
      poolKeys: associatedPoolKeys,
      startTime: new BN(new Date().getTime() / 1_000).toString(),
      baseAmount,
      quoteAmount,
      connection: provider.connection,
      userKeys: { owner: payer, payer, tokenAccounts: tokenAccountRawInfos },
    });
  await provider.sendAndConfirm(initPoolTx, initPoolSigners, {
    skipPreflight: true,
  });
};

/////////////////////////////// Buncha stuff ripped from Rayidum UI ///////////////////

export interface ITokenAccount {
  publicKey?: web3.PublicKey;
  mint?: web3.PublicKey;
  isAssociated?: boolean;
  amount: BN;
  isNative: boolean;
}
export type TokenAccountRawInfo = TokenAccount;
export type RpcUrl = string;
export type WalletOwner = string;

/**  rich info of {@link getWalletTokenAccounts}'s return  */
export async function getRichWalletTokenAccounts(
  ...params: Parameters<typeof getWalletTokenAccounts>
) {
  const { accounts: allTokenAccounts, rawInfos } = await getWalletTokenAccounts(
    ...params
  );
  return {
    tokenAccountRawInfos: rawInfos,
    nativeTokenAccount: allTokenAccounts.find((ta) => ta.isNative),
    tokenAccounts: allTokenAccounts.filter((ta) => ta.isAssociated),
    allTokenAccounts: allTokenAccounts,
  };
}

export async function getWalletTokenAccounts({
  connection,
  owner,
  config,
}: {
  connection: web3.Connection;
  owner: web3.PublicKey;
  config?: GetTokenAccountsByOwnerConfig;
}): Promise<{ accounts: ITokenAccount[]; rawInfos: TokenAccountRawInfo[] }> {
  const defaultConfig = {};
  const customConfig = { ...defaultConfig, ...config };

  const solReq = connection.getAccountInfo(owner, customConfig.commitment);
  const tokenReq = connection.getTokenAccountsByOwner(
    owner,
    { programId: TOKEN_PROGRAM_ID },
    customConfig.commitment
  );

  const [solResp, tokenResp] = await Promise.all([solReq, tokenReq]);

  const accounts: ITokenAccount[] = [];
  const rawInfos: TokenAccountRawInfo[] = [];

  for (const { pubkey, account } of tokenResp.value) {
    // double check layout length
    if (account.data.length !== SPL_ACCOUNT_LAYOUT.span) {
      throw new Error("invalid token account layout length");
    }

    const rawResult = SPL_ACCOUNT_LAYOUT.decode(account.data);
    const { mint, amount } = rawResult;

    const associatedTokenAddress = await Spl.getAssociatedTokenAccount({
      mint,
      owner,
    });
    accounts.push({
      publicKey: pubkey,
      mint,
      isAssociated: associatedTokenAddress.equals(pubkey),
      amount,
      isNative: false,
    });
    rawInfos.push({ pubkey, accountInfo: rawResult });
  }

  accounts.push({
    amount: toBN(solResp ? String(solResp.lamports) : 0),
    isNative: true,
  });

  return { accounts, rawInfos };
}

export type Numberish = number | string | bigint | BN;

export function shakeFractionDecimal(n: Fraction): string {
  const [, sign = "", int = "", dec = ""] =
    n.toFixed(2).match(/(-?)(\d*)\.?(\d*)/) ?? [];
  return `${sign}${int}`;
}

function toFraction(value: Numberish): Fraction {
  //  to complete math format(may have decimal), not int
  if (value instanceof Percent)
    return new Fraction(value.numerator, value.denominator);

  if (value instanceof Price) return value.adjusted;

  // to complete math format(may have decimal), not BN
  if (value instanceof CurrencyAmount)
    return tryCatch(
      () => toFraction(value.toExact()),
      () => new Fraction(ZERO)
    );

  // do not ideal with other fraction value
  if (value instanceof Fraction) return value;

  // wrap to Fraction
  const n = String(value);
  const details = parseNumberInfo(n);
  return new Fraction(details.numerator, details.denominator);
}
/**
 * only int part will become BN
 */
export default function toBN(n: undefined): undefined;
export default function toBN(n: Numberish, decimal?: BigNumberish): BN;
export default function toBN(
  n: Numberish | undefined,
  decimal: BigNumberish = 0
): BN | undefined {
  if (n == null) return undefined;
  if (n instanceof BN) return n;
  return new BN(
    shakeFractionDecimal(toFraction(n).mul(TEN.pow(new BN(String(decimal)))))
  );
}

/**
 * @example
 * parseNumberInfo(0.34) //=> { numerator: '34', denominator: '100'}
 * parseNumberInfo('0.34') //=> { numerator: '34', denominator: '100'}
 */
export function parseNumberInfo(n: Numberish | undefined): {
  denominator: string;
  numerator: string;
  sign?: string;
  int?: string;
  dec?: string;
} {
  if (n === undefined) return { denominator: "1", numerator: "0" };
  if (n instanceof BN) {
    return { numerator: n.toString(), denominator: "1" };
  }

  if (n instanceof Fraction) {
    return {
      denominator: n.denominator.toString(),
      numerator: n.numerator.toString(),
    };
  }

  const s = String(n);
  const [, sign = "", int = "", dec = "", expN] =
    s.replace(",", "").match(/(-?)(\d*)\.?(\d*)(?:e(-?\d+))?/) ?? [];
  if (expN) {
    // have scientific notion part
    const nexpN = Number(expN);
    const n = offsetDecimalDot(`${sign}${int}.${dec}`, nexpN);
    return parseNumberInfo(n);
  } else {
    const nexpN = Number(expN);
    const denominator = "1" + "0".repeat(dec.length + (nexpN < 0 ? -expN : 0));
    const numerator = sign + (int === "0" ? "" : int) + dec || "0";
    return { denominator, numerator, sign, int, dec };
  }
}

/** offset:  negative is more padding start zero */
function offsetDecimalDot(s: string, offset: number) {
  const [, sign = "", int = "", dec = ""] =
    s.replace(",", "").match(/(-?)(\d*)\.?(\d*)(?:e(-?\d+))?/) ?? [];
  const oldDecLength = dec.length;
  const newDecLength = oldDecLength - offset;
  if (newDecLength > int.length + dec.length) {
    return `${sign}0.${(int + dec).padStart(newDecLength, "0")}`;
  } else {
    return `${sign}${(int + dec).slice(0, -newDecLength)}.${(int + dec).slice(
      -newDecLength
    )}`;
  }
}
