use std::{
    convert::{TryFrom, TryInto},
    num::NonZeroU64,
};

use anchor_lang::__private::bytemuck::{cast_ref, cast_slice, Pod, Zeroable};
use arrayref::array_refs;
use num_enum::{IntoPrimitive, TryFromPrimitive};

use super::{
    super::math::{convert_price_to_decimals, U128},
    OrderBookItem,
};

pub type NodeHandle = u32;

#[derive(IntoPrimitive, TryFromPrimitive)]
#[repr(u32)]
enum NodeTag {
    Uninitialized = 0,
    InnerNode = 1,
    LeafNode = 2,
    FreeNode = 3,
    LastFreeNode = 4,
}

#[derive(Debug, Copy, Clone)]
#[repr(packed)]
#[allow(dead_code)]
struct InnerNode {
    tag: u32,
    prefix_len: u32,
    key: u128,
    children: [u32; 2],
    _padding: [u64; 5],
}
unsafe impl Zeroable for InnerNode {}
unsafe impl Pod for InnerNode {}

#[derive(Debug, Copy, Clone, PartialEq, Eq)]
#[repr(packed)]
pub struct LeafNode {
    tag: u32,
    owner_slot: u8,
    fee_tier: u8,
    padding: [u8; 2],
    key: u128,
    owner: [u64; 4],
    quantity: u64,
    client_order_id: u64,
}
unsafe impl Zeroable for LeafNode {}
unsafe impl Pod for LeafNode {}

impl LeafNode {
    #[inline]
    pub fn new(
        owner_slot: u8,
        key: u128,
        owner: [u64; 4],
        quantity: u64,
        fee_tier: u8,
        client_order_id: u64,
    ) -> Self {
        LeafNode {
            tag: NodeTag::LeafNode.into(),
            owner_slot,
            fee_tier: fee_tier.into(),
            padding: [0; 2],
            key,
            owner,
            quantity,
            client_order_id,
        }
    }

    #[inline]
    pub fn price(&self) -> NonZeroU64 {
        NonZeroU64::new((self.key >> 64) as u64).unwrap()
    }

    #[inline]
    pub fn order_id(&self) -> u128 {
        self.key
    }

    #[inline]
    pub fn quantity(&self) -> u64 {
        self.quantity
    }

    #[inline]
    pub fn set_quantity(&mut self, quantity: u64) {
        self.quantity = quantity;
    }

    #[inline]
    pub fn owner(&self) -> [u64; 4] {
        self.owner
    }

    #[inline]
    pub fn owner_slot(&self) -> u8 {
        self.owner_slot
    }

    #[inline]
    pub fn client_order_id(&self) -> u64 {
        self.client_order_id
    }
}

#[derive(Copy, Clone)]
#[repr(packed)]
#[allow(dead_code)]
pub struct AnyNode {
    tag: u32,
    data: [u32; 17],
}
unsafe impl Zeroable for AnyNode {}
unsafe impl Pod for AnyNode {}
impl AnyNode {
    fn case(&self) -> Option<NodeRef> {
        match NodeTag::try_from(self.tag) {
            Ok(NodeTag::InnerNode) => Some(NodeRef::Inner(cast_ref(self))),
            Ok(NodeTag::LeafNode) => Some(NodeRef::Leaf(cast_ref(self))),
            _ => None,
        }
    }
}

enum NodeRef<'a> {
    Inner(&'a InnerNode),
    Leaf(&'a LeafNode),
}

#[derive(Debug, Copy, Clone)]
#[repr(packed)]
#[allow(dead_code)]
struct SlabHeader {
    bump_index: u64,
    free_list_len: u64,
    free_list_head: u32,

    root_node: u32,
    leaf_count: u64,
}
unsafe impl Zeroable for SlabHeader {}
unsafe impl Pod for SlabHeader {}

const SLAB_HEADER_LEN: usize = std::mem::size_of::<SlabHeader>();

#[inline(always)]
unsafe fn invariant(check: bool) {
    if check {
        std::hint::unreachable_unchecked();
    }
}

#[repr(transparent)]
pub struct Slab([u8]);

impl Slab {
    /// Creates a slab that holds and references the bytes
    ///
    /// ```compile_fail
    /// let slab = {
    ///     let mut bytes = [10; 100];
    ///     serum_dex::critbit::Slab::new(&mut bytes)
    /// };
    /// ```
    #[inline]
    pub fn new(bytes: &[u8]) -> &Self {
        let len_without_header = bytes.len().checked_sub(SLAB_HEADER_LEN).unwrap();
        let slop = len_without_header % std::mem::size_of::<AnyNode>();
        let truncated_len = bytes.len() - slop;
        let bytes = &bytes[..truncated_len];
        let slab: &Self = unsafe { &(*(bytes as *const [u8] as *const Slab)) };
        slab.check_size_align(); // check alignment
        slab
    }

    fn check_size_align(&self) {
        let (header_bytes, nodes_bytes) = array_refs![&self.0, SLAB_HEADER_LEN; .. ;];
        let _header: &SlabHeader = cast_ref(header_bytes);
        let _nodes: &[AnyNode] = cast_slice(nodes_bytes);
    }

    fn parts(&self) -> (&SlabHeader, &[AnyNode]) {
        unsafe {
            invariant(self.0.len() < std::mem::size_of::<SlabHeader>());
            invariant((self.0.as_ptr() as usize) % std::mem::align_of::<SlabHeader>() != 0);
            invariant(
                ((self.0.as_ptr() as usize) + std::mem::size_of::<SlabHeader>())
                    % std::mem::align_of::<AnyNode>()
                    != 0,
            );
        }

        let (header_bytes, nodes_bytes) = array_refs![&self.0, SLAB_HEADER_LEN; .. ;];
        let header = cast_ref(header_bytes);
        let nodes = cast_slice(nodes_bytes);
        (header, nodes)
    }

    fn header(&self) -> &SlabHeader {
        self.parts().0
    }

    fn nodes(&self) -> &[AnyNode] {
        self.parts().1
    }

    fn root(&self) -> Option<NodeHandle> {
        if self.header().leaf_count == 0 {
            return None;
        }

        Some(self.header().root_node)
    }

    pub fn get_order_book_items(
        &self,
        max_depth: usize,
        is_bids: bool,
        coin_lot_size: u64,
        base_decimals_factor: u64,
        pc_lot_size: u64,
    ) -> Vec<OrderBookItem> {
        let node = self.root();
        let mut node: NodeHandle = match node {
            Some(node) => node,
            None => {
                return Vec::new();
            }
        };
        let mut stack: Vec<u32> = Vec::with_capacity(self.header().leaf_count as usize);
        stack.push(node);
        let leaf_count: usize = self.header().leaf_count.try_into().unwrap();
        let mut res: Vec<OrderBookItem> = Vec::with_capacity(max_depth);
        let mut quantity_sum: u64 = 0;
        let mut price_quantity_sum: U128 = U128::zero();
        let true_max_depth = std::cmp::min(max_depth, leaf_count);
        loop {
            if stack.is_empty() {
                break;
            }
            node = stack.pop().unwrap();
            let node_contents = self.get(node).unwrap();
            match node_contents.case().unwrap() {
                NodeRef::Inner(&InnerNode { children, .. }) => {
                    if is_bids {
                        stack.push(children[0]);
                        stack.push(children[1]);
                    } else {
                        stack.push(children[1]);
                        stack.push(children[0]);
                    }
                    continue;
                }
                NodeRef::Leaf(leaf) => {
                    let token_quantity = leaf.quantity() * coin_lot_size;
                    let leaf_price = u64::from(leaf.price());
                    quantity_sum += token_quantity;
                    let price = convert_price_to_decimals(
                        leaf_price,
                        coin_lot_size,
                        base_decimals_factor,
                        pc_lot_size,
                    );
                    price_quantity_sum += U128::from(price) * U128::from(token_quantity);
                    let order_book_line = OrderBookItem {
                        price,
                        quantity: token_quantity,
                        quantity_sum,
                        price_quantity_sum,
                    };
                    res.push(order_book_line);
                }
            }
            if res.len() == true_max_depth {
                break;
            }
        }
        res
    }
}

pub trait SlabView<T> {
    fn get(&self, h: NodeHandle) -> Option<&T>;
}

impl SlabView<AnyNode> for Slab {
    fn get(&self, key: u32) -> Option<&AnyNode> {
        let node = self.nodes().get(key as usize)?;
        let tag = NodeTag::try_from(node.tag);
        match tag {
            Ok(NodeTag::InnerNode) | Ok(NodeTag::LeafNode) => Some(node),
            _ => None,
        }
    }
}
