// 갈아 끼울 때 **버리지 않는다** (REPAIR §48)
//
// 표를 통째로 `dispose()`하면, 그 순간 아직 제출 중인 프레임이 없는 텍스처를
// 제출한다 — `Destroyed texture [Texture (unlabeled 32x32 px, …)] used in a
// submit`. 사람 판때기 356장 중 196장이 정확히 32×32라 이 자리가 임자였다.
// 옆의 같은 꼴 캐시 `battle/monSprite` · `battle/monModel`도 `clear()`만 한다.
//
// 잡는 것 둘: ① 갈아 끼워도 `dispose()`가 안 불린다 ② 그래도 표는 비워져서
// 다음에 부르면 **새 텍스처**가 온다(옛 설치본 바이트를 안 쓴다)
import { describe, it, expect, afterEach } from 'vitest'
import { setAssetProvider } from '../data/providers/assetProvider'
import { absentAssetProvider } from '../data/providers/absentAssetProvider'
import { npcTexture } from './npcTexture'

afterEach(() => { setAssetProvider(null) })

describe('공급자를 갈아 끼운다', () => {
  it('⚠️ 텍스처를 버리지 않는다 — 제출 중인 프레임이 남는다', () => {
    setAssetProvider(absentAssetProvider())
    const tex = npcTexture(7)
    let disposed = 0
    tex.addEventListener('dispose', () => { disposed += 1 })

    setAssetProvider(absentAssetProvider())
    expect(disposed).toBe(0)
  })

  it('그래도 표는 비운다 — 다음엔 새 텍스처가 온다', () => {
    setAssetProvider(absentAssetProvider())
    const first = npcTexture(8)
    expect(npcTexture(8)).toBe(first)

    setAssetProvider(absentAssetProvider())
    expect(npcTexture(8)).not.toBe(first)
  })
})
