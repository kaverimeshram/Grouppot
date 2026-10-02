import { expect, test } from "bun:test";
import { domainSeparator, recoverTypedDataAddress, type Address } from "viem";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { TOKEN, TOKEN_DOMAIN, dollars, nonceFor, parseCircleLocation, inviteLink, publicClient, signReceive, toUnits } from "./chain";

test("pinned AUSD domain hashes to the token's on-chain DOMAIN_SEPARATOR", async () => {
  const onChain = await publicClient.readContract({
    address: TOKEN,
    abi: [{ type: "function", name: "DOMAIN_SEPARATOR", inputs: [], outputs: [{ type: "bytes32" }], stateMutability: "view" }],
    functionName: "DOMAIN_SEPARATOR",
  });
  expect(domainSeparator({ domain: TOKEN_DOMAIN })).toBe(onChain);
  expect(domainSeparator({ domain: { ...TOKEN_DOMAIN, version: "2" } })).not.toBe(onChain);
});

test("a signed receive recovers to the member", async () => {
  const acct = privateKeyToAccount(generatePrivateKey());
  const circle = "0x00000000000000000000000000000000000000c1" as Address;
  const nonce = nonceFor(circle, 1n, acct.address);
  const sig = await signReceive(acct, circle, 5_000_000n, 99n, nonce);
  const back = await recoverTypedDataAddress({
    domain: TOKEN_DOMAIN,
    types: { ReceiveWithAuthorization: [
      { name: "from", type: "address" }, { name: "to", type: "address" }, { name: "value", type: "uint256" },
      { name: "validAfter", type: "uint256" }, { name: "validBefore", type: "uint256" }, { name: "nonce", type: "bytes32" }] },
    primaryType: "ReceiveWithAuthorization",
    message: { from: acct.address, to: circle, value: 5_000_000n, validAfter: 0n, validBefore: 99n, nonce },
    signature: { v: BigInt(sig.v), r: sig.r, s: sig.s },
  });
  expect(back).toBe(acct.address);
});

test("dollars and links", () => {
  expect(dollars(toUnits(10))).toBe("$10");
  expect(dollars(toUnits(2.5))).toBe("$2.50");
  const c = "0x1111111111111111111111111111111111111111" as Address;
  const k = `0x${"ab".repeat(32)}` as const;
  const u = new URL(inviteLink("https://x.test", c, k));
  expect(parseCircleLocation(u.search, u.hash)).toEqual({ circle: c, inviteKey: k });
  expect(parseCircleLocation("?id=nope", "#k=zz")).toEqual({ circle: null, inviteKey: null });
});

test("payment record reads from the live factory, and the early-slot rule matches the contract", async () => {
  const { readRecord, readEarlySlots, clearsEarlySlot } = await import("./chain");
  const r = await readRecord("0x000000000000000000000000000000000000dEaD");
  expect(r).toEqual({ paid: 0, missed: 0, finished: 0, finishedClean: 0 });
  expect(await readEarlySlots("0x4e1afdcfae179debac986830b10473c3fd88f6f3")).toEqual({ earlySlots: 0, minPaid: 0 });
  expect(clearsEarlySlot({ paid: 5, missed: 0, finished: 1, finishedClean: 1 }, 5)).toBe(true);
  expect(clearsEarlySlot({ paid: 5, missed: 1, finished: 1, finishedClean: 0 }, 5)).toBe(false);
  expect(clearsEarlySlot({ paid: 4, missed: 0, finished: 0, finishedClean: 0 }, 5)).toBe(false);
});
