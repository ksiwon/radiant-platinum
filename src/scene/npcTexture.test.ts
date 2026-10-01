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
import { LinearFilter, LinearMipmapLinearFilter, NearestFilter } from 'three'
import { npcTexture, npcTextureSmooth } from './npcTexture'

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

describe('매끈한 쌍 (`npcTextureSmooth`)', () => {
  it('선형 필터에 밉맵이고 도트 텍스처는 그대로 또렷하다', () => {
    setAssetProvider(absentAssetProvider())
    const sharp = npcTexture(4100)
    const smooth = npcTextureSmooth(4100)
    expect(smooth).not.toBe(sharp)
    expect([smooth.magFilter, smooth.minFilter, smooth.generateMipmaps]).toEqual([LinearFilter, LinearMipmapLinearFilter, true])
    expect([sharp.magFilter, sharp.minFilter, sharp.generateMipmaps]).toEqual([NearestFilter, NearestFilter, false])
    // 다시 부르면 같은 것이다 — 프레임마다 새로 안 만든다
    expect(npcTextureSmooth(4100)).toBe(smooth)
  })

  it('그림은 도트 텍스처와 같이 쥔다 — 따로 받지 않는다', () => {
    setAssetProvider(absentAssetProvider())
    const sharp = npcTexture(4101)
    const smooth = npcTextureSmooth(4101)
    expect(smooth.source).toBe(sharp.source)
    expect(smooth.colorSpace).toBe(sharp.colorSpace)
    // 이름도 GPU 라벨이라 임자를 짚을 수 있게 붙인다
    expect(smooth.name).toBe('npc 4101 smooth')
  })

  it('그림이 이미 와 있으면 바로 올리고, 아직이면 기다린다', () => {
    setAssetProvider(absentAssetProvider())
    expect(npcTextureSmooth(4102).version).toBe(0)
    const sharp = npcTexture(4103)
    sharp.image = { width: 32, height: 32 } as unknown as typeof sharp.image
    expect(npcTextureSmooth(4103).version).toBeGreaterThan(0)
  })

  it('공급자를 갈아 끼우면 쌍도 새로 온다', () => {
    setAssetProvider(absentAssetProvider())
    const first = npcTextureSmooth(4104)
    setAssetProvider(absentAssetProvider())
    expect(npcTextureSmooth(4104)).not.toBe(first)
    expect(npcTextureSmooth(4104).source).toBe(npcTexture(4104).source)
  })
})
