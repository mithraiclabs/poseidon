use super::super::math::{mul_div_u64, U128};

#[derive(Clone, Debug)]
pub struct OrderBookItem {
    /// The limit price IN TOKEN DECIMALS
    pub price: u64,
    /// The base quantity IN TOKEN DECIMALS
    pub quantity: u64,
    /// The sum of the quanties IN TOKEN DECIMALS
    pub quantity_sum: u64,
    /// The sum of price (IN TOKEN DECIMALS) x quantities (IN TOKEN DECIMALS)
    pub price_quantity_sum: U128,
}

impl OrderBookItem {
    pub fn simple_debug(items: &Vec<Self>) {
        if items.len() > 0 {
            anchor_lang::solana_program::msg!("p {} q {}", items[0].price, items[0].quantity);
        }
    }
}

pub fn buy_coin_amount_out(
    amount_in: u64,
    asks: &Vec<OrderBookItem>,
    fee_numerator: u64,
    fee_denominator: u64,
    base_decimal_factor: u64,
    pc_lot_size: u64,
) -> u64 {
    // Subtract fees from amount in because we're buying with price currency
    let mut amount_avail =
        U128::from(amount_in - mul_div_u64(amount_in, fee_numerator, fee_denominator).unwrap());
    // Account for pc lot size after fees. https://github.com/project-serum/serum-dex/blob/master/dex/src/matching.rs#L637
    amount_avail = (amount_avail / pc_lot_size) * pc_lot_size;
    // Binary search where in the OrderBook item list we can sell all (or the most) of amount_in
    let mut low: usize = 0;
    let mut high = asks.len() - 1;
    let mut mid: usize;
    let mut base_index: usize = 0;
    while low < high {
        mid = (low + high) / 2;
        let price_quantity_sum = asks[mid].price_quantity_sum;
        if price_quantity_sum == amount_avail {
            base_index = mid;
            break;
        } else if amount_avail < price_quantity_sum {
            // Not enough buying power, decrease high
            if let Some(new_high) = mid.checked_sub(1) {
                high = new_high;
            } else {
                // Edge case when OB len is 2, low = 0, mid = 0, high = 1
                if low == mid {
                    high = mid;
                } else {
                    panic!("Subtraction Overflow! low {} mid {} high {} asks len {}\namount_avail {} pqs {}", low, mid, high, asks.len(), amount_avail, price_quantity_sum);
                }
            }
        } else {
            // more buying power, increase the low
            base_index = mid;
            low = mid + 1;
        }
    }
    if base_index == 0 {
        return mul_div_u64(
            amount_avail.as_u64(),
            base_decimal_factor,
            asks[base_index].price,
        )
        .unwrap();
    }
    // If it's not the 0 index, then we need to get all from the base index, and then calculate the change from the next level
    let mut amount_out: u64 = asks[base_index].quantity_sum;
    amount_avail = amount_avail - asks[base_index].price_quantity_sum / base_decimal_factor;
    let next_index = base_index + 1;
    amount_out += if asks.len() == next_index {
        0
    } else {
        mul_div_u64(
            amount_avail.as_u64(),
            base_decimal_factor,
            asks[next_index].price,
        )
        .unwrap()
    };
    amount_out
}

pub fn sell_coin_amount_out(
    amount_in: u64,
    bids: &Vec<OrderBookItem>,
    fee_numerator: u64,
    fee_denominator: u64,
    base_decimal_factor: u64,
    coin_lot_size: u64,
) -> u64 {
    let mut amount_avail = (amount_in / coin_lot_size) * coin_lot_size;
    // Binary search where in the OrderBook item list we can sell all (or the most) of amount_in
    let mut low: usize = 0;
    let mut high = bids.len() - 1;
    let mut mid: usize;
    let mut base_index: usize = 0;
    while low < high {
        mid = (low + high) / 2;
        let quantity_sum = bids[mid].quantity_sum;
        if quantity_sum == amount_avail {
            base_index = mid;
            break;
        } else if amount_avail < quantity_sum {
            if let Some(new_high) = mid.checked_sub(1) {
                high = new_high;
            } else {
                // Edge case when OB len is 2, low = 0, mid = 0, high = 1
                if low == mid {
                    high = mid;
                } else {
                    panic!("Subtraction Overflow! low {} mid {} high {} bids len {}\namount_avail {} pqs {}", low, mid, high, bids.len(), amount_avail, quantity_sum);
                }
            }
        } else {
            base_index = mid;
            low = mid + 1;
        }
    }
    if base_index == 0 {
        return mul_div_u64(amount_avail, bids[base_index].price, base_decimal_factor).unwrap();
    }
    // If it's not the 0 index, then we need to get all from the base index, and then calculate the change from the next level
    let mut amount_out: u64 = (bids[base_index].price_quantity_sum / base_decimal_factor).as_u64();
    amount_avail = amount_avail - bids[base_index].quantity_sum;
    let next_index = base_index + 1;
    amount_out += if bids.len() == next_index {
        0
    } else {
        mul_div_u64(amount_avail, bids[next_index].price, base_decimal_factor).unwrap()
    };
    // subtract the fee from the price currency out https://github.com/project-serum/serum-dex/blob/master/dex/src/matching.rs#L501
    amount_out - mul_div_u64(amount_out, fee_numerator, fee_denominator).unwrap()
}
