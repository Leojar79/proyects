import { createReadStream, existsSync, statSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const RAIZ = dirname(fileURLToPath(import.meta.url))

// Voz grabada de la simulación (audio/voz.m4a, en .gitignore). Solo el servidor de desarrollo
// (`npm run dev`) la sirve en /__sim/voz.m4a para la vista previa con sonido: NUNCA se copia a
// public/ ni a dist/. El render a MP4 mezcla el audio aparte con ffmpeg.
function vozSoloEnDesarrollo() {
  const archivo = join(RAIZ, 'audio', 'voz.m4a')
  return {
    name: 'la-frontera-voz-dev',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__sim/voz.m4a', (req, res) => {
        if (!existsSync(archivo)) {
          res.statusCode = 404
          res.end('No existe audio/voz.m4a')
          return
        }
        const total = statSync(archivo).size
        res.setHeader('Content-Type', 'audio/mp4')
        res.setHeader('Accept-Ranges', 'bytes')
        res.setHeader('Cache-Control', 'no-store')
        // Rangos: el navegador los pide para poder saltar a cualquier segundo.
        const rango = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range ?? '')
        if (rango) {
          const inicio = rango[1] ? Number(rango[1]) : Math.max(0, total - Number(rango[2]))
          const fin = rango[1] && rango[2] ? Math.min(Number(rango[2]), total - 1) : total - 1
          if (inicio >= total || inicio > fin) {
            res.statusCode = 416
            res.setHeader('Content-Range', `bytes */${total}`)
            res.end()
            return
          }
          res.statusCode = 206
          res.setHeader('Content-Range', `bytes ${inicio}-${fin}/${total}`)
          res.setHeader('Content-Length', String(fin - inicio + 1))
          createReadStream(archivo, { start: inicio, end: fin }).pipe(res)
          return
        }
        res.setHeader('Content-Length', String(total))
        createReadStream(archivo).pipe(res)
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), vozSoloEnDesarrollo()],
  base: './',
  build: {
    rollupOptions: {
      // Dos composiciones: el juego con corridas del benchmark (index.html) y la simulación con la
      // voz grabada del autor (sim.html).
      input: {
        main: resolve(RAIZ, 'index.html'),
        sim: resolve(RAIZ, 'sim.html'),
      },
    },
  },
})
