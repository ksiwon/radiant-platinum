// 필드 태스크가 도는 동안 시작 메뉴가 안 열린다 (REPAIR §93)
//
// 원작 `HandleFieldInput`은 `FieldSystem_IsRunningTask`가 거짓일 때만 입력을 받는다. 깨어진 세계의 승강 발판·
// 판 사이 뛰기·사건(폭포 포함)이 전부 `FieldSystem_CreateTask`로 도는 필드 태스크다.
import { afterEach, describe, expect, it } from 'vitest'
import { world as mapWorld } from '../engine/map/world'
import { worldState } from '../state/worldState'
import { fieldTaskRunning } from './fieldTask'

describe('필드 태스크', () => {
  afterEach(() => {
    const p = worldState.player
    p.riding = false
    p.flying = false
    p.hop.active = false
    mapWorld.pending = null
  })

  it('아무것도 안 돌면 거짓이다', () => {
    expect(fieldTaskRunning()).toBe(false)
  })

  it('승강 발판·폭포·사건(`riding`) 중에는 참이다', () => {
    worldState.player.riding = true
    expect(fieldTaskRunning()).toBe(true)
  })

  it('공중날기 연출 · 뛰는 걸음 · 걸린 워프 중에도 참이다', () => {
    worldState.player.flying = true
    expect(fieldTaskRunning()).toBe(true)
    worldState.player.flying = false
    worldState.player.hop.active = true
    expect(fieldTaskRunning()).toBe(true)
    worldState.player.hop.active = false
    mapWorld.pending = { to: 411, matrix: 0, x: 0, z: 0, viaDoor: false }
    expect(fieldTaskRunning()).toBe(true)
  })
})
