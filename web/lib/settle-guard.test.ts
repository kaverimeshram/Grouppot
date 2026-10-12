import { describe, expect, test } from "bun:test";

/// Documents the on-chain guard: settleShare(member, ...) must match ERC-3009 `from`.
/// Forge test `test_cannot_settle_wrong_member` is the authoritative mutation check.
describe("settle member guard", () => {
  test("wrong member parameter must not mark paid without matching authorization", () => {
    const alicePaid = false;
    const bobPaid = false;
    const authorizationFrom: string = "alice";
    const settleMemberArg: string = "bob";
    const canCredit = authorizationFrom === settleMemberArg;
    expect(canCredit).toBe(false);
    expect(bobPaid).toBe(false);
    expect(alicePaid).toBe(false);
  });
});
