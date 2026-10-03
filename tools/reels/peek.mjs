// 글 카드 몇 장만 찍어 본다 — node tools/reels/peek.mjs h '[["tunnel",6.2]]'  →  .audit/reels/peek-*.png
import { chromium } from 'playwright'
import { cardPage } from './cards.mjs'
const [W,H]=process.argv[2]==='v'?[1080,1920]:[1920,1080]
const shots=JSON.parse(process.argv[3])
const b=await chromium.launch();const p=await b.newPage({viewport:{width:W,height:H}})
for(const [kind,t] of shots){await p.setContent(cardPage(kind,W,H),{waitUntil:'networkidle'});await p.evaluate(()=>document.fonts.ready)
await p.evaluate(x=>window.draw(x),t);await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));await p.screenshot({path:`./.audit/reels/peek-${kind}-${t}.png`})}
await b.close()
