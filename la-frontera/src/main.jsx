// Punto de entrada: fuentes locales (sin Google Fonts), estilos base y la app.
import '@fontsource/press-start-2p/400.css'
import '@fontsource/inter/400.css'
import '@fontsource/inter/600.css'
import '@fontsource/inter/700.css'
import '@fontsource/inter/800.css'
import './estilos.css'
import { createRoot } from 'react-dom/client'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(<App />)
