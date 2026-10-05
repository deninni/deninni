export const de = (n: number, d = 1) => n.toLocaleString("de-DE", { minimumFractionDigits: d, maximumFractionDigits: d });

export function timeDe(ts: number | string, withSeconds = false): string {
  return new Intl.DateTimeFormat("de-DE", { hour: "2-digit", minute: "2-digit", second: withSeconds ? "2-digit" : undefined, timeZone: "Europe/Berlin" }).format(new Date(ts));
}

export function dateTimeDe(ts: number | string): string {
  return new Intl.DateTimeFormat("de-DE", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Berlin" }).format(new Date(ts));
}

export function agoDe(ts: number | string, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - new Date(ts).getTime()) / 1000));
  if (s < 60) return `vor ${s} s`;
  if (s < 3600) return `vor ${Math.round(s / 60)} min`;
  return `vor ${Math.round(s / 3600)} h`;
}
