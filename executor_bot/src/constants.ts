import { PublicKey } from "@solana/web3.js";

export const JUPITER_EXCLUDED_AMMS = {
  Aldrin: true,
  Crema: true,
  Cropper: true,
  Cykura: true,
  DeltaFi: true,
  GooseFX: true,
  Invariant: true,
  Lifinity: true,
  "Lifinity V2": true,
  Marinade: true,
  Mercurial: true,
  Meteora: true,
  "Raydium CLMM": true,
  Saber: true,
  Serum: true,
  Orca: true,
  Step: true,
  Penguin: true,
  Saros: true,
  Stepn: true,
  "Orca (Whirlpools)": true,
  Sencha: true,
  "Saber (Decimals)": true,
  Dradex: true,
  Balansol: true,
  "Marco Polo": true,
  Phoenix: true,
  Unknown: true,
  //------------//
  Raydium: false,
  Openbook: false,
  //-----------//
};

export const OPENBOOK_V3_PROGRAM_ID = new PublicKey(
  "srmqPvymJeFKQ4zGQed1GFppgkRHL9kaELCbyksJtPX"
);

// Poll the RPC node for new accounts and execution every 10 min
export const POLL_INTERVAL = 600 * 1_000;
export const ONLY_DIRECT_ROUTE = false;
