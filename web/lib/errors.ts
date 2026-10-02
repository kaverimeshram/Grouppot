// Relay and phone-lock failures, in plain sentences. Raw messages never reach the screen.
import { isMeraError } from "@category-labs/mera";
import { copy } from "./copy";

export class Plain extends Error {}

function cancelled(e: unknown): boolean {
  const cause = (e as { cause?: { name?: string } } | null)?.cause;
  const name = cause?.name ?? (e as { name?: string } | null)?.name;
  return name === "NotAllowedError" || name === "AbortError";
}

export function plainError(e: unknown): string {
  if (e instanceof Plain) return e.message;
  if (isMeraError(e)) {
    if (e.code === "PASSKEY_OPERATION_FAILED" && cancelled(e)) return copy.error.unlockCancelled;
    return copy.error.unlockUnavailable;
  }
  if (cancelled(e)) return copy.error.unlockCancelled;
  const msg = e instanceof Error ? e.message : String(e);
  if (/slot-taken/.test(msg)) return copy.error.slotTaken;
  if (/already-member/.test(msg)) return copy.error.alreadyIn;
  if (/Circle:started/.test(msg)) return copy.error.started;
  if (/practice dollars already/.test(msg)) return copy.error.practiceUsed;
  if (/too many circles/.test(msg)) return copy.error.tooMany;
  if (/Failed to fetch|NetworkError|Load failed|fetch failed/i.test(msg)) return copy.error.offline;
  return copy.error.generic;
}
