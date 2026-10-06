// 찍어 둔 장면과 글 카드를 트레일러 한 편으로 묶는다 (docs/orders/REELS_20261003.md)
//
//     node tools/reels/assemble.mjs                    .audit/reels/out/radiant-reveal.mp4       (가로 1920×1080)
//     node tools/reels/assemble.mjs --aspect=9:16      .audit/reels/out/radiant-reveal-short.mp4 (세로 1080×1920)
//     node tools/reels/assemble.mjs --cards-only       글 카드만 다시 그린다
//     node tools/reels/assemble.mjs --remix            소리만 다시 섞는다 (지난번 영상 · 큐 시각을 그대로 쓴다)
//
// ① 장면마다 CDP 프레임(시각이 제각각)을 30fps로 고르게 다시 뽑는다 — 프레임마다 머문 시간을 ffconcat에 적고 `fps=30`이 고른다.
// ② 글 카드는 HTML을 크로미움으로 프레임마다 그려 PNG로 받는다(`cards.mjs`) — ffmpeg `drawtext`보다 글꼴 · 빛 번짐이 곱다.
// ③ 차례대로 `xfade`로 잇는다. 조각 길이는 「큐 길이 + 다음과 겹치는 길이」라 큐 시트의 시각이 그대로 맞는다.
// ④ 곡(`SCORE`)을 큐 시각에 맞춰 깔고 마지막에 합친다. 곡은 BDSP 원곡을 풀어 둔 wav다(`.audit/reels/music/`, 깃에 없다).
import { execFileSync, spawnSync } from 'node:child_process'
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
/** `trans: 'cut'`은 하드컷이다 — 겹침 없이 `concat`으로 잇는다 */
const overlap = (e) => (e.trans === 'cut' ? 0 : Math.max(e.fade ?? 0, MIN_FADE))

/**
 * 본편 — 큐 시트 그대로. `take`는 찍은 장면, `card`는 글 카드. `cut`은 [장면 안 시작, 큐 길이](초).
 * `fade`는 다음 조각과 겹치는 길이, `trans`는 그 겹침의 모양(xfade 이름 · 기본 fade · `cut`은 하드컷),
 * `warp`는 화면 뒤틀림(`out` 끝으로 갈수록 · `in` 처음에서 풀림), `sfx`는 이 큐에만 얹는 소리(`TAKE_SFX` 머리말),
 * `caption`은 화면 위에 작게 얹는 글, `snap: false`는 그 컷을 곡의 타격으로 옮기지 않는다.
 *
 * 편집 문법은 BDSP 공개 영상에서 잰 것이다(`.audit/reels/ref-grammar.json`) — 마을 · 배틀 · 여정 · 기술 연타는 **하드컷**이
 * 89~92%이고 컷 하나가 1초 안팎이다(C 평균 1.08초 · D 1.09초 · E 0.92초). 디졸브는 길 부감 → 풀숲(14프레임)과 E 끝 한 번뿐이고,
 * 장의 경계는 흰 빛이 맡는다(문구 → 방은 흰 화면이 0.8초에 걸쳐 가라앉는다). 컷은 `snapCuts`가 곡의 타격에 얹는다
 */
const MAIN = [
  { cue: 'A1', card: 'disclaimer', fade: 0.3 },
  { cue: 'A2-A4', card: 'tunnel' },
  { cue: 'A5', card: 'sink' },
  { cue: 'A6', card: 'tagline' },
  { cue: 'A7', card: 'white', fade: 0.5 },
  // 원본의 방은 크레인 1.5초 뒤 1.35초를 그대로 머문다
  { cue: 'B1', take: 'B1-room', cut: [0.6, 3.1], trans: 'cut' },
  // 떡잎마을 부감은 앞쪽 왼편 위로 맵 밖 흰 허공이 걸린다 — 팬이 오른쪽으로 간 뒤를 쓴다
  { cue: 'B2', take: 'B2-twinleaf', cut: [1.4, 1.5], trans: 'cut' },
  { cue: 'B3', take: 'B3-jubilife', cut: [0.5, 1.6], trans: 'cut' },
  // 길이는 오프닝 곡의 프레이즈가 정한다(`SCORE`의 `fit`) — 원본도 길 부감 → 풀숲만 디졸브다
  { cue: 'B4', take: 'B4-floaroma', cut: [0.25, 1.6], fade: 0.23 },
  // 한 장면으로 잇는다 — 풀숲에 섰다가 달려(1.7초) 조우 컷인(3.73초) · 배틀 무대(4.0초) · 야생 꼬링크(4.23초). 컷인이 큐 3.03초에
  // 와야 오프닝 곡이 마디에서 끝난다 — 더 늦추면 앞 부감 컷이 늘 수 있는 만큼을 넘는다
  { cue: 'B5-B6', take: 'B5-switch', cut: [0.7, 3.23], trans: 'cut', snap: false },
  // 컷인이 검게 닫힌 데서(3.9초) 끊는다 — 그 뒤는 한 장씩 풀숲 · 하늘색이 비치고(3.93 · 3.97초 — 무대가 서기 전) 꼬링크가
  // 나와 가만히 서 있기만 한다(4.2~8.3초). 울음은 볼이 날아오는 다음 컷 머리에 얹는다
  // 같은 장면의 뒤 — 볼이 들어와(8.47초) 열리고(8.9초) 모부기가 내려앉는다(9.6초)
  { cue: 'C1', take: 'B5-switch', cut: [8.3, 1.5], trans: 'cut', sfx: [[8.3, 'PV_403_00_00', -2]] },
  // 흡수가 날아가(5.43초) 맞는다(5.53초)
  { cue: 'C3', take: 'C3-move', cut: [5.1, 0.9], trans: 'cut' },
  // 밤 배틀(C4-night)은 안 쓴다 — 카메라가 멀어 몸통박치기가 몇 픽셀이고 모부기가 돌진하지 않은 채 먼지만 난다
  // 무쇠게이트 굴 무대 — 꼬마돌 가까이(3.33초)에서 웅크리기의 고리가 감싸고(3.77초) 빛 고리가 걷힌 뒤 방어가 오르는 노란 빛(6.1~6.5초)까지
  { cue: 'C5', take: 'C5-cave', cut: [3.5, 3.0], trans: 'cut' },
  // 포획 — 던지고(0.6초) 맞고(0.9초) 빨려 들어(0.93초) 닫혀 떨어진다(2.65초).
  // 흔들림 사이에 볼이 가만히 선 0.5~1.4초씩은 쓰지 않는다 — 흔들림만 잘라 잇는다(둘째 4.33~4.73 · 셋째 5.57~5.9초)
  { cue: 'C6', take: 'C6-catch', cut: [0.5, 2.2], trans: 'cut' },
  { cue: 'C7a', take: 'C6-catch', cut: [4.3, 0.5], trans: 'cut' },
  { cue: 'C7', take: 'C6-catch', cut: [5.5, 0.5], trans: 'cut' },
  // 잡힘(7.37초). 길이는 야생 배틀 곡의 프레이즈가 정한다(`fit`)
  { cue: 'C8', take: 'C6-catch', cut: [7.2, 1.0], trans: 'cut' },
  { cue: 'D1', take: 'D1-lake', cut: [0.4, 1.2], trans: 'cut' },
  { cue: 'D2', take: 'D2-windworks', cut: [0.5, 1.0], trans: 'cut' },
  { cue: 'D4', take: 'D4-snow', cut: [0.5, 1.0], trans: 'cut' },
  { cue: 'D5', take: 'D5-first', cut: [0.4, 1.8], trans: 'cut' }, // 0.9초에 V
  { cue: 'D6', take: 'D6-night', cut: [0.3, 1.3], trans: 'cut' },
  { cue: 'D7', take: 'D7-forest', cut: [0.3, 1.0], trans: 'cut' },
  // 길이는 오프닝 곡의 프레이즈가 정한다(`fit`) — 챔피언의 방으로 넘어간다
  { cue: 'D8', take: 'D8-city', cut: [0.35, 1.8], trans: 'cut' },
  // 난천 앞 VS 컷인(9.83초) → 띠가 빠진다(10.93초). 챔피언 배틀 곡은 컷인에 들어온다
  { cue: 'D11', take: 'D11-champion', cut: [9.67, 1.28], trans: 'cut' },
  // 같은 장면의 뒤 — 볼이 열리고(12.7초) 화강돌이 솟아 화면을 채운다(14.87초). VS 띠가 빠진 뒤의 검은 한 장 · 빈 무대(10.97~11.2초)와
  // 볼이 열리기 전 빈 무대(12.3~12.45초)는 안 쓴다 — 아무것도 안 움직이는 틈이 컷마다 붙어 툭툭 끊겨 보였다
  { cue: 'D11b', take: 'D11-champion', cut: [12.45, 2.45], trans: 'cut' },
  // 루카리오가 기를 모으다(1.47초~) 쏘고(2.3초) 맞는다(3.3초). 챔피언 곡 4마디에 D11~D13이 다 들어가도록 모으는 중간에서 연다
  { cue: 'D12', take: 'D12-lucario', cut: [2.0, 1.6], trans: 'cut' },
  // 드래곤다이브(`ew407` · 시퀀스 머리 0.87초) — 하얗게 빛나며 뛰어올라(1~37프레임) 하늘에서 내리꽂히고(40~74 · 특수 배경)
  // 맞는다(77프레임 · 3.43초). 내려앉아(86~110) 기본 카메라로 돌아오는 4.25초까지 한 컷이다. 길이는 챔피언 곡의 프레이즈가 정한다(`fit`)
  { cue: 'D13', take: 'D13-garchomp', cut: [0.85, 3.4], trans: 'cut' },
  { cue: 'E2', take: 'E2-spear', cut: [0.6, 2.1], warp: 'out', fade: 0.4 },
  // 깨어진 세계 — 1인칭으로 판 위를 걷다 V(2.0초)로 3인칭 내려다보기, 발판을 따라 더 걷는다
  { cue: 'E3a', take: 'E3-distortion', cut: [0.3, 4.0], warp: 'in', trans: 'cut' },
  // 벽으로 뛰어오르면 몸과 카메라가 90° 돈다
  { cue: 'E3w', take: 'E3-wall', cut: [0.4, 1.5], trans: 'cut' },
  // B4F 숲 — 3인칭으로 나무 사이를 걷는다
  { cue: 'E3c', take: 'E3-b4f', cut: [2.3, 2.0], trans: 'cut' },
  // 기라티나가 서 있다 → 다가가 A(2.93초) → 울음 · 흰 섬광(3.0초) → 소용돌이 → 화이트아웃(4.27~4.3초)
  { cue: 'E3b', take: 'E3-giratina', cut: [1.3, 3.03], trans: 'cut', snap: false },
  // 배틀 무대는 넣지 않는다(사용자 · 2026-10-06) — 조우 소용돌이가 화이트아웃으로 하얘지는 데서 흰 화면을 지나 로고로 간다.
  // 4.33초 뒤는 배틀 무대가 서는 동안이다(검은 화면 · 빈 바닥)
  { cue: 'E4', card: 'white', seconds: 0.5, fade: 0.3 },
  { cue: 'F1', card: 'wordmark', fade: 0.2 },
  { cue: 'F2', card: 'rom', fade: 0.2 },
  { cue: 'F3', card: 'promo' },
]

/**
 * 쇼츠 — 세로로 다시 찍은 장면을 쓴다(문서 「쇼츠 · 릴스」). 본편 3초 자리처럼 연다 — 고지 글이 사그라진 검은 화면에 빛점이
 * 떠올라(`disclaimer` 카드의 2.6초부터) 빛 터널로 터진다. 팬 게임 고지는 터널 위에 작게 얹는다(`caption`)
 */
const SHORTS = [
  { cue: 'A1', card: 'disclaimer', from: 2.6, fade: 0.3 },
  // 터널 · 문구의 길이는 오프닝 곡이 정한다(`SCORE` 9:16) — 피리에서 큰 박까지 15.64초를 끊지 않고 흘린다. 빛점 0.4초를 더해
  // B1이 16.04초에 선다
  { cue: 'A2-A4', card: 'tunnel', seconds: 8.143, caption: '본 게임은 팬 게임이며, 수익을 창출하지 않습니다.' },
  // 흰 화면이 1초 넘게 서지 않게 섬광(`cards.mjs`의 `FL`)과 가라앉기를 줄이고, 줄인 만큼 문구에 준다
  { cue: 'A5', card: 'sink', seconds: 0.367 },
  // 3.6초면 첫 줄이 또렷해지기 전에 다음 줄이 온다
  { cue: 'A6', card: 'tagline', seconds: 6.833 },
  { cue: 'A7', card: 'white', fade: 0.5 },
  { cue: 'B1', take: 'B1-room', cut: [0.3, 1.7], trans: 'cut' },
  // 오프닝 곡은 큰 박에서 두 마디(6.2초) 뒤에 배틀 곡으로 넘긴다 — 방 · 떡잎마을 두 컷이 그 마디를 채운다(`fit`)
  { cue: 'B2', take: 'B2-twinleaf', cut: [0.8, 1.5], trans: 'cut' },
  { cue: 'B5-B6', take: 'B5-switch', cut: [0.7, 3.23], trans: 'cut', snap: false },
  // 컷인이 검게 닫힌 데서(3.9초) 끊는다 — 그 뒤는 한 장씩 풀숲 · 하늘색이 비치고(3.93 · 3.97초 — 무대가 서기 전) 꼬링크가
  // 나와 가만히 서 있기만 한다(4.2~8.3초). 울음은 볼이 날아오는 다음 컷 머리에 얹는다
  { cue: 'C1', take: 'B5-switch', cut: [8.3, 1.5], trans: 'cut', sfx: [[8.3, 'PV_399_00_00', -2]] },
  // 세로판은 흡수가 맞는 자리가 다르다(1.5초 — 찍을 때마다 배틀의 차례가 달라진다)
  { cue: 'C3', take: 'C3-move', cut: [1.0, 1.1], trans: 'cut' },
  // 동굴 무대 웅크리기 — 가로판의 꼬마돌 자리(가로 48%)를 잘라 쓴다. 이 컷이 없으면 야생 배틀 곡의 마디까지 볼 흔들림 컷이
  // 늘어나 볼이 1.3~1.5초씩 가만히 섰다
  { cue: 'C5', take: 'C5-cave', cut: [3.5, 3.0], crop: 0.48, trans: 'cut' },
  { cue: 'C6', take: 'C6-catch', cut: [0.5, 2.2], trans: 'cut' },
  { cue: 'C7a', take: 'C6-catch', cut: [4.3, 0.5], trans: 'cut' },
  { cue: 'C7', take: 'C6-catch', cut: [5.5, 0.5], trans: 'cut' },
  // 길이는 야생 배틀 곡의 프레이즈가 정한다(`fit`)
  { cue: 'C8', take: 'C6-catch', cut: [7.2, 1.0], trans: 'cut' },
  // 지역이 바뀌는 1인칭 셋은 오프닝 곡 두 마디(6.2초)에 지나간다 — 한 마디에 몰았더니 너무 빨랐다
  { cue: 'D5', take: 'D5-first', cut: [0.4, 2.0], trans: 'cut' },
  { cue: 'D6', take: 'D6-night', cut: [0.3, 1.7], trans: 'cut' },
  // 길이는 오프닝 곡의 마디가 정한다(`fit`)
  { cue: 'D8', take: 'D8-city', cut: [0.35, 2.5], trans: 'cut' },
  { cue: 'D11', take: 'D11-champion', cut: [9.67, 1.28], trans: 'cut' },
  // 세로 카메라는 볼이 늦게 열리고 화강돌이 오른쪽 아래 모서리에 선다 — 가로판에서 화강돌 자리(가로 55%)를 잘라 쓴다
  { cue: 'D11b', take: 'D11-champion', cut: [12.45, 2.45], crop: 0.55, trans: 'cut' },
  { cue: 'D12', take: 'D12-lucario', cut: [2.0, 1.6], crop: 0.5, trans: 'cut' },
  // 길이는 챔피언 곡의 프레이즈가 정한다(`fit`)
  { cue: 'D13', take: 'D13-garchomp', cut: [0.85, 3.4], crop: 0.5, trans: 'cut' },
  { cue: 'E2', take: 'E2-spear', cut: [0.6, 1.3], warp: 'out', fade: 0.4 },
  { cue: 'E3a', take: 'E3-distortion', cut: [1.9, 2.0], warp: 'in', trans: 'cut' },
  { cue: 'E3w', take: 'E3-wall', cut: [0.4, 1.2], crop: 0.45, trans: 'cut' },
  { cue: 'E3b', take: 'E3-giratina', cut: [2.1, 2.23], trans: 'cut', snap: false },
  { cue: 'E4', card: 'white', seconds: 0.3, fade: 0.3 },
  { cue: 'F1', card: 'wordmark', seconds: 2.2, fade: 0.2 },
  { cue: 'F2', card: 'outro', seconds: 3.2 },
]

const EDIT = SHORT ? SHORTS : MAIN

/**
 * 장면마다 잰 소리 자리 — [장면 안 초, 효과음, `rel`(`sfxChains`), 소리 안 시작(초 · 없으면 0), 길이(초 · 끝 0.4초에 걸쳐 뺀다)]. 시각은 찍은 프레임에서 잰 것이다
 * (`.audit/reels/sfx-cues-2.json`). ⚠️ **기술 소리는 머리가 아니라 가장 센 자리를 화면의 타격에 맞춘다** — 파동탄 · 드래곤다이브는
 * 1.3~2.7초에 걸쳐 차오른 뒤 터진다(봉우리: EW396_EM 2.26초 · EW407_2D 2.68초). 머리를 기 모으기에 두니 터지는 소리가 맞은 뒤의
 * 다음 컷에서 났다. 컷 안에서 앞을 다 못 깔면 넷째 값만큼 소리 안에서 앞을 잘라 연다
 * `<장면>@9:16`이 있으면 세로판은 그것을 쓴다. BDSP 공개 영상은 울음을 곡 아래 낮게 깐다 — 소리는 곡을 넘지 않는다
 */
const TAKE_SFX = {
  'B5-switch': [[3.73, 'UI_COMMON_PM_ENCOUNT_GRASS', -4], [4.23, 'PV_403_00_00', -2], [8.47, 'BA_SYS_BALL_THROW_NORMAL', -6],
    [8.9, 'BA_SYS_BALL_OPEN', -3], [9.23, 'PV_387_00_00', -2]],
  // 세로판은 야생이 비버니다(찍을 때마다 풀숲의 조우가 다르다)
  'B5-switch@9:16': [[3.73, 'UI_COMMON_PM_ENCOUNT_GRASS', -4], [4.2, 'PV_399_00_00', -2], [8.43, 'BA_SYS_BALL_THROW_NORMAL', -6],
    [8.9, 'BA_SYS_BALL_OPEN', -3], [9.1, 'PV_387_00_00', -2]],
  'C3-move': [[5.53, 'EW071_01', -2]],
  'C3-move@9:16': [[1.5, 'EW071_01', -2]],
  'C4-night': [[1.47, 'EW033_01', -4], [1.77, 'BA_SYS_HIT_NOMAL', -3]],
  // 웅크리기(기술 111)
  'C5-cave': [[3.77, 'EW111', -4]],
  'C6-catch': [[0.6, 'BA_SYS_BALL_THROW_NORMAL', -6], [0.9, 'BA_SYS_BALL_HIT', -5], [0.93, 'BA_SYS_ABSORPTION', -4],
    [1.53, 'BA_SYS_BALL_CLOSE', -4], [2.03, 'BA_SYS_BALL_DROP', -6], [2.3, 'BA_SYS_BALL_DROP', -9], [2.5, 'BA_SYS_BALL_DROP', -12],
    [3.03, 'BA_SYS_BALL_SPIN', -5], [4.33, 'BA_SYS_BALL_SPIN', -5], [5.6, 'BA_SYS_BALL_SPIN', -5], [7.37, 'BA_SYS_POKE_BALL', -2]],
  // 화강돌의 울음(1.75초 · 처음부터 고르다)은 돌에서 영이 피어오를 때(13.77초) 운다 — 다 솟은 뒤(14.87초)에 두니 컷이 14.9초에 끝나
  // 울음이 통째로 다음 루카리오 컷에 깔렸다
  'D11-champion': [[9.83, 'UI_COMMON_PM_ENCOUNT_YARI_a', -4], [12.7, 'BA_SYS_BALL_OPEN', -3], [13.77, 'PV_442_00_00', -1]],
  // 난천의 루카리오 — 파동탄(기술 396). 봉우리(소리 안 2.26초)가 맞는 자리(3.3초)에 온다
  'D12-lucario': [[2.0, 'EW396_EM', -3, 0.96], [3.3, 'BA_SYS_HIT_H', -2]],
  // 드래곤다이브(기술 407) — 봉우리(소리 안 2.68초)가 부딪는 자리(1.73초)에 온다. 땅 터짐은 지진(기술 89) — 3.6초 내내 고른 땅울림이라
  // 다 울리면 다음 창기둥 장면까지 2.7초를 덮는다. 컷이 넘어간 뒤 0.4초에 걸쳐 뺀다
  'D13-garchomp': [[0.97, 'EW407_2D', -3], [3.5, 'BA_SYS_HIT_H', -2]],
  // 오리진폼의 울음 — 이 영상의 주인공이라 다른 소리보다 앞에 둔다
  'E3-giratina': [[3.0, 'PV_487_01_00', 3], [3.3, 'UI_COMMON_PM_BATTLEIN_FX', -4]],
}

/**
 * 곡 — 큐에 붙인다. `at`은 그 큐가 시작하는 시각에서 몇 초 뒤인가, `from`은 곡 안 시작(초), `len`은 까는 길이(초).
 * `len` 대신 `until`(큐)과 `untilAt`(초)을 주면 그 시각까지 깐다. 끝까지면 `until: 'end'`.
 * `snap`(마디 수 — 1 · 4 · 8)을 주면 끝을 곡 안의 그 마디 경계로 맞춘다(가장 가까운 것). 마디표는 `music/bars/<곡>.json`
 * (BA008은 Wwise 박자표, 나머지는 소리에서 잰 것 — 곡을 꺼낸 작업의 실측). 맞춘 만큼 다음 조각이 이어 받는다.
 * `fit`(마디 수)은 반대로 **영상을 곡에 맞춘다** — `until` 큐 바로 앞 조각의 길이를 늘리거나 줄여, 곡이 그 마디 경계에서
 * 끝나는 순간에 컷이 오게 한다(`fitEdit`). 곡이 프레이즈 한가운데서 끊기지 않는다. 늘릴 수 있는 만큼은 찍은 장면 길이가 정한다
 * `fadeIn` · `fadeOut`은 그 조각의 앞뒤 페이드, `gain`은 dB, `tail`은 다음 곡과 겹쳐 더 흐르는 길이(초 · 기본 `XFADE.tail`).
 * 기라티나 곡 → 로고는 겹치지 않는다 — 원본도 로고 스팅어 앞에서 곡을 비운다(81.5~83.9초). 조각끼리 겹치면 섞인다. 비어 있으면 소리 없이 낸다
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
    // 배틀 곡은 첫 박이 「배틀이다」의 한 방이다(곡 머리 50ms가 바로 -6~-13dB) — 겹치지 않고, 앞 곡은 프레이즈 끝에서 빠르게 뺀다
    { src: 'B_OTH001', cue: 'B1', at: -21.5, from: 0, until: 'B5-B6', untilAt: 3.03, fit: 4, fadeOut: 0.25 },
    // 배틀 → 여정은 곡 한가운데(33.94초 · 마디 첫 박)로 들어간다 — 겹쳐 넘긴다
    { src: 'BA001', cue: 'B5-B6', at: 3.03, from: 0, until: 'D1', fit: 4, tail: 0.7 },
    { src: 'B_OTH001', cue: 'D1', from: 33.94, until: 'D11', untilAt: 0.16, fit: 4, fadeIn: 0.4, fadeOut: 0.25 },
    // 챔피언 → 기라티나는 창기둥이 뒤틀리며 녹는 자리 — 화면의 디졸브와 같이 겹친다
    { src: 'BA008', cue: 'D11', at: 0.16, from: 0, until: 'E2', fit: 4, tail: 0.8 },
    // 기라티나 컷은 화이트아웃에서 끝나야 해서 길이를 못 바꾼다 — 마디는 흰 화면의 길이로 맞춘다
    { src: 'BA015', cue: 'E2', from: 0, until: 'F1', fit: 1, fadeIn: 0.5, fadeOut: 0.4 },
    // 타이틀 곡 파일은 머리 0.45초가 무음이다 — 그 뒤부터 깔고 로고보다 조금 앞서 들어온다. 원본은 곡을 0.2초 비우고 스팅어를 넣는다
    { src: 'B_OTH002', cue: 'F1', at: -0.15, from: 0.45, until: 'end', fadeOut: 1.5 },
  ],
  '9:16': [
    // 오프닝 곡은 빛점이 터널로 터지는 순간 피리(5.857초)로 연다 — 본편이 플래티넘을 얹는 그 소리다. 큰 박(21.5초)까지 끊지
    // 않는다 — 마디를 건너 이었더니 다들 아는 곡이라 어색했다(사용자 · 2026-10-07). 큰 박에 B1이 선다
    { src: 'B_OTH001', cue: 'A2-A4', at: -0.057, from: 5.8, until: 'B5-B6', untilAt: 3.03, fit: 1, fadeIn: 0.05, fadeOut: 0.25 },
    { src: 'BA001', cue: 'B5-B6', at: 3.03, from: 0, until: 'D5', fit: 4, tail: 0.7 },
    { src: 'B_OTH001', cue: 'D5', from: 33.94, until: 'D11', untilAt: 0.16, fit: 1, fadeIn: 0.4, fadeOut: 0.25 },
    { src: 'BA008', cue: 'D11', at: 0.16, from: 0, until: 'E2', fit: 4, tail: 0.8 },
    // 기라티나 컷은 화이트아웃에서 끝나야 해서 길이를 못 바꾸고, 세로판은 가장 가까운 마디가 흰 화면보다 0.6초 앞이다 —
    // 마디에 안 맞추고 흰 화면 위에서 0.4초에 뺀다
    { src: 'BA015', cue: 'E2', from: 0, until: 'F1', fadeIn: 0.5, fadeOut: 0.4 },
    // 타이틀 곡 파일은 머리 0.45초가 무음이다 — 그 뒤부터 깔고 로고보다 조금 앞서 들어온다. 원본은 곡을 0.2초 비우고 스팅어를 넣는다
    { src: 'B_OTH002', cue: 'F1', at: -0.15, from: 0.45, until: 'end', fadeOut: 1.5 },
  ],
}[ASPECT] ?? []
const MUSIC = resolve(ROOT, '.audit/reels/music')
/** 효과음은 BDSP 원본이다(Wwise 이벤트 → wem, `.audit/reels/sfx/` · `index.json`, 깃에 없다) */
const SFX = resolve(ROOT, '.audit/reels/sfx')
/**
 * 곡이 바뀌는 자리의 기본 — 겹치지 않고(`tail` 0) 뒤 곡은 딸깍 소리만 막는다(10ms). 겹쳐 넘길 자리는 `SCORE`가 `tail` · `fadeIn`을 적는다.
 * 넘기는 페이드는 등전력(사인 4분의 1) 곡선이다 — 직선으로 겹치면 겹치는 가운데에서 소리가 3dB 꺼진다
 */
const XFADE = { tail: 0, in: 0.01 }
/** 컷을 얹을 온셋 — 세기(0~1) 이상만, 컷에서 이만큼(초) 안의 것만 */
const SNAP = { strength: 0.5, reach: 0.2 }
/** `fitEdit`이 나눠 늘릴 때 한 컷의 최장(초) */
const SHOT_MOST = 2.2
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

/** 화면 위에 작은 글 한 줄 — 0.3초에 걸쳐 떠오르고 조각 끝 0.4초에 걸쳐 진다. 글은 파일로 넘긴다(쉼표가 필터 구분자와 겹친다) */
function captionFilter(e, len) {
  const file = resolve(WORK, `${e.cue}.caption.txt`)
  writeFileSync(file, e.caption)
  const esc = (p) => p.replace(/\\/g, '/').replace(/:/g, '\\:')
  return `drawtext=fontfile='${esc('C:/Windows/Fonts/malgun.ttf')}':textfile='${esc(file)}':fontsize=${String(Math.round(Math.min(W, H) * 0.03))}:fontcolor=white:alpha='min(1\\,t/0.3)*min(1\\,(${len.toFixed(3)}-t)/0.4)*0.8':shadowcolor=black@0.6:shadowx=2:shadowy=2:x=(w-tw)/2:y=h*0.07`
}

/** 장면 하나 → 30fps mp4 (길이 = 큐 길이 + 겹침) */
function takeClip(e, file) {
  const dir = takeDir(e)
  const { frames } = JSON.parse(readFileSync(resolve(dir, 'frames.json'), 'utf8'))
  if (frames.length < 2) throw new Error(`${e.take}: 프레임이 ${String(frames.length)}장`)
  // ⚠️ **사진 이어 붙이기(concat)로 읽지 않는다.** concat 분리기는 사진의 시각을 1/25초 단위로 깎아서, 30fps로 내보내면
  // 다섯 장마다 한 장이 복제됐다 — 모든 게임 장면이 0.2초마다 한 번씩 멈칫했다(2026-10-06 실측 · 원본 장면에는 복제가 없다).
  // 가상 시계가 장을 정확히 1/30초 간격으로 찍으므로 번호 붙은 사진 묶음을 30fps로 바로 읽는다
  const [from, cue] = e.cut
  const len = cue + overlap(e)
  const step = frames.slice(1).map((f, i) => f.t - frames[i].t)
  if (step.some((d) => Math.abs(d - 1 / FPS) > 1e-4)) throw new Error(`${e.take}: 장 간격이 1/${String(FPS)}초가 아니다`)
  const first = Math.round(from * FPS)
  const pattern = /^(.*?)(\d+)(\.\w+)$/.exec(frames[first]?.name ?? '')
  if (!pattern) throw new Error(`${e.take}: ${String(from)}초 장이 없다`)
  const input = resolve(dir, `${pattern[1]}%0${String(pattern[2].length)}d${pattern[3]}`).replace(/\\/g, '/')
  const n = Math.min(Math.round(len * FPS), frames.length - first)
  const vf = []
  if (e.crop !== undefined) {
    const cw = Math.round((1080 * 9) / 16)
    const x = Math.round(Math.min(1920 - cw, Math.max(0, e.crop * 1920 - cw / 2)))
    vf.push(`crop=${String(cw)}:1080:${String(x)}:0`)
  }
  vf.push(`scale=${W}:${H}:flags=lanczos`)
  if (e.warp) vf.push(...warpFilter(e.warp, len))
  if (e.caption) vf.push(captionFilter(e, len))
  vf.push('format=yuv420p')
  run('ffmpeg', ['-y', '-v', 'error', '-framerate', String(FPS), '-start_number', String(Number(pattern[2])), '-i', input,
    '-frames:v', String(n), '-vf', vf.join(','), ...enc, file])
}

/** 카드 → mp4. 프레임마다 `draw(t)`를 부르고 찍는다 */
async function cardClip(page, e, file) {
  const cue = cueLength(e)
  const len = cue + overlap(e)
  const n = Math.round(len * FPS)
  const dir = resolve(WORK, `card-${e.cue}`)
  mkdirSync(dir, { recursive: true })
  await page.setContent(cardPage(e.card, W, H, { short: SHORT }), { waitUntil: 'networkidle' })
  await page.evaluate(() => document.fonts.ready)
  // 카드 안의 시각은 큐 길이 기준이다 — 겹치는 꼬리는 마지막 모습을 이어 간다
  const scale = e.seconds && CARD_SECONDS[e.card] ? CARD_SECONDS[e.card] / e.seconds : 1
  for (let i = 0; i < n; i++) {
    // `from`이면 카드의 그 시각부터 그린다
    const t = (e.from ?? 0) + Math.min(i / FPS, cue - 1e-3) * (e.card === 'tunnel' ? 1 : scale)
    await page.evaluate((x) => new Promise((done) => { window.draw(x); requestAnimationFrame(() => { requestAnimationFrame(done) }) }), t)
    writeFileSync(resolve(dir, `c-${String(i).padStart(4, '0')}.png`), await page.screenshot())
  }
  // 장 수를 못 박는다 — 폴더에 지난번(더 긴) 카드의 장이 남아 있으면 그것까지 읽었다(쇼츠 터널이 5초 대신 8.4초)
  run('ffmpeg', ['-y', '-v', 'error', '-framerate', String(FPS), '-i', resolve(dir, 'c-%04d.png'), '-frames:v', String(n), ...(e.caption ? ['-vf', `${captionFilter(e, len)},format=yuv420p`] : []), ...enc, file])
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
  let best = null
  for (const g of grid ?? []) if (best === null || Math.abs(g - t) < Math.abs(best - t)) best = g
  return best ?? t
}

/** 찍은 장면의 길이(초) — 마지막 프레임의 시각 */
function takeSeconds(e) {
  const file = resolve(takeDir(e), 'frames.json')
  if (!existsSync(file)) return null
  const { frames } = JSON.parse(readFileSync(file, 'utf8'))
  return frames.at(-1).t - frames[0].t
}

/**
 * 이 조각에서 울릴 효과음 — 조각 안 시각 `at`. 장면의 `TAKE_SFX`는 이 조각이 보여 주는 구간 안의 것만, 큐의 `sfx`는 늘 넣는다
 * (컷보다 앞서 들어오는 소리 — 장면 시각이 컷 앞이면 `at`이 음수가 되어 앞 조각 위에서 울린다)
 */
function sfxOf(e) {
  const len = cueLength(e)
  const own = (TAKE_SFX[`${e.take}@${ASPECT}`] ?? TAKE_SFX[e.take] ?? []).map(([t, name, rel, from = 0, len]) => ({ at: t - e.cut[0], name, rel, from, len })).filter((h) => h.at >= 0 && h.at < len)
  return [...own, ...(e.sfx ?? []).map(([t, name, rel]) => ({ at: e.take ? t - e.cut[0] : t, name, rel }))]
}

/**
 * 파일의 세기(dB) — `peak`면 가장 센 50ms 창의 RMS(짧은 효과음), 아니면 전체 RMS(곡).
 * ⚠️ 통합 음량(LUFS)은 0.4초 창으로 거르므로 짧은 효과음에서 터무니없이 낮게 나와(볼 닫힘이 크게 키워져 전 대역을 때리고
 * 그 뒤로 곡이 몇 초 꺼졌다) 효과음에는 쓰지 않는다
 */
const levels = new Map()
function level(file, peak) {
  const key = `${file}|${String(peak)}`
  if (!levels.has(key)) {
    const err = spawnSync('ffmpeg', ['-nostats', '-i', file, '-af', 'astats=length=0.05:measure_perchannel=none', '-f', 'null', '-'], { encoding: 'utf8' }).stderr
    const m = err.match(peak ? /RMS peak dB: (-?[\d.]+)/ : /RMS level dB: (-?[\d.]+)/)
    if (!m) throw new Error(`${file}: 세기를 못 쟀다`)
    levels.set(key, Number(m[1]))
  }
  return levels.get(key)
}

/** 파일의 통합 음량(LUFS, EBU R128) — 섞은 소리 전체를 맞출 때 */
function lufs(file) {
  const err = spawnSync('ffmpeg', ['-nostats', '-i', file, '-af', 'ebur128', '-f', 'null', '-'], { encoding: 'utf8' }).stderr
  const m = [...err.matchAll(/I:\s+(-?[\d.]+) LUFS/g)].at(-1)
  if (!m) throw new Error(`${file}: 음량을 못 쟀다`)
  return Number(m[1])
}

/** 조각의 큐 길이(초) */
const cueLength = (e) => (e.take ? e.cut[1] : e.seconds ?? CARD_SECONDS[e.card] - (e.from ?? 0))

/** 큐가 시작하는 시각 — 앞 조각들의 큐 길이를 더한 것이다(겹침은 다음 조각 안으로 들어간다) */
function cueStarts(edit) {
  const at = {}
  let t = 0
  for (const e of edit) { at[e.cue] = t; t += cueLength(e) }
  return at
}

/**
 * 하드컷을 곡의 타격에 얹는다 — BDSP 공개 영상의 컷은 박자 격자가 아니라 그 자리의 온셋에 선다(하드컷 38개 중 84%가
 * ±100ms 안 · 몽타주는 94% · 중앙 +17ms, `.audit/reels/ref-grammar.json`). 컷마다 그 시각에 깔린 곡 안에서 가장 가까운 센
 * 온셋(`music/bars/<곡>.json`의 `onsets`, 스펙트럴 플럭스)을 찾아 앞 조각 길이를 그만큼 늘이거나 줄인다. 곡 조각이 끝나는
 * 컷(`until`)은 `fitEdit`이 마디에 맞추므로 건드리지 않는다
 */
function snapCuts(edit) {
  const out = edit.map((e) => ({ ...e, cut: e.cut ? [...e.cut] : undefined }))
  const ends = new Set(SCORE.map((p) => p.until))
  const onsets = {}
  const strong = (src) => {
    if (!(src in onsets)) {
      const file = resolve(MUSIC, 'bars', `${src}.json`)
      onsets[src] = existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')).onsets ?? []).filter(([, w]) => w >= SNAP.strength).map(([t]) => t) : []
    }
    return onsets[src]
  }
  for (let k = 0; k < out.length - 1; k++) {
    const e = out[k]
    if (e.trans !== 'cut' || !e.take || e.snap === false || ends.has(out[k + 1].cue)) continue
    const at = cueStarts(out)
    const T = at[out[k + 1].cue]
    const piece = SCORE.find((p) => {
      const start = at[p.cue] + (p.at ?? 0)
      const stop = p.until === 'end' || p.until === undefined ? Infinity : at[p.until] + (p.untilAt ?? 0)
      return T > start && T < stop
    })
    if (!piece) continue
    const song = piece.from + T - (at[piece.cue] + (piece.at ?? 0))
    let best = null
    for (const o of strong(piece.src)) if (Math.abs(o - song) <= SNAP.reach && (best === null || Math.abs(o - song) < Math.abs(best - song))) best = o
    if (best === null) continue
    const room = takeSeconds(e)
    const want = e.cut[1] + (best - song)
    const got = Math.max(0.4, room === null ? want : Math.min(want, room - e.cut[0]))
    e.cut[1] = got
    console.log(`  얹음 ${e.cue} → ${out[k + 1].cue}: ${(best - song >= 0 ? '+' : '')}${((best - song) * 1000).toFixed(0)}ms (${piece.src} ${best.toFixed(2)}초)${got !== want ? ' · 장면이 모자라 못 다 옮김' : ''}`)
  }
  return out
}

/**
 * `fit`이 붙은 곡 조각마다 영상 길이를 곡의 마디 경계에 맞춘다 (`SCORE` 머리말).
 * 끝 큐 바로 앞 조각이 늘거나 준다. 장면은 찍은 길이를 못 넘고 0.5초 밑으로 안 준다. 카드는 그냥 늘린다.
 * `spread`면 그 조각으로 모자란 만큼을 곡 조각 안의 앞 장면들이 뒤에서부터 나눠 늘린다 — 한 컷은 `SHOT_MOST`초까지
 * (BDSP 공개 영상의 몽타주 최장 컷 2.14초)
 */
function fitEdit(edit, spread = false) {
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
      let short = want - got
      for (let j = k - 1; spread && short > 0.01 && j > out.findIndex((x) => x.cue === p.cue) - 1; j--) {
        const f = out[j]
        if (!f.take) continue
        const fr = takeSeconds(f)
        const add = Math.max(0, Math.min(short, SHOT_MOST - f.cut[1], fr === null ? short : fr - f.cut[0] - overlap(f) - f.cut[1]))
        f.cut[1] += add
        short -= add
        got += add
        if (add > 0) console.log(`  나눔 ${f.cue} +${add.toFixed(2)}초`)
      }
    } else e.seconds = Math.max(0.5, want)
    console.log(`  맞춤 ${p.src} → ${p.until}: ${e.cue} ${cueLength(edit[k]).toFixed(2)} → ${got.toFixed(2)}초 (곡 끝 ${end.toFixed(2)} → 마디 ${target.toFixed(2)}${got !== want ? ` · 장면 길이가 모자라 ${(want - got).toFixed(2)}초 어긋남` : ''})`)
  }
  return out
}

/**
 * 효과음 — 영상 시각(초) · 파일 이름(`.audit/reels/sfx/<이름>.wav`) · `rel`(효과음의 가장 센 50ms가 곡의 평균 세기보다 몇 dB
 * 위아래인지 — 파일마다 재서 맞춘다, `level`). 곡을 누르지 않고 그 아래에 깐다 — BDSP 공개 영상은
 * 울음소리(49.55초 꼬링크 · 60.28초 찌르꼬)가 울리는 동안에도 곡 RMS가 ±1.5dB 안이다(`.audit/reels/ref-grammar.json`)
 */
function sfxChains(hits, first) {
  const srcs = [...new Set(SCORE.map((p) => p.src))]
  const music = srcs.reduce((a, s) => a + level(resolve(MUSIC, `${s}.wav`), false), 0) / srcs.length
  hits = hits.map((h) => ({ ...h, gain: music + h.rel - level(resolve(SFX, `${h.name}.wav`), true) }))
  const inputs = hits.flatMap((h) => ['-i', resolve(SFX, `${h.name}.wav`)])
  const chains = hits.map((h, i) => `[${String(first + i)}:a]aformat=sample_rates=48000:channel_layouts=stereo,${h.from ? `atrim=start=${String(h.from)},asetpts=PTS-STARTPTS,afade=t=in:d=0.03,` : ''}${h.len ? `atrim=end=${String(h.len)},afade=t=out:st=${String(h.len - 0.4)}:d=0.4,` : ''}volume=${String(h.gain ?? 0)}dB,adelay=${String(Math.round(h.t * 1000))}:all=1[s${String(i)}]`)
  return { inputs, chains }
}

function mixScore(video, final, cueAt, hits = []) {
  const total = duration(video)
  const srcs = [...new Set(SCORE.map((p) => p.src))]
  const inputs = srcs.flatMap((s) => ['-i', resolve(MUSIC, `${s}.wav`)])
  const chains = SCORE.map((piece, i) => {
    let p = piece
    if (!(p.cue in cueAt)) throw new Error(`곡 조각 ${String(i)}: 큐 ${p.cue}가 편집에 없다`)
    // `notBefore` 큐 앞으로는 깔지 않는다 — 그만큼 곡 안에서 앞을 자른다
    const start = Math.max(cueAt[p.cue] + (p.at ?? 0), p.notBefore ? cueAt[p.notBefore] : -Infinity)
    if (p.notBefore) p = { ...p, from: p.from + start - (cueAt[p.cue] + (p.at ?? 0)) }
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
    // 곡끼리 겹쳐 넘긴다 — 앞 곡은 넘어가는 자리에서 `tail`초 더 흐르며 빠지고, 뒤 곡은 `XFADE.in`초에 걸쳐 들어온다.
    // 딱 잘라 바꾸니 곡이 바뀌는 자리마다 소리가 툭 끊겼다
    const tail = p.until === 'end' ? 0 : p.tail ?? XFADE.tail
    if (tail > 0) p = { ...p, len: p.len + tail, fadeOut: tail + (p.fadeOut ?? 0) }
    if (i > 0 && p.fadeIn === undefined) p = { ...p, fadeIn: XFADE.in }
    const k = srcs.indexOf(p.src) + 1
    const f = [`atrim=start=${p.from.toFixed(3)}:duration=${p.len.toFixed(3)}`, 'asetpts=PTS-STARTPTS', 'aformat=sample_rates=48000:channel_layouts=stereo']
    if (p.fadeIn) f.push(`afade=t=in:d=${p.fadeIn}:curve=qsin`)
    if (p.fadeOut) f.push(`afade=t=out:st=${(p.len - p.fadeOut).toFixed(3)}:d=${p.fadeOut}:curve=qsin`)
    if (p.gain) f.push(`volume=${p.gain}dB`)
    f.push(`adelay=${Math.round(Math.max(0, start) * 1000)}:all=1`)
    return `[${String(k)}:a]${f.join(',')}[m${String(i)}]`
  })
  const music = `${SCORE.map((_, i) => `[m${String(i)}]`).join('')}amix=inputs=${String(SCORE.length)}:normalize=0`
  const master = `aresample=48000,atrim=duration=${total.toFixed(3)}[a]`
  const fx = sfxChains(hits, 1 + srcs.length)
  const mix = hits.length
    ? [`${music}[mus]`, `${hits.map((_, i) => `[s${String(i)}]`).join('')}amix=inputs=${String(hits.length)}:normalize=0[fx]`,
      `[mus][fx]amix=inputs=2:normalize=0,${master}`].join(';')
    : `${music},${master}`
  const wav = resolve(WORK, 'mix.wav')
  run('ffmpeg', ['-y', '-v', 'error', '-i', video, ...inputs, ...fx.inputs, '-filter_complex', [...chains, ...fx.chains, mix].join(';'),
    '-map', '[a]', '-c:a', 'pcm_f32le', wav])
  // 유튜브 기준(-14 LUFS)으로 통째로 한 번 올리거나 내린다 — `loudnorm` 한 번 돌리기는 순간마다 음량을 따라가 큰 소리 뒤에서
  // 곡이 몇 초씩 가라앉았다. 넘치는 봉우리만 리미터가 깎는다(-1.5 dBFS)
  const gain = -14 - lufs(wav)
  run('ffmpeg', ['-y', '-v', 'error', '-i', video, '-i', wav, '-filter_complex', `[1:a]volume=${gain.toFixed(2)}dB,alimiter=limit=0.84:level=false[a]`,
    '-map', '0:v', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '320k', '-movflags', '+faststart', final])
  console.log(`  소리 ${gain >= 0 ? '+' : ''}${gain.toFixed(1)}dB → -14 LUFS`)
}

/** 지난번 이은 영상(`video.mp4`)과 큐 시각(`stamps.txt`)에 소리만 다시 깐다 */
function remix() {
  const cueAt = Object.fromEntries(readFileSync(resolve(WORK, 'stamps.txt'), 'utf8').split('\n').map((l) => { const [c, t] = l.split(' '); return [c, Number(t)] }))
  const hits = fitEdit(snapCuts(fitEdit(EDIT, true))).filter((e) => e.cue in cueAt).flatMap((e) => sfxOf(e).map((h) => ({ ...h, t: cueAt[e.cue] + h.at }))).filter((h) => h.t >= 0)
  const final = resolve(OUT, SHORT ? 'radiant-reveal-short.mp4' : 'radiant-reveal.mp4')
  mixScore(resolve(WORK, 'video.mp4'), final, cueAt, hits)
  console.log(`\n  ${final} · ${duration(final).toFixed(2)}초`)
}

async function main() {
  mkdirSync(WORK, { recursive: true })
  mkdirSync(OUT, { recursive: true })
  if (args.includes('--remix')) return remix()
  const cardsOnly = args.includes('--cards-only')
  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 })
  const clips = []
  let missing = 0
  try {
    for (const e of fitEdit(snapCuts(fitEdit(EDIT, true)))) {
      const file = resolve(WORK, `${e.cue}.mp4`)
      if (e.take) {
        if (!existsSync(resolve(takeDir(e), 'frames.json'))) { console.log(`  ${e.cue.padEnd(6)} ${e.take} 안 찍었다 — 건너뛴다`); missing++; continue }
        if (!cardsOnly || !existsSync(file)) takeClip(e, file)
      } else await cardClip(page, e, file)
      clips.push({ file, cue: e.cue, fade: overlap(e), trans: e.trans ?? 'fade', seconds: duration(file), sfx: sfxOf(e) })
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
    if (clips[i - 1].trans === 'cut') parts.push(`${last}[n${String(i)}]concat=n=2:v=1:a=0${out}`)
    else parts.push(`${last}[n${String(i)}]xfade=transition=${clips[i - 1].trans}:duration=${f.toFixed(4)}:offset=${(at - f).toFixed(4)}${out}`)
    stamps.push(`${clips[i].cue} ${(at - f).toFixed(2)}`)
    at += clips[i].seconds - f
    last = out
  }
  const final = resolve(OUT, SHORT ? 'radiant-reveal-short.mp4' : 'radiant-reveal.mp4')
  const silent = SCORE.length ? resolve(WORK, 'video.mp4') : final
  run('ffmpeg', ['-y', '-v', 'error', ...inputs, '-filter_complex', parts.join(';'), '-map', '[v]', ...enc,
    '-movflags', '+faststart', silent])
  const cueAt = Object.fromEntries(stamps.map((l) => { const [c, t] = l.split(' '); return [c, Number(t)] }))
  const hits = clips.flatMap((c) => c.sfx.map((h) => ({ ...h, t: cueAt[c.cue] + h.at }))).filter((h) => h.t >= 0)
  if (SCORE.length) mixScore(silent, final, cueAt, hits)
  writeFileSync(resolve(WORK, 'stamps.txt'), stamps.join('\n'))
  console.log(`\n  ${final} · ${duration(final).toFixed(2)}초${missing ? ` · 빠진 장면 ${String(missing)}` : ''}`)
}

await main()
