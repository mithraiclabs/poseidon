import fs from "fs/promises";
import YAML from "yaml";
import { BN, Idl, Spl, web3 } from "@project-serum/anchor";
import { IdlField, IdlType } from "./idlTypes";
import { u64 } from "@solana/spl-token";

// TODO: Remove this when handled via the anchor CLI
process.env.ANCHOR_WALLET = "~/.config/solana/id.json";
const SEEDS_DIR = "tests/seeds";

// read the seed file
(async () => {
  const seeds = await fs.readFile(`${SEEDS_DIR}/seeds.yml`, {
    encoding: "utf-8",
  });
  const seedsJson = YAML.parse(seeds);

  // TODO: Make this more program agnostic with a map of programs
  const splTokenProgram = Spl.token();

  const firstAccount = seedsJson.splToken[0];
  // Extract the meta data that is not actually stored on the account
  const address = firstAccount.address;
  const accountType = firstAccount.accountType;
  delete firstAccount.address;
  delete firstAccount.type;

  const idl = splTokenProgram.idl;

  // Convert the seed data to the appropriate types
  const convertedAccount = convertSeedToAccount(
    idl,
    accountType,
    firstAccount,
    {
      anchorWallet: splTokenProgram.provider.wallet.publicKey,
    }
  );

  // Encode the data and write it to the account
  const encodedData = await splTokenProgram.coder.accounts.encode(
    accountType,
    convertedAccount
  );
  await writeToSeedFile(
    address,
    encodedData.toString("base64"),
    splTokenProgram.programId.toString()
  );
})();

const convertSeedToAccount = (
  idl: Idl,
  accountType: string,
  seed: Record<string, any>,
  opts: { anchorWallet: web3.PublicKey }
) => {
  // Match the user specified accountType with the IDL's list of account types
  const idlAccountType = idl.accounts.filter(
    (account) => account.name === accountType
  )[0];
  if (!idlAccountType) {
    throw new Error(
      `Unknown account type ${accountType} for program ${idl.name}`
    );
  }

  if (idlAccountType.type.kind === "struct") {
    idlAccountType.type.fields.forEach((field) => {
      const key = field.name;
      const val = seed[key];
      if (val === "ANCHOR_WALLET") {
        seed[key] = opts.anchorWallet;
        return;
      }
      seed[key] = converFieldValue(field.type, val);
    });
  }
  // TODO: handle cases other than struct
  return seed;
};

const converFieldValue = (ty: IdlType, value: string | number | undefined) => {
  switch (ty) {
    case "bool":
      return value;
    case "u8":
      return parseInt(value.toString());
    case "i8":
      return new BN(value);
    case "i16":
      return new BN(value);
    case "u16":
      return new BN(value);
    case "u32":
      return new BN(value);
    case "i32":
      return new BN(value);
    case "f32":
      return new BN(value);
    case "u64":
      return new u64(value);
    case "i64":
      return new BN(value);
    case "f64":
      return new BN(value);
    case "u128":
      return new BN(value);
    case "i128":
      return new BN(value);
    case "bytes":
      throw new Error("TODO");
    case "string":
      return value;
    case "publicKey":
      return new web3.PublicKey(value);
    default:
      if ("vec" in ty) {
        throw new Error("TODO");
      }
      if ("option" in ty) {
        throw new Error("TODO");
      }
      if ("coption" in ty) {
        return value ? converFieldValue(ty.coption, value) : undefined;
      }
      if ("defined" in ty) {
        throw new Error("TODO");
      }
      if ("array" in ty) {
        throw new Error("TODO");
      }
      throw new Error(`Invalid type ${JSON.stringify(ty)}`);
  }
};

const writeToSeedFile = (
  address: string,
  base64EncodedData: string,
  owner: string
) => {
  const solanaAccount = {
    pubkey: address,
    account: {
      // TODO: Make this massive so all accounts are exempt?
      lamports: 122_299_004_116,
      data: [base64EncodedData, "base64"],
      owner,
      executable: false,
      rentEpoch: 291,
    },
  };
  return fs.writeFile(
    `${SEEDS_DIR}/${address}.json`,
    JSON.stringify(solanaAccount)
  );
};
