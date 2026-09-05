// 관절 애니를 **롬 전체로** 잰다.
//
// ⚠️ **「그럴듯한 수가 나온다」로는 모자란다.** 회전행렬을 잘못 풀어도 숫자는
// 나온다 — 문짝이 조금 비틀린 채 도는 것은 눈으로 안 걸린다. 그래서 여기서
// 재는 것은 **직교성**이다: 회전이 아니면 열끼리 내적이 0이 아니게 된다.
import { expect, it, describe } from 'vitest'
import { readFileSync } from 'node:fs'
import { bytesSource, narcCount, narcEntry, openNds } from './nds'
import { romPath, withRom } from '../../data/romData.testkit'
import { readNsbca } from './nsbca'

const BM_ANIME = '/arc/bm_anime.narc'
const FLDEFF = '/data/mmodel/fldeff.narc'
const SHIP = '/arc/ship_demo.narc'

async function rom(): Promise<{ read: (p: string) => Promise<Uint8Array | null> }> {
  const fs = await openNds(bytesSource(new Uint8Array(readFileSync(romPath('en')!))))
  return { read: async (p) => (await fs!.read(p)) ?? null }
}

/** 회전행렬이 직교에서 얼마나 벗어났나 (열 길이 1 · 서로 수직 · |det| 1) */
function orthoError(m: readonly number[]): number {
  const col = (c: number): [number, number, number] => [m[c]!, m[3 + c]!, m[6 + c]!]
  const dot = (u: number[], v: number[]): number => u[0]! * v[0]! + u[1]! * v[1]! + u[2]! * v[2]!
  const x = col(0), y = col(1), z = col(2)
  const det = x[0] * (y[1] * z[2] - y[2] * z[1])
    - y[0] * (x[1] * z[2] - x[2] * z[1])
    + z[0] * (x[1] * y[2] - x[2] * y[1])
  return Math.max(
    Math.abs(dot(x, x) - 1), Math.abs(dot(y, y) - 1), Math.abs(dot(z, z) - 1),
    Math.abs(dot(x, y)), Math.abs(dot(x, z)), Math.abs(dot(y, z)),
    // 피벗은 반사(det −1)도 낸다 — 부호는 안 따진다
    Math.abs(Math.abs(det) - 1),
  )
}

withRom('en')('readNsbca — 롬 실측', () => {
  it('세 아카이브의 BCA0를 하나도 안 남기고 푼다', async () => {
    const fs = await rom()
    let files = 0, anims = 0, tracks = 0, frames = 0
    for (const path of [BM_ANIME, FLDEFF, SHIP]) {
      const narc = (await fs.read(path))!
      for (let i = 0; i < narcCount(narc)!; i++) {
        const member = narcEntry(narc, i)
        if (member === null || member.length < 4) continue
        if (String.fromCharCode(...member.subarray(0, 4)) !== 'BCA0') continue
        files += 1
        for (const anim of readNsbca(member)) {
          anims += 1
          tracks += anim.tracks.length
          frames = Math.max(frames, anim.frames)
          // 트랙이 가리키는 노드는 모델의 노드 수 안이어야 한다 (실측 최대 41)
          for (const track of anim.tracks) {
            expect(track.node, `${path}#${String(i)} ${anim.name}`).toBeLessThan(64)
            expect(track.frames).toHaveLength(anim.frames)
          }
        }
      }
    }
    // bm_anime 32 · fldeff 13 · ship_demo 4
    expect(files).toBe(49)
    expect(anims).toBeGreaterThanOrEqual(files)
    expect(tracks).toBeGreaterThan(100)
    expect(frames).toBeGreaterThan(0)
  })

  it('회전이 다 직교다 — 고정소수 한 칸 안에서', async () => {
    const fs = await rom()
    let checked = 0
    let worst = 0
    for (const path of [BM_ANIME, FLDEFF, SHIP]) {
      const narc = (await fs.read(path))!
      for (let i = 0; i < narcCount(narc)!; i++) {
        const member = narcEntry(narc, i)
        if (member === null || member.length < 4) continue
        if (String.fromCharCode(...member.subarray(0, 4)) !== 'BCA0') continue
        for (const anim of readNsbca(member)) {
          for (const track of anim.tracks) {
            for (const at of track.frames) {
              if (at.m === null) continue
              checked += 1
              worst = Math.max(worst, orthoError(at.m))
            }
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(1000)
    // ⚠️ **이것이 이 파일의 이유다.** 공개 문서대로 풀면 열에 아홉이 어긋난다.
    // 1/4096 = 0.000244이므로 자료가 담을 수 있는 만큼 정확하다는 뜻이다
    expect(worst).toBeLessThan(0.002)
  })

  it('미닫이문이 크기를 0으로 눌러 문틀로 사라진다', async () => {
    // ⚠️ **0을 「잘못 읽었다」로 보면 안 된다.** 크기 표본 1,256개 중 다섯이
    // 0인데, 그 다섯이 다 뜻이 있다 — 체육관 미닫이문(`gym_door00op`)은
    // 마지막 프레임에 두 짝의 **X를 0으로 눌러** 문틀 속으로 넣고,
    // 닫는 애니(`gym_door00cl`)는 0에서 시작해 되돌린다
    const fs = await rom()
    const narc = (await fs.read(BM_ANIME))!
    const byName = new Map<string, ReturnType<typeof readNsbca>[number]>()
    let samples = 0
    for (let i = 0; i < narcCount(narc)!; i++) {
      const member = narcEntry(narc, i)
      if (member === null || member.length < 4) continue
      if (String.fromCharCode(...member.subarray(0, 4)) !== 'BCA0') continue
      for (const anim of readNsbca(member)) {
        byName.set(anim.name, anim)
        for (const track of anim.tracks) {
          for (const at of track.frames) {
            if (at.s === null) continue
            samples += 1
            // 값이 터무니없으면 고정소수를 잘못 읽은 것이다
            for (const v of at.s) expect(Math.abs(v)).toBeLessThan(16)
          }
        }
      }
    }
    expect(samples).toBeGreaterThan(1000)

    const open = byName.get('gym_door00op')!
    const shut = byName.get('gym_door00cl')!
    expect(open.frames).toBe(10)
    // 열리는 애니는 **마지막** 프레임에 두 짝이 사라진다
    for (const track of open.tracks.filter((t) => t.node > 0)) {
      expect(track.frames[0]!.s?.[0]).toBeCloseTo(1, 3)
      expect(track.frames[open.frames - 1]!.s?.[0]).toBeCloseTo(0, 5)
    }
    // 닫히는 애니는 그 거꾸로다
    for (const track of shut.tracks.filter((t) => t.node > 0)) {
      expect(track.frames[0]!.s?.[0]).toBeCloseTo(0, 5)
      expect(track.frames[shut.frames - 1]!.s?.[0]).toBeCloseTo(1, 3)
    }
  })

})

describe('readNsbca — 꼴', () => {
  it('BCA0가 아니면 조용히 넘기지 않고 던진다', () => {
    expect(() => readNsbca(new Uint8Array(32))).toThrow('BCA0가 아니다')
  })
})
