// 깨어진 세계 B5F — 호수의 셋이 바위 넣는 법을 보여 준다 (PARITY §6.10)
//
// 사건 명령 12·13·14가 부르는 연출이다 (`distortionEvents`). 규칙과 표는
// `engine/world/distortionTuto`에 있고, 여기서는 **프레임을 세고 배우를 만진다**:
// 그 마리를 세우고, 울리고, 그림 어긋남을 옮기고, 이동 동작 목록을 걸고,
// 끝나면 지우고 퍼즐 표식을 세운다.
import { MovementRunner, type Movable, type MovementStep, type MovementTable } from '../engine/script/movement'
import { music } from '../engine/audio/music'
import { npcActors } from '../engine/actor/npcs'
import {
  AZELF_ANIM, TUTO_SPECS, TUTO_TILE_FX, mespritAnims, newTutoRun, tutoFinishedFlags, tutoFrame,
  type TutoAnimCmd, type TutoRun,
} from '../engine/world/distortionTuto'
import { distortionHooks, distortionPlayerPos, setState, state } from './distortionCore'
import { distortionRemoveObject } from './distortionObjects'

/** `constants/scrcmd.h`의 `LOCALID_PLAYER` — 이동 목록이 주인공을 가리키는 번호 */
const PLAYER_LOCAL_ID = 0xff

interface TutoPlay {
  run: TutoRun
  /** 솟는 그 마리. 못 세웠으면 null — 그래도 프레임과 표식은 원작대로 간다 */
  target: Movable | null
  /** 걸어 둔 이동 목록 (`MapObject_StartAnimation`). 엠라이트는 둘이다 */
  runners: MovementRunner[]
  /** 아직 안 돈 프레임 몫 (화면 주사율과 60Hz를 잇는다) */
  pending: number
}

let play: TutoPlay | null = null

/**
 * 안내를 시작한다 (`EventCmdShow*BoulderTuto_Init`).
 *
 * B5F의 그 마리를 세우고(`AddMapObjectWithLocalID`) 운다(`Sound_PlayPokemonCry`).
 * 원작의 Init은 여기서 **한 프레임을 쓴다** (`RES_CONTINUE`) — 솟기는 다음
 * 프레임부터다. 명령이 그 셋이 아니면 false
 */
export function beginBoulderTuto(kind: number): boolean {
  const spec = TUTO_SPECS[kind]
  if (spec === undefined) return false
  distortionHooks.addObject?.(spec.b5f)
  const target = npcActors.byLocalID.get(spec.b5f) ?? null
  if (target !== null) {
    target.offsetX = 0
    target.offsetY = 0
    target.offsetZ = 0
  }
  void music.playCry(spec.species)
  play = { run: newTutoRun(spec), target, runners: [], pending: 0 }
  return true
}

/** 층을 들고 날 때 버린다 */
export function resetBoulderTuto(): void {
  play = null
}

/**
 * 한 번 부를 때마다 흐른 시간만큼 프레임을 돌린다. 다 끝났으면 true.
 *
 * ⚠️ **프레임을 쪼개지 않는다.** 원작의 판정이 전부 정수 고정소수점이라
 * (`(offset >> 4) / FX32_ONE`) 반 프레임을 더하면 멈추는 자리가 달라진다.
 * 이동 목록도 한 프레임에 한 칸씩 도는 것(`MovementRunner.tick`)이라 같은
 * 시계에 묶는다
 */
export function tickBoulderTuto(dt: number): boolean {
  const p = play
  if (p === null) return true
  p.pending += dt * 60
  // 1/60을 60배 해도 1이 조금 모자랄 수 있다 — 한 프레임을 흘리지 않는다
  while (p.pending >= 1 - 1e-6) {
    p.pending -= 1
    if (frame(p)) {
      play = null
      return true
    }
  }
  return false
}

/** 한 프레임. 이동 목록이 먼저 돌고 사건이 그 끝을 본다 */
function frame(p: TutoPlay): boolean {
  for (const r of p.runners) r.tick()
  const res = tutoFrame(p.run, p.runners.every((r) => r.done))
  const t = p.target
  if (t !== null) {
    t.offsetX = p.run.offset.x / TUTO_TILE_FX
    t.offsetY = p.run.offset.y / TUTO_TILE_FX
    t.offsetZ = p.run.offset.z / TUTO_TILE_FX
  }
  if (res === 'startAnim') {
    startAnimations(p)
    return false
  }
  if (res !== 'finish') return false
  finish(p)
  return true
}

/**
 * 다 솟았다 — 이동 목록을 건다 (`MapObject_StartAnimation`).
 *
 * 엠라이트는 **주인공에게도** 건다. 어느 표인지는 주인공의 세계 z가
 * 67인지로 고른다 (`GetPlayerPos` → `playerZ == 67`)
 */
function startAnimations(p: TutoPlay): void {
  const table = distortionHooks.movements?.() ?? []
  const who = p.run.spec.who
  if (who === 'azelf') {
    if (p.target !== null) p.runners.push(new MovementRunner(p.target, steps(AZELF_ANIM, table), table))
    return
  }
  if (who !== 'mesprit') return
  const anims = mespritAnims(distortionPlayerPos().z)
  if (p.target !== null) p.runners.push(new MovementRunner(p.target, steps(anims.pokemon, table), table))
  const player = distortionHooks.mapObject?.(PLAYER_LOCAL_ID) ?? null
  if (player !== null) p.runners.push(new MovementRunner(player, steps(anims.player, table), table))
}

/** 이름으로 적은 목록을 표의 번호로 (`MOVEMENT_ACTION_*`) */
function steps(cmds: readonly TutoAnimCmd[], table: MovementTable): MovementStep[] {
  return cmds.map(([name, count]) => ({
    action: table.findIndex((a) => a?.name === name),
    count,
  }))
}

/**
 * 다 가라앉았다 (`EventCmdShow*BoulderTuto_Descend`의 끝).
 *
 * B5F의 그 마리를 지우고 표식 둘을 세운다. 원작은 이어서 B6F의 그 마리를
 * `AddMapObjectWithLocalID(B6F, …)`로 세운다 — 원작은 지금 층과 **다음 층**의
 * 물체를 같이 들고 있기 때문이다. 우리는 지금 층 것만 세운다
 * (`spawnFloorObjects`의 「다음 층 것은 안 세운다」).
 *
 * ⚠️ **`addObject(b6f)`를 여기서 부르면 안 된다.** 번호가 층마다 128에서 다시
 * 세므로 `distortionAddObject`는 **지금 층(B5F)의 표**에서 찾는다 — B6F의
 * 유크시 #132를 부르면 B5F의 아그놈 #132가 선다. 그래서 **표식이 그 일을
 * 맡는다** — B6F의 셋은 조건이 `boulderTrue *_IN_B6F`라 B6F에 들어서는 순간 선다
 */
function finish(p: TutoPlay): void {
  if (p.target !== null) {
    p.target.offsetX = 0
    p.target.offsetY = 0
    p.target.offsetZ = 0
  }
  distortionRemoveObject(p.run.spec.b5f)
  setState({ puzzleFlags: tutoFinishedFlags(state().puzzleFlags, p.run.spec) })
}
