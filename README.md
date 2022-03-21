## Development

1. `export ANCHOR_WALLET=$HOME/.config/solana/id.json`
2. First run the seed generator, which creates a USDC mint with your ANCHOR_WALLET key as the mintAuthority
   `ts-node tests/seeds/transformSeeds.ts`
