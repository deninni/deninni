export function Kpi({ label, value, unit, hint }: { label: string; value: string | number; unit?: string; hint?: string }) {
  return (
    <div>
      <div className="label-section">{label}</div>
      <div className="mt-1 text-lg font-semibold tabular-nums">
        {value}
        {unit && <span className="ml-1 text-[12px] font-normal text-muted">{unit}</span>}
      </div>
      {hint && <div className="mt-0.5 text-[11px] text-muted">{hint}</div>}
    </div>
  );
}
