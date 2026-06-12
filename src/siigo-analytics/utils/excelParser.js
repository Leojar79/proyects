import * as XLSX from "xlsx";

// Normaliza nombres de columna a snake_case
function normalizeKey(key) {
  return key
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

export function parseExcelBuffer(buffer) {
  const workbook = XLSX.read(buffer, { type: "array", cellDates: true });
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const raw = XLSX.utils.sheet_to_json(sheet, { defval: null });

  return raw.map((row) => {
    const normalized = {};
    for (const key of Object.keys(row)) {
      normalized[normalizeKey(key)] = row[key];
    }
    return normalized;
  });
}

export function extractMetrics(rows) {
  if (!rows.length) return null;

  const columns = Object.keys(rows[0]);

  // Detecta columnas relevantes de forma flexible
  const col = {
    fecha: columns.find((c) => /fecha|date|timestamp|created/i.test(c)),
    usuario: columns.find((c) => /usuario|user|asesor|email/i.test(c)),
    pregunta: columns.find((c) => /pregunta|question|query|consulta/i.test(c)),
    respuesta: columns.find((c) => /respuesta|response|answer/i.test(c)),
    sesion: columns.find((c) => /sesion|session|conversation/i.test(c)),
    satisfaccion: columns.find((c) => /satisfac|rating|score|calificac/i.test(c)),
    tiempo: columns.find((c) => /tiempo|time|duracion|duration|latency/i.test(c)),
    tema: columns.find((c) => /tema|topic|categoria|category/i.test(c)),
  };

  // Total de interacciones
  const totalInteractions = rows.length;

  // Usuarios únicos
  const uniqueUsers = col.usuario
    ? new Set(rows.map((r) => r[col.usuario]).filter(Boolean)).size
    : null;

  // Sesiones únicas
  const uniqueSessions = col.sesion
    ? new Set(rows.map((r) => r[col.sesion]).filter(Boolean)).size
    : null;

  // Interacciones por día
  const byDay = {};
  if (col.fecha) {
    rows.forEach((r) => {
      const raw = r[col.fecha];
      if (!raw) return;
      const d = raw instanceof Date ? raw : new Date(raw);
      if (isNaN(d)) return;
      const key = d.toISOString().slice(0, 10);
      byDay[key] = (byDay[key] || 0) + 1;
    });
  }
  const dailyUsage = Object.entries(byDay)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, count]) => ({ date, count }));

  // Usuarios más activos (top 10)
  const userCounts = {};
  if (col.usuario) {
    rows.forEach((r) => {
      const u = r[col.usuario];
      if (u) userCounts[u] = (userCounts[u] || 0) + 1;
    });
  }
  const topUsers = Object.entries(userCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([user, count]) => ({ user, count }));

  // Temas / categorías más consultados
  const topicCounts = {};
  if (col.tema) {
    rows.forEach((r) => {
      const t = r[col.tema];
      if (t) topicCounts[t] = (topicCounts[t] || 0) + 1;
    });
  }
  const topTopics = Object.entries(topicCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([topic, count]) => ({ topic, count }));

  // Satisfacción promedio
  let avgSatisfaction = null;
  if (col.satisfaccion) {
    const scores = rows
      .map((r) => parseFloat(r[col.satisfaccion]))
      .filter((n) => !isNaN(n));
    if (scores.length) avgSatisfaction = scores.reduce((a, b) => a + b, 0) / scores.length;
  }

  // Tiempo de respuesta promedio
  let avgResponseTime = null;
  if (col.tiempo) {
    const times = rows
      .map((r) => parseFloat(r[col.tiempo]))
      .filter((n) => !isNaN(n));
    if (times.length) avgResponseTime = times.reduce((a, b) => a + b, 0) / times.length;
  }

  // Actividad por hora del día
  const byHour = Array(24).fill(0);
  if (col.fecha) {
    rows.forEach((r) => {
      const raw = r[col.fecha];
      if (!raw) return;
      const d = raw instanceof Date ? raw : new Date(raw);
      if (!isNaN(d)) byHour[d.getHours()]++;
    });
  }
  const hourlyUsage = byHour.map((count, hour) => ({ hour: `${hour}:00`, count }));

  // Columnas detectadas para info
  const detectedColumns = Object.entries(col)
    .filter(([, v]) => v)
    .map(([k, v]) => ({ field: k, column: v }));

  return {
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
    allColumns: columns,
  };
}
