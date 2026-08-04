// 롬 추출 데이터 ↔ @pkmn/sim 4세대 데이터 전수 대조.
//
// 이 프로젝트에서 "확정"의 기준은 **독립된 두 소스가 오차 0으로 일치**하는 것이다.
// 롬 추출기와 Showdown은 서로를 전혀 모르는 두 구현이라, 종족값·타입·기술 제원이
// 전부 맞는다면 양쪽 다 맞다고 볼 수 있다.
//
// 그래서 이건 브리지 테스트인 동시에 **추출기 회귀 테스트**다. 나중에 추출 코드를
// 건드려 조용히 한 칸 밀리면 여기서 잡힌다.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, it, expect } from 'vitest'
import { gen4, simMove, simSpecies } from './bridge'

const data = (name: string) =>
  JSON.parse(readFileSync(resolve(__dirname, '../../../../public/data', name), 'utf8'))

const ourSpecies = data('species.json') as {
  count: number
  species: { id: number; stats: Record<string, number>; types: [number, number] }[]
}
const ourMoves = data('moves.json') as {
  count: number
  moves: {
    id: number; power: number; type: number; category: string
    pp: number; accuracy: number; priority: number
  }[]
}
const speciesNames = data('names/species.en.json') as string[]
const moveNames = data('names/moves.en.json') as string[]

/** 롬 타입 번호 순서. 9번 ???는 4세대에 남아 있던 미사용 타입이다 */
const TYPES = ['Normal', 'Fighting', 'Flying', 'Poison', 'Ground', 'Rock', 'Bug', 'Ghost',
  'Steel', '???', 'Fire', 'Water', 'Grass', 'Electric', 'Psychic', 'Ice', 'Dragon', 'Dark']
const CATEGORY: Record<string, string> = {
  physical: 'Physical', special: 'Special', status: 'Status',
}

/** 4세대 전국도감 493종. 그 위 번호는 폼 항목이라 대조 대상이 아니다 */
const DEX = 493

/**
 * 이름 표기 차이를 없앤다. 롬은 대문자에 성별 기호(`NIDORAN♀`)를 쓰고 sim은
 * 접미사(`Nidoran-F`)를 쓴다. 기호를 글자로 바꾼 **뒤에** 나머지를 지워야
 * 29번과 32번이 뭉개지지 않는다
 */
const norm = (s: string) =>
  s.replace(/♀/g, 'f').replace(/♂/g, 'm').replace(/[^a-z]/gi, '').toLowerCase()

describe('종족 데이터', () => {
  it('493종 전부 sim에서 찾힌다 — 폼이 아니라 기본형으로', () => {
    for (let id = 1; id <= DEX; id++) {
      const name = simSpecies(id)
      expect(name, `${id}번을 못 찾는다`).not.toBeNull()
      expect(norm(name!), `${id}번`).toBe(norm(speciesNames[id]!))
    }
  })

  it('종족값이 sim과 한 칸도 다르지 않다', () => {
    const bad: string[] = []
    for (const s of ourSpecies.species) {
      if (s.id > DEX) continue
      const ps = gen4.species.get(simSpecies(s.id)!)
      const b = ps.baseStats
      for (const k of ['hp', 'atk', 'def', 'spa', 'spd', 'spe'] as const) {
        if (b[k] !== s.stats[k]) bad.push(`${s.id} ${speciesNames[s.id]} ${k}: ${s.stats[k]} vs ${b[k]}`)
      }
    }
    expect(bad, bad.slice(0, 5).join(' / ')).toHaveLength(0)
  })

  it('타입이 sim과 일치한다', () => {
    const bad: string[] = []
    for (const s of ourSpecies.species) {
      if (s.id > DEX) continue
      const ps = gen4.species.get(simSpecies(s.id)!)
      // 롬은 단일 타입도 두 칸에 같은 값을 넣는다 — 중복을 없애야 비교가 된다
      const mine = [...new Set(s.types.map((t) => TYPES[t]!))].sort().join('/')
      if (mine !== [...ps.types].sort().join('/')) {
        bad.push(`${s.id} ${speciesNames[s.id]}: ${mine} vs ${ps.types.join('/')}`)
      }
    }
    expect(bad, bad.slice(0, 5).join(' / ')).toHaveLength(0)
  })
})

/** 이름이 비어 있는 번호는 롬의 빈 슬롯이다 (4세대 기술은 467개, 468~470은 패딩) */
const realMoves = () => ourMoves.moves.filter((m) => m.id > 0 && moveNames[m.id])

describe('기술 데이터', () => {
  it('번호로 sim 기술을 찾는다 — 이름 철자가 달라도', () => {
    // 롬은 SmellingSalt, sim은 Smelling Salts다. 이름으로 이었으면 여기서 빵꾸가 난다
    for (const m of realMoves()) {
      expect(simMove(m.id), `${m.id} ${moveNames[m.id]}`).not.toBeNull()
    }
  })

  it('한 번호에 여러 항목이 걸리면 기본형을 고른다', () => {
    // sim은 파워를 타입별로 쪼개 두고(hiddenpowerwater …) 전부 237번을 준다.
    // 지금 순회 순서로는 기본형이 먼저 나와서 "첫 항목"과 "가장 짧은 id"가 같은
    // 답을 낸다 — 변이로는 구분되지 않으니 결과를 직접 못박는다
    expect(simMove(237)).toBe('Hidden Power')
    expect(gen4.moves.get(simMove(237)!).type).toBe('Normal')
  })

  it('타입·분류·PP·명중·위력이 sim과 일치한다', () => {
    const bad: string[] = []
    for (const m of realMoves()) {
      const ps = gen4.moves.get(simMove(m.id)!)
      const label = `${m.id} ${moveNames[m.id]}`
      if (TYPES[m.type] !== ps.type) bad.push(`${label} 타입 ${TYPES[m.type]} vs ${ps.type}`)
      if (CATEGORY[m.category] !== ps.category) bad.push(`${label} 분류 ${m.category} vs ${ps.category}`)
      if (ps.pp !== m.pp) bad.push(`${label} PP ${m.pp} vs ${ps.pp}`)
      // sim은 "명중 판정 없음"을 true로 쓰고 롬은 0으로 쓴다
      const acc = ps.accuracy === true ? 0 : ps.accuracy
      if (acc !== m.accuracy) bad.push(`${label} 명중 ${m.accuracy} vs ${acc}`)
      // 위력이 다르면 반드시 "롬 1 / sim 0"이어야 한다 — 아래 테스트가 그 뜻을 못박는다
      const power = ps.basePower ?? 0
      if (power !== m.power && !(m.power === 1 && power === 0)) {
        bad.push(`${label} 위력 ${m.power} vs ${power}`)
      }
    }
    expect(bad, bad.slice(0, 5).join(' / ')).toHaveLength(0)
  })

  it('위력 1은 "이펙트가 데미지를 계산한다"는 뜻이다', () => {
    // 롬은 이 자리에 센티널 1을 넣고 sim은 0을 넣는다. 규약 차이지 불일치가 아니다.
    // 실제로 걸리는 기술이 전부 그 부류인지 확인한다 — 아니면 진짜 어긋난 것이다
    const sentinel = realMoves().filter((m) => m.power === 1)
    expect(sentinel.length, '센티널이 하나도 없다면 추출이 바뀐 것이다').toBeGreaterThan(20)
    for (const m of sentinel) {
      const ps = gen4.moves.get(simMove(m.id)!)
      expect(ps.basePower, `${m.id} ${moveNames[m.id]}는 고정 위력을 가진다`).toBe(0)
    }
  })

  it('우선도가 sim과 일치한다 — Endure 하나만 빼고', () => {
    const bad: string[] = []
    for (const m of realMoves()) {
      const ps = gen4.moves.get(simMove(m.id)!)
      if ((ps.priority ?? 0) !== m.priority) bad.push(`${m.id} ${moveNames[m.id]}: ${m.priority} vs ${ps.priority}`)
    }
    // 4세대 카트리지에서 인내는 방어·환영만들기와 같은 +3이다. sim의 4세대 mod는
    // 방어·환영만들기만 3으로 내리고 인내를 5세대 값(+4)으로 남겨 뒀다.
    // 롬이 정본이므로 우리 값을 쓰되, 목록이 늘어나면 조사해야 하니 여기 고정해 둔다
    expect(bad).toEqual(['203 Endure: 3 vs 4'])
    expect(gen4.moves.get('Protect').priority).toBe(3)
    expect(gen4.moves.get('Detect').priority).toBe(3)
  })
})
