import type { ComponentProps, ReactNode } from "react";

/// Pinned thumb-zone bar. One primary button, at most one secondary under it.
export function Bar({ children }: { children: ReactNode }) {
  return (
    <div className="fixed inset-x-0 bottom-0 border-t border-surface bg-canvas">
      <div className="mx-auto flex w-full max-w-[430px] flex-col gap-2 px-4 pt-4 pb-[calc(16px+env(safe-area-inset-bottom))]">{children}</div>
    </div>
  );
}

type Variant = "primary" | "secondary";
const base = "btn flex h-14 w-full items-center justify-center rounded-pill px-6 font-semibold";
const look: Record<Variant, string> = {
  primary: "bg-primary text-primary-ink active:scale-[0.98] active:bg-primary-active",
  secondary: "bg-surface text-ink active:scale-[0.98]",
};
const off = "bg-surface text-mute pointer-events-none";

export function Button({ variant = "primary", disabled, className = "", ...rest }: ComponentProps<"button"> & { variant?: Variant }) {
  return <button {...rest} disabled={disabled} className={`${base} ${disabled ? off : look[variant]} ${className}`} />;
}

export function LinkButton({ variant = "primary", className = "", ...rest }: ComponentProps<"a"> & { variant?: Variant }) {
  return <a {...rest} className={`${base} ${look[variant]} ${className}`} />;
}

export function Page({ children, bar = true }: { children: ReactNode; bar?: boolean }) {
  return <main className={`mx-auto w-full max-w-[430px] px-4 pt-6 ${bar ? "pb-[calc(88px+32px+env(safe-area-inset-bottom))]" : "pb-8"}`}>{children}</main>;
}

export function Notice({ children, tone = "plain" }: { children: ReactNode; tone?: "plain" | "problem" }) {
  return (
    <p role={tone === "problem" ? "alert" : "status"} className={`t-small rounded-card px-4 py-3 ${tone === "problem" ? "bg-negative-pale text-negative-deep" : "bg-surface text-ink"}`}>
      {children}
    </p>
  );
}

export function Bone({ className = "" }: { className?: string }) {
  return <div className={`pulse-bar rounded-pill bg-surface ${className}`} />;
}

/// - value + stepper, used for dollars and rounds.
export function Stepper({
  value,
  onLess,
  onMore,
  canLess,
  canMore,
  lessLabel,
  moreLabel,
}: {
  value: ReactNode;
  onLess: () => void;
  onMore: () => void;
  canLess: boolean;
  canMore: boolean;
  lessLabel: string;
  moreLabel: string;
}) {
  const b = "flex h-12 w-12 items-center justify-center rounded-pill bg-surface text-ink font-semibold t-count active:scale-[0.96] btn";
  return (
    <div className="flex items-center justify-between gap-4">
      <button type="button" className={`${b} ${canLess ? "" : "pointer-events-none opacity-40"}`} onClick={onLess} aria-label={lessLabel} disabled={!canLess}>
        -
      </button>
      <span className="t-pot num min-w-[96px] text-center">{value}</span>
      <button type="button" className={`${b} ${canMore ? "" : "pointer-events-none opacity-40"}`} onClick={onMore} aria-label={moreLabel} disabled={!canMore}>
        +
      </button>
    </div>
  );
}
