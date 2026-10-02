// Reads real circles from Monad testnet and pins them as fixtures for the tests: bun run relayer/fixtures/capture.ts <circle>...
// Each file records the block it was read at, so a figure in a test traces back to one eth_call.
import fs from "node:fs";
import path from "node:path";
import { createPublicClient, http, type Address } from "viem";
import { circleAbi } from "../../web/lib/abi";
import { stringify } from "../snapshot";

const pub = createPublicClient({ transport: http(process.env.MONAD_TESTNET_RPC_URL || "https://testnet-rpc.monad.xyz", { retryCount: 4, retryDelay: 500 }) });
for (const circle of process.argv.slice(2) as Address[]) {
  const blockNumber = await pub.getBlockNumber();
  const v = await pub.readContract({ address: circle, abi: circleAbi, functionName: "snapshot", blockNumber });
  const file = path.join(import.meta.dir, `${circle.toLowerCase()}.json`);
  fs.writeFileSync(file, `${JSON.stringify({ call: `eth_call snapshot() on ${circle}`, rpc: "Monad testnet 10143", block: blockNumber.toString(), read: new Date().toISOString(), snapshot: JSON.parse(stringify({ ...v, address: circle })) }, null, 1)}\n`);
  console.log(file, "block", blockNumber, v.name);
}
