import { expect, mock, test } from "bun:test";

const notAllowed = Object.assign(new Error("The operation either timed out or was not allowed."), { name: "NotAllowedError" });
mock.module("./passkey", () => ({
  signInWithPasskey: async () => { throw notAllowed; },
  createPasskeyAccount: async () => { throw notAllowed; },
}));
const { unlock } = await import("./session");
const { NoPasskeyHere, plainError } = await import("./errors");
const { copy } = await import("./copy");

test("a returning sign-in that opens no passkey says so instead of reading as a cancel", async () => {
  const e = await unlock("ana", true).catch((x) => x);
  expect(e).toBeInstanceOf(NoPasskeyHere);
  expect(plainError(e)).toBe(copy.error.noPasskeyHere);
});

test("a cancelled first-time creation stays a plain cancel", async () => {
  const e = await unlock("ana", false).catch((x) => x);
  expect(e).not.toBeInstanceOf(NoPasskeyHere);
  expect(plainError(e)).toBe(copy.error.unlockCancelled);
});
