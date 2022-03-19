import * as anchor from "@project-serum/anchor";
import { Program, web3 } from "@project-serum/anchor";
import { assert } from "chai";
import { parseTranactionError } from "../packages/serum-remote/src";
import { initBoundedStrategyIx } from "../packages/serum-remote/src/instructions/initBoundedStrategy";
import { SerumRemote } from "../target/types/serum_remote";

const usdcMint = new web3.PublicKey(
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
);
const solUsdcSerumMarketKey = new web3.PublicKey(
  "9wFFyRfZBsuAha4YcuxcXLKwMxJR43S7fPfQLusDBzvT"
);
const DEX_ID = new web3.PublicKey(
  "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin"
);

/**
 * SerumMarket is in the current state Bids and Asks
 * [ [ 92.687, 300, <BN: 16a0f>, <BN: bb8> ] ] [ [ 92.75, 191.5, <BN: 16a4e>, <BN: 77b> ] ]
 */

describe("InitBoundedStrategy", () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.Provider.env());

  const program = anchor.workspace.SerumRemote as Program<SerumRemote>;

  // TODO: Test OpenOrders accounts is created
  // it("Should create the OpenOrders account", async () => {
  //   // TODO: Who should be the OpenOrders owner. Sh
  //   // const tx = await program.rpc.initBoundedStrategy({
  //   //   accounts: {
  //   //     payer: program.provider.wallet.publicKey,

  //   //   }
  //   // });
  //   console.log("Your transaction signature", tx);
  // });

  // TODO: Test the BoundedStrategy account is created with the right info
  it("Should store all the information for a BoundedStretegy", async () => {
    const ix = await initBoundedStrategyIx(
      program,
      solUsdcSerumMarketKey,
      usdcMint,
      {
        boundPrice: new anchor.BN(957),
        reclaimDate: new anchor.BN(new Date().getTime() / 1_000 + 3600),
      }
    );
    const transaction = new web3.Transaction().add(ix);
    try {
      await program.provider.send(transaction);
    } catch (error) {
      const parsedError = parseTranactionError(error);
      console.log("error: ", parsedError.msg);
      assert.ok(false);
    }

    assert.ok(true);

    // TODO: Test that the information was stored on the BoundedStrategy account
  });

  // TODO: Test reclaim date is in the future
});
