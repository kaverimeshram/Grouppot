// Deploys CircleFactory on Monad testnet with the grouppot relayer key (.secrets/relayer.json, never printed) and
// records the address in deployments/testnet.json. Usage: bun run scripts/deploy.ts
import fs from "node:fs";
import path from "node:path";
import { createPublicClient, createWalletClient, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const ROOT = path.resolve(import.meta.dir, "..");
const RPC = process.env.MONAD_TESTNET_RPC_URL ?? "https://testnet-rpc.monad.xyz";
const AUSD = "0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC";
const chain = { id: 10143, name: "Monad Testnet", nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 }, rpcUrls: { default: { http: [RPC] } } } as const;

const { key } = JSON.parse(fs.readFileSync(path.join(ROOT, ".secrets/relayer.json"), "utf8")) as { key: Hex };
const account = privateKeyToAccount(key);
const artifact = JSON.parse(fs.readFileSync(path.join(ROOT, "contracts/out/CircleFactory.sol/CircleFactory.json"), "utf8"));
const pub = createPublicClient({ chain, transport: http(RPC) });
const wallet = createWalletClient({ account, chain, transport: http(RPC) });

const hash = await wallet.deployContract({ abi: artifact.abi, bytecode: artifact.bytecode.object as Hex, args: [AUSD] });
const r = await pub.waitForTransactionReceipt({ hash, timeout: 120_000 });
if (r.status !== "success" || !r.contractAddress) throw new Error(`deploy failed: ${hash}`);
const token = await pub.readContract({ address: r.contractAddress, abi: artifact.abi, functionName: "token" });
if (String(token).toLowerCase() !== AUSD.toLowerCase()) throw new Error("post-condition failed: factory.token() mismatch");
const out = { chainId: 10143, factory: r.contractAddress, token: AUSD, deployTx: hash, block: Number(r.blockNumber), relayer: account.address };
fs.mkdirSync(path.join(ROOT, "deployments"), { recursive: true });
fs.writeFileSync(path.join(ROOT, "deployments/testnet.json"), JSON.stringify(out, null, 2) + "\n");
console.log(JSON.stringify(out));
