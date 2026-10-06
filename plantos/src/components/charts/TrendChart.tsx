"use client";

import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceArea } from "recharts";
import { timeDe } from "@/lib/format";

export interface TrendSeries {
  key: string;
  label: string;
  color: string;
  unit?: string;
}

export function TrendChart({ data, series, height = 180, bands = [], showSeconds = false, yDomain }: {
  data: object[];
  series: TrendSeries[];
  height?: number;
  bands?: { from: number; to: number }[];
  showSeconds?: boolean;
  yDomain?: [number | string, number | string];
}) {
  return (
    <div style={{ height }} className="w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: -18 }}>
          <CartesianGrid stroke="rgba(180,190,204,0.07)" vertical={false} />
          <XAxis dataKey="ts" type="number" domain={["dataMin", "dataMax"]} scale="time" tickFormatter={(t) => timeDe(t, showSeconds)} tick={{ fill: "#8b93a0", fontSize: 10 }} stroke="#1c2430" minTickGap={40} />
          <YAxis tick={{ fill: "#8b93a0", fontSize: 10 }} stroke="#1c2430" width={44} domain={yDomain ?? ["auto", "auto"]} allowDecimals={false} />
          <Tooltip
            contentStyle={{ background: "#11161e", border: "1px solid #1c2430", borderRadius: 4, fontSize: 11 }}
            labelFormatter={(t) => timeDe(Number(t), true)}
            formatter={(v, name) => {
              const s = series.find((x) => x.key === name);
              return [`${Number(v).toLocaleString("de-DE", { maximumFractionDigits: 2 })}${s?.unit ? " " + s.unit : ""}`, s?.label ?? String(name)];
            }}
          />
          {bands.map((b, i) => (
            <ReferenceArea key={i} x1={b.from} x2={b.to} fill="#c9a227" fillOpacity={0.12} stroke="none" />
          ))}
          {series.map((s) => (
            <Line key={s.key} dataKey={s.key} stroke={s.color} dot={false} strokeWidth={1.5} isAnimationActive={false} />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
