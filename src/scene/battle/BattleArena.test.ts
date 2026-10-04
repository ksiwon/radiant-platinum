// 무대 충돌은 파일마다 한 번만 짓고, 설치본을 갈아 끼우면 비운다
import { describe, expect, it } from 'vitest'
import { arenaColliderFor, clearArenaColliders } from './BattleArena'
import { setAssetProvider } from '../../data/providers/assetProvider'

/** 천장 하나(y = 6, 아랫면이 아래를 보게 감긴 삼각형 둘) */
const roof = (): number[] => [
  -3, 6, -3, 3, 6, 3, 3, 6, -3,
  -3, 6, -3, -3, 6, 3, 3, 6, 3,
]

describe('arenaColliderFor', () => {
  it('같은 파일 · 같은 반지름이면 삼각형을 다시 모으지도 짓지도 않는다', () => {
    clearArenaColliders()
    let gathered = 0
    const tris = (): number[] => { gathered++; return roof() }
    const a = arenaColliderFor('g001.glb', 12, tris)
    const b = arenaColliderFor('g001.glb', 12, tris)
    expect(b).toBe(a)
    expect(gathered).toBe(1)
  })
  it('다른 파일 · 다른 반지름은 따로 짓는다', () => {
    clearArenaColliders()
    const a = arenaColliderFor('g001.glb', 12, roof)
    expect(arenaColliderFor('g002.glb', 12, roof)).not.toBe(a)
    expect(arenaColliderFor('g001.glb', 8, roof)).not.toBe(a)
  })
  it('지은 충돌은 일을 한다 — 위로 쏜 선분이 천장에 맞는다', () => {
    clearArenaColliders()
    const room = arenaColliderFor('g001.glb', 12, roof)
    expect(room.hit([0, 3, 0], [0, 10, 0])).not.toBeNull()
    expect(room.hit([0, 3, 0], [0, 5, 0])).toBeNull()
  })
  it('설치본을 갈아 끼우면 비운다 (onProviderSwap)', () => {
    clearArenaColliders()
    const a = arenaColliderFor('g001.glb', 12, roof)
    const old = { releaseAll() { /* 시험용 */ } } as never
    setAssetProvider(old)
    setAssetProvider(null)
    expect(arenaColliderFor('g001.glb', 12, roof)).not.toBe(a)
  })
})
