"use client";

import { useRouter } from "next/navigation";

type N = { id: string; name: string; typeLabel: string; code?: string };

/** Radiale Relationenansicht (SVG): Zentrum, Eltern, Bestandteile und Querbeziehungen. Tippen navigiert. */
export function RelationGraph({ center, parent, children, relations }: { center: N; parent?: N; children: N[]; relations: { label: string; dir: "in" | "out"; node: N }[] }) {
  const router = useRouter();
  const W = 640, H = 340, cx = W / 2, cy = H / 2;
  const ring: { n: N; label: string; kind: "parent" | "child" | "rel" }[] = [
    ...(parent ? [{ n: parent, label: "gehört zu", kind: "parent" as const }] : []),
    ...relations.slice(0, 10).map((r) => ({ n: r.node, label: r.dir === "out" ? r.label : `← ${r.label}`, kind: "rel" as const })),
    ...children.slice(0, Math.max(0, 14 - relations.length)).map((c) => ({ n: c, label: "Bestandteil", kind: "child" as const })),
  ];
  const short = (s: string, k = 18) => (s.length > k ? s.slice(0, k - 1) + "…" : s);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`Beziehungen von ${center.name}`}>
      {ring.map((r, i) => {
        const a = (i / Math.max(1, ring.length)) * Math.PI * 2 - Math.PI / 2;
        const x = cx + Math.cos(a) * 240, y = cy + Math.sin(a) * 130;
        const color = r.kind === "parent" ? "#8b93a0" : r.kind === "child" ? "#3d7a8f" : "#5a8fa3";
        return (
          <g key={r.n.id + i} onClick={() => router.push(`/brain/${encodeURIComponent(r.n.id)}`)} style={{ cursor: "pointer" }}>
            <line x1={cx} y1={cy} x2={x} y2={y} stroke={color} strokeOpacity={0.45} strokeDasharray={r.kind === "rel" ? "0" : "4 3"} />
            <text x={(cx + x) / 2} y={(cy + y) / 2 - 3} textAnchor="middle" fontSize={8.5} fill="#8b93a0">{short(r.label, 22)}</text>
            <rect x={x - 62} y={y - 15} width={124} height={30} rx={4} fill="#11161e" stroke={color} />
            <text x={x} y={y - 2} textAnchor="middle" fontSize={10} fill="#e6eaef">{short(r.n.name)}</text>
            <text x={x} y={y + 10} textAnchor="middle" fontSize={8} fill="#8b93a0">{r.n.typeLabel}</text>
          </g>
        );
      })}
      <rect x={cx - 78} y={cy - 20} width={156} height={40} rx={5} fill="rgba(90,143,163,.18)" stroke="#5a8fa3" strokeWidth={1.5} />
      <text x={cx} y={cy - 2} textAnchor="middle" fontSize={12} fontWeight={600} fill="#e6eaef">{short(center.name, 22)}</text>
      <text x={cx} y={cy + 12} textAnchor="middle" fontSize={9} fill="#9eb8d4">{center.typeLabel}</text>
    </svg>
  );
}
