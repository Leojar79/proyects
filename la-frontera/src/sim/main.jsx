// Punto de entrada de la composición "simulación" (sim.html): mismas fuentes locales y estilos
// base que el juego (index.html), y la app de la simulación.
import '@fontsource/press-start-2p/400.css'
import '@fontsource/inter/400.css'
import '@fontsource/inter/600.css'
import '@fontsource/inter/700.css'
import '@fontsource/inter/800.css'
import '../estilos.css'
import { createRoot } from 'react-dom/client'
import AppSim from './AppSim.jsx'

createRoot(document.getElementById('root')).render(<AppSim />)
