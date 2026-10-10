# Guion libre · La Frontera (simulación)

Léelo a tu ritmo, de corrido, sin preocuparte por los tiempos. Después me pasas la grabación y yo
ajusto el video, los subtítulos y los tiempos a tu voz.

> **Por qué está escrito como simulación:** estos números no salen de una prueba con las APIs reales.
> Son **estimaciones** hechas con los precios publicados de cada API y el tamaño de los textos del
> juego. Así se puede publicar sin afirmar nada falso. Si más adelante corres la prueba real
> (`npm run benchmark`), cambio las frases marcadas con ✱ por los números medidos.

---

## Texto para grabar

**[Gancho]**
Tres inteligencias artificiales. Un mismo trabajo: cuidar una frontera. Y el mismo presupuesto para cada una.
¿Cuál aguantaría más?

**[Qué es]**
Armé una simulación de cómo funcionarían GPT-6 Astra, Claude Opus 5.5 y Jev en un juego estilo Papers, Please.
Llega un viajero y hay que decidir cuatro cosas: ¿puede pasar?, ¿está mintiendo?, ¿qué tan peligroso es?
y ¿qué hacemos con él?

**[Cómo responde cada una]**
GPT y Opus son modelos generativos: razonan y escriben su respuesta. Y se cobra cada token, incluido ese
razonamiento interno.
Jev funciona distinto: no escribe. Lee el caso y devuelve directamente la decisión, con qué tan seguro está.

**[El juego]**
Mismo viajero, misma información, mismas preguntas para las tres.
Lo que cambia es cuánto cuesta cada decisión.

**[Los números]** ✱
Con los precios publicados de cada API, una decisión así costaría más o menos un centavo y medio con GPT,
medio centavo con Opus… y con Jev, unas milésimas de centavo.
O sea: con veinticinco centavos, GPT atendería unos quince viajeros, Opus unos cuarenta…
y Jev, miles.

**[Lo que también hay que decir]**
Ojo: son costos estimados, no una prueba real. Comparé contra los modelos insignia, y hay modelos de
lenguaje bastante más baratos. Y aquí no estoy midiendo quién acierta más.

**[Cierre]**
Mi conclusión: los modelos generativos, para crear. Jev, para decidir.
*(Tu relación con TypeSafe, en una frase. Por ejemplo: «Aclaro: no tengo relación comercial con TypeSafe.»
o «Aclaro: esta es una colaboración pagada con TypeSafe.»)*
¿Quieren que lo pruebe con las APIs de verdad? Los leo en los comentarios.

---

## De dónde salen los números (para la descripción del post)

Estimación por decisión, con unos 875 tokens de entrada para GPT y Opus (reglas, documentos y lo que dice
el viajero) y unos 775 para Jev, y entre 40 y 300 tokens de salida para GPT y Opus según cuánto razonen:

| | Precio (US$ por millón de tokens, entrada/salida) | Costo estimado por decisión | Con US$ 0.25 alcanza para |
|---|---|---|---|
| GPT-6 Astra | 10 / 50 ⚠️ | US$ 0.011 – 0.024 | unas 10 – 23 decisiones |
| Claude Opus 5.5 | 4 / 20 | US$ 0.0043 – 0.0095 | unas 26 – 58 decisiones |
| Jev | 0.042 / 0 ⚠️ | US$ 0.00003 | unas 7,800 decisiones |

- Precio de Claude Opus 5.5: tabla oficial de Anthropic (06/10/2026).
- ⚠️ Precios de GPT-6 Astra y Jev: tomados de fuentes secundarias (Finout, OpenRouter, eesel.ai).
  **Verifícalos en las páginas oficiales antes de publicar.**
- Son estimaciones: los tokens reales dependen de cada modelo y del razonamiento que use.

## Cómo grabar

- Una sola toma de corrido está bien; si te equivocas, repite la frase completa y sigue (yo corto).
- Habla con energía pero sin correr: el texto dura cerca de 1 minuto y 15 segundos a ritmo natural.
- Graba en un cuarto chico, a un palmo del micrófono. Pásame el archivo en **WAV o M4A**.
- Cuando me lo pases: ajusto el video a la duración de tu voz, sincronizo cada escena con lo que dices,
  y genero los subtítulos (dibujados en el video y en `.srt`) con los tiempos exactos de tu grabación.
