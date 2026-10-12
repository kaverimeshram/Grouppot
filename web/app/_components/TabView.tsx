"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import type { Address } from "viem";
import { copy } from "@/lib/copy";
import { plainError } from "@/lib/errors";
import { signInWithPasskey } from "@/lib/passkey";
import { dollars, readTab, settleBundle, tabPracticeRelay, tabSettleRelay, type TabSnapshot } from "@/lib/tab-chain";
import { Bar, Button, Notice, Page } from "./ui";

function TabInner() {
  const params = useSearchParams();
  const id = params.get("id") as Address | null;
  const [tab, setTab] = useState<TabSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState("");
  const [me, setMe] = useState<Address | null>(null);

  const refresh = useCallback(async () => {
    if (!id || !/^0x[0-9a-fA-F]{40}$/.test(id)) {
      setError(copy.tab.missingLink);
      return;
    }
    setTab(await readTab(id));
  }, [id]);

  useEffect(() => {
    void refresh().catch((e) => setError(plainError(e)));
  }, [refresh]);

  async function addPractice() {
    if (!me || !id) return;
    setBusy(copy.tab.practice);
    try {
      await tabPracticeRelay(me, id);
      setError(null);
    } catch (e) {
      setError(plainError(e));
    } finally {
      setBusy("");
    }
  }

  async function settle() {
    if (!tab) return;
    setError(null);
    setBusy(copy.newCircle.stepUnlock);
    try {
      const { account, address } = await signInWithPasskey();
      setMe(address);
      setBusy(copy.tab.payShare);
      const body = await settleBundle(account, tab);
      await tabSettleRelay(body);
      await refresh();
    } catch (e) {
      setError(plainError(e));
    } finally {
      setBusy("");
    }
  }

  if (!tab) {
    return (
      <Page bar={false}>
        <p className="text-body">{error ?? copy.tab.loading}</p>
      </Page>
    );
  }

  const pooled = tab.balance > BigInt(0) ? tab.balance : tab.total;
  const myRow = me ? tab.members.find((m) => m.member.toLowerCase() === me.toLowerCase()) : null;

  return (
    <>
      <Page>
        <h1 className="t-headline mt-2 text-ink">{tab.name}</h1>
        <p className="mt-2 text-body">{copy.tab.pool(dollars(tab.total), dollars(tab.paidSum), dollars(pooled))}</p>
        <div className="mt-6 rounded-card bg-surface p-4">
          <p className="t-small font-semibold text-ink">{copy.tab.whoOwes}</p>
          <ul className="mt-3 space-y-3">
            {tab.members.map((m) => (
              <li key={m.member} className="flex items-center justify-between gap-3 text-body" style={{ minWidth: 0 }}>
                <span className="font-semibold text-ink" style={{ overflowWrap: "anywhere" }}>
                  {m.label}
                </span>
                <span className={m.paid ? "text-positive-deep" : "text-mute"}>
                  {dollars(m.share)} {m.paid ? copy.tab.settled : copy.tab.due}
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div className="mt-4 space-y-2">
          <Button variant="secondary" onClick={() => void signInWithPasskey().then(({ address }) => setMe(address))}>
            {copy.tab.showMe}
          </Button>
          {me ? (
            <Button variant="secondary" disabled={!!busy} onClick={() => void addPractice()}>
              {copy.tab.practice}
            </Button>
          ) : null}
        </div>
        {tab.closed ? <p className="mt-4 text-body font-semibold text-positive-deep">{copy.tab.everyonePaid}</p> : null}
        {error ? (
          <div className="mt-4">
            <Notice tone="problem">{error}</Notice>
          </div>
        ) : null}
      </Page>
      {me && !myRow?.paid && !tab.closed ? (
        <Bar>
          <Button disabled={!!busy} onClick={() => void settle()}>
            {busy || copy.tab.payShare}
          </Button>
        </Bar>
      ) : myRow?.paid ? (
        <Bar>
          <Button disabled>{copy.tab.paidAlready}</Button>
        </Bar>
      ) : null}
    </>
  );
}

export function TabView() {
  return (
    <Suspense
      fallback={
        <Page bar={false}>
          <p className="text-body">{copy.tab.loading}</p>
        </Page>
      }
    >
      <TabInner />
    </Suspense>
  );
}
