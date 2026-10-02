import { expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

// A member or organiser never reads these. Matched as whole words, case-insensitive, except MON which is a unit name
// only when upper case ("Mon 5 Oct" is a weekday).
const BANNED =
  /\b(wallet|gas|tokens?|chain|blockchain|crypto|ausd|usdc|address|hash|transactions?|tx|sign|signs|signed|signing|signature|approve|approved|approval|seed|keys?|network|contract|testnet|relayer|web3|onchain|escrow|collateral|stake|staking|slash|slashed|slashing|mint|minted|nft|dapp|passkey|passkeys|biometric)\b/i;
const MON = /\bMON\b/;
const HEX = /0x[0-9a-f]{6}/i;

const root = path.resolve(import.meta.dir, "..");

/// Every piece of text a file can put on screen: string literals, template text and JSX text. Import paths are code.
export function visibleStrings(file: string, source: string): string[] {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.ES2020, true, file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const out: string[] = [];
  const visit = (n: ts.Node) => {
    if (ts.isImportDeclaration(n) || ts.isExportDeclaration(n)) return;
    if (ts.isTypeNode(n)) return;
    if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n) || ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n)) out.push(n.text);
    else if (ts.isJsxText(n) && n.text.trim() !== "") out.push(n.text);
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

export function offences(strings: string[]): string[] {
  return strings.filter((s) => BANNED.test(s) || MON.test(s) || HEX.test(s) || s.includes("\u2014") || new RegExp(" " + "-".repeat(2) + " ").test(s));
}

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? walk(p) : /\.tsx?$/.test(e.name) ? [p] : [];
  });
}

const files = [path.join(root, "lib/copy.ts"), ...walk(path.join(root, "app"))];

test("the scanner reads real surfaces, not an empty set", () => {
  expect(files.length).toBeGreaterThanOrEqual(8);
  const copyStrings = visibleStrings("copy.ts", fs.readFileSync(path.join(root, "lib/copy.ts"), "utf8"));
  expect(copyStrings.length).toBeGreaterThan(150);
  const jsx = files.filter((f) => f.endsWith(".tsx")).flatMap((f) => visibleStrings(f, fs.readFileSync(f, "utf8")));
  expect(jsx.length).toBeGreaterThan(100);
});

test("the scanner can fail: it flags every banned word and ignores import paths", () => {
  for (const w of ["wallet", "gas", "token", "chain", "blockchain", "crypto", "AUSD", "USDC", "address", "hash", "transaction", "tx", "sign", "signature", "approve", "seed", "key", "network", "contract", "testnet", "relayer", "web3", "onchain", "escrow", "collateral", "stake", "slashing", "mint", "NFT", "passkey"]) {
    expect(offences(visibleStrings("x.tsx", `export const a = <p>Your ${w} is ready</p>;`)).length).toBe(1);
    expect(offences(visibleStrings("x.ts", `export const a = "Your ${w} is ready";`)).length).toBe(1);
  }
  expect(offences(visibleStrings("x.ts", 'export const a = "Add MON now";'))).toHaveLength(1);
  expect(offences(visibleStrings("x.ts", 'export const a = "0xc41064 is yours";'))).toHaveLength(1);
  expect(offences(visibleStrings("x.ts", "export const a = `${1} \u2014 ${2}`;"))).toHaveLength(1);
  expect(offences(visibleStrings("x.ts", 'import { balanceOf } from "../lib/chain"; export const a = "Design Monday keyboard";'))).toHaveLength(0);
});

test("no member-visible string anywhere in copy.ts or app/ carries a banned word", () => {
  const found = files.flatMap((f) => offences(visibleStrings(f, fs.readFileSync(f, "utf8"))).map((s) => `${path.relative(root, f)}: ${s}`));
  expect(found).toEqual([]);
});
