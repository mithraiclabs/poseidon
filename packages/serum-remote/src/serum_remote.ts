export type SerumRemote = {
  "version": "0.1.0",
  "name": "serum_remote",
  "instructions": [
    {
      "name": "initBoundedStrategy",
      "accounts": [
        {
          "name": "payer",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "authority",
          "isMut": false,
          "isSigner": false,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "type": "publicKey",
                "account": "BoundedStrategy",
                "path": "strategy"
              },
              {
                "kind": "const",
                "type": "string",
                "value": "authority"
              }
            ]
          }
        },
        {
          "name": "mint",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "serumMarket",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "orderPayer",
          "isMut": true,
          "isSigner": false,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "type": "publicKey",
                "account": "BoundedStrategy",
                "path": "strategy"
              },
              {
                "kind": "const",
                "type": "string",
                "value": "orderPayer"
              }
            ]
          }
        },
        {
          "name": "strategy",
          "isMut": true,
          "isSigner": false,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "type": "publicKey",
                "path": "serum_market"
              },
              {
                "kind": "account",
                "type": "publicKey",
                "account": "Mint",
                "path": "mint"
              },
              {
                "kind": "arg",
                "type": "u64",
                "path": "bound_price"
              },
              {
                "kind": "arg",
                "type": "i64",
                "path": "reclaim_date"
              },
              {
                "kind": "const",
                "type": "string",
                "value": "boundedStrategy"
              }
            ]
          }
        },
        {
          "name": "reclaimAccount",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "depositAccount",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "openOrders",
          "isMut": true,
          "isSigner": false,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "type": "publicKey",
                "account": "BoundedStrategy",
                "path": "strategy"
              },
              {
                "kind": "const",
                "type": "string",
                "value": "openOrders"
              }
            ]
          }
        },
        {
          "name": "dexProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "tokenProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "systemProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "rent",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": [
        {
          "name": "transferAmount",
          "type": "u64"
        },
        {
          "name": "boundPrice",
          "type": "u64"
        },
        {
          "name": "reclaimDate",
          "type": "i64"
        },
        {
          "name": "orderSide",
          "type": "u8"
        },
        {
          "name": "bound",
          "type": "u8"
        },
        {
          "name": "openOrdersSpace",
          "type": "u64"
        }
      ]
    },
    {
      "name": "boundedTrade",
      "accounts": [
        {
          "name": "payer",
          "isMut": false,
          "isSigner": true
        },
        {
          "name": "strategy",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "serumMarket",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "bids",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "asks",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "openOrders",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "orderPayer",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "authority",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "requestQueue",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "eventQueue",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "coinVault",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "pcVault",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "serumVaultSigner",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "depositAccount",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "dexProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "tokenProgramId",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "rent",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": []
    },
    {
      "name": "reclaim",
      "accounts": [
        {
          "name": "receiver",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "strategy",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "authority",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "orderPayer",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "openOrders",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "serumMarket",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "reclaimAccount",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "tokenProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "dexProgram",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": []
    }
  ],
  "accounts": [
    {
      "name": "boundedStrategy",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "authority",
            "type": "publicKey"
          },
          {
            "name": "serumMarket",
            "type": "publicKey"
          },
          {
            "name": "openOrders",
            "type": "publicKey"
          },
          {
            "name": "orderPayer",
            "type": "publicKey"
          },
          {
            "name": "orderSide",
            "type": "u8"
          },
          {
            "name": "reclaimDate",
            "type": "i64"
          },
          {
            "name": "reclaimAddress",
            "type": "publicKey"
          },
          {
            "name": "depositAddress",
            "type": "publicKey"
          },
          {
            "name": "bound",
            "type": "u8"
          },
          {
            "name": "boundedPrice",
            "type": "u64"
          },
          {
            "name": "authorityBump",
            "type": "u8"
          }
        ]
      }
    }
  ],
  "types": [
    {
      "name": "FeeTier",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "Base"
          },
          {
            "name": "SRM2"
          },
          {
            "name": "SRM3"
          },
          {
            "name": "SRM4"
          },
          {
            "name": "SRM5"
          },
          {
            "name": "SRM6"
          },
          {
            "name": "MSRM"
          },
          {
            "name": "Stable"
          }
        ]
      }
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "IncorrectSystemProgram",
      "msg": "Must use correct SystemProgram"
    },
    {
      "code": 6001,
      "name": "BadReclaimAddress",
      "msg": "Reclaim account's Mint must match"
    },
    {
      "code": 6002,
      "name": "ReclaimDateHasPassed",
      "msg": "Reclaim date must be in the future"
    },
    {
      "code": 6003,
      "name": "BoundPriceIsZero",
      "msg": "Bound price must be greater than 0"
    },
    {
      "code": 6004,
      "name": "NonBinaryOrderSide",
      "msg": "Order side must be 0 or 1"
    },
    {
      "code": 6005,
      "name": "NonBinaryBound",
      "msg": "Bound must be 0 or 1"
    },
    {
      "code": 6006,
      "name": "MarketPriceIsOutOfBounds",
      "msg": "Market price is out of bounds"
    },
    {
      "code": 6007,
      "name": "NoLowerBoundedBids",
      "msg": "Lower bounded bids are blocked"
    },
    {
      "code": 6008,
      "name": "NoUpperBoundedAsks",
      "msg": "Upper bounded asks are blocked"
    },
    {
      "code": 6009,
      "name": "ReclaimDateHasNotPassed",
      "msg": "Cannot reclaim assets before the reclaim date"
    },
    {
      "code": 6010,
      "name": "TransferAmountCantBe0",
      "msg": "Transfer amount cannot be 0"
    },
    {
      "code": 6011,
      "name": "BidsRequireQuoteCurrency",
      "msg": "Strategy requires the quote currency to place bids"
    },
    {
      "code": 6012,
      "name": "AsksRequireBaseCurrency",
      "msg": "Strategy requires the base currency to place asks"
    },
    {
      "code": 6013,
      "name": "OrderPayerMisMatch",
      "msg": "Order payer does not match the strategy"
    },
    {
      "code": 6014,
      "name": "AuthorityMisMatch",
      "msg": "Authority does not match the strategy"
    },
    {
      "code": 6015,
      "name": "DepositAddressMisMatch",
      "msg": "Depsoit address does not match the strategy"
    },
    {
      "code": 6016,
      "name": "WrongReclaimAddress",
      "msg": "Cannot rclaim to different address"
    }
  ]
};

export const IDL: SerumRemote = {
  "version": "0.1.0",
  "name": "serum_remote",
  "instructions": [
    {
      "name": "initBoundedStrategy",
      "accounts": [
        {
          "name": "payer",
          "isMut": true,
          "isSigner": true
        },
        {
          "name": "authority",
          "isMut": false,
          "isSigner": false,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "type": "publicKey",
                "account": "BoundedStrategy",
                "path": "strategy"
              },
              {
                "kind": "const",
                "type": "string",
                "value": "authority"
              }
            ]
          }
        },
        {
          "name": "mint",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "serumMarket",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "orderPayer",
          "isMut": true,
          "isSigner": false,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "type": "publicKey",
                "account": "BoundedStrategy",
                "path": "strategy"
              },
              {
                "kind": "const",
                "type": "string",
                "value": "orderPayer"
              }
            ]
          }
        },
        {
          "name": "strategy",
          "isMut": true,
          "isSigner": false,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "type": "publicKey",
                "path": "serum_market"
              },
              {
                "kind": "account",
                "type": "publicKey",
                "account": "Mint",
                "path": "mint"
              },
              {
                "kind": "arg",
                "type": "u64",
                "path": "bound_price"
              },
              {
                "kind": "arg",
                "type": "i64",
                "path": "reclaim_date"
              },
              {
                "kind": "const",
                "type": "string",
                "value": "boundedStrategy"
              }
            ]
          }
        },
        {
          "name": "reclaimAccount",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "depositAccount",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "openOrders",
          "isMut": true,
          "isSigner": false,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "type": "publicKey",
                "account": "BoundedStrategy",
                "path": "strategy"
              },
              {
                "kind": "const",
                "type": "string",
                "value": "openOrders"
              }
            ]
          }
        },
        {
          "name": "dexProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "tokenProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "systemProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "rent",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": [
        {
          "name": "transferAmount",
          "type": "u64"
        },
        {
          "name": "boundPrice",
          "type": "u64"
        },
        {
          "name": "reclaimDate",
          "type": "i64"
        },
        {
          "name": "orderSide",
          "type": "u8"
        },
        {
          "name": "bound",
          "type": "u8"
        },
        {
          "name": "openOrdersSpace",
          "type": "u64"
        }
      ]
    },
    {
      "name": "boundedTrade",
      "accounts": [
        {
          "name": "payer",
          "isMut": false,
          "isSigner": true
        },
        {
          "name": "strategy",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "serumMarket",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "bids",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "asks",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "openOrders",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "orderPayer",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "authority",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "requestQueue",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "eventQueue",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "coinVault",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "pcVault",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "serumVaultSigner",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "depositAccount",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "dexProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "tokenProgramId",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "rent",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": []
    },
    {
      "name": "reclaim",
      "accounts": [
        {
          "name": "receiver",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "strategy",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "authority",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "orderPayer",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "openOrders",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "serumMarket",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "reclaimAccount",
          "isMut": true,
          "isSigner": false
        },
        {
          "name": "tokenProgram",
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "dexProgram",
          "isMut": false,
          "isSigner": false
        }
      ],
      "args": []
    }
  ],
  "accounts": [
    {
      "name": "boundedStrategy",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "authority",
            "type": "publicKey"
          },
          {
            "name": "serumMarket",
            "type": "publicKey"
          },
          {
            "name": "openOrders",
            "type": "publicKey"
          },
          {
            "name": "orderPayer",
            "type": "publicKey"
          },
          {
            "name": "orderSide",
            "type": "u8"
          },
          {
            "name": "reclaimDate",
            "type": "i64"
          },
          {
            "name": "reclaimAddress",
            "type": "publicKey"
          },
          {
            "name": "depositAddress",
            "type": "publicKey"
          },
          {
            "name": "bound",
            "type": "u8"
          },
          {
            "name": "boundedPrice",
            "type": "u64"
          },
          {
            "name": "authorityBump",
            "type": "u8"
          }
        ]
      }
    }
  ],
  "types": [
    {
      "name": "FeeTier",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "Base"
          },
          {
            "name": "SRM2"
          },
          {
            "name": "SRM3"
          },
          {
            "name": "SRM4"
          },
          {
            "name": "SRM5"
          },
          {
            "name": "SRM6"
          },
          {
            "name": "MSRM"
          },
          {
            "name": "Stable"
          }
        ]
      }
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "IncorrectSystemProgram",
      "msg": "Must use correct SystemProgram"
    },
    {
      "code": 6001,
      "name": "BadReclaimAddress",
      "msg": "Reclaim account's Mint must match"
    },
    {
      "code": 6002,
      "name": "ReclaimDateHasPassed",
      "msg": "Reclaim date must be in the future"
    },
    {
      "code": 6003,
      "name": "BoundPriceIsZero",
      "msg": "Bound price must be greater than 0"
    },
    {
      "code": 6004,
      "name": "NonBinaryOrderSide",
      "msg": "Order side must be 0 or 1"
    },
    {
      "code": 6005,
      "name": "NonBinaryBound",
      "msg": "Bound must be 0 or 1"
    },
    {
      "code": 6006,
      "name": "MarketPriceIsOutOfBounds",
      "msg": "Market price is out of bounds"
    },
    {
      "code": 6007,
      "name": "NoLowerBoundedBids",
      "msg": "Lower bounded bids are blocked"
    },
    {
      "code": 6008,
      "name": "NoUpperBoundedAsks",
      "msg": "Upper bounded asks are blocked"
    },
    {
      "code": 6009,
      "name": "ReclaimDateHasNotPassed",
      "msg": "Cannot reclaim assets before the reclaim date"
    },
    {
      "code": 6010,
      "name": "TransferAmountCantBe0",
      "msg": "Transfer amount cannot be 0"
    },
    {
      "code": 6011,
      "name": "BidsRequireQuoteCurrency",
      "msg": "Strategy requires the quote currency to place bids"
    },
    {
      "code": 6012,
      "name": "AsksRequireBaseCurrency",
      "msg": "Strategy requires the base currency to place asks"
    },
    {
      "code": 6013,
      "name": "OrderPayerMisMatch",
      "msg": "Order payer does not match the strategy"
    },
    {
      "code": 6014,
      "name": "AuthorityMisMatch",
      "msg": "Authority does not match the strategy"
    },
    {
      "code": 6015,
      "name": "DepositAddressMisMatch",
      "msg": "Depsoit address does not match the strategy"
    },
    {
      "code": 6016,
      "name": "WrongReclaimAddress",
      "msg": "Cannot rclaim to different address"
    }
  ]
};
