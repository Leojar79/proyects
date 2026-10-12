// Renderiza index.html cuadro por cuadro con Chromium (Playwright) y lo codifica con ffmpeg.
//
//   node render.mjs                      -> n8n-flujo-leads.mp4 (1920x1080, 30 fps)
//   node render.mjs --preview 3.5,8,20   -> PNGs sueltos de esos instantes (en --out-dir)
//
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const require = createRequire('/opt/node22/lib/node_modules/');
const { chromium } = require('playwright');

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : def; };

const FPS = Number(opt('fps', 30));
const WORKERS = Number(opt('workers', 4));
const outFile = opt('out', path.join(here, 'n8n-flujo-leads.mp4'));
const outDir = opt('out-dir', path.join(here, 'preview'));
const preview = opt('preview', null);

const browser = await chromium.launch({ args: ['--font-render-hinting=none', '--disable-lcd-text'] });
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
const url = pathToFileURL(path.join(here, 'index.html')).href;

async function newPage() {
  const page = await ctx.newPage();
  await page.goto(url);
  await page.evaluate(() => document.fonts.ready);
  return page;
}

const T = await (async () => { const p = await newPage(); const v = await p.evaluate(() => window.__T); await p.close(); return v; })();

if (preview) {
  fs.mkdirSync(outDir, { recursive: true });
  const page = await newPage();
  for (const s of preview.split(',').map(Number)) {
    await page.evaluate((t) => window.__render(t), s);
    const f = path.join(outDir, `t${String(s).replace('.', '_')}.png`);
    await page.screenshot({ path: f });
    console.log('preview', f);
  }
  await browser.close();
  process.exit(0);
}

const total = Math.round(T * FPS);
const pages = await Promise.all(Array.from({ length: WORKERS }, newPage));

const ff = spawn('ffmpeg', [
  '-y', '-loglevel', 'error',
  '-f', 'image2pipe', '-c:v', 'png', '-framerate', String(FPS), '-i', '-',
  '-c:v', 'libx264', '-preset', 'medium', '-crf', '17', '-pix_fmt', 'yuv420p',
  '-movflags', '+faststart', outFile,
], { stdio: ['pipe', 'inherit', 'inherit'] });
const ffDone = new Promise((res, rej) => { ff.on('close', (c) => (c === 0 ? res() : rej(new Error('ffmpeg exit ' + c)))); ff.on('error', rej); });

const t0 = Date.now();
for (let i = 0; i < total; i += WORKERS) {
  const batch = [];
  for (let k = 0; k < WORKERS && i + k < total; k++) {
    const t = (i + k) / FPS;
    batch.push((async () => {
      await pages[k].evaluate((tt) => window.__render(tt), t);
      return pages[k].screenshot({ type: 'png' });
    })());
  }
  const bufs = await Promise.all(batch);
  for (const b of bufs) { if (!ff.stdin.write(b)) await new Promise((r) => ff.stdin.once('drain', r)); }
  if ((i / WORKERS) % 25 === 0) {
    const done = i + bufs.length, el = (Date.now() - t0) / 1000;
    console.log(`frame ${done}/${total}  ${(done / el).toFixed(1)} fps  eta ${((total - done) / (done / el)).toFixed(0)}s`);
  }
}
ff.stdin.end();
await ffDone;
await browser.close();
console.log('listo ->', outFile);
