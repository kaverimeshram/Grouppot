// Claims testnet AUSD from Agora's faucet (requestFunds(address), 0xd236c18D274E54FAccC3dd9DDA4b27965a73ee6C) for the
// relayer's practice treasury, and appends the result to docs/relayer-topups.md. Key from .secrets/relayer.json, never printed.
import fs from "node:fs";
import path from "node:path";
import { createPublicClient, createWalletClient, erc20Abi, http, parseAbi, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";

const ROOT = path.resolve(import.meta.dir, "..");
const RPC = process.env.MONAD_TESTNET_RPC_URL || "https://testnet-rpc.monad.xyz";
const FAUCET = "0xd236c18D274E54FAccC3dd9DDA4b27965a73ee6C";
const AUSD = "0xa9012a055bd4e0eDfF8Ce09f960291C09D5322dC";
const chain = { id: 10143, name: "Monad Testnet", nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 }, rpcUrls: { default: { http: [RPC] } } } as const;
const { key } = JSON.parse(fs.readFileSync(path.join(ROOT, ".secrets/relayer.json"), "utf8")) as { key: Hex };
const account = privateKeyToAccount(key);
const pub = createPublicClient({ chain, transport: http(RPC) });
const w = createWalletClient({ account, chain, transport: http(RPC) });
const bal = () => pub.readContract({ address: AUSD, abi: erc20Abi, functionName: "balanceOf", args: [account.address] });

const before = await bal();
const hash = await w.writeContract({ address: FAUCET, abi: parseAbi(["function requestFunds(address)"]), functionName: "requestFunds", args: [account.address] });
const r = await pub.waitForTransactionReceipt({ hash, timeout: 120_000 });
if (r.status !== "success") throw new Error(`faucet reverted: ${hash}`);
const after = await bal();
if (after <= before) throw new Error(`faucet succeeded but the treasury did not grow (${before} -> ${after})`);
const line = `- ${new Date().toISOString()} Agora faucet -> relayer ${account.address}: +${Number(after - before) / 1e6} AUSD (now ${Number(after) / 1e6}), tx ${hash}`;
fs.appendFileSync(path.join(ROOT, "docs/relayer-topups.md"), (fs.existsSync(path.join(ROOT, "docs/relayer-topups.md")) ? "" : "# grouppot relayer top-ups (Monad testnet)\n\n") + line + "\n");
console.log(line);
