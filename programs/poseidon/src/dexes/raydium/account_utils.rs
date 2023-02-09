use std::convert::TryInto;

#[inline(always)]
pub fn base_total_accessor(data : &[u8]) -> u64{
    u64::from_le_bytes(data[85..93].try_into().unwrap())
}
#[inline(always)]
pub fn quote_total_accessor(data : &[u8]) -> u64{
    u64::from_le_bytes(data[101..109].try_into().unwrap())
}
#[inline(always)]
pub fn bnt_accessor(data : &[u8]) -> u64{
    u64::from_le_bytes(data[192..200].try_into().unwrap())
}
#[inline(always)]
pub fn qnt_accessor(data : &[u8]) -> u64{
    u64::from_le_bytes(data[200..208].try_into().unwrap())
}