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
  // Solo si relacionTypeSafe es 'declarada': tu relación con TypeSafe en una frase. Se muestra en
  // el video y en la primera línea del texto de LinkedIn; si falta, el video sale "NO PUBLICABLE".
  // Ejemplos: 'Colaboración pagada con TypeSafe', 'TypeSafe me dio créditos gratis para esta prueba'
  divulgacion: '',
  // Tu relación con TypeSafe: 'ninguna' (creador independiente: no hay nada que declarar y no se
  // muestra nada) o 'declarada' (hay pago, créditos, colaboración o empleo: entonces `divulgacion`
  // es obligatoria y se muestra en el video y en el post).
  relacionTypeSafe: 'ninguna',
  // Dónde puede la gente revisar el método, el código y los datos de la corrida.
  enlaceMetodo: 'github.com/Leojar79/proyects/tree/main/la-frontera',
}
