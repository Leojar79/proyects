import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Cell
} from "recharts";
import {
  MessageSquare, Users, Clock, Star, TrendingUp, BookOpen
} from "lucide-react";
import MetricCard from "./MetricCard";

const COLORS = ["#2563eb", "#7c3aed", "#059669", "#d97706", "#dc2626"];

export default function Dashboard({ metrics, fileName }) {
  if (!metrics) return null;

  const {
    totalInteractions,
    uniqueUsers,
    uniqueSessions,
    avgSatisfaction,
    avgResponseTime,
    dailyUsage,
    topUsers,
    topTopics,
    hourlyUsage,
    detectedColumns,
  } = metrics;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold text-gray-800">Dashboard de Usabilidad</h2>
          <p className="text-sm text-gray-500 mt-1">Agente Siigo — {fileName}</p>
        </div>
        {detectedColumns.length > 0 && (
          <div className="text-xs text-gray-400 text-right">
            <div className="font-medium mb-1">Columnas detectadas:</div>
            {detectedColumns.map(({ field, column }) => (
              <div key={field}>
                <span className="text-gray-500">{field}:</span> {column}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <MetricCard
          title="Total Interacciones"
          value={totalInteractions.toLocaleString()}
          icon={MessageSquare}
          color="blue"
        />
        <MetricCard
          title="Usuarios Únicos"
          value={uniqueUsers?.toLocaleString() ?? "—"}
          icon={Users}
          color="purple"
        />
        <MetricCard
          title="Sesiones"
          value={uniqueSessions?.toLocaleString() ?? "—"}
          icon={TrendingUp}
          color="green"
        />
        <MetricCard
          title="Satisfacción Prom."
          value={avgSatisfaction ? avgSatisfaction.toFixed(1) : "—"}
          subtitle={avgSatisfaction ? "/ 5.0" : "sin datos"}
          icon={Star}
          color="orange"
        />
      </div>

      {avgResponseTime && (
        <div className="grid grid-cols-1 gap-4">
          <MetricCard
            title="Tiempo de Respuesta Prom."
            value={`${avgResponseTime.toFixed(0)}ms`}
            icon={Clock}
            color="blue"
          />
        </div>
      )}

      {/* Uso diario */}
      {dailyUsage.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-semibold text-gray-700 mb-4 flex items-center gap-2">
            <TrendingUp size={16} /> Interacciones por Día
          </h3>
          <ResponsiveContainer width="100%" height={220}>
            <LineChart data={dailyUsage}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Line type="monotone" dataKey="count" stroke="#2563eb" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Usuarios más activos */}
        {topUsers.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="font-semibold text-gray-700 mb-4 flex items-center gap-2">
              <Users size={16} /> Top Asesores
            </h3>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={topUsers} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis dataKey="user" type="category" tick={{ fontSize: 10 }} width={100} />
                <Tooltip />
                <Bar dataKey="count" fill="#7c3aed" radius={[0, 4, 4, 0]}>
                  {topUsers.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Temas más consultados */}
        {topTopics.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 p-5">
            <h3 className="font-semibold text-gray-700 mb-4 flex items-center gap-2">
              <BookOpen size={16} /> Temas Más Consultados
            </h3>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={topTopics} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis type="number" tick={{ fontSize: 11 }} />
                <YAxis dataKey="topic" type="category" tick={{ fontSize: 10 }} width={120} />
                <Tooltip />
                <Bar dataKey="count" fill="#059669" radius={[0, 4, 4, 0]}>
                  {topTopics.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Actividad por hora */}
      {hourlyUsage.some((h) => h.count > 0) && (
        <div className="bg-white rounded-xl border border-gray-200 p-5">
          <h3 className="font-semibold text-gray-700 mb-4 flex items-center gap-2">
            <Clock size={16} /> Actividad por Hora del Día
          </h3>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={hourlyUsage}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="hour" tick={{ fontSize: 10 }} interval={1} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Bar dataKey="count" fill="#2563eb" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
