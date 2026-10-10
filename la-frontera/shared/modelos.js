// Los tres cerebros y sus precios. Los precios se copian dentro de cada corrida del
// benchmark, así el video siempre muestra los precios con los que se calculó el costo.
// ANTES DE PUBLICAR: confirma los precios marcados `verificado: false` en la página oficial.

export const PROVEEDORES = [
  {
    id: 'gpt',
    nombre: 'GPT Astra',
    empresa: 'OpenAI',
    // Se puede cambiar con la variable de entorno OPENAI_MODEL.
    modelo: 'gpt-astra',
    color: '#19c37d',
    precio: {
      entradaPorMTok: 10,
      entradaCacheadaPorMTok: 1,
      salidaPorMTok: 50,
      fuente: 'Finout y OpenRouter (no es la página oficial de OpenAI). Verificar en https://openai.com/api/pricing',
      verificado: false,
      fecha: '2026-10-10',
    },
    // Esfuerzo de razonamiento mínimo razonable, igual que Opus, para no inflar su costo.
    opciones: { reasoningEffort: 'low' },
  },
  {
    id: 'opus',
    nombre: 'Claude Opus 5.5',
    empresa: 'Anthropic',
    modelo: 'claude-opus-5-5',
    color: '#e07a4f',
    precio: {
      entradaPorMTok: 4,
      entradaCacheadaPorMTok: 0.2,
      salidaPorMTok: 20,
      fuente: 'Tabla de precios de la API de Anthropic (2026-10-06)',
      verificado: true,
      fecha: '2026-10-06',
    },
    // En Opus 5.5 el razonamiento no se puede apagar; "low" es el mínimo.
    opciones: { effort: 'low' },
  },
  {
    id: 'jev',
    nombre: 'Jev',
    empresa: 'TypeSafe',
    // Se puede cambiar con la variable de entorno TYPESAFE_MODEL.
    modelo: 'jev-latest',
    color: '#4f7cff',
    precio: {
      entradaPorMTok: 0.042,
      entradaCacheadaPorMTok: 0.042,
      salidaPorMTok: 0,
      fuente: 'Agregadores (flaviocopes.com, eesel.ai, OpenRouter); TypeSafe no publica página de precios. Verificar en https://docs.typesafe.ai',
      verificado: false,
      fecha: '2026-10-10',
    },
    opciones: {},
  },
]

export function proveedorPorId(id) {
  return PROVEEDORES.find((p) => p.id === id)
}

// Costo en USD de una llamada según los tokens reportados.
export function calcularCosto(precio, tokens) {
  const cacheados = tokens.entradaCacheada ?? 0
  const entradaNormal = Math.max(0, (tokens.entrada ?? 0) - cacheados)
  return (
    (entradaNormal * precio.entradaPorMTok +
      cacheados * (precio.entradaCacheadaPorMTok ?? precio.entradaPorMTok) +
      (tokens.salida ?? 0) * precio.salidaPorMTok) /
    1_000_000
  )
}
