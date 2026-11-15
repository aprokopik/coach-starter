// Keyboard walk of the Today tab: Tab order and focus style of each stop, the plan radios' arrow keys, the why button, the hidden status words.
// node kbwalk.js [page.html] [width]   page defaults to index.html in this folder, width to 390. The clock is fixed at Nov 3, 2026 23:15 UTC.
const path=require('path');const pw=require('./pw');
(async()=>{const b=await pw.chromium.launch();const ctx=await b.newContext({viewport:{width:Number(process.argv[3]||390),height:800}});const p=await ctx.newPage();await p.clock.setFixedTime(new Date('2026-11-03T23:15:00Z'));
await p.goto('file://'+(process.argv[2]?path.resolve(process.argv[2]):path.join(__dirname,'index.html')));await p.waitForFunction(()=>window.__harness&&window.__harness.ready);await p.click('#tab-today');await p.waitForTimeout(500);
await p.focus('#tab-today');const seen=[];
for(let i=0;i<40;i++){await p.keyboard.press('Tab');const f=await p.evaluate(()=>{const e=document.activeElement;if(!e)return null;const t=document.querySelector('#today');const card=e.closest('[id^=t-],[id^=n-]');const r=e.getBoundingClientRect();const cs=getComputedStyle(e);return{tag:e.tagName.toLowerCase(),id:e.id,type:e.type||'',name:(e.getAttribute('aria-label')||e.innerText||e.value||'').replace(/\s+/g,' ').slice(0,70),inToday:t.contains(e),card:card&&card.id,h:Math.round(r.height),outline:cs.outlineStyle+' '+cs.outlineWidth,expanded:e.getAttribute('aria-expanded'),checked:e.checked}});
if(!f||!f.inToday&&seen.length)break;if(f.inToday)seen.push(f);}
// radios: arrow keys
await p.focus('#t-bounds input:checked');await p.keyboard.press('ArrowRight');const r1=await p.evaluate(()=>({v:document.querySelector('#t-bounds input:checked').value,up:!document.querySelector('#t-b-upper').hidden}));
await p.keyboard.press('ArrowLeft');await p.keyboard.press('ArrowLeft');const r2=await p.evaluate(()=>({v:document.querySelector('#t-bounds input:checked').value,fb:!document.querySelector('#t-b-fallback').hidden}));
await p.focus('#t-why-btn');await p.keyboard.press('Enter');const w1=await p.evaluate(()=>({exp:document.querySelector('#t-why-btn').getAttribute('aria-expanded'),open:!document.querySelector('#t-why').hidden}));
const sr=await p.evaluate(()=>[...document.querySelectorAll('#today .ck-sr')].slice(0,12).map(e=>e.textContent.trim()+' | '+(e.parentElement.innerText||'').replace(/\s+/g,' ').slice(0,60)));
const cells=await p.evaluate(()=>{const c=document.querySelector('#t-cells');return c&&(c.getAttribute('aria-label')||c.getAttribute('role'))});
console.log(JSON.stringify({seen,radio:{right:r1,left2:r2},why:w1,sr,cells},null,1));await b.close();})();
