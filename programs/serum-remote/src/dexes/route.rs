use crate::utils::U64F64;

use super::{leg::Leg, Dex, DexList};
use anchor_lang::prelude::*;

const MAX_LEGS: usize = 3;

#[derive(Default)]
pub(crate) struct Route<'a, 'info> {
    pub legs: [Option<Leg<'a, 'info>>; MAX_LEGS],
}

impl<'a, 'info> Route<'a, 'info> {
    pub fn create(
        remaining_accounts: &'a [AccountInfo<'info>],
        additional_data: Vec<u8>,
    ) -> Result<Self> {
        // Unpack & initalize the routes from remaining accounts
        let mut route = Route::default();
        let (mut account_cursor, mut leg_cursor): (usize, usize) = (0, 0);
        let mut added_data = additional_data;
        while let Some(dex_program) = remaining_accounts.get(account_cursor) {
            let dex = DexList::from_id(dex_program.key())?;
            let end_index = dex.get_end_account_idx(account_cursor);

            let account_infos = &remaining_accounts[account_cursor..end_index];
            // Create the Leg
            let leg = Leg::from_account_slice(dex, account_infos, &mut added_data)?;
            // Add the leg to the Route
            route.legs[leg_cursor] = Some(leg);

            account_cursor = end_index;
            leg_cursor += 1;
        }
        Ok(route)
    }

    /// Simulate the route with the smallest lot possible, testing whether the trade fits the
    /// bounds
    pub fn simple_price_check(&self, bounded_price: &U64F64, bound_direction: &u8) -> bool {
        // TODO: actually pull minimum trade size from each Leg and use that to determine the minimum input.
        let input_amount: u64 = 100;
        let mut output: u64 = 0;

        self.for_each_leg(|leg| output = leg.simulate_trade(input_amount));
        // Normalize input to output to determine whether the price per asset matches the
        //  bound. This must handle the case where output is less than input (i.e. the purchase price is < 1)
        let input_128 = U64F64::from_int(input_amount);
        let output_128 = U64F64::from_int(output);
        let execution_price = output_128.div(input_128);

        // Check whether the execution price is out of bounds
        if bound_direction == &0 && execution_price < bounded_price.val {
            false
        } else if bound_direction == &1 && execution_price > bounded_price.val {
            false
        } else {
            true
        }
    }
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

    fn for_each_leg<F>(&self, mut f: F)
    where
        F: FnMut(&Leg),
    {
        for leg in self.legs.iter() {
            match leg {
                Some(leg) => {
                    f(&leg);
                }
                None => {}
            }
        }
    }
}

// TODO: Write unit tests for simple_price_check

