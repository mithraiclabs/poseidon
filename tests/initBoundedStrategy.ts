import * as anchor from "@project-serum/anchor";
import { Program, web3 } from "@project-serum/anchor";
import { assert } from "chai";
import { parseTranactionError } from "../packages/serum-remote/src";
import { initBoundedStrategyIx } from "../packages/serum-remote/src/instructions/initBoundedStrategy";
import { deriveAllBoundedStrategyKeys } from "../packages/serum-remote/src/pdas";
import { SerumRemote } from "../target/types/serum_remote";
import { createAssociatedTokenInstruction } from "./utils";

const usdcMint = new web3.PublicKey(
  "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
);
const solUsdcSerumMarketKey = new web3.PublicKey(
  "9wFFyRfZBsuAha4YcuxcXLKwMxJR43S7fPfQLusDBzvT"
);
const DEX_ID = new web3.PublicKey(
  "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin"
);

let usdcAccount: web3.PublicKey;

/**
 * SerumMarket is in the current state Bids and Asks
 * [ [ 92.687, 300, <BN: 16a0f>, <BN: bb8> ] ] [ [ 92.75, 191.5, <BN: 16a4e>, <BN: 77b> ] ]
 */

describe("InitBoundedStrategy", () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.Provider.env());

  const program = anchor.workspace.SerumRemote as Program<SerumRemote>;

  before(async () => {
    const { instruction, associatedAddress } =
      await createAssociatedTokenInstruction(program.provider, usdcMint);
    usdcAccount = associatedAddress;
    const transaction = new web3.Transaction().add(instruction);
    await program.provider.send(transaction);
  });

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
    const boundPrice = new anchor.BN(957);
    const reclaimDate = new anchor.BN(new Date().getTime() / 1_000 + 3600);
    const reclaimAddress = usdcAccount;
    const orderSide = 1;
    const bound = 1;
    const ix = await initBoundedStrategyIx(
      program,
      solUsdcSerumMarketKey,
      usdcMint,
      {
        boundPrice,
        reclaimDate,
        reclaimAddress,
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

    const {
      boundedStrategy: boundedStrategyKey,
      authority,
      orderPayer,
    } = await deriveAllBoundedStrategyKeys(
      program,
      solUsdcSerumMarketKey,
      usdcMint,
      {
        boundPrice,
        reclaimDate,
        reclaimAddress,
      }
    );

    assert.ok(true);

    const boundedStrategy = await program.account.boundedStrategy.fetch(
      boundedStrategyKey
    );

    // Test that the information was stored on the BoundedStrategy account

    assert.equal(
      boundedStrategy.seurmMarket.toString(),
      solUsdcSerumMarketKey.toString()
    );
    assert.equal(boundedStrategy.authority.toString(), authority.toString());
    assert.equal(boundedStrategy.orderPayer.toString(), orderPayer.toString());
    assert.equal(
      boundedStrategy.boundedPrice.toString(),
      boundPrice.toString()
    );
    assert.equal(
      boundedStrategy.reclaimDate.toString(),
      reclaimDate.toString()
    );
    assert.equal(
      boundedStrategy.reclaimAddress.toString(),
      reclaimAddress.toString()
    );
    assert.equal(boundedStrategy.orderSide, orderSide);
    assert.equal(boundedStrategy.bound, bound);
    // TODO: Check the OpenOrders address
  });

  // TODO: Test reclaim date is in the future
});
