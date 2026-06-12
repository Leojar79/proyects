export default function MetricCard({ title, value, subtitle, icon: Icon, color = "blue" }) {
  const colors = {
    blue: "bg-blue-50 text-blue-600 border-blue-200",
    green: "bg-green-50 text-green-600 border-green-200",
    purple: "bg-purple-50 text-purple-600 border-purple-200",
    orange: "bg-orange-50 text-orange-600 border-orange-200",
  };

  return (
    <div className={`rounded-xl border p-5 ${colors[color]}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium opacity-70">{title}</span>
        {Icon && <Icon size={20} />}
      </div>
      <div className="text-3xl font-bold">{value ?? "—"}</div>
      {subtitle && <div className="text-xs mt-1 opacity-60">{subtitle}</div>}
    </div>
  );
}
