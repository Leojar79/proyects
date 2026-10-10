# La Frontera

Un juego y un video de 75 segundos para LinkedIn y redes sociales: un guardia de frontera estilo
*Papers, Please* con **tres cerebros** que toman exactamente las mismas decisiones:

- **GPT Astra** (OpenAI)
- **Claude Opus 5.5** (Anthropic)
- **Jev** (TypeSafe)

Pasan 60 viajeros. Por cada uno, las tres IAs reciben el mismo texto (reglas, documentos y lo que
dice el viajero) y responden las mismas 4 preguntas: ¿puede pasar?, ¿miente?, nivel de peligro y qué
hacer (aprobar, rechazar, interrogar o arrestar). Cada una tiene el mismo presupuesto y 3 vidas; gana
la que dure más. En pantalla se ven contadores de **costo, velocidad y aciertos**.

El video sale en tres formatos: vertical 9:16 (Reels, TikTok, Shorts), feed 4:5 (LinkedIn,
Instagram) y horizontal 16:9 (LinkedIn, YouTube).

## Principio de honestidad

- **Ningún número se inventa.** Todo sale de una corrida real del benchmark (llamadas reales a las
  tres APIs), guardada en `public/runs/`. El costo es: tokens que informa cada API × precio público.
- **Mientras no haya corrida real**, se usa una corrida de demostración y **todo** cuadro del video
  lleva la marca de agua «DEMO · datos simulados — no son resultados reales». No se puede quitar.
  Un video con esa marca **no se publica**.
- **El texto de la voz se elige según los datos**: si Jev no gana en algo (por ejemplo, en
  aciertos), el guion lo dice tal cual.
- **Precios con fuente y fecha.** Los que no se confirmaron en la página oficial se avisan en
  pantalla y en el checklist.

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
  que aparece en tu cuenta de OpenAI (por ejemplo `OPENAI_MODEL=gpt-astra-2026-09-03`).
- **OPENAI_API_STYLE:** `chat` (por defecto) o `responses`. Si la API de chat falla, el script
  reintenta solo con `responses` y te avisa; para dejarlo fijo, define `OPENAI_API_STYLE=responses`.
- Opcional: `TYPESAFE_MODEL` si TypeSafe te indica otro nombre de modelo.
- Que los tokens y el costo tengan sentido, y el «modelo servido» de cada una.

### 4. Corre el benchmark completo

```
npm run benchmark
```

Pasa los 60 viajeros por las tres IAs. **Antes de empezar imprime el costo estimado**; con los
precios actuales son unos pocos dólares: aproximadamente US$ 2.40 en total (GPT ~US$ 1.70,
Opus ~US$ 0.70, Jev menos de un centavo) y como máximo unos US$ 9 si los modelos razonan mucho.
Las cifras exactas las calcula `bench/run.mjs` al arrancar.

Guarda `public/runs/<fecha>.json` y lo copia a `public/runs/latest.json` (la corrida que usa el
video) solo si está completa y ningún proveedor tuvo más de 10 % de errores de API.

Opciones (se pasan después de `--`, por ejemplo `npm run benchmark -- --limit 5`):

| Opción | Qué hace |
|---|---|
| `--probe` | Prueba con un solo viajero (lo mismo que `npm run probar-apis`). |
| `--limit N` | Solo los primeros N viajeros (no toca `latest.json`). |
| `--proveedores gpt,opus,jev` | Solo esos proveedores (no toca `latest.json`). |
| `--continuar ARCHIVO` | Retoma una corrida cortada (salta los viajeros que ya tienen resultado). Ejemplo: `--continuar 2026-10-10_18-00-00` (el nombre del archivo de `public/runs/`, con o sin `.json`). |
| `--reintentar-errores` | Con `--continuar`, vuelve a llamar a los viajeros que terminaron en error. |
| `--concurrencia N` | Viajeros a la vez (por defecto 2; los 3 proveedores de un viajero van en paralelo). |

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

Crea `GUION.md` (cada tramo con su tiempo, el texto a grabar y lo que se ve; el texto completo de
corrido; consejos para grabar y sincronizar; una propuesta de publicación para LinkedIn con el método
y los precios; hashtags y el checklist) y `out/subtitulos.srt`. Si todavía usas la demo, `GUION.md`
lo avisa arriba en grande: vuelve a generarlo después del benchmark, porque los números cambian.
Para elegir otra corrida: `npm run guion -- --run demo`.

### 7. Renderiza los videos

```
npm run video -- --formato todos
npm run video -- --formato todos --subtitulos
```

La segunda versión trae los subtítulos dibujados: **es la recomendada para LinkedIn**, porque la
mayoría ve los videos sin sonido. Los archivos quedan en `out/`:

- `out/la-frontera-vertical.mp4`, `-feed.mp4`, `-horizontal.mp4`
- con subtítulos: `out/la-frontera-vertical-subs.mp4`, etc.
- si la corrida es la demo, el nombre termina en `-demo` y la consola avisa que **no se debe publicar**.

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

- [ ] La corrida es real (`"source": "live"`) y el video **no** tiene la marca de agua DEMO.
- [ ] Confirmaste en la página oficial los precios marcados `verificado: false` en `shared/modelos.js`.
- [ ] Los nombres de los modelos coinciden con los que respondieron las APIs (están en `GUION.md`).
- [ ] Declaraste si TypeSafe te paga o te dio créditos (ver «Divulgación» más abajo).
- [ ] Viste el video completo, la voz coincide con la pantalla y el enlace del método funciona.

## Cómo cambiar cosas

**Presupuesto y vidas** — `shared/config.js`, objeto `JUEGO`:

```js
presupuestoUSD: 0.25, // lo mismo para las tres
vidas: 3,             // se pierde una al dejar pasar una amenaza o arrestar a un inocente
```

No hace falta repetir el benchmark: el juego se recalcula con la misma corrida. Sí hay que volver a
generar el guion (`npm run guion`) y los videos (`npm run video ...`), porque el texto cambia con
los resultados.

**Precios** — `shared/modelos.js`, campo `precio` de cada proveedor (dólares por millón de tokens de
entrada, entrada en caché y salida, más `fuente`, `verificado` y `fecha`). Cada corrida guarda una
copia de los precios con los que calculó el costo; por eso, si corriges un precio, tienes que correr
el benchmark de nuevo para que el video use el precio nuevo.

**Divulgación** — `shared/config.js`, objeto `PUBLICACION`:

```js
divulgacion: 'Colaboración pagada con TypeSafe', // vacío si no hay ninguna relación
enlaceMetodo: 'github.com/Leojar79/proyects',     // dónde revisar el método y el código
```

La divulgación aparece en el cierre del video, en la voz (si es corta) y en el texto propuesto para
LinkedIn. Después de cambiarla, vuelve a generar el guion y los videos.

## Pruebas

```
npm run validar                    # las respuestas correctas de los 60 viajeros salen de las reglas
node --test bench/                 # benchmark y adaptadores de las APIs (sin red)
node --test render/guion.test.mjs  # el guion: ritmo y frases verdaderas en cientos de corridas al azar
node bench/chequear-corrida.mjs public/runs/latest.json --completa
```

## Qué hay en cada carpeta

| Ruta | Qué es |
|---|---|
| `shared/` | Reglas, preguntas, modelos y precios, configuración, línea de tiempo, cálculo del juego, formato de números y guion de voz. Lo usan el benchmark, la app y el render. |
| `data/viajeros.json` | Los 60 viajeros con sus documentos y la respuesta correcta. |
| `bench/` | El benchmark (llamadas reales a las APIs) y la corrida demo (`npm run demo`). |
| `src/` | La app: el video se dibuja en el navegador en función del tiempo. |
| `render/` | `guion.mjs` (GUION.md y subtítulos) y `render.mjs` (MP4 con Playwright y ffmpeg). |
| `public/runs/` | Corridas: `demo.json`, `latest.json` y una por fecha. |
| `out/` | Lo que se genera: videos, subtítulos y fotogramas (no se sube a GitHub). |

Detalles técnicos y contratos entre las partes: `ARQUITECTURA.md`.

## Problemas comunes

- **«No encontré ninguna corrida»**: corre `npm run demo` (demostración) o `npm run benchmark` (real).
- **El video dice DEMO**: todavía no hay `public/runs/latest.json` real; corre el benchmark.
- **«No encontré ffmpeg»**: instálalo (en Ubuntu: `sudo apt install ffmpeg`; en Mac: `brew install ffmpeg`).
- **No abre Chromium (en tu computadora)**: instala el navegador de Playwright con `npx playwright install chromium`.
- **Cambiaste algo en `src/` y el video no lo muestra**: no uses `--sin-build`.
