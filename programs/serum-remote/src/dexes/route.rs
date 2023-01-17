use super::{leg::Leg, Dex};
use anchor_lang::prelude::*;

const MAX_LEGS: usize = 3;

#[derive(Default)]
pub(crate) struct Route<'a, 'info> {
    pub legs: [Option<Leg<'a, 'info>>; MAX_LEGS],
}

impl Route<'_, '_> {
    /// Return the mint that is the input to the trade route
    pub fn start_mint(&self) -> Result<Pubkey> {
        match &self.legs[0] {
            Some(leg) => leg.start_mint(),
            None => panic!("First leg cannot be blank"),
        }
    }

    /// Return the end mint of the final leg in the route.
    pub fn end_mint(&self) -> Result<Pubkey> {
        // Iterate in reverse returning the end_mint of the first leg
        for leg in self.legs.iter().rev() {
            match leg {
                Some(leg) => return leg.end_mint(),
                None => {}
            }
        }
        panic!("There must be at least one leg")
    }
}
