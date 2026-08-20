// 들판시티 체육관의 물을 실제로 올리고 내린다 (PARITY §7.12)
//
// 규칙은 `engine/world/pastoriaGym`이 들고 있고 여기는 **프레임**을 맡는다.
// 원작의 필드 태스크 셋(파랑·초록·주황)이 하는 일이 같아서 하나로 접었다 —
// 목표 높이가 다를 뿐이고, 오르든 내리든 걸음이 1/16칸으로 같다.
//
// ⚠️ **초록 단추만 두 갈래다.** 지금 물이 낮으면 올리고 높으면 내린다. 이미
// 가운데면 아무것도 안 하고 그대로 끝난다 (`PastoriaGym_PressGreenButton`의
// `case 1`이 셋으로 갈린다)
import {
  clearHeightPlates, setHeightPlate, setHeightPlateHeight,
} from '../engine/map/dynamicHeight'
import {
  PASTORIA_BUTTON, PASTORIA_GYM_MAP, PASTORIA_PLATE, PASTORIA_PLATE_BOX,
  PASTORIA_WATER_MODEL, PASTORIA_WATER_POS, PASTORIA_WATER_SFX, PASTORIA_WATER_STEP,
  pastoriaBlocked, pastoriaButtonOf, pastoriaWaterFor, type PastoriaButton,
} from '../engine/world/pastoriaGym'
import { MAP_FEATURE, setMapFeature } from '../engine/world/mapFeatures'

interface Active {
  /** 마지막으로 누른 단추 (`feature->pressedButton`). 리포트에 남는 값이다 */
  pressed: PastoriaButton
  /** 물바닥 소품이 지금 있는 높이(칸) */
  waterY: number
}

let active: Active | null = null
let moving: { targetY: number } | null = null

/** 소리를 내는 자리. 씬이 꽂아 준다 */
export const pastoriaSound: {
  play: ((seq: number) => void) | null
  stop: ((seq: number) => void) | null
} = { play: null, stop: null }

/**
 * 맵에 들어설 때 (`PastoriaGym_DynamicMapFeaturesInit`).
 *
 * ⚠️ **들어설 때마다 물이 낮은 데서 다시 시작한다.** 원작이 이 자리를 통째로
 * 0으로 지우는데(`PersistedMapFeatures_InitWithID`) 그 0이 주황 단추다 —
 * 나갔다 들어오면 풀던 것이 처음으로 돌아간다
 */
export function initPastoriaGym(map: number): boolean {
  if (map !== PASTORIA_GYM_MAP) return false
  setMapFeature(MAP_FEATURE.pastoriaGym)
  const pressed = PASTORIA_BUTTON.orange
  const waterY = pastoriaWaterFor(pressed)
  active = { pressed, waterY }
  moving = null
  const box = PASTORIA_PLATE_BOX
  setHeightPlate(
    PASTORIA_PLATE, box.startTileX, box.startTileZ, box.sizeX, box.sizeZ, waterY)
  return true
}

/** 지금 물 높이(칸). 이 체육관이 아니면 null */
export function pastoriaWaterHeight(): number | null {
  return active?.waterY ?? null
}

/** 마지막으로 누른 단추. 리포트에 남길 값이다 */
export function pastoriaPressed(): PastoriaButton | null {
  return active?.pressed ?? null
}

/**
 * 단추를 밟았다 (`PastoriaGym_PressButton`).
 *
 * @param model 밟은 칸에 놓인 소품 모델 번호. 단추가 아니면 아무 일도 없다
 * @returns 물이 실제로 움직이기 시작했으면 true
 */
export function pressPastoriaButton(model: number): boolean {
  if (active === null || moving !== null) return false
  const button = pastoriaButtonOf(model)
  if (button === null) return false

  active.pressed = button
  const target = pastoriaWaterFor(button)
  if (target === active.waterY) return false
  moving = { targetY: target }
  pastoriaSound.play?.(PASTORIA_WATER_SFX)
  return true
}

/** 물이 움직이는 동안은 스크립트가 기다린다 */
export function pastoriaBusy(): boolean {
  return moving !== null
}

/** 물바닥 소품이 지금 그리는 자리 */
export function pastoriaWaterProp():
{ model: number; x: number; y: number; z: number } | null {
  if (active === null) return null
  return {
    model: PASTORIA_WATER_MODEL,
    x: PASTORIA_WATER_POS.x, y: active.waterY, z: PASTORIA_WATER_POS.z,
  }
}

/**
 * 그 칸이 막혔는가 (`PastoriaGym_DynamicMapFeaturesCheckCollision`).
 *
 * `null`이면 이 체육관이 안 보는 칸이라 평소 판정으로 내려간다
 */
export function pastoriaBlockedAt(behavior: number): boolean | null {
  if (active === null) return null
  return pastoriaBlocked(behavior, active.waterY)
}

/** 한 프레임. 원작이 프레임마다 `FX32_ONE`씩 더하고 뺀다 */
export function pastoriaTick(dt: number): void {
  if (active === null || moving === null) return
  const frames = dt * 60
  const up = moving.targetY > active.waterY
  const next = active.waterY + (up ? 1 : -1) * PASTORIA_WATER_STEP * frames
  const done = up ? next >= moving.targetY : next <= moving.targetY
  active.waterY = done ? moving.targetY : next
  if (!done) return

  // 다 올라간(내려간) 뒤에야 높이판이 따라온다 — 원작의 마지막 상태다
  setHeightPlateHeight(PASTORIA_PLATE, active.waterY)
  pastoriaSound.stop?.(PASTORIA_WATER_SFX)
  moving = null
}

/** 맵을 옮기면 없어진다 */
export function resetPastoriaGym(): void {
  active = null
  moving = null
  clearHeightPlates()
}
