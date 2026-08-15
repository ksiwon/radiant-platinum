// 기술가르침(조각 교사) 표 (PARITY §5)
//
// ⚠️ **표는 손으로 안 적는다** — `pnpm gen:tutorMoves`가 디컴프에서 굽는다.
// 그래서 여기서 보는 것은 「값이 맞나」가 아니라 **굽는 규칙이 안 무너졌나**다:
// 자리(비트 번호)가 밀리지 않았는가, 폼이 종으로 새지 않는가, 이미 아는 기술이
// 목록에서 빠지는가.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  learnableTutorMoves, shardCostOf, tutorMovesAt, TUTOR_LOCATION, TUTOR_MOVES,
} from './tutorMoves'
import { withDecomp } from '../../data/romData.testkit'

/** `generated/species.txt`의 줄 차례 */
const SPECIES_MACHOP = 66
const SPECIES_DEOXYS = 386

/** `generated/moves.txt`의 줄 차례 */
const MOVE_FIRE_PUNCH = 7
const MOVE_ICE_PUNCH = 8
const MOVE_THUNDER_PUNCH = 9
const MOVE_VACUUM_WAVE = 410

describe('가르칠 수 있는 기술', () => {
  it('서른여덟이고 자리마다 값이 있다', () => {
    expect(TUTOR_MOVES).toHaveLength(38)
    for (const row of TUTOR_MOVES) {
      expect(row.move, `기술 ${String(row.move)}`).toBeGreaterThan(0)
      // 공짜가 하나도 없다 — 값이 다 0이면 표를 잘못 읽은 것이다
      expect(row.cost.reduce((a, b) => a + b, 0), `기술 ${String(row.move)}`).toBeGreaterThan(0)
      expect(row.at).toBeGreaterThanOrEqual(0)
      expect(row.at).toBeLessThanOrEqual(2)
    }
  })

  it('교사 셋이 나눠 가진다 — 13 · 17 · 8', () => {
    expect(tutorMovesAt(TUTOR_LOCATION.route212)).toHaveLength(13)
    expect(tutorMovesAt(TUTOR_LOCATION.survivalArea)).toHaveLength(17)
    expect(tutorMovesAt(TUTOR_LOCATION.snowpointCity)).toHaveLength(8)
    // 서로 안 겹친다 — 겹치면 같은 기술을 두 곳에서 배운다
    const all = [0, 1, 2].flatMap((at) => tutorMovesAt(at))
    expect(new Set(all).size).toBe(TUTOR_MOVES.length)
  })

  it('같은 기술이 두 줄에 없다 — 자리가 곧 비트 번호다', () => {
    expect(new Set(TUTOR_MOVES.map((r) => r.move)).size).toBe(TUTOR_MOVES.length)
  })

  it('값은 기술 번호로 찾는다. 표에 없으면 null이다', () => {
    expect(shardCostOf(MOVE_FIRE_PUNCH)).toEqual([2, 6, 0, 0])
    expect(shardCostOf(1)).toBeNull()
  })
})

describe('그 자리에서 무엇을 배우나', () => {
  it('장소로 거른다 — 212번도로의 알통몬은 펀치 셋과 진공파다', () => {
    const at = TUTOR_LOCATION.route212
    expect(learnableTutorMoves(SPECIES_MACHOP, 0, [], at)).toEqual([
      MOVE_THUNDER_PUNCH, MOVE_FIRE_PUNCH, MOVE_ICE_PUNCH, MOVE_VACUUM_WAVE,
    ])
  })

  it('⚠️ 이미 아는 기술은 빠진다 — 원작도 네 칸을 훑어 거른다', () => {
    const at = TUTOR_LOCATION.route212
    const got = learnableTutorMoves(SPECIES_MACHOP, 0, [MOVE_FIRE_PUNCH, 0, 0, 0], at)
    expect(got).not.toContain(MOVE_FIRE_PUNCH)
    expect(got).toHaveLength(3)
  })

  it('차례가 표 차례다 — 메뉴에 뜨는 차례라 뒤바뀌면 안 된다', () => {
    const at = TUTOR_LOCATION.route212
    const got = learnableTutorMoves(SPECIES_MACHOP, 0, [], at)
    const slots = got.map((m) => TUTOR_MOVES.findIndex((r) => r.move === m))
    expect(slots).toEqual([...slots].sort((a, b) => a - b))
  })

  it('⚠️ 폼이 종으로 안 샌다 — 데오키시스 넷이 서로 다르다', () => {
    const at = TUTOR_LOCATION.survivalArea
    const forms = [0, 1, 2, 3].map((f) => learnableTutorMoves(SPECIES_DEOXYS, f, [], at).join())
    // 노멀·어택·디펜스·스피드가 한 벌로 뭉치지 않는다
    expect(new Set(forms).size).toBeGreaterThan(1)
  })

  it('표에 없는 종은 아무것도 안 배운다', () => {
    expect(learnableTutorMoves(0, 0, [], TUTOR_LOCATION.route212)).toEqual([])
  })
})

// ── 롬에서 구운 표가 원본과 같은가 ──────────────────────────────────────────
//
// ⚠️ `raw/`는 리포에 안 들어간다. 있을 때만 돌린다 — 없다고 통과시키는 것이
// 아니라 **건너뛴다**.

const decomp = withDecomp('res/pokemon/move_tutors.json')

decomp('굽기 전 표와 자리·값이 같다', () => {
  it('줄 수와 값 넷이 그대로다', () => {
    const table = JSON.parse(readFileSync(
      resolve(__dirname, '../../../raw/decomp/res/pokemon/move_tutors.json'), 'utf8',
    )) as { redCost: number, blueCost: number, yellowCost: number, greenCost: number }[]
    expect(TUTOR_MOVES).toHaveLength(table.length)
    for (const [i, row] of table.entries()) {
      expect([...TUTOR_MOVES[i]!.cost], `${String(i)}번 줄`)
        .toEqual([row.redCost, row.blueCost, row.yellowCost, row.greenCost])
    }
  })
})
