// Parámetros del juego y del video. Todo lo que aparece en pantalla como regla sale de aquí.

export const JUEGO = {
  // Mismo presupuesto para los tres cerebros. Se muestra en pantalla.
  presupuestoUSD: 0.25,
  // Errores graves permitidos: dejar pasar a una amenaza o arrestar a un inocente.
  vidas: 3,
}

export const VIDEO = {
  fps: 30,
  formatos: {
    vertical: { ancho: 1080, alto: 1920, nombre: 'Vertical 9:16 (Reels, TikTok, Shorts)' },
    feed: { ancho: 1080, alto: 1350, nombre: 'Feed 4:5 (LinkedIn, Instagram)' },
    horizontal: { ancho: 1920, alto: 1080, nombre: 'Horizontal 16:9 (LinkedIn, YouTube)' },
  },
}

export const PUBLICACION = {
  // OBLIGATORIO antes de publicar: tu relación con TypeSafe, en una frase. Aparece al inicio y al
  // final del video, en la voz y en la primera línea del texto de LinkedIn. Mientras esté vacío,
  // el video sale con marca de agua "NO PUBLICABLE". Ejemplos:
  //   'Sin relación comercial con TypeSafe'
  //   'Colaboración pagada con TypeSafe'
  //   'TypeSafe me dio créditos gratis para esta prueba'
  divulgacion: '',
  // Dónde puede la gente revisar el método, el código y los datos de la corrida.
  enlaceMetodo: 'github.com/Leojar79/proyects/tree/main/la-frontera',
}
