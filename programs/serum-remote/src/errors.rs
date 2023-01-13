use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
    #[msg("Must use correct SystemProgram")]
    IncorrectSystemProgram,
    #[msg("Reclaim account's Mint must match")]
    BadReclaimAddress,
    #[msg("Reclaim date must be in the future")]
    ReclaimDateHasPassed,
    #[msg("Bound price must be greater than 0")]
    BoundPriceIsZero,
    #[msg("Order side must be 0 or 1")]
    NonBinaryOrderSide,
    #[msg("Bound must be 0 or 1")]
    NonBinaryBound,
    #[msg("Market price is out of bounds")]
    MarketPriceIsOutOfBounds,
    #[msg("Lower bounded bids are blocked")]
    NoLowerBoundedBids,
    #[msg("Upper bounded asks are blocked")]
    NoUpperBoundedAsks,
    #[msg("Cannot reclaim assets before the reclaim date")]
    ReclaimDateHasNotPassed,
    #[msg("Transfer amount cannot be 0")]
    TransferAmountCantBe0,
    #[msg("Strategy requires the quote currency to place bids")]
    BidsRequireQuoteCurrency,
    #[msg("Strategy requires the base currency to place asks")]
    AsksRequireBaseCurrency,
    #[msg("Order payer does not match the strategy")]
    OrderPayerMisMatch,
    #[msg("Authority does not match the strategy")]
    AuthorityMisMatch,
    #[msg("Depsoit address does not match the strategy")]
    DepositAddressMisMatch,
    #[msg("Cannot reclaim to different address")]
    WrongReclaimAddress,
    #[msg("Deposit address must have same owner as reclaim address")]
    BadDepositAddress,
    #[msg("open orders does not match strategy")]
    WrongOpenOrdersKey,
    #[msg("Failed to load OpenBook DEX Market")]
    FailedToLoadOpenBookDexMarket,
    #[msg("OpenOrders account does not match derived address")]
    BadOpenOrdersKey,
    #[msg("Uknown DEX Program ID")]
    UknownDexId,
    #[msg("Output mint does not match route")]
    OutputMintMismatch,
    #[msg("Input mint does not match route")]
    InputMintMismatch,
}
