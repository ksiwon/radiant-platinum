import { afterEach, describe, expect, it } from 'vitest'
import { world, type MapHeader } from '../engine/map/world'
import { roomFor } from './BdspRoom'
import { imageUris, openAir } from './BdspDungeon'
import { dungeonBundles, roomBundles, textureKey } from '../import/bdsp/convert'
import { writeGlb } from '../import/bdsp/glb'

const was = world.maps
afterEach(() => { world.maps = was })

const header = (id: number, name: string, matrix: number): MapHeader => ({ id, name, matrix } as unknown as MapHeader)

describe('BDSP 던전 (docs/orders/VISUAL_20260930.md §1)', () => {
  it('던전 번들은 `prefab_map` 바로 아래의 `d…`다 — 방 목록과 겹치지 않는다', () => {
    const paths = [
      'Environments/prefab_map/d27r0101', 'Environments/prefab_map/D03R0101',
      'Environments/prefab_map/c01r0101', 'Environments/prefab_map/d27r0101/x',
    ]
    expect(dungeonBundles(paths)).toEqual(['d03r0101', 'd27r0101'])
    expect(roomBundles(paths)).toEqual(['c01r0101'])
  })

  it('호수 입구는 제 이름의 던전을 쓴다 — 방과 같은 짝짓기다', () => {
    world.maps = [header(0, 'D27R0101', 101), header(1, 'D27R0102', 102)]
    expect(roomFor(0, new Set(['d27r0101', 'd27r0102']))).toBe('d27r0101')
  })

  it('그림 이름은 픽셀과 크기로 정해진다 — 같은 픽셀은 한 장, 모양이 다르면 다른 장', async () => {
    const px = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])
    expect(await textureKey(px, 2, 1)).toBe(await textureKey(px.slice(), 2, 1))
    expect(await textureKey(px, 2, 1)).not.toBe(await textureKey(px, 1, 2))
    expect(await textureKey(px, 2, 1)).toMatch(/^[0-9a-f]{20}$/)
  })

  it('glb가 가리키는 바깥 그림 주소를 읽는다 — 풀기 전에 설치본 주소로 잇는 자리다', () => {
    const glb = writeGlb({
      asset: { version: '2.0' },
      images: [{ uri: 'tex/aa.png' }, { bufferView: 0, mimeType: 'image/png' }, { uri: 'tex/bb.png' }],
    } as never, new Uint8Array(4))
    expect(imageUris(glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.byteLength) as ArrayBuffer))
      .toEqual(['tex/aa.png', 'tex/bb.png'])
  })

  it('하늘은 원작 배틀 배경이 풀밭 ~ 눈인 던전에만 선다 — 호숫가 · 숲은 트이고 동굴 · 실내는 닫힌다', () => {
    expect(openAir({ battleBg: 3 })).toBe(true) // 호수 입구 · 영원의 숲
    expect(openAir({ battleBg: 5 })).toBe(true) // 예지호수
    expect(openAir({ battleBg: 9 })).toBe(false) // 동굴
    expect(openAir({ battleBg: 7 })).toBe(false) // 실내
    expect(openAir(null)).toBe(false)
  })
})
