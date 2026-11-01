export type GenOptions = { length: number; lower: boolean; upper: boolean; digits: boolean; symbols: boolean; noAmbiguous: boolean };
export const DEFAULT_GEN: GenOptions = { length: 20, lower: true, upper: true, digits: true, symbols: true, noAmbiguous: true };

const SETS = {
  lower: "abcdefghijklmnopqrstuvwxyz",
  upper: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  digits: "0123456789",
  symbols: "!@#$%^&*()-_=+[]{};:,.?",
} as const;

/** Uniform integer in [0, max) from the CSPRNG, by rejection sampling (no modulo bias). */
function randInt(max: number) {
  const limit = Math.floor(0x1_0000_0000 / max) * max;
  const buf = new Uint32Array(1);
  do crypto.getRandomValues(buf);
  while (buf[0] >= limit);
  return buf[0] % max;
}

export function generatePassword(o: GenOptions): string {
  const sets = (Object.keys(SETS) as (keyof typeof SETS)[])
    .filter((k) => o[k])
    .map((k) => (o.noAmbiguous ? SETS[k].replace(/[Il1O0o]/g, "") : SETS[k]));
  if (!sets.length) throw new Error("Pick at least one character type");
  const length = Math.max(o.length, sets.length);
  const pool = sets.join("");
  // One guaranteed character per selected type, the rest from the whole pool, then a Fisher-Yates shuffle.
  const out = [...sets.map((s) => s[randInt(s.length)]), ...Array.from({ length: length - sets.length }, () => pool[randInt(pool.length)])];
  for (let i = out.length - 1; i > 0; i--) {
    const j = randInt(i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out.join("");
}

// shortcut: charset-size entropy estimate; it overrates dictionary words and patterns. Swap for zxcvbn if you want realism.
export function strengthBits(pw: string) {
  if (!pw) return 0;
  const pool = (/[a-z]/.test(pw) ? 26 : 0) + (/[A-Z]/.test(pw) ? 26 : 0) + (/\d/.test(pw) ? 10 : 0) + (/[^a-zA-Z0-9]/.test(pw) ? 33 : 0);
  const unique = new Set(pw).size;
  return Math.round(Math.log2(pool || 1) * Math.min(pw.length, unique * 2));
}

export function strengthLabel(bits: number) {
  if (bits < 40) return { text: "Weak", color: "bg-red-500", pct: 20 };
  if (bits < 60) return { text: "Fair", color: "bg-amber-500", pct: 45 };
  if (bits < 80) return { text: "Good", color: "bg-lime-500", pct: 70 };
  return { text: "Strong", color: "bg-emerald-500", pct: 100 };
}
