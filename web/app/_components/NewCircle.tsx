"use client";
import { useEffect, useRef, useState } from "react";
import type { Address, Hex, LocalAccount } from "viem";
import { balanceOf, bondBundle, dollars, newInviteKey, readCircle, relay, toUnits, inviteLink } from "@/lib/chain";
import { copy } from "@/lib/copy";
import { plainError, Plain } from "@/lib/errors";
import { addPracticeDollars } from "@/lib/fund";
import { until } from "@/lib/poll";
import { loadMe, saveInvite, unlock } from "@/lib/session";
import { Bar, Button, LinkButton, Notice, Page, Stepper } from "./ui";

const AMOUNTS = [1, 2, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50];
const PERIODS = [
  { seconds: 600, label: copy.periods.practice },
  { seconds: 604800, label: copy.periods.week },
  { seconds: 1209600, label: copy.periods.fortnight },
  { seconds: 2592000, label: copy.periods.month },
] as const;
const MIN_PEOPLE = 3;
const MAX_PEOPLE = 12;

type Step = "form" | "back" | "work" | "ready";

function Chevron({ up }: { up: boolean }) {
  return (
    <svg viewBox="0 0 20 20" className="h-5 w-5" aria-hidden="true">
      <path d={up ? "M5 12.5l5-5 5 5" : "M5 7.5l5 5 5-5"} fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="stroke-ink" />
    </svg>
  );
}

const iconBtn = "btn flex h-10 w-10 shrink-0 items-center justify-center rounded-pill bg-surface active:scale-[0.96] disabled:pointer-events-none disabled:opacity-40";

export function NewCircle() {
  const [step, setStep] = useState<Step>("form");
  const [name, setName] = useState("");
  const [amountAt, setAmountAt] = useState(AMOUNTS.indexOf(2));
  const [people, setPeople] = useState<string[]>(["", "", "", "", ""]);
  const [seconds, setSeconds] = useState<number>(600);
  const [rounds, setRounds] = useState(1);
  const [returning, setReturning] = useState(false);
  const [doing, setDoing] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [made, setMade] = useState<{ circle: Address; link: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const progress = useRef<{ acct?: { address: Address; account: LocalAccount }; invite?: { key: Hex; signer: Address }; circle?: Address; backed?: boolean }>({});

  useEffect(() => {
    const me = loadMe();
    if (me) {
      setReturning(true);
      setPeople((p) => [me.name, ...p.slice(1)]);
    }
  }, []);

  const each = AMOUNTS[amountAt]!;
  const n = people.length;
  const maxBack = n - 2;
  const back = Math.min(rounds, maxBack);
  const trimmed = people.map((p) => p.trim());
  const sameName = new Set(trimmed.map((p) => p.toLowerCase())).size !== trimmed.length;
  const problem = !name.trim() ? copy.newCircle.errNeedName : trimmed.some((p) => !p) ? copy.newCircle.errNeedPeople : sameName ? copy.newCircle.errSameName : null;
  const eachText = dollars(toUnits(each));
  const potText = dollars(toUnits(each * n));
  const backAmount = toUnits(each * back);

  const setPerson = (i: number, v: string) => setPeople((p) => p.map((x, j) => (j === i ? v : x)));
  const move = (i: number, by: number) =>
    setPeople((p) => {
      const q = [...p];
      [q[i], q[i + by]] = [q[i + by]!, q[i]!];
      return q;
    });

  async function create() {
    setError(null);
    setStep("work");
    const p = progress.current;
    try {
      if (!p.acct) {
        setDoing(copy.newCircle.stepUnlock);
        p.acct = await unlock(trimmed[0]!, returning);
      }
      const acct = p.acct;
      p.invite ??= newInviteKey();
      if (!p.circle) {
        setDoing(copy.newCircle.stepCreate);
        const res = await relay("create", {
          name: name.trim(),
          labels: trimmed,
          contribution: toUnits(each).toString(),
          period: seconds,
          organiser: acct.address,
          inviteSigner: p.invite.signer,
        });
        if (!res.circle) throw new Plain(copy.error.generic);
        p.circle = res.circle;
        saveInvite(p.circle, p.invite.key);
      }
      const circle = p.circle;
      if (back > 0 && !p.backed) {
        if ((await balanceOf(acct.address)) < backAmount) {
          setDoing(copy.newCircle.stepFunds);
          await addPracticeDollars(acct.address, circle, backAmount);
        }
        setDoing(copy.newCircle.stepBack(dollars(backAmount)));
        await relay("bond", await bondBundle(acct.account, circle, backAmount));
        p.backed = true;
      }
      if (back > 0) {
        setDoing(copy.newCircle.stepLink);
        const seen = await until(() => readCircle(circle), (s) => s.bond >= backAmount);
        if (!seen) throw new Plain(copy.error.generic);
      }
      setMade({ circle, link: inviteLink(location.origin, circle, p.invite.key) });
      setStep("ready");
    } catch (e) {
      setError(plainError(e));
      setStep("back");
    }
  }

  async function copyLink() {
    if (!made) return;
    try {
      await navigator.clipboard.writeText(made.link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError(copy.error.generic);
    }
  }

  if (step === "work") {
    return (
      <Page bar={false}>
        <h1 className="t-headline mt-2">{copy.newCircle.heading}</h1>
        <p className="t-lead pulse-bar mt-8" role="status">
          {doing}
        </p>
        <p className="mt-2 text-body">{copy.newCircle.working}</p>
      </Page>
    );
  }

  if (step === "ready" && made) {
    const wa = `https://wa.me/?text=${encodeURIComponent(copy.newCircle.inviteMessage(name.trim(), eachText, n, copy.periods.clause(seconds), made.link))}`;
    return (
      <>
        <Page>
          <h1 className="t-headline mt-2">{copy.newCircle.readyHeading}</h1>
          <p className="mt-3 text-body">{copy.newCircle.readyLead}</p>
          <p className="mt-6 rounded-card bg-surface p-4 text-ink">{copy.newCircle.inviteMessage(name.trim(), eachText, n, copy.periods.clause(seconds), "")}</p>
          <button type="button" onClick={copyLink} className="mt-4 h-12 font-semibold text-ink underline underline-offset-4">
            {copied ? copy.common.copied : copy.common.copyLink}
          </button>
          {error ? <Notice tone="problem">{error}</Notice> : null}
        </Page>
        <Bar>
          <LinkButton href={wa} target="_blank" rel="noopener noreferrer">
            {copy.newCircle.shareWhatsApp}
          </LinkButton>
          <Button variant="secondary" onClick={() => location.assign(`/c/?id=${made.circle}`)}>
            {copy.newCircle.openCircle}
          </Button>
        </Bar>
      </>
    );
  }

  if (step === "back") {
    return (
      <>
        <Page>
          <h1 className="t-headline mt-2">{copy.newCircle.backHeading}</h1>
          <p className="mt-3 text-body">{copy.newCircle.backLead}</p>
          <div className="mt-8">
            <p className="t-small mb-3 text-caption">{copy.newCircle.backRounds}</p>
            <Stepper
              value={back}
              onLess={() => setRounds(Math.max(0, back - 1))}
              onMore={() => setRounds(Math.min(maxBack, back + 1))}
              canLess={back > 0}
              canMore={back < maxBack}
              lessLabel={copy.common.less(copy.newCircle.backRounds)}
              moreLabel={copy.common.more(copy.newCircle.backRounds)}
            />
          </div>
          <p className="mt-6 rounded-card bg-surface p-4 text-ink">{back === 0 ? copy.newCircle.backNone : copy.newCircle.backSome(dollars(backAmount), back)}</p>
          {back > 0 ? <p className="t-count num mt-4">{copy.newCircle.backYouPut(dollars(backAmount))}</p> : null}
          <p className="t-small mt-6 text-body">{copy.newCircle.lockNote}</p>
          <button type="button" onClick={() => setReturning(!returning)} className="t-small mt-2 h-10 font-semibold text-ink underline underline-offset-4">
            {returning ? copy.newCircle.firstTime : copy.newCircle.returning}
          </button>
          {error ? (
            <div className="mt-4">
              <Notice tone="problem">{error}</Notice>
            </div>
          ) : null}
        </Page>
        <Bar>
          <Button onClick={create}>{back > 0 ? copy.newCircle.createBacked(dollars(backAmount)) : copy.newCircle.create}</Button>
          {progress.current.circle ? null : (
            <Button variant="secondary" onClick={() => setStep("form")}>
              {copy.common.back}
            </Button>
          )}
        </Bar>
      </>
    );
  }

  return (
    <>
      <Page>
        <h1 className="t-headline mt-2">{copy.newCircle.heading}</h1>
        <p className="t-lead num mt-4 rounded-card bg-surface-pale p-4 text-ink" aria-live="polite">
          {copy.newCircle.live(eachText, potText, n)}
        </p>

        <label className="mt-8 block">
          <span className="t-small font-semibold">{copy.newCircle.nameLabel}</span>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={48}
            placeholder={copy.newCircle.namePlaceholder}
            autoComplete="off"
            className="mt-2 h-12 w-full rounded-input bg-surface px-4 text-ink placeholder:text-mute"
          />
        </label>

        <div className="mt-8">
          <p className="t-small mb-3 font-semibold">{copy.newCircle.amountLabel}</p>
          <Stepper
            value={eachText}
            onLess={() => setAmountAt(Math.max(0, amountAt - 1))}
            onMore={() => setAmountAt(Math.min(AMOUNTS.length - 1, amountAt + 1))}
            canLess={amountAt > 0}
            canMore={amountAt < AMOUNTS.length - 1}
            lessLabel={copy.common.less(copy.newCircle.amountLabel)}
            moreLabel={copy.common.more(copy.newCircle.amountLabel)}
          />
          <p className="t-small mt-2 text-center text-caption">{copy.newCircle.amountUnit}</p>
        </div>

        <fieldset className="mt-8">
          <legend className="t-small font-semibold">{copy.newCircle.peopleLabel}</legend>
          <p className="t-caption mt-1 text-caption">{copy.newCircle.peopleHint}</p>
          <ul className="mt-3 flex flex-col gap-2">
            {people.map((p, i) => (
              <li key={i} className="flex items-center gap-2">
                <input
                  value={p}
                  onChange={(e) => setPerson(i, e.target.value)}
                  maxLength={32}
                  placeholder={i === 0 ? copy.newCircle.yourName : copy.newCircle.personName(i + 1)}
                  aria-label={i === 0 ? copy.newCircle.yourName : copy.newCircle.personName(i + 1)}
                  autoComplete="off"
                  className="h-12 min-w-0 flex-1 rounded-input bg-surface px-4 text-ink placeholder:text-mute"
                />
                <button type="button" className={iconBtn} disabled={i === 0} onClick={() => move(i, -1)} aria-label={copy.common.moveUp(p || copy.newCircle.personName(i + 1))}>
                  <Chevron up />
                </button>
                <button type="button" className={iconBtn} disabled={i === n - 1} onClick={() => move(i, 1)} aria-label={copy.common.moveDown(p || copy.newCircle.personName(i + 1))}>
                  <Chevron up={false} />
                </button>
                <button
                  type="button"
                  className={`${iconBtn} t-count`}
                  disabled={i === 0 || n <= MIN_PEOPLE}
                  onClick={() => setPeople((q) => q.filter((_, j) => j !== i))}
                  aria-label={copy.common.remove(p || copy.newCircle.personName(i + 1))}
                >
                  -
                </button>
              </li>
            ))}
          </ul>
          {n < MAX_PEOPLE ? (
            <button type="button" onClick={() => setPeople((q) => [...q, ""])} className="mt-3 h-12 font-semibold text-ink underline underline-offset-4">
              {copy.newCircle.add}
            </button>
          ) : null}
        </fieldset>

        <div role="radiogroup" aria-label={copy.newCircle.howOften} className="mt-8">
          <p className="t-small mb-3 font-semibold">{copy.newCircle.howOften}</p>
          <div className="flex flex-col gap-2">
            {PERIODS.map((p) => (
              <button
                key={p.seconds}
                type="button"
                role="radio"
                aria-checked={seconds === p.seconds}
                onClick={() => setSeconds(p.seconds)}
                className={`btn flex h-14 items-center rounded-card px-4 text-left font-semibold ${seconds === p.seconds ? "bg-primary text-primary-ink" : "bg-surface text-ink"}`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </Page>
      <Bar>
        {problem ? <p className="t-small text-center text-caption">{problem}</p> : null}
        <Button disabled={problem !== null} onClick={() => setStep("back")}>
          {copy.newCircle.next}
        </Button>
      </Bar>
    </>
  );
}
