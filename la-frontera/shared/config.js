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
  // Si TypeSafe te paga o te regala créditos, escríbelo aquí; aparece en el cierre.
  // Ejemplo: 'Colaboración pagada con TypeSafe'
  divulgacion: '',
  // Dónde puede la gente revisar el método y el código.
  enlaceMetodo: 'github.com/Leojar79/proyects',
}
