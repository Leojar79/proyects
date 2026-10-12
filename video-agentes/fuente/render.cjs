// node render.cjs <composition.html> <out.mp4> <width> <height> <meta.json>
const {chromium}=require('/opt/node-tools/node_modules/playwright');const {spawn}=require('child_process');const fs=require('fs');
(async()=>{const [,,html,out,W,H,metaOut]=process.argv;const b=await chromium.launch();const p=await b.newPage({viewport:{width:+W,height:+H}});
await p.goto('file://'+html);const meta=await p.evaluate(()=>({total:TOTAL,scenes:SCENES,sfx:window.SFX||[]}));fs.writeFileSync(metaOut,JSON.stringify(meta));
const fps=30,N=Math.round(meta.total*fps);
const ff=spawn('ffmpeg',['-v','error','-y','-f','image2pipe','-framerate',String(fps),'-c:v','mjpeg','-i','-','-c:v','libx264','-preset','medium','-crf','18','-pix_fmt','yuv420p',out],{stdio:['pipe','inherit','inherit']});
for(let i=0;i<N;i++){await p.evaluate(t=>render(t),i/fps);const buf=await p.screenshot({type:'jpeg',quality:95});if(!ff.stdin.write(buf))await new Promise(r=>ff.stdin.once('drain',r));}
ff.stdin.end();await new Promise(r=>ff.on('close',r));await b.close();})();
