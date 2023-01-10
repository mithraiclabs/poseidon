use uint::construct_uint;

construct_uint! {
    pub struct U128(2);
}

/// Multiplies two u64's then divides by a u64.
pub fn mul_div_u64(a: u64, b: u64, divisor: u64) -> Option<u64> {
    let result = U128::from(a)
        .checked_mul(b.into())?
        .checked_div(divisor.into())?;
    if result.0[1] != 0 {
        None
    } else {
        Some(result.0[0])
    }
}

#[inline(always)]
pub fn convert_price_to_decimals(
  price: u64, 
  coin_lot_size: u64, 
  coin_decimals_factor: u64, 
  pc_lot_size: u64
) -> u64{
    pc_lot_size * mul_div_u64(price, coin_decimals_factor, coin_lot_size).unwrap()
}
