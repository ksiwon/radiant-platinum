// 창기둥 영상 (`ScrCmd_2FB` → `sub_020985E4` → `overlay100` · PARITY §8.15)
//
// 붉은 사슬이 닫힌 뒤 도는 필드 밖 앱이다. 장면이 셋이고 건너뛸 수 없다 (`ov100_021D0EA8`의 `Unk_ov100_021D5130`):
//
//   0 부르기  (`ov100_021D2F0C.c`) 창기둥 위 — 검은 구슬 둘이 터져 디아루가 · 펄기아가 나타나고, 하얗게 번쩍인 뒤 은하가 벌어진다
//   1 호수    (`ov100_021D13E4.c`) 유크시 · 엠라이트 · 아그놈이 차례로 깨어나 하얗게 사라진다
//   2 기라티나 (`ov100_021D1C44.c`) 그림자가 번지고 기라티나가 기둥을 부수며 솟는다
//
// 여기는 **원작의 물체 · 카메라 · 밝기 · 소리 · 글의 차례만** 한 틱씩 돈다(그리기는 `scene/SpearPillarMovieStage`).
// 물체 하나는 원작 `UnkStruct_ov100_021D49B4` 하나다 — 애니 칸의 프레임을 fx32로 들고, 그리는 자리
// (`ov100_021D49B4`)에서 애니를 민다. 그러니 **그린 뒤의 값이 화면이다** — `shown`이 그 순간을 떠 둔다.
//
// 자리 · 크기 · 프레임은 **월드 유닛의 fx32**다. 원작과 같은 정수 셈을 한다(C 나눗셈의 버림 · `65535 / 360` = 182).
// 틱 차례는 원작 본 루프다: 앱 함수(장면의 한 단계 → 그리기) → 시스템 작업(카메라 흔들기 · 디아루가가 튀어나오기).
//
// ⚠️ **틱은 1/60초로 센다** (COMPLETION_20260928 §0의 갈림길)

const FX = 4096
const fx = (units: number): number => Math.round(units * FX)
/** `65535 / 360` — 원작이 도를 각으로 바꾸는 정수 */
const DEG = Math.trunc(65535 / 360)

type Vec = [number, number, number]

/** 영상 모델 — `import/platinum/demoModels`의 이름 */
export type MovieModel =
  | 'pillarMap' | 'pillars' | 'darkOrb' | 'blob' | 'dialga' | 'palkia' | 'hero' | 'heroine' | 'cyrus' | 'galaxy'
  | 'lakeBg' | 'uxie' | 'mesprit' | 'azelf'
  | 'drip' | 'orb' | 'giratinaA' | 'giratinaB' | 'giratinaC' | 'giratinaD' | 'giratinaE' | 'shadowA' | 'shadowB'

/**
 * 애니 칸마다의 프레임 수 (`NNS_G3dAnmObjGetNumFrame`) — 원작이 붙이는 차례(`ov100_021D4B4C(칸, …)`).
 * 굽는 쪽 머리(`data/demo/index.json`)와 같아야 한다(시험이 맞대 본다). 모델을 못 받아도 영상의 길이가 원작대로
 * 흐르도록 여기 둔다
 */
export const ANIM_FRAMES: Readonly<Record<MovieModel, readonly number[]>> = {
  pillarMap: [], pillars: [151, 151], darkOrb: [601, 601, 601, 601], blob: [],
  dialga: [17], palkia: [17], hero: [129], heroine: [129], cyrus: [65], galaxy: [1500, 1500],
  lakeBg: [], uxie: [301, 301], mesprit: [151, 151], azelf: [151, 151],
  drip: [124, 124], orb: [151, 151],
  giratinaA: [121, 121], giratinaB: [61, 61], giratinaC: [121, 121], giratinaD: [61, 61], giratinaE: [241, 241],
  shadowA: [151], shadowB: [],
}

/** 사람의 걸음 차례 한 줄 (`UnkStruct_ov100_021D54D0`) — 무늬 · 몇 번 · 한 틱에 옮기는 fx */
interface PatStep { pattern: number, count: number, move: number }
/** 무늬마다 그림 네 장 (`Unk_ov100_021D5344`) — 1부터 센다 */
const PAT_FRAMES: readonly (readonly number[])[] = [
  [1, 2, 3, 2, 0xff], [5, 6, 7, 6, 0xff], [9, 10, 11, 10, 0xff], [13, 14, 15, 14, 0xff],
  [0, 0, 0, 0, 0xff], [4, 4, 4, 4, 0xff], [10, 10, 10, 10, 0xff], [14, 14, 14, 14, 0xff],
  [0, 0, 0, 0, 0xff], [0, 1, 2, 3, 0xff], [4, 5, 6, 7, 0xff], [8, 9, 10, 11, 0xff], [12, 13, 14, 15, 0xff],
]
const QUARTER = -(FX / 2 >> 1)
/** 장면 2의 태홍 (`Unk_ov100_021D54D0` · `54E8` · `54B8` · `54A0`) */
const PAT_TURN: readonly PatStep[] = [{ pattern: 6, count: 4, move: 0 }, { pattern: 0, count: 1, move: 0 }]
const PAT_TURN_BACK: readonly PatStep[] = [
  { pattern: 6, count: 4, move: 0 }, { pattern: 5, count: 4, move: 0 }, { pattern: 0, count: 1, move: 0 },
]
const PAT_WALK: readonly PatStep[] = [{ pattern: 1, count: 2, move: QUARTER }, { pattern: 0, count: 1, move: 0 }]
const PAT_SLIDE: readonly PatStep[] = [{ pattern: 9, count: 2, move: QUARTER }, { pattern: 0, count: 1, move: 0 }]

/** 물체 하나 (`UnkStruct_ov100_021D49B4`) */
interface MovieObject {
  model: MovieModel
  /** 그리는가 (`unk_174`) · 보이는가 (`Easy3DObject_SetVisible`) */
  enabled: boolean
  visible: boolean
  pos: Vec
  scale: Vec
  /** 칸마다의 프레임 (fx32) */
  frame: number[]
  /** `unk_160` 돈다 · `unk_164` 0번 칸이 돈다(되풀이) · `unk_168` 1번 칸이 되풀이 · `unk_16C` 1번 칸이 한 번 · `unk_170` 네 칸이 함께 */
  active: boolean
  looped: boolean
  loop1: boolean
  once1: boolean
  all: boolean
  /** 한 틱에 미는 프레임 (`unk_154` · fx32) */
  speed: number
  /** 걸음 (`unk_158` 무늬 · `unk_15C` 네 장 중 몇째 · `unk_178` 남은 번 · `unk_17C` 처음 번 · `unk_180` 줄) */
  pattern: number
  sub: number
  count: number
  start: number
  row: number
  steps: readonly PatStep[] | null
  /** 크기 원값 (`unk_150`) — 은하가 벌어지는 셈 */
  grow: number
}

/** `ov100_021D4AC8` + 칸마다 `ov100_021D4B4C` */
function object(model: MovieModel, pos: Vec = [0, 0, 0]): MovieObject {
  const frames = ANIM_FRAMES[model]
  return {
    model, enabled: true, visible: true, pos: [fx(pos[0]), fx(pos[1]), fx(pos[2])], scale: [FX, FX, FX],
    frame: frames.map(() => 0), active: false, looped: false, loop1: false, once1: false, all: false,
    // ⚠️ 애니가 없는 모델은 `ov100_021D4B4C`를 안 지나서 빠르기가 0이다 (`memset`)
    speed: frames.length > 0 ? FX : 0,
    pattern: 0, sub: 0, count: frames.length > 0 ? 0xff : 0, start: 0, row: frames.length > 0 ? 0xff : 0, steps: null,
    grow: 0,
  }
}

/** 꺼진 칸 — 아직 안 실린 물체 (`memset` 0) */
function vacant(model: MovieModel): MovieObject {
  const o = object(model)
  o.enabled = false
  return o
}

/** `Easy3DAnim_UpdateLooped` */
function loopAnim(o: MovieObject, slot: number): void {
  const count = (ANIM_FRAMES[o.model][slot] ?? 0) * FX
  if (count === 0) return
  o.frame[slot] = ((o.frame[slot] ?? 0) + o.speed) % count
}

/** `Easy3DAnim_Update` — 끝에 닿으면 참 */
function stepAnim(o: MovieObject, slot: number): boolean {
  const count = (ANIM_FRAMES[o.model][slot] ?? 0) * FX
  const now = o.frame[slot] ?? 0
  if (now + o.speed < count) { o.frame[slot] = now + o.speed; return false }
  o.frame[slot] = count
  return true
}

/** 걸음을 건다 (`ov100_021D44C0`) */
function walk(o: MovieObject, steps: readonly PatStep[]): void {
  o.active = true
  o.steps = steps
  o.row = 0
  o.count = steps[0]!.count
  o.start = steps[0]!.count
  o.pattern = steps[0]!.pattern
}

/** 걸음의 줄 넘김 · 옮김 (`ov100_021D45A4`) */
function walkRow(o: MovieObject): void {
  const steps = o.steps
  if (steps === null || o.count === 0xff || o.row === 0xff) return
  const end = (): void => { o.active = false; o.row = 0xff; o.count = 0xff; o.start = 0xff }
  if (steps[o.row]!.pattern === 0) { end(); return }
  if (o.sub >= 4) {
    o.count--
    o.sub = 0
    if (o.count === 0) {
      o.row++
      o.pattern = steps[o.row]!.pattern
      o.count = steps[o.row]!.count
      o.start = steps[o.row]!.count
      if (o.pattern === 0) end()
    }
    return
  }
  if (o.sub === 0 && o.count === o.start) return
  const move = steps[o.row]!.move
  if (o.pattern === 1 || o.pattern === 2 || o.pattern === 9) o.pos[2] -= move
  else if (o.pattern === 3 || o.pattern === 4) o.pos[0] += move
}

/** 걸음의 그림 넘김 (`ov100_021D4510`) — 네 프레임마다 다음 그림 */
function walkFrame(o: MovieObject): void {
  const now = o.frame[0] ?? 0
  const was = Math.trunc(now / FX) % 4
  const next = now + o.speed
  const is = Math.trunc(next / FX) % 4
  const pic = PAT_FRAMES[o.pattern - 1]?.[o.sub] ?? 0xff
  if (pic === 0xff) return
  if (is !== was) { o.sub++; o.frame[0] = pic * 4 * FX } else o.frame[0] = next
}

/** 그리는 자리의 애니 (`ov100_021D49B4`) */
function updateObject(o: MovieObject): void {
  if (!o.enabled || !o.active) return
  let done = false
  if (o.looped) {
    if (o.pattern === 0) loopAnim(o, 0)
    else { walkRow(o); walkFrame(o) }
  } else if (o.all) {
    for (let slot = 0; slot < 4; slot++) done = stepAnim(o, slot)
  } else done = stepAnim(o, 0)
  if (o.loop1) loopAnim(o, 1)
  if (o.once1) stepAnim(o, 1)
  if (done) o.active = false
}

/** 카메라 (`Camera` — 겨눔점을 따라다닌다 · `Camera_InitWithTarget(…, trackTarget = TRUE)`) */
interface MovieCamera {
  /** 겨눔점 (`unk_44` · fx32) */
  target: Vec
  /** 각 (`CameraAngle` · 65536 한 바퀴) */
  angle: Vec
  /** 거리 (fx32) · 화각 반각 (65536 한 바퀴) · 자르는 면 (fx32) */
  dist: number
  fov: number
  near: number
  far: number
}

/** 카메라를 몇 틱에 걸쳐 옮긴다 (`UnkStruct_ov100_021D4890`) */
interface CamMove { left: number, dAngle: Vec, dTarget: Vec, final: Vec }

/** `ov100_021D4890` */
function camMove(cam: MovieCamera, frames: number, degrees: Vec, target: Vec): CamMove {
  return {
    left: frames,
    dAngle: degrees.map((d) => Math.trunc((DEG * d) / frames)) as Vec,
    dTarget: target.map((t) => Math.trunc(t / frames)) as Vec,
    final: cam.angle.map((a, i) => a + DEG * degrees[i]!) as Vec,
  }
}

/** `ov100_021D4920` — 끝나는 틱에 참. 마지막 틱은 각만 맞추고 겨눔점은 안 민다 */
function camStep(m: CamMove, cam: MovieCamera): boolean {
  if (m.left === 0) return true
  if (--m.left === 0) {
    cam.angle = [...m.final]
    return true
  }
  for (let i = 0; i < 3; i++) { cam.angle[i]! += m.dAngle[i]!; cam.target[i]! += m.dTarget[i]! }
  return false
}

/** 카메라 흔들기 (`ov100_021D36CC` · `UnkStruct_ov100_021D36CC`) — 겨눔점 x를 두 틱마다 오간다 */
interface Shake { mode: number, state: number, sign: number, move: CamMove | null, amp: number, frames: number }

/** 원작 표를 따라 무엇을 할지 밖에 알린다 */
export interface MovieHost {
  /** 글을 띄운다 (`ov100_021D46C8`) — 22번은 주인공 이름을 넣는다 */
  text: (id: number) => void
  /** 글이 아직 도는가 (`Text_IsPrinterActive`) — 쪽마다 A를 기다린다 */
  textActive: () => boolean
  /** 글창을 닫는다 (`ov100_021D4788` · `Text_RemovePrinter`) */
  textClose: () => void
  /** 두 화면 밝기 페이드 (`StartScreenFade`) · 끝났는가 */
  fade: (steps: number, perStep: number, out: boolean, white: boolean) => void
  fadeDone: () => boolean
  /** 효과음 — 좌우(−128~127) · 높낮이(1/64반음) */
  se: (seq: number, pan?: number, pitch?: number) => void
  /** 울음소리 (`Sound_PlayPokemonCryEx`) — 좌우 · 음량 0~127 */
  cry: (species: number, pan: number, volume: number) => void
  /** 곡을 튼다 · 끈다 (`Sound_PlayBGM` · `Sound_StopBGM`) · 소리만 줄인다 (`Sound_FadeOutBGM`) */
  bgm: (seq: number | 'stop') => void
  bgmFade: (volume: number, frames: number) => void
}

/** 소리 (`generated/sdat.txt`) · 울음소리 종족 */
const SE = {
  climax01: 1746, climax03: 1747, climax06: 1748, climax09: 1749, climax10: 1750, climax12: 1751,
  w392: 1479, w060: 1477, w082c: 1478,
} as const
const BGM = { ryayhy: 1065, gira: 1214, gira2: 1215 } as const
const SPECIES = { dialga: 483, palkia: 484, uxie: 480, mesprit: 481, azelf: 482, giratina: 487 } as const

/** 글 (`res/text/spear_pillar.json` · `TEXT_BANK_SPEAR_PILLAR`) */
export const MOVIE_TEXT_BANK = 234
export const MOVIE_TEXT_PLAYER = 22

/** 영상 전체의 진행 (`UnkStruct_ov100_021D4DD8`) */
export interface SpearPillarMovie {
  /** 몇째 장면 (`unk_04`) · 앱 단계 (0 세우기 · 1 돌기 · 2 걷기 · 3 끝) */
  scene: 0 | 1 | 2
  app: 0 | 1 | 2 | 3
  /** 장면 안의 단계 (`unk_00`) · 틱 (`unk_04`) · 갈래 (`unk_08`) · 걷는 단계 */
  state: number
  t: number
  branch: number
  teardown: number
  /** 여자 주인공인가 (`TrainerInfo_Gender == 1`) */
  heroine: boolean
  objects: Map<string, MovieObject>
  cam: MovieCamera
  move: CamMove | null
  shake: Shake | null
  /** 디아루가 · 펄기아가 튀어나오는 작업 (`ov100_021D37F4`) */
  pops: { which: 0 | 1, state: number, step: number, species: number, pan: number }[]
  /** 밝기 레지스터 (`G2_SetBlendBrightness` — 3D · 바탕만, 글창은 안 걸린다) −16~16 · 셈에 쓰는 값 (`unk_50.unk_03`) */
  bright: number
  brightVar: number
  /** 잔상 (`ov100_021D4EBC` — 화면 붙잡기 AB, 새 화면 4 · 앞 화면 12) */
  afterimage: boolean
  /** 그린 순간의 값 — 화면은 이것을 그린다 */
  shown: MovieFrame
  /** 틱 수 (재는 데만 쓴다) */
  ticks: number
}

/** 한 번 그린 화면 */
interface MovieFrame {
  scene: 0 | 1 | 2
  cam: { target: Vec, angle: Vec, dist: number, fov: number, near: number, far: number }
  /** `pattern` · `active`는 걸음(`unk_158` · `unk_160`) — 사람을 3D로 세우는 쪽이 보는 쪽과 몸짓을 읽는다 (`spearPillarCast`) */
  objects: { key: string, model: MovieModel, pos: Vec, scale: Vec, frame: readonly number[], pattern: number, active: boolean }[]
}

const emptyFrame = (): MovieFrame => ({
  scene: 0, cam: { target: [0, 0, 0], angle: [0, 0, 0], dist: 0, fov: 0, near: 0, far: 0 }, objects: [],
})

/** 그리는 차례 — 장면마다 `ov100_021D3558` · `17B4` · `2E0C` */
const DRAW_ORDER: readonly (readonly string[])[] = [
  ['map', 'pillars', 'dialga', 'palkia', 'darkOrb0', 'darkOrb1', 'galaxy0', 'galaxy1', 'player', 'cyrus',
    'blob0', 'blob1', 'blob2', 'blob3'],
  ['uxie', 'mesprit', 'azelf', 'lakeBg'],
  ['map', 'pillars', 'drip', 'orb', 'shadowA', 'shadowB', 'giratinaA', 'giratinaB', 'giratinaC', 'giratinaD',
    'giratinaE', 'dialga', 'palkia', 'player', 'cyrus', 'blob0', 'blob1', 'blob2', 'blob3'],
]

/** 장면마다 싣는 모델 — 화면이 미리 받는다 */
export function movieModels(scene: 0 | 1 | 2, heroine: boolean): MovieModel[] {
  const player: MovieModel = heroine ? 'heroine' : 'hero'
  if (scene === 0) return ['pillarMap', 'pillars', 'darkOrb', 'blob', 'dialga', 'palkia', player, 'cyrus', 'galaxy']
  if (scene === 1) return ['lakeBg', 'uxie', 'mesprit', 'azelf']
  return ['pillarMap', 'pillars', 'drip', 'orb', 'shadowA', 'shadowB', 'giratinaA', 'giratinaB', 'giratinaC',
    'giratinaD', 'giratinaE', 'dialga', 'palkia', player, 'cyrus', 'blob']
}

const get = (m: SpearPillarMovie, key: string): MovieObject => {
  const o = m.objects.get(key)
  if (!o) throw new Error(`창기둥 영상에 ${key}가 없다`)
  return o
}

/** 두 장면(0 · 2)이 같이 세우는 것 — 땅 · 기둥 · 둘 · 사람 · 그림자 */
function pillarCast(m: SpearPillarMovie): void {
  m.objects.set('map', object('pillarMap'))
  for (let i = 0; i < 4; i++) {
    const b = object('blob')
    b.scale = [fx(1.2), FX, fx(1.2)]
    m.objects.set(`blob${String(i)}`, b)
  }
  m.objects.set('pillars', object('pillars'))
  const legend = (key: string, model: MovieModel, x: number): void => {
    const o = object(model, [x, 0, -50])
    o.active = true
    o.looped = true
    o.speed = FX / 2
    m.objects.set(key, o)
  }
  legend('dialga', 'dialga', -50)
  legend('palkia', 'palkia', 50)
  const person = (key: string, model: MovieModel, z: number): void => {
    const o = object(model, [1, 0, z])
    o.looped = true
    o.speed = FX / 2 >> 1
    o.pattern = 2
    m.objects.set(key, o)
  }
  person('player', m.heroine ? 'heroine' : 'hero', 140)
  person('cyrus', 'cyrus', 60)
}

/** 장면 0 세우기 (`ov100_021D3620` · `ov100_021D3084`) */
function createScene0(m: SpearPillarMovie): void {
  m.objects.clear()
  pillarCast(m)
  for (const [i, x] of [-48, 48].entries()) {
    const o = object('darkOrb', [x, -10, -70])
    m.objects.set(`darkOrb${String(i)}`, o)
  }
  get(m, 'dialga').visible = false
  get(m, 'blob0').visible = false
  get(m, 'palkia').visible = false
  get(m, 'blob1').visible = false
  m.objects.set('galaxy0', vacant('galaxy'))
  m.objects.set('galaxy1', vacant('galaxy'))
  m.cam.target[2] = fx(34)
  initCamera(m, 0x13c805, [-0x29fe, 0, 0], 0xc01, FX * 10, FX * 1008)
}

/** `ov100_021D2F64` — 은하 둘. x · z 크기 0.1에서 벌어진다 */
function createGalaxies(m: SpearPillarMovie): void {
  for (const [i, x] of [-48, 48].entries()) {
    const o = object('galaxy', [x, -5, -70])
    o.grow = fx(0.1)
    o.scale = [o.grow, FX, o.grow]
    m.objects.set(`galaxy${String(i)}`, o)
  }
}

/** `Camera_InitWithTarget` — 겨눔점은 그대로 두고 둘레를 정한다 */
function initCamera(m: SpearPillarMovie, dist: number, angle: Vec, fov: number, near: number, far: number): void {
  m.cam.dist = dist
  m.cam.angle = [...angle]
  m.cam.fov = fov
  m.cam.near = near
  m.cam.far = far
}

/** 장면 1 세우기 (`ov100_021D13E4` · `ov100_021D1808`) */
function createScene1(m: SpearPillarMovie, host: MovieHost): void {
  m.objects.clear()
  m.objects.set('lakeBg', object('lakeBg'))
  m.objects.set('uxie', object('uxie'))
  m.objects.set('mesprit', object('mesprit'))
  m.objects.set('azelf', object('azelf'))
  get(m, 'mesprit').visible = false
  get(m, 'azelf').visible = false
  initCamera(m, fx(200), [1274, 0, 0], 0xa66, fx(0.1), fx(2048))
  m.cam.target[1] += fx(25)
  host.bgmFade(0, 10)
}

/** 장면 2 세우기 (`ov100_021D2340` · `ov100_021D1C98`) */
function createScene2(m: SpearPillarMovie): void {
  m.objects.clear()
  pillarCast(m)
  m.objects.set('drip', object('drip'))
  m.objects.set('orb', object('orb'))
  for (const [i, key] of (['giratinaA', 'giratinaB', 'giratinaC', 'giratinaD', 'giratinaE'] as const).entries()) {
    const o = object(key, [0, i === 0 ? -90 : 0, 0])
    o.visible = false
    o.loop1 = true
    m.objects.set(key, o)
  }
  const shadowA = object('shadowA')
  shadowA.visible = false
  m.objects.set('shadowA', shadowA)
  const shadowB = object('shadowB')
  shadowB.visible = false
  m.objects.set('shadowB', shadowB)
  initCamera(m, 0x13c805, [-0x29fe, 0, 0], 0xc01, FX * 10, FX * 1008)
  m.cam.target[1] = 0
  // `ov100_021D4DD8(param0, +16)` — 두 화면을 하얗게 둔 채로 연다
  m.brightVar = 16
  m.bright = 16
}

/** 밝기 레지스터에 적는다 (`G2_SetBlendBrightness`) */
function setBright(m: SpearPillarMovie, v: number): void { m.bright = v }

/** 세운다 — 앱이 설 때 (`ov100_021D0D80`): 검은 데서 12단계로 밝힌다 */
export function spearPillarMovieStart(host: MovieHost, heroine: boolean): SpearPillarMovie {
  host.fade(12, 1, false, false)
  return {
    scene: 0, app: 0, state: 0, t: 0, branch: 0, teardown: 0, heroine,
    objects: new Map(),
    cam: { target: [0, 0, 0], angle: [0, 0, 0], dist: 0, fov: 0, near: 0, far: 0 },
    move: null, shake: null, pops: [], bright: 0, brightVar: 0, afterimage: false,
    shown: emptyFrame(), ticks: 0,
  }
}

/** 한 틱 — 앱 함수 다음 시스템 작업. 영상이 끝나면 거짓 */
export function spearPillarMovieTick(m: SpearPillarMovie, host: MovieHost): boolean {
  m.ticks++
  if (m.app === 3) return false
  if (m.app === 0) {
    if (m.scene === 0) createScene0(m)
    else if (m.scene === 1) createScene1(m, host)
    else createScene2(m)
    m.state = 0
    m.t = 0
    m.branch = 0
    m.app = 1
  } else if (m.app === 1) {
    const running = m.scene === 0 ? scene0(m, host) : m.scene === 1 ? scene1(m, host) : scene2(m, host)
    if (!running) { m.app = 2; m.teardown = 0 }
  } else {
    // 걷기 — 장면 0은 두 번, 1 · 2는 세 번 불린다 (`ov100_021D3FD4` · `16C4` · `2C8C`)
    m.teardown++
    if (m.scene === 0 && m.teardown === 1) m.afterimage = false
    if (m.teardown >= (m.scene === 0 ? 2 : 3)) {
      if (m.scene === 2) { m.app = 3; runTasks(m, host); return false }
      m.scene = (m.scene + 1) as 1 | 2
      m.app = 0
    }
  }
  runTasks(m, host)
  return true
}

/** 시스템 작업 — 흔들기 · 튀어나오기 */
function runTasks(m: SpearPillarMovie, host: MovieHost): void {
  const s = m.shake
  if (s) {
    if (s.state === 0) {
      // `case 0`은 `case 1`로 흘러든다 — 새 한 벌을 세운 틱에 첫 걸음도 민다
      s.frames = 2
      const amp = s.mode === 4 || s.mode === 6 ? 2 : s.mode === 5 ? 4 : s.mode === 0xff ? 6 : s.mode === 7 ? 2 : null
      if (amp !== null) s.amp = (s.sign !== 0 ? 1 : -1) * fx(amp)
      if (s.mode === 7) s.frames = 4
      s.sign ^= 1
      s.move = camMove(m.cam, s.frames, [0, 0, 0], [s.amp, 0, 0])
      s.state = 1
    }
    if (s.state === 1) {
      if (camStep(s.move!, m.cam)) s.state = s.mode === 8 ? 2 : 0
    } else if (s.state === 2) m.shake = null
  }
  for (const p of m.pops) {
    if (p.state === 2) continue
    const legend = get(m, p.which === 0 ? 'dialga' : 'palkia')
    const blob = get(m, `blob${String(p.which)}`)
    const SCALE = [0, 0.3, 0.6, 1, 1.2, 1.1, 1] as const
    if (p.state === 0) {
      legend.scale = [fx(SCALE[p.step]!), FX, FX]
      blob.scale = [fx(SCALE[p.step]!), FX, FX]
      p.step++
      legend.visible = true
      blob.visible = true
      p.state = 1
    } else if (++p.step >= SCALE.length) {
      host.cry(p.species, p.pan, 80)
      p.state = 2
    } else {
      legend.scale = [fx(SCALE[p.step]!), FX, FX]
      blob.scale = [fx(SCALE[p.step]!), FX, FX]
    }
  }
}

/** 그림자 넷이 둘 · 사람을 따라간다 (장면 0 · 2의 끝자락) */
function followBlobs(m: SpearPillarMovie): void {
  const pairs = [['blob0', 'dialga'], ['blob1', 'palkia'], ['blob2', 'player'], ['blob3', 'cyrus']] as const
  for (const [i, [blob, who]] of pairs.entries()) {
    const b = get(m, blob)
    b.pos = [...get(m, who).pos]
    b.pos[2] -= FX * 2
    if (i >= 2) b.pos[0] -= FX
  }
}

/** 그린다 — 애니를 밀고 그 순간을 떠 둔다 */
function draw(m: SpearPillarMovie): void {
  const objects: MovieFrame['objects'] = []
  for (const key of DRAW_ORDER[m.scene]!) {
    const o = m.objects.get(key)
    if (!o) continue
    updateObject(o)
    if (!o.enabled || !o.visible) continue
    objects.push({
      key, model: o.model, pos: [...o.pos], scale: [...o.scale], frame: [...o.frame], pattern: o.pattern, active: o.active,
    })
  }
  m.shown = {
    scene: m.scene,
    cam: { target: [...m.cam.target], angle: [...m.cam.angle], dist: m.cam.dist, fov: m.cam.fov, near: m.cam.near, far: m.cam.far },
    objects,
  }
}

/** 장면 0 (`ov100_021D39E4`) */
function scene0(m: SpearPillarMovie, host: MovieHost): boolean {
  const orb0 = get(m, 'darkOrb0'), orb1 = get(m, 'darkOrb1')
  // 원작 `case`가 다음 `case`로 흘러드는 자리는 같은 틱에 다음 단계를 한 번 더 돈다
  let again = true
  while (again) {
    again = false
    switch (m.state) {
      case 0:
        if (!host.fadeDone()) break
        m.state++
        again = true
        break
      case 1:
        m.move = camMove(m.cam, 60, [0, 0, 0], [0, 0, -fx(80 - 34)])
        m.state++
        again = true
        break
      case 2:
        if (camStep(m.move!, m.cam)) { m.t = 0; m.state++; host.text(14) }
        break
      case 3:
        if (host.textActive()) break
        host.textClose()
        host.text(16)
        m.state++
        again = true
        break
      case 4:
        if (host.textActive()) break
        m.afterimage = true
        m.shake = { mode: 0, state: 0, sign: 0, move: null, amp: 0, frames: 2 }
        host.textClose()
        orb0.active = true
        orb0.all = true
        m.state++
        again = true
        break
      case 5:
        if (++m.t >= 60) {
          m.shake!.mode = 4
          orb1.active = true
          orb1.all = true
          m.state++
        }
        break
      case 6:
        m.t++
        if (m.t === 80) host.se(SE.climax01, -70)
        if (m.t === 135) host.se(SE.climax01, 70)
        if (m.t === 310 || m.t === 375 || m.t === 432) host.se(SE.climax06)
        if (m.t === 284 || m.t === 338 || m.t === 406) host.se(SE.climax09)
        if (m.t === 165) host.se(SE.climax03, -70)
        if (m.t === 220) host.se(SE.climax03, 70)
        if (m.t === 470) host.se(SE.climax10, -70)
        if (m.t === 520) host.se(SE.climax10, 70)
        if (m.t === 120) m.shake!.mode = 5
        if (m.t === 210) m.shake!.mode = 0xff
        if (!orb0.active) {
          m.shake!.mode = 6
          m.pops.push({ which: 0, state: 0, step: 0, species: SPECIES.dialga, pan: -80 })
          host.se(SE.climax12, -70)
          m.state++
        }
        break
      case 7:
        if (!orb1.active) {
          m.shake!.mode = 7
          m.pops.push({ which: 1, state: 0, step: 0, species: SPECIES.palkia, pan: 80 })
          host.se(SE.climax12, 70)
          m.state++
          m.t = 0
        }
        break
      case 8:
        if (++m.t >= 30) { m.t = 0; m.state++ }
        break
      case 9:
      case 10: {
        if (m.shake) m.shake.mode = 8
        const peak = m.state === 9 ? 8 : 12
        if (m.branch === 0) {
          if (m.brightVar < peak) setBright(m, ++m.brightVar)
          else m.branch = 1
        } else if (m.brightVar > 0) {
          m.brightVar -= 2
          setBright(m, m.brightVar)
        } else { m.state++; m.branch = 0 }
        break
      }
      case 11:
        if (m.brightVar < 16) { m.brightVar += 2; setBright(m, m.brightVar) }
        else {
          // `ov100_021D34C0` — 검은 구슬을 놓고 은하를 싣는다
          orb0.enabled = false
          orb1.enabled = false
          createGalaxies(m)
          m.state++
        }
        break
      case 12:
        if (m.brightVar !== 0) { m.brightVar--; setBright(m, m.brightVar) }
        else {
          for (const key of ['galaxy0', 'galaxy1']) {
            const g = get(m, key)
            g.active = true
            g.looped = true
            g.once1 = true
          }
          m.state++
        }
        break
      case 13: {
        const g0 = get(m, 'galaxy0'), g1 = get(m, 'galaxy1')
        if (g0.grow < fx(0.8)) {
          for (const g of [g0, g1]) { g.grow += fx(0.02); g.scale = [g.grow, FX, g.grow] }
        } else { host.text(18); m.state++ }
        break
      }
      case 14:
        if (host.textActive()) break
        host.textClose()
        host.text(19)
        m.state++
        break
      case 15: {
        if (host.textActive()) break
        const g0 = get(m, 'galaxy0'), g1 = get(m, 'galaxy1')
        if (g0.grow > fx(0.1)) {
          for (const g of [g0, g1]) { g.grow -= fx(0.02); g.scale = [g.grow, FX, g.grow] }
        } else { host.fade(6, 1, true, false); m.state++ }
        break
      }
      case 16:
        if (!host.fadeDone()) break
        host.textClose()
        m.state++
        break
      default:
        m.state = 0
        m.t = 0
        return false
    }
  }
  followBlobs(m)
  draw(m)
  return true
}

/** 호수의 셋 — 보이는 틱 · `SE_PL_W392` 틱 · 울음 틱 · 종족 (`ov100_021D14A8`의 `v1` · `v3` · `v2` · `v4`) */
const LAKE_SHOW = [210, 120, 120] as const
const LAKE_SE = [100, 19, 18] as const
const LAKE_CRY = [145, 119, 100] as const
const LAKE_SPECIES = [SPECIES.uxie, SPECIES.mesprit, SPECIES.azelf] as const
const LAKE_KEYS = ['uxie', 'mesprit', 'azelf'] as const

/** 장면 1 (`ov100_021D14A8`) — `unk_08`이 몇째인가다 */
function scene1(m: SpearPillarMovie, host: MovieHost): boolean {
  // 원작 `case`가 다음 `case`로 흘러드는 자리는 같은 틱에 다음 단계를 한 번 더 돈다
  let again = true
  while (again) {
    again = false
    switch (m.state) {
      case 0:
        host.fade(6, 1, false, false)
        m.state++
        again = true
        break
      case 1:
        if (!host.fadeDone()) break
        host.bgm(BGM.ryayhy)
        m.state = 2
        break
      case 2: {
        const o = get(m, LAKE_KEYS[m.branch]!)
        o.visible = true
        o.active = true
        o.once1 = true
        m.state++
        m.t = 0
        break
      }
      case 3:
        if (m.t === LAKE_SE[m.branch]) host.se(SE.w392)
        if (m.t === LAKE_CRY[m.branch]) host.cry(LAKE_SPECIES[m.branch]!, 0, 100)
        if (++m.t >= LAKE_SHOW[m.branch]!) { m.brightVar = 0; m.t = 0; m.state++ }
        break
      case 4:
        // ⚠️ 16에 닿는 틱은 레지스터에 안 적는다 — 화면은 15에서 사라진다
        if (++m.brightVar !== 16) setBright(m, m.brightVar)
        else {
          get(m, LAKE_KEYS[m.branch]!).visible = false
          m.state++
          m.branch++
          if (m.branch >= 3) { m.brightVar = 0; m.state = 6 }
        }
        break
      case 5:
        if (--m.brightVar > 0) setBright(m, m.brightVar)
        else m.state = 2
        break
      case 6:
        if (++m.t < 30 * 4) break
        // 위 화면만 하얘진다 (`G2S_SetBlendBrightness`) — 아래 화면의 레지스터는 15에 남는다
        if (++m.brightVar === 16) {
          host.fade(1, 1, true, true)
          m.state = 0
          return false
        }
    }
  }
  draw(m)
  return true
}

/** 장면 2 (`ov100_021D2428`) */
function scene2(m: SpearPillarMovie, host: MovieHost): boolean {
  const cyrus = get(m, 'cyrus')
  // 원작 `case`가 다음 `case`로 흘러드는 자리는 같은 틱에 다음 단계를 한 번 더 돈다
  let again = true
  while (again) {
    again = false
    switch (m.state) {
      case 0:
        host.fade(6, 1, false, true)
        m.brightVar = 0
        setBright(m, 0)
        m.state++
        again = true
        break
      case 1:
        if (!host.fadeDone()) break
        m.state++
        break
      case 2:
        m.move = camMove(m.cam, 60, [20, 0, 0], [0, 0, 0])
        m.state++
        break
      case 3:
        if (camStep(m.move!, m.cam)) { host.text(20); m.state++ }
        break
      case 4:
        if (host.textActive()) break
        host.textClose()
        m.state++
        break
      case 5:
        m.move = camMove(m.cam, 60, [0, 0, 0], [0, 0, fx(70)])
        m.state++
        break
      case 6:
        if (!camStep(m.move!, m.cam)) break
        if (++m.t < 10) break
        host.text(21)
        walk(cyrus, PAT_TURN)
        m.state++
        m.t = 0
        break
      case 7:
        if (host.textActive()) break
        host.textClose()
        host.text(MOVIE_TEXT_PLAYER)
        host.bgmFade(0, 10)
        m.state++
        break
      case 8:
        if (host.textActive()) break
        host.textClose()
        m.t++
        // 15틱 — 위 화면의 구슬이 떨기 시작한다(`unk_0C %= 2; += 2`). 위 화면은 안 그린다
        if (m.t < 30) break
        if (m.brightVar > -6) {
          if (m.t % 2) m.brightVar--
          setBright(m, m.brightVar)
        } else { host.text(23); m.t = 0; m.state++ }
        break
      case 9:
        if (host.textActive()) break
        host.textClose()
        walk(cyrus, PAT_TURN_BACK)
        m.move = camMove(m.cam, 90, [0, 0, 0], [0, 0, -fx(80)])
        m.state++
        break
      case 10:
        if (!camStep(m.move!, m.cam)) break
        m.state++
        m.t = 0
        break
      case 11: {
        const shadow = get(m, 'shadowA')
        shadow.active = true
        shadow.visible = true
        host.bgm(BGM.gira)
        m.state++
        break
      }
      case 12: {
        if (++m.t === 60) walk(cyrus, PAT_WALK)
        if ([15, 45, 75, 95, 115, 130, 145].includes(m.t)) {
          host.se(SE.w060, 0, Math.trunc(m.t / 30) * 32 + (m.t % 32) * 10)
        }
        if (!get(m, 'shadowA').active) {
          get(m, 'shadowA').visible = false
          get(m, 'shadowB').visible = true
          const a = get(m, 'giratinaA')
          a.visible = true
          a.active = true
          m.t = 0
          m.state++
        }
        break
      }
      case 13: {
        const a = get(m, 'giratinaA')
        if (a.pos[1] < -fx(50)) a.pos[1] += FX / 2
        else { m.t = 0; m.state++ }
        break
      }
      case 14: {
        const a = get(m, 'giratinaA')
        if (!a.active) {
          const b = get(m, 'giratinaB')
          b.pos[1] = a.pos[1]
          b.active = true
          b.looped = true
          const pillars = get(m, 'pillars')
          pillars.active = true
          pillars.once1 = true
          const orb = get(m, 'orb')
          orb.active = true
          orb.loop1 = true
          a.visible = false
          b.visible = true
          m.state++
        }
        break
      }
      case 15: {
        m.t++
        if (m.t === 1) host.se(SE.w082c)
        if (m.t === 20) walk(cyrus, PAT_SLIDE)
        if (m.t === 15 + 25) host.cry(SPECIES.dialga, -80, 40)
        if (m.t === 40 + 25) host.cry(SPECIES.palkia, 80, 40)
        const dialga = get(m, 'dialga'), palkia = get(m, 'palkia')
        dialga.pos[2] -= m.t < 15 + 25 ? FX / 2 >> 1 : FX / 2
        palkia.pos[2] -= m.t < 40 + 25 ? FX / 2 >> 1 : FX / 2
        const b = get(m, 'giratinaB')
        if (b.pos[1] < 0) b.pos[1] += FX / 2
        else { b.pos[1] = 0; m.t = 0; host.text(24); m.state++ }
        break
      }
      case 16: {
        if (host.textActive()) break
        host.textClose()
        const drip = get(m, 'drip')
        drip.active = true
        drip.looped = false
        drip.once1 = true
        get(m, 'giratinaC').active = true
        get(m, 'giratinaB').visible = false
        get(m, 'giratinaC').visible = true
        host.cry(SPECIES.giratina, 0, 127)
        m.t = 0
        m.state++
        break
      }
      case 17:
        if (!get(m, 'giratinaC').active) {
          host.text(25)
          const d = get(m, 'giratinaD')
          d.active = true
          d.looped = true
          get(m, 'drip').active = false
          get(m, 'drip').visible = false
          get(m, 'giratinaC').visible = false
          d.visible = true
          m.state++
        }
        break
      case 18:
        if (host.textActive()) break
        if (m.t === 0) host.textClose()
        host.bgm(BGM.gira2)
        get(m, 'giratinaE').active = true
        get(m, 'giratinaD').visible = false
        get(m, 'giratinaE').visible = true
        m.t = 0
        m.state++
        break
      case 19:
        if (++m.t === 238) host.cry(SPECIES.giratina, 0, 127)
        if (m.t === 170) host.text(26)
        if (!get(m, 'giratinaE').active) {
          host.textClose()
          m.brightVar = -16
          setBright(m, -16)
          host.bgm('stop')
          m.state++
          m.t = 0
        }
        break
      case 20:
        host.fade(1, 1, true, false)
        m.state++
        again = true
        break
      case 21:
        if (!host.fadeDone()) break
        m.brightVar = 0
        setBright(m, 0)
        m.state++
        break
      default:
        if (++m.t >= 60) { m.state = 0; return false }
        break
    }
  }
  followBlobs(m)
  draw(m)
  return true
}
