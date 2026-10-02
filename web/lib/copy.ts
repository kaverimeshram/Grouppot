// Every word a member or organiser can read lives in this file. copy.test.ts fails the build if a banned word reaches
// it, or any file under app/. Amounts arrive already formatted as dollars; times arrive already phrased by lib/time.ts.

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const list = (names: string[]) =>
  names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;

export const copy = {
  brand: "grouppot",
  description: "A savings circle everyone can see. Each round everyone puts in and one person collects, on the day.",
  titles: {
    home: "grouppot: a savings circle everyone can see",
    start: "grouppot: start a circle",
    circle: "grouppot: your circle",
  },

  time: {
    now: "now",
    underMinute: "in under a minute",
    inMinutes: (n: number) => `in ${n} min`,
    today: (clock: string) => `today ${clock}`,
    tomorrow: (clock: string) => `tomorrow ${clock}`,
    days: (n: number) => plural(n, "day", "days"),
    hours: (n: number) => plural(n, "hour", "hours"),
  },

  periods: {
    practice: "Practice: every 10 minutes",
    week: "Every week",
    fortnight: "Every 2 weeks",
    month: "Every month",
    // as a clause: "one person collects ___"
    clause: (seconds: number) =>
      seconds === 600
        ? "every 10 minutes"
        : seconds === 604800
          ? "each week"
          : seconds === 1209600
            ? "every 2 weeks"
            : seconds === 2592000
              ? "each month"
              : `every ${Math.max(1, Math.round(seconds / 86400))} days`,
    label: (seconds: number) =>
      seconds === 600
        ? "Every 10 minutes"
        : seconds === 604800
          ? "Every week"
          : seconds === 1209600
            ? "Every 2 weeks"
            : seconds === 2592000
              ? "Every month"
              : `Every ${Math.max(1, Math.round(seconds / 86400))} days`,
  },

  common: {
    copied: "Copied",
    copyLink: "Copy link",
    back: "Back",
    tryAgain: "Try again",
    checkNow: "Check now",
    remove: (name: string) => `Remove ${name}`,
    moveUp: (name: string) => `Move ${name} up`,
    moveDown: (name: string) => `Move ${name} down`,
    more: (name: string) => `More ${name}`,
    less: (name: string) => `Less ${name}`,
  },

  home: {
    headline: "Your savings circle, where everyone can see it.",
    lead: "Everyone puts in each round and one person collects. grouppot shows who has paid and pays the right person on the day.",
    start: "Start a circle",
    haveLink: "Got an invite link? Open it",
    demoPaying: "Everyone pays in",
    demoCollects: "One person collects",
    demoLabel: "A circle of five people. Each one pays in, then one of them collects, and the turn moves to the next.",
    points: [
      "Everyone sees who has paid, before they join and after.",
      "The money is held by the circle and its rules are public. Not by the organiser.",
      "If someone misses a round, what they set aside covers it.",
    ],
  },

  newCircle: {
    heading: "Start a circle",
    nameLabel: "Circle name",
    namePlaceholder: "Saturday Ajo",
    amountLabel: "Each person puts in",
    amountUnit: "a round",
    peopleLabel: "People, in the order they collect",
    peopleHint: "Your name first. The first person collects when the circle fills.",
    yourName: "Your name",
    personName: (n: number) => `Name of person ${n}`,
    add: "Add a person",
    howOften: "How often",
    live: (each: string, pot: string, rounds: number) =>
      `Everyone puts in ${each} a round. Each round one person collects ${pot}. ${rounds} rounds.`,
    next: "Next: back your circle",
    errNeedName: "Give your circle a name.",
    errNeedPeople: "Fill in every name.",
    errSameName: "Each name must be different.",

    backHeading: "Back your circle",
    backLead: "People join faster when they can see you stand behind the circle.",
    backRounds: "Missed rounds you cover",
    backNone: "No guarantee. Each member's own set-aside still covers their first missed round.",
    backSome: (amount: string, rounds: number) =>
      `${amount} covers ${plural(rounds, "missed round", "missed rounds")}. It comes back to you after the last round, minus anything it covered.`,
    backYouPut: (amount: string) => `You put in ${amount} now.`,
    lockNote: "Use your phone's lock to get in. No password. We never see it.",
    returning: "I have used grouppot before",
    firstTime: "I am new here",
    create: "Create circle",
    createBacked: (amount: string) => `Create circle and put in ${amount}`,

    stepUnlock: "Waiting for your phone lock",
    stepCreate: "Setting up your circle",
    stepFunds: "Adding practice dollars",
    stepBack: (amount: string) => `Putting ${amount} behind your circle`,
    stepLink: "Making your invite link",
    working: "Working on it. Keep this page open.",

    readyHeading: "Your circle is ready",
    readyLead: "Send this to your group. Anyone with the link can see the circle. Joining takes a phone lock and the first payments.",
    shareWhatsApp: "Share to WhatsApp",
    openCircle: "Open my circle",
    inviteMessage: (name: string, each: string, size: number, clause: string, link: string) =>
      `Join my ${name}. ${each} each, ${size} of us, one person collects ${clause}. You can see everyone's payments${link ? `: ${link}` : "."}`,
  },

  status: {
    open: "Not joined yet",
    paid: "Paid",
    notyet: "Not yet",
    covered: "Covered",
    stopped: "Stopped paying",
    collected: "Collected",
  },

  circle: {
    facts: (each: string, period: string, size: number) => `${each} a round. ${period}. ${size} people.`,
    roundOf: (round: number, size: number) => `Round ${round} of ${size}`,
    ringPaid: (paid: number, size: number, who: string) => `${paid} of ${size} paid this round. ${who} collects next.`,
    ringSkeleton: "Loading the circle",
    centreTo: (who: string) => `to ${who}`,
    centreWhenFull: "when the circle fills",
    centreDone: "Done",
    centreDoneSub: "everyone collected",

    sentenceEmpty: "Nobody has joined yet. Send the link to your group.",
    sentenceFilling: (joined: number, size: number) => `${joined} of ${size} have joined. ${size - joined} to go.`,
    sentenceAllPaid: (who: string) => `Everyone paid. ${who} collects any moment now.`,
    sentencePaid: (paid: number, size: number, who: string, when: string) => `${paid} of ${size} paid. ${who} collects ${when}.`,
    sentenceTimeUp: (who: string) => `Time is up. ${who} collects any moment now.`,
    sentenceSlow: "Payments are slow right now. We are retrying.",
    sentenceNotOpen: (round: number, when: string) => `Round ${round} opens ${when}. Nothing is due yet.`,
    sentenceAhead: (paid: number, size: number, round: number, when: string) => `${paid} of ${size} already paid. Round ${round} opens ${when}.`,
    sentenceDone: "Everyone paid in and everyone collected. Set-asides go back to each member.",

    dueIn: "Due in",

    collectsAt: (round: number, when: string) => `Collects round ${round}, ${when}`,
    collectsRound: (round: number) => `Collects round ${round}`,
    collectsNow: (round: number) => `Collects round ${round}, this round`,
    collectedRound: (round: number) => `Collected round ${round}`,
    youCollect: (round: number, when: string) => `You collect in round ${round}${when ? `, ${when}` : ""}.`,
    missed: (n: number) => `Missed ${plural(n, "round", "rounds")}, covered`,
    youTag: "you",
    collectedYou: (round: number) => `You collected round ${round}.`,
    collectedBy: (who: string, round: number) => `${who} collected round ${round}.`,

    trustBacked: (who: string, rounds: number, amount: string, each: string) =>
      `${who} backs this circle for ${plural(rounds, "missed round", "missed rounds")} (${amount}). Beyond that, a missed round can leave that round's collector short by up to ${each}.`,
    trustUnbacked: (each: string) =>
      `Nobody has backed this circle yet. Each member's own set-aside covers their first missed round. Beyond that, a missed round can leave that round's collector short by up to ${each}.`,
    holdsMoney: (who: string) => `${who} does not hold the money. The circle does, and its rules are public.`,
    theOrganiser: "The organiser",
    theOrganiserInline: "the organiser",

    coveredMany: (names: string[]) => `${list(names)} missed a round. It was covered, so everyone was paid in full.`,

    full: (organiser: string) => `This circle is full. Ask ${organiser} to open a spot.`,
    started: (when: string, organiser: string) => `This circle started on ${when}. Ask ${organiser} to start the next one.`,
    needInvite: (organiser: string) => `Ask ${organiser} for the invite link to join.`,

  },

  join: {
    who: "Who are you?",
    pickFirst: "Pick your name first.",
    roundOne: "Round 1",
    setAside: "Set aside",
    setAsideBack: (round: number) => `returned after round ${round}`,
    setAsideWhy: "The set-aside keeps everyone paid even if someone drops out.",
    later: (each: string) => `Then ${each} goes out by itself on the day each round opens. Nothing leaves before then.`,
    lockWhy: "Confirm with your phone lock. This lets each round's payment go out on its day.",
    button: (total: string) => `Join for ${total}`,
    joining: "Joining...",
    holding: "Holding your place. This takes a few seconds.",
    holdingLong: "Still holding your place. Do not close this page.",
    slow: "Taking longer than usual. Your place is not lost. Check back in a minute.",
    needFunds: (need: string, have: string) => `You need ${need} to join. You have ${have}.`,
    needGap: (need: string, have: string, gap: string) => `You need ${need} to join. You have ${have}. Add ${gap}.`,
    addButton: (amount: string) => `Add ${amount} practice dollars`,
    adding: "Adding...",
    practiceNote: "Practice dollars. They cannot be sent out of the app.",
    already: "Already in? Use your phone lock",
    notFound: "We could not find you in this circle.",
    youAreIn: "You are in.",
  },

  member: {
    payNow: (each: string) => `Pay ${each} now`,
    paying: "Paying...",
    needsRound: (round: number, each: string, when: string, have: string, gap: string) =>
      `Round ${round} needs ${each} by ${when}. You have ${have}. Add ${gap} and it goes through by itself.`,
    paidThis: (each: string, name: string, round: number, who: string) =>
      `${each} paid to ${name} for round ${round}. ${who} collects.`,
    roundUnpaid: (round: number, each: string) => `Round ${round} is open. ${each} is due.`,
    stopHint: "Stopping a payment shows as missed on the circle page for everyone. Your set-aside covers it.",
    shareGroup: "Share to the group",
    shareMessage: (name: string, line: string, link: string) => `${name}: ${line} ${link}`,
  },

  organiser: {
    nudge: "Nudge",
    nudgeMessage: (names: string[], name: string, round: number, each: string, when: string, link: string) =>
      `Hi ${list(names)}. Round ${round} of ${name} is waiting on you: ${each} by ${when}. ${link}`,
    inviteHeading: "Invite people",
    inviteLine: "Anyone with this link can see the circle. Joining takes a phone lock and the first payments.",
    shareInvite: "Share to WhatsApp",
    joinYourself: "You are not in your own circle yet. Join to take your place.",
  },

  empty: {
    heading: "You are not in a circle yet.",
    lead: "Open the link your organiser sent.",
    pasteLabel: "Paste the link here",
    pastePlaceholder: "Link from your organiser",
    open: "Open circle",
    pasteBad: "That link does not open a circle. Check it and paste it again.",
  },

  error: {
    load: "We could not load this circle. Check the link, then try again.",
    unlockCancelled: "No problem. Try again when you're ready.",
    unlockUnavailable: "This browser can't use your phone's lock here. Open this link on your phone in Chrome or Safari.",
    generic: "That did not go through. Nothing was charged. Try again.",
    offline: "Could not connect. Check your internet and try again.",
    slotTaken: "Someone just took that name. Pick another.",
    alreadyIn: "You are already in this circle.",
    started: "This circle has already started.",
    practiceUsed: "You have already added practice dollars on this phone.",
    slowFunds: "The dollars are taking longer than usual. Check back in a minute.",
    notYou: "That is not the phone lock you joined with. Use the one you joined with.",
    tooMany: "Too many circles from this connection today. Try again tomorrow.",
  },
} as const;
