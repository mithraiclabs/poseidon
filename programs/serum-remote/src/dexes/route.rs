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
