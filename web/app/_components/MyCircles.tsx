"use client";
import { useRef, useState } from "react";
import type { Address } from "viem";
import { discoverCircles } from "@/lib/circle-discovery";
import { copy } from "@/lib/copy";
import { plainError } from "@/lib/errors";
import { loadCircles, loadMe, saveCircles, unlock, type Me } from "@/lib/session";
import { Button, LinkButton, Notice } from "./ui";

export function MyCircles({ setMe }: { setMe?: (me: Me) => void }) {
  const [items, setItems] = useState<{ address: Address; name: string }[]>([]);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const request = useRef(0);
  async function find() {
    const current = ++request.current;
    setWorking(true);
    setError(null);
    setItems([]);
    setChecked(false);
    try {
      const saved = loadMe();
      const got = await unlock(saved?.name ?? "member", true);
      if (request.current !== current) return;
      setMe?.({ address: got.address, name: saved?.name ?? "member" });
      const circles = await discoverCircles(got.address, loadCircles(got.address));
      if (request.current !== current) return;
      saveCircles(got.address, circles.map((circle) => circle.address));
      setItems(circles);
      setChecked(true);
    } catch (e) {
      if (request.current === current) setError(plainError(e));
    } finally {
      if (request.current === current) setWorking(false);
    }
  }
  return (
    <section className="mt-8 rounded-card bg-surface p-4">
      <h2 className="t-body font-semibold text-balance">{copy.empty.findHeading}</h2>
      <p className="t-small mt-1 text-body text-pretty">{copy.empty.findLead}</p>
      <Button className="mt-4" variant="secondary" onClick={find} disabled={working}>{working ? copy.empty.finding : copy.empty.find}</Button>
      {working ? <p className="t-small mt-3 text-body" role="status">{copy.empty.searching}</p> : null}
      {error ? <div className="mt-3"><Notice tone="problem">{error}</Notice></div> : null}
      {items.length ? <ul className="mt-4 flex flex-col gap-2">{items.map((item) => <li key={item.address}><LinkButton href={`/c/?id=${item.address}`} className="truncate text-left">{item.name}</LinkButton></li>)}</ul> : null}
      {checked && !items.length ? <p className="t-small mt-4 text-body text-pretty" role="status">{copy.empty.noneFound}</p> : null}
    </section>
  );
}
