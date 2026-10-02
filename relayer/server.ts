// grouppot relayer: pays the gas for members' signatures and keeps every circle on schedule.
//   POST /api/create    organiser's circle parameters      -> CircleFactory.create
//   POST /api/join      invite + pay + standing orders     -> Circle.join
//   POST /api/contribute  a fresh authorization for the round -> Circle.contribute
//   POST /api/bond      organiser's guarantee top-up       -> Circle.addBond
//   POST /api/practice  testnet only: practice dollars, once per address per circle
//   GET  /api/health
// Keeper, every KEEPER_MS: pulls standing orders when a round opens, pays out when a round is full or due, and returns
// set-asides and the guarantee after the last round. Every write is simulated first, so the relayer only spends gas on
// calls the contract will accept, and only on circles the factory made.
// Key: products/grouppot/.secrets/relayer.json (never printed). Run: bun run relayer/server.ts
import fs from "node:fs";
import path from "node:path";
import {
  BaseError,
  ContractFunctionRevertedError,
  createPublicClient,
  createWalletClient,
  erc20Abi,
  http,
  isAddress,
  type Address,
  type Hex,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { circleAbi, factoryAbi } from "../web/lib/abi";
import { DEPLOYMENT } from "../web/lib/deployment";

const ROOT = path.resolve(import.meta.dir, "..");
const PORT = Number(process.env.PORT ?? 3411);
const RPC = process.env.MONAD_TESTNET_RPC_URL ?? "https://testnet-rpc.monad.xyz";
const KEEPER_MS = Number(process.env.KEEPER_MS ?? 20_000);
const ORIGINS = (process.env.ALLOWED_ORIGINS ?? "http://localhost:3410").split(",");
const PRACTICE_PER_ADDRESS = 120_000_000n; // $120 across all circles
const PERIODS = new Set([600, 3600, 86_400, 604_800, 1_209_600, 2_592_000]);
const DATA = path.join(ROOT, "relayer/data");
const FACTORY = DEPLOYMENT.factory as Address;
const TOKEN = DEPLOYMENT.token as Address;

const chain = { id: DEPLOYMENT.chainId, name: "Monad Testnet", nativeCurrency: { name: "MON", symbol: "MON", decimals: 18 }, rpcUrls: { default: { http: [RPC] } } } as const;
const { key } = JSON.parse(fs.readFileSync(path.join(ROOT, ".secrets/relayer.json"), "utf8")) as { key: Hex };
const account = privateKeyToAccount(key);
const pub = createPublicClient({ chain, transport: http(RPC, { retryCount: 4, retryDelay: 500 }) });
const wallet = createWalletClient({ account, chain, transport: http(RPC, { retryCount: 2, retryDelay: 500 }) });

fs.mkdirSync(DATA, { recursive: true });
const practiceFile = path.join(DATA, "practice.json");
const practiced: Record<string, string> = fs.existsSync(practiceFile) ? JSON.parse(fs.readFileSync(practiceFile, "utf8")) : {};

const log = (...a: unknown[]) => console.log(new Date().toISOString(), ...a);

// ---------- one transaction at a time, so nonces never collide ----------

let queue: Promise<unknown> = Promise.resolve();
function serial<T>(job: () => Promise<T>): Promise<T> {
  const next = queue.then(job, job);
  queue = next.catch(() => undefined);
  return next;
}

type Call = { address: Address; abi: typeof circleAbi | typeof factoryAbi | typeof erc20Abi; functionName: string; args: readonly unknown[] };

/// Simulate, send with a gas limit 15% above the estimate (Monad charges the limit), and wait for a successful receipt.
async function send(call: Call): Promise<{ hash: Hex; result: unknown; logs: readonly { address: Address; topics: readonly Hex[]; data: Hex }[] }> {
  return serial(async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sim = await pub.simulateContract({ ...(call as any), account });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const gas = await pub.estimateContractGas({ ...(call as any), account });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const hash = await wallet.writeContract({ ...(sim.request as any), gas: (gas * 115n) / 100n });
    const r = await pub.waitForTransactionReceipt({ hash, timeout: 90_000 });
    if (r.status !== "success") throw new Error(`reverted on chain: ${hash}`);
    return { hash, result: sim.result, logs: r.logs };
  });
}

function reason(e: unknown): string {
  if (e instanceof BaseError) {
    const rev = e.walk((x) => x instanceof ContractFunctionRevertedError) as ContractFunctionRevertedError | null;
    if (rev?.reason) return rev.reason;
    if (rev?.data?.errorName) return rev.data.errorName;
    return e.shortMessage;
  }
  return e instanceof Error ? e.message : String(e);
}

// ---------- request validation ----------

type SigIn = { v: number; r: Hex; s: Hex };
const isHex32 = (x: unknown): x is Hex => typeof x === "string" && /^0x[0-9a-fA-F]{64}$/.test(x);
const isSig = (x: unknown): x is SigIn => !!x && typeof x === "object" && [27, 28].includes((x as SigIn).v) && isHex32((x as SigIn).r) && isHex32((x as SigIn).s);
const big = (x: unknown): bigint => {
  if (typeof x !== "string" || !/^\d{1,78}$/.test(x)) throw new Error("bad number");
  return BigInt(x);
};
const addr = (x: unknown): Address => {
  if (typeof x !== "string" || !isAddress(x)) throw new Error("bad address");
  return x;
};

async function knownCircle(x: unknown): Promise<Address> {
  const c = addr(x);
  if (!(await pub.readContract({ address: FACTORY, abi: factoryAbi, functionName: "isCircle", args: [c] }))) throw new Error("not a grouppot circle");
  return c;
}

const createdBy = new Map<string, number[]>();
function rateLimit(ip: string, perDay: number) {
  const now = Date.now();
  const hits = (createdBy.get(ip) ?? []).filter((t) => now - t < 86_400_000);
  if (hits.length >= perDay) throw new Error("too many circles from this connection today");
  hits.push(now);
  createdBy.set(ip, hits);
}

// ---------- endpoints ----------

const routes: Record<string, (b: Record<string, unknown>, ip: string) => Promise<Record<string, unknown>>> = {
  async create(b, ip) {
    const labels = b.labels;
    if (!Array.isArray(labels) || labels.length < 2 || labels.length > 20 || !labels.every((l) => typeof l === "string" && l.trim().length > 0 && l.length <= 32)) {
      throw new Error("2 to 20 names, each up to 32 characters");
    }
    if (typeof b.name !== "string" || !b.name.trim() || b.name.length > 48) throw new Error("name the circle (up to 48 characters)");
    const contribution = big(b.contribution);
    if (contribution < 1_000_000n || contribution > 1_000_000_000n) throw new Error("between $1 and $1,000 a round");
    const period = Number(b.period);
    if (!PERIODS.has(period)) throw new Error("unsupported schedule");
    rateLimit(ip, 10);
    const { hash, logs } = await send({
      address: FACTORY,
      abi: factoryAbi,
      functionName: "create",
      args: [b.name.trim(), labels.map((l: string) => l.trim()), contribution, BigInt(period), addr(b.organiser), addr(b.inviteSigner)],
    });
    const created = logs.find((l) => l.address.toLowerCase() === FACTORY.toLowerCase());
    const circle = created ? (`0x${created.topics[1]!.slice(26)}` as Address) : undefined;
    if (!circle || !(await pub.readContract({ address: FACTORY, abi: factoryAbi, functionName: "isCircle", args: [circle] }))) {
      throw new Error("created, but the circle could not be read back");
    }
    log("create", circle, hash);
    return { hash, circle };
  },

  async join(b) {
    const circle = await knownCircle(b.circle);
    if (!isSig(b.invite) || !isSig(b.pay) || !Array.isArray(b.rounds) || !b.rounds.every(isSig)) throw new Error("bad signatures");
    const { hash } = await send({
      address: circle,
      abi: circleAbi,
      functionName: "join",
      args: [BigInt(Number(b.slot)), addr(b.member), b.invite, big(b.payValidBefore), b.pay, b.rounds],
    });
    log("join", circle, b.member, hash);
    kick(circle);
    return { hash, circle };
  },

  async contribute(b) {
    const circle = await knownCircle(b.circle);
    if (!isSig(b.sig)) throw new Error("bad signature");
    const { hash } = await send({ address: circle, abi: circleAbi, functionName: "contribute", args: [addr(b.member), 0n, big(b.validBefore), b.sig] });
    log("contribute", circle, b.member, hash);
    kick(circle);
    return { hash, circle };
  },

  async bond(b) {
    const circle = await knownCircle(b.circle);
    if (!isSig(b.sig)) throw new Error("bad signature");
    const { hash } = await send({ address: circle, abi: circleAbi, functionName: "addBond", args: [big(b.amount), big(b.validBefore), b.sig] });
    log("bond", circle, b.amount, hash);
    return { hash, circle };
  },

  /// Testnet practice dollars for one circle: round 1, the set-aside and every later round, plus the guarantee when the
  /// organiser asks. Once per address per circle; at most PRACTICE_PER_ADDRESS per address in total.
  async practice(b) {
    const who = addr(b.address).toLowerCase() as Address;
    const circle = await knownCircle(b.circle);
    const k = `${who}:${circle.toLowerCase()}`;
    if (practiced[k]) throw new Error("practice dollars already added for this phone");
    const [c, n, organiser] = await Promise.all([
      pub.readContract({ address: circle, abi: circleAbi, functionName: "contribution" }),
      pub.readContract({ address: circle, abi: circleAbi, functionName: "size" }),
      pub.readContract({ address: circle, abi: circleAbi, functionName: "organiser" }),
    ]);
    let amount = (n + 1n) * c;
    if (b.bond !== undefined) {
      const bond = big(b.bond);
      if (organiser.toLowerCase() !== who || bond > (n - 2n) * c) throw new Error("guarantee too large");
      amount += bond;
    }
    const spent = Object.entries(practiced).filter(([key]) => key.startsWith(`${who}:`)).reduce((t, [, v]) => t + BigInt(v.split("|")[1] ?? "0"), 0n);
    if (spent + amount > PRACTICE_PER_ADDRESS) throw new Error("practice dollars already added for this phone");
    practiced[k] = "pending|0";
    try {
      const { hash } = await send({ address: TOKEN, abi: erc20Abi, functionName: "transfer", args: [who, amount] });
      practiced[k] = `${hash}|${amount}`;
      fs.writeFileSync(practiceFile, JSON.stringify(practiced, null, 1));
      log("practice", who, circle, amount, hash);
      return { hash, amount: amount.toString() };
    } catch (e) {
      delete practiced[k];
      throw e;
    }
  },
};

// ---------- keeper ----------

const kicked = new Set<Address>();
function kick(circle: Address) {
  kicked.add(circle);
}

async function tend(circle: Address) {
  const v = await pub.readContract({ address: circle, abi: circleAbi, functionName: "snapshot" });
  const now = BigInt(Math.floor(Date.now() / 1000));
  if (v.start === 0n) return;
  if (v.round < v.size) {
    if (now >= v.opensAt && v.paidCount < v.size) {
      // only spend gas when at least one standing order will actually pull
      const sim = await pub.simulateContract({ address: circle, abi: circleAbi, functionName: "collect", account }).catch(() => null);
      if (sim && sim.result > 0n) log("collect", circle, `round ${v.round}`, (await send({ address: circle, abi: circleAbi, functionName: "collect", args: [] })).hash);
    }
    const fresh = await pub.readContract({ address: circle, abi: circleAbi, functionName: "paidCount", args: [v.round] });
    if ((fresh === v.size && now >= v.opensAt) || now > v.dueAt) {
      log("payout", circle, `round ${v.round}`, (await send({ address: circle, abi: circleAbi, functionName: "payout", args: [] })).hash);
      kick(circle);
    }
    return;
  }
  for (const m of v.members) {
    const done = await pub.readContract({ address: circle, abi: circleAbi, functionName: "returned", args: [m.member] });
    if (!done) log("set-aside back", circle, m.member, (await send({ address: circle, abi: circleAbi, functionName: "returnSetAside", args: [m.member] })).hash);
  }
  if (!(await pub.readContract({ address: circle, abi: circleAbi, functionName: "bondReturned" }))) {
    log("guarantee back", circle, (await send({ address: circle, abi: circleAbi, functionName: "returnBond", args: [] })).hash);
  }
}

const finished = new Set<Address>();
async function keeperPass() {
  const n = await pub.readContract({ address: FACTORY, abi: factoryAbi, functionName: "count" });
  const all = await pub.readContract({ address: FACTORY, abi: factoryAbi, functionName: "page", args: [0n, n] });
  for (const circle of [...new Set([...kicked, ...all])]) {
    if (finished.has(circle)) continue;
    kicked.delete(circle);
    try {
      await tend(circle);
      if (await pub.readContract({ address: circle, abi: circleAbi, functionName: "bondReturned" })) finished.add(circle);
    } catch (e) {
      log("keeper", circle, reason(e));
    }
  }
}

let keeping = false;
setInterval(async () => {
  if (keeping) return;
  keeping = true;
  await keeperPass().catch((e) => log("keeper pass", reason(e)));
  keeping = false;
}, KEEPER_MS);

// ---------- http ----------

function cors(origin: string | null): Record<string, string> {
  return origin && ORIGINS.includes(origin)
    ? { "access-control-allow-origin": origin, "access-control-allow-methods": "GET,POST,OPTIONS", "access-control-allow-headers": "content-type" }
    : {};
}

const server = Bun.serve({
  port: PORT,
  async fetch(req, srv) {
    const url = new URL(req.url);
    const headers = { "content-type": "application/json", ...cors(req.headers.get("origin")) };
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers });
    if (url.pathname === "/api/health") {
      const [mon, usd, count] = await Promise.all([
        pub.getBalance({ address: account.address }),
        pub.readContract({ address: TOKEN, abi: erc20Abi, functionName: "balanceOf", args: [account.address] }),
        pub.readContract({ address: FACTORY, abi: factoryAbi, functionName: "count" }),
      ]);
      return Response.json({ ok: true, factory: FACTORY, circles: Number(count), gasReserveMon: Number(mon) / 1e18, practiceDollars: Number(usd) / 1e6 }, { headers });
    }
    const name = url.pathname.replace(/^\/api\//, "");
    const route = req.method === "POST" ? routes[name] : undefined;
    if (!route) return Response.json({ error: "not found" }, { status: 404, headers });
    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? srv.requestIP(req)?.address ?? "?";
    try {
      const body = (await req.json()) as Record<string, unknown>;
      return Response.json(await route(body, ip), { headers });
    } catch (e) {
      log(name, "refused:", reason(e));
      return Response.json({ error: reason(e) }, { status: 400, headers });
    }
  },
});
log(`relayer ${account.address} on :${server.port}, factory ${FACTORY}, keeper every ${KEEPER_MS}ms`);
