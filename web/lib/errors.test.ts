import { expect, test } from "bun:test";
import { copy } from "./copy";
import { plainError } from "./errors";

test("a refused kept place reads as the kept-place sentence, never the raw revert", () => {
  const revert = new Error('relay failed: execution reverted: "Circle:record"');
  expect(plainError(revert, 3)).toBe("This place is kept for members who have paid at least 3 rounds and never missed one.");
  expect(plainError(revert)).toBe(copy.error.record);
  expect(plainError(new Error('execution reverted: "Circle:started"'), 3)).toBe(copy.error.started);
  expect(plainError(new Error("something unexpected"), 3)).toBe(copy.error.generic);
});
