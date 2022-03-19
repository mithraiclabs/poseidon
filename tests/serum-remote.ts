import * as anchor from "@project-serum/anchor";
import { Program } from "@project-serum/anchor";
import { SerumRemote } from "../target/types/serum_remote";

describe("serum-remote", () => {
  // Configure the client to use the local cluster.
  anchor.setProvider(anchor.Provider.env());

  const program = anchor.workspace.SerumRemote as Program<SerumRemote>;

  it("Is initialized!", async () => {
    // Add your test here.
    const tx = await program.rpc.initialize({});
    console.log("Your transaction signature", tx);
  });
});
