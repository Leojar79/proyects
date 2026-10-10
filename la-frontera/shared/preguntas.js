// Reglas del mundo y las cuatro preguntas que responde cada cerebro.
// Es la ÚNICA fuente de verdad: el benchmark, el juego y el guion la importan,
// así las tres IAs reciben exactamente el mismo texto.

export const PAIS = 'Valdoria'
export const FECHA_PUESTO = '15/03/1984'

export const BUSCADOS = ['Dmitri Kassel', 'Mara Voss', 'Teodor Brun']

export const REGLAS = [
  `Eres el guardia del puesto fronterizo de la República de ${PAIS}. Hoy es ${FECHA_PUESTO}.`,
  '1. Todo viajero necesita un pasaporte vigente. Si vence hoy o después, es válido; si venció antes de hoy, no.',
  `2. Los ciudadanos de ${PAIS} no necesitan permiso de entrada. Los extranjeros necesitan un permiso de entrada válido.`,
  '3. El motivo del viaje que dice el viajero debe coincidir con el tipo de permiso.',
  '4. Está prohibido entrar con armas (declaradas o no) y con mercancía de contrabando sin declarar.',
  `5. Personas buscadas por la justicia: ${BUSCADOS.join(', ')}.`,
  '6. Si el nombre del pasaporte no coincide con el del permiso, el documento es falso.',
  '7. Si aplica más de una acción, manda la más grave: arrestar > rechazar > interrogar > aprobar.',
]

export const ACCIONES = ['aprobar', 'rechazar', 'interrogar', 'arrestar']

export const NIVELES_PELIGRO = ['Inofensivo', 'Bajo', 'Moderado', 'Alto', 'Extremo']

export const PREGUNTAS = {
  pasa: {
    tipo: 'noul',
    instrucciones: '¿Se le debe permitir la entrada a este viajero según las reglas?',
  },
  miente: {
    tipo: 'noul',
    instrucciones: '¿El viajero miente o lo que dice contradice sus documentos o la inspección?',
  },
  peligro: {
    tipo: 'score',
    instrucciones: '¿Qué nivel de peligro representa este viajero para el país?',
    criterios: NIVELES_PELIGRO,
  },
  accion: {
    tipo: 'choice',
    instrucciones: '¿Qué debe hacer el guardia con este viajero?',
    criterios: {
      aprobar: 'Pasaporte vigente, permiso válido (o ciudadano), motivo que coincide e inspección limpia: puede entrar.',
      rechazar: 'Pasaporte vencido o extranjero sin permiso, sin ninguna amenaza: se le niega la entrada.',
      interrogar: 'Documentos vigentes, pero el motivo que dice no coincide con su permiso o hay una contradicción menor sin peligro: enviarlo a entrevista.',
      arrestar: 'Persona buscada, documento falso, armas o contrabando sin declarar: detenerlo.',
    },
  },
}

function lineaPermiso(doc) {
  if (doc.permiso === null) return 'No requiere (ciudadano)'
  if (doc.permiso === 'ninguno') return 'No presenta permiso'
  const nombre = doc.permisoNombre && doc.permisoNombre !== doc.nombre
    ? ` — a nombre de ${doc.permisoNombre}`
    : ''
  return `Sí, tipo "${doc.permiso}"${nombre}`
}

// Texto que reciben las tres IAs (para Jev es el `state`; para GPT y Opus, el mensaje del usuario).
export function textoEstado(viajero) {
  const d = viajero.documento
  return [
    'REGLAS DE LA FRONTERA',
    ...REGLAS,
    '',
    'DOCUMENTOS DEL VIAJERO',
    `- Nombre en el pasaporte: ${d.nombre}`,
    `- Nacionalidad: ${d.nacionalidad}`,
    `- Pasaporte vence: ${d.vence}`,
    `- Permiso de entrada: ${lineaPermiso(d)}`,
    `- Equipaje declarado: ${d.equipajeDeclarado}`,
    `- Resultado de la inspección: ${d.inspeccion}`,
    '',
    'LO QUE DICE EL VIAJERO',
    `"${viajero.dice}"`,
  ].join('\n')
}

// Esquema JSON que deben cumplir GPT y Opus (salida estructurada, sin texto extra).
export function esquemaJSON() {
  return {
    type: 'object',
    properties: {
      pasa: { type: 'boolean', description: PREGUNTAS.pasa.instrucciones },
      miente: { type: 'boolean', description: PREGUNTAS.miente.instrucciones },
      peligro: {
        type: 'integer',
        description: `${PREGUNTAS.peligro.instrucciones} 0=${NIVELES_PELIGRO.map((n, i) => `${i} ${n}`).join(', ')}`,
        enum: [0, 1, 2, 3, 4],
      },
      accion: {
        type: 'string',
        description: PREGUNTAS.accion.instrucciones,
        enum: ACCIONES,
      },
    },
    required: ['pasa', 'miente', 'peligro', 'accion'],
    additionalProperties: false,
  }
}

// Instrucción de sistema para GPT y Opus. Pide SOLO la decisión (mismo trabajo que Jev),
// sin explicaciones, para que la comparación no infle artificialmente su costo.
export function promptSistemaLLM() {
  const acciones = Object.entries(PREGUNTAS.accion.criterios)
    .map(([k, v]) => `- ${k}: ${v}`)
    .join('\n')
  return [
    'Evalúas viajeros en un puesto fronterizo. Recibirás las reglas, los documentos y lo que dice el viajero.',
    'Responde únicamente con el objeto JSON pedido, sin explicaciones.',
    `pasa: ${PREGUNTAS.pasa.instrucciones}`,
    `miente: ${PREGUNTAS.miente.instrucciones}`,
    `peligro: ${PREGUNTAS.peligro.instrucciones} Entero de 0 a 4: ${NIVELES_PELIGRO.map((n, i) => `${i}=${n}`).join(', ')}.`,
    `accion: ${PREGUNTAS.accion.instrucciones}`,
    acciones,
  ].join('\n')
}

// Preguntas en el formato de la API de Jev (POST /v1/systemone).
export function preguntasJev() {
  return {
    pasa: { type: 'noul', instructions: PREGUNTAS.pasa.instrucciones },
    miente: { type: 'noul', instructions: PREGUNTAS.miente.instrucciones },
    peligro: { type: 'score', instructions: PREGUNTAS.peligro.instrucciones, criteria: NIVELES_PELIGRO },
    accion: { type: 'choice', instructions: PREGUNTAS.accion.instrucciones, criteria: PREGUNTAS.accion.criterios },
  }
}
