# Guion de voz · La Frontera

> [!CAUTION]
> # NO PUBLICAR: 4 bloqueos
>
> Según `shared/publicable.js` (la misma regla que usan la app y el render), un video hecho con esta corrida **no se puede publicar**.
> Mientras haya bloqueos, el video lleva marca de agua y `npm run video` nombra los archivos `-NO-PUBLICAR` (o `-demo`) y termina con error.
> Este guion y el texto de LinkedIn sirven solo para revisar.
>
> 1. **Datos simulados (demo)** (`demo`).  
>    Cómo resolverlo: Son datos simulados. Corre el benchmark real (`npm run benchmark`, necesita las tres claves) y vuelve a generar el guion (`npm run guion`) y el video (`npm run video`).
> 2. **Precio de GPT-6 Astra sin verificar en la página oficial** (`precio`).  
>    Cómo resolverlo: Verifica el precio en la página oficial (https://openai.com/api/pricing), corrígelo en `shared/modelos.js` con `verificado: true`, la fuente y la fecha, y corre `npm run recalcular` (recalcula el costo con los tokens guardados, sin llamar a las APIs). Después vuelve a generar el guion y el video.
> 3. **Precio de Jev sin verificar en la página oficial** (`precio`).  
>    Cómo resolverlo: Verifica el precio en la página oficial (https://docs.typesafe.ai), corrígelo en `shared/modelos.js` con `verificado: true`, la fuente y la fecha, y corre `npm run recalcular` (recalcula el costo con los tokens guardados, sin llamar a las APIs). Después vuelve a generar el guion y el video.
> 4. **Falta declarar tu relación con TypeSafe (shared/config.js)** (`divulgacion`).  
>    Cómo resolverlo: Escribe tu relación con TypeSafe en `PUBLICACION.divulgacion` de `shared/config.js` (por ejemplo «Sin relación comercial con TypeSafe» o «Colaboración pagada con TypeSafe») y vuelve a generar el guion y el video. Va en la primera línea del texto de LinkedIn, en la voz del cierre y en pantalla.

> [!CAUTION]
> # FALTA LA DIVULGACIÓN
> Declara tu relación con TypeSafe en `PUBLICACION.divulgacion` de `shared/config.js`, aunque no haya ninguna
> («Sin relación comercial con TypeSafe»). Va en la primera línea del texto de LinkedIn, en la voz del cierre y en pantalla.

> [!WARNING]
> ## GENERADO CON DATOS DEMO
> **Vuelve a generarlo después de correr el benchmark real; los números cambiarán.**
> Pasos: `npm run benchmark` y luego `npm run guion`. Un video o una publicación con estos números
> NO se puede publicar: son simulados.

Corrida: `public/runs/demo.json` (sha256 `0e10f208`) · fuente: **demo (datos simulados)** · fecha 10/10/2026 · 60 viajeros · presupuesto US$ 0.25 y 3 vidas (registrados en la corrida antes de correr)

Video de 75 s · 17 tramos · 152 palabras · ritmo máximo permitido 2,5 palabras por segundo (el tramo más rápido de este guion: 2,50).

Archivo generado por `npm run guion` (render/guion.mjs). Si cambias la corrida, vuelve a generarlo: el texto se elige según los datos.

## Tramos

- **Tiempo**: segundo del video en que empieza el tramo y el último momento en que puede terminar.
- **Palabras**: como se leen en voz alta (los números cuentan como se pronuncian: «35» = «treinta y cinco» = 3).

| # | Tiempo | Escena | Texto a grabar | Palabras | Lo que se ve |
|---|---|---|---|---|---|
| 1 | 0:00–0:04 | Gancho | Tres IAs, 25 centavos cada una. Ninguna llegó al final. | 10 (2,5/s) | Título «LA FRONTERA», «3 cerebros · 1 frontera», «US$ 0.25 de presupuesto»; entran GPT-6 Astra, Claude Opus 5.5 y Jev y cae el sello «¿QUIÉN DURA MÁS?». |
| 2 | 0:04–0:07.4 | Presentación | ¿Pasa? ¿Miente? ¿Qué tan peligroso es? ¿Qué hacer? | 8 (2,4/s) | «CADA VIAJERO, 4 DECISIONES»: tarjetas ¿Puede pasar? (sí/no), ¿Miente? (sí/no), Peligro (0 a 4) y ¿Qué hacer? (aprobar, rechazar, interrogar, arrestar). |
| 3 | 0:07.4–0:10.8 | Presentación | GPT y Opus escriben su respuesta. Jev, no. | 8 (2,4/s) | «¿CÓMO RESPONDE CADA CEREBRO?»: GPT-6 Astra y Claude Opus 5.5 («razonan y escriben la respuesta (JSON); se paga cada token, incluido el razonamiento interno») escriben su JSON con monedas que caen; Jev («no escribe: devuelve la decisión con su probabilidad») muestra barras de probabilidad. |
| 4 | 0:10.8–0:14 | Presentación | Tres vidas. Gana quien dure más. | 6 (1,9/s) | «REGLAS DEL JUEGO»: US$ 0.25 para cada uno; 3 vidas (se pierde una por dejar pasar a una amenaza o arrestar a un inocente); gana quien dure más. |
| 5 | 0:14–0:19.7 | Detalle | Mismo viajero, misma información, mismas preguntas para las tres. ¿Quién responde primero? | 12 (2,1/s) | Viajero 1/60 entra a la cabina con su pasaporte y dice su motivo; las 3 columnas reciben el mismo caso y muestran su sello, el tiempo de respuesta, los tokens y el costo. |
| 6 | 0:19.7–0:25.4 | Detalle | GPT y Opus razonan antes de responder, y ese razonamiento también se paga. | 13 (2,3/s) | Viajero 2/60: en las columnas de GPT-6 Astra y Claude Opus 5.5 se ven los tokens de entrada y de salida, el «razonamiento interno» de GPT-6 Astra y Claude Opus 5.5 y el JSON que escribieron. Jev pierde una vida (corazón roto). |
| 7 | 0:25.4–0:31 | Detalle | Jev ya perdió una vida. No escribe: devuelve la decisión con su probabilidad. | 13 (2,3/s) | Viajero 3/60: la columna de Jev muestra 0 tokens de salida y las barras de probabilidad de cada respuesta; Jev ya perdió una vida (se ve en sus corazones o en su GAME OVER). |
| 8 | 0:31–0:35.9 | Avance rápido | Avance rápido: 57 viajeros más. Ojo al presupuesto. | 10 (2,0/s) | «AVANCE RÁPIDO»: pasan los viajeros 4 a 60 en fila; en cada columna suben el gasto y los aciertos, y bajan las vidas. |
| 9 | 0:35.9–0:42.3 | Avance rápido | GPT se queda sin presupuesto tras 15 decisiones. Opus y Jev siguen. | 12 (1,9/s) | Columna de GPT-6 Astra: GAME OVER · SIN PRESUPUESTO (no le alcanzó para el viajero 16/60). |
| 10 | 0:43–0:49.9 | Avance rápido | Opus se queda sin presupuesto tras 34 decisiones. Solo queda Jev. | 13 (1,9/s) | Columna de Claude Opus 5.5: GAME OVER · SIN PRESUPUESTO (no le alcanzó para el viajero 35/60). |
| 11 | 0:50.4–0:53 | Avance rápido | Jev pierde su última vida. | 5 (1,9/s) | Columna de Jev: GAME OVER · SIN VIDAS (perdió la última en el viajero 54/60). |
| 12 | 0:53.1–0:55.6 | Resultados | Jev duró más que nadie. | 5 (2,0/s) | «RESULTADOS». Fila «Decisiones con el presupuesto»: GPT-6 Astra 15/60, Claude Opus 5.5 34/60, Jev 54/60 (corona MEJOR: Jev); debajo, lo que costaron los 60 casos: GPT-6 Astra US$ 1.07, Claude Opus 5.5 US$ 0.444, Jev US$ 0.0015. |
| 13 | 0:55.6–0:58 | Resultados | Jev, el más barato. | 4 (1,7/s) | Filas «Costo por decisión» (GPT-6 Astra US$ 0.018, Claude Opus 5.5 US$ 0.0074, Jev US$ 0.000025) y «Costo por mil decisiones» (GPT-6 Astra US$ 17.77, Claude Opus 5.5 US$ 7.40, Jev US$ 0.025) (corona MEJOR: Jev). |
| 14 | 0:59.1–1:02.6 | Resultados | Jev, el más rápido. En aciertos, empate. | 7 (2,0/s) | Fila «Velocidad promedio» (GPT-6 Astra 2.9 s, Claude Opus 5.5 2.3 s, Jev 0.4 s) (corona MEJOR: Jev) y «Aciertos en la acción (de 60)» (GPT-6 Astra 54/60, 2 errores graves; Claude Opus 5.5 55/60, 1 error grave; Jev 54/60, 3 errores graves) (corona MEJOR: GPT-6 Astra, Claude Opus 5.5 y Jev), con la nota «diferencias de 2 casos o menos = empate · una corrida, 60 casos». |
| 15 | 1:02.6–1:07 | Resultados | Jev sale unas 710 veces más barato que GPT. | 10 (2,3/s) | Franja «Jev: 711 veces más barato que GPT-6 Astra y 296 veces más que Claude Opus 5.5, por decisión» con los precios en US$ por millón de tokens (entrada/salida): GPT-6 Astra 10/50 · Claude Opus 5.5 4/20 · Jev 0.042/0. Avisos al pie: Presupuesto (US$ 0.25) y vidas (3) fijados antes de correr; precio sin verificar en la página oficial: GPT-6 Astra y Jev. |
| 16 | 1:07–1:10.6 | Cierre | Los modelos generativos, para crear. Jev, para decidir. | 8 (2,2/s) | «MI CONCLUSIÓN»: «Los modelos generativos: para crear.» y «Jev: para decidir.»; abajo desfilan viajeros. |
| 17 | 1:10.6–1:14.6 | Cierre | Comparé contra modelos insignia; hay opciones más baratas. | 8 (2,0/s) | Fuentes: «Corrida: 10/10/2026 (datos simulados, demo)» con el archivo de datos y su huella sha256; «Precios en US$ por millón de tokens (entrada/salida): GPT-6 Astra 10/50 · Claude Opus 5.5 4/20 · Jev 0.042/0»; «Comparado con los modelos insignia (razonamiento al mínimo: low). Hay modelos de lenguaje más baratos que no se probaron.»; «Método y código: github.com/Leojar79/proyects/tree/main/la-frontera»; créditos y marcas. Cierra el título «LA FRONTERA» con los tres nombres. |

## Texto corrido (para leer de una vez)

Tres IAs, 25 centavos cada una. Ninguna llegó al final.

¿Pasa? ¿Miente? ¿Qué tan peligroso es? ¿Qué hacer? GPT y Opus escriben su respuesta. Jev, no. Tres vidas. Gana quien dure más.

Mismo viajero, misma información, mismas preguntas para las tres. ¿Quién responde primero? GPT y Opus razonan antes de responder, y ese razonamiento también se paga. Jev ya perdió una vida. No escribe: devuelve la decisión con su probabilidad.

Avance rápido: 57 viajeros más. Ojo al presupuesto. GPT se queda sin presupuesto tras 15 decisiones. Opus y Jev siguen. Opus se queda sin presupuesto tras 34 decisiones. Solo queda Jev. Jev pierde su última vida.

Jev duró más que nadie. Jev, el más barato. Jev, el más rápido. En aciertos, empate. Jev sale unas 710 veces más barato que GPT.

Los modelos generativos, para crear. Jev, para decidir. Comparé contra modelos insignia; hay opciones más baratas.

## Consejos para grabar

- **Ritmo**: tono de creador de contenido, con energía pero claro. Cada tramo cabe leyéndolo a unas 2 o 2,5 palabras por segundo; el gancho es el más rápido.
- **Pausas**: respira entre tramos. Entre algunos tramos hay silencio a propósito (por ejemplo, cuando entra el avance rápido o la tabla de resultados).
- **Números**: léelos como están escritos («1.6 centavos» = «uno punto seis centavos»; «770 veces» = «setecientas setenta veces»). Los nombres: «GPT» (yi-pi-tí), «Opus», «Jev».
- **No cambies el texto**: cada frase se eligió porque es verdad con estos datos. Si quieres decirlo de otra forma, que siga diciendo lo mismo (y vuelve a mirar la tabla de resultados).
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

**Hay 4 bloqueos (arriba): este texto es solo para revisar. Vuelve a generarlo cuando no quede ninguno.**

Revísalo y ajústalo a tu voz, sin quitar la divulgación (primera línea) ni «Lo que también hay que decir». Todos los números salen de la corrida.

```text
[NO PUBLICAR: 4 bloqueos (ver arriba de GUION.md). Borra esta línea solo cuando no quede ninguno.]

[FALTA LA DIVULGACIÓN: escribe tu relación con TypeSafe en PUBLICACION.divulgacion de shared/config.js. Sin eso no se publica.]

Le di US$ 0.25 de presupuesto a 3 IAs para trabajar en una frontera. Ninguna llegó al final.

Hice «La Frontera», un juego estilo Papers, Please: 60 viajeros llegan al puesto y cada IA decide qué hacer con cada uno. Las tres reciben exactamente el mismo texto (reglas, documentos y lo que dice el viajero) y responden las mismas 4 preguntas: ¿puede pasar?, ¿miente?, nivel de peligro (0 a 4) y qué hacer (aprobar, rechazar, interrogar o arrestar).

Reglas: US$ 0.25 para cada una y 3 vidas (se pierde una al dejar pasar una amenaza o arrestar a un inocente). Gana la que dure más.
El presupuesto de US$ 0.25 y las 3 vidas se fijaron antes de correr. Para atender a los 60 viajeros, GPT-6 Astra necesitaba US$ 1.07, Claude Opus 5.5, US$ 0.444 y Jev, US$ 0.0015. Los aciertos y errores graves cuentan los 60 casos, sin límite de presupuesto.

Resultados (corrida del 10/10/2026, DATOS DEMO; una corrida, 60 casos sintéticos; diferencias de 2 casos o menos las trato como empate):
• GPT-6 Astra (OpenAI): 15 decisiones; se quedó sin presupuesto en el viajero 16/60 · US$ 0.018 por decisión · 2.9 s en promedio · 54/60 aciertos en la acción (90 %) · 2 errores graves
• Claude Opus 5.5 (Anthropic): 34 decisiones; se quedó sin presupuesto en el viajero 35/60 · US$ 0.0074 por decisión · 2.3 s en promedio · 55/60 aciertos en la acción (92 %) · 1 error grave
• Jev (TypeSafe): 54 decisiones; perdió su última vida en el viajero 54/60 · US$ 0.000025 por decisión · 0.4 s en promedio · 54/60 aciertos en la acción (90 %) · 3 errores graves

Mi conclusión: los modelos generativos, para crear; Jev, para decidir.

¿Por qué tanta diferencia de costo? GPT-6 Astra y Claude Opus 5.5 son modelos generativos: escriben su respuesta y se paga cada token; además razonan antes de responder, y ese razonamiento también se cobra como salida. Jev, según la documentación de TypeSafe, no genera texto: devuelve la decisión con su probabilidad (su API informó 0 tokens de salida). Por decisión, Jev salió 711 veces más barato que GPT-6 Astra y 296 veces más barato que Claude Opus 5.5. Por cada mil decisiones: GPT-6 Astra US$ 17.77 · Claude Opus 5.5 US$ 7.40 · Jev US$ 0.025.

Lo que también hay que decir:
• En aciertos hubo empate (diferencias de 2 casos o menos): GPT-6 Astra 54/60, Claude Opus 5.5 55/60, Jev 54/60.
• Jev duró más, pero tampoco llegó al final: 54 decisiones; perdió su última vida en el viajero 54/60.
• Jev cometió 3 errores graves (dejar pasar una amenaza o arrestar a un inocente) en los 60 casos.
• Precios sin verificar en la página oficial: GPT-6 Astra y Jev.
• Comparé contra modelos insignia: GPT-6 Astra y Claude Opus 5.5, con el esfuerzo de razonamiento en low (en Claude Opus 5.5 es el mínimo; el razonamiento no se puede apagar). Hay modelos mucho más baratos que no probé: por ejemplo, Claude Haiku 5.5 cuesta US$ 0.10 / 0.50 por millón de tokens, 40 veces menos que Opus (tabla de precios de la API de Anthropic, 06/10/2026). Con ellos, la diferencia de costo sería mucho menor.
• La latencia se midió desde mi red (la del autor), contando solo la petición que tuvo éxito; desde otro lugar puede variar.
• Es una sola corrida con 60 casos sintéticos (escritos para esta prueba); diferencias de 2 casos o menos las trato como empate.
• Inspirado en Papers, Please (Lucas Pope). OpenAI, GPT, Anthropic, Claude, TypeSafe y Jev son marcas de sus dueños; las nombro solo para identificar los productos.

Método (resumen):
• El mismo texto y las mismas preguntas para todas, viajero por viajero; GPT-6 Astra y Claude Opus 5.5 con salida JSON estructurada y sin pedir explicaciones.
• Configuración realmente usada (registrada en cada llamada): GPT-6 Astra (modelo gpt-6-astra; estiloApi: chat, reasoningEffort: low) · Claude Opus 5.5 (modelo claude-opus-5-5; effort: low) · Jev (modelo jev-latest; sin opciones especiales).
• Costo = tokens que informa cada API × precio por millón de tokens (el razonamiento interno se cobra como salida). Las llamadas con error que la API cobró también cuentan.
• Aciertos = la acción correcta sobre los 60 casos, también los que ya no alcanzó el presupuesto; una llamada con error cuenta como fallo. Velocidad = tiempo de la petición que tuvo éxito.
• Precios usados (US$ por millón de tokens, entrada / salida), con su fuente y la fecha de consulta:
  · GPT-6 Astra: 10 / 50 — Finout y OpenRouter (no es la página oficial de OpenAI) (10/10/2026) [SIN VERIFICAR en la página oficial: no publicar así]
  · Claude Opus 5.5: 4 / 20 — Tabla de precios de la API de Anthropic (06/10/2026)
  · Jev: 0.042 / 0 — Agregadores (flaviocopes.com, eesel.ai, OpenRouter); TypeSafe no publica página de precios (10/10/2026) [SIN VERIFICAR en la página oficial: no publicar así]
• Datos de la corrida: public/runs/demo.json (sha256 0e10f208…, el mismo que muestra el cierre del video).

Código, datos y método: github.com/Leojar79/proyects/tree/main/la-frontera

#InteligenciaArtificial #IA #LLM #Benchmark #CostosDeIA #IAGenerativa #Automatizacion #Tecnologia
```

## Hashtags

#InteligenciaArtificial #IA #LLM #Benchmark #CostosDeIA #IAGenerativa #Automatizacion #Tecnologia (si quieres, agrega #OpenAI #Anthropic #TypeSafe; con 3 a 5 hashtags basta en LinkedIn).

## Checklist antes de publicar

- [ ] **Sin bloqueos** de `shared/publicable.js`: quedan **4** (lista arriba de todo). El render los muestra en consola y nombra los archivos `-NO-PUBLICAR` (o `-demo`) mientras exista alguno.
- [ ] **Corrida real**: el archivo debe decir `"source": "live"`. Esta dice **`demo`** → NO publicar; corre `npm run benchmark`, luego `npm run guion` y `npm run video`.
- [ ] **Precio de GPT-6 Astra sin verificar** (entrada US$ 10, salida US$ 50 por millón de tokens; fuente: Finout y OpenRouter (no es la página oficial de OpenAI)). Confírmalo en https://openai.com/api/pricing, corrígelo en `shared/modelos.js` con `verificado: true` y corre `npm run recalcular` (no hace falta repetir el benchmark).
- [ ] **Precio de Jev sin verificar** (entrada US$ 0.042, salida US$ 0 por millón de tokens; fuente: Agregadores (flaviocopes.com, eesel.ai, OpenRouter); TypeSafe no publica página de precios). Confírmalo en https://docs.typesafe.ai, corrígelo en `shared/modelos.js` con `verificado: true` y corre `npm run recalcular` (no hace falta repetir el benchmark).
- [ ] **Nombres exactos de los modelos** en el video, el texto y la descripción: GPT-6 Astra: pedido `gpt-6-astra`, servido `gpt-6-astra`; Claude Opus 5.5: pedido `claude-opus-5-5`, servido `claude-opus-5-5`; Jev: pedido `jev-latest`, servido `jev-latest`.
- [ ] **Configuración realmente usada** (de cada llamada; debe coincidir con la declarada): GPT-6 Astra: estiloApi: chat, reasoningEffort: low; Claude Opus 5.5: effort: low; Jev: sin opciones especiales.
- [ ] **Divulgación**: **VACÍA (bloquea la publicación)**. Debe decir tu relación real con TypeSafe (paga, créditos, trabajo o ninguna). Está en `PUBLICACION.divulgacion` de `shared/config.js`; va en la primera línea del texto de LinkedIn, en la voz y en pantalla.
- [ ] **Presupuesto y vidas sin tocar**: US$ 0.25 y 3 vidas registrados antes de correr; no se cambian después de ver los resultados.
- [ ] **Avisos de la corrida** (errores de API, tokens estimados o no informados, modelo de respaldo): ninguno.
- [ ] **Mira el video completo** sin sonido: sin marca de agua (DEMO o NO PUBLICABLE), subtítulos legibles y sin tapar números, los tres formatos.
- [ ] **La voz coincide con la pantalla**: si cambiaste la corrida o la configuración, vuelve a generar este guion y el video (el texto se elige según los datos).
- [ ] **Datos verificables**: sube `public/runs/demo.json` al repositorio público; su sha256 (`0e10f208…`) es el que muestra el cierre del video.
- [ ] **El enlace del método funciona** y el repositorio es público: github.com/Leojar79/proyects/tree/main/la-frontera
- [ ] En LinkedIn, sube la versión **con subtítulos** (`-subs`): la mayoría lo ve sin sonido.

## Lo que también hay que decir (según esta corrida)

- ESTOS NÚMEROS SON DE LA DEMO (simulados): no se pueden publicar.
- En aciertos hubo empate (diferencias de 2 casos o menos): GPT-6 Astra 54/60, Claude Opus 5.5 55/60, Jev 54/60.
- Jev duró más, pero tampoco llegó al final: 54 decisiones; perdió su última vida en el viajero 54/60.
- Jev cometió 3 errores graves (dejar pasar una amenaza o arrestar a un inocente) en los 60 casos.
- Precios sin verificar en la página oficial: GPT-6 Astra y Jev.
- Comparé contra modelos insignia: GPT-6 Astra y Claude Opus 5.5, con el esfuerzo de razonamiento en low (en Claude Opus 5.5 es el mínimo; el razonamiento no se puede apagar). Hay modelos mucho más baratos que no probé: por ejemplo, Claude Haiku 5.5 cuesta US$ 0.10 / 0.50 por millón de tokens, 40 veces menos que Opus (tabla de precios de la API de Anthropic, 06/10/2026). Con ellos, la diferencia de costo sería mucho menor.
- La latencia se midió desde mi red (la del autor), contando solo la petición que tuvo éxito; desde otro lugar puede variar.
- Es una sola corrida con 60 casos sintéticos (escritos para esta prueba); diferencias de 2 casos o menos las trato como empate.
- Inspirado en Papers, Please (Lucas Pope). OpenAI, GPT, Anthropic, Claude, TypeSafe y Jev son marcas de sus dueños; las nombro solo para identificar los productos.
