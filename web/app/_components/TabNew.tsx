"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { Address } from "viem";
import { copy } from "@/lib/copy";
import { plainError } from "@/lib/errors";
import { createPasskeyAccount, signInWithPasskey } from "@/lib/passkey";
import { createTabRelay } from "@/lib/tab-chain";
import { Bar, Button, Notice, Page } from "./ui";

type Mate = { label: string; address: Address };

export function TabNew() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [tabName, setTabName] = useState("Friday dinner");
  const [total, setTotal] = useState("60");
  const [mates, setMates] = useState<Mate[]>([]);
  const [mateLabel, setMateLabel] = useState("");
  const [mateAddr, setMateAddr] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function unlock(create: boolean) {
    setError(null);
    setBusy(copy.tab.unlockNew);
    try {
      return create ? await createPasskeyAccount(name || copy.tab.yourName) : await signInWithPasskey();
    } catch (e) {
      setError(plainError(e));
      return null;
    } finally {
      setBusy("");
    }
  }

  function addMate() {
    const label = mateLabel.trim();
    const address = mateAddr.trim() as Address;
    if (!label || !/^0x[0-9a-fA-F]{40}$/.test(address)) {
      setError(copy.tab.errFriend);
      return;
    }
    setMates((m) => [...m, { label, address }]);
    setMateLabel("");
    setMateAddr("");
    setError(null);
  }

  async function startTab() {
    setError(null);
    const session = await unlock(false);
    if (!session) return;
    const dollars = Number(total);
    if (!tabName.trim() || !Number.isFinite(dollars) || dollars <= 0) {
      setError(copy.tab.errBill);
      return;
    }
    if (mates.length < 1) {
      setError(copy.tab.errFriends);
      return;
    }
    setBusy(copy.tab.open);
    try {
      const { tab } = await createTabRelay(session.address, tabName.trim(), "Bill", dollars, mates);
      router.push(`/tab/?id=${tab}`);
    } catch (e) {
      setError(plainError(e));
    } finally {
      setBusy("");
    }
  }

  return (
    <>
      <Page>
        <h1 className="t-headline mt-2 text-ink">{copy.tab.newHeading}</h1>
        <p className="mt-3 text-body">{copy.tab.newLead}</p>
        <div className="mt-6 space-y-4 rounded-card bg-surface p-4">
          <label className="block">
            <span className="t-small font-semibold text-ink">{copy.tab.yourName}</span>
            <input className="mt-2 h-12 w-full rounded-pill bg-canvas px-4 text-ink" value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" />
          </label>
          <div className="grid gap-2 sm:grid-cols-2">
            <Button variant="secondary" disabled={!!busy} onClick={() => void unlock(true)}>
              {copy.tab.unlockNew}
            </Button>
            <Button variant="secondary" disabled={!!busy} onClick={() => void unlock(false)}>
              {copy.tab.unlockReturn}
            </Button>
          </div>
        </div>
        <div className="mt-4 space-y-3 rounded-card bg-surface p-4">
          <label className="block">
            <span className="t-small font-semibold text-ink">{copy.tab.tabName}</span>
            <input className="mt-2 h-12 w-full rounded-pill bg-canvas px-4 text-ink" value={tabName} onChange={(e) => setTabName(e.target.value)} />
          </label>
          <label className="block">
            <span className="t-small font-semibold text-ink">{copy.tab.total}</span>
            <input className="mt-2 h-12 w-full rounded-pill bg-canvas px-4 text-ink" inputMode="decimal" value={total} onChange={(e) => setTotal(e.target.value)} />
          </label>
          <p className="t-small font-semibold text-ink">{copy.tab.friends}</p>
          <ul className="space-y-1 text-body">
            {mates.map((m) => (
              <li key={m.address}>
                {m.label} · {m.address.slice(0, 6)}…{m.address.slice(-4)}
              </li>
            ))}
          </ul>
          <label className="block">
            <span className="t-small font-semibold text-ink">{copy.tab.friendName}</span>
            <input className="mt-2 h-12 w-full rounded-pill bg-canvas px-4 text-ink" value={mateLabel} onChange={(e) => setMateLabel(e.target.value)} />
          </label>
          <label className="block">
            <span className="t-small font-semibold text-ink">{copy.tab.friendId}</span>
            <input className="mt-2 h-12 w-full rounded-pill bg-canvas px-4 text-ink" value={mateAddr} onChange={(e) => setMateAddr(e.target.value)} />
          </label>
          <Button variant="secondary" onClick={addMate}>
            {copy.tab.addFriend}
          </Button>
        </div>
        {error ? (
          <div className="mt-4">
            <Notice tone="problem">{error}</Notice>
          </div>
        ) : null}
      </Page>
      <Bar>
        <Button disabled={!!busy} onClick={() => void startTab()}>
          {busy || copy.tab.open}
        </Button>
      </Bar>
    </>
  );
}
