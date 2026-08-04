// 트레이너 개체 조립. 롬의 난이도 바이트 하나가 여섯 개체값이 되고, 기술이
// 비어 있으면 레벨업 기술로 채워진다 — 둘 다 틀리면 관장이 조용히 약해진다.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'
import { speciesFileSchema, trainerFileSchema, type Species } from '../../../data/schema'
import { natureOf, wildMoves } from '../../pokemon/instance'
import { natureEffect } from '../../pokemon/stats'
import { trainerIv, trainerMonToInstance } from './trainerParty'

const DATA = resolve(__dirname, '../../../../public/data')
const read = (p: string) => JSON.parse(readFileSync(resolve(DATA, p), 'utf8'))
const species = new Map<number, Species>(
  speciesFileSchema.parse(read('species.json')).species.map((s) => [s.id, s]),
)
const trainers = trainerFileSchema.parse(read('trainers.json')).trainers

describe('난이도 → 개체값', () => {
  it('0은 0, 255는 31이다', () => {
    expect(trainerIv(0)).toBe(0)
    expect(trainerIv(255)).toBe(31)
  })

  it('관장급 200은 24가 된다', () => {
    // 강석의 파티가 전부 200이다. 이 변환이 틀리면 관장이 잡트레이너처럼 약해진다
    expect(trainerIv(200)).toBe(24)
    expect(trainers[250]!.party.every((m) => m.ivs === 200)).toBe(true)
  })

  it('범위를 벗어난 값도 안전하다', () => {
    expect(trainerIv(-5)).toBe(0)
    expect(trainerIv(999)).toBe(31)
  })
})

describe('트레이너 개체', () => {
  const byron = trainers[250]!

  it('성격 보정을 안 받는다', () => {
    // 카트리지의 PID 유도식을 재현하지 않았다. 무작위로 두면 같은 관장이 판마다
    // 다른 능력치로 나오므로 중립으로 고정한다
    for (const [i, entry] of byron.party.entries()) {
      const mon = trainerMonToInstance(entry, species.get(entry.species)!, 250, i)
      const effect = natureEffect(natureOf(mon.pid))
      expect(effect.up, `${entry.species}`).toBeNull()
      expect(effect.down).toBeNull()
    }
  })

  it('같은 트레이너·자리면 언제나 같은 개체다', () => {
    const entry = byron.party[0]!
    const a = trainerMonToInstance(entry, species.get(entry.species)!, 250, 0)
    const b = trainerMonToInstance(entry, species.get(entry.species)!, 250, 0)
    expect(a.pid).toBe(b.pid)
    // 자리가 다르면 달라야 한다 — 안 그러면 같은 종 두 마리가 완전히 같아진다
    const c = trainerMonToInstance(entry, species.get(entry.species)!, 250, 1)
    expect(c.pid).not.toBe(a.pid)
  })

  it('지정 기술이 그대로 들어간다', () => {
    const entry = byron.party[0]!
    expect(entry.moves.length, '강석 파티는 기술이 지정돼 있다').toBeGreaterThan(0)
    const mon = trainerMonToInstance(entry, species.get(entry.species)!, 250, 0)
    expect(mon.moves.map((m) => m.move)).toEqual(entry.moves)
  })

  it('기술이 비어 있으면 그 레벨의 레벨업 기술로 채운다', () => {
    // 928명 중 676명이 이쪽이다. 빈 채로 두면 sim이 발버둥만 쓰게 된다
    const plain = trainers.find((t) => t.party.length && !t.party[0]!.moves.length)!
    const entry = plain.party[0]!
    const sp = species.get(entry.species)!
    const mon = trainerMonToInstance(entry, sp, plain.id, 0)
    expect(mon.moves.length).toBeGreaterThan(0)
    expect(mon.moves.map((m) => m.move)).toEqual(wildMoves(sp, entry.level).map((m) => m.move))
  })

  it('레벨과 경험치가 어긋나지 않는다', () => {
    // 어긋나면 배틀 중 보상이 들어오는 순간 레벨이 튄다
    for (const t of [trainers[250]!, trainers[267]!]) {
      for (const [i, entry] of t.party.entries()) {
        const sp = species.get(entry.species)!
        const mon = trainerMonToInstance(entry, sp, t.id, i)
        expect(mon.level).toBe(entry.level)
        expect(mon.exp).toBeGreaterThanOrEqual(0)
      }
    }
  })

  it('928명 전부 조립된다', () => {
    // 종족·기술 번호가 하나라도 데이터 밖이면 여기서 터진다
    let mons = 0
    for (const t of trainers) {
      for (const [i, entry] of t.party.entries()) {
        const sp = species.get(entry.species)
        expect(sp, `트레이너 #${t.id}의 종족 ${entry.species}`).toBeDefined()
        const mon = trainerMonToInstance(entry, sp!, t.id, i)
        expect(mon.moves.length, `#${t.id} ${entry.species} 기술 없음`).toBeGreaterThan(0)
        mons++
      }
    }
    expect(mons).toBe(1878)
  })
})
