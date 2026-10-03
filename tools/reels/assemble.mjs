// 찍어 둔 장면과 글 카드를 트레일러 한 편으로 묶는다 (docs/orders/REELS_20261003.md)
//
//     node tools/reels/assemble.mjs                    .audit/reels/out/radiant-reveal.mp4       (가로 1920×1080)
//     node tools/reels/assemble.mjs --aspect=9:16      .audit/reels/out/radiant-reveal-short.mp4 (세로 1080×1920)
//     node tools/reels/assemble.mjs --cards-only       글 카드만 다시 그린다
//
// ① 장면마다 CDP 프레임(시각이 제각각)을 30fps로 고르게 다시 뽑는다 — 프레임마다 머문 시간을 ffconcat에 적고 `fps=30`이 고른다.
// ② 글 카드는 HTML을 크로미움으로 프레임마다 그려 PNG로 받는다(`cards.mjs`) — ffmpeg `drawtext`보다 글꼴 · 빛 번짐이 곱다.
// ③ 차례대로 `xfade`로 잇는다. 조각 길이는 「큐 길이 + 다음과 겹치는 길이」라 큐 시트의 시각이 그대로 맞는다. 소리는 아직 없다.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { chromium } from 'playwright'
import { CARD_SECONDS, cardPage } from './cards.mjs'

const ROOT = resolve(import.meta.dirname, '../..')
const args = process.argv.slice(2)
const ASPECT = (args.find((a) => a.startsWith('--aspect=')) ?? '--aspect=16:9').slice(9)
const SHORT = ASPECT === '9:16'
const [W, H] = SHORT ? [1080, 1920] : [1920, 1080]
const TAKE = resolve(ROOT, '.audit/reels/take', ASPECT.replace(':', 'x'))
const WORK = resolve(ROOT, '.audit/reels/work', ASPECT.replace(':', 'x'))
const OUT = resolve(ROOT, '.audit/reels/out')
const FPS = 30
/** 겹침이 없는 자리도 두 프레임은 섞는다 — 한 프레임짜리 xfade는 다음 조각을 통째로 버린다(첫 판이 16.8초에서 끊겼다) */
const MIN_FADE = 2 / FPS
const overlap = (e) => Math.max(e.fade ?? 0, MIN_FADE)

/**
 * 본편 — 큐 시트 그대로. `take`는 찍은 장면, `card`는 글 카드. `cut`은 [장면 안 시작, 큐 길이](초).
 * `fade`는 다음 조각과 겹치는 길이, `trans`는 그 겹침의 모양(xfade 이름 · 기본 fade), `warp`는 화면 뒤틀림(`out` 끝으로 갈수록 · `in` 처음에서 풀림)
 */
const MAIN = [
  { cue: 'A1', card: 'disclaimer', fade: 0.3 },
  { cue: 'A2-A4', card: 'tunnel' },
  { cue: 'A5', card: 'sink' },
  { cue: 'A6', card: 'tagline' },
  { cue: 'A7', card: 'white', fade: 0.25 },
  { cue: 'B1', take: 'B1-room', cut: [0.3, 3.5], fade: 0.25 },
  { cue: 'B2', take: 'B2-twinleaf', cut: [0.3, 1.6], fade: 0.25 },
  { cue: 'B3', take: 'B3-jubilife', cut: [0.3, 1.8], fade: 0.25 },
  { cue: 'B4', take: 'B4-floaroma', cut: [0.3, 1.6], fade: 0.25 },
  { cue: 'B5-B6', take: 'B5-switch', cut: [0.1, 1.9], fade: 0.3, trans: 'wiperight' }, // 컷 안에서 3인칭 → 1인칭
  { cue: 'B7', card: 'white', seconds: 0.4, fade: 0.2 },
  { cue: 'C1', take: 'C1-wild', cut: [0.6, 1.5], fade: 0.1 },
  { cue: 'C2', take: 'C1-wild', cut: [2.8, 1.2], fade: 0.1 },
  { cue: 'C3', take: 'C3-move', cut: [4.3, 0.7] },
  { cue: 'C4', take: 'C4-night', cut: [0.9, 0.8] },
  { cue: 'C5', take: 'C5-cave', cut: [3.2, 0.9] },
  { cue: 'C6', take: 'C6-catch', cut: [1.3, 0.6] },
  { cue: 'C7', take: 'C6-catch', cut: [1.9, 1.2], fade: 0.15 },
  { cue: 'C8', take: 'C6-catch', cut: [3.1, 2.1], fade: 0.2 },
  { cue: 'C9', take: 'C9-rival', cut: [0.1, 1.1] },
  { cue: 'C10', take: 'C9-rival', cut: [1.1, 1.3] },
  { cue: 'C11', take: 'C9-rival', cut: [2.6, 1.3], fade: 0.2 },
  { cue: 'D1', take: 'D1-lake', cut: [0.3, 1.3], fade: 0.15 },
  { cue: 'D2', take: 'D2-windworks', cut: [0.5, 0.8] },
  { cue: 'D3', take: 'D3-flowers', cut: [1.4, 1.0] },
  { cue: 'D4', take: 'D4-snow', cut: [0.3, 0.9] },
  { cue: 'D5', take: 'D5-first', cut: [0.4, 1.9] }, // 0.8초에 V
  { cue: 'D6', take: 'D6-night', cut: [0.3, 1.4] },
  { cue: 'D7', take: 'D7-forest', cut: [0.3, 1.0] },
  { cue: 'D8', take: 'D8-lakeside', cut: [0.8, 1.7] },
  { cue: 'D9', take: 'D9-trainer', cut: [0.6, 1.1] },
  { cue: 'D10', take: 'D9-trainer', cut: [1.6, 1.5] },
  { cue: 'D11', take: 'D11-champion', cut: [3.4, 2.4], fade: 0.15 },
  { cue: 'E1a', take: 'E1-a', cut: [0.9, 0.75] },
  { cue: 'E1b', take: 'E1-b', cut: [0.9, 0.9] },
  { cue: 'E1c', take: 'E1-c', cut: [1.8, 1.0] },
  { cue: 'E1d', take: 'E1-d', cut: [0.9, 0.8] },
  { cue: 'E1e', take: 'E1-e', cut: [3.2, 1.0] },
  { cue: 'E1f', take: 'E1-a', cut: [3.4, 0.43] },
  { cue: 'E1g', take: 'E1-c', cut: [2.4, 0.43] },
  { cue: 'E1h', take: 'E1-e', cut: [3.5, 0.44], fade: 0.2 },
  { cue: 'E2', take: 'E2-spear', cut: [0.6, 2.1], warp: 'out', fade: 0.4 },
  { cue: 'E3a', take: 'E3-distortion', cut: [0.6, 2.4], warp: 'in', fade: 0.3 }, // 1.8초에 V — 1인칭 → 3인칭
  { cue: 'E3b', take: 'E3-giratina', cut: [2.5, 1.6], fade: 0.15 },
  { cue: 'E4', card: 'white', seconds: 0.5, fade: 0.3 },
  { cue: 'F1', card: 'wordmark', fade: 0.2 },
  { cue: 'F2', card: 'rom', fade: 0.2 },
  { cue: 'F3', card: 'promo' },
]

/** 쇼츠 — 문서 「쇼츠 · 릴스」. 세로로 다시 찍은 장면을 쓴다 */
const SHORTS = [
  { cue: 'A1', card: 'disclaimer', seconds: 2.4, fade: 0.3 },
  { cue: 'A2-A4', card: 'tunnel', seconds: 6.8 },
  { cue: 'A5', card: 'sink' },
  { cue: 'A6', card: 'tagline', seconds: 3.6 },
  { cue: 'A7', card: 'white', fade: 0.25 },
  { cue: 'B1', take: 'B1-room', cut: [0.3, 2.6], fade: 0.25 },
  { cue: 'B2', take: 'B2-twinleaf', cut: [0.3, 1.6], fade: 0.25 },
  { cue: 'B5-B6', take: 'B5-switch', cut: [0.1, 1.9], fade: 0.3, trans: 'wipeup' },
  { cue: 'B7', card: 'white', seconds: 0.4, fade: 0.2 },
  { cue: 'C1', take: 'C1-wild', cut: [0.6, 1.5], crop: 0.5, fade: 0.1 },
  { cue: 'C2', take: 'C1-wild', cut: [2.8, 1.2], crop: 0.33, fade: 0.1 },
  { cue: 'C3', take: 'C3-move', cut: [4.3, 0.7], crop: 0.47 },
  { cue: 'C6', take: 'C6-catch', cut: [1.3, 0.6], crop: 0.5 },
  { cue: 'C7', take: 'C6-catch', cut: [1.9, 1.2], crop: 0.5, fade: 0.15 },
  { cue: 'C10', take: 'C9-rival', cut: [1.1, 1.3], crop: 0.58 },
  { cue: 'D5', take: 'D5-first', cut: [0.4, 2.2] },
  { cue: 'D6', take: 'D6-night', cut: [0.3, 1.2] },
  { cue: 'D8', take: 'D8-lakeside', cut: [0.3, 1.2] },
  { cue: 'D9', take: 'D9-trainer', cut: [0.6, 1.1], crop: 0.33 },
  { cue: 'D10', take: 'D9-trainer', cut: [1.6, 1.5], crop: 0.45 },
  { cue: 'D11', take: 'D11-champion', cut: [3.6, 2.0], crop: 0.62, fade: 0.15 },
  { cue: 'E1a', take: 'E1-a', cut: [0.9, 0.75], crop: 0.45 },
  { cue: 'E1c', take: 'E1-c', cut: [1.8, 0.8], crop: 0.45 },
  { cue: 'E1e', take: 'E1-e', cut: [3.2, 0.8], crop: 0.42, fade: 0.2 },
  { cue: 'E2', take: 'E2-spear', cut: [0.6, 1.6], warp: 'out', fade: 0.4 },
  { cue: 'E3a', take: 'E3-distortion', cut: [0.6, 2.4], warp: 'in', fade: 0.3 },
  { cue: 'E3b', take: 'E3-giratina', cut: [2.5, 1.6], crop: 0.55, fade: 0.15 },
  { cue: 'E4', card: 'white', seconds: 0.5, fade: 0.3 },
  { cue: 'F1', card: 'wordmark', seconds: 2.5, fade: 0.2 },
  { cue: 'F2', card: 'rom', seconds: 4.2, fade: 0.2 },
  { cue: 'F3', card: 'promo', seconds: 3.5 },
]

const EDIT = SHORT ? SHORTS : MAIN
const run = (cmd, argv) => execFileSync(cmd, argv, { stdio: ['ignore', 'ignore', 'pipe'], maxBuffer: 1 << 26 })
const enc = ['-r', String(FPS), '-c:v', 'libx264', '-crf', '14', '-preset', 'slow', '-pix_fmt', 'yuv420p']

/** 화면 뒤틀림 — 깨어진 세계로 넘어가는 E3. 진폭이 0에서 오르거나(out) 내린다(in) */
function warpFilter(kind, len) {
  const ramp = kind === 'out' ? `pow(clip((T-${(len - 1.0).toFixed(3)})/1.0\\,0\\,1)\\,2)` : `pow(clip(1-T/0.9\\,0\\,1)\\,2)`
  const A = `(${String(Math.round(W * 0.03))}*${ramp})`
  const dx = `X+${A}*sin(Y/41+T*13)`
  const dy = `Y+${A}*0.55*sin(X/57+T*9)`
  return ['format=gbrp', `geq=r='r(${dx},${dy})':g='g(${dx},${dy})':b='b(${dx},${dy})'`]
}

/** 장면 하나 → 30fps mp4 (길이 = 큐 길이 + 겹침) */
function takeClip(e, file) {
  // `crop` — 세로판에서 가로로 찍은 장면을 잘라 쓴다(값은 자를 창의 가운데 · 가로 폭의 비율). 배틀 카메라는 세로 화면에 맞춰
  // 서지 않아(노트북 이상만 본다) 세로로 찍으면 내 포켓몬이 화면 밖으로 잘린다
  const dir = resolve(e.crop === undefined ? TAKE : resolve(ROOT, '.audit/reels/take/16x9'), e.take)
  const { frames } = JSON.parse(readFileSync(resolve(dir, 'frames.json'), 'utf8'))
  if (frames.length < 2) throw new Error(`${e.take}: 프레임이 ${String(frames.length)}장`)
  const lines = ['ffconcat version 1.0']
  for (let i = 0; i < frames.length; i++) {
    const next = frames[i + 1]?.t ?? frames[i].t + 1 / FPS
    lines.push(`file '${resolve(dir, frames[i].name).replace(/\\/g, '/')}'`, `duration ${(next - frames[i].t).toFixed(5)}`)
  }
  // 마지막 장은 한 번 더 적어야 그 길이가 먹는다 (concat 분리기의 규칙)
  lines.push(`file '${resolve(dir, frames.at(-1).name).replace(/\\/g, '/')}'`)
  const list = resolve(WORK, `${e.cue}.ffconcat`)
  writeFileSync(list, lines.join('\n'))
  const [from, cue] = e.cut
  const len = cue + overlap(e)
  const vf = [`fps=${FPS}`, `trim=start=${from}:duration=${len}`, 'setpts=PTS-STARTPTS']
  if (e.crop !== undefined) {
    const cw = Math.round((1080 * 9) / 16)
    const x = Math.round(Math.min(1920 - cw, Math.max(0, e.crop * 1920 - cw / 2)))
    vf.push(`crop=${String(cw)}:1080:${String(x)}:0`)
  }
  vf.push(`scale=${W}:${H}:flags=lanczos`)
  if (e.warp) vf.push(...warpFilter(e.warp, len))
  vf.push('format=yuv420p')
  run('ffmpeg', ['-y', '-v', 'error', '-safe', '0', '-f', 'concat', '-i', list, '-vf', vf.join(','), ...enc, file])
}

/** 카드 → mp4. 프레임마다 `draw(t)`를 부르고 찍는다 */
async function cardClip(page, e, file) {
  const cue = e.seconds ?? CARD_SECONDS[e.card]
  const len = cue + overlap(e)
  const n = Math.round(len * FPS)
  const dir = resolve(WORK, `card-${e.cue}`)
  mkdirSync(dir, { recursive: true })
  await page.setContent(cardPage(e.card, W, H, { short: SHORT }), { waitUntil: 'networkidle' })
  await page.evaluate(() => document.fonts.ready)
  // 카드 안의 시각은 큐 길이 기준이다 — 겹치는 꼬리는 마지막 모습을 이어 간다
  const scale = e.seconds && CARD_SECONDS[e.card] ? CARD_SECONDS[e.card] / e.seconds : 1
  for (let i = 0; i < n; i++) {
    const t = Math.min(i / FPS, cue - 1e-3) * (e.card === 'tunnel' ? 1 : scale)
    await page.evaluate((x) => new Promise((done) => { window.draw(x); requestAnimationFrame(() => { requestAnimationFrame(done) }) }), t)
    writeFileSync(resolve(dir, `c-${String(i).padStart(4, '0')}.png`), await page.screenshot())
  }
  run('ffmpeg', ['-y', '-v', 'error', '-framerate', String(FPS), '-i', resolve(dir, 'c-%04d.png'), ...enc, file])
}

function duration(file) {
  return Number(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', file]).toString().trim())
}

async function main() {
  mkdirSync(WORK, { recursive: true })
  mkdirSync(OUT, { recursive: true })
  const cardsOnly = args.includes('--cards-only')
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 })
  const clips = []
  let missing = 0
  try {
    for (const e of EDIT) {
      const file = resolve(WORK, `${e.cue}.mp4`)
      if (e.take) {
        if (!existsSync(resolve(e.crop === undefined ? TAKE : resolve(ROOT, '.audit/reels/take/16x9'), e.take, 'frames.json'))) { console.log(`  ${e.cue.padEnd(6)} ${e.take} 안 찍었다 — 건너뛴다`); missing++; continue }
        if (!cardsOnly || !existsSync(file)) takeClip(e, file)
      } else await cardClip(page, e, file)
      clips.push({ file, cue: e.cue, fade: overlap(e), trans: e.trans ?? 'fade', seconds: duration(file) })
      console.log(`  ${e.cue.padEnd(6)} ${(e.take ?? e.card).padEnd(16)} ${clips.at(-1).seconds.toFixed(2)}초`)
    }
  } finally {
    await browser.close()
  }
  // 이어 붙인다 — 겹침이 없는 자리는 두 프레임짜리 섞기로 사실상 그냥 자른다
  const inputs = clips.flatMap((c) => ['-i', c.file])
  // ⚠️ 조각마다 픽셀 형식을 맞춘다 — 찍은 장면은 JPEG에서 와서 풀 레인지(yuvj420p)이고 카드는 yuv420p다. 섞여 있으면 xfade가
  // 거기서 멈춘다(첫 판이 16.8초에서 끊겼다)
  const parts = clips.map((_, i) => `[${String(i)}:v]scale=out_range=tv,format=yuv420p,setsar=1,fps=${String(FPS)},settb=AVTB[n${String(i)}]`)
  let last = '[n0]'
  let at = clips[0].seconds
  const stamps = [`${clips[0].cue} 0.00`]
  for (let i = 1; i < clips.length; i++) {
    const f = clips[i - 1].fade
    const out = i === clips.length - 1 ? '[v]' : `[x${String(i)}]`
    parts.push(`${last}[n${String(i)}]xfade=transition=${clips[i - 1].trans}:duration=${f.toFixed(4)}:offset=${(at - f).toFixed(4)}${out}`)
    stamps.push(`${clips[i].cue} ${(at - f).toFixed(2)}`)
    at += clips[i].seconds - f
    last = out
  }
  const final = resolve(OUT, SHORT ? 'radiant-reveal-short.mp4' : 'radiant-reveal.mp4')
  run('ffmpeg', ['-y', '-v', 'error', ...inputs, '-filter_complex', parts.join(';'), '-map', '[v]', ...enc,
    '-movflags', '+faststart', final])
  writeFileSync(resolve(WORK, 'stamps.txt'), stamps.join('\n'))
  console.log(`\n  ${final} · ${duration(final).toFixed(2)}초${missing ? ` · 빠진 장면 ${String(missing)}` : ''}`)
}

await main()
