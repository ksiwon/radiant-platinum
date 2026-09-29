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
//   battle    트레이너 곡 · 흰 번쩍임 둘 → 배경 판이 두 줄 띠마다 밀리며 마흔 틱에 검어진다 (`FrontierScrCmd_3F 3` · `engine/frontier/factoryTransition`)
//   brainBattle 수철 — 브레인 곡 · 띠 · VS · 얼굴 · 이름 → 희게 닫힌다 (`FrontierScrCmd_47 2`). 배틀이 끝나면 불 4로 밝아진다
//   leaveRoom 상대가 나가고 → 문 소리 → 검게 닫고 복도(주인공이 문 앞) → 밝아진다
//   close     검게 닫는다 — 로비로 돌아가기 전
//
// 수철의 연기는 원작 입자다 — `frontier_particle.narc`의 `battle_factory.spa`(5번) 이미터 셋(초록 연기 · 연기 구름 · 솟는 네모)을
// 정사영 입자 카메라로 돌린다(`InitParticleSystem 0, battle_factory_spa` · `engine/battle/cutInParticles`). 사람 위에 선다(BG0 우선순위 0).
// ⚠️ **틱은 1/60초로 센다** (COMPLETION_20260928 §0의 갈림길)
import { FACTORY_ACTOR, FACTORY_GFX, FACTORY_MOVES, StageMotion } from '../engine/frontier/stageMotion'
import { BrainIntro, FactoryBattleWipe, type FactoryTransitionFrame } from '../engine/frontier/factoryTransition'
import { makeEmitter } from '../engine/battle/spl/emitter'
import { orthoQuads, type OrthoEmitter } from '../engine/battle/cutInParticles'
import type { CutInParticle } from '../engine/battle/encounterCutIn'
import { preloadSplPack, splFileFor } from './battle/splPack'

/** 시설 입자 묶음 · 팩토리 멤버 (`frontier_particles.order`의 6번째 줄) · 이미터 셋 (`FACTORY_EMITTER_*`) */
const FRONTIER_PARTICLES = 'frontier'
const FACTORY_SPA = 5
const SMOKE_EMITTERS = [0, 1, 2] as const

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
  /** 배틀로 넘어가는 연출의 이 틱 (`FrontierStage`가 그린다) */
  transition: FactoryTransitionFrame | null
  /** 수철의 연기 — 이 틱의 입자 사각형 (DS 좌표) */
  smoke: CutInParticle[] | null
}

export const factoryStage: FactoryStageState = {
  scene: null, motion: new StageMotion(), conveyor: false, floorY: 0, light: 0, fade: 1, fadeTo: 1, shakeY: 0, ticks: 0,
  transition: null,
  smoke: null,
}

let smokeLive: OrthoEmitter[] = []

/** 도는 연출 — 무대 시계가 틱마다 민다 */
let running: FactoryBattleWipe | BrainIntro | null = null

let shake: { phase: number, left: number, every: number, amp: number } | null = null
let loop = 0
let acc = 0
let last = 0

function tick(): void {
  const s = factoryStage
  s.ticks++
  if (running) s.transition = running.tick()
  if (smokeLive.length > 0) {
    for (const l of smokeLive) l.emitter.update()
    smokeLive = smokeLive.filter((l) => !l.emitter.done)
    s.smoke = smokeLive.length > 0 ? orthoQuads(smokeLive) : null
  }
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
  factoryStage.transition = null
  factoryStage.smoke = null
  smokeLive = []
  running = null
  shake = null
}

/**
 * 배틀룸에 두 사람을 세우고 넘어가는 연출을 그 틱에 세워 둔다 (개발 콘솔 `pt.factoryWipe` · `pnpm shot --factoryWipe=…`).
 * 무대 시계는 안 돌린다 — 그 틱의 그림이 그대로 선다
 */
export function pinFactoryTransition(brain: boolean, at: number, playerGfx: number, opponentGfx: number, name: string): void {
  const s = factoryStage
  if (loop !== 0 && typeof cancelAnimationFrame !== 'undefined') cancelAnimationFrame(loop)
  loop = 0
  running = null
  s.scene = 'room'
  s.light = LIGHT_LEVELS - 1
  s.fade = s.fadeTo = 0
  s.conveyor = false
  s.motion.clear()
  s.motion.add({ id: FACTORY_ACTOR.player, gfx: playerGfx, x: 128, y: 192, dir: 0, visible: true })
  s.motion.apply(FACTORY_ACTOR.player, FACTORY_MOVES.roomEnter)
  s.motion.add({ id: FACTORY_ACTOR.opponent, gfx: brain ? FACTORY_GFX.thorton : opponentGfx, x: 128, y: 64, dir: 1, visible: true })
  s.motion.apply(FACTORY_ACTOR.opponent, FACTORY_MOVES.opponentEnter)
  for (let i = 0; i < 600 && s.motion.busy(); i++) s.motion.tick()
  s.motion.apply(FACTORY_ACTOR.opponent, FACTORY_MOVES.opponentFace)
  for (let i = 0; i < 600 && s.motion.busy(); i++) s.motion.tick()
  s.smoke = null
  smokeLive = []
  if (at < 0) {
    // 수철의 연기 — `-틱`이면 그 틱의 연기를 세운다
    const file = splFileFor(FRONTIER_PARTICLES, FACTORY_SPA)
    if (!file) { void preloadSplPack(FRONTIER_PARTICLES).then(() => { pinFactoryTransition(brain, at, playerGfx, opponentGfx, name) }); return }
    smokeLive = SMOKE_EMITTERS.map((i) => ({ file, index: i, emitter: makeEmitter(file, i, 0x7ac7_0000 + i)! }))
    for (let i = 0; i < -at; i++) {
      for (const l of smokeLive) l.emitter.update()
      smokeLive = smokeLive.filter((l) => !l.emitter.done)
    }
    s.transition = null
    s.smoke = smokeLive.length > 0 ? orthoQuads(smokeLive) : null
    smokeLive = []
    return
  }
  const t = brain ? new BrainIntro(name) : new FactoryBattleWipe()
  s.transition = null
  for (let i = 0; i <= at; i++) s.transition = t.tick()
}

/** 넘어가는 연출 하나를 끝까지 — 끝 틱의 그림(검정 · 흰색)은 배틀이 열릴 때까지 남긴다 */
async function transition(t: FactoryBattleWipe | BrainIntro): Promise<void> {
  running = t
  await until(() => factoryStage.transition?.done === true)
  running = null
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
  | { kind: 'brainBattle', name: string }
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
      void preloadSplPack(FRONTIER_PARTICLES)
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
      {
        // `InitParticleSystem` · `CreateParticleSystemEmitter` 셋 — 못 받았으면 연기 없이 간다
        const file = splFileFor(FRONTIER_PARTICLES, FACTORY_SPA)
        if (file) {
          smokeLive = SMOKE_EMITTERS.flatMap((i) => {
            const e = makeEmitter(file, i, 0x7ac7_0000 + i)
            return e ? [{ file, index: i, emitter: e }] : []
          })
        }
      }
      step.sound()
      await waitTicks(36)
      shake = { phase: 0, left: 11, every: 1, amp: 3 }
      await waitTicks(11)
      m.apply(FACTORY_ACTOR.opponent, FACTORY_MOVES.warpIn)
      await still()
      // `WaitForParticleSystemEmitters` · `FreeParticleSystem 0`
      await until(() => smokeLive.length === 0)
      s.smoke = null
      return
    case 'battle':
      await transition(new FactoryBattleWipe())
      // 배틀 화면이 뜬다 — 무대는 검게 덮어 둔다 (돌아오면 `afterBattle`)
      s.fade = s.fadeTo = 1
      return
    case 'brainBattle':
      await transition(new BrainIntro(step.name))
      s.fade = s.fadeTo = 1
      return
    case 'afterBattle':
      // `_0AD0` — 불을 4로 두고 밝힌다
      s.transition = null
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
