use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
    #[msg("Must use correct SystemProgram")]
    IncorrectSystemProgram, // 6000
    #[msg("Reclaim account's Mint must match")]
    BadReclaimAddress, // 6001
    #[msg("Reclaim date must be in the future")]
    ReclaimDateHasPassed, // 6002
    #[msg("Bound price must be greater than 0")]
    BoundPriceIsZero, // 6003
    #[msg("Order side must be 0 or 1")]
    NonBinaryOrderSide, // 6004
    #[msg("Bound must be 0 or 1")]
    NonBinaryBound, // 6005
    #[msg("Market price is out of bounds")]
    MarketPriceIsOutOfBounds, // 6006
    #[msg("Lower bounded bids are blocked")]
    NoLowerBoundedBids, // 6007
    #[msg("Upper bounded asks are blocked")]
    NoUpperBoundedAsks, // 6008
    #[msg("Cannot reclaim assets before the reclaim date")]
    ReclaimDateHasNotPassed, // 6009
    #[msg("Transfer amount cannot be 0")]
    TransferAmountCantBe0, // 6010
    #[msg("Strategy requires the quote currency to place bids")]
    BidsRequireQuoteCurrency, // 6011
    #[msg("Strategy requires the base currency to place asks")]
    AsksRequireBaseCurrency, // 6012
    #[msg("Order payer does not match the strategy")]
    OrderPayerMisMatch, // 6013
    #[msg("Authority does not match the strategy")]
    AuthorityMisMatch, // 6014
    #[msg("Depsoit address does not match the strategy")]
    DepositAddressMisMatch, // 6015
    #[msg("Cannot reclaim to different address")]
    WrongReclaimAddress, // 6016
    #[msg("Deposit address must have same owner as reclaim address")]
    BadDepositAddress, // 6017
    #[msg("open orders does not match strategy")]
    WrongOpenOrdersKey, // 6018
    #[msg("Failed to load OpenBook DEX Market")]
    FailedToLoadOpenBookDexMarket, // 6019
    #[msg("OpenOrders account does not match derived address")]
    BadOpenOrdersKey, // 6020
    #[msg("Uknown DEX Program ID")]
    UknownDexId, // 6021
    #[msg("Output mint does not match route")]
    OutputMintMismatch, // 6022
    #[msg("Input mint does not match route")]
    InputMintMismatch, // 6023
    #[msg("The Leg's accounts aren't correct or ordered properly")]
    IncorrectKeysForLeg, // 6024
    #[msg("The intermediary token account key is incorrect")]
    BadTokenAccountKeyForLeg, // 6025
    #[msg("Bad LUT program address")]
    BadLutProgramAddress, // 6026
}
