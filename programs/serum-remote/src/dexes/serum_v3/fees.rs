use anchor_lang::prelude::Pubkey;

mod stable_markets {
    pub mod usdt_usdc {
        use anchor_lang::declare_id;
        declare_id!("B2na8Awyd7cpC59iEU43FagJAPLigr3AP3s38KM982bu");
    }
}

#[repr(u8)]
pub enum FeeTier {
    Base,
    _SRM2,
    _SRM3,
    _SRM4,
    _SRM5,
    _SRM6,
    _MSRM,
    Stable,
}

impl FeeTier {
    #[inline(always)]
    pub fn from_srm_and_msrm_balances(market: &Pubkey) -> FeeTier {
        if market == &stable_markets::usdt_usdc::ID {
            return FeeTier::Stable;
        }

        match () {
            () => FeeTier::Base,
        }
    }

    ///
    /// Given a FeeTier return the fee numerator and the fee denominator
    ///
    #[inline(always)]
    pub fn taker_rate_fraction(&self) -> (u64, u64) {
        match self {
            FeeTier::Stable => (5, 100_000),
            _ => (20, 100_000),
        }
    }
}
