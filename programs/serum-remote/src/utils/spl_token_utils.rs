use std::convert::TryInto;

use anchor_lang::prelude::Pubkey;

/// Given an TokenAccount's data, extract the `amount`
pub fn amount(data: &[u8]) -> u64 {
    return u64::from_le_bytes(data[64..72].try_into().unwrap());
}

/// Given an TokenAccount's data, extract the `mint`
pub fn mint(data: &[u8]) -> Pubkey {
    let mut mint_bytes = [0u8; 32];
    mint_bytes.copy_from_slice(&data[..32]);
    return Pubkey::new_from_array(mint_bytes);
}
