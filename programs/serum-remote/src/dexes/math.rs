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
    pc_lot_size: u64,
) -> u64 {
    pc_lot_size * mul_div_u64(price, coin_decimals_factor, coin_lot_size).unwrap()
}

pub fn find_maximum_input<F: Fn(u64) -> u64>(
    func: F,
    lower_bound: u64,
    upper_bound: u64,
    iterations: u64,
) -> u64 {
    find_max_via_golden_section_search(func, lower_bound, upper_bound, iterations)
}

//
// u64 implementation of Golden Section Search algo
// https://en.wikipedia.org/wiki/Golden-section_search#Iterative_algorithm
//
const SCALE_FACTOR: u64 = 1_000;
const SQRT_5: f64 = 2.2360679775;
const INVPHI: u64 = (SCALE_FACTOR as f64 * (SQRT_5 - 1.0) / 2.0) as u64;
const INVPHI_2: u64 = (SCALE_FACTOR as f64 * (3.0 - SQRT_5) / 2.0) as u64;

fn find_max_via_golden_section_search<F: Fn(u64) -> u64>(
    func: F,
    mut a: u64,
    mut b: u64,
    iterations: u64,
) -> u64 {
    let mut h = b - a;

    let n = iterations;
    let mut c = a + INVPHI_2 * h / SCALE_FACTOR;
    let mut d = a + INVPHI * h / SCALE_FACTOR;
    let mut fc = func(c);
    let mut fd = func(d);
    for _ in 0..n + 1 {
        if fc > fd {
            b = d;
            d = c;
            fd = fc;
            h = INVPHI * h / SCALE_FACTOR;
            c = a + INVPHI_2 * h / SCALE_FACTOR;
            fc = func(c);
        } else {
            a = c;
            c = d;
            fc = fd;
            h = INVPHI * h / SCALE_FACTOR;
            d = a + INVPHI * h / SCALE_FACTOR;
            fd = func(d);
        }
    }
    if fc > fd {
        return (a + b) / 2;
    } else {
        return (c + b) / 2;
    }
}
