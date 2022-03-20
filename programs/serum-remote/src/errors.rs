use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
    #[msg("Must use correct SystemProgram")]
    IncorrectSystemProgram,
    #[msg("Reclaim account's Mint must match")]
    BadReclaimAddress,
    #[msg("Reclaim date must be in the future")]
    ReclaimDateHasPassed,
}
