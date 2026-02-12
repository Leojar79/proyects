// Properties Data
export const properties = [
  {
    id: 1,
    name: "Loft Industrial Centro",
    location: "Ciudad de México, Roma Norte",
    capacity: 2,
    price: 85,
    image: "https://images.unsplash.com/photo-1505691938895-1758d7feb511?q=80&w=800&auto=format&fit=crop",
    description: "Espacioso loft con diseño industrial en el corazón de la Roma. Ideal para parejas o viajeros de negocios.",
    amenities: ["Wifi de alta velocidad", "Cocina equipada", "Smart TV", "Lavadora/Secadora"],
    coordinates: { lat: 19.4194, lng: -99.1627 }
  },
  {
    id: 2,
    name: "Casa Colonial Moderna",
    location: "San Miguel de Allende",
    capacity: 6,
    price: 250,
    image: "https://images.unsplash.com/photo-1600585154340-be6161a56a0c?q=80&w=800&auto=format&fit=crop",
    description: "Hermosa casa estilo colonial con toques modernos. Cuenta con terraza privada y vistas a la parroquia.",
    amenities: ["Terraza", "Parrilla", "Estacionamiento", "Aire Acondicionado"],
    coordinates: { lat: 20.9144, lng: -100.7452 }
  },
  {
    id: 3,
    name: "Apartamento Vista Mar",
    location: "Cancún, Puerto Juárez",
    capacity: 4,
    price: 180,
    image: "https://images.unsplash.com/photo-1544376798-89aa6b82c6cd?q=80&w=800&auto=format&fit=crop",
    description: "Relájate con las mejores vistas del Caribe. Apartamento de lujo con acceso directo a la playa.",
    amenities: ["Alberca", "Acceso a playa", "Gimnasio", "Seguridad 24/7"],
    coordinates: { lat: 21.1619, lng: -86.8515 }
  },
  {
    id: 4,
    name: "Estudio Minimalista",
    location: "Guadalajara, Americana",
    capacity: 2,
    price: 60,
    image: "https://images.unsplash.com/photo-1554995207-c18c203602cb?q=80&w=800&auto=format&fit=crop",
    description: "Estudio compacto y funcional, perfecto para estancias cortas. Cerca de bares y restaurantes.",
    amenities: ["Autocheck-in", "Wifi", "Escritorio", "Cafetera"],
    coordinates: { lat: 20.6751, lng: -103.3694 }
  },
  {
    id: 5,
    name: "Penthouse de Lujo",
    location: "Monterrey, San Pedro",
    capacity: 5,
    price: 350,
    image: "https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?q=80&w=800&auto=format&fit=crop",
    description: "Exclusivo penthouse con vistas panorámicas a la ciudad y montañas. Acabados de primera.",
    amenities: ["Jacuzzi", "Elevador privado", "Servicio de limpieza", "Sonos"],
    coordinates: { lat: 25.6515, lng: -100.3596 }
  },
  {
    id: 6,
    name: "Cabaña en el Bosque",
    location: "Valle de Bravo",
    capacity: 8,
    price: 400,
    image: "https://images.unsplash.com/photo-1587061949409-02df41d5e562?q=80&w=800&auto=format&fit=crop",
    description: "Escapa de la ciudad a esta acogedora cabaña rodeada de naturaleza. Perfecta para familias grandes.",
    amenities: ["Chimenea", "Jardín amplio", "Pet friendly", "Juegos de mesa"],
    coordinates: { lat: 19.1924, lng: -100.1332 }
  }
];

// Testimonials Data
export const testimonials = [
  {
    id: 1,
    name: "Carlos Méndez",
    role: "Propietario",
    avatar: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?q=80&w=200&auto=format&fit=crop",
    text: "Desde que AireStay administra mi departamento, mis ingresos han subido un 40% y ya no me preocupo por nada. Excelente servicio.",
    stars: 5
  },
  {
    id: 2,
    name: "Laura Gómez",
    role: "Huésped",
    avatar: "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?q=80&w=200&auto=format&fit=crop",
    text: "La propiedad estaba impecable, tal como en las fotos. El proceso de check-in fue súper sencillo y siempre estuvieron atentos.",
    stars: 5
  },
  {
    id: 3,
    name: "Javier Torres",
    role: "Inversionista",
    avatar: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?q=80&w=200&auto=format&fit=crop",
    text: "Compré dos departamentos para rentas cortas y AireStay se encarga de todo. La transparencia en los reportes es lo que más valoro.",
    stars: 5
  }
];

// FAQ Data
export const faqItems = [
  { question: "¿Cómo calculan el precio por noche?", answer: "Utilizamos algoritmos de pricing dinámico que analizan la demanda, temporada y eventos locales para maximizar tus ingresos." },
  { question: "¿Qué comisión cobran?", answer: "Cobramos una comisión competitiva sobre los ingresos generados. Contáctanos para una cotización personalizada según tu propiedad." },
  { question: "¿Qué pasa si hay daños?", answer: "Gestionamos el seguro de protección para anfitriones y nos encargamos de reclamaciones en caso de daños accidentales." },
  { question: "¿Incluyen limpieza?", answer: "Sí, coordinamos limpieza profesional después de cada estancia, cobrada al huésped." },
  { question: "¿Cómo son los pagos al propietario?", answer: "Realizamos transferencias mensuales con un reporte detallado de ingresos y egresos." },
  { question: "¿En qué ciudades operan?", answer: "Actualmente operamos en las principales ciudades turísticas y de negocios del país." },
  { question: "¿Puedo bloquear fechas?", answer: "¡Claro! Tienes acceso a un calendario donde puedes bloquear fechas para uso personal cuando quieras." },
  { question: "¿Cuánto tarda la publicación?", answer: "Una vez tengamos las fotos y la información, tu propiedad puede estar en línea en menos de 48 horas." }
];

// Services Data
export const services = {
  owners: [
    { title: "Gestión Integral", desc: "Nos encargamos de todo: desde la creación del anuncio hasta la atención al huésped." },
    { title: "Fotografía Profesional", desc: "Resaltamos lo mejor de tu espacio con fotos de alta calidad y staging." },
    { title: "Pricing Dinámico", desc: "Ajustamos precios diariamente para asegurar la mayor ocupación posible." },
    { title: "Mantenimiento", desc: "Coordinamos reparaciones menores y mantenimiento preventivo para cuidar tu inversión." }
  ],
  guests: [
    { title: "Soporte 24/7", desc: "Estamos disponibles en todo momento para resolver cualquier duda o inconveniente." },
    { title: "Check-in Fácil", desc: "Sistemas de acceso autónomo o bienvenida personal según la propiedad." },
    { title: "Limpieza Garantizada", desc: "Estándares de hotel en cada propiedad, con blancos de alta calidad." },
    { title: "Guía Local", desc: "Recomendaciones personalizadas de los mejores lugares para comer y visitar." }
  ]
};
