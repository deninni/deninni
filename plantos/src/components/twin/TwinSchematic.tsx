"use client";

import type { TwinPayload, TwinComponent } from "@/lib/twin/health";
import { shortComponentLabel } from "@/lib/twin/layouts";

const STROKE = { OK: "#5a8fa3", WARN: "#fbbf24", FAULT: "#f87171", OFF: "#52525b" } as const;
const W = 1000, H = 560;

function Glyph({ c, selected }: { c: TwinComponent; selected: boolean }) {
  const x = (c.x / 100) * W, y = (c.y / 100) * H;
  const stroke = selected ? "#9eb8d4" : STROKE[c.health];
  const sw = selected ? 2.4 : 1.4;
  const fill = c.health === "FAULT" ? "rgba(196,92,92,.12)" : c.health === "WARN" ? "rgba(201,162,39,.1)" : "rgba(17,22,30,.85)";
  switch (c.kind) {
    case "conveyor": return <rect x={x - 46} y={y - 14} width={92} height={28} rx={3} fill={fill} stroke={stroke} strokeWidth={sw} />;
    case "starwheel": return <g><circle cx={x} cy={y} r={26} fill={fill} stroke={stroke} strokeWidth={sw} />{Array.from({ length: 8 }, (_, i) => { const a = (i / 8) * Math.PI * 2; return <circle key={i} cx={x + Math.cos(a) * 19} cy={y + Math.sin(a) * 19} r={4} fill="none" stroke={stroke} strokeWidth={1} />; })}</g>;
    case "station": case "tunnel": return <rect x={x - 38} y={y - 34} width={76} height={68} rx={4} fill={fill} stroke={stroke} strokeWidth={sw} />;
    case "motor": return <g><circle cx={x} cy={y} r={18} fill={fill} stroke={stroke} strokeWidth={sw} /><text x={x} y={y + 4} textAnchor="middle" fontSize={12} fill={stroke} fontWeight={600}>M</text></g>;
    case "pump": return <g><circle cx={x} cy={y} r={16} fill={fill} stroke={stroke} strokeWidth={sw} /><path d={`M${x - 8},${y + 8} L${x},${y - 10} L${x + 8},${y + 8}`} fill="none" stroke={stroke} strokeWidth={1.2} /></g>;
    case "valve": return <path d={`M${x - 14},${y - 10} L${x + 14},${y + 10} L${x + 14},${y - 10} L${x - 14},${y + 10} Z`} fill={fill} stroke={stroke} strokeWidth={sw} />;
    case "sensor": return <g><circle cx={x} cy={y} r={9} fill={fill} stroke={stroke} strokeWidth={sw} /><circle cx={x} cy={y} r={3} fill={stroke} /></g>;
    case "safety": return <g><circle cx={x} cy={y} r={12} fill="#7f1d1d" stroke="#dc2626" strokeWidth={sw} /></g>;
    case "gear": return <g><circle cx={x} cy={y} r={16} fill={fill} stroke={stroke} strokeWidth={sw} strokeDasharray="4 3" /></g>;
  }
}

export function TwinSchematic({ twin, selected, onSelect, showLabels }: { twin: TwinPayload; selected: string | null; onSelect: (id: string) => void; showLabels: boolean }) {
  const byId = Object.fromEntries(twin.components.map((c) => [c.id, c]));
  const flowPts = twin.flow.map((id) => byId[id]).filter(Boolean).map((c) => `${(c.x / 100) * W},${(c.y / 100) * H}`);
  const sel = selected ? byId[selected] : null;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full" role="img" aria-label="2D-Schema der Anlage">
      <defs>
        <pattern id="g" width="25" height="25" patternUnits="userSpaceOnUse"><path d="M25 0H0V25" fill="none" stroke="rgba(180,190,204,.05)" /></pattern>
      </defs>
      <rect width={W} height={H} fill="url(#g)" />
      <polyline points={flowPts.join(" ")} fill="none" stroke="#5a8fa3" strokeOpacity={0.35} strokeWidth={3} strokeDasharray="8 6">
        <animate attributeName="stroke-dashoffset" from="28" to="0" dur={`${Math.max(0.4, 2.4 - twin.speedPercent / 50)}s`} repeatCount="indefinite" />
      </polyline>
      {twin.components.map((c) => (
        <g key={c.id} onClick={() => onSelect(c.id)} style={{ cursor: "pointer" }}>
          <Glyph c={c} selected={selected === c.id} />
          {showLabels && (
            <text x={(c.x / 100) * W} y={(c.y / 100) * H + (c.kind === "station" || c.kind === "tunnel" ? 50 : c.kind === "sensor" ? -16 : 36)} textAnchor="middle" fontSize={11} fill="#c4ccd6">
              {shortComponentLabel(c.label)}
            </text>
          )}
        </g>
      ))}
      {sel?.plcTag && (
        <g pointerEvents="none">
          <rect x={(sel.x / 100) * W + 22} y={(sel.y / 100) * H - 34} width={130} height={20} rx={3} fill="rgba(15,20,30,.85)" stroke="#5a8fa3" strokeWidth={0.8} />
          <text x={(sel.x / 100) * W + 30} y={(sel.y / 100) * H - 20} fontSize={10} fontFamily="var(--font-geist-mono)" fill="#7eb6c9">{`${sel.plcTag} · ${sel.plcAddress}`.slice(0, 22)}</text>
        </g>
      )}
    </svg>
  );
}
