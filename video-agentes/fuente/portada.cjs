const {chromium}=require('/opt/node-tools/node_modules/playwright');
(async()=>{const [,,html,face,out]=process.argv;const b=await chromium.launch();const p=await b.newPage({viewport:{width:1080,height:1920}});
const errs=[];p.on('pageerror',e=>errs.push(e.message));
await p.goto('file://'+html);
await p.evaluate((face)=>{render(20);
 document.getElementById('prog').style.display='none';document.getElementById('flash').style.display='none';
 const cam=document.getElementById('cam');cam.style.transform='none';cam.style.opacity=1;cam.style.filter='none';
 document.getElementById('stage').innerHTML=`
 <div class="col abs" style="left:0;right:0;top:250px">
   <div class="row" style="gap:34px">${claudeTile(190)}<div style="font-size:90px;font-weight:300;color:#cfe">+</div>${waTile(190)}</div>
   <div style="margin-top:46px"><span class="pill" style="background:rgba(47,224,122,.16);color:#2fe07a;font-size:36px;letter-spacing:.14em;border:2px solid rgba(47,224,122,.4)">NUEVO · MCP OFICIAL DE META</span></div>
   <div class="big" style="font-size:104px;margin-top:40px;text-align:center;letter-spacing:-.02em">AHORA CREA</div>
   <div class="big grad" style="font-size:176px;text-align:center;padding:0 30px;filter:drop-shadow(0 8px 30px rgba(0,0,0,.45))">AGENTES<br>DE IA</div>
   <div class="big" style="font-size:132px;text-align:center;margin-top:6px;color:#ff8a5c;text-shadow:0 0 50px rgba(217,119,87,.7)">CON CLAUDE</div>
   <div class="row" style="gap:18px;margin-top:36px"><span class="pill" style="background:#25D366;color:#06210f;font-size:42px">${wa(48)} en WhatsApp</span><span class="pill" style="background:#fff;color:#0b1f12;font-size:42px">0 código</span></div>
 </div>
 <div class="abs" style="left:250px;top:1330px;width:580px;height:500px;border-radius:44px;overflow:hidden;border:8px solid #25D366;box-shadow:0 30px 80px rgba(0,0,0,.6);transform:rotate(-3deg)">
   <img src="file://${face}" style="width:100%;height:100%;object-fit:cover;object-position:50% 20%">
 </div>
 <div class="abs" style="left:640px;top:1300px;transform:rotate(8deg)"><span class="pill" style="background:#ff8a5c;color:#2a0d00;font-size:40px;box-shadow:0 12px 30px rgba(0,0,0,.4)">☕ con un café</span></div>`;},face);
await p.waitForTimeout(300);await p.screenshot({path:out,type:'jpeg',quality:93});console.log('errors',errs);await b.close();})();
