// 날씨 한 바퀴를 **박자부터 글까지 이어서** 재는 자리.
//
// ⚠️ **두 파일이 각자 초록인 채로 가운데가 빌 수 있다.** 그치는 줄은 롬이
// 날씨마다 갈라 말하는데(「비가 그쳤다!」·「햇살이 약해졌다!」) `|-weather|none`은
// **무엇이 그쳤는지를 안 들고 온다.** 아는 쪽은 직전의 뷰뿐이라 `buildBeats`가
// 사건을 접기 전에 `ended`를 실어 준다. `playback.test.ts`는 실어 주는 것만 재고
// `messages.test.ts`는 실려 온 것만 재므로, 둘을 이은 것은 여기서만 보인다 —
// 창을 가르는 규칙이 어긋났을 때도 시험 4,429개가 전부 초록이었다.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, it } from 'vitest'
import { DATA, withData } from '../../data/romData.testkit'
import type { BattleEvent } from '../../engine/battle/events'
import { buildBeats } from '../../engine/battle/playback'
import { battleText } from './messages'
import { BATTLE_BANK, MOVE_BANK } from './romText'

const BANK_AT = 'dialogue/ko/' + String(BATTLE_BANK) + '.json'

withData(BANK_AT)('날씨 한 바퀴', () => {
  const read = (at: string): string[] =>
    JSON.parse(readFileSync(resolve(DATA, at), 'utf8')) as string[]

  /** 사건 줄기를 화면에 뜨는 창 차례로 편다 */
  const windows = (ev: readonly BattleEvent[]): (string | null)[] => {
    const ctx = {
      names: { species: [], moves: [], abilities: [], items: [], stats: [] },
      lines: read(BANK_AT),
      moveLines: read('dialogue/ko/' + String(MOVE_BANK) + '.json'),
      label: () => '모부기',
      bare: () => '모부기',
    }
    return buildBeats(ev, (e) => battleText(e, ctx)).map((b) => b.text).filter((t) => t !== null)
  }

  const start = (weather: string): BattleEvent => ({ kind: 'weather', weather, upkeep: false })
  const upkeep = (weather: string): BattleEvent => ({ kind: 'weather', weather, upkeep: true })
  const stop: BattleEvent = { kind: 'weather', weather: null, upkeep: false }
  const turn = (n: number): BattleEvent => ({ kind: 'turn', turn: n })

  it('비는 시작·유지·그침이 저마다 다른 창이다', () => {
    expect(windows([start('RainDance'), turn(1), upkeep('RainDance'), turn(2), stop]))
      .toEqual(['비가 내리기 시작했다!', '비가 계속 내리고 있다', '비가 그쳤다!'])
  })

  it('그치는 창은 그때 서 있던 날씨를 따른다', () => {
    // 날씨가 갈아 치이면 그치는 줄도 **새것**을 따라야 한다 — 뷰를 접으며
    // 읽으므로 저절로 그렇게 되지만, 틀려도 글자는 나오는 종류라 못박는다
    expect(windows([start('SunnyDay'), stop]).at(-1)).toBe('햇살이 약해졌다!')
    expect(windows([start('Sandstorm'), stop]).at(-1)).toBe('모래바람이 가라앉았다!')
    expect(windows([start('Hail'), stop]).at(-1)).toBe('싸라기눈이 그쳤다!')
    expect(windows([start('RainDance'), start('SunnyDay'), stop]).at(-1))
      .toBe('햇살이 약해졌다!')
  })

  it('선 적 없는 날씨가 그치면 아무 말도 안 한다', () => {
    // 지어낸 문장을 놓느니 비운다 — 「날씨가 원래대로 돌아왔다!」는 롬에 없다
    expect(windows([stop])).toEqual([])
  })
})
