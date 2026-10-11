import { describe, expect, it } from 'vitest'
import {
  attachCapsule, canReceiveSeal, CAPSULE_SLOTS, carrierOf, detachCapsule, emptyCapsule, hasSeals, newCapsules, placeSeal,
  removeSeal, SEALS_PER_CAPSULE, sealsOf, sealsAnywhere, sealsInUse, swapCapsules, syncCarriers, TOTAL_CAPSULES, uniqueSealsAnywhere,
  type BallSeal, type MonCapsule,
} from './ballCapsule'
import { giveOrTakeSeal, newSealCase } from './sealCase'
import { MAX_SEALS_PER_TYPE } from './sealTables'

interface Mon { name: string, capsule?: MonCapsule }

const withSeals = (n: number): number[] => {
  const s = newSealCase()
  s[0] = n
  s[4] = n
  return s
}

describe('볼캡슐', () => {
  it('열두 개이고 한 캡슐에 칸이 여덟이다', () => {
    expect(TOTAL_CAPSULES).toBe(12)
    expect(SEALS_PER_CAPSULE).toBe(8)
    expect(CAPSULE_SLOTS).toHaveLength(8)
    const all = newCapsules()
    expect(all).toHaveLength(12)
    expect(all.every((c) => c.length === 8 && !hasSeals(c))).toBe(true)
  })

  it('칸 자리는 가운데 둘레 3×3에서 가운데를 뺀 여덟 곳이다', () => {
    const keys = new Set(CAPSULE_SLOTS.map((s) => `${String(s.x)},${String(s.y)}`))
    expect(keys.size).toBe(8)
    expect(keys.has('190,70')).toBe(false)
    for (const s of CAPSULE_SLOTS) expect(Math.hypot(s.x - 190, s.y - 70)).toBeLessThan(60)
  })

  it('씰을 붙이면 케이스에서 한 장 빠지고 떼면 돌아온다', () => {
    const seals = withSeals(2)
    const put = placeSeal(seals, newCapsules(), 3, 0, 1)
    expect(put).not.toBeNull()
    expect(put!.seals[0]).toBe(1)
    expect(put!.capsules[3]![0]!.type).toBe(1)
    // 다른 캡슐은 그대로
    expect(hasSeals(put!.capsules[0]!)).toBe(false)
    const back = removeSeal(put!.seals, put!.capsules, 3, 0)
    expect(back!.seals[0]).toBe(2)
    expect(hasSeals(back!.capsules[3]!)).toBe(false)
  })

  it('케이스에 없는 씰은 못 붙이고 빈 칸은 못 뗀다', () => {
    expect(placeSeal(newSealCase(), newCapsules(), 0, 0, 1)).toBeNull()
    expect(removeSeal(withSeals(1), newCapsules(), 0, 0)).toBeNull()
    expect(placeSeal(withSeals(1), newCapsules(), 12, 0, 1)).toBeNull()
    expect(placeSeal(withSeals(1), newCapsules(), 0, 8, 1)).toBeNull()
  })

  it('이미 붙은 칸에 다른 씰을 놓으면 앞엣것이 케이스로 돌아온다', () => {
    const first = placeSeal(withSeals(1), newCapsules(), 0, 2, 1)!
    const swap = placeSeal(first.seals, first.capsules, 0, 2, 5)!
    expect(swap.seals[0]).toBe(1)
    expect(swap.seals[4]).toBe(0)
    expect(swap.capsules[0]![2]!.type).toBe(5)
  })

  it('한 종류는 케이스와 캡슐 위를 합쳐 99장까지다', () => {
    const seals = newSealCase()
    seals[0] = 90
    let caps: BallSeal[][] = newCapsules()
    const put = placeSeal(seals, caps, 0, 0, 1)!
    caps = put.capsules
    expect(sealsInUse(caps, 1)).toBe(1)
    expect(sealsAnywhere(put.seals, caps, 1)).toBe(90)
    expect(canReceiveSeal(put.seals, caps, 1, 9)).toBe(true)
    expect(canReceiveSeal(put.seals, caps, 1, 10)).toBe(false)
    // 상점 쪽 검사도 같은 수를 본다
    expect(giveOrTakeSeal(put.seals, 1, 10, sealsInUse(caps, 1)).ok).toBe(false)
    expect(giveOrTakeSeal(put.seals, 1, 9, sealsInUse(caps, 1)).ok).toBe(true)
    expect(MAX_SEALS_PER_TYPE).toBe(99)
  })

  it('가짓수는 케이스와 캡슐 위를 모두 센다 (CountUniqueSealsInSealCase)', () => {
    const seals = newSealCase()
    seals[0] = 1
    const put = placeSeal(seals, newCapsules(), 0, 0, 1)!
    // 케이스에는 이제 0장이지만 캡슐에 있으니 한 종류다
    expect(put.seals[0]).toBe(0)
    expect(uniqueSealsAnywhere(put.seals, put.capsules)).toBe(1)
    expect(uniqueSealsAnywhere(newSealCase(), newCapsules())).toBe(0)
  })

  describe('포켓몬에 달기', () => {
    const party: Mon[] = [{ name: 'a' }, { name: 'b' }]
    const caps = placeSeal(withSeals(1), newCapsules(), 1, 0, 1)!.capsules

    it('씰이 있는 캡슐만 달리고 사본이 간다', () => {
      expect(attachCapsule(party, newCapsules(), 0, 0)).toBeNull()
      const next = attachCapsule(party, caps, 1, 0)!
      expect(next[0]!.capsule!.id).toBe(2)
      expect(next[0]!.capsule!.seals[0]!.type).toBe(1)
      expect(carrierOf(next, 1)).toBe(0)
      expect(carrierOf(next, 0)).toBe(-1)
      // 원본은 안 바뀐다
      expect(party[0]!.capsule).toBeUndefined()
    })

    it('한 마리에 둘은 안 달리고 한 캡슐은 한 마리만 단다', () => {
      const next = attachCapsule(party, caps, 1, 0)!
      expect(attachCapsule(next, caps, 1, 1)).toBeNull()
      const two = placeSeal(withSeals(2), caps, 0, 0, 5)!.capsules
      expect(attachCapsule(next, two, 0, 0)).toBeNull()
    })

    it('떼면 캡슐이 비지 않고 마리에서만 사라진다', () => {
      const next = attachCapsule(party, caps, 1, 0)!
      const off = detachCapsule(next, 0)
      expect(off[0]!.capsule).toBeUndefined()
      expect(hasSeals(caps[1]!)).toBe(true)
    })

    it('캡슐을 고치면 단 마리의 사본도 새로 맞춘다', () => {
      const next = attachCapsule(party, caps, 1, 0)!
      const edited = removeSeal(withSeals(0), caps, 1, 0)!.capsules
      expect(syncCarriers(next, edited)[0]!.capsule!.seals[0]!.type).toBe(0)
    })

    it('캡슐끼리 맞바꾸면 번호가 마리를 따라 바뀐다', () => {
      const next = attachCapsule(party, caps, 1, 0)!
      const got = swapCapsules(caps, next, 1, 5)
      expect(hasSeals(got.capsules[5]!)).toBe(true)
      expect(hasSeals(got.capsules[1]!)).toBe(false)
      expect(got.party[0]!.capsule!.id).toBe(6)
      expect(got.party[0]!.capsule!.seals[0]!.type).toBe(1)
    })
  })

  it('씰이 붙은 칸만 걸러 낸다 (배틀 명부가 이것을 든다)', () => {
    const c = emptyCapsule()
    c[1] = { ...c[1]!, type: 7 }
    c[6] = { ...c[6]!, type: 80 }
    expect(sealsOf(c).map((s) => s.type)).toEqual([7, 80])
    expect(sealsOf(emptyCapsule())).toEqual([])
  })

  it('빈 캡슐은 칸 자리를 쥔다', () => {
    const c = emptyCapsule()
    expect(c.map((s) => [s.x, s.y])).toEqual(CAPSULE_SLOTS.map((s) => [s.x, s.y]))
  })
})

describe('옛 리포트', () => {
  it('캡슐 칸이 없어도 빈 캡슐 열둘로 읽힌다 (`SAVE_VERSION`을 안 올린다)', async () => {
    const { parseSave } = await import('../../state/save/schema')
    const { createNewSave } = await import('../../state/saveStore')
    const old = { ...createNewSave() } as Record<string, unknown>
    delete old.capsules
    const got = parseSave(old as never) as unknown as { capsules: BallSeal[][] }
    expect(got.capsules).toEqual(newCapsules())
  })
})
