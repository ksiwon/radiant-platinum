// 특성이 바꾼 랭크를 **sim 줄부터 글까지 이어서** 재는 자리 (PARITY §2.29).
//
// ⚠️ **세 파일이 각자 초록인 채로 가운데가 빌 수 있다.** 쇼다운은 위협의 원인을 `|-ability|…|Intimidate|boost`에만
// 싣고 뒤따르는 `-unboost`는 맨줄로 낸다. 원인을 랭크 줄로 옮기는 것은 박자(`playback`의 `announced`)이고, 그 원인을
// 한 줄로 말하는 것은 글(`messages`)이다 — 둘을 이은 것은 여기서만 보인다. 줄은 sim 0.10.11을 4세대로 돌려 받아 적은 것이다
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, it } from 'vitest'
import { DATA, withData } from '../../data/romData.testkit'
import type { Actor } from '../../engine/battle/events'
import { buildBeats } from '../../engine/battle/playback'
import { parseLine } from '../../engine/battle/sim/protocol'
import { battleText } from './messages'
import { BATTLE_BANK, MOVE_BANK, STAT_BANK } from './romText'

const BANK_AT = 'dialogue/ko/' + String(BATTLE_BANK) + '.json'

withData(BANK_AT)('특성이 바꾼 랭크는 한 줄이다', () => {
  const read = (at: string): string[] =>
    JSON.parse(readFileSync(resolve(DATA, at), 'utf8')) as string[]
  const abilities: string[] = []
  Object.assign(abilities, {
    3: '가속', 10: '축전', 22: '위협', 29: '클리어바디', 52: '괴력집게', 78: '전기엔진', 80: '불굴의마음', 83: '분노의경혈', 88: '다운로드',
  })

  const moves: string[] = []
  Object.assign(moves, { 85: '10만볼트' })

  /** sim 줄 → 화면에 뜨는 창 */
  const windows = (lines: readonly string[]): string[] => {
    const ctx = {
      names: { species: [], moves, abilities, items: [], stats: read('dialogue/ko/' + String(STAT_BANK) + '.json') },
      lines: read(BANK_AT),
      moveLines: read('dialogue/ko/' + String(MOVE_BANK) + '.json'),
      label: (a: Actor) => (a.side === 'p2' ? '상대 ' : '') + a.name,
      bare: (k: string) => k,
    }
    const events = lines.map((l) => parseLine(l)).filter((e) => e !== null)
    return buildBeats(events, (e) => battleText(e, ctx)).map((b) => b.text).filter((t) => t !== null)
  }

  it('위협 — 건 쪽 · 특성 · 받는 쪽 · 능력이 한 줄이다', () => {
    expect(windows(['|-ability|p1a: 갸라도스|Intimidate|boost', '|-unboost|p2a: 괴력몬|atk|1']))
      .toEqual(['갸라도스의 위협\n때문에 상대 괴력몬의 공격이\n떨어졌다!'])
  })

  it('더블의 위협은 맞은 쪽마다 한 줄이고, 대타 뒤의 자리는 말없이 건너뛴다', () => {
    expect(windows([
      '|-ability|p2a: 갸라도스|Intimidate|boost', '|-immune|p1a: 라이츄', '|-unboost|p1b: 괴력몬|atk|1',
    ])).toEqual(['상대 갸라도스의 위협\n때문에 괴력몬의 공격이\n떨어졌다!'])
    expect(windows([
      '|-ability|p2a: 갸라도스|Intimidate|boost', '|-unboost|p1a: 라이츄|atk|1', '|-unboost|p1b: 괴력몬|atk|1',
    ])).toHaveLength(2)
  })

  it('이미 최저인 자리는 아무 말도 없다 (`jumpBlocked`)', () => {
    expect(windows(['|-ability|p1a: 갸라도스|Intimidate|boost', '|-unboost|p2a: 괴력몬|atk|0'])).toEqual([])
  })

  it('클리어바디가 위협을 막으면 막은 쪽이 먼저인 한 줄이다', () => {
    expect(windows([
      '|-ability|p1a: 갸라도스|Intimidate|boost',
      '|-fail|p2a: 메타그로스|unboost|[from] ability: Clear Body|[of] p2a: 메타그로스',
    ])).toEqual(['상대 메타그로스의\n클리어바디 때문에\n갸라도스의 위협은\n효과가 없었다!'])
  })

  it('기술의 하락을 막은 특성은 제 줄이다 — 괴력집게는 지킨 능력을 부른다', () => {
    const clear = windows(['|-fail|p2a: 메타그로스|unboost|[from] ability: Clear Body|[of] p2a: 메타그로스'])
    expect(clear).toHaveLength(1)
    expect(clear[0]).toContain('클리어바디')
    const cutter = windows(['|-fail|p2a: 킹크랩|unboost|Attack|[from] ability: Hyper Cutter|[of] p2a: 킹크랩'])
    expect(cutter).toHaveLength(1)
    expect(cutter[0]).toContain('괴력집게')
    expect(cutter[0]).toContain('공격')
  })

  it('스스로 올린 랭크 — 다운로드 · 가속 · 불굴의마음 · 전기엔진', () => {
    expect(windows(['|-ability|p1a: 폴리곤Z|Download|boost', '|-boost|p1a: 폴리곤Z|spa|1']))
      .toEqual(['폴리곤Z는 다운로드 때문에\n특수공격이 올라갔다!'])
    expect(windows(['|-ability|p2a: 아이스크|Speed Boost|boost', '|-boost|p2a: 아이스크|spe|1']))
      .toEqual(['상대 아이스크는 가속 때문에\n스피드가 올라갔다!'])
    const steadfast = windows(['|cant|p1a: 루카리오|flinch', '|-ability|p1a: 루카리오|Steadfast|boost', '|-boost|p1a: 루카리오|spe|1'])
    expect(steadfast).toHaveLength(2)
    expect(steadfast[1]).toContain('불굴의마음')
    expect(windows(['|-ability|p1a: 에레키블|Motor Drive|boost', '|-boost|p1a: 에레키블|spe|1'])).toHaveLength(1)
  })

  it('분노의경혈은 급소 줄 뒤에 최고치 줄이 붙는다', () => {
    const lines = windows(['|-crit|p1a: 켄타로스', '|-damage|p1a: 켄타로스|41/150', '|-setboost|p1a: 켄타로스|atk|6|[from] ability: Anger Point'])
    expect(lines.at(-1)).toBe('켄타로스는 분노의경혈 때문에\n공격이\n최고치까지 올라갔다!')
  })

  it('특성이 채운 체력 · 막아 낸 기술은 특성을 부른다', () => {
    expect(windows(['|-heal|p1a: 쥬피썬더|140/140|[from] ability: Volt Absorb|[of] p2a: 라이츄']))
      .toEqual(['쥬피썬더는\n축전으로 인해 회복했다!'])
    // 다 찬 채로 받으면 막힌 기술까지 한 줄이다 — 기술은 지금 도는 것이다
    const full = windows(['|move|p2a: 라이츄|Thunderbolt|p1a: 쥬피썬더', '|-immune|p1a: 쥬피썬더|[from] ability: Volt Absorb'])
    expect(full).toHaveLength(2)
    expect(full[1]).toBe('쥬피썬더의 축전\n때문에 10만볼트는 효과가 없었다')
  })

  it('원인은 다음 기술에서 잊는다 — 그 뒤의 랭크 줄은 맨줄이다', () => {
    const lines = windows([
      '|-ability|p1a: 갸라도스|Intimidate|boost', '|-unboost|p2a: 괴력몬|atk|1',
      '|move|p2a: 괴력몬|Leer|p1a: 갸라도스', '|-unboost|p1a: 갸라도스|def|1',
    ])
    expect(lines.at(-1)).not.toContain('위협')
  })
})
