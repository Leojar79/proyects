# Plan: Reel "Claude + WhatsApp Business MCP"

Análisis del video de referencia (`instaget_3.MP4`) y plan para grabar uno propio.

---

## 1. Análisis del video de referencia

**Datos técnicos:** vertical 9:16 (720×1280), 25 fps, **59 s**, idioma español, tono cercano y rápido.

### Estructura (guion reconstruido de los subtítulos)

| Tiempo | Bloque | Lo que dice | Lo que se ve |
|---|---|---|---|
| 0–4 s | **Gancho** | "Claude acaba de matar a los chatbots de WhatsApp." | Logo de Claude + tarjeta "CHATBOT" tachada |
| 4–10 s | **Promesa** | "Ahora puedes construir tu propio agente de IA y conectarlo a la API oficial dentro de Meta solo hablando con Claude." | Diagrama animado: Claude → Agente de IA → WhatsApp + "Meta · API oficial ✓" |
| 10–17 s | **Qué es** (credibilidad) | "La herramienta se llama WhatsApp Business MCP y la lanzó la propia Meta el 15 de septiembre…" | Tarjeta "Nova integração · WhatsApp Business MCP" |
| 17–21 s | **Dolor** | "…y hace justo la parte donde todo el mundo se atascaba y acababa contratando a un especialista." | Tarjeta "Nova ferramenta" |
| 21–34 s | **Cómo funciona (pasos)** | "Conectas el MCP con Claude y él te crea la cuenta dentro de Meta. Añade tu número, lo valida con el código. Engancha ese número directamente a la API oficial. Comprueba si te falta algún término, alguna forma de pago o alguna verificación. Prueba el webhook y envía el primer mensaje al número del cliente." | Mockups UI uno por paso: Configuração guiada → Conta Meta Business → API oficial conectada → Conferindo pendências (Termos / Pagamento) → chat de cliente |
| 34–44 s | **Momento "wow"** | "Lo más loco es la parte de las plantillas. Claude crea la plantilla, se la manda a Meta, la revisa y espera. Y si te la rechazan, te avisa y te la vuelve a enviar corregida." | Tarjeta de plantilla cambiando de estado: *Em análise → Reprovado → Reenviado* (+ corte a cara completa) |
| 44–50 s | **Contraste antes/después** | "Todo esto que antes era un infierno y acababas pagando a alguien para que lo hiciera, lo resuelves con unos cuantos comandos tú solito." | "Adicionar MCP" → "Login com Meta" |
| 50–56 s | **Cómo usarlo** | "Para usarlo añades el MCP en Claude e inicias sesión con tu cuenta de Meta. El paso a paso concreto y completo lo tienes en nuestra bóveda." | Solo cara, plano completo |
| 56–59 s | **CTA** | "Comenta 'META' y te paso el acceso." | Solo cara |

### Recursos de formato que lo hacen funcionar

- **Pantalla dividida**: arriba una "ventana" tipo navegador (bordes redondeados, 3 puntos) con animaciones UI; abajo la cara del creador. Fondo morado oscuro con degradado.
- **Subtítulos palabra a palabra** (2–3 palabras), blancos sobre píldora **morada**, centrados entre ambas mitades.
- **Un visual por frase**: cada paso del guion tiene su propio mockup animado (entradas, checks ✓, estados que cambian de color).
- **Cortes a cara completa** en momentos de énfasis (rechazo de plantilla y cierre/CTA) → rompe el ritmo y da cercanía.
- **Escenario**: casa, estantería con plantas, luz natural de ventana, gorra + camiseta negra, mirada a cámara, gestos con las manos.
- **Ritmo**: ~6 cortes de escena en 60 s, sin silencios, frases cortas.
- **CTA de palabra clave** ("Comenta META") → automatización de DMs (ManyChat o similar) que envía el recurso. Dispara comentarios = alcance.

---

## 2. Tu versión: plan de producción

### Ángulo
Mismo tema (la habilidad nueva: Claude conectado al **MCP oficial de WhatsApp Business de Meta**), pero **con prueba real**: en vez de mockups, enseña *tu* pantalla haciéndolo de verdad. Eso te diferencia del original.

> Datos verificados: Meta lanzó el servidor MCP de WhatsApp Business a mediados de septiembre de 2026; el agente crea la cuenta, añade y verifica el número (código por SMS/voz que tú le pasas), lo registra en la Cloud API y revisa los términos; tú inicias sesión con Meta y eliges a qué negocios da acceso. Antes de publicar, comprueba en la doc oficial lo de las plantillas (creación/reenvío), que es la afirmación más llamativa del original.

### Guion propuesto (~55 s)

1. **Gancho (0–3 s)** – elige uno y prueba variantes:
   - "Acabo de montar WhatsApp Business con IA en 10 minutos sin tocar código."
   - "Esto antes te costaba 300 € y un especialista. Ahora lo hace Claude."
   - "Meta acaba de darle a Claude las llaves de WhatsApp."
2. **Qué es (3–10 s)** – "Meta lanzó un MCP oficial de WhatsApp Business: conectas Claude a tu cuenta de Meta y él configura todo por ti."
3. **Demo en pasos (10–35 s)** – una frase + una toma de pantalla por paso:
   1. Añado el MCP en Claude e inicio sesión con Meta.
   2. Le pido: "Créame la cuenta de WhatsApp Business".
   3. Añade mi número → me llega el código → se lo paso.
   4. Lo conecta a la API oficial (Cloud API).
   5. Revisa qué falta: términos, pago, verificación.
   6. Envía el primer mensaje → **enseña el móvil recibiéndolo** (plano físico, gran momento de prueba).
4. **Wow (35–45 s)** – plantillas de mensaje: Claude la crea y la manda a revisión; muestra el estado (en revisión / aprobada / rechazada y corregida).
5. **Antes vs. ahora (45–50 s)** – "Antes: Business Manager, consola de desarrollador, docs de la API y un freelancer. Ahora: una conversación."
6. **CTA (50–55 s)** – "Comenta **WHATSAPP** y te mando la guía paso a paso con los prompts que usé."

### Lista de tomas

**A-roll (cara)** – grabar todo el guion de una vez, 2–3 tomas por bloque.
- Vertical 4K o 1080p, a la altura de los ojos, luz de ventana de frente/lado, fondo con profundidad (estantería, plantas).
- Micro de solapa. Ropa lisa (sin logos ni rayas).
- Graba el gancho 5 veces con distinta energía.

**B-roll (pantalla)** – graba la configuración real:
- Grabación de pantalla de Claude: añadir MCP, login con Meta, cada prompt y respuesta.
- Capturas del panel de Meta (WhatsApp Manager) mostrando número conectado y plantilla.
- Plano con el móvil: llega el SMS de verificación y llega el primer mensaje. **Tapa/difumina tu número, códigos y datos de la cuenta.**

### Edición (replicar el estilo)

| Elemento | Cómo |
|---|---|
| Layout | Pantalla dividida: ventana de navegador redondeada arriba (~45 %), cara abajo; fondo degradado de tu color de marca |
| Visuales | Recorta y amplía la grabación real; si algo no se ve bien, rehazlo como mockup animado (Figma/Canva + animación de entrada) |
| Subtítulos | Auto-captions de CapCut, 2–3 palabras, fuente sans bold, píldora de color de marca |
| Cortes a cara completa | En el "wow" de las plantillas y en el CTA |
| Ritmo | Quita todas las pausas y respiraciones; cambio visual cada 2–4 s |
| Sonido | Música de fondo baja + "pop"/"whoosh" en cada tarjeta y "ding" en cada ✓ |
| Herramientas | CapCut (rápido) o Premiere/DaVinci; mockups en Figma o Canva |

### Publicación

- **Texto**: "Meta acaba de lanzar un MCP oficial de WhatsApp Business y Claude ya puede configurarte todo. Comenta WHATSAPP y te mando la guía 👇"
- **Hashtags** (3–5): #inteligenciaartificial #claude #whatsappbusiness #automatizacion #ia
- **Automatización**: configura ManyChat (o la de Instagram) para enviar la guía por DM al comentar la palabra clave. **Prepara la guía antes de publicar.**
- **Plataformas**: Reels + TikTok + YouTube Shorts (mismo archivo, sin marca de agua).
- **Portada**: tu cara + texto grande "WhatsApp + IA en 10 min".
- **Fijar comentario** con la palabra clave.

### Calendario sugerido

| Día | Tarea |
|---|---|
| 1 | Configurar el MCP de verdad y grabar la pantalla (B-roll). Escribir el guion final con tus palabras |
| 2 | Grabar A-roll + planos del móvil |
| 3 | Edición, subtítulos, mockups |
| 4 | Crear la guía/lead magnet + automatización de DMs. Revisar el vídeo en el móvil |
| 5 | Publicar en la hora pico de tu audiencia; responder comentarios la primera hora |
| +2 días | Mirar retención: si cae en los primeros 3 s, prueba otro gancho y vuelve a publicar en otra plataforma |

### Checklist antes de publicar
- [ ] Los datos (fecha de lanzamiento, qué hace el MCP) están verificados
- [ ] No aparecen números, códigos ni IDs de cuenta sin difuminar
- [ ] Subtítulos sin errores
- [ ] La guía del CTA está lista y la automatización funciona
- [ ] El gancho se entiende sin audio
