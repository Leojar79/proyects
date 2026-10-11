// Momentos (segundos) en que aparece cada cosa en la composición "simulación", sincronizados con
// la voz grabada (sim/voz.json: inicio y fin de cada frase). Cada elemento entra cuando la voz lo
// nombra. Si se vuelve a grabar la voz, se ajustan aquí (render/simulacion.test.mjs verifica que
// cada momento caiga dentro de su sección).
//
// Sin imports a propósito: lo leen la app y las pruebas de Node.

export const T = {
  // gancho (0 - 8.2): «Tres inteligencias artificiales. Un mismo trabajo: cuidar una frontera.
  // Y el mismo presupuesto para cada una. ¿Cuál aguantaría más?»
  titulo: 0.08,
  cerebros: [0.62, 1.05, 1.48],
  trabajo: 2.2,
  presupuesto: 4.55,
  selloCual: 6.94,

  // quees (8.2 - 17.2): «Armé una simulación de cómo funcionarían GPT-6 Astra, Claude Opus 5.5 y Jev
  // en un juego estilo Papers, Please.»
  simulacion: 8.58,
  columnas: { gpt: 10.5, opus: 12.19, jev: 14.3 },
  papers: 15.0,

  // decisiones (17.2 - 26.8): «Llega un viajero y hay que decidir cuatro cosas: ¿puede pasar?,
  // ¿está mintiendo?, ¿qué tan peligroso es? y ¿qué hacemos con él?»
  viajero: 17.5,
  cuatro: 19.15,
  preguntas: [20.44, 21.6, 23.38, 25.0],

  // comoresponde (26.8 - 43.2)
  generativos: 27.23, // «GPT y Opus son modelos generativos:»
  razonan: 29.92, // «razonan y escriben su respuesta.»
  escriben: 30.75,
  cobra: 32.17, // «Y se cobra cada token,
  razonamientoInterno: 33.7, //  incluido ese razonamiento interno.»
  jev: 35.75, // «En cambio, Jev funciona distinto:
  noEscribe: 37.55, //  no escribe.»
  decision: 39.9, // «Lee el caso y devuelve directamente la decisión,
  seguridad: 41.15, //  con qué tan seguro está.»

  // juego (43.2 - 50.8): «Mismo viajero, misma información, mismas preguntas para las tres.
  // Lo que cambia es cuánto cuesta cada decisión.»
  mismoViajero: 43.6,
  mismaInfo: 44.65,
  mismasPreguntas: 45.6,
  selloEjemplo: 46.55,
  cuantoCuesta: 47.9,

  // numeros (50.8 - 71.3)
  precios: 51.26, // «Con los precios publicados de cada API, una decisión así costaría más o menos
  costo: { gpt: 55.71, opus: 57.6, jev: 59.55 }, // «un centavo y medio con GPT, medio centavo con Opus… y con Jev, unas milésimas de centavo.»
  presupuestoSim: 61.9, // «Eso quiere decir: con 25 centavos,
  drenado: 63.1,
  agotado: { gpt: 66.1, opus: 68.0, jev: 69.85 }, // «GPT atendería unos 15 viajeros, Opus unos 40… y Jev, miles de viajeros.»

  // aclaracion (71.3 - 84.2)
  aclaraciones: [71.68, 75.49, 77.99, 81.29],
  tabla: 72.7,

  // cierre (84.2 - 93)
  conclusion: 84.77, // «Mi conclusión:
  crear: 85.99, //  los modelos generativos sirven para crear.
  decidir: 88.56, //  Jev, para decidir.»
  info: 89.75, // termina la voz: la conclusión sube y aparecen fuentes, supuestos, método y marcas
  tituloFinal: 90.9,
}

// Sección a la que pertenece cada grupo de momentos (para las pruebas).
export const SECCION_DE = {
  titulo: 'gancho',
  cerebros: 'gancho',
  trabajo: 'gancho',
  presupuesto: 'gancho',
  selloCual: 'gancho',
  simulacion: 'quees',
  columnas: 'quees',
  papers: 'quees',
  viajero: 'decisiones',
  cuatro: 'decisiones',
  preguntas: 'decisiones',
  generativos: 'comoresponde',
  razonan: 'comoresponde',
  escriben: 'comoresponde',
  cobra: 'comoresponde',
  razonamientoInterno: 'comoresponde',
  jev: 'comoresponde',
  noEscribe: 'comoresponde',
  decision: 'comoresponde',
  seguridad: 'comoresponde',
  mismoViajero: 'juego',
  mismaInfo: 'juego',
  mismasPreguntas: 'juego',
  selloEjemplo: 'juego',
  cuantoCuesta: 'juego',
  precios: 'numeros',
  costo: 'numeros',
  presupuestoSim: 'numeros',
  drenado: 'numeros',
  agotado: 'numeros',
  aclaraciones: 'aclaracion',
  tabla: 'aclaracion',
  conclusion: 'cierre',
  crear: 'cierre',
  decidir: 'cierre',
  info: 'cierre',
  tituloFinal: 'cierre',
}
