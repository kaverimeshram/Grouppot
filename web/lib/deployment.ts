// Monad testnet deployment, from deployments/testnet.json. Circles from earlier factories stay readable and kept.
export const DEPLOYMENT = {
  "chainId": 10143,
  "factory": "0xb7a5618c080d7702ad81cdd1d257c2e14065f0d2",
  "token": "0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC",
  "block": 67552995
} as const;

export const EARLIER_FACTORIES = ["0xc8dc1ac9fdfd856b367c0d1975eaf084b4b773bf", "0xef3c218f4d397b74ba6fdc3d6134cca47cefc159"] as const;
