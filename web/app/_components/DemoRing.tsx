"use client";
import { useEffect, useState } from "react";
import { copy } from "@/lib/copy";
import { Ring, type RingMember } from "./Ring";

const N = 5;
const FILLED = 3;

/// The landing picture: five people, each arc fills as someone pays in, then the ring turns to the next collector.
/// It carries no names and no amounts, so it shows how a circle works without pretending to be one.
export function DemoRing() {
  const [tick, setTick] = useState(FILLED);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const id = setInterval(() => setTick((t) => t + 1), 900);
    return () => clearInterval(id);
  }, []);
  const cycle = N + 2;
  const round = Math.floor(tick / cycle);
  const phase = tick % cycle;
  const paid = Math.min(phase, N);
  const members: RingMember[] = Array.from({ length: N }, (_, i) => ({ label: "", hue: i * 72 + 20, state: i < paid ? "paid" : "notyet" }));
  const collecting = phase >= N;
  return (
    <Ring
      members={members}
      round={round}
      label={copy.home.demoLabel}
      centre={<span className="t-lead text-balance text-ink">{collecting ? copy.home.demoCollects : copy.home.demoPaying}</span>}
    />
  );
}
