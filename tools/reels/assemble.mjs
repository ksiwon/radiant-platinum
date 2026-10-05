// 찍어 둔 장면과 글 카드를 트레일러 한 편으로 묶는다 (docs/orders/REELS_20261003.md)
//
//     node tools/reels/assemble.mjs                    .audit/reels/out/radiant-reveal.mp4       (가로 1920×1080)
//     node tools/reels/assemble.mjs --aspect=9:16      .audit/reels/out/radiant-reveal-short.mp4 (세로 1080×1920)
//     node tools/reels/assemble.mjs --cards-only       글 카드만 다시 그린다
//
// ① 장면마다 CDP 프레임(시각이 제각각)을 30fps로 고르게 다시 뽑는다 — 프레임마다 머문 시간을 ffconcat에 적고 `fps=30`이 고른다.
// ② 글 카드는 HTML을 크로미움으로 프레임마다 그려 PNG로 받는다(`cards.mjs`) — ffmpeg `drawtext`보다 글꼴 · 빛 번짐이 곱다.
// ③ 차례대로 `xfade`로 잇는다. 조각 길이는 「큐 길이 + 다음과 겹치는 길이」라 큐 시트의 시각이 그대로 맞는다.
// ④ 곡(`SCORE`)을 큐 시각에 맞춰 깔고 마지막에 합친다. 곡은 BDSP 원곡을 풀어 둔 wav다(`.audit/reels/music/`, 깃에 없다).
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
  { cue: 'B1', take: 'B1-room', cut: [0.9, 3.5], fade: 0.25 },
  // 떡잎마을 부감은 앞쪽 왼편 위로 맵 밖 흰 허공이 걸린다 — 팬이 오른쪽으로 간 뒤를 쓴다
  { cue: 'B2', take: 'B2-twinleaf', cut: [1.4, 1.3], fade: 0.25 },
  { cue: 'B3', take: 'B3-jubilife', cut: [0.5, 1.8], fade: 0.25 },
  // 길이는 오프닝 곡의 프레이즈가 정한다(`SCORE`의 `fit`) — 야생 배틀 곡이 조우 컷인에 들어온다
  { cue: 'B4', take: 'B4-floaroma', cut: [0.25, 1.6], fade: 0.25 },
  // 한 장면으로 잇는다 — 풀숲을 걷다(0~3.6초) 걸음 조우 컷인(3.6초) · 야생 비버니가 이미 서 있다(4.0초)
  { cue: 'B5-B6', take: 'B5-switch', cut: [0.2, 5.0], fade: 0.15 },
  // 같은 장면의 뒤 — 내 쪽에서 볼이 날아가(8.6초) 열리고(9.0초) 모부기가 내려앉아 선다(11.5초)
  { cue: 'C1', take: 'B5-switch', cut: [8.4, 3.3], fade: 0.2 },
  // 기술은 끝까지 — 모부기 쪽 클로즈업(1.0초) · 꼬링크 몸통박치기(2.0~2.5초)
  { cue: 'C3', take: 'C3-move', cut: [0.9, 2.2], fade: 0.15 },
  // 밤 — 모부기 몸통박치기가 비버니에 맞는다(2.0초)
  { cue: 'C4', take: 'C4-night', cut: [1.6, 1.8], fade: 0.15 },
  // 무쇠게이트 굴 무대 — 꼬마돌 웅크리기 클로즈업(3.5~5.5초)
  { cue: 'C5', take: 'C5-cave', cut: [3.4, 2.4], fade: 0.15 },
  // 포획 — 몬스터볼을 던지고 빨아들이고 떨어진다(0.6~2.6초) → 흔들림 → 별(7.5초)
  { cue: 'C6', take: 'C6-catch', cut: [0.6, 2.0] },
  { cue: 'C7', take: 'C6-catch', cut: [5.6, 1.0], fade: 0.15 },
  // 길이는 야생 배틀 곡의 프레이즈가 정한다(`fit`)
  { cue: 'C8', take: 'C6-catch', cut: [7.1, 1.6], fade: 0.2 },
  { cue: 'D1', take: 'D1-lake', cut: [0.4, 1.8], fade: 0.15 },
  { cue: 'D2', take: 'D2-windworks', cut: [0.5, 1.3] },
  { cue: 'D4', take: 'D4-snow', cut: [0.5, 1.3] },
  { cue: 'D5', take: 'D5-first', cut: [0.4, 2.4] }, // 0.9초에 V
  { cue: 'D6', take: 'D6-night', cut: [0.3, 1.8] },
  { cue: 'D7', take: 'D7-forest', cut: [0.3, 1.3] },
  // 길이는 오프닝 곡의 프레이즈가 정한다(`fit`) — 챔피언의 방으로 넘어간다
  { cue: 'D8', take: 'D8-city', cut: [0.35, 1.8], fade: 0.2 },
  // 난천을 마주 보고 선다 → VS 컷인(10.0초) → 화강돌이 나온다(15.5초). 챔피언 배틀 곡은 컷인에 들어온다
  { cue: 'D11', take: 'D11-champion', cut: [8.7, 7.0], fade: 0.15 },
  // 난천의 루카리오 — 기술 클로즈업(2.0초) · 맞는다(3.0~3.5초)
  { cue: 'D12', take: 'D12-lucario', cut: [1.3, 2.8], fade: 0.15 },
  // 한카리아스의 기술(2.0~3.0초) → 토대부기의 땅 기술(4.5~6.0초). 길이는 챔피언 곡의 프레이즈가 정한다(`fit`)
  { cue: 'D13', take: 'D13-garchomp', cut: [1.8, 4.6], fade: 0.2 },
  { cue: 'E2', take: 'E2-spear', cut: [0.6, 2.1], warp: 'out', fade: 0.4 },
  // 깨어진 세계 — 1인칭으로 판 위를 걷다(0~2.2초) V로 3인칭 내려다보기, 발판을 따라 더 걷는다
  { cue: 'E3a', take: 'E3-distortion', cut: [0.3, 5.0], warp: 'in', fade: 0.2 },
  // 벽으로 뛰어오르면 몸과 카메라가 90° 돈다(0.6~1.5초)
  { cue: 'E3w', take: 'E3-wall', cut: [0.1, 1.5], fade: 0.15 },
  // B4F 숲 — 3인칭으로 나무 사이를 걷는다
  { cue: 'E3c', take: 'E3-b4f', cut: [2.3, 2.8], fade: 0.15 },
  // 기라티나가 서 있다 → 다가가 A → 울음 → 배틀. 길이는 기라티나 곡의 프레이즈가 정한다(`fit`)
  { cue: 'E3b', take: 'E3-giratina', cut: [0.3, 5.0], fade: 0.15 },
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
  { cue: 'A6', card: 'tagline', seconds: 4.8 },
  { cue: 'A7', card: 'white', fade: 0.25 },
  { cue: 'B1', take: 'B1-room', cut: [0.3, 2.6], fade: 0.25 },
  // 길이는 오프닝 곡의 프레이즈가 정한다(`fit`)
  { cue: 'B2', take: 'B2-twinleaf', cut: [0.8, 1.6], fade: 0.25 },
  { cue: 'B5-B6', take: 'B5-switch', cut: [0.2, 5.0], fade: 0.15 },
  { cue: 'C1', take: 'B5-switch', cut: [8.4, 3.3], fade: 0.2 },
  { cue: 'C3', take: 'C3-move', cut: [0.9, 2.2], fade: 0.15 },
  { cue: 'C6', take: 'C6-catch', cut: [0.6, 2.0] },
  // 길이는 야생 배틀 곡의 프레이즈가 정한다(`fit`)
  { cue: 'C8', take: 'C6-catch', cut: [7.1, 1.6], fade: 0.2 },
  { cue: 'D5', take: 'D5-first', cut: [0.4, 2.2] },
  { cue: 'D6', take: 'D6-night', cut: [0.3, 1.4] },
  // 길이는 오프닝 곡의 프레이즈가 정한다(`fit`)
  { cue: 'D8', take: 'D8-city', cut: [0.35, 1.6], fade: 0.2 },
  { cue: 'D11', take: 'D11-champion', cut: [8.7, 7.0], fade: 0.15 },
  { cue: 'D12', take: 'D12-lucario', cut: [1.3, 2.8], crop: 0.5, fade: 0.15 },
  // 길이는 챔피언 곡의 프레이즈가 정한다(`fit`)
  { cue: 'D13', take: 'D13-garchomp', cut: [1.8, 4.6], crop: 0.5, fade: 0.2 },
  { cue: 'E2', take: 'E2-spear', cut: [0.6, 1.6], warp: 'out', fade: 0.4 },
  { cue: 'E3a', take: 'E3-distortion', cut: [0.3, 4.4], warp: 'in', fade: 0.2 },
  { cue: 'E3w', take: 'E3-wall', cut: [0.1, 1.5], crop: 0.45, fade: 0.15 },
  // 길이는 기라티나 곡의 프레이즈가 정한다(`fit`)
  { cue: 'E3b', take: 'E3-giratina', cut: [0.3, 4.4], fade: 0.15 },
  { cue: 'E4', card: 'white', seconds: 0.5, fade: 0.3 },
  { cue: 'F1', card: 'wordmark', seconds: 2.5, fade: 0.2 },
  { cue: 'F2', card: 'rom', seconds: 4.2, fade: 0.2 },
  { cue: 'F3', card: 'promo', seconds: 3.5 },
]

const EDIT = SHORT ? SHORTS : MAIN

/**
 * 곡 — 큐에 붙인다. `at`은 그 큐가 시작하는 시각에서 몇 초 뒤인가, `from`은 곡 안 시작(초), `len`은 까는 길이(초).
 * `len` 대신 `until`(큐)과 `untilAt`(초)을 주면 그 시각까지 깐다. 끝까지면 `until: 'end'`.
 * `snap`(마디 수 — 1 · 4 · 8)을 주면 끝을 곡 안의 그 마디 경계로 맞춘다(가장 가까운 것). 마디표는 `music/bars/<곡>.json`
 * (BA008은 Wwise 박자표, 나머지는 소리에서 잰 것 — 곡을 꺼낸 작업의 실측). 맞춘 만큼 다음 조각이 이어 받는다.
 * `fit`(마디 수)은 반대로 **영상을 곡에 맞춘다** — `until` 큐 바로 앞 조각의 길이를 늘리거나 줄여, 곡이 그 마디 경계에서
 * 끝나는 순간에 컷이 오게 한다(`fitEdit`). 곡이 프레이즈 한가운데서 끊기지 않는다. 늘릴 수 있는 만큼은 찍은 장면 길이가 정한다
 * `fadeIn` · `fadeOut`은 그 조각의 앞뒤 페이드, `gain`은 dB. 조각끼리 겹치면 섞인다. 비어 있으면 소리 없이 낸다
 */
// 곡은 BDSP 원곡이다(`Delphis_Main.bnk` 상태 → wem, `.audit/reels/music/`에 wav로 풀어 둔다).
//   B_OTH001  오프닝 데모 — DS `SEQ_TITLE00`과 길이로 맞췄다. 19초에 한 박 쉬고 21초에 오케스트라가 터진다
//   BA001     야생 배틀 — 루프 57.40초가 DS `SEQ_BA_POKE`와 같다
//   BA008     챔피언 배틀 — `SEQ_BA_CHANP`와 같다
//   BA015     기라티나(오리진폼) — `FieldEncountTable` 487 form1, `SEQ_PL_BA_GIRA`와 같다
//   B_OTH002  타이틀 — `SEQ_TITLE01`과 같다
// 게임 화면이 처음 서는 순간(B1)에 오프닝의 오케스트라가 터지게 앞을 당긴다. 조우 컷인에 야생 배틀 곡이 들어온다
const SCORE = {
  '16:9': [
    // 마디 경계는 `music/bars/<곡>.json`의 4마디 프레이즈다(`fit: 4`). 오프닝은 21.5초(오케스트라가 터지는 박)에 B1이 선다
    { src: 'B_OTH001', cue: 'B1', at: -21.5, from: 0, until: 'B5-B6', untilAt: 3.4, fit: 4, fadeOut: 0.3 },
    { src: 'BA001', cue: 'B5-B6', at: 3.4, from: 0, until: 'D1', fit: 4, fadeOut: 0.25 },
    { src: 'B_OTH001', cue: 'D1', from: 33.94, until: 'D11', untilAt: 1.3, fit: 4, fadeIn: 0.15, fadeOut: 0.3 },
    { src: 'BA008', cue: 'D11', at: 1.3, from: 0, until: 'E2', fit: 4, fadeOut: 0.25 },
    { src: 'BA015', cue: 'E2', from: 0, until: 'E4', fit: 4, fadeIn: 0.1, fadeOut: 0.4 },
    { src: 'B_OTH002', cue: 'F1', from: 0, until: 'end', fadeOut: 1.5 },
  ],
  '9:16': [
    { src: 'B_OTH001', cue: 'B1', at: -21.5, from: 0, until: 'B5-B6', untilAt: 3.4, fit: 4, fadeOut: 0.3 },
    { src: 'BA001', cue: 'B5-B6', at: 3.4, from: 0, until: 'D5', fit: 4, fadeOut: 0.25 },
    { src: 'B_OTH001', cue: 'D5', from: 33.94, until: 'D11', untilAt: 1.3, fit: 1, fadeIn: 0.15, fadeOut: 0.3 },
    { src: 'BA008', cue: 'D11', at: 1.3, from: 0, until: 'E2', fit: 4, fadeOut: 0.25 },
    { src: 'BA015', cue: 'E2', from: 0, until: 'E4', fit: 4, fadeIn: 0.1, fadeOut: 0.4 },
    { src: 'B_OTH002', cue: 'F1', from: 0, until: 'end', fadeOut: 1.5 },
  ],
}[ASPECT] ?? []
const MUSIC = resolve(ROOT, '.audit/reels/music')
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

/**
 * 이 큐가 읽을 장면 폴더. `crop`이 있으면 세로판에서도 가로(16x9)로 찍은 것을 잘라 쓴다(값은 자를 창의 가운데 · 가로 폭의 비율).
 * 배틀 카메라는 세로 화면에 맞춰 서지 않아(노트북 이상만 본다) 세로로 찍으면 내 포켓몬이 화면 밖으로 잘린다
 */
const takeDir = (e) => resolve(e.crop === undefined ? TAKE : resolve(ROOT, '.audit/reels/take/16x9'), e.take)

/** 장면 하나 → 30fps mp4 (길이 = 큐 길이 + 겹침) */
function takeClip(e, file) {
  const dir = takeDir(e)
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

/** 곡 조각을 큐 시각에 놓고 섞어 영상에 붙인다. 끝은 영상 길이에서 자른다 */
/** 곡 안 시각 `t`에 가장 가까운 마디 경계(초). `every`마디마다 — 4면 `phrases4` */
function snapToBar(src, t, every) {
  const file = resolve(MUSIC, 'bars', `${src}.json`)
  if (!existsSync(file)) return t
  const bars = JSON.parse(readFileSync(file, 'utf8'))
  const grid = every >= 8 ? bars.phrases8 : every >= 4 ? bars.phrases4 : bars.downbeats
  let best = t
  for (const g of grid ?? []) if (Math.abs(g - t) < Math.abs(best - t) || best === t) best = g
  return best
}

/** 찍은 장면의 길이(초) — 마지막 프레임의 시각 */
function takeSeconds(e) {
  const file = resolve(takeDir(e), 'frames.json')
  if (!existsSync(file)) return null
  const { frames } = JSON.parse(readFileSync(file, 'utf8'))
  return frames.at(-1).t - frames[0].t
}

/** 조각의 큐 길이(초) */
const cueLength = (e) => (e.take ? e.cut[1] : e.seconds ?? CARD_SECONDS[e.card])

/** 큐가 시작하는 시각 — 앞 조각들의 큐 길이를 더한 것이다(겹침은 다음 조각 안으로 들어간다) */
function cueStarts(edit) {
  const at = {}
  let t = 0
  for (const e of edit) { at[e.cue] = t; t += cueLength(e) }
  return at
}

/**
 * `fit`이 붙은 곡 조각마다 영상 길이를 곡의 마디 경계에 맞춘다 (`SCORE` 머리말).
 * 끝 큐 바로 앞 조각이 늘거나 준다. 장면은 찍은 길이를 못 넘고 0.5초 밑으로 안 준다. 카드는 그냥 늘린다
 */
function fitEdit(edit) {
  const out = edit.map((e) => ({ ...e, cut: e.cut ? [...e.cut] : undefined }))
  for (const p of SCORE) {
    if (!p.fit || p.until === undefined || p.until === 'end') continue
    const at = cueStarts(out)
    const start = at[p.cue] + (p.at ?? 0)
    const stop = at[p.until] + (p.untilAt ?? 0)
    const end = p.from + (stop - start)
    const target = snapToBar(p.src, end, p.fit)
    const k = out.findIndex((e) => e.cue === p.until) - 1
    const e = out[k]
    if (!e) continue
    const want = cueLength(e) + (target - end)
    let got = want
    if (e.take) {
      const room = takeSeconds(e)
      const most = room === null ? want : room - e.cut[0] - overlap(e)
      got = Math.min(Math.max(0.5, want), most)
      e.cut[1] = got
    } else e.seconds = Math.max(0.5, want)
    console.log(`  맞춤 ${p.src} → ${p.until}: ${e.cue} ${cueLength(edit[k]).toFixed(2)} → ${got.toFixed(2)}초 (곡 끝 ${end.toFixed(2)} → 마디 ${target.toFixed(2)}${got !== want ? ` · 장면 길이가 모자라 ${(want - got).toFixed(2)}초 어긋남` : ''})`)
  }
  return out
}

function mixScore(video, final, cueAt) {
  const total = duration(video)
  const srcs = [...new Set(SCORE.map((p) => p.src))]
  const inputs = srcs.flatMap((s) => ['-i', resolve(MUSIC, `${s}.wav`)])
  const chains = SCORE.map((piece, i) => {
    let p = piece
    if (!(p.cue in cueAt)) throw new Error(`곡 조각 ${String(i)}: 큐 ${p.cue}가 편집에 없다`)
    const start = cueAt[p.cue] + (p.at ?? 0)
    if (p.until !== undefined && p.until !== 'end' && !(p.until in cueAt)) throw new Error(`곡 조각 ${String(i)}: 큐 ${p.until}가 편집에 없다`)
    const stop = p.until === 'end' ? total : p.until !== undefined ? cueAt[p.until] + (p.untilAt ?? 0) : start + p.len
    // 영상 앞으로 넘친 만큼은 곡 안에서 앞당겨 자른다
    const lead = Math.max(0, -start)
    p = { ...p, len: Math.max(0.1, stop - start - lead), from: p.from + lead }
    if (p.snap) {
      const end = snapToBar(p.src, p.from + p.len, p.snap)
      console.log(`  곡 ${p.src} 끝 ${(p.from + p.len).toFixed(2)} → 마디 ${end.toFixed(2)} (${(end - p.from - p.len >= 0 ? '+' : '')}${(end - p.from - p.len).toFixed(2)}초)`)
      p = { ...p, len: Math.max(0.1, end - p.from) }
    }
    const k = srcs.indexOf(p.src) + 1
    const f = [`atrim=start=${p.from.toFixed(3)}:duration=${p.len.toFixed(3)}`, 'asetpts=PTS-STARTPTS', 'aformat=sample_rates=48000:channel_layouts=stereo']
    if (p.fadeIn) f.push(`afade=t=in:d=${p.fadeIn}`)
    if (p.fadeOut) f.push(`afade=t=out:st=${(p.len - p.fadeOut).toFixed(3)}:d=${p.fadeOut}`)
    if (p.gain) f.push(`volume=${p.gain}dB`)
    f.push(`adelay=${Math.round(Math.max(0, start) * 1000)}:all=1`)
    return `[${String(k)}:a]${f.join(',')}[m${String(i)}]`
  })
  const mix = `${SCORE.map((_, i) => `[m${String(i)}]`).join('')}amix=inputs=${String(SCORE.length)}:normalize=0,loudnorm=I=-14:TP=-1.5:LRA=11,aresample=48000,alimiter=limit=0.84,atrim=duration=${total.toFixed(3)}[a]`
  run('ffmpeg', ['-y', '-v', 'error', '-i', video, ...inputs, '-filter_complex', [...chains, mix].join(';'),
    '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '320k', '-movflags', '+faststart', final])
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
    for (const e of fitEdit(EDIT)) {
      const file = resolve(WORK, `${e.cue}.mp4`)
      if (e.take) {
        if (!existsSync(resolve(takeDir(e), 'frames.json'))) { console.log(`  ${e.cue.padEnd(6)} ${e.take} 안 찍었다 — 건너뛴다`); missing++; continue }
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
  const silent = SCORE.length ? resolve(WORK, 'video.mp4') : final
  run('ffmpeg', ['-y', '-v', 'error', ...inputs, '-filter_complex', parts.join(';'), '-map', '[v]', ...enc,
    '-movflags', '+faststart', silent])
  if (SCORE.length) mixScore(silent, final, Object.fromEntries(stamps.map((l) => { const [c, t] = l.split(' '); return [c, Number(t)] })))
  writeFileSync(resolve(WORK, 'stamps.txt'), stamps.join('\n'))
  console.log(`\n  ${final} · ${duration(final).toFixed(2)}초${missing ? ` · 빠진 장면 ${String(missing)}` : ''}`)
}

await main()
