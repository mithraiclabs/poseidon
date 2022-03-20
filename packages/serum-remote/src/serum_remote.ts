export type SerumRemote = {
  "version": "0.1.0",
  "name": "serum_remote",
  "instructions": [
    {
      "name": "initialize",
      "accounts": [],
      "args": []
    },
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
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "openOrders",
          "isMut": true,
          "isSigner": false
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
        }
      ]
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
            "name": "seurmMarket",
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
            "name": "bound",
            "type": "u8"
          },
          {
            "name": "boundedPrice",
            "type": "u64"
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
    }
  ]
};

export const IDL: SerumRemote = {
  "version": "0.1.0",
  "name": "serum_remote",
  "instructions": [
    {
      "name": "initialize",
      "accounts": [],
      "args": []
    },
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
          "isMut": false,
          "isSigner": false
        },
        {
          "name": "openOrders",
          "isMut": true,
          "isSigner": false
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
        }
      ]
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
            "name": "seurmMarket",
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
            "name": "bound",
            "type": "u8"
          },
          {
            "name": "boundedPrice",
            "type": "u64"
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
    }
  ]
};
