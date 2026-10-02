import type { ReactNode } from "react";
import { hueOf, initialOf } from "./ring-util";

export type ArcState = "open" | "notyet" | "paid" | "covered" | "stopped";
export type RingMember = { label: string; state: ArcState; hue?: number };

const R = 108;
const STROKE = 10;
const DISC = 40;
const DISC_NOW = 56;
const GAP = 6;

const rad = (deg: number) => (deg * Math.PI) / 180;
const pt = (deg: number): [number, number] => [R * Math.sin(rad(deg)), -R * Math.cos(rad(deg))];

function arcPath(a0: number, a1: number) {
  const [x0, y0] = pt(a0);
  const [x1, y1] = pt(a1);
  return `M${x0.toFixed(2)} ${y0.toFixed(2)}A${R} ${R} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

/// The payout ring. Arcs run clockwise in payout order and the whole ring turns so that whoever collects this round
/// sits at 12 o'clock. `round` only ever grows, so the turn is always forward.
export function Ring({
  members,
  round,
  centre,
  label,
  skeleton = false,
}: {
  members: RingMember[];
  round: number;
  centre: ReactNode;
  label: string;
  skeleton?: boolean;
}) {
  const n = members.length;
  const step = 360 / n;
  const turn = -round * step;
  const current = round < n ? round : -1;
  const roomy = n <= 8;
  const discOf = (i: number) => (i === current ? DISC_NOW : DISC);
  const trim = (i: number) => (((discOf(i) / 2 + GAP + STROKE / 2) / R) * 180) / Math.PI;

  return (
    <div className="relative mx-auto h-[280px] w-[280px]" role="img" aria-label={label}>
      <svg viewBox="0 0 280 280" className="absolute inset-0 h-full w-full" aria-hidden="true">
        <defs>
          <pattern id="ring-hatch" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="8" height="8" className="fill-warning-pale" />
            <rect width="4" height="8" className="fill-warning" />
          </pattern>
        </defs>
        <g transform="translate(140 140)">
          <g className="ring-turn" style={{ transform: `rotate(${turn}deg)` }}>
            {members.map((m, i) => {
              const a0 = i * step + (roomy ? trim(i) : 1.5);
              const a1 = (i + 1) * step - (roomy ? trim((i + 1) % n) : 1.5);
              const d = arcPath(a0, a1);
              const cap = roomy ? "round" : "butt";
              const state = skeleton ? "open" : m.state;
              return (
                <g key={i}>
                  <path d={d} fill="none" strokeWidth={STROKE} strokeLinecap={cap} className="stroke-surface" />
                  {state === "stopped" ? (
                    <>
                      <path d={d} fill="none" strokeWidth={STROKE} strokeLinecap={cap} className="stroke-negative" />
                      <path d={d} fill="none" strokeWidth={STROKE - 4} strokeLinecap={cap} className="stroke-canvas" />
                    </>
                  ) : null}
                  {state === "covered" ? (
                    <path d={d} fill="none" strokeWidth={STROKE} strokeLinecap={cap} stroke="url(#ring-hatch)" />
                  ) : null}
                  {state === "open" || state === "notyet" ? (
                    <path d={d} fill="none" strokeWidth={4} strokeLinecap="round" strokeDasharray="2 8" className="stroke-line" />
                  ) : null}
                  <path
                    d={d}
                    pathLength={1}
                    fill="none"
                    strokeWidth={STROKE}
                    strokeLinecap={cap}
                    className="ring-fill stroke-primary"
                    style={{ strokeDasharray: "1 1", strokeDashoffset: state === "paid" ? 0 : 1, opacity: state === "paid" ? 1 : 0 }}
                  />
                </g>
              );
            })}
          </g>
          {skeleton
            ? null
            : members.map((m, i) => {
                if (!roomy && i !== current) return null;
                const here = i * step + turn;
                const r = discOf(i) / 2;
                const hue = m.hue ?? hueOf(m.label);
                const text = initialOf(m.label);
                const plain = m.state === "open";
                return (
                  <g
                    key={i}
                    className="ring-turn"
                    style={{ transform: `rotate(${here}deg) translate(0px, ${-R}px) rotate(${-here}deg)` }}
                  >
                    <circle
                      className="ring-disc"
                      style={{ r: `${r}px`, fill: plain ? "var(--color-canvas)" : `hsl(${hue} 40% 88%)` }}
                      strokeWidth={plain ? 2 : 0}
                      strokeDasharray={m.state === "open" ? "3 5" : undefined}
                      stroke="currentColor"
                      color="var(--color-line)"
                    />
                    {text ? (
                      <text
                        textAnchor="middle"
                        dominantBaseline="central"
                        fontSize={i === current ? 18 : 14}
                        fontWeight={600}
                        style={{ fill: plain ? "var(--color-mute)" : `hsl(${hue} 50% 22%)` }}
                      >
                        {text}
                      </text>
                    ) : null}
                  </g>
                );
              })}
        </g>
      </svg>
      <div className="absolute left-1/2 top-1/2 flex max-w-[150px] -translate-x-1/2 -translate-y-1/2 flex-col items-center text-center">
        {centre}
      </div>
    </div>
  );
}
