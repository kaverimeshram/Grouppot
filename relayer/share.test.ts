process.env.TZ = "UTC"; // the day a preview names is read in the server's zone; pin it so the expected lines are exact
import { describe, expect, test } from "bun:test";
import { circleSvg, genericSvg, isCircleId, png, previewFor, previewLine, render, shareHtml, wrap, genericPreview } from "./share";
import { sentence } from "../web/lib/circle-state";
import { CLOSED, edit, fixture, SATURDAY } from "./fixtures";

const live = fixture(SATURDAY).snapshot;
const closed = fixture(CLOSED).snapshot;
const OPENS = Number(live.opensAt);
const DUE = Number(live.dueAt);

describe("which links get a circle's card", () => {
  test("only 0x and 40 hex digits", () => {
    expect(isCircleId(SATURDAY)).toBe(true);
    expect(isCircleId(SATURDAY.toUpperCase().replace("0X", "0x"))).toBe(true);
    for (const bad of [null, undefined, "", "0x", "0x123", `${SATURDAY}0`, SATURDAY.slice(0, -1), SATURDAY.replace("0x", "1x"), `${SATURDAY} `, "0xzz".padEnd(42, "z"), ["a"]]) {
      expect(isCircleId(bad)).toBe(false);
    }
  });
});

describe("the sentence a preview carries", () => {
  test("an open round names the day it is due, the way the brief reads", () => {
    expect(previewLine(live, OPENS + 100)).toBe("4 of 5 paid. Ada collects by Fri 16 Oct.");
  });
  test("a round that has not opened yet", () => {
    expect(previewLine(live, OPENS - 1000)).toBe("4 of 5 already paid. Round 2 opens Fri 9 Oct.");
    const none = edit(live, (c) => {
      c.paidCount = 0n;
      c.members.forEach((m) => (m.paidThisRound = false));
    });
    expect(previewLine(none, OPENS - 1000)).toBe("Round 2 opens Fri 9 Oct. Nothing is due yet.");
  });
  test("past the due day", () => {
    expect(previewLine(live, DUE + 5)).toBe("Time is up. Ada collects any moment now.");
  });
  test("states with no time in them are the page's own sentence", () => {
    const all = edit(live, (c) => {
      c.paidCount = 5n;
      c.members.forEach((m) => (m.paidThisRound = true));
    });
    const filling = edit(live, (c) => {
      c.start = 0n;
      c.joined = 3n;
    });
    const empty = edit(filling, (c) => (c.joined = 0n));
    for (const [s, now] of [[all, OPENS + 100], [closed, DUE], [filling, OPENS], [empty, OPENS]] as const) {
      expect(previewLine(s, now)).toBe(sentence(s, now));
    }
    expect(previewLine(closed, DUE)).toBe("Everyone paid in and everyone collected. Set-asides go back to each member.");
  });
});

describe("the page a crawler reads", () => {
  const html = shareHtml(previewFor(live, OPENS + 100));
  test("carries every tag the chat apps need", () => {
    const img = "https://grouppot.vercel.app/api/og?id=0x4e1afdcfae179debac986830b10473c3fd88f6f3&amp;r=1.4";
    for (const tag of [
      `<meta property="og:title" content="Saturday Ajo">`,
      `<meta property="og:description" content="4 of 5 paid. Ada collects by Fri 16 Oct.">`,
      `<meta property="og:url" content="https://grouppot.vercel.app/c/?id=0x4e1afdcfae179debac986830b10473c3fd88f6f3">`,
      `<meta property="og:image" content="${img}">`,
      `<meta property="og:image:width" content="1200">`,
      `<meta property="og:image:height" content="630">`,
      `<meta name="twitter:card" content="summary_large_image">`,
      `<meta name="twitter:image" content="${img}">`,
      `<a href="https://grouppot.vercel.app/c/?id=0x4e1afdcfae179debac986830b10473c3fd88f6f3">Open the circle</a>`,
    ]) {
      expect(html).toContain(tag);
    }
  });
  test("a circle named with markup cannot break out of the tags", () => {
    const evil = shareHtml(previewFor(edit(live, (c) => (c.name = `"><script>x</script> & co`)), OPENS));
    expect(evil).not.toContain("<script>");
    expect(evil).toContain("&quot;&gt;&lt;script&gt;x&lt;/script&gt; &amp; co");
  });
  test("the generic page for a link that is not a circle", () => {
    const g = shareHtml(genericPreview());
    expect(g).toContain(`<meta property="og:image" content="https://grouppot.vercel.app/api/og">`);
    expect(g).toContain("A savings circle everyone can see.");
  });
});

describe("the picture", () => {
  const lime = (svg: string) => {
    const px = render(svg).pixels;
    let n = 0;
    for (let i = 0; i < px.length; i += 4) if (px[i] === 0x9f && px[i + 1] === 0xe8 && px[i + 2] === 0x70) n++;
    return n;
  };
  test("is a 1200 by 630 PNG", () => {
    const bytes = png("t", circleSvg(live, OPENS + 100));
    expect([...bytes.slice(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const dv = new DataView(bytes.buffer, bytes.byteOffset);
    expect([dv.getUint32(16), dv.getUint32(20)]).toEqual([1200, 630]);
  });
  test("draws the ring from the circle: one more paid member, more lime", () => {
    const three = edit(live, (c) => {
      c.members[4]!.paidThisRound = false;
      c.paidCount = 3n;
    });
    const two = edit(three, (c) => {
      c.members[2]!.paidThisRound = false;
      c.paidCount = 2n;
    });
    const [l2, l3, l4] = [lime(circleSvg(two, OPENS + 100)), lime(circleSvg(three, OPENS + 100)), lime(circleSvg(live, OPENS + 100))];
    expect(l2).toBeGreaterThan(10_000); // measured: 0 paid 894 (the wordmark), 2 paid 12785, 3 paid 19850, 4 paid 26894
    const none = edit(live, (c) => {
      c.members.forEach((m) => (m.paidThisRound = false));
      c.paidCount = 0n;
    });
    expect(lime(circleSvg(none, OPENS + 100))).toBeLessThan(2000);
    expect(l3).toBeGreaterThan(l2 * 1.2);
    expect(l4).toBeGreaterThan(l3 * 1.2);
  });
  test("a stopped payer is red, a covered one is yellow", () => {
    const px = (svg: string, rgb: number[]) => {
      const p = render(svg).pixels;
      let n = 0;
      for (let i = 0; i < p.length; i += 4) if (p[i] === rgb[0] && p[i + 1] === rgb[1] && p[i + 2] === rgb[2]) n++;
      return n;
    };
    const stopped = edit(live, (c) => {
      c.members[3]!.defaults = 1n;
      c.members[3]!.reserveBal = 0n;
    });
    const covered = edit(live, (c) => {
      c.members[3]!.defaults = 1n;
      c.members[3]!.reserveBal = 1n;
    });
    expect(px(circleSvg(stopped, OPENS + 100), [0xd0, 0x32, 0x38])).toBeGreaterThan(1000);
    expect(px(circleSvg(live, OPENS + 100), [0xd0, 0x32, 0x38])).toBe(0);
    expect(px(circleSvg(covered, OPENS + 100), [0xff, 0xd1, 0x1a])).toBeGreaterThan(1000);
  });
  test("is cached per picture, and a changed circle gets a new one", () => {
    const a = png("k", circleSvg(live, OPENS + 100));
    expect(png("k", circleSvg(live, OPENS + 100))).toBe(a);
    const moved = edit(live, (c) => {
      c.members[4]!.paidThisRound = false;
      c.paidCount = 3n;
    });
    expect(png("k", circleSvg(moved, OPENS + 100))).not.toBe(a);
  });
  test("the card for a link that is not a circle still renders", () => {
    expect(lime(genericSvg())).toBeGreaterThan(30_000);
  });
  test("long names and sentences are cut to the room, not run off the card", () => {
    expect(wrap("A very long circle name that keeps going and going and going", 54, 500, true, 2)).toHaveLength(2);
    expect(wrap("A very long circle name that keeps going and going and going", 54, 500, true, 2)[1]!.endsWith("…")).toBe(true);
    expect(wrap("Saturday Ajo", 54, 500, true, 2)).toEqual(["Saturday Ajo"]);
    const twenty = edit(live, (c) => {
      c.members = Array.from({ length: 20 }, (_, i) => ({ ...c.members[i % 5]!, label: `Member number ${i + 1}` }));
      c.size = 20n;
    });
    expect(render(circleSvg(twenty, OPENS + 100)).width).toBe(1200);
  });
});
