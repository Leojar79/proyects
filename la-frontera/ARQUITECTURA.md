# La Frontera: arquitectura y contratos

El mismo juego (un guardia de frontera estilo *Papers, Please*) con tres "cerebros" que toman
las decisiones: **GPT Astra** (OpenAI), **Claude Opus 5.5** (Anthropic) y **Jev** (TypeSafe).
El video muestra contadores **reales** de costo, velocidad y aciertos.

Principio rector: **ningún número del video se inventa.** Los números salen de una corrida real del
benchmark (`source: "live"`). Mientras no haya corrida real, se usa una corrida de demostración
(`source: "demo"`) y **todo** cuadro del video lleva la marca de agua
"DEMO · datos simulados — no son resultados reales".

## Flujo

1. `npm run probar-apis`: llama una vez a cada API con un viajero e imprime la respuesta cruda (para verificar formatos).
2. `npm run benchmark`: pasa los 60 viajeros por las tres IAs y guarda `public/runs/<fecha>.json` y `public/runs/latest.json`.
3. `npm run dev`: vista previa del video con controles (play, pausa, barra de tiempo, formato).
4. `npm run guion`: genera `GUION.md` (texto para grabar la voz, con tiempos) y `out/subtitulos.srt` con los números de la corrida.
5. `npm run video -- --formato todos`: renderiza los MP4 cuadro a cuadro (vertical, feed, horizontal).

Sin corrida real, `npm run demo` genera `public/runs/demo.json` y todo funciona con marca de agua.

## Estructura y dueños

```
shared/            Contratos compartidos (navegador + Node). Funciones puras, sin dependencias.
  preguntas.js     Reglas del mundo, las 4 preguntas, texto de estado, esquema JSON, preguntas de Jev.
  modelos.js       Proveedores, modelos, precios (con fuente), calcularCosto().
  config.js        Presupuesto, vidas, formatos de video, divulgación.
  timeline.js      Escenas y tiempos del video (75 s). escenaEn(t), viajeroEn(t, n).
  juego.js         evaluarDecision, simularJuego, resumirProveedor, calcularEstadisticas.
  formato.js       usd(), segundos(), porcentaje(), factor().
  guion.js         segmentosGuion(estadisticas): texto de voz por tramo, basado en los datos.
data/viajeros.json 60 viajeros con documentos, lo que dicen y la respuesta correcta.
scripts/validar-viajeros.mjs   Verifica que cada respuesta correcta se deduzca de las reglas.
bench/             Benchmark en Node (llamadas reales a las APIs).
  run.mjs          CLI. --probe, --limit N, --proveedores gpt,opus,jev
  providers/*.mjs  Un adaptador por API: anthropic.mjs, openai.mjs, typesafe.mjs
  demo.mjs         Genera public/runs/demo.json (source: "demo").
src/               App React: el juego/video. Todo se dibuja en función del tiempo t.
render/            Render a MP4 (Playwright + ffmpeg), guion y subtítulos.
public/runs/       Corridas (demo.json, latest.json, <fecha>.json).
```

## Contrato: `data/viajeros.json`

```json
{
  "version": 1,
  "viajeros": [
    {
      "id": "v01",
      "nombre": "Ana Kovač",
      "semilla": 1234,
      "documento": {
        "nombre": "Ana Kovač",
        "nacionalidad": "Brenia",
        "vence": "02/11/1986",
        "permiso": "turismo",
        "permisoNombre": "Ana Kovač",
        "equipajeDeclarado": "Ropa y una cámara de fotos",
        "inspeccion": "Ropa y una cámara de fotos. Nada irregular."
      },
      "dice": "Vengo a conocer la capital, me quedo una semana.",
      "verdad": { "pasa": true, "miente": false, "peligro": 0, "accion": "aprobar" },
      "porque": "Pasaporte vigente, permiso de turismo que coincide con su motivo, inspección limpia.",
      "dificultad": "facil",
      "claves": { "buscado": false, "armas": false, "contrabandoNoDeclarado": false, "contradiccionMenor": false, "motivoDicho": "turismo", "otraMentira": null }
    }
  ]
}
```

- `documento.permiso`: `null` = ciudadano de Valdoria (no requiere); `"ninguno"` = extranjero sin permiso;
  si no, el tipo: `"turismo" | "trabajo" | "visita familiar" | "estudios" | "tránsito"`.
- `documento.permisoNombre`: nombre escrito en el permiso (si no coincide con `nombre`, el documento es falso). Omitir si `permiso` es `null` o `"ninguno"`.
- `semilla`: entero para generar el retrato pixel art de forma determinista.
- `verdad.peligro`: 0 a 4 (índice de `NIVELES_PELIGRO`).
- `dificultad`: `"facil" | "media" | "dificil"`.
- `claves`: banderas estructuradas que usa `scripts/validar-viajeros.mjs` para recalcular la respuesta correcta. **No** se envían a las IAs.

## Contrato: corrida (`public/runs/*.json`)

```json
{
  "version": 1,
  "source": "live",
  "createdAt": "2026-10-10T18:00:00.000Z",
  "nota": "texto libre opcional",
  "juego": { "presupuestoUSD": 0.25, "vidas": 3 },
  "commit": "48545c32c2d4d6e42307acbea9893ec72f79335f",
  "cambiosSinCommit": false,
  "huellaPrompt": "8b6d3d473be1",
  "basePeligroJev": null,
  "parcial": false,
  "probe": false,
  "viajeros": ["v01", "v02"],
  "proveedores": [
    { "id": "gpt", "nombre": "GPT-6 Astra", "empresa": "OpenAI", "modelo": "gpt-6-astra", "color": "#19c37d",
      "precio": { "entradaPorMTok": 10, "entradaCacheadaPorMTok": 1, "salidaPorMTok": 50, "fuente": "...", "verificado": false, "fecha": "2026-10-10" },
      "opciones": { "reasoningEffort": "low" } }
  ],
  "resultados": {
    "gpt": [
      {
        "viajeroId": "v01",
        "ok": true,
        "error": null,
        "decision": { "pasa": true, "miente": false, "peligro": 0, "accion": "aprobar" },
        "confianza": null,
        "salidaTexto": "{\"pasa\":true,...}",
        "crudo": "respuesta HTTP cruda, recortada a 4000 caracteres",
        "tokens": { "entrada": 612, "entradaCacheada": 0, "salida": 180, "razonamiento": 120, "estimado": false },
        "costoUSD": 0.0151,
        "costoReportadoUSD": null,
        "latenciaMs": 2310,
        "modeloServido": "gpt-6-astra-2026-09-03",
        "fallback": false,
        "idRespuesta": "chatcmpl-...",
        "requestId": "req_...",
        "huellaEstado": "3f2a9c0d1b7e",
        "intentos": 1,
        "registradoAt": "2026-10-10T18:00:03.120Z",
        "opcionesUsadas": { "reasoningEffort": "low", "estiloApi": "chat" }
      },
      {
        "viajeroId": "v02",
        "ok": false,
        "error": "GPT se negó a responder: ...",
        "codigoError": "negativa",
        "decision": null,
        "tokens": { "entrada": 640, "entradaCacheada": 0, "salida": 35, "razonamiento": null, "estimado": false },
        "costoUSD": 0,
        "costoFacturadoUSD": 0.00815,
        "latenciaMs": null,
        "...": "mismos campos de registro que arriba"
      }
    ],
    "opus": [],
    "jev": []
  }
}
```

Corrida (primer nivel):
- `juego`: presupuesto y vidas **registrados antes de correr** (copiados de `JUEGO` en `shared/config.js`).
  El juego usa estos, no los de la configuración actual; si cambian después, la corrida no es publicable.
- `commit`: `git rev-parse HEAD` al empezar (null si no se pudo). `cambiosSinCommit`: true si había archivos
  versionados de `la-frontera/` modificados (null si no se sabe). Sirven para reproducir la corrida.
- `huellaPrompt`: sha256 (12 caracteres) del prompt de sistema, el esquema JSON y las preguntas de Jev.
  `--continuar` se niega a seguir si cambió (no se mezclan resultados de dos prompts). Cada resultado
  tiene además `huellaEstado` (texto que recibió la IA para ese viajero).
- `basePeligroJev`: `TYPESAFE_SCORE_BASE` con que se interpretó el peligro numérico de Jev (0, 1 o null).
- `parcial`: true con `--limit`, con un subconjunto de proveedores o en `--probe`. `probe`: true en `--probe`.
  Ninguna de las dos se publica.
- `recalculos` (opcional): historia de `npm run recalcular` (fecha y precios de antes y después).
- `actualizadoAt` (opcional): última escritura durante la corrida o al continuarla.

Cada resultado:
- `confianza`: solo Jev la entrega: `{ "pasa": 0.91, "miente": 0.12, "peligro": 0.77, "accion": 0.88 }`
  (probabilidad de la respuesta elegida, en 0-1). Para GPT y Opus es `null`.
- `tokens.salida` incluye los tokens de razonamiento interno (se cobran como salida); `razonamiento` los desglosa si la API los reporta.
  **`tokens.salida: null`** = la API no informó la salida (no se asume 0; la pantalla debe decir "no informa").
  Un `0` es un cero informado por la API.
- `tokens.estimado: true` si la API no reportó la entrada y se estimó (caracteres / 4 × 1,5). Se avisa en pantalla.
- `costoUSD` = `calcularCosto(precio, tokens)` en respuestas válidas; 0 en errores.
- `costoFacturadoUSD` (solo errores): lo que la API cobró aunque la respuesta no sirviera (negativa, JSON
  inválido, formato no reconocido), calculado con los tokens que informó. `null` si no hubo respuesta
  (red, tiempo agotado, HTTP de error). El juego lo descuenta del presupuesto (`costoReal` de `shared/juego.js`).
- `costoReportadoUSD`: costo que informó la propia API, si lo hizo (si no, null). El benchmark avisa si
  difiere más de 5 % del calculado.
- `latenciaMs`: tiempo de la petición HTTP que tuvo éxito (sin contar reintentos); null en errores.
- `idRespuesta`: id que la API dio a la respuesta (cuerpo); `requestId`: cabecera `request-id` / `x-request-id`.
  Permiten confrontar cada llamada con el panel del proveedor. null si no los informó.
- `opcionesUsadas`: opciones **tal como salieron en la petición**, con TODAS las declaradas en
  `proveedor.opciones` (GPT: `{ reasoningEffort, estiloApi }`; Opus: `{ effort }`; Jev: `{}`). El benchmark nunca
  quita una opción en silencio: si la API la rechaza, la llamada falla con `codigoError: "opcion_no_admitida"`.
- `fallback`: siempre false. Opus se llama sin respaldo del lado del servidor; si otro modelo respondiera,
  sería un error (`codigoError: "fallback"`), nunca una respuesta de Opus.
- `intentos`: llamadas hechas para este resultado; `erroresPrevios` (opcional): mensaje de cada intento fallido
  que se reintentó. Tiempo límite: 180 s para GPT y Opus (a lo sumo 1 reintento por tiempo agotado), 30 s para Jev.
- `reemplazaA` (opcional): con `--reintentar-errores`, los resultados fallidos que este reemplazó
  (`error`, `codigoError`, `intentos`, `tokens`, `costoFacturadoUSD`, ids). No se borran.
- `registradoAt`: cuándo se guardó el resultado.
- Errores: `ok: false`, `decision: null`, `error: "mensaje"`, `codigoError` (`http`, `red`, `tiempo_agotado`,
  `negativa`, `json_invalido`, `esquema`, `max_tokens`, `incompleta`, `formato`, `opcion_no_admitida`,
  `configuracion`, `cuota`, `autenticacion`, `fallback`, `api`), `costoUSD: 0`.

Publicación: `shared/publicable.js` decide si un video se puede publicar con la corrida. `bench/run.mjs`
solo copia a `latest.json` si no hay más bloqueos que los que se arreglan después sin repetir la corrida
(precio sin verificar o cambiado: `npm run recalcular`; divulgación: `shared/config.js`), y nunca si alguna
respuesta de Jev quedó con formato no reconocido (fallo del parser, no de Jev).
`node bench/chequear-corrida.mjs <archivo> [--completa]` revisa este contrato.

## Contrato: app (`src/`)

Parámetros de URL:

| Parámetro | Valores | Efecto |
|---|---|---|
| `formato` | `vertical` (por defecto), `feed`, `horizontal` | Tamaño del lienzo (ver `VIDEO.formatos`) |
| `run` | `latest` (por defecto; si no existe usa `demo`), `demo`, o un nombre de archivo sin `.json` | Corrida que se carga desde `runs/` |
| `render` | `1` | Modo render: sin controles, lienzo exacto al tamaño de la ventana, tiempo controlado desde afuera |
| `subs` | `1` | Dibuja subtítulos del guion (`segmentosGuion`) |
| `t` | segundos | Tiempo inicial (vista previa) |

En modo render la app expone:

```js
window.__frontera = {
  listo: false,          // true cuando la corrida, los datos y las fuentes están cargados
  duracion: 75,          // DURACION de shared/timeline.js
  fps: 30,
  esDemo: true,          // run.source !== 'live'
  setTiempo(t) {},       // dibuja el cuadro del segundo t de forma síncrona (flushSync) y devuelve una Promise resuelta
}
```

Reglas de dibujo:
- Todo lo visible es una función pura de `t` (y de los datos). **Nada** de `transition`, `animation` de CSS,
  `Date.now()`, `Math.random()` ni `requestAnimationFrame` en el modo render. En la vista previa, el reloj
  avanza con `requestAnimationFrame` y llama a la misma función de dibujo.
- La marca de agua de demo se dibuja siempre que `run.source !== 'live'`; no se puede desactivar por parámetro.
- Las fuentes vienen de `@fontsource/press-start-2p` y `@fontsource/inter` (nada de Google Fonts por red).

## Contrato: guion (`shared/guion.js`)

`segmentosGuion(estadisticas)` devuelve `[{ inicio, fin, escena, texto, enPantalla }]`, alineados con
`ESCENAS` de `shared/timeline.js`. El texto se elige según los datos (por ejemplo, solo dice
"solo una llegó al final" si eso pasó). Ritmo máximo: 2,5 palabras por segundo.
