/// Reads until `ok` is true. Resolves with the value that passed, or null once `timeoutMs` is spent. Never loops forever.
export async function until<T>(read: () => Promise<T>, ok: (v: T) => boolean, every = 2000, timeoutMs = 90_000): Promise<T | null> {
  const end = Date.now() + timeoutMs;
  for (;;) {
    try {
      const v = await read();
      if (ok(v)) return v;
    } catch {
      // a read that fails is retried until the deadline
    }
    if (Date.now() >= end) return null;
    await new Promise((r) => setTimeout(r, every));
  }
}
