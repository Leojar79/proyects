---
name: linkedin-analyzer
description: "Analiza el perfil y los posts de LinkedIn que el usuario comparta, y propone publicaciones concretas (con gancho, formato y borrador) adaptadas a su experiencia real. Úsala cuando el usuario pida analizar/auditar su LinkedIn, pida ideas o un plan de publicaciones, o quiera borradores de posts basados en su perfil."
---

# Analizador de LinkedIn y Generador de Publicaciones

Audita el perfil de LinkedIn del usuario y convierte su experiencia real en una lista de publicaciones concretas, con gancho y borrador, listas para copiar y pegar. No publica nada automáticamente: entrega borradores para que el usuario los revise y los suba él mismo (o los conecte a la herramienta de publicación que ya use).

## Cuándo usar esta skill

- "Analiza/audita mi perfil de LinkedIn"
- "Dame ideas para publicar en LinkedIn" / "hazme un plan de contenido"
- "Escríbeme un post de LinkedIn basado en mi experiencia"
- El usuario pega su titular, "Acerca de", experiencia o posts anteriores y pide feedback o contenido

## Qué pedir al usuario (si falta)

Claude no puede navegar a LinkedIn ni scrapear el perfil por su cuenta en este proyecto. Si el usuario solo da la URL, pídele que copie y pegue directamente:

1. **Titular** actual.
2. **Sección "Acerca de"** (o un resumen de su trayectoria si no la tiene redactada).
3. **Experiencia** reciente (2-3 puestos, con logros o cifras si las tiene).
4. **3-5 posts anteriores** (texto y, si los tiene, likes/comentarios aproximados) — opcional pero mejora mucho el análisis.
5. **Objetivo**: conseguir clientes, buscar empleo, autoridad de marca personal, o crecer red.
6. **Público objetivo**: a quién quiere llegar (rol, industria).

No inventes datos, cifras ni logros que el usuario no haya dado. Si falta algo importante, pregúntalo antes de producir el análisis completo; no bloquees por detalles menores.

## Proceso

### 1. Auditoría rápida del perfil

Si el usuario compartió contenido del perfil, evalúa cada sección con un veredicto (✅ bien / ⚠️ mejorable / ❌ falta) en una tabla:

| Sección | Qué mirar |
|---|---|
| Titular | ¿usa el espacio disponible? ¿dice qué hace + para quién + qué resultado logra? |
| Acerca de | ¿primera persona, gancho en las primeras 2 líneas (antes de "ver más"), sin relleno? |
| Experiencia | ¿bullets con verbo de acción + métrica concreta, no solo una lista de funciones? |
| Featured / destacados | ¿tiene algo fijado (caso de éxito, post top, muestra de trabajo)? |
| Posts anteriores | ¿hook claro en las primeras líneas? ¿mezcla autoridad, historia personal y comunidad, o siempre es lo mismo? |

Para las 1-2 secciones más débiles, da una reescritura concreta (antes → después), no un consejo genérico.

### 2. Diagnóstico de contenido

A partir de la experiencia y logros compartidos, identifica:

- **3-5 pilares de contenido** que encajen con su perfil y objetivo. Ejemplos de pilares: autoridad técnica/profesional, narrativa personal (aprendizajes, decisiones, fracasos), comunidad (reconocer a otros, colaboraciones), oferta/producto (solo si busca clientes).
- **Temas concretos** donde ya tiene autoridad real: proyectos hechos, cifras, decisiones difíciles, cosas que le salieron mal y qué aprendió.
- **Vacíos**: tipos de post que nunca ha usado y le vendrían bien (un dato duro con cifra, una historia vulnerable, una opinión a contracorriente de su sector).

### 3. Propuesta de publicaciones

Entrega una tabla de 4-6 ideas, cada una anclada en algo específico que el usuario contó (nunca genéricas tipo "comparte tu opinión sobre IA"):

| # | Pilar | Ángulo/tema | Gancho (1-2 líneas) | Formato | Objetivo principal |
|---|---|---|---|---|---|

Objetivo principal = qué reacción busca cada post (comentarios, guardados, reposts o likes) — no repitas el mismo objetivo en todas las filas de la semana.

Después:

- Para las **2 ideas más fuertes**, escribe el **borrador completo** del post: 900-1300 caracteres, con el gancho en los primeros ~210 caracteres (antes del "ver más" en móvil), párrafos cortos (1-3 líneas), y un cierre con pregunta o invitación a comentar (no "¡Sígueme para más!").
- Para el resto, deja solo el esquema (gancho + 3-4 puntos de desarrollo + cierre) y ofrece desarrollarlo completo si el usuario lo pide.

### 4. Reglas de voz (aplícalas siempre al redactar)

- Nada de relleno de IA: "en un mundo cada vez más...", "es fundamental", "aprovechar", "potenciar", "sinergia", "de manera fundamental".
- Cifras concretas en vez de adjetivos vagos: "47% menos tiempo" mejor que "mucho más rápido".
- Frases y párrafos cortos; LinkedIn se lee sobre todo en móvil.
- Un solo gancho fuerte por post, no varias ideas mezcladas.
- Como mucho una raya (—) cada 100 palabras.
- Capitaliza nombres propios y de empresas/productos.

### 5. Entrega

- Presenta siempre el resultado como borrador para que el usuario apruebe o pida cambios; nunca lo des por publicado.
- Aclara que esta skill no tiene conectada ninguna API de publicación (LinkedIn, Publora, Buffer, etc.) en este proyecto: el usuario copia el texto y lo publica él mismo, o pide que le ayudes a configurar una integración si la quiere.
- Si el usuario pide iterar sobre un borrador ("hazlo más corto", "más directo", "sin la pregunta final"), aplica el cambio y vuelve a mostrar el post completo, no solo el fragmento cambiado.

## Ejemplo de activación

Usuario: "Analiza mi LinkedIn: [pega titular, about, experiencia] y proponme publicaciones para esta semana, quiero conseguir clientes como freelance de diseño."

→ Sigue los pasos 1-5: auditoría del perfil, pilares y temas, tabla de 4-6 ideas con 2 borradores completos, en tono directo y sin relleno.

## Créditos

Estructura y buenas prácticas de contenido inspiradas en el proyecto open source [sergebulaev/linkedin-skills](https://github.com/sergebulaev/linkedin-skills) (MIT License), adaptadas aquí a una sola skill de análisis + propuesta de publicaciones, sin las integraciones de scraping/publicación automática (Apify/Publora) que ese proyecto ofrece.
