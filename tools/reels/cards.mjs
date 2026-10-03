// 트레일러의 글 카드 — `docs/orders/REELS_20261003.md`의 A · F 큐
//
// 카드마다 HTML 한 장을 띄우고 `draw(t)`(t는 카드 안의 초)를 프레임마다 불러 찍는다. 프레임이 서로 기대지 않게 모든 움직임을
// **시각의 함수**로 쓴다 — 터널의 빛줄기도 매 프레임 「지금까지 얼마나 나아갔나」를 처음부터 적분해 그린다.
import { readFileSync } from 'node:fs'
import { extname, resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '../..')
/** 그림은 data URI로 넣는다 — `setContent`의 빈 문서(about:blank)에서는 file:// 그림이 막힌다 */
const url = (p) => `data:image/${extname(p).slice(1)};base64,${readFileSync(resolve(ROOT, p)).toString('base64')}`

/** 연표 (일본 첫 발매 해) — 문서 「연표」 */
export const LINEUP = [
  ['적·녹', 1996], ['청', 1996], ['피카츄', 1998], ['금·은', 1999], ['크리스탈', 2000], ['루비·사파이어', 2002],
  ['파이어레드·리프그린', 2004], ['에메랄드', 2004], ['디아루가·펄', 2006], ['플래티넘', 2008], ['하트골드·소울실버', 2009],
  ['블랙·화이트', 2010], ['블랙2·화이트2', 2012], ['X·Y', 2013], ['오메가루비·알파사파이어', 2014], ['썬·문', 2016],
  ['울트라썬·울트라문', 2017], ['레츠고! 피카츄·레츠고! 이브이', 2018], ['소드·실드', 2019],
  ['브릴리언트 다이아몬드·샤이닝 펄', 2021], ['LEGENDS 아르세우스', 2022], ['스칼렛·바이올렛', 2022], ['LEGENDS Z-A', 2025],
]
export const PLATINUM = LINEUP.findIndex(([n]) => n === '플래티넘')

/** 카드 길이(초) */
export const CARD_SECONDS = {
  disclaimer: 3.0,
  tunnel: 13.8, // A2 11초 + A3 감기 2초 + A4 섬광 0.8초
  sink: 0.7,
  tagline: 5.0,
  white: 0.3,
  wordmark: 4.0,
  rom: 7.0,
  promo: 5.0,
}

/**
 * 카드 페이지 — `window.draw(t)`를 내놓는다. `short`면 연표를 더 빨리 돈다(쇼츠)
 */
export function cardPage(kind, W, H, opts = {}) {
  // ⚠️ 카드마다 스크립트를 함수로 감싼다 — `setContent`는 같은 창을 다시 쓰므로, 맨 위의 `const W`가 둘째 카드에서
  // 「이미 선언됐다」로 터지고 앞 카드의 `draw`가 그대로 남는다(연표가 통째로 까맣게 나왔다)
  return page(kind, W, H, opts).replace(/<script>/g, '<script>(()=>{').replace(/<\/script>/g, '})()</script>')
}

function page(kind, W, H, { short = false } = {}) {
  const portrait = H > W
  const u = Math.min(W, H) / 1080 // 글자 크기 단위 — 짧은 변 기준
  const head = `<!doctype html><meta charset="utf-8">
<link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/static/pretendard.min.css">
<style>
html,body{margin:0;width:${W}px;height:${H}px;background:#000;overflow:hidden}
body{font-family:Pretendard,'Malgun Gothic',sans-serif;color:#fff}
canvas{position:absolute;inset:0}
.c{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center}
.silver{background:linear-gradient(180deg,#ffffff 0%,#dfe8f5 38%,#9fb0c8 52%,#eef3fb 70%,#c2cfe0 100%);-webkit-background-clip:text;background-clip:text;color:transparent}
</style><body>`
  const common = `const W=${W},H=${H},U=${u},PORTRAIT=${portrait};
const clamp=(x,a=0,b=1)=>Math.min(b,Math.max(a,x));
const ease=(x)=>{x=clamp(x);return x*x*(3-2*x)};
const easeOut=(x)=>1-Math.pow(1-clamp(x),3);`

  if (kind === 'disclaimer') {
    return `${head}<div class="c"><div id="m" style="font-size:${30 * u}px;font-weight:500;color:#8d929c;letter-spacing:${1 * u}px">본 게임은 팬 게임이며, 수익을 창출하지 않습니다.</div></div>
<canvas id="cv" width="${W}" height="${H}"></canvas><script>${common}
const m=document.getElementById('m'),g=document.getElementById('cv').getContext('2d');
window.draw=(t)=>{m.style.opacity=(ease(t/0.5)*(1-ease((t-2.5)/0.5))).toFixed(3);
g.clearRect(0,0,W,H);const k=ease((t-2.6)/0.4);if(k>0){const r=(6+40*k)*U;const gr=g.createRadialGradient(W/2,H/2,0,W/2,H/2,r);
gr.addColorStop(0,'rgba(220,235,255,'+k+')');gr.addColorStop(1,'rgba(120,170,255,0)');g.fillStyle=gr;g.fillRect(0,0,W,H)}}</script>`
  }

  if (kind === 'tunnel') {
    // 칸 길이 — 앞 넷 0.8 · 가운데 0.45 · 뒤 여섯 0.3 · 플래티넘 0.9, 합을 A2 길이로 맞춘다
    const raw = LINEUP.map((_, i) => (i === PLATINUM ? 0.9 : i < 4 ? 0.8 : i >= LINEUP.length - 6 ? 0.3 : 0.45))
    const A2 = short ? 6.0 : 11.0
    const sum = raw.reduce((a, b) => a + b, 0)
    const slots = raw.map((d) => (d * A2) / sum)
    return `${head}<canvas id="cv" width="${W}" height="${H}"></canvas>
<div class="c" id="box"><div id="tt" class="silver" style="font-weight:800;white-space:nowrap"></div>
<div id="yy" class="silver" style="font-weight:600;margin-top:${18 * u}px;letter-spacing:${8 * u}px"></div></div>
<div id="wash" style="position:absolute;inset:0;background:#fff;opacity:0"></div>
<script>${common}
const L=${JSON.stringify(LINEUP)},P=${PLATINUM},SL=${JSON.stringify(slots)},A2=${A2},REW=${short ? 1.5 : 2.0},FL=0.8;
const starts=[];{let a=0;for(const d of SL){starts.push(a);a+=d}}
const g=document.getElementById('cv').getContext('2d'),tt=document.getElementById('tt'),yy=document.getElementById('yy'),box=document.getElementById('box'),wash=document.getElementById('wash');
// 빛줄기 — 각도 · 깊이를 씨앗으로 정해 두고, 나아간 거리 s만큼 깊이를 줄인다
let seed=7;const rnd=()=>{seed=(seed*16807)%2147483647;return seed/2147483647};
const N=520,ST=[];for(let i=0;i<N;i++)ST.push({a:rnd()*Math.PI*2,z:rnd(),w:0.4+rnd()*1.6,h:0.55+rnd()*0.45,c:rnd()});
const speed=(t)=>t<A2?0.55+0.6*(t/A2):t<A2+REW?-2.6*Math.sin(Math.PI*(t-A2)/REW)-0.1:0.4+5*((t-A2-REW)/FL);
const travel=(t)=>{let s=0;const dt=1/240;for(let x=0;x<t;x+=dt)s+=speed(x)*dt;return s};
const R=Math.hypot(W,H)/2;
function streaks(t,glow){const s=travel(t),v=speed(t);g.fillStyle='#000';g.fillRect(0,0,W,H);
const bg=g.createRadialGradient(W/2,H/2,0,W/2,H/2,R);bg.addColorStop(0,'rgba(40,90,190,'+(0.35+0.4*glow)+')');bg.addColorStop(0.35,'rgba(10,30,80,0.5)');bg.addColorStop(1,'#000');
g.fillStyle=bg;g.fillRect(0,0,W,H);g.globalCompositeOperation='lighter';
for(const p of ST){let z=((p.z-s*0.35)%1+1)%1;z=0.02+z*0.98;const len=clamp(Math.abs(v)*0.05,0.008,0.25);
const r0=R*0.06/z,r1=R*0.06/Math.min(1,z+len);if(r1>R*1.3)continue;const al=clamp((1-z)*1.4)*p.h;
const hue=p.c<0.8?'150,195,255':'235,245,255';g.strokeStyle='rgba('+hue+','+al.toFixed(3)+')';g.lineWidth=p.w*U*(1.2-z);
g.beginPath();g.moveTo(W/2+Math.cos(p.a)*r1,H/2+Math.sin(p.a)*r1);g.lineTo(W/2+Math.cos(p.a)*r0,H/2+Math.sin(p.a)*r0);g.stroke()}
g.globalCompositeOperation='source-over'}
function show(i,k,dir,extra){// k: 칸 안의 진행 0~1, dir: 1 앞으로 · -1 감기
const [n,y]=L[i];const big=n.length>14?0.62:n.length>9?0.8:1;const fs=(PORTRAIT?96:136)*U*big;
tt.textContent=n;yy.textContent=String(y);tt.style.fontSize=fs+'px';yy.style.fontSize=(PORTRAIT?44:52)*U+'px';
let sc,al;if(dir>0){const a=easeOut(k/0.35),b=ease((k-0.8)/0.2);sc=0.25+0.75*a+2.2*b;al=a*(1-b)}else{sc=1.6-0.6*easeOut(k);al=1-Math.abs(k-0.5)*1.6}
sc*=1+(extra||0)*0.06;box.style.transform='scale('+sc.toFixed(4)+')';box.style.opacity=clamp(al).toFixed(3);
const gl=(i===P?1:0.35)+(extra||0)*2;box.style.filter='drop-shadow(0 0 '+(10*gl*U)+'px rgba(140,190,255,0.9)) drop-shadow(0 0 '+(36*gl*U)+'px rgba(90,140,255,'+(0.4+0.3*(extra||0))+'))'}
window.draw=(t)=>{wash.style.opacity=0;
if(t<A2){streaks(t,0);let i=starts.findIndex((a,j)=>t>=a&&t<a+SL[j]);if(i<0)i=L.length-1;
// 플래티넘은 처음 지날 때도 한 박자 머문다 — 칸 안에서 사라지는 끝을 늦춘다
let k=(t-starts[i])/SL[i];if(i===L.length-1)k=Math.min(k,0.6);show(i,k,1,i===P?0.3:0);return}
if(t<A2+REW){streaks(t,0.2);const x=(t-A2)/REW;const span=L.length-1-P;const f=(L.length-1)-span*easeOut(x*1.08);
const i=Math.max(P,Math.round(f));if(x>0.85){show(P,0.5+(x-0.85)/0.3,-1,ease((x-0.85)/0.15)*0.5);return}show(i,(f-Math.floor(f)),-1,0);return}
const x=(t-A2-REW)/FL;streaks(t,0.6+x);show(P,0.5,-1,0.5+x*6);wash.style.opacity=ease(x*1.15).toFixed(3)}</script>`
  }

  if (kind === 'sink') {
    return `${head}<div id="w" style="position:absolute;inset:0;background:#fff"></div><script>${common}
const w=document.getElementById('w');window.draw=(t)=>{w.style.opacity=(1-ease(t/0.7)).toFixed(3)}</script>`
  }

  if (kind === 'white') return `${head}<div style="position:absolute;inset:0;background:#fff"></div><script>window.draw=()=>{}</script>`

  if (kind === 'tagline') {
    const text = portrait ? '그때 그 찬란함을<br>또 다시 한번' : '그때 그 찬란함을 또 다시 한번'
    return `${head}<canvas id="cv" width="${W}" height="${H}"></canvas>
<div class="c" id="box"><div id="tx" style="font-size:${(portrait ? 96 : 84) * u}px;font-weight:700;line-height:1.35;letter-spacing:${4 * u}px;color:#d6e8ff">${text}</div></div>
<div id="wash" style="position:absolute;inset:0;background:#fff;opacity:0"></div>
<script>${common}
const g=document.getElementById('cv').getContext('2d'),box=document.getElementById('box'),tx=document.getElementById('tx'),wash=document.getElementById('wash');
window.draw=(t)=>{const a=ease(t/3),z=ease((t-4.5)/0.5);
box.style.opacity=a.toFixed(3);box.style.filter='blur('+((1-a)*14*U).toFixed(2)+'px)';
box.style.transform='scale('+(0.92+0.06*(t/5)+0.25*z*z).toFixed(4)+')';
tx.style.textShadow='0 0 '+(18*U)+'px rgba(150,200,255,0.9),0 0 '+(60*U)+'px rgba(90,150,255,'+(0.5+0.5*z)+')';
g.clearRect(0,0,W,H);if(z>0){g.globalCompositeOperation='lighter';for(let i=0;i<40;i++){const an=i/40*Math.PI*2+0.3,r=Math.hypot(W,H)*z;
const gr=g.createLinearGradient(W/2,H/2,W/2+Math.cos(an)*r,H/2+Math.sin(an)*r);gr.addColorStop(0,'rgba(200,225,255,'+(0.5*z)+')');gr.addColorStop(1,'rgba(120,170,255,0)');
g.strokeStyle=gr;g.lineWidth=(2+(i%3)*2)*U;g.beginPath();g.moveTo(W/2,H/2);g.lineTo(W/2+Math.cos(an)*r,H/2+Math.sin(an)*r);g.stroke()}g.globalCompositeOperation='source-over'}
wash.style.opacity=ease((t-4.75)/0.25).toFixed(3)}</script>`
  }

  if (kind === 'wordmark') {
    const iw = portrait ? W : W * 0.82
    return `${head}<div class="c"><div id="lg" style="position:relative;width:${iw}px;height:${(iw * 941) / 1672}px;background:url('${url('public/assets/radiant-platinum-intro.webp')}') center/cover;overflow:hidden">
<div id="sw" style="position:absolute;top:-30%;bottom:-30%;width:22%;transform:skewX(-18deg);background:linear-gradient(90deg,rgba(255,255,255,0) 0%,rgba(255,255,255,0.55) 50%,rgba(255,255,255,0) 100%);mix-blend-mode:screen"></div></div></div>
<script>${common}
const lg=document.getElementById('lg'),sw=document.getElementById('sw');
window.draw=(t)=>{lg.style.opacity=(ease(t/0.6)*(1-ease((t-3.5)/0.5))).toFixed(3);lg.style.transform='scale('+(1+0.035*t/4).toFixed(4)+')';
const x=(t-0.9)/1.1;sw.style.left=(-40+170*clamp(x))+'%';sw.style.opacity=(x>0&&x<1)?1:0}</script>`
  }

  if (kind === 'rom') {
    return `${head}<div class="c" id="box" style="padding:0 ${portrait ? 70 : 240}px">
<div style="font-size:${(portrait ? 58 : 60) * u}px;font-weight:700;color:#eef3ff">팬 프로젝트 · 브라우저에서 바로 플레이</div>
<div style="font-size:${(portrait ? 54 : 50) * u}px;font-weight:600;color:#9cc4ff;margin-top:${34 * u}px;letter-spacing:${2 * u}px">radiant.siwon.it.kr</div>
<div style="font-size:${(portrait ? 30 : 26) * u}px;font-weight:400;color:#8b93a3;margin-top:${(portrait ? 110 : 90) * u}px;line-height:1.7;max-width:${portrait ? 900 : 1300}px">
플레이하려면 본인이 가진 포켓몬스터 플래티넘의 원본 롬과<br>브릴리언트 다이아몬드·샤이닝 펄의 원본 게임 데이터가 필요합니다.<br>어느 것도 제공하지 않습니다.</div></div>
<script>${common}const b=document.getElementById('box');window.draw=(t)=>{b.style.opacity=(ease(t/0.6)*(1-ease((t-6.5)/0.5))).toFixed(3)}</script>`
  }

  if (kind === 'promo') {
    const shot = (img, name, link) => `<div style="display:flex;flex-direction:column;align-items:center;margin:${portrait ? `${28 * u}px 0` : `0 ${30 * u}px`}">
<div style="width:${portrait ? 820 : 720}px;height:${(portrait ? 820 : 720) * 9 / 16}px;background:url('${url(img)}') center/cover;border-radius:${14 * u}px;box-shadow:0 0 ${40 * u}px rgba(110,160,255,0.35)"></div>
<div style="font-size:${40 * u}px;font-weight:700;margin-top:${22 * u}px;color:#eef3ff">${name}</div>
<div style="font-size:${28 * u}px;color:#9cc4ff;margin-top:${6 * u}px">${link}</div></div>`
    return `${head}<div class="c" id="box">
<div style="font-size:${30 * u}px;color:#8b93a3;letter-spacing:${3 * u}px">만든 사람의 다른 작업</div>
<div style="font-size:${56 * u}px;font-weight:700;color:#eef3ff;margin:${10 * u}px 0 ${portrait ? 40 : 54}px">siwon.it.kr</div>
<div style="display:flex;flex-direction:${portrait ? 'column' : 'row'}">
${shot('.audit/reels/assets/pokerhythm.png', 'PokeRhythm', 'pokerhythm.siwon.it.kr')}
${shot('.audit/reels/assets/pokemon-aegis.png', 'Pokemon Aegis', 'aegis.siwon.it.kr')}</div></div>
<script>${common}const b=document.getElementById('box');window.draw=(t)=>{b.style.opacity=(ease(t/0.6)*(1-ease((t-4.3)/0.7))).toFixed(3)}</script>`
  }
  throw new Error(`모르는 카드: ${kind}`)
}
