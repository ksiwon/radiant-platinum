// 배로 건너가기 — 도는 한 벌 (`engine/world/boatCutscene` · `ScrCmd_PlayBoatCutscene` · PARITY §1.26)
//
// 차례는 엔진 쪽이 한 틱씩 돌고, 여기는 그것을 게임에 잇는다:
//
//   필드   고른 배 소품을 민다(`ChunkModels`의 `ShipDrift`가 이 값을 읽어 옮긴다) · 카메라는 주인공에서 떨어져 배와 같이
//          간다(`cameraSystem.free`) · 운하 다리 둘이 들린다(`AnimatedProp`의 `bridgeFrame`)
//   닫기   검게 6단계 · 곡을 6틱에 잦아들게 — 둘 다 끝나야 다음이다 (`Sound_IsFadeActive`)
//   건너기 배 앱 (`scene/BoatTravelStage`) — 고정 카메라 앞에서 배 모델이 90프레임 돈다
//   도착   워프(`mapWorld.pending`)가 맵을 갈고 6단계로 밝힌다(`fadeIn`) — 곡은 맵 곡으로 돌아간다
//
// 시계는 필드 틱이다(`MapStreamer`). 스크립트는 다 끝날 때까지 선다
import {
  BOAT_SE, BRIDGE_PROPS, boatFieldStart, boatFieldTick, boatTravelModel, boatTravelStart, boatTravelTick, movesOnField,
  shipHitbox, SHIP_PROP, BOAT_DIR, type BoatField, type BoatTravel,
} from '../engine/world/boatCutscene'
import { fadeDone, startFade } from '../engine/script/fade'
import { music } from '../engine/audio/music'
import { fieldBgm } from '../engine/audio/songs'
import { cameraSystem } from '../engine/actor/camera'
import { worldState } from '../state/worldState'
import { world as mapWorld, mapById } from '../engine/map/world'
import { useBoatStore } from '../state/boatStore'

const FX = 4096
const UNITS_PER_TILE = 16
/** 곡이 잦아드는 틱 (`Sound_FadeOutBGM(0, 6)`) */
const BGM_FADE = 6
/** 다리 둘의 관절 애니 길이 (`bm_anime` 39 · 40 — `data/props/anims.json`) */
const BRIDGE_FRAMES = 130

interface Dest { to: number, x: number, z: number, facing: number }

export const boatLive: {
  phase: 'off' | 'field' | 'closing' | 'travel' | 'arrive'
  field: BoatField | null
  travel: BoatTravel | null
  /** 건너기 앱이 도는 모델 (`data/demo`) */
  model: string | null
  /** 민 배 소품 (`ShipDrift`의 열쇠) · 필드 틱 · 다리가 들리기 시작한 틱 · 닫기에 들어선 틱 */
  shipKey: string | null
  ticks: number
  bridgeAt: number | null
  closingAt: number
  /** 카메라가 따라가는 처음 자리 (월드) */
  from: { x: number, z: number }
  dest: Dest | null
  /** 배 앱 모델의 애니 프레임 수 — 무대가 모델을 받으면 적는다 */
  counts: readonly number[] | null
  acc: number
} = {
  phase: 'off', field: null, travel: null, model: null, shipKey: null, ticks: 0, bridgeAt: null, closingAt: 0,
  from: { x: 0, z: 0 }, dest: null, counts: null, acc: 0,
}

/** 필드에 선 배 소품 — `ShipDrift`가 올린다 (열쇠 → 모델 · 월드 자리) */
export const shipProps = new Map<string, { model: number, x: number, z: number }>()

/** 이 소품이 지금 밀린 만큼 (칸) — 안 밀리면 null */
export function shipOffset(key: string): [number, number] | null {
  const f = boatLive.field
  if (boatLive.shipKey !== key || f === null || boatLive.phase === 'off') return null
  return [f.boat[0] / FX / UNITS_PER_TILE, f.boat[1] / FX / UNITS_PER_TILE]
}

/** 운하 다리의 이 틱 프레임 — 안 들리는 중이면 null (애니를 내린 자세) */
export function bridgeFrame(model: number): number | null {
  if (!(BRIDGE_PROPS as readonly number[]).includes(model) || boatLive.bridgeAt === null || boatLive.phase === 'off') return null
  return Math.min(BRIDGE_FRAMES - 1, boatLive.ticks - boatLive.bridgeAt)
}

/**
 * 미는 배를 고른다 (`FieldSystem_FindCollidingLoadedMapPropByModelID`) — 주인공 칸 옆 네모(`shipHitbox`)에 드는 그 모델.
 * 소품의 놓인 점으로 잰다 — 원작은 소품의 충돌 상자와 겹치는지를 본다. 드는 것이 없으면 네모 가운데에 가장 가까운 것
 */
function pickShip(dir: number): string | null {
  const box = shipHitbox(dir)
  if (!box) return null
  const model = dir === BOAT_DIR.northToSouth ? SHIP_PROP.canalave : SHIP_PROP.snowpoint
  const px = Math.floor(worldState.player.position.x), pz = Math.floor(worldState.player.position.z)
  const cx = px + box[0] + box[2] / 2, cz = pz + box[1] + box[3] / 2
  let best: string | null = null, bestD = Infinity
  for (const [key, p] of shipProps) {
    if (p.model !== model) continue
    const d = Math.hypot(p.x - cx, p.z - cz)
    if (d < bestD) { bestD = d; best = key }
  }
  return best
}

/** 세운다 (`FieldSystem_PlayBoatCutscene`) */
export function startBoatCutscene(dir: number, dest: Dest): void {
  const field = boatFieldStart(dir)
  boatLive.field = field
  boatLive.travel = null
  boatLive.model = boatTravelModel(dir)
  boatLive.ticks = 0
  boatLive.bridgeAt = null
  boatLive.dest = dest
  boatLive.counts = null
  boatLive.acc = 0
  boatLive.from = { x: worldState.player.position.x, z: worldState.player.position.z }
  boatLive.shipKey = movesOnField(dir) ? pickShip(dir) : null
  boatLive.phase = 'field'
  if (movesOnField(dir)) {
    cameraSystem.free = { ...boatLive.from }
    // 운하만 떠날 때 소리가 난다 (`SEQ_SE_DP_SHIP02` — 다리를 싣는 갈래)
    if (field.bridgeAt !== null) void music.playEffect(BOAT_SE.depart)
  }
  useBoatStore.getState().start()
}

function finish(): void {
  boatLive.phase = 'off'
  boatLive.field = null
  boatLive.travel = null
  boatLive.shipKey = null
  boatLive.bridgeAt = null
  cameraSystem.free = null
  useBoatStore.getState().finish()
}

/** 배 앱의 모델을 받았다 — 무대가 모델 머리의 프레임 수를 넘긴다 (`BoatTravelStage`). 앱은 닫기가 끝난 틱에 선다 */
export function boatTravelReady(counts: readonly number[]): void {
  boatLive.counts = counts
}

/** 필드 틱 */
export function boatFrameTick(dt: number): void {
  if (boatLive.phase === 'off') return
  boatLive.acc += Math.min(dt, 0.25) * 60
  let ticks = Math.floor(boatLive.acc)
  boatLive.acc -= ticks
  while (ticks-- > 0) tick()
}

function tick(): void {
  boatLive.ticks++
  const f = boatLive.field
  if (boatLive.phase === 'field' && f) {
    const bridgeDone = boatLive.bridgeAt !== null && boatLive.ticks - boatLive.bridgeAt >= BRIDGE_FRAMES
    for (const ev of boatFieldTick(f, bridgeDone)) {
      if (ev === 'bridge') { boatLive.bridgeAt = boatLive.ticks; void music.playEffect(BOAT_SE.bridge) }
      else {
        startFade(6, 1, 0, 0)
        music.fadeVolume(0, BGM_FADE)
        boatLive.phase = 'closing'
        boatLive.closingAt = boatLive.ticks
      }
    }
    if (movesOnField(f.dir)) {
      cameraSystem.free = {
        x: boatLive.from.x + f.camera[0] / FX / UNITS_PER_TILE,
        z: boatLive.from.z + f.camera[1] / FX / UNITS_PER_TILE,
      }
    }
    return
  }
  if (boatLive.phase === 'closing') {
    if (!fadeDone() || boatLive.ticks - boatLive.closingAt < BGM_FADE) return
    // `FieldTransition_FinishMap` → 배 앱 — 필드의 배와 카메라는 여기서 놓는다
    boatLive.shipKey = null
    boatLive.bridgeAt = null
    cameraSystem.free = null
    boatLive.phase = 'travel'
    return
  }
  if (boatLive.phase === 'travel') {
    if (!boatLive.travel) {
      if (boatLive.counts === null) return
      boatLive.travel = boatTravelStart(boatLive.counts)
      // `App_StartScreenFade(FALSE)` — 6단계로 밝힌다
      startFade(6, 1, 1, 0)
      // 세우는 틱(`Init`)과 첫 차례(`Main`)는 다른 틱이다
      return
    }
    const t = boatLive.travel
    for (const ev of boatTravelTick(t, fadeDone())) {
      if (ev === 'se') void music.playEffect(BOAT_SE.travel)
      else if (ev === 'fadeOut') startFade(6, 1, 0, 0)
      else arrive()
    }
    return
  }
  if (boatLive.phase === 'arrive' && mapWorld.pending === null && fadeDone()) finish()
}

/** `FieldTask_ChangeMapToLocation` · `FieldBGM_PlayForMapHeader` · `FieldTransition_StartMapAndFadeIn` */
function arrive(): void {
  const d = boatLive.dest
  const target = d ? mapById(d.to) : null
  boatLive.phase = 'arrive'
  // 곡은 맵 곡으로 — 가로챘던 것을 놓고 소리를 되살린다
  fieldBgm.override = null
  music.fadeVolume(127, 1)
  if (!d || !target) { finish(); return }
  mapWorld.pending = { to: d.to, matrix: target.matrix, x: d.x + 0.5, z: d.z + 0.5, viaDoor: false, facing: d.facing, silent: true, fadeIn: true }
}
