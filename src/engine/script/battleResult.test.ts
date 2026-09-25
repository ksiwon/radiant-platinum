// 결과 마스크를 읽는 세 물음 (REPAIR §89)
//
// ⚠️ **「이겼나」가 「지지 않았나」다.** 원작 `CheckPlayerWonBattle`은 진 판과 비긴 판만 거짓이다.
// 이것을 거꾸로 읽으면 전설 스크립트가 잡은 판·달아난 판을 전멸 갈래로 보낸다. 표는 디컴프
// `field_battle_data_transfer.c` 512–542의 `switch` 셋을 그대로 적은 것이고, 마스크 값은 헤더에서 다시 읽는다.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  BATTLE_RESULT_CAPTURED, BATTLE_RESULT_DRAW, BATTLE_RESULT_ENEMY_FLED, BATTLE_RESULT_LOSE,
  BATTLE_RESULT_OF, BATTLE_RESULT_PLAYER_FLED, BATTLE_RESULT_WIN,
  playerDidNotCapture, playerLostBattle, playerWonBattle,
} from './battleResult'
import { withDecomp } from '../../data/romData.testkit'

/** 결과 → [이겼나, 졌나, 못 잡았나] — 원작 세 `switch`의 답 */
const TABLE: readonly [string, number, boolean, boolean, boolean][] = [
  ['WIN', BATTLE_RESULT_WIN, true, false, true],
  ['LOSE', BATTLE_RESULT_LOSE, false, true, true],
  ['DRAW', BATTLE_RESULT_DRAW, false, true, true],
  ['CAPTURED_MON', BATTLE_RESULT_CAPTURED, true, false, false],
  ['PLAYER_FLED', BATTLE_RESULT_PLAYER_FLED, true, true, true],
  ['ENEMY_FLED', BATTLE_RESULT_ENEMY_FLED, true, true, true],
]

describe('결과 마스크', () => {
  it.each(TABLE)('%s (마스크 %i)', (_name, mask, won, lost, notCaught) => {
    expect(playerWonBattle(mask)).toBe(won)
    expect(playerLostBattle(mask)).toBe(lost)
    expect(playerDidNotCapture(mask)).toBe(notCaught)
  })

  it('우리 끝맺음 다섯이 원작 마스크로 간다 — 비긴 판은 없다', () => {
    expect(BATTLE_RESULT_OF).toEqual({
      win: BATTLE_RESULT_WIN,
      loss: BATTLE_RESULT_LOSE,
      caught: BATTLE_RESULT_CAPTURED,
      fled: BATTLE_RESULT_PLAYER_FLED,
      foeFled: BATTLE_RESULT_ENEMY_FLED,
    })
    // 전멸로 빠지는 것은 진 판 하나뿐이다
    const blackOut = Object.entries(BATTLE_RESULT_OF).filter(([, m]) => !playerWonBattle(m)).map(([k]) => k)
    expect(blackOut).toEqual(['loss'])
  })
})

withDecomp('include/constants/battle.h', 'src/field_battle_data_transfer.c')('디컴프와 맞대기', () => {
  const root = resolve(__dirname, '../../../raw/decomp')

  it('마스크 값이 헤더와 같다', () => {
    const header = readFileSync(resolve(root, 'include/constants/battle.h'), 'utf8')
    const value = (name: string): number => {
      const shift = new RegExp(`#define BATTLE_RESULT_${name}\\s+\\(1 << (\\d+)\\)`).exec(header)
      if (shift) return 1 << Number(shift[1])
      const sum = new RegExp(`#define BATTLE_RESULT_${name}\\s+\\(BATTLE_RESULT_(\\w+) \\| BATTLE_RESULT_(\\w+)\\)`).exec(header)
      if (!sum) throw new Error(`BATTLE_RESULT_${name}이 헤더에 없다`)
      return value(sum[1]!) | value(sum[2]!)
    }
    for (const [name, mask] of TABLE) expect(value(name), name).toBe(mask)
  })

  it('세 물음이 원작 `switch`와 같은 갈래를 거짓으로 둔다', () => {
    const source = readFileSync(resolve(root, 'src/field_battle_data_transfer.c'), 'utf8')
    const falseCases = (fn: string): string[] => {
      const body = new RegExp(`BOOL ${fn}\\(u32 battleResult\\)\\s*\\{([\\s\\S]*?)\\n\\}`).exec(source)?.[1] ?? ''
      const head = body.split('return FALSE')[0] ?? ''
      return [...head.matchAll(/case BATTLE_RESULT_(\w+):/g)].map((m) => m[1]!).sort()
    }
    const ours = (answer: (mask: number) => boolean): string[] =>
      TABLE.filter(([, mask]) => !answer(mask)).map(([name]) => name).sort()
    expect(falseCases('CheckPlayerWonBattle')).toEqual(ours(playerWonBattle))
    expect(falseCases('CheckPlayerLostBattle')).toEqual(ours(playerLostBattle))
    expect(falseCases('CheckPlayerDidNotCaptureWildMon')).toEqual(ours(playerDidNotCapture))
  })
})
