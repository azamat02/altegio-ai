interface KPIProps {
  label: string;
  value: string;
}

export function KPI({ label, value }: KPIProps) {
  return (
    <div className="kpi">
      <div className="kpi__label">{label}</div>
      <div className="kpi__value num">{value}</div>
    </div>
  );
}
