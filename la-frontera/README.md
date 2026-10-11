# La Frontera

Un juego y un video de 75 segundos para LinkedIn y redes sociales: un guardia de frontera estilo
*Papers, Please* con **tres cerebros** que toman exactamente las mismas decisiones:

- **GPT-6 Astra** (OpenAI, modelo `gpt-6-astra`)
- **Claude Opus 5.5** (Anthropic)
- **Jev** (TypeSafe)

Pasan 60 viajeros. Por cada uno, las tres IAs reciben el mismo texto (reglas, documentos y lo que
dice el viajero) y responden las mismas 4 preguntas: ¿puede pasar?, ¿miente?, nivel de peligro y qué
hacer (aprobar, rechazar, interrogar o arrestar). Cada una tiene el mismo presupuesto y 3 vidas; gana
la que dure más. En pantalla se ven contadores de **costo, velocidad y aciertos**.

Es una comparación contra **modelos insignia** (GPT-6 Astra y Claude Opus 5.5, con el esfuerzo de
razonamiento en `low`). Hay modelos de lenguaje mucho más baratos (por ejemplo, Claude Haiku 5.5) que
no se probaron: el video, la voz y el texto de LinkedIn lo dicen.

El video sale en tres formatos: vertical 9:16 (Reels, TikTok, Shorts), feed 4:5 (LinkedIn,
Instagram) y horizontal 16:9 (LinkedIn, YouTube).

## Principio de honestidad

El autor publica esto para mostrar a Jev: por eso nada puede quedar abierto a una acusación fundada
de trampa.

- **Ningún número se inventa.** Todo sale de una corrida real del benchmark (llamadas reales a las
  tres APIs), guardada en `public/runs/`. El costo es: tokens que informa cada API × precio por
  millón de tokens (con fuente y fecha). Las llamadas con error que la API cobró también cuentan.
- **Una sola regla decide si se puede publicar**: `shared/publicable.js`. La usan la app (marca de
  agua), el render (nombre del archivo y código de salida), el guion (`GUION.md`) y el benchmark
  (copia a `latest.json`). Bloquean, entre otros: datos demo, corrida parcial o de prueba, más de
  10 % de errores de API, una llamada que no usó la configuración declarada (por ejemplo,
  `reasoning_effort`), un precio sin verificar o distinto del de `shared/modelos.js`, presupuesto o
  vidas no registrados o cambiados, y la **divulgación vacía**.
- **NO-PUBLICAR.** Con cualquier bloqueo, **todo** cuadro del video lleva marca de agua («DEMO ·
  datos simulados» o «NO PUBLICABLE · motivo»), los archivos se llaman `...-demo.mp4` o
  `...-NO-PUBLICAR.mp4` (también los fotogramas), la consola lista los motivos con cómo resolverlos
  y `npm run video` termina con código de error. El archivo se genera igual, solo para revisarlo.
  `GUION.md` muestra los mismos bloqueos arriba de todo. Un video así **no se publica**.
- **El presupuesto y las vidas se fijan antes de correr.** El benchmark los guarda dentro de la
  corrida (`juego`) al empezar, y el video usa esos, no los de `shared/config.js`. Cambiarlos después
  de ver los resultados es un bloqueo («Presupuesto o vidas cambiados después de la corrida»).
- **Ganadores con empates honestos** (`calcularGanadores` en `shared/juego.js`; la pantalla, la voz
  y el texto de LinkedIn usan la misma función): diferencias de **2 casos o menos** en aciertos son
  empate (una sola corrida de 60 casos no distingue más); un costo gana solo si es al menos 5 %
  menor; la velocidad se compara en décimas de segundo, como se ve en pantalla; en duración, llegar
  al final vale más que cualquier cantidad de decisiones.
- **El texto de la voz se elige según los datos**: si Jev no gana en algo (por ejemplo, en
  aciertos), el guion lo dice tal cual. La conclusión «Los modelos generativos, para crear. Jev,
  para decidir.» solo aparece si Jev gana o empata en aciertos y también en costo; si no, el cierre
  dice quién conviene si cada acierto cuenta y quién si manda el costo. No se dice que un modelo
  «razona» si no se midió razonamiento, ni que Jev devuelve «0 tokens de salida» si su API no los
  informa.
- **Divulgación obligatoria** (ver «Divulgación» más abajo): va en la primera línea del texto de
  LinkedIn, en la voz del cierre y en pantalla. Si no cabe en la voz, el guion da error en vez de
  omitirla.
- **Verificable.** El cierre muestra el archivo de la corrida y su huella sha256; súbelo al
  repositorio público junto con el código.

## Lo que necesitas

- Node.js 22 y `ffmpeg` (para el video). En el entorno de Claude Code ya están instalados.
- Las tres claves de API (solo para el paso 4; todo lo demás funciona con la demo).

## Paso a paso

### 1. Configura las claves de API (una sola vez)

Necesitas tres variables de entorno:

```
ANTHROPIC_API_KEY=...
OPENAI_API_KEY=...
TYPESAFE_API_KEY=...
```

- **En Claude Code en la nube:** en la configuración del entorno, sección de variables de entorno,
  agrega una línea por clave como arriba. Después abre una sesión nueva para que se carguen.
- **En tu computadora:** escríbelas en un archivo `la-frontera/.env` (está en `.gitignore`, no se
  sube a GitHub; el benchmark lo lee solo).
- **Nunca pegues una clave en un chat**, tampoco en uno con Claude.

La red del entorno debe permitir estos dominios: `api.openai.com`, `api.anthropic.com` y
`api.typesafe.ai` (en la configuración de red del entorno, acceso personalizado / dominios permitidos).

### 2. Instala las dependencias

```
cd la-frontera
npm install
```

### 3. Prueba las tres APIs con un solo viajero

```
npm run probar-apis
```

Llama una vez a cada API con el viajero `v02` e imprime lo que se envió, la respuesta HTTP cruda,
la decisión leída, los tokens y el costo. Revisa:

- **Jev:** el formato exacto de su respuesta no estaba confirmado; el lector acepta varias formas.
  Si dice que no reconoce la respuesta, copia el JSON crudo que imprime y pídele a Claude que ajuste
  `bench/providers/typesafe.mjs`. Comprueba que salgan las 4 respuestas con su probabilidad.
- **GPT:** si OpenAI responde que el modelo no existe, define `OPENAI_MODEL` con el nombre exacto
  que aparece en tu cuenta de OpenAI (por ejemplo `OPENAI_MODEL=gpt-6-astra-2026-09-03`).
  Si OpenAI no acepta `reasoning_effort: "low"`, el benchmark **se detiene** (no lo quita en silencio:
  GPT correría con otro esfuerzo y otro costo que los publicados). Pon un valor admitido en
  `shared/modelos.js` y repite la prueba.
- **OPENAI_API_STYLE:** `chat` (por defecto) o `responses`. Si el modelo no se admite en la API de
  chat, el script reintenta con `responses` (mismas opciones) y te avisa; para dejarlo fijo, define
  `OPENAI_API_STYLE=responses`.
- **Jev:** si devuelve el nivel de peligro como número, define `TYPESAFE_SCORE_BASE` (0 o 1) según
  su escala. Opcional: `TYPESAFE_MODEL` si TypeSafe te indica otro nombre de modelo.
- Que los tokens y el costo tengan sentido, y el «modelo servido» de cada una.

### 4. Corre el benchmark completo

```
npm run benchmark
```

**Antes de correrlo, deja fijos el presupuesto y las vidas** en `JUEGO` de `shared/config.js`: la
corrida los guarda al empezar y el video usa esos. No se cambian después de ver los resultados.

Pasa los 60 viajeros por las tres IAs. **Antes de empezar imprime el costo estimado** (unos pocos
dólares con los precios actuales; las cifras exactas las calcula `bench/run.mjs` al arrancar) y, en
una terminal interactiva, pide confirmación (`--si` para no preguntar).

Guarda `public/runs/<fecha>.json` y lo copia a `public/runs/latest.json` (la corrida que usa el
video) solo si no tiene bloqueos de `shared/publicable.js`, salvo los que se arreglan después sin
repetir la corrida: precios sin verificar (`npm run recalcular`) y la divulgación. Si no la copia,
dice por qué.

Opciones (se pasan después de `--`, por ejemplo `npm run benchmark -- --limit 5`):

| Opción | Qué hace |
|---|---|
| `--probe` | Prueba con un solo viajero (lo mismo que `npm run probar-apis`). |
| `--limit N` | Solo los primeros N viajeros (no toca `latest.json`). |
| `--proveedores gpt,opus,jev` | Solo esos proveedores (no toca `latest.json`). |
| `--continuar ARCHIVO` | Retoma una corrida cortada (salta los viajeros que ya tienen resultado). Ejemplo: `--continuar 2026-10-10_18-00-00` (el nombre del archivo de `public/runs/`, con o sin `.json`). |
| `--reintentar-errores` | Con `--continuar`, vuelve a llamar a los viajeros que terminaron en error (el error anterior queda registrado en `reemplazaA`). |
| `--concurrencia N` | Viajeros a la vez (por defecto 2; los 3 proveedores de un viajero van en paralelo). |
| `--si` | No pide confirmación antes de gastar. |

### 4b. Verifica los precios y recalcula (sin repetir el benchmark)

Los precios marcados `verificado: false` en `shared/modelos.js` vienen de agregadores, no de la
página oficial, y **bloquean la publicación**. Para cada uno:

1. Confírmalo en la página oficial (la dirección está en su campo `fuente`).
2. Corrígelo en `shared/modelos.js` con `verificado: true`, la `fuente` y la `fecha` de consulta.
3. Corre:

```
npm run recalcular
```

Recalcula el costo de `public/runs/latest.json` (y de su archivo con fecha) con los precios nuevos, a
partir de los tokens guardados: no llama a ninguna API y no toca decisiones, latencias ni reglas.
Deja registro del cambio en la corrida (`recalculos`). Para ver antes/después sin escribir:
`npm run recalcular -- --simular`.

### 5. Mira el video en el navegador

```
npm run dev
```

Abre la dirección que aparece (normalmente http://localhost:5173). Debajo del video hay controles:
reproducir/pausa (también con la barra espaciadora), barra de tiempo, formato, corrida y subtítulos.

### 6. Genera el texto para grabar la voz

```
npm run guion
```

Crea `GUION.md` y `out/subtitulos.srt`. `GUION.md` trae, en este orden:

- **Arriba de todo, los bloqueos y avisos** de `shared/publicable.js`, cada uno con cómo resolverlo
  (si falta la divulgación, un aviso grande aparte).
- Cada tramo con su tiempo, el texto a grabar y lo que se ve; el texto completo de corrido; consejos
  para grabar y sincronizar.
- Una propuesta de publicación para LinkedIn: la **divulgación en la primera línea**, el presupuesto
  fijado antes de correr y lo que costaba atender a los 60 viajeros, los resultados, la conclusión
  (solo si los datos la sostienen), la sección «Lo que también hay que decir» (modelos insignia y
  Claude Haiku 5.5 sin probar, latencia medida desde tu red, una sola corrida, empates, marcas), la
  configuración **realmente usada** en cada llamada y los precios por millón de tokens con fuente y
  fecha.
- Hashtags y el checklist.

Si todavía usas la demo, `GUION.md` lo avisa arriba en grande: vuelve a generarlo después del
benchmark, porque los números cambian. Para elegir otra corrida: `npm run guion -- --run demo`.

### 7. Renderiza los videos

```
npm run video -- --formato todos
npm run video -- --formato todos --subtitulos
```

La segunda versión trae los subtítulos dibujados: **es la recomendada para LinkedIn**, porque la
mayoría ve los videos sin sonido. Los archivos quedan en `out/`:

- `out/la-frontera-vertical.mp4`, `-feed.mp4`, `-horizontal.mp4`
- con subtítulos: `out/la-frontera-vertical-subs.mp4`, etc.
- si la corrida es la demo, el nombre termina en `-demo`; si tiene cualquier otro bloqueo de
  `shared/publicable.js`, en `-NO-PUBLICAR`. En los dos casos el video lleva marca de agua, la
  consola lista los motivos con cómo resolverlos y el comando termina con código de error.
  **No se publican.** (Lo mismo vale para los fotogramas de `--fotogramas`.)

Tiempos medidos en este entorno (4 CPU): el video vertical completo con subtítulos tarda unos
2 minutos (incluida la construcción de la app); los tres formatos, unos 6 minutos. Al final, el
script comprueba con `ffprobe` la resolución, los cuadros por segundo y la duración.

Otras opciones: `--run <nombre>` (otra corrida de `public/runs/`), `--fps 30`, `--calidad 18`
(CRF de x264; menor = mejor calidad y archivo más pesado), `--desde 14 --hasta 18` (solo un tramo,
para probar), `--fotogramas 2,20,62` (solo imágenes PNG en `out/fotogramas/`), `--sin-build`
(no reconstruye la app), `--en-serie` y `--trabajos N` (cuántos navegadores usa por formato).

### 8. Graba la voz y únela al video

Sigue `GUION.md`: la voz empieza en 0:00 y cada tramo empieza en su tiempo. Lo más fácil es grabar
cada tramo como un archivo aparte y colocarlo en CapCut, Premiere o DaVinci en su segundo de inicio
(en `GUION.md` están los pasos para cada editor). Si prefieres poner los subtítulos en el editor,
importa `out/subtitulos.srt` sobre el video sin subtítulos.

### 9. Antes de publicar

El checklist completo está al final de `GUION.md`. Lo esencial:

- [ ] `GUION.md` no muestra bloqueos y los archivos del video **no** terminan en `-demo` ni en
      `-NO-PUBLICAR` (sin marca de agua).
- [ ] Confirmaste en la página oficial los precios marcados `verificado: false` y corriste
      `npm run recalcular`.
- [ ] Los nombres de los modelos y la configuración usada coinciden con lo declarado (están en `GUION.md`).
- [ ] Escribiste la divulgación (ver «Divulgación» más abajo) y sigue en la primera línea del texto.
- [ ] No quitaste «Lo que también hay que decir» del texto de LinkedIn.
- [ ] Subiste al repositorio público el archivo de la corrida (su sha256 sale en el cierre).
- [ ] Viste el video completo, la voz coincide con la pantalla y el enlace del método funciona.

## Versión simulación (con tu voz)

Una **segunda composición**, independiente del juego con corridas del benchmark: el video de 93 s
sincronizado con tu voz leyendo `GUION-LIBRE.md`. Se presenta todo como **simulación ilustrativa**
con **costos estimados** (precios publicados × tokens supuestos); no llama a ninguna API ni usa
`public/runs/`. La composición del juego (`index.html`, `npm run video`) no cambia.

**Qué necesitas:** `audio/voz.m4a` (tu voz limpia; está en `.gitignore`: **nunca** la subas al
repositorio ni la copies a `public/` o `dist/`) y `sim/voz.json` (tiempos de cada frase).

```
npm run dev                 # abre http://localhost:5173/sim.html (vista previa CON tu voz)
npm run video:sim -- --formato todos              # out/la-frontera-simulacion-<formato>.mp4
npm run video:sim -- --formato vertical --subtitulos   # ...-vertical-subs.mp4 (subtítulos dibujados)
npm run subtitulos:sim      # solo out/subtitulos-simulacion.srt
```

- **Vista previa** (`/sim.html`): reproducir/pausa (barra espaciadora), barra de tiempo con las
  secciones de la voz, formato y subtítulos. La voz suena **solo** con `npm run dev` (el servidor de
  desarrollo la sirve desde `audio/voz.m4a`); en `dist/` no hay audio.
- **Render**: `node render/render.mjs --composicion sim` acepta las mismas opciones que el juego
  (`--formato todos`, `--subtitulos`, `--fotogramas 2,30,66`, `--desde/--hasta`, `--sin-build`,
  `--trabajos N`) y además `--audio <ruta>` (por defecto `audio/voz.m4a`). El video dura lo que dice
  `sim/voz.json` (93 s); el audio se mezcla al final (video copiado sin recomprimir, audio AAC 192k;
  manda la duración del video). Cada render también escribe `out/subtitulos-simulacion.srt` (líneas
  de ~40 caracteres, máximo 2), para subirlo aparte si prefieres subtítulos del reproductor.
- **Salida**: `out/la-frontera-simulacion-<formato>[-subs].mp4`. Si hubiera un bloqueo, el nombre
  termina en `-NO-PUBLICAR`, el video lleva marca de agua y el comando termina con código 1.
- **Publicación**: solo aplica la regla de divulgación. Con `PUBLICACION.relacionTypeSafe: 'ninguna'`
  (`shared/config.js`) no se muestra ninguna divulgación ni etiqueta y no hay bloqueo. Si fuera
  `'declarada'`, `PUBLICACION.divulgacion` se muestra en el video y es obligatoria. Los precios no
  verificados **no** bloquean la simulación: se rotulan «precio de fuentes secundarias».

**Reglas de honestidad (las cumple el video):**

- Etiqueta fija durante todo el video: «SIMULACIÓN ILUSTRATIVA · costos estimados con precios publicados».
- Sin aciertos, vidas, errores, velocidades, coronas de ganador ni GAME OVER: aquí no se midió nada.
- Únicos números: precios por millón de tokens (con fuente y si están verificados) y los costos y
  decisiones estimados de `shared/simulacion.js`, siempre con «≈», «estimado», rango y supuestos
  (≈875 tokens de entrada para GPT y Opus, ≈773 para Jev; GPT y Opus escriben 40–300 tokens, 150 en el centro).
- Los sellos de los viajeros de ejemplo son su **respuesta correcta** (`data/viajeros.json`), la misma
  en las tres columnas y rotulada «respuesta correcta» (no es lo que contestó cada modelo): se compara
  costo, no aciertos. Los tokens que se escriben y
  las probabilidades de Jev en «cómo responde» van rotulados «ejemplo ilustrativo» / «valores de ejemplo».
- La conclusión va rotulada como **opinión**; el cierre muestra fuentes de precios con fecha,
  supuestos, que hay modelos de lenguaje más baratos sin comparar (Claude Haiku 5.5: US$ 0.10 / 0.50
  por millón de tokens), las marcas y el enlace al método.

**Si vuelves a grabar la voz:** actualiza `sim/voz.json` (duración, secciones y frases) y los momentos
de `src/sim/tiempos.js` (cada elemento entra cuando la voz lo nombra). `npm test` comprueba que cada
momento caiga dentro de su sección y que el `.srt` coincida con las frases.

## El flujo completo, en resumen

1. Fija `JUEGO` (presupuesto y vidas) y `PUBLICACION.divulgacion` en `shared/config.js`.
2. `npm run probar-apis` (un viajero; revisa formato, modelo y opciones).
3. `npm run benchmark` (60 viajeros; guarda la corrida con sus reglas y la copia a `latest.json` si se puede).
4. Verifica los precios en las páginas oficiales → `shared/modelos.js` (`verificado: true`) → `npm run recalcular`.
5. `npm run guion` → revisa que arriba de `GUION.md` no quede ningún bloqueo.
6. `npm run video -- --formato todos --subtitulos` (y sin `--subtitulos` si quieres poner la voz encima).
7. Graba la voz con `GUION.md`, únela al video y publica con el texto propuesto.

## Cómo cambiar cosas

**Presupuesto y vidas** — `shared/config.js`, objeto `JUEGO`:

```js
presupuestoUSD: 0.25, // lo mismo para las tres
vidas: 3,             // se pierde una al dejar pasar una amenaza o arrestar a un inocente
```

**Se fijan antes de correr el benchmark y no se cambian después.** Quién «dura más» depende sobre
todo del presupuesto: ajustarlo después de ver los resultados sería elegir al ganador. Por eso cada
corrida guarda los valores con los que empezó (`juego`) y el video usa esos; si `shared/config.js`
dice otra cosa, es un bloqueo («Presupuesto o vidas cambiados después de la corrida»). Para probar
otro presupuesto hay que correr el benchmark de nuevo. Los aciertos y los errores graves siempre
cuentan los 60 casos, sin límite de presupuesto, y la tabla muestra lo que costó atenderlos a todos.

**Precios** — `shared/modelos.js`, campo `precio` de cada proveedor (dólares por millón de tokens de
entrada, entrada en caché y salida, más `fuente`, `verificado` y `fecha`). Cada corrida guarda una
copia de los precios con los que calculó el costo. Si corriges un precio, corre `npm run recalcular`
(recalcula con los tokens guardados, sin llamar a las APIs); mientras la corrida tenga un precio
distinto del de `shared/modelos.js`, o sin verificar, el video no se puede publicar.

**Divulgación (obligatoria)** — `shared/config.js`, objeto `PUBLICACION`:

```js
divulgacion: 'Colaboración pagada con TypeSafe', // o 'Sin relación comercial con TypeSafe'
enlaceMetodo: 'github.com/Leojar79/proyects/tree/main/la-frontera', // método, código y datos
```

Tu relación con TypeSafe en una frase, **aunque no haya ninguna** («Sin relación comercial con
TypeSafe»). Vacía, bloquea la publicación. Aparece en la primera línea del texto de LinkedIn, en la
voz del cierre y en pantalla durante todo el video. Si es tan larga que no cabe en la voz (unas 10
palabras), `npm run guion` da error: acórtala en vez de omitirla. Después de cambiarla, vuelve a
generar el guion y los videos.

## Pruebas

```
npm run validar                    # las respuestas correctas de los 60 viajeros salen de las reglas
npm test                           # todo: benchmark, adaptadores (sin red), guion y simulación
node --test render/guion.test.mjs  # el guion: ritmo, empates y frases verdaderas en miles de corridas al azar
node bench/chequear-corrida.mjs public/runs/latest.json --completa
```

## Qué hay en cada carpeta

| Ruta | Qué es |
|---|---|
| `shared/` | Reglas, preguntas, modelos y precios, configuración, línea de tiempo, cálculo del juego, formato de números y guion de voz. Lo usan el benchmark, la app y el render. |
| `data/viajeros.json` | Los 60 viajeros con sus documentos y la respuesta correcta. |
| `bench/` | El benchmark (llamadas reales a las APIs), `recalcular.mjs` (precios verificados) y la corrida demo (`npm run demo`). |
| `src/` | La app: el video se dibuja en el navegador en función del tiempo. |
| `render/` | `guion.mjs` (GUION.md y subtítulos), `render.mjs` (MP4 con Playwright y ffmpeg; `--composicion sim` para la simulación) y `srt-sim.mjs` (subtítulos de la simulación). |
| `src/sim/`, `sim.html` | La composición «simulación» (video con tu voz). |
| `sim/voz.json` | Tiempos de la voz grabada: secciones y frases. |
| `audio/` | Tu voz (`voz.m4a`). No se sube a GitHub. |
| `public/runs/` | Corridas: `demo.json`, `latest.json` y una por fecha. |
| `out/` | Lo que se genera: videos, subtítulos y fotogramas (no se sube a GitHub). |

Detalles técnicos y contratos entre las partes: `ARQUITECTURA.md`.

## Problemas comunes

- **«No encontré ninguna corrida»**: corre `npm run demo` (demostración) o `npm run benchmark` (real).
- **El video dice DEMO**: todavía no hay `public/runs/latest.json` real; corre el benchmark.
- **El video dice NO PUBLICABLE o el archivo termina en `-NO-PUBLICAR`**: mira arriba de `GUION.md`
  (o la consola del render) la lista de bloqueos y cómo resolver cada uno.
- **`npm run guion` dice que la divulgación no cabe**: acórtala en `shared/config.js` (unas 10 palabras como máximo).
- **«No encontré ffmpeg»**: instálalo (en Ubuntu: `sudo apt install ffmpeg`; en Mac: `brew install ffmpeg`).
- **No abre Chromium (en tu computadora)**: instala el navegador de Playwright con `npx playwright install chromium`.
- **Cambiaste algo en `src/` y el video no lo muestra**: no uses `--sin-build`.
