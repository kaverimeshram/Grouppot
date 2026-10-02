// Every word the relayer says to a person outside the app: link previews and the Telegram bot. words.test.ts fails if a
// banned word reaches any of it. Amounts arrive already formatted as dollars; days arrive already phrased by lib/time.ts.
import { copy } from "../web/lib/copy";

export const list = (names: string[]) =>
  names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;

export const SITE = "https://grouppot.vercel.app";

export const words = {
  brand: copy.brand,
  site: SITE.replace("https://", ""),
  genericTitle: copy.titles.home,
  genericDescription: copy.description,
  openCircle: "Open the circle",
  // the line a circle's preview carries when the round is open: same words as the page's sentence, with a day not a clock
  collectsBy: (paid: number, size: number, who: string, day: string) => `${paid} of ${size} paid. ${who} collects by ${day}.`,
  opensOn: (round: number, day: string) => `Round ${round} opens ${day}. Nothing is due yet.`,
  aheadOn: (paid: number, size: number, round: number, day: string) => `${paid} of ${size} already paid. Round ${round} opens ${day}.`,
  ringLabel: (name: string, line: string) => `${name}. ${line}`,

  event: {
    joined: (names: string[], joined: number, size: number) => `${list(names)} joined. ${joined} of ${size} have joined.`,
    started: (name: string, size: number, who: string, day: string, amount: string) =>
      `${name} is full and has started. Round 1 of ${size}: ${who} collects ${amount} by ${day}.`,
    paid: (names: string[], round: number, paid: number, size: number) => `${list(names)} paid for round ${round}. ${paid} of ${size} paid.`,
    paidAll: (names: string[], round: number, who: string) => `${list(names)} paid for round ${round}. ${copy.circle.sentenceAllPaid(who)}`,
    payout: (who: string, round: number, size: number, amount: string | null) =>
      amount ? `${who} collected ${amount} for round ${round} of ${size}.` : `${who} collected round ${round} of ${size}.`,
    coveredSetAside: (names: string[]) => copy.circle.coveredMany(names),
    coveredGuarantee: (names: string[]) => `${list(names)} missed a round. The organiser's guarantee covered it, so everyone was paid in full.`,
    coveredBoth: (names: string[]) => `${list(names)} missed a round. Their set-aside and the organiser's guarantee covered it, so everyone was paid in full.`,
    short: (names: string[], round: number, who: string) =>
      `${list(names)} ${copy.status.stopped.toLowerCase()}. Round ${round} was not covered in full, so ${who} collected less.`,
    closed: (name: string) => `${name} is complete. Everyone has collected.`,
    returnedBoth: "Set-asides are back with each member and the guarantee is back with the organiser.",
    returnedSetAside: "Set-asides are back with each member.",
    returnedGuarantee: "The guarantee is back with the organiser.",
  },

  bot: {
    start: `Add me to your group chat, then send /watch and paste your circle link.\nI post here when someone joins, pays, or collects.`,
    watchUsage: "Send /watch and paste the circle link, like /watch https://grouppot.vercel.app/c/?id=...",
    watchBad: "That link does not open a circle. Check it and paste it again.",
    watchOk: (name: string) => `Watching ${name}. I will post here when something happens. Send /circle for where it stands, /stop to stop.`,
    watchSwitched: (name: string) => `Now watching ${name} instead.`,
    notWatching: "This chat is not watching a circle yet. Send /watch and paste the circle link.",
    stopped: "Stopped. I will not post here any more. Send /watch to start again.",
    stoppedNothing: "This chat was not watching a circle.",
    cantRead: "I could not load the circle just now. Try again in a minute.",
    circleHead: (name: string, round: number, size: number) => `${name}. ${copy.circle.roundOf(round, size)}`,
    circleDone: (name: string) => `${name}. ${copy.circle.centreDone}`,
    sentence: (s: string) => s,
    paidLine: (names: string[]) => `Paid: ${names.length ? list(names) : "nobody yet"}.`,
    notYetLine: (names: string[]) => `Not yet: ${names.length ? list(names) : "nobody"}.`,
    openSpots: (n: number) => `${n} ${n === 1 ? "spot" : "spots"} still open.`,
    commands: {
      watch: "Watch a circle: paste its link",
      circle: "Where the circle stands",
      stop: "Stop posting here",
    },
  },
} as const;
