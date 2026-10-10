# Guion de voz · La Frontera

> [!WARNING]
> ## GENERADO CON DATOS DEMO
> **Vuelve a generarlo después de correr el benchmark real; los números cambiarán.**
> Pasos: `npm run benchmark` y luego `npm run guion`. Un video o una publicación con estos números
> NO se puede publicar: son simulados.

Corrida: `public/runs/demo.json` · fuente: **demo (datos simulados)** · fecha 10/10/2026 · 60 viajeros · presupuesto US$ 0.25 · 3 vidas

Video de 75 s · 17 tramos · 165 palabras · ritmo máximo permitido 2,5 palabras por segundo (el tramo más rápido de este guion: 2,50).

Archivo generado por `npm run guion` (render/guion.mjs). Si cambias la corrida, vuelve a generarlo: el texto se elige según los datos.

## Tramos

- **Tiempo**: segundo del video en que empieza el tramo y el último momento en que puede terminar.
- **Palabras**: como se leen en voz alta (los números cuentan como se pronuncian: «35» = «treinta y cinco» = 3).

| # | Tiempo | Escena | Texto a grabar | Palabras | Lo que se ve |
|---|---|---|---|---|---|
| 1 | 0:00–0:04 | Gancho | Tres IAs, 25 centavos cada una. Ninguna llegó al final. | 10 (2,5/s) | Título «LA FRONTERA», «3 cerebros · 1 frontera», «US$ 0.25 de presupuesto»; entran GPT Astra, Claude Opus 5.5 y Jev y cae el sello «¿QUIÉN DURA MÁS?». |
| 2 | 0:04–0:07.4 | Presentación | ¿Pasa? ¿Miente? ¿Qué tan peligroso es? ¿Qué hacer? | 8 (2,4/s) | «CADA VIAJERO, 4 DECISIONES»: tarjetas ¿Puede pasar? (sí/no), ¿Miente? (sí/no), Peligro (0 a 4) y ¿Qué hacer? (aprobar, rechazar, interrogar, arrestar). |
| 3 | 0:07.4–0:10.8 | Presentación | GPT y Opus razonan y escriben. Jev, no. | 8 (2,4/s) | «¿CÓMO RESPONDE CADA CEREBRO?»: GPT Astra y Claude Opus 5.5 («razonan y escriben la respuesta; se paga cada token, incluido el razonamiento interno») escriben su JSON con monedas que caen; Jev («no escribe: devuelve la decisión con su probabilidad») muestra barras de probabilidad. |
| 4 | 0:10.8–0:14 | Presentación | Tres vidas. Gana quien dure más. | 6 (1,9/s) | «REGLAS DEL JUEGO»: US$ 0.25 para cada uno; 3 vidas (se pierde una por dejar pasar a una amenaza o arrestar a un inocente); gana quien dure más. |
| 5 | 0:14–0:19.7 | Detalle | Mismo viajero, misma información, mismas preguntas para las tres. ¿Quién responde primero? | 12 (2,1/s) | Viajero 1/60 entra a la cabina con su pasaporte y dice su motivo; las 3 columnas reciben el mismo caso y muestran su sello, el tiempo de respuesta, los tokens y el costo. |
| 6 | 0:19.7–0:25.4 | Detalle | GPT y Opus razonan antes de responder, y ese razonamiento también se paga. | 13 (2,3/s) | Viajero 2/60: en las columnas de GPT Astra y Claude Opus 5.5 se ven los tokens de entrada, de salida y de «razonamiento interno», y el JSON que escribieron. Jev pierde una vida (corazón roto). |
| 7 | 0:25.4–0:31 | Detalle | Jev ya perdió una vida. No escribe: devuelve la decisión con su probabilidad. | 13 (2,3/s) | Viajero 3/60: la columna de Jev muestra 0 tokens de salida y las barras de probabilidad de cada respuesta; Jev ya perdió una vida (se ve en sus corazones o en su GAME OVER). |
| 8 | 0:31–0:36 | Avance rápido | Avance rápido: 57 viajeros más. Ojo al presupuesto. | 10 (2,0/s) | «AVANCE RÁPIDO»: pasan los viajeros 4 a 60 en fila; en cada columna suben el gasto y los aciertos, y bajan las vidas. |
| 9 | 0:36–0:43.7 | Avance rápido | GPT se queda sin presupuesto tras 15 decisiones, a 1.6 centavos cada una. Opus y Jev siguen. | 19 (2,5/s) | Columna de GPT Astra: GAME OVER · SIN PRESUPUESTO (no le alcanzó para el viajero 16/60). |
| 10 | 0:43.7–0:50.6 | Avance rápido | Opus se queda sin presupuesto tras 35 decisiones. Solo queda Jev. | 13 (1,9/s) | Columna de Claude Opus 5.5: GAME OVER · SIN PRESUPUESTO (no le alcanzó para el viajero 36/60). |
| 11 | 0:50.9–0:53 | Avance rápido | Jev pierde su última vida. | 5 (2,4/s) | Columna de Jev: GAME OVER · SIN VIDAS (perdió la última en el viajero 54/60). |
| 12 | 0:53.1–0:55.6 | Resultados | Jev duró más que nadie. | 5 (2,0/s) | «RESULTADOS». Fila «Decisiones con el presupuesto»: GPT Astra 15/60, Claude Opus 5.5 35/60, Jev 54/60 (Jev con la corona MEJOR). |
| 13 | 0:55.6–0:59.1 | Resultados | Mil decisiones: GPT, 17 dólares; Jev, 2 centavos. | 8 (2,3/s) | Filas «Costo por decisión» (GPT Astra US$ 0.017, Claude Opus 5.5 US$ 0.0072, Jev US$ 0.000022) y «Costo por mil decisiones» (GPT Astra US$ 17.15, Claude Opus 5.5 US$ 7.15, Jev US$ 0.022). |
| 14 | 0:59.1–1:02.6 | Resultados | Jev, el más rápido. En aciertos, gana Opus. | 8 (2,3/s) | Filas «Velocidad promedio» (GPT Astra 2.9 s, Claude Opus 5.5 2.3 s, Jev 0.4 s) y «Aciertos» (GPT Astra 54/60, Claude Opus 5.5 55/60, Jev 54/60). |
| 15 | 1:02.6–1:07 | Resultados | Jev sale unas 770 veces más barato que GPT. | 10 (2,3/s) | Franja «Jev: 766 veces más barato que GPT Astra». Avisos al pie: precio sin verificar: GPT Astra y Jev. |
| 16 | 1:07–1:11 | Cierre | Los modelos de lenguaje, para crear. Jev, para decidir. | 9 (2,3/s) | «Los modelos de lenguaje: para crear.» y «Jev: para decidir.»; abajo desfilan viajeros. |
| 17 | 1:11–1:14.6 | Cierre | ¿Dudas? Revisa el método: link en la descripción. | 8 (2,2/s) | Fuentes: precios públicos de cada API, fecha de la corrida (datos simulados), «Método y código: github.com/Leojar79/proyects»; cierra el título «LA FRONTERA» con los tres nombres. |

## Texto corrido (para leer de una vez)

Tres IAs, 25 centavos cada una. Ninguna llegó al final.

¿Pasa? ¿Miente? ¿Qué tan peligroso es? ¿Qué hacer? GPT y Opus razonan y escriben. Jev, no. Tres vidas. Gana quien dure más.

Mismo viajero, misma información, mismas preguntas para las tres. ¿Quién responde primero? GPT y Opus razonan antes de responder, y ese razonamiento también se paga. Jev ya perdió una vida. No escribe: devuelve la decisión con su probabilidad.

Avance rápido: 57 viajeros más. Ojo al presupuesto. GPT se queda sin presupuesto tras 15 decisiones, a 1.6 centavos cada una. Opus y Jev siguen. Opus se queda sin presupuesto tras 35 decisiones. Solo queda Jev. Jev pierde su última vida.

Jev duró más que nadie. Mil decisiones: GPT, 17 dólares; Jev, 2 centavos. Jev, el más rápido. En aciertos, gana Opus. Jev sale unas 770 veces más barato que GPT.

Los modelos de lenguaje, para crear. Jev, para decidir. ¿Dudas? Revisa el método: link en la descripción.

## Consejos para grabar

- **Ritmo**: tono de creador de contenido, con energía pero claro. Cada tramo cabe leyéndolo a unas 2 o 2,5 palabras por segundo; el gancho es el más rápido.
- **Pausas**: respira entre tramos. Entre algunos tramos hay silencio a propósito (por ejemplo, cuando entra el avance rápido o la tabla de resultados).
- **Números**: léelos como están escritos («1.6 centavos» = «uno punto seis centavos»; «770 veces» = «setecientas setenta veces»). Los nombres: «GPT» (yi-pi-tí), «Opus», «Jev».
- **Equipo**: cualquier micrófono sirve en un cuarto chico con cortinas o ropa alrededor; a un palmo de la boca. Graba en WAV o M4A a 48 kHz.
- **Forma más fácil de sincronizar**: graba **cada tramo como un archivo aparte** (01.wav, 02.wav…) y colócalo en el editor en su tiempo de inicio. La voz empieza en 0:00 y cada tramo empieza en su tiempo de la tabla.
  - **CapCut**: importa el video y los audios; arrastra cada audio a la pista de sonido y muévelo hasta que el cabezal marque su tiempo de inicio (acerca la línea de tiempo para ver décimas).
  - **Premiere Pro**: pon el cabezal en el tiempo (haz clic en el contador de tiempo y escribe, por ejemplo, 00:00:19:21 para 0:19.7 a 30 cuadros por segundo) y arrastra el audio hasta que se pegue al cabezal.
  - **DaVinci Resolve**: en la página Edit, escribe el tiempo en el contador del visor, coloca el cabezal y usa «Place on top» o arrastra el audio hasta el cabezal.
- **Si un tramo te queda largo**: acelera ese audio hasta un 110 % o quita una muletilla; **nunca lo adelantes** a su tiempo de inicio (la voz contaría algo antes de que aparezca en pantalla).
- **Alternativa**: graba todo de corrido mirando el video sin sonido (el que tiene subtítulos sirve de teleprompter) y después corta y ajusta.
- **Subtítulos**: `out/la-frontera-<formato>-subs.mp4` ya los trae dibujados. Si prefieres ponerlos en el editor, importa `out/subtitulos.srt` (mismos tramos, partidos en líneas de unos 40 caracteres).
- **Música**: opcional y bajita (unos 20 dB por debajo de la voz). Exporta en 30 cuadros por segundo con audio AAC a 48 kHz.

## Propuesta de texto para LinkedIn

**Con datos DEMO: este texto es solo de ejemplo. Vuelve a generarlo con la corrida real antes de usarlo.**

Revísalo y ajústalo a tu voz. Todos los números salen de la corrida.

```text
Le di US$ 0.25 de presupuesto a 3 IAs para trabajar en una frontera. Ninguna llegó al final.

Hice «La Frontera», un juego estilo Papers, Please: 60 viajeros llegan al puesto y cada IA decide qué hacer con cada uno. Las tres reciben exactamente el mismo texto (reglas, documentos y lo que dice el viajero) y responden las mismas 4 preguntas: ¿puede pasar?, ¿miente?, nivel de peligro (0 a 4) y qué hacer (aprobar, rechazar, interrogar o arrestar).

Reglas: US$ 0.25 para cada una y 3 vidas (se pierde una al dejar pasar una amenaza o arrestar a un inocente). Gana la que dure más.

Resultados (corrida del 10/10/2026, DATOS DEMO):
• GPT Astra (OpenAI): 15 decisiones; se quedó sin presupuesto en el viajero 16/60 · US$ 0.017 por decisión · 2.9 s en promedio · 54/60 aciertos (90 %)
• Claude Opus 5.5 (Anthropic): 35 decisiones; se quedó sin presupuesto en el viajero 36/60 · US$ 0.0072 por decisión · 2.3 s en promedio · 55/60 aciertos (92 %)
• Jev (TypeSafe): 54 decisiones; perdió su última vida en el viajero 54/60 · US$ 0.000022 por decisión · 0.4 s en promedio · 54/60 aciertos (90 %)

Lo que también hay que decir:
• En aciertos ganó Claude Opus 5.5 (55 de 60, contra 54 de 60 de Jev).
• Jev duró más, pero tampoco llegó al final: 54 decisiones; perdió su última vida en el viajero 54/60.
• Jev cometió 3 errores graves (dejar pasar una amenaza o arrestar a un inocente) en los 60 casos.
• Precios sin verificar en la página oficial: GPT Astra, Jev.

¿Por qué tanta diferencia de costo? GPT Astra y Claude Opus 5.5 son modelos de lenguaje: razonan y escriben su respuesta, y se paga cada token, también el razonamiento interno. Jev no escribe: devuelve la decisión con su probabilidad. Por cada mil decisiones: GPT Astra US$ 17.15 · Claude Opus 5.5 US$ 7.15 · Jev US$ 0.022.

Mi conclusión: los modelos de lenguaje, para crear; Jev, para decidir.

Método (resumen):
• El mismo texto y las mismas preguntas para todas, viajero por viajero; GPT Astra y Claude Opus 5.5 con salida JSON estructurada y sin pedir explicaciones.
• Configuración: GPT Astra (gpt-astra; reasoningEffort: low) · Claude Opus 5.5 (claude-opus-5-5; effort: low) · Jev (jev-latest; sin opciones especiales).
• Costo = tokens que informa cada API × precio público por millón de tokens (el razonamiento interno se cobra como salida).
• Aciertos = la acción correcta sobre los 60 casos, también los que ya no alcanzó el presupuesto. Velocidad = tiempo de la petición que tuvo éxito.
• Precios usados (US$ por millón de tokens, entrada / salida):
  · GPT Astra: 10 / 50 — Finout y OpenRouter (no es la página oficial de OpenAI) (10/10/2026) [sin verificar en la página oficial]
  · Claude Opus 5.5: 4 / 20 — Tabla de precios de la API de Anthropic (06/10/2026)
  · Jev: 0.042 / 0 — Agregadores (flaviocopes.com, eesel.ai, OpenRouter); TypeSafe no publica página de precios (10/10/2026) [sin verificar en la página oficial]

Código, datos y método: github.com/Leojar79/proyects

#InteligenciaArtificial #IA #LLM #Benchmark #CostosDeIA #IAGenerativa #Automatizacion #Tecnologia
```

> **Recordatorio para el autor:** declara si TypeSafe te paga, te dio créditos o tiene alguna relación contigo. Escríbelo en `PUBLICACION.divulgacion` de `shared/config.js` (sale en el cierre del video y en este texto) y en la publicación. Ahora está vacía.

## Hashtags

#InteligenciaArtificial #IA #LLM #Benchmark #CostosDeIA #IAGenerativa #Automatizacion #Tecnologia (si quieres, agrega #OpenAI #Anthropic #TypeSafe; con 3 a 5 hashtags basta en LinkedIn).

## Checklist antes de publicar

- [ ] **Corrida real**: el archivo debe decir `"source": "live"`. Esta dice **`demo`** → NO publicar; corre `npm run benchmark`, luego `npm run guion` y `npm run video`.
- [ ] **Precio de GPT Astra sin verificar** (entrada US$ 10, salida US$ 50 por millón de tokens; fuente: Finout y OpenRouter (no es la página oficial de OpenAI)). Confírmalo en https://openai.com/api/pricing. Si cambia, corrígelo en `shared/modelos.js` (y pon `verificado: true`) y vuelve a correr el benchmark: cada corrida guarda el precio con el que calculó el costo.
- [ ] **Precio de Jev sin verificar** (entrada US$ 0.042, salida US$ 0 por millón de tokens; fuente: Agregadores (flaviocopes.com, eesel.ai, OpenRouter); TypeSafe no publica página de precios). Confírmalo en https://docs.typesafe.ai. Si cambia, corrígelo en `shared/modelos.js` (y pon `verificado: true`) y vuelve a correr el benchmark: cada corrida guarda el precio con el que calculó el costo.
- [ ] **Nombres exactos de los modelos** en el video, el texto y la descripción: GPT Astra: pedido `gpt-astra`, servido `gpt-astra`; Claude Opus 5.5: pedido `claude-opus-5-5`, servido `claude-opus-5-5`; Jev: pedido `jev-latest`, servido `jev-latest`.
- [ ] **Divulgación**: vacía. Si TypeSafe te paga o te dio créditos, escríbelo en `PUBLICACION.divulgacion` y vuelve a generar el guion y el video.
- [ ] **Avisos de la corrida** (errores de API, tokens estimados, modelo de respaldo): ninguno.
- [ ] **Mira el video completo** sin sonido: sin marca de agua DEMO, subtítulos legibles y sin tapar números, los tres formatos.
- [ ] **La voz coincide con la pantalla**: si cambiaste la corrida o la configuración, vuelve a generar este guion y el video (el texto se elige según los datos).
- [ ] **El enlace del método funciona** y el repositorio es público: github.com/Leojar79/proyects
- [ ] En LinkedIn, sube la versión **con subtítulos** (`-subs`): la mayoría lo ve sin sonido.

## Lo que también hay que decir (según esta corrida)

- ESTOS NÚMEROS SON DE LA DEMO (simulados): no se pueden publicar.
- En aciertos ganó Claude Opus 5.5 (55 de 60, contra 54 de 60 de Jev).
- Jev duró más, pero tampoco llegó al final: 54 decisiones; perdió su última vida en el viajero 54/60.
- Jev cometió 3 errores graves (dejar pasar una amenaza o arrestar a un inocente) en los 60 casos.
- Precios sin verificar en la página oficial: GPT Astra, Jev.
