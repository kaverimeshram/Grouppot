export const tabAbi = [
  {
    type: "function",
    name: "snapshot",
    stateMutability: "view",
    inputs: [],
    outputs: [
      {
        name: "v",
        type: "tuple",
        components: [
          { name: "name", type: "string" },
          { name: "host", type: "address" },
          { name: "total", type: "uint256" },
          { name: "paidSum", type: "uint256" },
          { name: "balance", type: "uint256" },
          {
            name: "items",
            type: "tuple[]",
            components: [
              { name: "label", type: "string" },
              { name: "amount", type: "uint256" },
            ],
          },
          {
            name: "members",
            type: "tuple[]",
            components: [
              { name: "member", type: "address" },
              { name: "label", type: "string" },
              { name: "share", type: "uint256" },
              { name: "paid", type: "bool" },
            ],
          },
          { name: "closed", type: "bool" },
        ],
      },
    ],
  },
  {
    type: "function",
    name: "settleShare",
    stateMutability: "nonpayable",
    inputs: [
      { name: "member", type: "address" },
      { name: "validAfter", type: "uint256" },
      { name: "validBefore", type: "uint256" },
      { name: "nonce", type: "bytes32" },
      { name: "v", type: "uint8" },
      { name: "r", type: "bytes32" },
      { name: "s", type: "bytes32" },
    ],
    outputs: [],
  },
  { type: "function", name: "shareOf", stateMutability: "view", inputs: [{ name: "", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "paid", stateMutability: "view", inputs: [{ name: "", type: "address" }], outputs: [{ type: "bool" }] },
  { type: "function", name: "host", stateMutability: "view", inputs: [], outputs: [{ type: "address" }] },
  { type: "function", name: "total", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "closed", stateMutability: "view", inputs: [], outputs: [{ type: "bool" }] },
] as const;

export const tabFactoryAbi = [
  {
    type: "function",
    name: "create",
    stateMutability: "nonpayable",
    inputs: [
      { name: "name", type: "string" },
      { name: "host", type: "address" },
      { name: "itemLabels", type: "string[]" },
      { name: "itemAmounts", type: "uint256[]" },
      { name: "members", type: "address[]" },
      { name: "labels", type: "string[]" },
      { name: "shares", type: "uint256[]" },
    ],
    outputs: [{ name: "tab", type: "address" }],
  },
  { type: "function", name: "tabCount", stateMutability: "view", inputs: [], outputs: [{ type: "uint256" }] },
  { type: "function", name: "tabs", stateMutability: "view", inputs: [{ name: "", type: "uint256" }], outputs: [{ type: "address" }] },
] as const;
