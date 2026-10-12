import { expect, test } from "bun:test";
import { discoverCircles, isCircleMember } from "./circle-discovery";
import type { Snapshot } from "./chain";
import type { Address } from "viem";

const ORGANISER = "0xe9b80937C8C7af5BdfD57D6b9577bFD07FdFDe8A" as Address;
const MEMBER = "0x303F502E04b92cFA5B671b51AF29a05209a4DE1e" as Address;
const ORGANISER_ONLY_OWNER = "0x15aeC00d2D19571E440721BD746f560eFD34bdb0" as Address;
const UNRELATED = "0x000000000000000000000000000000000000dEaD" as Address;
const EXISTING_CIRCLE = "0x41F53F274678FFd143b422CbBd5D42eC601980D9" as Address;
const ORGANISER_ONLY_CIRCLE = "0x19E7a5A1240EeA412874B5c6caa417042e1EF824" as Address;

test("membership accepts the organiser or a current member and rejects others", () => {
  const snapshot = { organiser: ORGANISER_ONLY_OWNER, members: [{ member: MEMBER }] } as unknown as Snapshot;
  expect(isCircleMember(snapshot, ORGANISER_ONLY_OWNER)).toBe(true);
  expect(isCircleMember(snapshot, MEMBER)).toBe(true);
  expect(isCircleMember(snapshot, UNRELATED)).toBe(false);
});

test("recovers real organiser and member circles and filters a nonmember local reference", async () => {
  const organised = await discoverCircles(ORGANISER);
  expect(organised.some((circle) => circle.address.toLowerCase() === EXISTING_CIRCLE.toLowerCase())).toBe(true);

  const joined = await discoverCircles(MEMBER, [ORGANISER_ONLY_CIRCLE]);
  expect(joined.some((circle) => circle.address.toLowerCase() === EXISTING_CIRCLE.toLowerCase())).toBe(true);
  expect(joined.some((circle) => circle.address.toLowerCase() === ORGANISER_ONLY_CIRCLE.toLowerCase())).toBe(false);
}, 90_000);
