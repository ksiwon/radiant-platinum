// 배틀팩토리 장면의 무대 — 판 · 사람 · 암전 (PARITY §9.3 · `overlay104` · `frontier_scripts_battle_factory.s`)
//
// 장면 VM이 그리는 것을 옮겼다. 복도와 배틀룸은 2D 판(`data/frontier/*` · `import/platinum/frontierBg`), 사람은 필드의 걷는
// 그림(`data/npc/*`)이다 — 원작은 같은 사람을 `wifi2dchar`에 한 번 더 싣지만 그림이 같아 새로 굽지 않았다.
//
// 차례(`engine/frontier/factoryScene`)가 `stage`를 부르면 여기서 스크립트의 한 토막을 그대로 돈다:
//
//   open      복도(과학자 · 주인공 · 안내원) → 밝아지고(6단) → 주인공 여섯 칸 · 안내원 비켜서기 → 안내원이 사라진다
//   appOut/In 빌리기 · 바꾸기 화면 앞뒤의 암전 — 그동안 바닥이 멈춘다(`BF_FUNC_UNK_32` · `_31`)
//   goIn      과학자가 비켜서고 주인공이 문으로 (`_01E0` · `_01BC`)
//   toRoom    검게 닫고 배틀룸 → 밝아지고 → 주인공이 제자리로 → 불이 0→4 (3틱마다)
//   opponent  상대가 들어와 제자리로 → 15틱 → 이쪽을 본다
//   thorton   수철이 숨은 채 제자리로 → 주인공이 두리번 → 연기 소리 → 36틱 → 흔들림(±3픽셀 · 3틱마다 · 열한 번) → 11틱 → 나타난다
//   battle    배틀로 넘어간다 — 무대는 검게 덮여 있다가 배틀이 끝나면 불 4로 밝아진다
//   leaveRoom 상대가 나가고 → 문 소리 → 검게 닫고 복도(주인공이 문 앞) → 밝아진다
//   close     검게 닫는다 — 로비로 돌아가기 전
//
// ⚠️ **연기 입자는 아직 안 그린다** (`battle_factory.spa` · 방출기 셋). 소리와 흔들림 · 때는 원작대로다.
// ⚠️ **틱은 1/60초로 센다** (COMPLETION_20260928 §0의 갈림길)
import { FACTORY_ACTOR, FACTORY_GFX, FACTORY_MOVES, StageMotion } from '../engine/frontier/stageMotion'

/** `FadeScreenIn` · `Out` — 6단 · 한 단에 한 틱 (`frscrcmd.inc`) */
const FADE_STEPS = 6
/** 배틀룸 불 (`BF_FUNC_UNK_30`) — 다섯 벌, 3틱마다 */
const LIGHT_LEVELS = 5
const LIGHT_WAIT = 3
/** 바닥이 한 바퀴 도는 틱 — 바닥 판이 256픽셀마다 되풀이된다 */
const FLOOR_LOOP = 256

type StageScene = 'corridor' | 'room'

interface FactoryStageState {
  scene: StageScene | null
  motion: StageMotion
  /** 바닥이 도는가 · 지금 y (`BG2` 세로 밀기) */
  conveyor: boolean
  floorY: number
  /** 배틀룸 불 0~4 */
  light: number
  /** 검은 덮개 0~1 */
  fade: number
  fadeTo: number
  /** 흔들림 (픽셀) */
  shakeY: number
  /** 무대가 선 뒤 흐른 틱 */
  ticks: number
}

export const factoryStage: FactoryStageState = {
  scene: null, motion: new StageMotion(), conveyor: false, floorY: 0, light: 0, fade: 1, fadeTo: 1, shakeY: 0, ticks: 0,
}

let shake: { phase: number, left: number, every: number, amp: number } | null = null
let loop = 0
let acc = 0
let last = 0

function tick(): void {
  const s = factoryStage
  s.ticks++
  s.motion.tick()
  if (s.conveyor) s.floorY = (s.floorY + 1) % FLOOR_LOOP
  if (s.fade !== s.fadeTo) {
    const d = 1 / FADE_STEPS
    s.fade = s.fade < s.fadeTo ? Math.min(s.fadeTo, s.fade + d) : Math.max(s.fadeTo, s.fade - d)
  }
  if (shake) {
    // `FrontierScrCmd_4C 0, 3, 2, 10` — 부호가 3틱마다 뒤집히고 열한 번 뒤 멈춘다
    if (--shake.every <= 0) {
      shake.every = 3
      shake.phase++
      if (shake.phase > shake.left) { shake = null; s.shakeY = 0 }
      else s.shakeY = shake.phase % 2 === 1 ? shake.amp : -shake.amp
    }
  }
}

/** 무대 시계 — 필드 루프와 따로 돈다(장면 동안 필드는 멈춰 있다) */
function run(now: number): void {
  loop = requestAnimationFrame(run)
  const dt = last === 0 ? 0 : Math.min(0.25, (now - last) / 1000)
  last = now
  acc += dt * 60
  while (acc >= 1) { acc -= 1; tick() }
}

function start(): void {
  if (loop !== 0 || typeof requestAnimationFrame === 'undefined') return
  last = 0
  acc = 0
  loop = requestAnimationFrame(run)
}

/** 무대를 거둔다 — 장면이 끝났다 */
export function closeFactoryStage(): void {
  if (loop !== 0 && typeof cancelAnimationFrame !== 'undefined') cancelAnimationFrame(loop)
  loop = 0
  factoryStage.scene = null
  factoryStage.motion.clear()
  factoryStage.conveyor = false
  factoryStage.fade = factoryStage.fadeTo = 1
  shake = null
}

/** 조건이 설 때까지 틱마다 본다 */
function until(done: () => boolean): Promise<void> {
  return new Promise((resolve) => {
    const look = (): void => { if (done()) resolve(); else setTimeout(look, 8) }
    look()
  })
}

const waitTicks = (n: number): Promise<void> => {
  const end = factoryStage.ticks + n
  return until(() => factoryStage.ticks >= end)
}
const still = (): Promise<void> => until(() => !factoryStage.motion.busy())
const fadeTo = (to: number): Promise<void> => {
  factoryStage.fadeTo = to
  return until(() => factoryStage.fade === to)
}

/** 복도 (`_0028` · 되돌아올 때는 `_0098`) */
function corridor(playerGfx: number, back: boolean): void {
  const s = factoryStage
  s.scene = 'corridor'
  s.motion.clear()
  s.motion.add({ id: FACTORY_ACTOR.scientist, gfx: FACTORY_GFX.scientist, x: 128, y: 80, dir: 1, visible: true })
  s.motion.add({ id: FACTORY_ACTOR.player, gfx: playerGfx, x: 128, y: back ? 96 : 192, dir: 0, visible: true })
  if (!back) s.motion.add({ id: FACTORY_ACTOR.attendant, gfx: FACTORY_GFX.attendant, x: 96, y: 176, dir: 3, visible: true })
  s.conveyor = true
}

export type StageStep =
  | { kind: 'open' }
  | { kind: 'appOut' }
  | { kind: 'appIn' }
  | { kind: 'goIn' }
  | { kind: 'toRoom' }
  | { kind: 'opponent', gfx: number }
  | { kind: 'thorton', sound: () => void }
  | { kind: 'battle' }
  | { kind: 'afterBattle' }
  | { kind: 'leaveRoom', door: () => Promise<void> }
  | { kind: 'close' }

/** 스크립트의 한 토막을 돈다 */
export async function factoryStageStep(step: StageStep, playerGfx: number): Promise<void> {
  start()
  const s = factoryStage
  const m = s.motion
  switch (step.kind) {
    case 'open':
      corridor(playerGfx, false)
      s.fade = s.fadeTo = 1
      await fadeTo(0)
      m.apply(FACTORY_ACTOR.player, FACTORY_MOVES.enter)
      m.apply(FACTORY_ACTOR.attendant, FACTORY_MOVES.attendant)
      await still()
      m.remove(FACTORY_ACTOR.attendant)
      return
    case 'appOut':
      await fadeTo(1)
      s.conveyor = false
      return
    case 'appIn':
      s.conveyor = true
      await fadeTo(0)
      return
    case 'goIn':
      m.apply(FACTORY_ACTOR.scientist, FACTORY_MOVES.scientistAside)
      m.apply(FACTORY_ACTOR.player, FACTORY_MOVES.goIn)
      await still()
      return
    case 'toRoom':
      await fadeTo(1)
      s.conveyor = false
      s.scene = 'room'
      s.light = 0
      m.clear()
      m.add({ id: FACTORY_ACTOR.player, gfx: playerGfx, x: 128, y: 192, dir: 0, visible: true })
      await fadeTo(0)
      m.apply(FACTORY_ACTOR.player, FACTORY_MOVES.roomEnter)
      await still()
      // `_1471` — 불이 0 → 4
      for (let n = 0; n < LIGHT_LEVELS; n++) {
        s.light = n
        if (n < LIGHT_LEVELS - 1) await waitTicks(LIGHT_WAIT)
      }
      return
    case 'opponent':
      m.add({ id: FACTORY_ACTOR.opponent, gfx: step.gfx, x: 128, y: 64, dir: 1, visible: true })
      m.apply(FACTORY_ACTOR.opponent, FACTORY_MOVES.opponentEnter)
      await still()
      await waitTicks(15)
      m.apply(FACTORY_ACTOR.opponent, FACTORY_MOVES.opponentFace)
      await still()
      return
    case 'thorton':
      m.add({ id: FACTORY_ACTOR.opponent, gfx: FACTORY_GFX.thorton, x: 128, y: 64, dir: 1, visible: true })
      m.apply(FACTORY_ACTOR.opponent, FACTORY_MOVES.thortonHidden)
      await still()
      m.apply(FACTORY_ACTOR.player, FACTORY_MOVES.lookAround)
      await still()
      step.sound()
      await waitTicks(36)
      shake = { phase: 0, left: 11, every: 1, amp: 3 }
      await waitTicks(11)
      m.apply(FACTORY_ACTOR.opponent, FACTORY_MOVES.warpIn)
      await still()
      return
    case 'battle':
      // 배틀 화면이 뜬다 — 무대는 검게 덮어 둔다 (돌아오면 `afterBattle`)
      s.fade = s.fadeTo = 1
      return
    case 'afterBattle':
      // `_0AD0` — 불을 4로 두고 밝힌다
      s.light = LIGHT_LEVELS - 1
      await fadeTo(0)
      return
    case 'leaveRoom':
      if (m.actors.has(FACTORY_ACTOR.opponent)) {
        m.apply(FACTORY_ACTOR.opponent, FACTORY_MOVES.opponentLeave)
        await still()
        m.remove(FACTORY_ACTOR.opponent)
      }
      await step.door()
      await fadeTo(1)
      corridor(playerGfx, true)
      await fadeTo(0)
      return
    case 'close':
      await fadeTo(1)
      s.conveyor = false
      return
  }
}
