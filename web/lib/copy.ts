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
    tab: "grouppot: split a bill",
    tabNew: "grouppot: open a bill tab",
  },

  time: {
    now: "now",
    underMinute: "in under a minute",
    inMinutes: (n: number) => `in ${n} min`,
    today: (clock: string) => `today ${clock}`,
    tomorrow: (clock: string) => `tomorrow ${clock}`,
    days: (n: number) => plural(n, "day", "days"),
    hours: (n: number) => plural(n, "hour", "hours"),
    // "Ada collects ___": relative times already read "in 6 min", clock times read "by Friday 6pm"
    by: (when: string) => (when.startsWith("in ") ? when : `by ${when}`),
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
    seeCircle: "See a circle",
    splitBill: "Split a bill with friends",
    demoPaying: "Everyone pays in",
    demoCollects: "One person collects",
    demoLabel: "A circle of five people. Each one pays in, then one of them collects, and the turn moves to the next.",
    howHeading: "How a circle works",
    steps: [
      { title: "Start a circle", body: "Name it, add your people in the order they collect, and choose how much each person puts in and how often." },
      { title: "Send one link", body: "Share it in your group chat. Each person opens it and joins with the lock they use to open their phone. No password, no app to install." },
      { title: "Every round pays itself", body: "Joining puts in the first round and sets one more aside. After that each round is taken on its day, so nobody has to chase anyone." },
      { title: "The right person collects", body: "When everyone has paid, or the round is due, the pot goes to whoever's turn it is. Nobody can change the order." },
    ],
    protectHeading: "Your money is protected",
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
    keepHeading: "Keep the first places for proven members",
    keepHint: "Optional. Everyone else can still join the later places.",
    keepPlaces: "First places kept",
    keepRounds: "Rounds paid they need",
    keepNone: "Every place is open to everyone you invite.",
    keepLive: (places: number, rounds: number) =>
      `The first ${places === 1 ? "place goes to someone who has" : `${places} places go to people who have`} paid at least ${plural(rounds, "round", "rounds")} and never missed one.`,
    keepOwn: "Your own place counts too. If you are new here, move your name below the kept places.",
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
    anyMoment: "any moment now",
    centreWhenFull: "when the circle fills",
    centreDone: "Done",
    centreDoneSub: "everyone collected",

    sentenceEmpty: "Nobody has joined yet. Send the link to your group.",
    sentenceFilling: (joined: number, size: number) => `${joined} of ${size} have joined. ${size - joined} to go.`,
    sentenceAllPaid: (who: string) => `Everyone paid. ${who} collects any moment now.`,
    sentencePaid: (paid: number, size: number, who: string, when: string) => `${paid} of ${size} paid. ${who} collects ${when}, sooner if everyone pays.`,
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
    practiceNote: "Practice dollars for trying grouppot. They have no cash value.",
    already: "Already in? Use your phone lock",
    notFound: "We could not find you in this circle.",
    youAreIn: "You are in.",
    keptTag: "Kept place",
    keptPlace: (minPaid: number) => `This place is kept for members who have paid at least ${plural(minPaid, "round", "rounds")} and never missed one.`,
    keptNotYet: (paid: number, missed: number, minPaid: number, laterOpen: boolean) =>
      `You have paid ${plural(paid, "round", "rounds")} and missed ${missed === 0 ? "none" : missed}. This place needs at least ${plural(minPaid, "round", "rounds")} paid and none missed. ${laterOpen ? "Pick a later place, those are open to everyone." : "No later place is open right now."}`,
  },

  record: {
    newHere: "New here",
    paid: (n: number, missed: number) => `${plural(n, "round", "rounds")} paid, ${missed === 0 ? "none missed" : `${missed} missed`}`,
    finished: (n: number) => plural(n, "circle", "circles") + " finished",
    kept: (minPaid: number) => `Kept for ${minPaid}+ rounds paid, none missed`,
    keptRule: (places: number, minPaid: number) =>
      `The first ${places === 1 ? "place is" : `${places} places are`} kept for members who have paid at least ${plural(minPaid, "round", "rounds")} and never missed one.`,
  },

  leave: {
    action: (amount: string) => `Leave and get ${amount} back`,
    actionBond: (amount: string) => `Take back my ${amount} guarantee`,
    working: "Waiting for your phone lock",
    waiting: "Putting it back. This takes a few seconds.",
    left: (amount: string) => `You left. ${amount} is back with you and your place is open again.`,
    bondBack: (amount: string) => `Your ${amount} guarantee is back with you.`,
    hint: "You can leave until the circle fills. Everything you put in comes back.",
    hintBond: "You can take your guarantee back until the circle fills.",
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
    findHeading: "Already made or joined one?",
    findLead: "Unlock with the phone lock you used to start or join a circle.",
    find: "Find my circles",
    finding: "Checking your phone lock",
    searching: "Looking for circles you made or joined.",
    noneFound: "No circles are linked to this phone lock yet.",
    pasteLabel: "Paste the link here",
    pastePlaceholder: "Link from your organiser",
    open: "Open circle",
    pasteBad: "That link does not open a circle. Check it and paste it again.",
  },

  tab: {
    newHeading: "Open a bill tab",
    newLead: "One total, split evenly. Each person pays only their share.",
    tabName: "What was it for?",
    total: "Bill total",
    friends: "Friends on this tab",
    friendName: "Friend's name",
    friendId: "Friend's id",
    addFriend: "Add friend",
    open: "Open tab",
    unlockNew: "I am new here",
    unlockReturn: "I have used grouppot before",
    yourName: "Your name",
    whoOwes: "Who owes what",
    settled: "Paid",
    due: "Due",
    showMe: "Show my row",
    practice: "Add practice dollars for me",
    payShare: "Pay my share",
    paidAlready: "You already paid",
    everyonePaid: "Everyone paid.",
    loading: "Loading tab…",
    missingLink: "Missing tab link",
    errFriends: "Add at least one friend on the tab.",
    errBill: "Name the bill and enter the total.",
    errFriend: "Add a name and id for each friend.",
    pool: (total: string, paid: string, pool: string) => `Total ${total} · Paid ${paid} · Pool ${pool}`,
  },

  error: {
    load: "We could not load this circle. Check the link, then try again.",
    unlockCancelled: "No problem. Try again when you're ready.",
    noPasskeyHere: "This phone has no grouppot lock yet, or you closed the prompt. Press the button to set one up here, or tap I have used grouppot before to try again.",
    unlockUnavailable: "This browser can't use your phone's lock here. Open this link on your phone in Chrome or Safari.",
    generic: "That did not go through. Nothing was charged. Try again.",
    offline: "Could not connect. Check your internet and try again.",
    slotTaken: "Someone just took that name. Pick another.",
    alreadyIn: "You are already in this circle.",
    started: "This circle has already started.",
    practiceUsed: "You have already added practice dollars on this phone.",
    slowFunds: "The dollars are taking longer than usual. Check back in a minute.",
    notYou: "That is not the phone lock you joined with. Use the one you joined with.",
    record: "This place is kept for members who have paid enough rounds and never missed one. Pick a later place.",
    tooMany: "Too many circles from this connection today. Try again tomorrow.",
  },
  // Each answer is a list of blocks: a string is a paragraph, an array of strings is a bulleted list.
  faq: {
    heading: "Questions",
    items: [
      {
        q: "What does grouppot cost?",
        a: ["Nothing. Members put in the round amount and nothing more, and grouppot takes no share of any pot."],
      },
      {
        q: "Do members need to install anything?",
        a: ["No. The invite link opens in the phone's browser, and members join with the lock they already use to open their phone."],
      },
      {
        q: "Can I leave before the circle starts?",
        a: ["Yes. Until every place is filled, a member can leave and get back everything they put in, and their place opens again for someone else."],
      },
      {
        q: "What happens after the last round?",
        a: ["Everyone's set-aside comes back to them, after anything they owe is paid, and the organiser gets back what is left of her guarantee."],
      },
      {
        q: "Can the organiser run off with the money?",
        a: [
          "No. The money sits in the circle itself, never with the organiser. The order of who collects is fixed when the circle starts, and each round's pot can only go to the person whose turn it is. Nobody, the organiser included, can send it anywhere else or change the order.",
          "The only money the organiser can take back is her own guarantee: all of it before the circle fills, or what is left of it after the last round.",
        ],
      },
      {
        q: "What if someone collects early and then stops paying?",
        a: [
          "Take a circle of 10 people paying $100 a round. Whoever collects first gets $1,000 after putting in $200: their first $100, plus $100 they set aside when they joined. They still owe $900. If they stop paying:",
          [
            "Their own $100 set-aside covers the first round they miss.",
            "The organiser's guarantee covers the rounds after that, as far as it goes.",
            "Anything the guarantee does not cover leaves the people who collect later short, and is kept against the person who stopped as money they owe.",
            "Every missed round goes on their payment record, which every grouppot circle can see.",
          ],
        ],
      },
      {
        q: "How big a guarantee covers everyone?",
        a: [
          "Enough for the number of people in the circle minus two rounds. In a circle of 10 at $100 a round, that is $800: it covers the person who collects first if they never pay again.",
          "When starting a circle, the organiser chooses how many missed rounds to cover, from none up to exactly that amount. It starts at one round. With the full amount, everyone else gets back all they put in and the organiser carries the loss she chose to cover.",
        ],
      },
      {
        q: "What if two early collectors both stop paying?",
        a: [
          "The guarantee is one shared amount. At its largest it covers one person who stops after collecting first. If a second early collector also stops, the guarantee runs out and the people who collect after them get less, by exactly the rounds that went unpaid. That is why the first places matter most.",
        ],
      },
      {
        q: "What if someone stops paying before their turn?",
        a: [
          "They gain nothing. When their turn comes, their payout first pays back everyone they left short and refills their set-aside. Only what is left reaches them.",
        ],
      },
      {
        q: "Who should collect first?",
        a: [
          "Only an early collector can walk away ahead. Whoever collects last has paid every round before getting anything.",
          "When starting a circle, the organiser can keep the first places for people with a record of a set number of rounds paid and none missed. Newcomers still join, in the later places. Kept places are off unless the organiser turns them on.",
        ],
      },
      {
        q: "What is the payment record?",
        a: [
          "Every grouppot circle writes to the same record: rounds paid, rounds missed and circles finished. Members see it before they join and after. A missed round stays on it, so someone who walks away can never take a kept place in a grouppot circle again.",
        ],
      },
      {
        q: "Can someone build a clean record cheaply, then walk away from a big circle?",
        a: [
          "The record counts rounds, not amounts, so someone could pay a few small rounds to earn a kept place in a large circle. For a large circle, keep the first places for people you know as well as people with a record, ask for more rounds paid, and back the circle with a guarantee.",
        ],
      },
      {
        q: "Can someone start over with a new account?",
        a: [
          "Yes, but a new account has no record, so it cannot take a kept place. It joins the later places, where a member has paid in more before they collect, and has less to walk away with.",
        ],
      },
      {
        q: "Can grouppot get the money back from someone who walks away?",
        a: [
          "No. What they owe is kept on the circle and everyone in it can see it, but the circle can only use money that was set aside or put up as a guarantee. Getting the rest back is between the people in the circle, as it is today.",
        ],
      },
      {
        q: "Why not make early collectors put more in up front?",
        a: [
          "That would cover every case: hold back enough from each early collector to pay every round they still owe. But people take the early places because they need the money first, and asking them to put most of it in up front takes that away. grouppot asks every member to set aside one round, and lets the organiser stand behind her circle with a guarantee.",
        ],
      },
      {
        q: "So is my money safe?",
        a: [
          "From the organiser, yes: she cannot touch the pot. From a member who collects early and then stops paying, you are covered by their set-aside and by the organiser's guarantee, up to the amount she put up.",
          "Before you join, check two things on the circle's page: how many missed rounds the guarantee covers, and the payment records of the people who collect before you.",
        ],
      },
    ],
  },
} as const;
