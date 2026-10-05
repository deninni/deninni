/** Deterministische Pseudo-Zufallswerte: gleicher Zeitpunkt → gleicher Wert (reproduzierbare Demos). */
export function hash32(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h ^= h >>> 13;
  h = Math.imul(h, 0x5bd1e995);
  h ^= h >>> 15;
  return h >>> 0;
}

/** Wert in [0,1) für (seed, bucket). */
export function noise01(seed: string, bucket: number): number {
  return hash32(`${seed}:${bucket}`) / 4294967296;
}

/** Glattes Rauschen in [-1,1] durch Interpolation zwischen Buckets. */
export function smoothNoise(seed: string, t: number, periodMs: number): number {
  const x = t / periodMs;
  const b = Math.floor(x);
  const f = x - b;
  const a = noise01(seed, b) * 2 - 1;
  const c = noise01(seed, b + 1) * 2 - 1;
  const s = f * f * (3 - 2 * f);
  return a + (c - a) * s;
}
