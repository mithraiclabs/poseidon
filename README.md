<div align="center">
  <img height="170" src="http://github.com/project-serum/awesome-serum/blob/master/logo-serum.png?raw=true" />

  <h1>Serum Remote</h1>

  <p>
    <strong>Project Serum Rust Monorepo</strong>
  </p>

  <p>
    <a href="https://travis-ci.com/project-serum/serum-dex"><img alt="Build Status" src="https://travis-ci.com/project-serum/serum-dex.svg?branch=master" /></a>
    <a href="https://discord.com/channels/739225212658122886"><img alt="Discord Chat" src="https://img.shields.io/discord/739225212658122886?color=blueviolet" /></a>
    <a href="https://opensource.org/licenses/Apache-2.0"><img alt="License" src="https://img.shields.io/github/license/project-serum/serum-dex?color=blue" /></a>
  </p>

  <h4>
    <a href="https://projectserum.com/">Website</a>
    <span> | </span>
    <a href="https://discord.gg/HSeFXbqsUX">Discord</a>
    <span> | </span>
    <a href="https://github.com/project-serum/awesome-serum">Awesome</a>
    <span> | </span>
    <a href="https://dex.projectserum.com/#/">DEX</a>
    <span> | </span>
    <a href="https://github.com/project-serum/serum-ts">TypeScript</a>
  </h4>
</div>

Right now there’s no simple way for a member of a DAO to initiate a proposal to purchase some other asset and diversify a treasury. It would be extremely useful if the Treasury components of the governance UI allowed anyone to initiate a such a proposal which uses Serum as the liquidity source. In order to accomplish this goal there are two major pieces of development.

1. Serum Execution Protocol
2. Governance UI integration

## Program Deployments

| Program                          | Devnet                                         | Mainnet Beta |
| -------------------------------- | ---------------------------------------------- | ------------ |
| [Remote](/programs/serum-remote) | `8TJjyzq3iXc48MgV6TD5DumKKwfWKU14Jr9pwgnAbpzs` | N/a          |

## Development

1. `export ANCHOR_WALLET=$HOME/.config/solana/id.json`
2. First run the seed generator, which creates a USDC mint with your ANCHOR_WALLET key as the mintAuthority
   `ts-node tests/seeds/transformSeeds.ts`

## Serum Execution Protocol

### Instruction Set

- InitBoundedStrategy
  - ~~Create the appropriate Token accounts~~
  - ~~Create and initialize the OpenOrders account owned by strategy~~
  - ~~Transfer assets from the signer~~
  - ~~Create and store the BoundedTrade account~~
  - ~~Validate the BoundStrategy is not a LowerBounded Bid or an UpperBoundedAsk~~
  - ~~Validate the order side & mint information aligns with the Serum market. This should also validate the mint for the deposit address against the market state as well.~~
    - E.g. if the DAO is trying to Buy SOL from the SOL/USDC market, the program should error if the mint is set to SOL
- ~~BoundedTrade~~

  Allow DAOs to set an upper limit where the execution of the trade will only happen if an upper or lower bound is not crossed.

  - Validate the asset price on the order book is within the bounds
  - Execute the trade
  - Settle the funds to the deposit address

- ~~ReclaimAssets~~

  Some strategies may have parameters that could never be met. I.e. a BuyMarket could have a manipulated order book and never actually execute a trade. The assets shouldn’t sit in this protocol, the DAO should be able to reclaim and put the assets to work elsewhere.

  - ~~Validate that the current clock time is > the _reclaim_date_~~
  - ~~Initiate token transfer from the token account from _order_payer_ to the _reclaim_address_~~
  - ~~Close TokenAccount~~
  - ~~Close OpenOrders account~~
  - ~~Close Strategy account~~

### Account & Data Structures

```rust
struct BoundedStrategy {
	/// The PDA authority that owns the order_payer and open_orders account
	authority: Pubkey,
	/// The Serum market where the execution will take place
	seurm_market: Pubkey,
	/// The open_orders account that is owned by the authority and used to place orders
	open_orders: Pubkey,
	/// The SPL TokenAccount that contains the tokens that will be put into Serum for trading
	order_payer: Pubkey,
	/// The side of the order book the market order will be placed
	/// Bid or Ask
	order_side: Side,
	/// The date at which the DAO's assets can be reclaimed
	reclaim_date: i64,
	/// The address that the assets are transferred to when being reclaimed.
	reclaim_address: Pubkey,
	/// The address where the swapped asset should be deposited
	deposit_address: Pubkey,
  /// 0 for lower bound, 1 for upper bound
  bound: u8,
  /// The bound for the price in decimals equivalent to Serum Order book price
  bounded_price: u64
}
```

### Open Questions & Concerns

- Say the DAO only holds its native community token, it only has a Serum USDC based market and the proposer would like to buy SRM. How does the execution get routed optimally? Price impact or slippage on the native token sale should be taken into careful consideration as well.
  - If this is the case the DAO could be forced to have multiple proposals that execute over time. I.e. say the DAO wants to get from TokenA to TokenB, off chain they need to find the route like _TokenA → USDC → TokenB_ because there is a TokenA/USDC Serum market and a TokenB/USDC Serum market.
    - Proposal 1) convert TokenA to USDC using **TradeMarket**
    - Some period of time happens where proposal is passed, executed and then the Serum transactions are executed by the crank
    - Proposal 2) convert USDC to TokenB using **TradeMarket**
- Should the _reclaim_address_ always be the Treasury account address that originally transferred the assets? Is there any reason to allow the unused assets to be transferred elsewhere?
- Should **BoundedTrade** be separated into separate UpperBoundTrade and LowerBoundTrade to reduce control flow inside the instruction?
- If there’s an oracle dependency, then only assets with oracle support can be bought. Those that do not have an oracle should only use the BoundedTrade instruction.
- Should the Strategy payer be stored on chain so when accounts are closed the SOL is reclaimed?
- Should the deposit address have the same owner as the reclaim address?
