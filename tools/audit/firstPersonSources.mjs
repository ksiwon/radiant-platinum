// 1인칭 개선 FP-00 — 원재료 전수 목록과 **검수 대지** (기획서 FIRST_PERSON §11.1)
//
//     node tools/audit/firstPersonSources.mjs            목록을 새로 세고 대지를 만든다
//     node tools/audit/firstPersonSources.mjs --sheet    세어 둔 목록으로 대지만 다시
//
// 쓰는 것
// - `.audit/first-person/sources.json`    고유 원재료 조각 전부와 지금 게임이 고르는 표현
// - `.audit/first-person/placements.json` 행렬 칸마다의 청크·소품 배치
// - `.audit/first-person/coverage.json`   표현·검수 상태별 개수와 실패
// - `shots/first-person/source-atlas.html` 사람이 눈으로 보는 대지 (파일 하나로 열린다)
//
// ⚠️ **세는 것은 게임 함수가 한다** (`firstPersonSources.collect.ts`). 이 파일은
// 부르고, 대지를 그릴 뿐이다. 대지에 「새 모델」 칸은 아직 비어 있다 — 레시피가
// 하나도 검수되지 않았기 때문이다(FP-01 이후).
import { spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { deflateSync } from 'node:zlib'
import { decodePng } from '../shot/png.mjs'

const ROOT = resolve(import.meta.dirname, '../..')
const DATA = resolve(ROOT, 'public/data')
const AUDIT = resolve(ROOT, '.audit/first-person')
const SHOTS = resolve(ROOT, 'shots/first-person')

if (!process.argv.includes('--sheet')) {
  const run = spawnSync('pnpm', ['exec', 'vitest', 'run', '--config', 'tools/audit/firstPersonSources.config.ts'], {
    cwd: ROOT, stdio: 'inherit', shell: true, env: { ...process.env, PT_REQUIRE_DATA: '1' },
  })
  if (run.status !== 0) {
    console.error('  수집이 섰다 — 대지를 안 만든다')
    process.exit(run.status ?? 1)
  }
}

const coverage = JSON.parse(readFileSync(resolve(AUDIT, 'coverage.json'), 'utf8'))
const { rows } = JSON.parse(readFileSync(resolve(AUDIT, 'sources.json'), 'utf8'))

// ── PNG 한 장 만들기 (8비트 RGBA) ───────────────────────────────────────────
const CRC = new Int32Array(256).map((_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c
})
const crc32 = (buf) => {
  let c = -1
  for (const b of buf) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ -1) >>> 0
}
const chunk = (type, data) => {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data])
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}
function encodePng(w, h, rgba) {
  const raw = Buffer.alloc(h * (w * 4 + 1))
  for (let y = 0; y < h; y++) {
    raw[y * (w * 4 + 1)] = 0
    rgba.copy(raw, y * (w * 4 + 1) + 1, y * w * 4, (y + 1) * w * 4)
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ])
}

// ── 그림 칸 찾기 ─────────────────────────────────────────────────────────────
const texIndex = JSON.parse(readFileSync(resolve(DATA, 'tex/index.json'), 'utf8'))
const propIndex = JSON.parse(readFileSync(resolve(DATA, 'props/index.json'), 'utf8'))
const sheets = new Map()
const sheetOf = (file) => {
  let s = sheets.get(file)
  if (!s) {
    const png = decodePng(readFileSync(resolve(DATA, file)))
    s = png
    sheets.set(file, s)
  }
  return s
}
const itemFor = (row) => {
  const info = row.kind === 'chunk' ? texIndex.sets[row.texSet] : propIndex.sheets[row.asset]
  const file = row.kind === 'chunk' ? `tex/${String(row.texSet)}.png` : `props/${String(row.asset)}.png`
  const it = info?.items.find(([tex, pal]) => tex === row.tex && pal === (row.pal ?? ''))
  return it ? { file, x: it[2], y: it[3], w: it[4], h: it[5] } : null
}
const images = new Map()
const imageId = (row) => {
  const item = itemFor(row)
  if (!item) return null
  const key = `${row.tex}/${row.pal}/${row.itemHash}`
  if (images.has(key)) return images.get(key).id
  const png = sheetOf(item.file)
  const { bpp } = png
  const out = Buffer.alloc(item.w * item.h * 4)
  for (let y = 0; y < item.h; y++) {
    for (let x = 0; x < item.w; x++) {
      const s = ((item.y + y) * png.w + item.x + x) * bpp
      const d = (y * item.w + x) * 4
      out[d] = png.pixels[s]; out[d + 1] = png.pixels[s + 1]; out[d + 2] = png.pixels[s + 2]
      out[d + 3] = bpp === 4 ? png.pixels[s + 3] : 255
    }
  }
  const id = `i${String(images.size)}`
  images.set(key, { id, w: item.w, h: item.h, uri: `data:image/png;base64,${encodePng(item.w, item.h, out).toString('base64')}` })
  return id
}

// ── 묶기: 같은 그림·같은 칸·같은 표현이면 한 장 ───────────────────────────────
const cards = new Map()
for (const r of rows) {
  const rect = r.texelRect ? r.texelRect.map((n) => Math.round(n)).join(',') : '-'
  const key = `${r.kind}|${r.tex}|${r.pal}|${r.itemHash}|${rect}|${r.outcome}`
  let c = cards.get(key)
  if (!c) {
    c = {
      kind: r.kind, tex: r.tex, pal: r.pal, rect: r.texelRect, outcome: r.outcome, lean: r.lean,
      wraps: r.wraps, fractional: r.fractional, candidates: r.semantic.candidates,
      parts: 0, tris: 0, assets: new Set(), sets: new Set(), sample: r,
    }
    cards.set(key, c)
  }
  c.parts += 1
  c.tris += r.tris
  c.assets.add(r.asset)
  if (r.texSet !== null) c.sets.add(r.texSet)
  c.wraps ||= r.wraps
  c.fractional ||= r.fractional
}

/**
 * 대지에 올릴 것. 전부 올리면 수만 장이라 브라우저가 못 연다 —
 * **바뀌는 것**(걷기·세우기·못 찾음)과 imped는 전부, 그대로 두는 것은 삼각형이
 * 많은 순으로 앞의 것만 올린다. 무엇을 뺐는지는 머리말에 센다
 */
const all = [...cards.values()]
const changing = all.filter((c) => c.outcome !== 'keep:original' || c.tex === 'imped')
const kept = all.filter((c) => !changing.includes(c)).sort((a, b) => b.tris - a.tris)
const KEEP_SHOWN = 300
const shown = [...changing.sort((a, b) => a.outcome.localeCompare(b.outcome) || b.tris - a.tris), ...kept.slice(0, KEEP_SHOWN)]

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch])
const OUTCOME_NOTE = {
  'keep:original': '롬 삼각형 그대로',
  'keep:cutout-flat': '오려 낸 그림, 눕힘 각 아님 — 그대로',
  'stand:card': '45°·63.4° 판을 세움 + 1텍셀 껍질',
  'replace:foliage': '잎 판을 걷고 Foliage 수관',
  'remove:baked-shadow': '구운 그림자를 걷음 (나무 자리로만 씀)',
  'replace:rock-named': 'searock 판을 걷고 Rocks 정이십면체',
  'replace:rock-lump': '덩이 판을 걷고 Rocks 정이십면체 — 화분·덤불도 여기',
  'keep:no-sheet': '그 묶음에 그림이 없다 → 게임은 자홍 MISSING으로 그린다 (화면 검증 필요)',
  'replace:recipe': '검수된 새 표현 레시피가 맡았다 (scene/visual)',
}

const cardHtml = (c) => {
  const id = c.kind === 'chunk' || c.kind === 'prop' ? imageId(c.sample) : null
  const img = id === null ? null : [...images.values()].find((v) => v.id === id)
  const scale = img ? Math.max(1, Math.floor(128 / Math.max(img.w, img.h))) : 1
  let box = ''
  if (img && c.rect) {
    const [x0, y0, x1, y1] = c.rect
    const cx0 = Math.max(0, Math.min(img.w, x0)), cy0 = Math.max(0, Math.min(img.h, y0))
    const cx1 = Math.max(0, Math.min(img.w, x1)), cy1 = Math.max(0, Math.min(img.h, y1))
    box = `<span class="uv" style="left:${cx0 * scale}px;top:${cy0 * scale}px;width:${Math.max(1, (cx1 - cx0) * scale)}px;height:${Math.max(1, (cy1 - cy0) * scale)}px"></span>`
  }
  const pic = img
    ? `<div class="pic ${id}" style="width:${img.w * scale}px;height:${img.h * scale}px">${box}</div>`
    : '<div class="pic none">그림 없음</div>'
  const cand = c.candidates.length > 0
    ? c.candidates.map((k) => `${esc(k.name)} ${Math.round(k.share * 100)}%`).join(' · ') : '미분류'
  const flags = [c.wraps ? '반복 UV' : '', c.fractional ? '소수 UV' : ''].filter(Boolean).join(' · ')
  return `<article class="card" data-outcome="${esc(c.outcome)}" data-kind="${c.kind}" data-tex="${esc(c.tex)}">
${pic}
<h3>${esc(c.tex ?? '(그림 없음)')}<small>/${esc(c.pal)}</small></h3>
<p class="oc oc-${esc(c.outcome.split(':')[0])}">${esc(c.outcome)}</p>
<dl>
<dt>칸</dt><dd>${c.rect ? esc(c.rect.join(', ')) : '-'}${flags ? ` <em>${flags}</em>` : ''}</dd>
<dt>눕힘</dt><dd>${c.lean === null ? '-' : `${(Math.asin(Math.min(1, c.lean)) * 180 / Math.PI).toFixed(1)}°`}</dd>
<dt>뜻 후보</dt><dd>${cand}</dd>
<dt>개수</dt><dd>조각 ${c.parts} · 삼각형 ${c.tris} · ${c.kind === 'chunk' ? '청크' : '소품'} ${c.assets.size}${c.sets.size ? ` · 묶음 ${[...c.sets].slice(0, 6).join(',')}${c.sets.size > 6 ? '…' : ''}` : ''}</dd>
<dt>레시피</dt><dd>${c.sample.recipe ? `${esc(c.sample.recipe)} · 검수됨` : '없음 · 미검수'}</dd>
</dl>
</article>`
}

const body = shown.map(cardHtml).join('\n')
const css = [...images.values()].map((v) => `.${v.id}{background-image:url(${v.uri})}`).join('\n')
const outcomes = Object.entries(coverage.byOutcome)
  .map(([k, v]) => `<tr><td>${esc(k)}</td><td>${v.parts}</td><td>${v.tris}</td><td>${esc(OUTCOME_NOTE[k.split('/')[1]] ?? '')}</td></tr>`).join('')
const filterButtons = ['전부', ...new Set(shown.map((c) => c.outcome))]
  .map((o) => `<button data-f="${esc(o)}">${esc(o)}</button>`).join('')

const html = `<!doctype html>
<html lang="ko"><head><meta charset="utf-8">
<title>1인칭 원재료 대지</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
:root{--bg:#f6f5f1;--fg:#1d1d1b;--muted:#6b6a64;--card:#fff;--line:#dedbd2;--keep:#4b6b4f;--stand:#2f5d8a;--replace:#8a4f1d;--remove:#7a2f55}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){--bg:#171716;--fg:#ecebe6;--muted:#a09e96;--card:#222220;--line:#3a3935;--keep:#8fc095;--stand:#8ab8e6;--replace:#e6a66c;--remove:#e08ab4}}
body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.5 system-ui,sans-serif}
header{padding:24px 16px 8px;max-width:1200px;margin:auto}
h1{font-size:22px;margin:0 0 6px}
p.lead{color:var(--muted);margin:0 0 12px}
table{border-collapse:collapse;font-size:13px;margin:8px 0 12px}
td,th{border-bottom:1px solid var(--line);padding:3px 10px 3px 0;text-align:left;vertical-align:top}
nav{position:sticky;top:0;background:var(--bg);padding:8px 16px;border-bottom:1px solid var(--line);display:flex;gap:6px;flex-wrap:wrap;z-index:2}
nav button{font:inherit;font-size:12px;padding:3px 8px;border:1px solid var(--line);background:var(--card);color:var(--fg);border-radius:4px;cursor:pointer}
nav button[aria-pressed="true"]{border-color:var(--fg)}
main{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:12px;padding:16px;max-width:1200px;margin:auto}
.card{background:var(--card);border:1px solid var(--line);border-radius:6px;padding:10px;min-width:0}
.pic{position:relative;background-size:100% 100%;image-rendering:pixelated;background-color:#888;background-image:none;margin-bottom:6px;max-width:100%}
.pic.none{height:40px;display:grid;place-items:center;color:var(--muted)}
.uv{position:absolute;outline:2px solid #ff2a6d;box-shadow:0 0 0 1px #fff}
h3{font-size:14px;margin:0;overflow-wrap:anywhere}
h3 small{color:var(--muted);font-weight:400}
.oc{margin:2px 0 6px;font-weight:600;font-size:12px}
.oc-keep{color:var(--keep)}.oc-stand{color:var(--stand)}.oc-replace{color:var(--replace)}.oc-remove{color:var(--remove)}
dl{display:grid;grid-template-columns:auto 1fr;gap:1px 8px;margin:0;font-size:12px}
dt{color:var(--muted)}dd{margin:0;overflow-wrap:anywhere}
em{color:#c0392b;font-style:normal}
${css}
</style></head><body>
<header>
<h1>1인칭 원재료 대지 — FP-00 기준선</h1>
<p class="lead">지금 게임이 원재료 조각마다 고르는 표현입니다. 판정은 게임 함수(<code>plates.ts</code>)가 했고, 뜻은 기획서 §3 imped 영역과 겹치는 정도만 적었습니다. <strong>검수됨 ${coverage.review.verified} · 미검수 ${coverage.review.unreviewed}</strong> (레시피 ${esc((coverage.review.recipes ?? []).map((r) => `${r.id}=${r.review}`).join(', '))}). 분홍 테두리가 그 조각이 쓰는 UV 칸입니다(그림 밖으로 나가면 잘립니다).</p>
<table><tr><th>세기</th><th>값</th></tr>
${Object.entries(coverage.counts).map(([k, v]) => `<tr><td>${esc(k)}</td><td>${v}</td></tr>`).join('')}
<tr><td>반복 UV 조각</td><td>${coverage.wrapsOrFractional.wraps}</td></tr>
<tr><td>소수 UV 조각</td><td>${coverage.wrapsOrFractional.fractional}</td></tr>
<tr><td>이름은 같고 픽셀이 다른 그림</td><td>${coverage.sameNameDifferentPixels}</td></tr>
</table>
<table><tr><th>표현</th><th>조각</th><th>삼각형</th><th>뜻</th></tr>${outcomes}</table>
<p class="lead">대지에는 바뀌는 표현과 imped 전부(${changing.length}장), 그대로 두는 것은 삼각형이 많은 순으로 ${Math.min(KEEP_SHOWN, kept.length)}장만 올렸습니다. 뺀 카드 ${Math.max(0, kept.length - KEEP_SHOWN)}장은 <code>sources.json</code>에 있습니다.</p>
</header>
<nav>${filterButtons}</nav>
<main>${body}</main>
<script>
const buttons=[...document.querySelectorAll('nav button')];
const cards=[...document.querySelectorAll('.card')];
const pick=(f)=>{buttons.forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.f===f)));cards.forEach(c=>{c.hidden=!(f==='전부'||c.dataset.outcome===f)})};
buttons.forEach(b=>b.addEventListener('click',()=>pick(b.dataset.f)));
pick('전부');
</script>
</body></html>
`
mkdirSync(SHOTS, { recursive: true })
writeFileSync(resolve(SHOTS, 'source-atlas.html'), html)
console.log(`  대지 ${String(shown.length)}장 · 그림 ${String(images.size)}장 · ${String(Math.round(html.length / 1024))}KB → shots/first-person/source-atlas.html`)
