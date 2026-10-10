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
  "viajeros": ["v01", "v02"],
  "proveedores": [
    { "id": "gpt", "nombre": "GPT Astra", "empresa": "OpenAI", "modelo": "gpt-astra", "color": "#19c37d",
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
        "latenciaMs": 2310,
        "modeloServido": "gpt-astra-2026-09-03",
        "fallback": false
      }
    ],
    "opus": [],
    "jev": []
  }
}
```

- `confianza`: solo Jev la entrega: `{ "pasa": 0.91, "miente": 0.12, "peligro": 0.77, "accion": 0.88 }`
  (probabilidad de la respuesta elegida). Para GPT y Opus es `null`.
- `tokens.salida` incluye los tokens de razonamiento interno (se cobran como salida); `razonamiento` los desglosa si la API los reporta.
- `tokens.estimado: true` si la API no reportó tokens y se estimaron (caracteres / 4). Se avisa en pantalla.
- `costoUSD` = `calcularCosto(precio, tokens)`.
- `latenciaMs`: tiempo de la petición HTTP que tuvo éxito (sin contar reintentos).
- Errores: `ok: false`, `decision: null`, `error: "mensaje"`, `costoUSD: 0`.

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
"solo una llegó al final" si eso pasó). Ritmo máximo: 2,6 palabras por segundo.
