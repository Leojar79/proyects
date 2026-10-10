// Guion de la voz en off: qué se dice en cada tramo del video, elegido a partir de los datos.
// Contrato: segmentosGuion(estadisticas) -> [{ inicio, fin, escena, texto, enPantalla }]
// `estadisticas` es lo que devuelve calcularEstadisticas() de shared/juego.js.
//
// Reglas:
// - Ninguna frase afirma algo que los datos no muestren: cada dato (quién duró más, quién es más
//   barato, quién acertó más, cuántas llegaron al final...) se lee de `estadisticas`.
// - Toda afirmación de "gana" / "el más X" / "empate" sale de `estadisticas.ganadores`
//   (calcularGanadores de shared/juego.js, con la regla de empates): la misma que pone las coronas
//   MEJOR en la pantalla de resultados. Este archivo no decide ganadores por su cuenta.
// - La conclusión "Jev, para decidir" solo se dice si `estadisticas.jevRecomendable` (igual que la
//   pantalla del cierre); si no, una frase neutra que sale de los ganadores.
// - La divulgación (PUBLICACION.divulgacion) se dice siempre que exista. Si no cabe en el ritmo,
//   se lanza un error: nunca se omite en silencio.
// - Ritmo máximo: RITMO_MAXIMO palabras por segundo en cada tramo. Los números cuentan como se
//   leen en voz alta ("35" = "treinta y cinco" = 3 palabras). Cada frase tiene variantes de más
//   larga a más corta; se usa la primera que cabe. Si ninguna cabe, se lanza un error.
// - La voz acompaña lo que se ve: los tramos siguen las escenas de shared/timeline.js y, en el
//   avance rápido, cada GAME OVER se comenta justo después de que aparece en pantalla.
//
// Funciones puras, sin dependencias: lo usan el navegador (subtítulos) y Node (GUION.md, .srt).

import { PUBLICACION } from './config.js'
import { entero, factor, segundos, usd } from './formato.js'
import { EMPATE_ACIERTOS, EMPATE_COSTO } from './juego.js'
import { COLA_RAPIDO, DURACION, ESCENAS, VIAJEROS_DETALLE } from './timeline.js'

// Alcance de la comparación (A3 de la auditoría): solo modelos insignia. Lo usan la voz y GUION.md.
export const FRASE_INSIGNIA = 'Comparé contra modelos insignia; hay opciones más baratas.'
const FRASE_INSIGNIA_CORTA = 'Comparé solo con modelos insignia.'

export const RITMO_MAXIMO = 2.5 // palabras por segundo
const RITMO_HOLGADO = 2.0 // para decidir cuánto dura un tramo con poco texto
const PAUSA_FINAL = 0.4 // respiro al final de cada frase (s)
const REACCION = 0.25 // la voz comenta un GAME OVER un instante después de verlo (s)
const AGRUPAR = 1.8 // dos GAME OVER más juntos que esto se comentan en una sola frase (s)
const RELLENO_MIN = 3.0 // hueco mínimo en el avance rápido para agregar un comentario (s)
const LOCALE = 'es-419'

// Tiempos internos de las escenas de la app (src/escenas/*.jsx), relativos al inicio de cada escena.
// Si cambian allá, conviene cambiarlos aquí para que la voz siga cayendo sobre lo que se ve.
const PARTES_PRESENTACION = [0, 3.4, 6.8] // cuatro decisiones · cómo responde cada cerebro · reglas
const FILA_RESULTADOS = (k) => 0.9 + k * 1.75 // duración, costo, costo x mil, velocidad, aciertos
const BANNER_RESULTADOS = 9.7 // "X veces más barato"
// La voz pasa de la frase final a las fuentes (divulgación, alcance). La frase final cabe en 3.6 s
// (9 palabras) y deja 4 s (10 palabras) para la divulgación y el alcance de la comparación.
const LINEA2_CIERRE = 3.6

const ESC = Object.fromEntries(ESCENAS.map((e) => [e.id, e]))

// ---------------------------------------------------------------------------
// Conteo de palabras (como se leen en voz alta)

const NUMERO = /^(\d{1,3}(,\d{3})+|\d+)(\.\d+)?$/

function palabrasEntero(n) {
  if (n < 30) return 1 // cero..veintinueve: una palabra (dieciséis, veintiuno...)
  if (n < 100) return n % 10 === 0 ? 1 : 3 // "treinta" / "treinta y cinco"
  if (n < 1000) return 1 + (n % 100 ? palabrasEntero(n % 100) : 0) // "cien", "setecientos setenta"
  if (n < 1e6) {
    const miles = Math.floor(n / 1000)
    return (miles === 1 ? 1 : palabrasEntero(miles) + 1) + (n % 1000 ? palabrasEntero(n % 1000) : 0)
  }
  return palabrasEntero(Math.floor(n / 1e6)) + 1 + (n % 1e6 ? palabrasEntero(n % 1e6) : 0)
}

function palabrasNumero(token) {
  const [ent, dec] = token.replace(/,/g, '').split('.')
  let total = palabrasEntero(Number(ent))
  if (dec) {
    const ceros = dec.match(/^0*/)[0].length
    total += 1 + ceros + (dec.length > ceros ? palabrasEntero(Number(dec.slice(ceros))) : 0) // "punto ..."
  }
  return total
}

// { escritas, habladas }: palabras tal como están escritas y como se pronuncian.
export function contarPalabras(texto) {
  let escritas = 0
  let habladas = 0
  for (const crudo of String(texto ?? '').split(/\s+/)) {
    const t = crudo.replace(/^[¿¡"“'(«—–-]+/, '').replace(/[?!"”'),.;:»—–-]+$/, '')
    if (t === '%') {
      escritas++
      habladas += 2 // "por ciento"
      continue
    }
    if (!t || !/[\p{L}\p{N}]/u.test(t)) continue
    escritas++
    habladas += NUMERO.test(t) ? palabrasNumero(t) : 1
  }
  return { escritas, habladas }
}

// Palabras habladas por segundo de un tramo.
export function ritmoTramo(seg) {
  const dur = seg.fin - seg.inicio
  return dur > 0 ? contarPalabras(seg.texto).habladas / dur : Infinity
}

// ---------------------------------------------------------------------------
// Números para la voz (redondeados para decirlos, sin dejar de ser verdad)

const r1 = (x) => Math.round(x * 10) / 10
const techo1 = (x) => Math.ceil(x * 10 - 1e-6) / 10
const piso1 = (x) => Math.floor(x * 10 + 1e-6) / 10

function decimal1(x) {
  return x.toLocaleString(LOCALE, { maximumFractionDigits: 1 })
}

// Entero si el redondeo se aleja menos de 12 %; si no, con un decimal ("1.6").
function cifra(x) {
  const n = Math.round(x)
  if (n > 0 && Math.abs(x - n) / x <= 0.12) return entero(n)
  if (x >= 10) return entero(n)
  return decimal1(x)
}

// "17 dólares", "1.6 centavos", "menos de un centavo".
export function dineroVoz(x) {
  if (x === null || x === undefined || !Number.isFinite(x) || x < 0) return null
  if (x === 0) return 'nada'
  const centavos = x * 100
  if (centavos < 1) return 'menos de un centavo'
  if (centavos < 99.5) {
    const c = cifra(centavos)
    return `${c} ${c === '1' ? 'centavo' : 'centavos'}`
  }
  if (x >= 100) {
    const r = Number(x.toPrecision(2))
    return `unos ${entero(r)} dólares`
  }
  const d = cifra(x)
  return `${d} ${d === '1' ? 'dólar' : 'dólares'}`
}

// "menos de medio segundo", "3 segundos", "casi 5 segundos", "más de 5 segundos", "2.3 segundos".
// Se parte de lo que muestra la pantalla (un decimal). Si la cifra dicha la redondea, se dice hacia
// dónde ("casi" / "más de"): la voz nunca hace a nadie más lento ni más rápido de lo que se ve.
export function segundosVoz(ms) {
  if (!Number.isFinite(ms) || ms <= 0) return null
  if (ms < 500) return 'menos de medio segundo'
  if (ms < 1000) return 'menos de un segundo'
  const pantalla = r1(ms / 1000)
  const s = cifra(pantalla)
  const dicho = Number(s.replace(/,/g, ''))
  const unidad = s === '1' ? 'segundo' : 'segundos'
  if (dicho > pantalla + 1e-9) return `casi ${s} ${unidad}`
  if (dicho < pantalla - 1e-9) return `más de ${s} ${unidad}`
  return `${s} ${unidad}`
}

// "unas 770 veces", "unas 40 veces", "2.4 veces".
export function vecesVoz(x) {
  if (!Number.isFinite(x) || x <= 0) return null
  if (x >= 100) return `unas ${factor(Number(x.toPrecision(2)))}`
  if (x >= 10) return `unas ${factor(Math.round(x))}`
  return factor(x)
}

const FEMENINO = ['ninguna', 'una', 'dos', 'tres', 'cuatro', 'cinco', 'seis', 'siete', 'ocho', 'nueve', 'diez']
const cuantas = (n) => (n >= 0 && n < FEMENINO.length ? FEMENINO[n] : entero(n))
const mayuscula = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s)

function lista(nombres) {
  if (nombres.length <= 1) return nombres.join('')
  return `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}`
}

// Nombres cortos para la voz; en pantalla se ve el nombre completo.
const CORTOS = { gpt: 'GPT', opus: 'Opus', jev: 'Jev' }
const C = (p) => CORTOS[p?.id] ?? p?.nombre ?? '—'

const conRespuestas = (p) => p.respondidas > 0
const mismoConjunto = (a, b) => a.length === b.length && a.every((x) => b.includes(x))

// Divulgación tal como se dice en la voz (sin el punto final), o '' si no hay.
function divulgacionVoz() {
  return String(PUBLICACION.divulgacion ?? '')
    .trim()
    .replace(/[.\s]+$/, '')
}

// Texto de la pantalla de presentación (src/escenas/Presentacion.jsx), para «lo que se ve».
function pantallaLLM(llms) {
  const conRazon = llms.filter((p) => p.tokensRazonamientoProm > 0)
  if (conRazon.length && conRazon.length === llms.length) return 'razonan y escriben la respuesta (JSON); se paga cada token, incluido el razonamiento interno'
  if (conRazon.length) return `escriben la respuesta (JSON); se paga cada token, incluido el razonamiento interno de ${lista(conRazon.map((p) => p.nombre))}`
  return 'escriben la respuesta (JSON); se paga cada token de entrada y de salida'
}

// Cómo se ven los tokens de salida de Jev en su columna (src/componentes/Columna.jsx): nunca se
// habla de "0 tokens de salida" si la API no los informó.
function salidaJevEnPantalla(jev) {
  if (!conRespuestas(jev)) return ''
  if (!jev.salidaInformada) return '«salida: no informada» (la API no informa tokens de salida), '
  return jev.tokensSalidaProm === 0 ? '0 tokens de salida y ' : ''
}

// ---------------------------------------------------------------------------
// Datos de la corrida en la línea de tiempo

function contexto(est) {
  const ps = est.proveedores ?? []
  const N = est.totalViajeros ?? 0
  const det = ESC.detalle
  const rap = ESC.rapido
  const slotDet = (det.fin - det.inicio) / VIAJEROS_DETALLE
  // Igual que src/lib/datos.js y shared/timeline.js: el último COLA_RAPIDO no recibe viajeros.
  const slotRap = (rap.fin - COLA_RAPIDO - rap.inicio) / Math.max(1, N - VIAJEROS_DETALLE)
  const pasos = (p) => est.sim?.porProveedor?.[p.id]?.pasos ?? []
  const inicioViajero = (i) => (i < VIAJEROS_DETALLE ? det.inicio + i * slotDet : rap.inicio + (i - VIAJEROS_DETALLE) * slotRap)
  // Último momento en que puede aparecer el veredicto del viajero i (cota superior, como src/lib/datos.js).
  const veredicto = (i) => (i < VIAJEROS_DETALLE ? inicioViajero(i) + slotDet - 0.6 : inicioViajero(i) + 0.3 * slotRap + 0.02)
  // Momento en que aparece el GAME OVER de un proveedor (null si llegó al final).
  const momentoFin = (p) => {
    if (p.finIndice === null || p.finIndice === undefined) return null
    if (p.motivoFin === 'sin_fondos') {
      return p.finIndice < VIAJEROS_DETALLE ? inicioViajero(p.finIndice) + 2.2 : inicioViajero(p.finIndice) + 0.05
    }
    const k = p.finIndice - 1
    return veredicto(k) + (k < VIAJEROS_DETALLE ? 0.55 : 0.2)
  }
  const activoEn = (p, t) => {
    const m = momentoFin(p)
    return m === null || m > t
  }
  // Vidas que se ven en pantalla en el segundo t.
  const vidasEn = (p, t) => {
    const lista = pasos(p)
    let vidas = est.vidas
    for (let i = 0; i < lista.length; i++) if (veredicto(i) <= t) vidas = lista[i].vidas ?? vidas
    return vidas
  }
  const jev = ps.find((p) => p.id === 'jev') ?? null
  const llms = ps.filter((p) => p.id !== 'jev')
  const jevConProbabilidad = jev ? pasos(jev).some((x) => x.resultado?.confianza) : false
  // Ganadores de cada métrica: SIEMPRE los de shared/juego.js (los mismos de las coronas MEJOR).
  const G = est.ganadores ?? { duracion: [], costo: [], velocidad: [], aciertos: [] }
  const porIds = (ids) => (ids ?? []).map((id) => ps.find((p) => p.id === id)).filter(Boolean)
  // Solo se dice que un modelo "razona" si se midió razonamiento (tokens de razonamiento > 0).
  const conRazon = llms.filter((p) => p.tokensRazonamientoProm > 0)
  // "Jev no escribe" es una característica del producto (su documentación); no se dice si la API
  // informó tokens de salida mayores que 0.
  const jevNoEscribe = Boolean(jev) && !(jev.tokensSalidaProm > 0)
  return {
    est,
    ps,
    N,
    jev,
    llms,
    G,
    porIds,
    conRazon,
    jevNoEscribe,
    pasos,
    inicioViajero,
    momentoFin,
    activoEn,
    vidasEn,
    jevConProbabilidad,
    slotRap,
    anunciados: new Set(),
    dicho: { insignia: false },
  }
}

// ---------------------------------------------------------------------------
// Elegir la variante que cabe

// Devuelve el tramo con la primera variante que respeta el ritmo entre `inicio` y `limite`, o null.
function elegir(inicio, limite, variantes) {
  const ini = r1(inicio)
  const lim = piso1(limite)
  const disponible = lim - ini
  if (disponible <= 0) return null
  for (const v of variantes) {
    if (!v) continue
    const texto = v.replace(/\s+/g, ' ').trim()
    const { habladas } = contarPalabras(texto)
    if (habladas > 0 && habladas <= RITMO_MAXIMO * disponible + 1e-9) {
      const fin = Math.min(lim, techo1(ini + habladas / RITMO_HOLGADO + PAUSA_FINAL))
      return { inicio: ini, fin, texto }
    }
  }
  return null
}

function fijo(inicio, limite, variantes, enPantalla, nombre) {
  const r = elegir(inicio, limite, variantes)
  if (!r) {
    const corta = variantes.filter(Boolean).at(-1)
    throw new Error(
      `Guion: el tramo "${nombre}" (${inicio}-${limite} s) no cabe ni con su variante más corta ` +
        `("${corta}", ${contarPalabras(corta).habladas} palabras; máximo ${RITMO_MAXIMO} por segundo).`,
    )
  }
  return { ...r, enPantalla }
}

// ---------------------------------------------------------------------------
// Escenas fijas

function gancho(ctx) {
  const { est, ps } = ctx
  const n = ps.length
  const llegaron = est.sobrevivientes?.length ?? 0
  // Si alguna no respondió nada (todas sus llamadas fallaron), "solo dos llegaron al final" sonaría
  // a que jugó y perdió: se usa la pregunta del sello.
  const mudas = ps.some((p) => !conRespuestas(p))
  let desenlace
  if (mudas) desenlace = '¿Quién dura más?'
  else if (n === 1) desenlace = llegaron ? 'Llegó al final.' : 'No llegó al final.'
  else if (llegaron === 0) desenlace = 'Ninguna llegó al final.'
  else if (llegaron === 1) desenlace = 'Solo una llegó al final.'
  else if (llegaron === n) desenlace = n === 2 ? 'Las dos llegaron al final.' : `Las ${cuantas(n)} llegaron al final.`
  else desenlace = `Solo ${cuantas(llegaron)} llegaron al final.`
  const ias = `${mayuscula(cuantas(n))} ${n === 1 ? 'IA' : 'IAs'}`
  const plata = dineroVoz(est.presupuestoUSD)
  const e = ESC.gancho
  return fijo(
    e.inicio,
    e.fin,
    [`${ias}, ${plata} cada una. ${desenlace}`, `${ias}, el mismo presupuesto. ${desenlace}`, `${ias}. ${desenlace}`],
    `Título «LA FRONTERA», «${n} cerebros · 1 frontera», «${usd(est.presupuestoUSD)} de presupuesto»; entran ` +
      `${lista(ps.map((p) => p.nombre))} y cae el sello «¿QUIÉN DURA MÁS?».`,
    'gancho',
  )
}

function presentacion(ctx) {
  const { est, llms, jev, conRazon, jevNoEscribe } = ctx
  const e = ESC.presentacion
  const [a, b, c] = PARTES_PRESENTACION.map((x) => e.inicio + x)
  const L = lista(llms.map(C))
  const plural = llms.length !== 1
  // "Razonan" solo si TODOS los modelos nombrados razonaron (tokens de razonamiento medidos > 0).
  const razonan = llms.length > 0 && conRazon.length === llms.length
  // "Jev, no." contesta a "escriben su respuesta": Jev no genera texto (característica del producto).
  const remate = jev ? (jevNoEscribe ? `${C(jev)}, no.` : `${C(jev)} solo devuelve la decisión.`) : ''
  const vidas = est.vidas
  return [
    fijo(
      a,
      b,
      ['¿Pasa? ¿Miente? ¿Qué tan peligroso es? ¿Qué hacer?', 'Cuatro preguntas por viajero.'],
      '«CADA VIAJERO, 4 DECISIONES»: tarjetas ¿Puede pasar? (sí/no), ¿Miente? (sí/no), Peligro (0 a 4) y ' +
        '¿Qué hacer? (aprobar, rechazar, interrogar, arrestar).',
      'presentación: decisiones',
    ),
    fijo(
      b,
      c,
      [
        razonan ? `${L} ${plural ? 'razonan y escriben' : 'razona y escribe'}${jev ? `; ${C(jev)} solo decide.` : ' su respuesta.'}` : null,
        llms.length ? `${L} ${plural ? 'escriben su respuesta' : 'escribe su respuesta'}. ${remate}` : null,
        llms.length ? `${L} ${plural ? 'escriben' : 'escribe'}. ${remate}` : null,
        jev ? remate : 'Así responde cada una.',
      ],
      `«¿CÓMO RESPONDE CADA CEREBRO?»: ${lista(llms.map((p) => p.nombre)) || 'los modelos de lenguaje'} ` +
        `(«${pantallaLLM(llms)}») escriben su JSON con monedas que caen` +
        (jev
          ? `; ${jev.nombre} («${jev.salidaInformada && jev.tokensSalidaProm > 0 ? 'devuelve la decisión con su probabilidad' : 'no escribe: devuelve la decisión con su probabilidad'}») muestra barras de probabilidad`
          : '') +
        '.',
      'presentación: cómo responde',
    ),
    fijo(
      c,
      e.fin,
      [
        `${mayuscula(cuantas(vidas))} ${vidas === 1 ? 'vida' : 'vidas'}. Gana quien dure más.`,
        'Gana quien dure más.',
      ],
      `«REGLAS DEL JUEGO»: ${usd(est.presupuestoUSD)} para cada uno; ${vidas} ${vidas === 1 ? 'vida' : 'vidas'} ` +
        '(se pierde una por dejar pasar a una amenaza o arrestar a un inocente); gana quien dure más.',
      'presentación: reglas',
    ),
  ]
}

function detalle(ctx) {
  const { ps, llms, jev, N, pasos, inicioViajero, momentoFin, vidasEn, jevConProbabilidad, est, conRazon, jevNoEscribe } = ctx
  const e = ESC.detalle
  const t1 = techo1(inicioViajero(1))
  const t2 = techo1(inicioViajero(2))
  const L = lista(llms.map(C))
  const plural = llms.length !== 1
  const n = ps.length
  // Solo se nombran los modelos con razonamiento medido (tokens de razonamiento > 0).
  const LR = lista(conRazon.map(C))
  // Errores graves (corazón perdido) en los dos primeros viajeros, para "lo que se ve".
  const graves = (i) => ps.filter((p) => pasos(p)[i]?.activo && pasos(p)[i]?.evaluacion?.errorGrave).map((p) => p.nombre)
  const verGraves = (i) => {
    const g = graves(i)
    return g.length ? ` ${lista(g)} ${g.length > 1 ? 'pierden' : 'pierde'} una vida (corazón roto).` : ''
  }

  // Antes del tercer viajero: ¿alguien ya quedó fuera o perdió vidas?
  const fuera = ps.filter((p) => {
    const m = momentoFin(p)
    return m !== null && m <= t2
  })
  const conVidasMenos = ps.filter((p) => !fuera.includes(p) && vidasEn(p, t2) < est.vidas)
  let nota = ''
  if (fuera.length) nota = `${lista(fuera.map(C))} ya ${fuera.length > 1 ? 'quedaron' : 'quedó'} fuera.`
  else if (conVidasMenos.length === 1) {
    const p = conVidasMenos[0]
    const perdidas = est.vidas - vidasEn(p, t2)
    nota = `${C(p)} ya perdió ${perdidas === 1 ? 'una vida' : `${cuantas(perdidas)} vidas`}.`
  } else if (conVidasMenos.length > 1) nota = `${lista(conVidasMenos.map(C))} ya perdieron vidas.`
  const sujetoNotaEsJev = jev && (fuera.length ? fuera : conVidasMenos).length === 1 && (fuera[0] ?? conVidasMenos[0]) === jev
  const mecanismo = jev
    ? jevNoEscribe
      ? jevConProbabilidad
        ? 'no escribe: devuelve la decisión con su probabilidad.'
        : 'no escribe: devuelve solo la decisión.'
      : jevConProbabilidad
        ? 'devuelve la decisión con su probabilidad.'
        : 'devuelve solo la decisión.'
    : null
  const fraseJev = (conNota) => (conNota && sujetoNotaEsJev ? mayuscula(mecanismo) : `${C(jev)} ${mecanismo}`)

  const tramo3 = fijo(
    t2,
    e.fin,
    jev
      ? [nota ? `${nota} ${fraseJev(true)}` : null, fraseJev(false), `${C(jev)} solo decide.`]
      : [nota || null, 'Mismas reglas para todas.'],
    `Viajero 3/${N}${jev ? `: la columna de ${jev.nombre} muestra ${salidaJevEnPantalla(jev)}` +
      `${jevConProbabilidad ? 'las barras de probabilidad de cada respuesta' : 'su decisión'}` : ''}` +
      `${nota ? `; ${nota.replace(/\.$/, '')} (se ve en sus corazones o en su GAME OVER)` : ''}.`,
    'detalle: viajero 3',
  )
  // Los que ya se anunciaron "fuera" no se repiten al entrar al avance rápido.
  if (nota && fuera.length && tramo3.texto.startsWith(nota)) for (const p of fuera) ctx.anunciados.add(p.id)
  return [
    fijo(
      e.inicio,
      t1,
      n > 1
        ? [
            `Mismo viajero, misma información, mismas preguntas para las ${cuantas(n)}. ¿Quién responde primero?`,
            `Mismo viajero, misma información para las ${cuantas(n)}.`,
            'Misma información para todas.',
          ]
        : ['Primer viajero: documentos, lo que dice y cuatro preguntas.', 'Primer viajero.'],
      `Viajero 1/${N} entra a la cabina con su pasaporte y dice su motivo; las ${n} columnas reciben el mismo caso y ` +
        `muestran su sello, el tiempo de respuesta, los tokens y el costo.${verGraves(0)}`,
      'detalle: viajero 1',
    ),
    fijo(
      t1,
      t2,
      [
        conRazon.length
          ? `${LR} ${conRazon.length > 1 ? 'razonan' : 'razona'} antes de responder, y ese razonamiento también se paga.`
          : null,
        llms.length ? `${L} ${plural ? 'escriben su respuesta' : 'escribe su respuesta'}, y se paga cada token.` : null,
        llms.length ? `${L}: se paga cada token.` : null,
        'Cada respuesta tiene su costo.',
      ],
      `Viajero 2/${N}: en ${llms.length ? `las columnas de ${lista(llms.map((p) => p.nombre))}` : 'las columnas'} se ven los tokens de entrada y de salida` +
        `${conRazon.length ? `, el «razonamiento interno» de ${lista(conRazon.map((p) => p.nombre))}` : ''} y el JSON que escribieron.${verGraves(1)}`,
      'detalle: viajero 2',
    ),
    tramo3,
  ]
}

// ---------------------------------------------------------------------------
// Avance rápido: la voz sigue los GAME OVER en el momento en que aparecen

function siguenEn(ctx, t) {
  const activos = ctx.ps.filter((p) => ctx.activoEn(p, t))
  if (!activos.length) return 'Ya no queda nadie.'
  if (activos.length === 1) return `Solo queda ${C(activos[0])}.`
  if (activos.length === ctx.ps.length) return ''
  return `${lista(activos.map(C))} siguen.`
}

function trasDecisiones(p) {
  const n = p.decisionesEnJuego ?? 0
  if (n === 0) return 'sin tomar ninguna decisión'
  return `tras ${entero(n)} ${n === 1 ? 'decisión' : 'decisiones'}`
}

function textoPantallaFin(ctx, p) {
  if (p.motivoFin === 'sin_fondos') {
    return `Columna de ${p.nombre}: GAME OVER · SIN PRESUPUESTO (no le alcanzó para el viajero ${p.finIndice + 1}/${ctx.N}).`
  }
  return `Columna de ${p.nombre}: GAME OVER · SIN VIDAS (perdió la última en el viajero ${p.finIndice}/${ctx.N}).`
}

// Variantes para comentar uno o más GAME OVER: [{ texto, costo? }] de la más larga a la más corta.
function variantesEvento(ctx, m) {
  const ps = m.eventos.map((e) => e.p)
  const siguen = siguenEn(ctx, m.t + 0.01)
  let lista_ = []
  if (ps.length === 1) {
    const p = ps[0]
    const tras = trasDecisiones(p)
    if (p.motivoFin === 'sin_fondos') {
      // Lo gastado dividido por las decisiones tomadas (no por los viajeros atendidos: una llamada
      // con error gasta lo que se cobró pero no es una decisión).
      const porDecision = p.decisionesEnJuego > 0 ? dineroVoz(p.gastadoFinal / p.decisionesEnJuego) : null
      lista_ = [
        porDecision && p.decisionesEnJuego > 1
          ? { texto: `${C(p)} se queda sin presupuesto ${tras}, a ${porDecision} cada una. ${siguen}`, costo: p.id }
          : null,
        `${C(p)} se queda sin presupuesto ${tras}. ${siguen}`,
        `${C(p)} se queda sin presupuesto ${tras}.`,
        `${C(p)} se queda sin presupuesto.`,
        `${C(p)}, sin presupuesto.`,
      ]
    } else {
      lista_ = [
        `${C(p)} pierde su última vida ${tras}. ${siguen}`,
        `${C(p)} pierde su última vida ${tras}.`,
        `${C(p)} pierde su última vida.`,
        `${C(p)}, sin vidas.`,
      ]
    }
  } else {
    const nombres = lista(ps.map(C))
    const todos = (motivo) => ps.every((p) => p.motivoFin === motivo)
    const verbo = todos('sin_fondos') ? 'se quedan sin presupuesto' : todos('sin_vidas') ? 'pierden su última vida' : 'quedan fuera'
    lista_ = [`${nombres} ${verbo}. ${siguen}`, `${nombres} ${verbo}.`, `Fuera ${nombres}.`]
  }
  return lista_.filter(Boolean).map((v) => (typeof v === 'string' ? { texto: v } : v))
}

function variantesIntro(ctx, previos) {
  const restantes = Math.max(0, ctx.N - VIAJEROS_DETALLE)
  const nuevos = previos.filter((e) => !ctx.anunciados.has(e.p.id))
  const prev = nuevos.length ? `${lista(nuevos.map((e) => C(e.p)))} ya ${nuevos.length > 1 ? 'quedaron' : 'quedó'} fuera. ` : ''
  if (restantes === 0) return [`${prev}No hay más viajeros en esta corrida.`, 'No hay más viajeros.']
  if (previos.length === ctx.ps.length) return [`${prev}Nadie sigue en juego.`, 'Nadie sigue en juego.']
  const mas = `${entero(restantes)} ${restantes === 1 ? 'viajero' : 'viajeros'} más`
  return [
    `${prev}Ahora, avance rápido: ${mas}. Ojo al presupuesto y a las vidas.`,
    `${prev}Avance rápido: ${mas}. Ojo al presupuesto.`,
    `${prev}Avance rápido: ${mas}.`,
    `${prev}Avance rápido.`,
    'Avance rápido.',
  ]
}

// Comentarios para los huecos largos del avance rápido. Cada uno es verdad en el momento en que se dice.
function rellenos(ctx, t, dicho) {
  const { est, ps } = ctx
  const out = []
  const conResp = ps.filter((p) => p.respondidas > 0)
  // Velocidad promedio: el más rápido contra el más lento.
  const porLat = [...conResp].sort((a, b) => a.latenciaPromedioMs - b.latenciaPromedioMs)
  if (
    !dicho.velocidad &&
    porLat.length >= 2 &&
    segundosVoz(porLat[0].latenciaPromedioMs) !== segundosVoz(porLat.at(-1).latenciaPromedioMs)
  ) {
    const r = porLat[0]
    const l = porLat.at(-1)
    out.push({
      clave: 'velocidad',
      variantes: [
        `En promedio, ${C(r)} responde en ${segundosVoz(r.latenciaPromedioMs)}; ${C(l)} tarda ${segundosVoz(l.latenciaPromedioMs)}.`,
        `${C(r)} responde en ${segundosVoz(r.latenciaPromedioMs)}; ${C(l)} tarda ${segundosVoz(l.latenciaPromedioMs)}.`,
      ],
    })
  }
  // Costo por decisión del más caro.
  const caro = est.masCaro
  if (caro && !dicho.costo?.has(caro.id) && caro.costoPromedioUSD > 0) {
    const verbo = ctx.activoEn(caro, t) ? 'cuesta' : 'costaba'
    out.push({
      clave: 'costo',
      variantes: [`A ${C(caro)}, cada decisión le ${verbo} ${dineroVoz(caro.costoPromedioUSD)} en promedio.`, `A ${C(caro)}, cada decisión le ${verbo} ${dineroVoz(caro.costoPromedioUSD)}.`],
    })
  }
  // Quién sigue en pie (solo si sus vidas no cambian mientras se dice).
  const activos = ps.filter((p) => ctx.activoEn(p, t + 6))
  if (!dicho.estado && activos.length === 1) {
    const p = activos[0]
    const v = ctx.vidasEn(p, t)
    if (ctx.vidasEn(p, t + 6) === v) {
      out.push({ clave: 'estado', variantes: [`${C(p)} sigue en pie, con ${cuantas(v)} ${v === 1 ? 'vida' : 'vidas'}.`, `${C(p)} sigue en pie.`] })
    }
  }
  if (!dicho.regla) {
    out.push({
      clave: 'regla',
      variantes: ['Cada error grave cuesta una vida: dejar pasar una amenaza o arrestar a un inocente.', 'Cada error grave cuesta una vida.'],
    })
  }
  return out
}

function rapido(ctx) {
  const e = ESC.rapido
  const eventos = ctx.ps
    .map((p) => ({ p, t: ctx.momentoFin(p) }))
    .filter((x) => x.t !== null)
    .sort((a, b) => a.t - b.t)
  const previos = eventos.filter((x) => x.t < e.inicio + 0.5)
  // Momentos: la entrada al avance rápido y cada GAME OVER (los muy juntos van en una sola frase).
  const momentos = [{ tipo: 'intro', t: e.inicio, eventos: previos }]
  for (const ev of eventos.filter((x) => x.t >= e.inicio + 0.5 && x.t < e.fin)) {
    const t = techo1(ev.t + REACCION)
    const ultimo = momentos.at(-1)
    if (ultimo.tipo === 'evento' && t - ultimo.t < AGRUPAR) {
      ultimo.eventos.push(ev)
      ultimo.t = t
    } else momentos.push({ tipo: 'evento', t, eventos: [ev] })
  }
  // Un GAME OVER tan pegado al final que no alcanza a comentarse lo cuenta la fila de duración de los resultados.
  const palabrasMinimas = (m) => Math.min(...variantesEvento(ctx, m).map((v) => contarPalabras(v.texto).habladas))
  while (momentos.length > 1 && (piso1(e.fin) - momentos.at(-1).t) * RITMO_MAXIMO < palabrasMinimas(momentos.at(-1))) momentos.pop()

  const dicho = { costo: new Set() }
  const salida = []
  for (let i = 0; i < momentos.length; i++) {
    const m = momentos[i]
    const limite = i + 1 < momentos.length ? momentos[i + 1].t : e.fin
    let elegido
    let enPantalla
    if (m.tipo === 'intro') {
      elegido = elegir(m.t, limite, variantesIntro(ctx, m.eventos))
      enPantalla =
        `«AVANCE RÁPIDO»: pasan los viajeros ${VIAJEROS_DETALLE + 1} a ${ctx.N} en fila; en cada columna suben el gasto y ` +
        'los aciertos, y bajan las vidas.' + (m.eventos.length ? ` ${m.eventos.map((x) => textoPantallaFin(ctx, x.p)).join(' ')}` : '')
      if (!elegido) {
        // Sin espacio para la entrada: el siguiente momento también cuenta a los que ya quedaron fuera.
        if (m.eventos.length && momentos[i + 1]) momentos[i + 1].eventos.unshift(...m.eventos)
        continue
      }
    } else {
      const variantes = variantesEvento(ctx, m)
      elegido = elegir(m.t, limite, variantes.map((v) => v.texto))
      if (!elegido) {
        throw new Error(`Guion: el GAME OVER del segundo ${m.t} no cabe ("${variantes.at(-1).texto}") antes del segundo ${limite}.`)
      }
      const usada = variantes.find((v) => v.texto.replace(/\s+/g, ' ').trim() === elegido.texto)
      if (usada?.costo) dicho.costo.add(usada.costo)
      enPantalla = m.eventos.map((x) => textoPantallaFin(ctx, x.p)).join(' ')
    }
    salida.push({ ...elegido, enPantalla })
    // Huecos largos: comentarios que siguen siendo verdad en ese momento.
    let fin = elegido.fin
    while (limite - fin >= RELLENO_MIN) {
      const t0 = techo1(fin + 0.3)
      let puesto = null
      for (const o of rellenos(ctx, t0, dicho)) {
        puesto = elegir(t0, limite, o.variantes)
        if (puesto) {
          if (o.clave === 'costo') dicho.costo.add(ctx.est.masCaro.id)
          else dicho[o.clave] = true
          break
        }
      }
      if (!puesto) break
      salida.push({
        ...puesto,
        enPantalla: 'Avance rápido: siguen pasando viajeros; contadores de gasto, vidas y aciertos en cada columna.',
      })
      fin = puesto.fin
    }
  }
  return salida
}

// ---------------------------------------------------------------------------
// Resultados y cierre. Toda afirmación de "gana", "el más X" o "empate" sale de ctx.G
// (estadisticas.ganadores), igual que las coronas MEJOR de src/escenas/Resultados.jsx.

// "dd/mm/aaaa" de una fecha ISO.
function fechaCortaVoz(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso ?? '')
  return m ? `${m[3]}/${m[2]}/${m[1]}` : String(iso ?? '—')
}

// Avisos al pie de la tabla de resultados (los mismos que calcula src/escenas/Resultados.jsx).
function avisosPantalla(est) {
  const ps = est.proveedores
  const nombres = (xs) => lista(xs.map((p) => p.nombre))
  const out = []
  if (est.reglasRegistradas) out.push(`Presupuesto (${usd(est.presupuestoUSD)}) y vidas (${est.vidas}) fijados antes de correr`)
  const sinVerificar = ps.filter((p) => p.precio?.verificado === false)
  if (sinVerificar.length) out.push(`precio sin verificar en la página oficial: ${nombres(sinVerificar)}`)
  const errores = ps.filter((p) => p.erroresApi > 0 || p.faltantes > 0)
  if (errores.length) out.push(`errores de API, cuentan como fallo: ${lista(errores.map((p) => `${p.nombre} (${p.erroresApi + p.faltantes})`))}`)
  const cero = ps.filter((p) => conRespuestas(p) && p.costoPromedioUSD === 0)
  if (cero.length) out.push(`costo 0: la API informó 0 tokens (${nombres(cero)}); no compite en costo`)
  const estimados = ps.filter((p) => p.tokensEstimados)
  if (estimados.length) out.push(`tokens estimados: ${nombres(estimados)}`)
  const salida = ps.filter((p) => conRespuestas(p) && !p.salidaInformada)
  if (salida.length) out.push(`tokens de salida no informados por la API: ${nombres(salida)}`)
  const respaldo = ps.filter((p) => p.usoFallback)
  if (respaldo.length) out.push(`modelo de respaldo en algunas llamadas: ${nombres(respaldo)}`)
  return out.slice(0, 5)
}

// ¿Se puede hablar de "el más barato"? Solo si todos los que respondieron tienen un costo > 0
// (un costo 0 significa que la API informó 0 tokens: no compite, y la pantalla lo avisa).
function costoComparable(ctx) {
  const compiten = ctx.ps.filter(conRespuestas)
  return compiten.length >= 2 && compiten.every((p) => p.costoPromedioUSD > 0)
}

function resultados(ctx) {
  const { est, ps, N, jev, llms, G, porIds } = ctx
  const e = ESC.resultados
  const T = (x) => e.inicio + x
  const uno = ps.length === 1
  const coronas = (ids) => {
    const xs = porIds(ids)
    return xs.length ? ` (corona MEJOR: ${lista(xs.map((p) => p.nombre))})` : ''
  }

  // --- Duración (fila «Decisiones con el presupuesto»)
  const dur = porIds(G.duracion)
  const sup = est.sobrevivientes ?? []
  // Sin respuestas no hay nada que celebrar ni que comparar: se dice tal cual.
  const mudas = ps.filter((p) => !conRespuestas(p))
  let base = []
  if (uno) {
    const p = ps[0]
    if (conRespuestas(p)) base = p.llegoAlFinal ? [`${C(p)} llegó al final.`] : [`${C(p)} no llegó al final.`]
  } else if (sup.length > 1) {
    const L = lista(sup.map(C))
    base = sup.length === ps.length ? [`Las ${cuantas(ps.length)} llegaron al final.`, 'Todas llegaron.'] : [`${L} llegaron al final.`, `Llegaron ${L}.`]
  } else if (sup.length === 1) {
    base = [`Solo ${C(sup[0])} llegó al final.`, `${C(sup[0])} llegó al final.`]
  } else if (dur.length === 1) {
    base = [`${C(dur[0])} duró más que nadie.`, `${C(dur[0])} duró más.`]
  } else if (dur.length > 1) {
    const L = lista(dur.map(C))
    base = dur.length === ps.length ? [`Las ${cuantas(ps.length)} duraron lo mismo.`, 'Empate en duración.'] : [`Empate en duración: ${L}.`, `Empatan ${L}.`]
  }
  let textoDur
  if (mudas.length) {
    const nadie = `${lista(mudas.map(C))} no ${mudas.length > 1 ? 'respondieron' : 'respondió'} ninguna.`
    textoDur = [...base.map((b) => `${nadie} ${b}`), nadie, 'Hubo fallas de API.']
  } else textoDur = base.length ? base : ['Así terminó el juego.']

  // --- Costo (filas «Costo por decisión» y «Costo por mil decisiones»)
  const caro = est.masCaro
  const barato = est.masBarato
  const baratos = porIds(G.costo)
  const textoCosto = []
  const d = (p) => dineroVoz(p.costoPor1000USD)
  if (!uno && costoComparable(ctx) && baratos.length === ps.length) {
    textoCosto.push('Empate en costo.')
  } else if (caro && barato && caro.id !== barato.id && d(caro) !== d(barato)) {
    textoCosto.push(
      `Por cada mil decisiones: ${C(caro)}, ${d(caro)}; ${C(barato)}, ${d(barato)}.`,
      `Mil decisiones: ${C(caro)}, ${d(caro)}; ${C(barato)}, ${d(barato)}.`,
    )
  } else if (barato && (!caro || caro.id === barato.id)) textoCosto.push(`Mil decisiones de ${C(barato)}: ${d(barato)}.`)
  if (!uno && costoComparable(ctx)) {
    if (baratos.length === 1) textoCosto.push(`${C(baratos[0])}, el más barato.`)
    else if (baratos.length > 1 && baratos.length < ps.length) textoCosto.push(`Empatan en costo: ${lista(baratos.map(C))}.`)
  }
  textoCosto.push('Así quedó el costo.')

  // --- Velocidad y aciertos
  const vel = porIds(G.velocidad)
  const aci = porIds(G.aciertos)
  let frasesVel = []
  if (!uno) {
    if (vel.length === 1) frasesVel = [`${C(vel[0])}, el más rápido.`]
    else if (vel.length > 1) frasesVel = vel.length === ps.length ? ['Empate en velocidad.'] : [`${lista(vel.map(C))}, los más rápidos.`]
  }
  // "Empate" a secas solo si empatan TODAS; si no, se nombra a las que empatan (hallazgo 1).
  let frasesAci = []
  if (uno) {
    const p = ps[0]
    if (conRespuestas(p)) frasesAci = [`Aciertos: ${entero(p.aciertosAccion)} de ${entero(p.casos)}.`]
  } else if (aci.length === ps.length) frasesAci = ['En aciertos, empate.', 'Aciertos: empate.']
  else if (aci.length === 1) frasesAci = [`En aciertos, gana ${C(aci[0])}.`, `Aciertos: ${C(aci[0])}.`]
  else if (aci.length > 1) frasesAci = [`En aciertos, empatan ${lista(aci.map(C))}.`, `Aciertos: ${lista(aci.map(C))}.`]
  const textoVelAci = []
  if (!uno && aci.length === 1 && vel.length === 1 && aci[0] === vel[0]) {
    textoVelAci.push(`${C(vel[0])} gana en velocidad y en aciertos.`, `Velocidad y aciertos: ${C(vel[0])}.`)
  }
  for (const a of frasesAci) for (const v of frasesVel) textoVelAci.push(`${v} ${a}`)
  textoVelAci.push(...frasesAci, ...frasesVel, 'Velocidad y aciertos, en la tabla.')

  // --- Cuántas veces más barato es Jev (est.factoresJev: solo diferencias de 5 % o más)
  const factores = ps
    .filter((p) => est.factoresJev?.[p.id] >= EMPATE_COSTO)
    .map((p) => ({ p, f: est.factoresJev[p.id] }))
    .sort((a, b) => b.f - a.f)
  // La voz dice la comparación con el más caro (la de los dos no cabe en 4 s); la franja muestra las dos.
  let textoVeces
  if (jev && factores.length) {
    const { p, f } = factores[0]
    const v = vecesVoz(f)
    textoVeces = [`Por decisión, ${C(jev)} sale ${v} más barato que ${C(p)}.`, `${C(jev)} sale ${v} más barato que ${C(p)}.`, `${C(jev)}: ${v} más barato que ${C(p)}.`]
  } else textoVeces = [llms.length ? FRASE_INSIGNIA : null, 'Esos son los números.']

  const avisos = avisosPantalla(est)
  const precios = ps.map((p) => `${p.nombre} ${p.precio?.entradaPorMTok ?? '?'}/${p.precio?.salidaPorMTok ?? '?'}`).join(' · ')
  const franja =
    jev && factores.length
      ? `Franja «${jev.nombre}: ${factores.map((x, i) => (i === 0 ? `${factor(x.f)} más barato que ${x.p.nombre}` : `${factor(x.f)} más que ${x.p.nombre}`)).join(' y ')}, por decisión» ` +
        `con los precios en US$ por millón de tokens (entrada/salida): ${precios}. `
      : ''

  const fila = (k) => T(FILA_RESULTADOS(k))
  const tramos = [
    fijo(
      T(0.1),
      fila(1) - 0.05,
      textoDur,
      `«RESULTADOS». Fila «Decisiones con el presupuesto»: ${ps
        .map((p) => `${p.nombre} ${conRespuestas(p) ? `${p.decisionesEnJuego}/${N}` : '— (sin respuestas)'}`)
        .join(', ')}${coronas(G.duracion)}; debajo, lo que costaron los ${N} casos: ${ps.map((p) => `${p.nombre} ${usd(p.costoTotalUSD)}`).join(', ')}.`,
      'resultados: duración',
    ),
    fijo(
      fila(1) - 0.05,
      fila(3) - 0.05,
      textoCosto,
      `Filas «Costo por decisión» (${ps.map((p) => `${p.nombre} ${conRespuestas(p) ? usd(p.costoPromedioUSD) : '—'}`).join(', ')}) y «Costo por mil decisiones» ` +
        `(${ps.map((p) => `${p.nombre} ${conRespuestas(p) ? usd(p.costoPor1000USD) : '—'}`).join(', ')})${coronas(G.costo)}.`,
      'resultados: costo',
    ),
    fijo(
      fila(3) - 0.05,
      T(BANNER_RESULTADOS) - 0.1,
      textoVelAci,
      `Fila «Velocidad promedio» (${ps.map((p) => `${p.nombre} ${conRespuestas(p) ? segundos(p.latenciaPromedioMs) : '—'}`).join(', ')})${coronas(G.velocidad)} y ` +
        `«Aciertos en la acción (de ${N})» (${ps.map((p) => `${p.nombre} ${p.aciertosAccion}/${p.casos}, ${p.erroresGraves} ${p.erroresGraves === 1 ? 'error grave' : 'errores graves'}`).join('; ')})` +
        `${coronas(G.aciertos)}, con la nota «diferencias de ${EMPATE_ACIERTOS} casos o menos = empate · una corrida, ${N} casos».`,
      'resultados: velocidad y aciertos',
    ),
    fijo(
      T(BANNER_RESULTADOS) - 0.1,
      e.fin,
      textoVeces,
      franja + (avisos.length ? `Avisos al pie: ${avisos.join('; ')}.` : 'Tabla completa en pantalla.'),
      'resultados: veces más barato',
    ),
  ]
  if (tramos.at(-1).texto === FRASE_INSIGNIA) ctx.dicho.insignia = true
  return tramos
}

function cierre(ctx) {
  const { jev, est, ps, llms, G, porIds } = ctx
  const e = ESC.cierre
  const corte = e.inicio + LINEA2_CIERRE
  const finVoz = DURACION - 0.4
  const div = divulgacionVoz()
  const enlace = PUBLICACION.enlaceMetodo

  // Frase final: el lema solo si los datos lo sostienen (misma condición que src/escenas/Cierre.jsx);
  // si no, una frase neutra que sale de los ganadores de aciertos y de costo.
  let variantes1
  let pantalla1
  if (est.jevRecomendable && jev) {
    variantes1 = [`Los modelos generativos, para crear. ${C(jev)}, para decidir.`, `Modelos generativos para crear; ${C(jev)} para decidir.`]
    pantalla1 = `«MI CONCLUSIÓN»: «Los modelos generativos: para crear.» y «${jev.nombre}: para decidir.»`
  } else {
    const A = porIds(G.aciertos)
    const B = costoComparable(ctx) ? porIds(G.costo) : []
    const LA = lista(A.map(C))
    const LB = lista(B.map(C))
    variantes1 = []
    if (ps.length > 1 && A.length && B.length) {
      if (mismoConjunto(A, B)) {
        variantes1.push(`${LA}: ${A.length > 1 ? 'los que más aciertan y los más baratos' : 'el que más acierta y el más barato'}.`, `Aciertos y costo: ${LA}.`)
      } else {
        variantes1.push(`Si cada acierto cuenta, ${LA}; si manda el costo, ${LB}.`, `Para acertar, ${LA}; para ahorrar, ${LB}.`, `Aciertos: ${LA}. Costo: ${LB}.`)
      }
    } else if (ps.length > 1 && A.length && A.length < ps.length) {
      variantes1.push(`Si cada acierto cuenta, ${LA}.`, `Para acertar, ${LA}.`)
    }
    variantes1.push('Los números, en la tabla.')
    const nombres = (xs) => lista(xs.map((p) => p.nombre))
    const lineas = []
    const Ap = porIds(G.aciertos)
    const Bp = porIds(G.costo)
    if (Ap.length) lineas.push(`«Si cada acierto cuenta: ${nombres(Ap)}.»`)
    if (Bp.length) lineas.push(`«Si manda el costo: ${nombres(Bp)}.»`)
    pantalla1 = lineas.length ? lineas.join(' y ') : '«Los números, en la tabla.»'
  }

  // Divulgación (obligatoria si existe: si no cabe, error) y alcance de la comparación (A3).
  const insignia = llms.length > 0 && !ctx.dicho.insignia
  const variantes2 = div
    ? [insignia ? `${div}. ${FRASE_INSIGNIA}` : null, insignia ? `${div}. ${FRASE_INSIGNIA_CORTA}` : null, `${div}. Link en la descripción.`, `${div}.`]
    : [insignia ? FRASE_INSIGNIA : null, insignia ? FRASE_INSIGNIA_CORTA : null, '¿Dudas? Revisa el método: link en la descripción.', 'Link en la descripción.']
  if (div && !elegir(corte, finVoz, [`${div}.`])) {
    const max = Math.floor(RITMO_MAXIMO * (piso1(finVoz) - r1(corte)) + 1e-9)
    throw new Error(
      `Guion: la divulgación «${div}» (${contarPalabras(div).habladas} palabras habladas) no cabe en la voz del cierre ` +
        `(máximo ${max} palabras). Acórtala en PUBLICACION.divulgacion de shared/config.js: no se omite en silencio.`,
    )
  }

  const precios = ps.map((p) => `${p.nombre} ${p.precio?.entradaPorMTok ?? '?'}/${p.precio?.salidaPorMTok ?? '?'}`).join(' · ')
  const esfuerzos = [...new Set(llms.map((p) => p.opciones?.reasoningEffort ?? p.opciones?.effort ?? null))]
  const alcance = llms.length
    ? `«Comparado con los modelos insignia (${esfuerzos.length === 1 && esfuerzos[0] === 'low' ? 'razonamiento al mínimo: low' : 'razonamiento según cada modelo'}). Hay modelos de lenguaje más baratos que no se probaron.»; `
    : ''
  return [
    fijo(e.inicio, corte, variantes1, `${pantalla1}; abajo desfilan viajeros.`, 'cierre: frase final'),
    fijo(
      corte,
      finVoz,
      variantes2,
      `Fuentes: ${div ? `recuadro con la divulgación «${String(PUBLICACION.divulgacion).trim()}»; ` : ''}` +
        `«Corrida: ${fechaCortaVoz(est.fechaCorrida)}${est.esDemo ? ' (datos simulados, demo)' : ''}» con el archivo de datos y su huella sha256; ` +
        `«Precios en US$ por millón de tokens (entrada/salida): ${precios}»; ${alcance}«Método y código: ${enlace}»; ` +
        `créditos y marcas. Cierra el título «LA FRONTERA» con ${ps.length === 1 ? 'el nombre' : `los ${cuantas(ps.length)} nombres`}.`,
      'cierre: divulgación y método',
    ),
  ]
}

// ---------------------------------------------------------------------------

function escenaDe(t) {
  return (ESCENAS.find((e) => t >= e.inicio - 1e-9 && t < e.fin - 1e-9) ?? ESCENAS.at(-1)).id
}

// Verifica el ritmo, el orden y que nada se salga del video. Lanza un error si algo falla.
export function validarSegmentos(segmentos) {
  let anterior = null
  for (const s of segmentos) {
    const { habladas } = contarPalabras(s.texto)
    const dur = s.fin - s.inicio
    if (!(dur > 0)) throw new Error(`Guion: tramo sin duración en el segundo ${s.inicio}.`)
    if (s.inicio < 0 || s.fin > DURACION + 1e-9) throw new Error(`Guion: el tramo ${s.inicio}-${s.fin} se sale del video.`)
    if (anterior && s.inicio < anterior.fin - 1e-9) throw new Error(`Guion: el tramo ${s.inicio}-${s.fin} se cruza con el anterior.`)
    if (habladas / dur > RITMO_MAXIMO + 1e-9) {
      throw new Error(
        `Guion: el tramo ${s.inicio}-${s.fin} tiene ${habladas} palabras en ${r1(dur)} s ` +
          `(${(habladas / dur).toFixed(2)} por segundo; máximo ${RITMO_MAXIMO}): "${s.texto}"`,
      )
    }
    anterior = s
  }
  return true
}

export function segmentosGuion(est) {
  if (!est || !Array.isArray(est.proveedores) || !est.proveedores.length) return []
  const ctx = contexto(est)
  const tramos = [gancho(ctx), ...presentacion(ctx), ...detalle(ctx), ...rapido(ctx), ...resultados(ctx), ...cierre(ctx)]
  const segmentos = tramos.map((s) => ({
    inicio: s.inicio,
    fin: s.fin,
    escena: escenaDe(s.inicio),
    texto: s.texto,
    enPantalla: s.enPantalla,
  }))
  validarSegmentos(segmentos)
  return segmentos
}
