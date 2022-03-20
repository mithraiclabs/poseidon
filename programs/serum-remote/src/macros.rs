use anchor_lang::prelude::Pubkey;

use crate::constants::AUTHORITY_SEED;

#[macro_export]
macro_rules! authority_signer_seeds {
    ($ctx:expr, $bump:ident) => {
        &[&[
            &$ctx.accounts.strategy.key().to_bytes()[..],
            AUTHORITY_SEED.as_bytes(),
            &[$bump],
        ]]
    };
}
