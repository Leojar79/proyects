import { Zap, Users, Activity, TrendingUp } from 'lucide-react';

function Kpi({ icon: Icon, label, value, color }) {
  return (
    <div className="kpi-card" style={{ borderTop: `4px solid ${color}` }}>
      <div className="kpi-icon" style={{ color }}><Icon size={22} /></div>
      <div>
        <p className="kpi-label">{label}</p>
        <p className="kpi-value">{value}</p>
      </div>
    </div>
  );
}

export default function KpiCards({ records, agents }) {
  const totalCredits = records.reduce((s, r) => s + r.credits, 0);
  const totalInteractions = records.reduce((s, r) => s + (r.interactions ?? 0), 0);

  const months = [...new Set(records.map((r) => r.month))].sort();
  let trend = '--';
  if (months.length >= 2) {
    const last = months[months.length - 1];
    const prev = months[months.length - 2];
    const lastC = records.filter((r) => r.month === last).reduce((s, r) => s + r.credits, 0);
    const prevC = records.filter((r) => r.month === prev).reduce((s, r) => s + r.credits, 0);
    if (prevC > 0) {
      const pct = (((lastC - prevC) / prevC) * 100).toFixed(1);
      trend = `${pct > 0 ? '+' : ''}${pct}%`;
    }
  }

  return (
    <div className="kpi-grid">
      <Kpi icon={Zap} label="Créditos totales" value={totalCredits.toLocaleString()} color="#6366f1" />
      <Kpi icon={Users} label="Agentes activos" value={agents.length} color="#0ea5e9" />
      <Kpi icon={Activity} label="Interacciones totales" value={totalInteractions.toLocaleString()} color="#10b981" />
      <Kpi icon={TrendingUp} label="Variación último mes" value={trend} color="#f59e0b" />
    </div>
  );
}
