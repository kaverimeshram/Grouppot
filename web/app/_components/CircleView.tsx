"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Address, Hex, LocalAccount } from "viem";
import {
  balanceOf,
  contributeBundle,
  dollars,
  inviteLink,
  joinBundle,
  leaveBundle,
  parseCircleLocation,
  readCircle,
  readEarlySlots,
  readRecord,
  relay,
  unbondBundle,
  type PaymentRecord,
  type Snapshot,
} from "@/lib/chain";
import {
  centre,
  clockLine,
  collectCaption,
  isDone,
  isRoundOpen,
  isKeptPlace,
  isStarted,
  keptPlaceBlock,
  meIndexOf,
  num,
  openSlots,
  organiserInline,
  organiserName,
  primaryFor,
  recipientName,
  recordCaption,
  sentence,
  statusOf,
  trustLine,
  ZERO,
  type Terms,
} from "@/lib/circle-state";
import { hasExit, keepsRecord, readRecords } from "@/lib/circle-reads";
import { copy } from "@/lib/copy";
import { NoPasskeyHere, plainError, Plain } from "@/lib/errors";
import { addPracticeDollars, practiceAmount } from "@/lib/fund";
import { until } from "@/lib/poll";
import { loadInvite, loadMe, saveCircle, saveMe, sameAddress, unlock, type Me } from "@/lib/session";
import { signInWithPasskey } from "@/lib/passkey";
import { formatDay, formatWhen } from "@/lib/time";
import { MemberRow } from "./MemberRow";
import { MyCircles } from "./MyCircles";
import { Ring, type ArcState } from "./Ring";
import { Bar, Bone, Button, LinkButton, Notice, Page } from "./ui";

type JoinPhase = "idle" | "unlock" | "needfunds" | "funding" | "joining" | "waiting" | "slow";
type PayPhase = "idle" | "unlock" | "working" | "waiting";
type ExitPhase = "idle" | "unlock" | "working" | "waiting";
type Acct = { address: Address; account: LocalAccount };

const NO_TERMS: Terms = { earlySlots: 0, minPaid: 0 };

const wa = (text: string) => `https://wa.me/?text=${encodeURIComponent(text)}`;
const textLink = "h-12 font-semibold text-ink underline underline-offset-4";

export function CircleView() {
  const [loc, setLoc] = useState<{ circle: Address | null; key: Hex | null } | null>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));

  useEffect(() => {
    const p = parseCircleLocation(location.search, location.hash);
    setLoc({ circle: p.circle, key: p.inviteKey ?? (p.circle ? loadInvite(p.circle) : null) });
    setMe(loadMe());
  }, []);
  useEffect(() => {
    const id = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(id);
  }, []);

  if (!loc) return <Skeleton />;
  if (!loc.circle) return <><Paste /><div className="mx-auto w-full max-w-[430px] px-4 pb-8"><MyCircles setMe={setMe} /></div></>;
  return <Loaded circle={loc.circle} inviteKey={loc.key} me={me} setMe={setMe} now={now} />;
}

function Skeleton() {
  return (
    <Page bar={false}>
      <Bone className="mt-2 h-8 w-48" />
      <div className="mt-6">
        <Ring skeleton members={Array.from({ length: 5 }, () => ({ label: "", state: "open" as ArcState }))} round={0} label={copy.circle.ringSkeleton} centre={<Bone className="h-10 w-24" />} />
      </div>
      <Bone className="mx-auto mt-6 h-6 w-64" />
      <div className="mt-8 flex flex-col gap-2">
        {[0, 1, 2].map((i) => (
          <Bone key={i} className="h-16 w-full !rounded-card" />
        ))}
      </div>
    </Page>
  );
}

function Paste() {
  const [text, setText] = useState("");
  const [bad, setBad] = useState(false);
  function open() {
    try {
      const u = new URL(text.trim());
      if (parseCircleLocation(u.search, u.hash).circle) {
        location.assign(`/c/${u.search}${u.hash}`);
        return;
      }
    } catch {
      // not a link
    }
    setBad(true);
  }
  return (
    <>
      <Page>
        <h1 className="t-headline mt-2">{copy.empty.heading}</h1>
        <p className="mt-3 text-body">{copy.empty.lead}</p>
        <label className="mt-8 block">
          <span className="t-small font-semibold">{copy.empty.pasteLabel}</span>
          <input
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setBad(false);
            }}
            placeholder={copy.empty.pastePlaceholder}
            autoComplete="off"
            inputMode="url"
            className="mt-2 h-12 w-full rounded-input bg-surface px-4 text-ink placeholder:text-mute"
          />
        </label>
        {bad ? (
          <div className="mt-3">
            <Notice tone="problem">{copy.empty.pasteBad}</Notice>
          </div>
        ) : null}
      </Page>
      <Bar>
        <Button disabled={!text.trim()} onClick={open}>
          {copy.empty.open}
        </Button>
      </Bar>
    </>
  );
}

function Loaded({ circle, inviteKey, me, setMe, now }: { circle: Address; inviteKey: Hex | null; me: Me | null; setMe: (m: Me) => void; now: number }) {
  const [snap, setSnap] = useState<Snapshot | null>(null);
  const [failed, setFailed] = useState(false);
  const [have, setHave] = useState<bigint | null>(null);
  const [justCollected, setJustCollected] = useState<string | null>(null);
  const lastRound = useRef<bigint | null>(null);
  const [copied, setCopied] = useState(false);

  const [slot, setSlot] = useState<number | null>(null);
  const [phase, setPhase] = useState<JoinPhase>("idle");
  const [payPhase, setPayPhase] = useState<PayPhase>("idle");
  const [error, setError] = useState<string | null>(null);
  const [returning, setReturning] = useState(false);
  const [short, setShort] = useState<bigint>(0n);
  const [terms, setTerms] = useState<Terms | null>(null);
  const [records, setRecords] = useState<Record<string, PaymentRecord>>({});
  const [blocked, setBlocked] = useState<string | null>(null);
  const [exitable, setExitable] = useState(false);
  const [keeps, setKeeps] = useState(false);
  const [exitPhase, setExitPhase] = useState<ExitPhase>("idle");
  const [exitDone, setExitDone] = useState<string | null>(null);
  const acct = useRef<Acct | null>(null);
  const joinStart = useRef(0);

  useEffect(() => setReturning(me !== null), [me]);

  const refresh = useCallback(async (): Promise<Snapshot | null> => {
    try {
      const s = await readCircle(circle);
      setSnap(s);
      setFailed(false);
      if (lastRound.current !== null && s.round > lastRound.current && lastRound.current < s.size) {
        const who = s.members[Number(lastRound.current)];
        if (who) setJustCollected(sameAddress(who.member, me?.address) ? copy.circle.collectedYou(Number(lastRound.current) + 1) : copy.circle.collectedBy(who.label, Number(lastRound.current) + 1));
      }
      lastRound.current = s.round;
      if (me) setHave(await balanceOf(me.address).catch(() => null));
      return s;
    } catch {
      setFailed(true);
      return null;
    }
  }, [circle, me]);

  useEffect(() => {
    void refresh();
    const id = setInterval(() => void refresh(), 10_000);
    return () => clearInterval(id);
  }, [refresh]);

  useEffect(() => {
    void readEarlySlots(circle).then(setTerms);
    hasExit(circle).then(setExitable, () => setExitable(false));
  }, [circle]);

  const memberKey = snap ? `${snap.members.map((m) => m.member).join()}:${snap.round}:${snap.paidCount}` : "";
  useEffect(() => {
    if (!snap) return;
    let live = true;
    // The record read starts with the snapshot, not after the "does this circle keep a record" read, so the lines
    // are on screen together with the rows.
    void Promise.all([keepsRecord(circle).catch(() => false), readRecords(snap.members.filter((m) => m.member !== ZERO).map((m) => m.member))]).then(([k, r]) => {
      if (!live) return;
      setKeeps(k);
      setRecords(r);
    });
    return () => {
      live = false;
    };
  }, [memberKey, circle]);

  const open = snap ? openSlots(snap) : [];
  useEffect(() => {
    if (!snap) return;
    const free = openSlots(snap);
    const mine = me ? free.find((i) => snap.members[i]!.label.toLowerCase() === me.name.toLowerCase()) : undefined;
    setSlot((prev) => (prev !== null && free.includes(prev) ? prev : free.length === 1 ? free[0]! : (mine ?? null)));
  }, [snap, me]);

  if (!snap) {
    if (!failed) return <Skeleton />;
    return (
      <>
        <Page>
          <h1 className="t-headline mt-2">{copy.error.load}</h1>
        </Page>
        <Bar>
          <Button onClick={() => void refresh()}>{copy.common.tryAgain}</Button>
        </Bar>
      </>
    );
  }

  const s = snap;
  const meIndex = meIndexOf(s, me?.address);
  const isOrganiser = sameAddress(me?.address, s.organiser);
  const primary = primaryFor({ s, now, meIndex, isOrganiser, hasInvite: inviteKey !== null });
  const done = isDone(s);
  const started = isStarted(s);
  const roundOpen = isRoundOpen(s, now);
  const each = dollars(s.contribution);
  const total = dollars(2n * s.contribution);
  const link = `${location.origin}/c/?id=${circle}`;
  const own = isOrganiser ? me?.name : undefined;
  const orgName = organiserName(s, own);
  const line = sentence(s, now);
  const clock = clockLine(s, now);
  const states: ArcState[] = s.members.map((_, i) => {
    const st = statusOf(s, i);
    return st === "collected" ? "paid" : st;
  });
  const coveredNames = s.members.filter((m) => m.member !== ZERO && m.defaults > 0n).map((m) => m.label);
  const unpaid = s.members.filter((m) => m.member !== ZERO && !m.paidThisRound).map((m) => m.label);
  const myRow = meIndex >= 0 ? s.members[meIndex]! : null;
  const youOwe = roundOpen && myRow !== null && !myRow.paidThisRound;
  const canJoin = meIndex < 0 && open.length > 0 && inviteKey !== null && !done;
  const need = 2n * s.contribution;
  const iHave = have ?? 0n;
  const shortOnPay = youOwe && have !== null && have < s.contribution;

  const busy = phase !== "idle" && phase !== "needfunds";
  const kept = terms ?? NO_TERMS;
  const exiting = exitPhase !== "idle";
  const pickSlot = (i: number) => {
    setBlocked(null);
    setError(null);
    setSlot(i);
  };

  async function checkNow() {
    const who = acct.current?.address;
    const v = await readCircle(circle).catch(() => null);
    if (v && who && v.members.some((m) => sameAddress(m.member, who))) {
      setSnap(v);
      setPhase("idle");
    }
  }

  async function confirmJoined(label: Address) {
    const seen = await until(() => readCircle(circle), (v) => v.members.some((m) => sameAddress(m.member, label)), 2000, 90_000);
    if (seen) {
      setSnap(seen);
      setPhase("idle");
    } else setPhase("slow");
    return !!seen;
  }

  async function finishJoin(a: Acct, label: string) {
    setError(null);
    setPhase("joining");
    joinStart.current = Date.now();
    try {
      const fresh = await readCircle(circle);
      if (fresh.members[slot!]?.member !== ZERO) throw new Plain(copy.error.slotTaken);
      const bundle = await joinBundle(a.account, inviteKey!, fresh, slot!);
      await relay("join", bundle);
      setPhase("waiting");
      saveMe({ address: a.address, name: label });
      setMe({ address: a.address, name: label });
      if (await confirmJoined(a.address)) saveCircle(a.address, circle);
    } catch (e) {
      setError(plainError(e, terms?.minPaid));
      setPhase("idle");
      await refresh();
    }
  }

  async function join() {
    if (slot === null) return;
    const label = s.members[slot]!.label;
    setError(null);
    setPhase("unlock");
    try {
      acct.current ??= await unlock(label, returning);
      const a = acct.current;
      const t = terms ?? (await readEarlySlots(circle));
      if (isKeptPlace(slot, t)) {
        const why = keptPlaceBlock(slot, t, await readRecord(a.address), open);
        if (why) {
          setBlocked(why);
          setPhase("idle");
          return;
        }
      }
      const bal = await balanceOf(a.address);
      if (bal < need) {
        setShort(need - bal);
        setHave(bal);
        setPhase("needfunds");
        return;
      }
      await finishJoin(a, label);
    } catch (e) {
      if (e instanceof NoPasskeyHere) setReturning(false);
      setError(plainError(e));
      setPhase("idle");
    }
  }

  async function addDollars() {
    const a = acct.current;
    if (!a || slot === null) return;
    setError(null);
    setPhase("funding");
    try {
      const bal = await addPracticeDollars(a.address, circle);
      setHave(bal);
      await finishJoin(a, s.members[slot]!.label);
    } catch (e) {
      setError(plainError(e));
      setPhase("needfunds");
    }
  }

  async function pay() {
    if (!me || meIndex < 0) return;
    setError(null);
    setPayPhase("unlock");
    try {
      const a = acct.current ?? (await signInWithPasskey());
      if (!sameAddress(a.address, me.address)) throw new Plain(copy.error.notYou);
      acct.current = a;
      setPayPhase("working");
      const fresh = await readCircle(circle);
      if (fresh.members[meIndex]!.paidThisRound) {
        setSnap(fresh);
        setPayPhase("idle");
        return;
      }
      if ((await balanceOf(a.address)) < fresh.contribution) await addPracticeDollars(a.address, circle);
      await relay("contribute", await contributeBundle(a.account, fresh));
      setPayPhase("waiting");
      const seen = await until(() => readCircle(circle), (v) => v.round > fresh.round || v.members[meIndex]!.paidThisRound, 2000, 90_000);
      if (seen) {
        setSnap(seen);
        setJustCollected(copy.member.paidThis(each, fresh.name, num(fresh.round) + 1, recipientName(fresh) || fresh.name));
      } else setError(copy.join.slow);
      setPayPhase("idle");
      await refresh();
    } catch (e) {
      setError(plainError(e));
      setPayPhase("idle");
    }
  }

  async function exit(kind: "leave" | "unbond") {
    if (!me) return;
    const backText = kind === "leave" ? copy.leave.left(total) : copy.leave.bondBack(dollars(s.bond));
    setError(null);
    setExitDone(null);
    setExitPhase("unlock");
    try {
      const a = acct.current ?? (await signInWithPasskey());
      if (!sameAddress(a.address, kind === "leave" ? me.address : s.organiser)) throw new Plain(copy.error.notYou);
      acct.current = a;
      setExitPhase("working");
      await relay(kind, kind === "leave" ? await leaveBundle(a.account, circle) : await unbondBundle(a.account, circle));
      setExitPhase("waiting");
      const gone = (v: Snapshot) => (kind === "leave" ? !v.members.some((m) => sameAddress(m.member, a.address)) : v.bond === 0n);
      const seen = await until(() => readCircle(circle), gone, 2000, 90_000);
      if (seen) {
        setSnap(seen);
        setExitDone(backText);
      } else setError(copy.join.slow);
    } catch (e) {
      setError(plainError(e));
    }
    setExitPhase("idle");
    await refresh();
  }

  async function identify() {
    setError(null);
    try {
      const a = await signInWithPasskey();
      const i = meIndexOf(s, a.address);
      if (i < 0) {
        setError(copy.join.notFound);
        return;
      }
      acct.current = a;
      const m = { address: a.address, name: s.members[i]!.label };
      saveMe(m);
      setMe(m);
    } catch (e) {
      setError(plainError(e));
    }
  }

  async function copyInvite() {
    try {
      await navigator.clipboard.writeText(inviteLink(location.origin, circle, inviteKey!));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError(copy.error.generic);
    }
  }

  const inviteText = copy.newCircle.inviteMessage(s.name, each, num(s.size), copy.periods.clause(num(s.period)), inviteKey ? inviteLink(location.origin, circle, inviteKey) : link);
  const nudgeText = copy.organiser.nudgeMessage(unpaid, s.name, num(s.round) + 1, each, formatWhen(num(s.dueAt), now), link);
  const shareText = copy.member.shareMessage(s.name, line, link);

  const bar = (() => {
    if (primary === "join") {
      if (phase === "needfunds")
        return <Button onClick={addDollars}>{copy.join.addButton(dollars(practiceAmount(s.contribution, s.size)))}</Button>;
      if (phase === "slow") return <Button onClick={() => void checkNow()}>{copy.common.checkNow}</Button>;
      if (busy) return <Button disabled>{phase === "funding" ? copy.join.adding : copy.join.joining}</Button>;
      return (
        <Button disabled={slot === null} onClick={join}>
          {copy.join.button(total)}
        </Button>
      );
    }
    if (primary === "pay")
      return (
        <Button disabled={payPhase !== "idle"} onClick={pay}>
          {payPhase !== "idle" ? copy.member.paying : shortOnPay ? copy.join.addButton(dollars(practiceAmount(s.contribution, s.size))) : copy.member.payNow(each)}
        </Button>
      );
    if (primary === "nudge") return <LinkButton href={wa(nudgeText)} target="_blank" rel="noopener noreferrer">{copy.organiser.nudge}</LinkButton>;
    if (primary === "invite") return <LinkButton href={wa(inviteText)} target="_blank" rel="noopener noreferrer">{copy.organiser.shareInvite}</LinkButton>;
    if (primary === "share") return <LinkButton href={wa(shareText)} target="_blank" rel="noopener noreferrer">{copy.member.shareGroup}</LinkButton>;
    return null;
  })();

  return (
    <>
      <Page bar={bar !== null}>
        <h1 className="t-headline mt-2 break-words">{s.name}</h1>
        <p className="t-small mt-1 text-caption">{copy.circle.facts(each, copy.periods.label(num(s.period)), num(s.size))}</p>
        {kept.earlySlots > 0 ? <p className="t-small mt-1 text-caption">{copy.record.keptRule(kept.earlySlots, kept.minPaid)}</p> : null}

        <div className="mt-6">
          <Ring
            members={s.members.map((m, i) => ({ label: m.label, state: states[i]! }))}
            round={num(s.round)}
            label={started ? copy.circle.ringPaid(num(s.paidCount), num(s.size), recipientName(s)) : line}
            centre={
              <>
                <span className="t-pot num text-ink">{centre(s, now).big}</span>
                <span className="t-small mt-1 text-body">{centre(s, now).small}</span>
              </>
            }
          />
        </div>

        <p className="t-lead mt-6 text-balance text-center" aria-live="polite">
          {line}
        </p>
        {clock ? (
          <p className="mt-2 text-center">
            {clock.label ? <span className="t-caption mr-2 text-caption">{clock.label}</span> : null}
            <span className={clock.label ? "t-count num" : "t-small text-body"}>{clock.value}</span>
          </p>
        ) : null}

        {justCollected ? (
          <div className="mt-4">
            <Notice>{justCollected}</Notice>
          </div>
        ) : null}
        {coveredNames.length > 0 ? (
          <div className="mt-4">
            <Notice>{copy.circle.coveredMany(coveredNames)}</Notice>
          </div>
        ) : null}

        {!done ? (
          <section className="mt-6 rounded-card bg-surface p-4">
            <p className="t-small text-ink">{trustLine(s, own)}</p>
            <p className="t-small mt-2 text-body">{copy.circle.holdsMoney(orgName)}</p>
          </section>
        ) : null}

        {myRow ? (
          <section className="mt-6" aria-live="polite">
            {youOwe ? (
              <p className="t-body font-semibold">
                {shortOnPay
                  ? copy.member.needsRound(num(s.round) + 1, each, formatWhen(num(s.dueAt), now), dollars(iHave), dollars(s.contribution - iHave))
                  : copy.member.roundUnpaid(num(s.round) + 1, each)}
              </p>
            ) : meIndex >= num(s.round) && !done ? (
              <p className="t-body font-semibold">
                {`${copy.join.youAreIn} ${copy.circle.youCollect(meIndex + 1, started ? formatWhen(num(s.start) + (meIndex + 1) * num(s.period), now) : "")}`}
              </p>
            ) : null}
            {youOwe ? <p className="t-small mt-2 text-body">{copy.member.stopHint}</p> : null}
          </section>
        ) : null}

        {exitable && !started && (myRow || (isOrganiser && s.bond > 0n)) ? (
          <section className="mt-4 flex flex-col items-start">
            <p className="t-small text-caption">{myRow ? copy.leave.hint : copy.leave.hintBond}</p>
            {myRow ? (
              <button type="button" className={`${textLink} t-small disabled:opacity-40`} disabled={exiting} onClick={() => void exit("leave")}>
                {copy.leave.action(total)}
              </button>
            ) : null}
            {isOrganiser && s.bond > 0n ? (
              <button type="button" className={`${textLink} t-small disabled:opacity-40`} disabled={exiting} onClick={() => void exit("unbond")}>
                {copy.leave.actionBond(dollars(s.bond))}
              </button>
            ) : null}
            {exiting ? (
              <div className="mt-2 w-full" role="status">
                <Notice>{exitPhase === "waiting" ? copy.leave.waiting : copy.leave.working}</Notice>
              </div>
            ) : null}
          </section>
        ) : null}
        {exitDone ? (
          <div className="mt-4">
            <Notice>{exitDone}</Notice>
          </div>
        ) : null}

        {meIndex < 0 && !done ? (
          <section className="mt-6">
            {canJoin ? (
              <JoinPanel
                s={s}
                each={each}
                total={total}
                slot={slot}
                setSlot={pickSlot}
                open={open}
                terms={kept}
                blocked={blocked}
                phase={phase}
                short={short}
                have={iHave}
                joinedFor={Date.now() - joinStart.current}
                isOrganiser={isOrganiser}
                returning={returning}
                setReturning={setReturning}
              />
            ) : !started ? (
              <p className="text-body">{copy.circle.needInvite(organiserInline(s, own))}</p>
            ) : (
              <p className="text-body">{open.length === 0 ? copy.circle.started(formatDay(num(s.start)), organiserInline(s, own)) : copy.circle.full(organiserInline(s, own))}</p>
            )}
            {phase === "idle" ? (
              <button type="button" className={`${textLink} t-small mt-2`} onClick={identify}>
                {copy.join.already}
              </button>
            ) : null}
          </section>
        ) : null}

        {error ? (
          <div className="mt-4">
            <Notice tone="problem">{error}</Notice>
          </div>
        ) : null}

        <h2 className="t-lead mt-8">{copy.circle.roundOf(Math.min(num(s.round) + 1, num(s.size)), num(s.size))}</h2>
        <ul className="mt-3 flex flex-col gap-2">
          {s.members.map((m, i) => (
            <MemberRow
              key={i}
              name={m.label}
              you={i === meIndex}
              status={statusOf(s, i)}
              caption={m.defaults > 0n && m.member !== ZERO ? copy.circle.missed(num(m.defaults)) : collectCaption(s, i)}
              record={recordCaption(s, i, kept, keeps ? records : {})}
            />
          ))}
        </ul>

        {isOrganiser && inviteKey && open.length > 0 ? (
          <section className="mt-8 rounded-card bg-surface p-4">
            <h2 className="t-body font-semibold">{copy.organiser.inviteHeading}</h2>
            <p className="t-small mt-1 text-body">{copy.organiser.inviteLine}</p>
            <div className="mt-2 flex flex-wrap gap-x-6">
              <a href={wa(inviteText)} target="_blank" rel="noopener noreferrer" className={`${textLink} flex items-center`}>
                {copy.organiser.shareInvite}
              </a>
              <button type="button" className={textLink} onClick={copyInvite}>
                {copied ? copy.common.copied : copy.common.copyLink}
              </button>
            </div>
          </section>
        ) : null}
      </Page>
      {bar ? <Bar>{bar}</Bar> : null}
    </>
  );
}

function JoinPanel({
  s,
  each,
  total,
  slot,
  setSlot,
  open,
  terms,
  blocked,
  phase,
  short,
  have,
  joinedFor,
  isOrganiser,
  returning,
  setReturning,
}: {
  s: Snapshot;
  each: string;
  total: string;
  slot: number | null;
  setSlot: (i: number) => void;
  open: number[];
  terms: Terms;
  blocked: string | null;
  phase: JoinPhase;
  short: bigint;
  have: bigint;
  joinedFor: number;
  isOrganiser: boolean;
  returning: boolean;
  setReturning: (v: boolean) => void;
}) {
  const waiting = phase === "joining" || phase === "waiting";
  return (
    <div>
      <fieldset disabled={phase !== "idle"}>
        <legend className="t-lead">{copy.join.who}</legend>
        <div role="radiogroup" aria-label={copy.join.who} className="mt-3 flex flex-col gap-2">
          {open.map((i) => (
            <button
              key={i}
              type="button"
              role="radio"
              aria-checked={slot === i}
              onClick={() => setSlot(i)}
              className={`btn flex h-14 items-center justify-between gap-3 rounded-card px-4 text-left font-semibold ${slot === i ? "bg-primary text-primary-ink" : "bg-surface text-ink"}`}
            >
              <span className="min-w-0 truncate">{s.members[i]!.label}</span>
              {isKeptPlace(i, terms) ? <span className="t-caption shrink-0 font-normal">{copy.join.keptTag}</span> : null}
            </button>
          ))}
        </div>
      </fieldset>
      {slot === null ? <p className="t-small mt-2 text-caption">{copy.join.pickFirst}</p> : null}
      {blocked ? (
        <div className="mt-3">
          <Notice tone="problem">{blocked}</Notice>
        </div>
      ) : slot !== null && isKeptPlace(slot, terms) ? (
        <p className="t-small mt-3 text-body">{copy.join.keptPlace(terms.minPaid)}</p>
      ) : null}

      <div className="mt-6 rounded-card bg-surface p-4">
        <div className="flex items-baseline justify-between">
          <span className="text-body">{copy.join.roundOne}</span>
          <span className="num font-semibold">{each}</span>
        </div>
        <div className="mt-3 flex items-start justify-between">
          <span>
            <span className="block text-body">{copy.join.setAside}</span>
            <span className="t-caption block text-caption">{copy.join.setAsideBack(num(s.size))}</span>
          </span>
          <span className="num font-semibold">{each}</span>
        </div>
      </div>
      <p className="t-small mt-3 text-body">{copy.join.setAsideWhy}</p>
      <p className="t-small mt-2 text-body">{copy.join.later(each)}</p>
      {phase === "idle" ? (
        <>
          <p className="t-small mt-2 text-body">{copy.join.lockWhy}</p>
          <button type="button" className={`${textLink} t-small`} onClick={() => setReturning(!returning)}>
            {returning ? copy.newCircle.firstTime : copy.newCircle.returning}
          </button>
        </>
      ) : null}

      {phase === "needfunds" || phase === "funding" ? (
        <div className="mt-4 flex flex-col gap-2">
          <Notice>{have > 0n ? copy.join.needGap(total, dollars(have), dollars(short)) : copy.join.needFunds(total, dollars(have))}</Notice>
          <p className="t-small text-caption">{copy.join.practiceNote}</p>
        </div>
      ) : null}
      {waiting ? (
        <div className="mt-4" role="status">
          <Notice>{joinedFor > 12_000 ? copy.join.holdingLong : copy.join.holding}</Notice>
        </div>
      ) : null}
      {phase === "slow" ? (
        <div className="mt-4" role="status">
          <Notice>{copy.join.slow}</Notice>
        </div>
      ) : null}
      {isOrganiser ? <p className="t-small mt-3 text-body">{copy.organiser.joinYourself}</p> : null}
    </div>
  );
}
