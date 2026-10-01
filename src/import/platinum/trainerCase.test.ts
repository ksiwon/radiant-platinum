// 트레이너 카드 그룹 (`trainerCase.ts` ↔ `tools/extract/trainerCase.js`)
//
// ⚠️ **두 굽는 쪽이 같은 픽셀을 내야 한다.** 개발 서버는 노드 쪽 산출물을 읽고 설치본은 브라우저 쪽을 읽는다 — 한쪽만 고치면
// 개발 서버에서 멀쩡한 카드가 설치본에서만 다르게 뜬다. 같은 미국 롬으로 둘을 돌려 그림은 픽셀로, 표는 바이트로 맞댄다.
//
// 그리고 **한국판 자리**를 따로 잰다. 한국판은 이 아카이브를 `/resource/kor/` 밑으로 옮겼다 — 카드 위 글자가 타일에 그려져 있어서다.
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { openNds } from './nds'
import { convertTrainerCase } from './trainerCase'
import { SUPPORTED } from './validate'
import { DATA, decodePngBytes, fileSource, romPath, withRom } from '../../data/romData.testkit'

const release = (code: string) => SUPPORTED.releases.find((r) => r.gameCode === code)!

const convert = async (locale: string, code: string) => {
  const fs = await openNds(fileSource(romPath(locale)!))
  if (!fs) throw new Error('롬을 못 열었다')
  return convertTrainerCase({ fs, locale, release: release(code) })
}

interface Index {
  card: number[]
  trainer: number[]
  badge: number[]
  text: number[][][]
}

const index = (out: Map<string, Uint8Array>): Index =>
  JSON.parse(new TextDecoder().decode(out.get('data/trainerCase/index.json')!)) as Index

withRom('en')('트레이너 카드 — 미국 롬', () => {
  it('노드 산출물과 픽셀 · 바이트가 같다', async () => {
    const out = await convert('en', 'CPUE')
    expect([...out.keys()].sort()).toEqual([
      'data/trainerCase/badges.png', 'data/trainerCase/card.png', 'data/trainerCase/case.png',
      'data/trainerCase/index.json', 'data/trainerCase/trainer.png',
    ])
    for (const [path, bytes] of out) {
      const dev = new Uint8Array(readFileSync(resolve(DATA, path.replace(/^data\//, ''))))
      if (path.endsWith('.png')) {
        const a = decodePngBytes(dev), b = decodePngBytes(bytes)
        expect([b.width, b.height], path).toEqual([a.width, a.height])
        let worst = 0
        for (let i = 0; i < a.pixels.length; i++) worst = Math.max(worst, Math.abs(a.pixels[i]! - b.pixels[i]!))
        expect(worst, path).toBe(0)
      } else {
        expect(new TextDecoder().decode(bytes), path).toBe(new TextDecoder().decode(dev))
      }
    }
  }, 60_000)

  it('카드 일곱 장 · 배지 여덟 × 때 넷 · 주인공 둘로 자른다', async () => {
    const out = await convert('en', 'CPUE')
    const meta = index(out)
    const card = decodePngBytes(out.get('data/trainerCase/card.png')!)
    expect([card.width, card.height]).toEqual([meta.card[2]! * 2, meta.card[3]! * 7])
    const badges = decodePngBytes(out.get('data/trainerCase/badges.png')!)
    expect([badges.width, badges.height]).toEqual([meta.badge[2]! * 8, meta.badge[3]! * 4])
    const trainer = decodePngBytes(out.get('data/trainerCase/trainer.png')!)
    expect([trainer.width, trainer.height]).toEqual([meta.trainer[2]! * 2, meta.trainer[3]!])
    // 주인공은 카드의 사진 칸 안에 선다 — 카드 상자 밖으로 나가면 자른 상자가 틀린 것이다
    const [cx, cy, cw, ch] = meta.card as [number, number, number, number]
    const [tx, ty, tw, th] = meta.trainer as [number, number, number, number]
    expect(tx).toBeGreaterThanOrEqual(cx)
    expect(ty).toBeGreaterThanOrEqual(cy)
    expect(tx + tw).toBeLessThanOrEqual(cx + cw)
    expect(ty + th).toBeLessThanOrEqual(cy + ch)
  }, 60_000)

  it('글자 색은 15줄 1 · 2번이다 — 블랙 카드만 노랑 위 짙은 회색이다', async () => {
    const meta = index(await convert('en', 'CPUE'))
    expect(meta.text).toHaveLength(7)
    expect(meta.text[0]).toEqual([[74, 74, 74], [165, 165, 165]])
    expect(meta.text[5]).toEqual([[255, 255, 115], [57, 57, 57]])
  }, 60_000)

  it('등급마다 별이 하나씩 켜진다 — 앞면 오른쪽 위 노란 픽셀이 등급과 함께 는다', async () => {
    const out = await convert('en', 'CPUE')
    const meta = index(out)
    const card = decodePngBytes(out.get('data/trainerCase/card.png')!)
    const [, , cw, ch] = meta.card as [number, number, number, number]
    // 별 색 (255, 255, 115)이 앞면에 몇 픽셀인가 — 노멀은 0이다
    const stars = (level: number): number => {
      let n = 0
      for (let y = 0; y < ch; y++) {
        for (let x = 0; x < cw; x++) {
          const at = ((level * ch + y) * card.width + x) * 4
          if (card.pixels[at] === 255 && card.pixels[at + 1] === 255 && card.pixels[at + 2] === 115) n++
        }
      }
      return n
    }
    const counts = [0, 1, 2, 3, 4].map(stars)
    expect(counts[0]).toBe(0)
    for (let i = 1; i < counts.length; i++) expect(counts[i]!, `등급 ${String(i)}`).toBeGreaterThan(counts[i - 1]!)
  }, 60_000)
})

withRom('en', 'ko')('트레이너 카드 — 한국 롬', () => {
  it('옮겨진 자리에서 읽고, 자른 상자는 미국판과 같고 카드 글자 타일만 다르다', async () => {
    const [en, ko] = await Promise.all([convert('en', 'CPUE'), convert('ko', 'CPUK')])
    expect(index(ko)).toEqual(index(en))
    const a = decodePngBytes(en.get('data/trainerCase/card.png')!)
    const b = decodePngBytes(ko.get('data/trainerCase/card.png')!)
    expect([b.width, b.height]).toEqual([a.width, a.height])
    expect(Buffer.from(b.pixels).equals(Buffer.from(a.pixels))).toBe(false)
  }, 60_000)
})

describe('그룹 표', () => {
  it('변환기가 붙어 있다', async () => {
    const { GROUPS } = await import('./convert')
    const g = GROUPS.find((x) => x.name === 'trainerCase')
    expect(g?.convert).toBe(convertTrainerCase)
    expect(g?.outputs).toContain('data/trainerCase/index.json')
  })
})
