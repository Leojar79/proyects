import {
  ResponsiveContainer,
  BarChart, Bar,
  LineChart, Line,
  PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from 'recharts';

const COLORS = ['#6366f1','#0ea5e9','#10b981','#f59e0b','#ef4444','#a855f7','#ec4899','#14b8a6'];

function monthLabel(m) {
  const [y, mo] = m.split('-');
  const names = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
  return `${names[Number(mo) - 1]} ${y}`;
}

export function CreditsPerMonthChart({ records, agents }) {
  const months = [...new Set(records.map((r) => r.month))].sort();
  const data = months.map((m) => {
    const row = { month: monthLabel(m) };
    agents.forEach((a) => {
      const rec = records.find((r) => r.agent === a && r.month === m);
      row[a] = rec ? rec.credits : 0;
    });
    return row;
  });

  if (!data.length) return <p className="empty-msg">Sin datos para mostrar.</p>;

  return (
    <ResponsiveContainer width="100%" height={280}>
      <BarChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
        <XAxis dataKey="month" tick={{ fill: '#94a3b8', fontSize: 12 }} />
        <YAxis tick={{ fill: '#94a3b8', fontSize: 12 }} />
        <Tooltip contentStyle={{ background: '#1e293b', border: 'none', borderRadius: 8, color: '#f1f5f9' }} />
        <Legend wrapperStyle={{ color: '#94a3b8', fontSize: 12 }} />
        {agents.map((a, i) => <Bar key={a} dataKey={a} fill={COLORS[i % COLORS.length]} radius={[4,4,0,0]} />)}
      </BarChart>
    </ResponsiveContainer>
  );
}

export function TrendLineChart({ records, agents }) {
  const months = [...new Set(records.map((r) => r.month))].sort();
  const data = months.map((m) => {
    const row = { month: monthLabel(m) };
    agents.forEach((a) => {
      const rec = records.find((r) => r.agent === a && r.month === m);
      row[a] = rec ? rec.credits : null;
    });
    return row;
  });

  if (!data.length) return <p className="empty-msg">Sin datos para mostrar.</p>;

  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#334155" />
        <XAxis dataKey="month" tick={{ fill: '#94a3b8', fontSize: 12 }} />
        <YAxis tick={{ fill: '#94a3b8', fontSize: 12 }} />
        <Tooltip contentStyle={{ background: '#1e293b', border: 'none', borderRadius: 8, color: '#f1f5f9' }} />
        <Legend wrapperStyle={{ color: '#94a3b8', fontSize: 12 }} />
        {agents.map((a, i) => (
          <Line key={a} type="monotone" dataKey={a} stroke={COLORS[i % COLORS.length]}
            strokeWidth={2} dot={{ r: 4 }} connectNulls />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

export function AgentSharePieChart({ records, agents }) {
  const data = agents.map((a) => ({
    name: a,
    value: records.filter((r) => r.agent === a).reduce((s, r) => s + r.credits, 0),
  })).filter((d) => d.value > 0);

  if (!data.length) return <p className="empty-msg">Sin datos para mostrar.</p>;

  return (
    <ResponsiveContainer width="100%" height={280}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`} labelLine={{ stroke: '#94a3b8' }}>
          {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
        </Pie>
        <Tooltip contentStyle={{ background: '#1e293b', border: 'none', borderRadius: 8, color: '#f1f5f9' }} />
      </PieChart>
    </ResponsiveContainer>
  );
}
