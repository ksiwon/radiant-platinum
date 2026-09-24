// 무엇으로 다니고 있었나 (REPAIR §87 · `PlayerData.playerState`)
//
// 원작은 걷기·자전거·파도타기를 세이브에 담아 이어하기에서 그대로 세운다(`PlayerAvatar_NewLoad`).
// 재는 것: 옛 리포트는 걷기로 올라오고, 셋 밖의 값은 막히고, 지금 상태가 그 번호로 읽힌다
import { afterEach, describe, expect, it } from 'vitest'
import { MIGRATIONS } from './migrate'
import { safeParseSave } from './schema'
import { avatarState, worldState } from '../worldState'
import { createNewSave } from '../saveStore'

afterEach(() => {
  worldState.player.surfing = false
  worldState.player.cycling = false
})

describe('리포트의 주인공 상태', () => {
  it('36 → 37: 옛 리포트는 걷기(0)다 — 물 위에서 쓴 옛 리포트는 예전처럼 열린다', () => {
    const old = { version: 36, position: { map: 1, matrix: 0, x: 1, z: 2, facing: 0, y: null } }
    const up = MIGRATIONS[36]!(old as never) as { version: number; position: Record<string, unknown> }
    expect(up.version).toBe(37)
    expect(up.position).toEqual({ ...old.position, avatar: 0 })
  })

  it('걷기 0 · 자전거 1 · 파도타기 2 — 그 밖은 막는다', () => {
    const save = createNewSave()
    const at = (avatar: unknown) => ({ ...save, position: { ...save.position, avatar } })
    expect(safeParseSave(at(2)).ok).toBe(true)
    expect(safeParseSave(at(3)).ok).toBe(false)
    const without: Record<string, unknown> = { ...save.position }
    delete without.avatar
    expect(safeParseSave({ ...save, position: without }).ok).toBe(false)
  })

  it('지금 상태를 원작 번호로 읽는다', () => {
    expect(avatarState()).toBe(0)
    worldState.player.cycling = true
    expect(avatarState()).toBe(1)
    worldState.player.cycling = false
    worldState.player.surfing = true
    expect(avatarState()).toBe(2)
  })
})
