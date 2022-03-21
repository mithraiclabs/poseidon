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
    ReclaimDateHasNotPassed
}
