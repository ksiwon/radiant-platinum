// 워프가 자전거와 파도타기를 내린다 — 층 가기는 안 내린다 (REPAIR §92)
//
// 원작 `FieldSystem_InitFlagsWarp`(`field_map_change_flags.c` 90–94): 자전거는 도착 맵의 `isBikeAllowed`가
// 0일 때만, 파도타기는 늘 걷기로 돌아간다. 깨어진 세계의 승강 발판·폭포는 `FieldMap_ChangeZoneDistortionWorld`
// → `UpdateGameDataDistortionWorld(…, TRUE)`라 이 줄을 안 지난다 — B4F 천장 물에서 B5F 웅덩이로 파도타기가 이어진다.
import 'fake-indexeddb/auto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { avatarAfterWarp } from '../engine/map/warpAvatar'
import { world as mapWorld, type MapHeader, type PendingWarp } from '../engine/map/world'
import { installNodeAssets, withData } from '../data/romData.testkit'
import { worldState } from '../state/worldState'
import { distortionPreload } from './distortionCore'
import { isDistortionFloorChange, settleAvatarForWarp } from './warpArrival'

describe('워프 뒤의 탈것 (`FieldSystem_InitFlagsWarp`)', () => {
  it('자전거는 도착 맵이 막을 때만 내린다', () => {
    expect(avatarAfterWarp({ surfing: false, cycling: true }, false)).toEqual({ surfing: false, cycling: false })
    expect(avatarAfterWarp({ surfing: false, cycling: true }, true)).toEqual({ surfing: false, cycling: true })
  })

  it('파도타기는 도착 맵과 상관없이 풀린다', () => {
    expect(avatarAfterWarp({ surfing: true, cycling: false }, true)).toEqual({ surfing: false, cycling: false })
    expect(avatarAfterWarp({ surfing: true, cycling: false }, false)).toEqual({ surfing: false, cycling: false })
  })

  it('걷고 있으면 그대로다', () => {
    const walking = { surfing: false, cycling: false }
    expect(avatarAfterWarp(walking, false)).toBe(walking)
  })
})

const DATA = resolve(__dirname, '../../public/data')
const read = (p: string): unknown => JSON.parse(readFileSync(resolve(DATA, p), 'utf8'))

withData('maps.json', 'distortion.json')('깨어진 세계와 워프', () => {
  const maps = (read('maps.json') as { maps: MapHeader[] }).maps
  let restore: (() => void) | null = null
  beforeAll(async () => {
    restore = installNodeAssets()
    mapWorld.maps = maps
    await distortionPreload()
  })
  afterAll(() => { restore?.() })
  beforeEach(() => {
    worldState.player.surfing = false
    worldState.player.cycling = false
  })

  const warp = (to: number, extra: Partial<PendingWarp> = {}): PendingWarp =>
    ({ to, matrix: 0, x: 0, z: 0, viaDoor: false, ...extra })

  it('B4F → B5F(폭포 · 이웃 층)는 층 가기다 — 파도타기가 이어진다', () => {
    expect(isDistortionFloorChange(577, warp(579, { silent: true, y: 1 }))).toBe(true)
    worldState.player.surfing = true
    settleAvatarForWarp(577, warp(579, { silent: true, y: 1 }))
    expect(worldState.player.surfing).toBe(true)
  })

  it('스크립트 `Warp`는 깨어진 세계 안이라도 워프다 — B7F → 기라티나 방', () => {
    expect(isDistortionFloorChange(581, warp(582, { romWorld: true }))).toBe(false)
  })

  it('⚠️ 귀혼동굴(자전거 됨) → 깨어진 세계 방(자전거 안 됨)이면 내린다', () => {
    expect(maps[270]!.bike).toBe(1)
    expect(maps[583]!.bike).toBe(0)
    worldState.player.cycling = true
    settleAvatarForWarp(270, warp(583, { romWorld: true }))
    expect(worldState.player.cycling).toBe(false)
  })

  it('물 위에서 문으로 들어가면 걷기로 선다', () => {
    worldState.player.surfing = true
    settleAvatarForWarp(411, warp(414))
    expect(worldState.player.surfing).toBe(false)
  })
})
