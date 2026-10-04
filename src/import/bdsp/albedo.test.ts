// 알베도 색 채널 — **브라우저 쪽과 개발 추출기가 같은 표를 보는가.**
//
// ⚠️ **여기가 갈리면 배포판만 색이 틀린다.** 사람 모델은 배포물에 안 들어가고
// 사용자 브라우저가 굽는다(IMPORT.md §8). 그래서 파이썬 추출기만 고치면 개발
// 기계에서는 멀쩡한데 공개판은 옛 색 그대로다 — 실제로 엄마 얼굴의 파란 가면을
// 파이썬에서만 고친 채 배포 직전까지 갔다. `albedo.ts` 머리말이 「같은 식이어야
// 한다」고 적어 두었지만 적어 두는 것만으로는 안 지켜졌다.
//
// 그래서 파이썬 원문을 읽어서 표를 꺼내 견준다. 눈으로 맞추는 대신 시험이 센다.
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { EMPTY_ALPHA, MASK_CHANNEL_PROPS, VARIATION_CHANNEL_PROPS, bakeAlbedo, plantKind, scopedMaterial, untaggedAlpha } from './albedo'
import { openEnvironment } from './environment'
import { bdspDir, withLocal } from '../../data/romData.testkit'

const PY = 'tools/extract/bdsp_bake_albedo.py'

/**
 * 파이썬 쪽 상수를 꺼낸다. 값은 리스트 문자열이거나 **다른 상수의 이름**이다
 * (`VARIATION_CHANNEL_PROPS = MASK_CHANNEL_PROPS`)
 */
function pyConst(src: string, name: string): readonly string[] {
  const line = new RegExp(`^${name}\\s*=\\s*(.+)$`, 'm').exec(src)
  if (!line) throw new Error(`${PY}에 ${name}가 없다`)
  const value = line[1]!.trim()
  if (/^[A-Z_]+$/.test(value)) return pyConst(src, value)   // 다른 상수를 가리킨다
  const list = /\[([^\]]*)\]/.exec(value)
  if (!list) throw new Error(`${name}의 값을 못 읽었다: ${value}`)
  return list[1]!.split(',').map((s) => s.trim().replace(/^["']|["']$/g, '')).filter(Boolean)
}

describe('`_BlendMode` 없는 재질의 오려내기 (`untaggedAlpha`)', () => {
  const src = readFileSync(PY, 'utf8')
  it('문턱이 개발 추출기와 같다', () => {
    const m = /^EMPTY_ALPHA\s*=\s*([0-9.]+)/m.exec(src)
    expect(m, `${PY}에 EMPTY_ALPHA가 없다`).not.toBeNull()
    expect(Number(m![1])).toBe(EMPTY_ALPHA)
  })
  it('반투명 태그는 반투명 · 알파를 안 쓰는 불투명은 불투명 · 나머지는 오려내기', () => {
    // 사이클리스트 헬멧(알파 0.4) · 안경알
    expect(untaggedAlpha('Transparent', 0.4)).toBe('BLEND')
    // 쪽찐 할머니 옷 — 그림 알파 평균 0.023
    expect(untaggedAlpha('Opaque', 0.023)).toBe('OPAQUE')
    // 머리카락은 `Opaque`인데 가닥을 알파로 오린다
    expect(untaggedAlpha('Opaque', 0.6)).toBe('MASK')
    expect(untaggedAlpha('TransparentCutout', 0.05)).toBe('MASK')
    expect(untaggedAlpha(null, 0)).toBe('MASK')
  })
})

describe('알베도 색 채널 표', () => {
  const src = readFileSync(PY, 'utf8')

  it('_MaskTex 채널 표가 개발 추출기와 같다', () => {
    expect([...MASK_CHANNEL_PROPS]).toEqual([...pyConst(src, 'MASK_CHANNEL_PROPS')])
  })

  it('⚠️ ColorVariation 채널 표가 개발 추출기와 같다 (엄마 얼굴의 파란 가면)', () => {
    expect([...VARIATION_CHANNEL_PROPS]).toEqual([...pyConst(src, 'VARIATION_CHANNEL_PROPS')])
  })

  it('두 표는 같은 순서다 — ColorIndex 프리셋이 머티리얼 기본값과 같아야 한다', () => {
    // 인물 108명 중 ColorVariation을 가진 여섯의 40건을 대조한 결과다:
    // ch0→_SkinColor 14/14 · ch1→_PrimaryColor 19/24 · ch2→_SecondaryColor 2/2
    expect([...VARIATION_CHANNEL_PROPS]).toEqual([...MASK_CHANNEL_PROPS])
    expect(VARIATION_CHANNEL_PROPS[0]).toBe('_SkinColor')
  })
})

describe('더하는 물 (`additiveWater`)', () => {
  const src = readFileSync(PY, 'utf8')
  it('이름 규칙이 개발 추출기와 같다', () => {
    expect(/^ADDITIVE_WATER\s*=\s*"Water"/m.test(src), `${PY}에 ADDITIVE_WATER가 없다`).toBe(true)
    expect(/^ADD_SRC, ADD_DST = 5\.0, 1\.0/m.test(src)).toBe(true)
  })
})

const ARENAS = bdspDir('arenas')
const g027 = ARENAS ? join(ARENAS, 'ground', 'g027') : null
withLocal('BDSP 무대 g027', g027)('더하는 물 — 원본 번들', () => {
  it('물결 그림이 바닥을 덮지 않는다 — 더할 빛만큼의 알파로 굽는다', () => {
    const env = openEnvironment([new Uint8Array(readFileSync(g027!))])
    const pick = (additiveWater: boolean) => bakeAlbedo(env, { additiveWater }).find((m) => m.name === 'M_B_027_Water_02')!
    const alphaMax = (px: Uint8Array): number => {
      let most = 0
      for (let i = 3; i < px.length; i += 4) most = Math.max(most, px[i]!)
      return most
    }
    // 그대로 구우면 회색 물결이 알파 1로 깔린다
    expect(alphaMax(pick(false).pixels)).toBe(255)
    // `_Color` (0.104, 0.144, 0.15) 감마 → 선형 최대 0.0199 × 그림 최대 1 → 5/255
    expect(alphaMax(pick(true).pixels)).toBe(5)
    // 다른 재질은 그대로다
    const floor = (additiveWater: boolean) => bakeAlbedo(env, { additiveWater }).find((m) => m.name === 'M_CB_027_Floor_01')!.pixels
    expect(floor(true)).toEqual(floor(false))
  }, 120_000)
})

describe('나무열매 색 입히는 길 (`plantKind`)', () => {
  it('`_CASCADE_BLENDUV0`는 잎(blend) — 그림 칸과 상관없다', () => {
    expect(plantKind('_A _CASCADE_BLENDUV0 _B', 0, 0)).toBe('blend')
    expect(plantKind('_CASCADE_BLENDUV0', 3, 4)).toBe('blend')
  })
  it('`_LayerTex`가 `_MainTex`와 다른 그림이면 꽃(mask)', () => {
    expect(plantKind('', 3, 4)).toBe('mask')
  })
  it('나머지는 plain — 같은 그림이거나 한쪽이 비었을 때', () => {
    expect(plantKind('', 3, 3)).toBe('plain')
    expect(plantKind('', 3, 0)).toBe('plain')
    expect(plantKind('', 0, 4)).toBe('plain')
    // 낱말 일부만 겹치면 안 된다
    expect(plantKind('_CASCADE_BLENDUV01', 0, 0)).toBe('plain')
  })
})

describe('`재질@조각` 키 (`scopedMaterial`)', () => {
  const recolor = { 'wear@shoes2': {}, 'wear@shoes1': {}, 'hat@x': {}, wear: {} }
  it('조각 이름에 `조각`이 들어 있으면 그 키다', () => {
    expect(scopedMaterial('wear', 'body_shoes1_L', recolor)).toBe('wear@shoes1')
    expect(scopedMaterial('hat', 'xx', recolor)).toBe('hat@x')
  })
  it('둘 이상 맞으면 사전순으로 먼저인 키다', () => {
    expect(scopedMaterial('wear', 'shoes1_shoes2', recolor)).toBe('wear@shoes1')
  })
  it('안 맞거나 표가 없으면 재질 이름 그대로다 — 꼬리 없는 키는 안 본다', () => {
    expect(scopedMaterial('wear', 'body', recolor)).toBe('wear')
    expect(scopedMaterial('face', 'shoes1', recolor)).toBe('face')
    expect(scopedMaterial('wear', 'shoes1', undefined)).toBe('wear')
  })
})
