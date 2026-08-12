// 필드 도구 사용 검증 (PARITY §4.1)
//
// **진짜 도구표 468종 위에서 잰다.** 손으로 만든 도구 몇 개로 시험하면
// "어느 갈래를 빠뜨렸는가"를 못 잡는데, 그게 바로 이 기능이 오래 비어 있던
// 이유다 — 자전거 하나만 되고 나머지 서른셋 갈래가 조용했다.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { expect, it } from 'vitest'
import { itemFileSchema, speciesFileSchema, type Item } from '../../data/schema'
import { withData } from '../../data/romData.testkit'
import {
  canLearnTm, fieldAction, FieldUse, MAP_TYPE_CAVE, repelStepsOf, tmIndex, tmMove,
  type FieldContext,
} from './fieldUse'

const DATA = resolve(__dirname, '../../../public/data')
const maybe = withData('items.json', 'species.json')

maybe('필드 도구', () => {
  const file = itemFileSchema.parse(
    JSON.parse(readFileSync(resolve(DATA, 'items.json'), 'utf8')),
  )
  const species = speciesFileSchema.parse(
    JSON.parse(readFileSync(resolve(DATA, 'species.json'), 'utf8')),
  ).species
  const byId = new Map(species.map((s) => [s.id, s]))
  const named = (constant: string): Item => {
    const it = file.items.find((x) => x.constant === constant)
    if (!it) throw new Error(`${constant}이 표에 없다`)
    return it
  }

  const town = (over: Partial<FieldContext> = {}): FieldContext => ({
    mapId: 411, mapType: 1, escapeRopeAllowed: false, repelSteps: 0, waterAhead: false, ...over,
  })

  it('회복·기술머신·진화의돌은 누구에게 쓸지 묻는다', () => {
    expect(fieldAction(named('ITEM_POTION'), town())).toEqual({ kind: 'party', use: 'heal' })
    expect(fieldAction(named('ITEM_TM01'), town())).toEqual({ kind: 'party', use: 'tmhm' })
    expect(fieldAction(named('ITEM_HM01'), town())).toEqual({ kind: 'party', use: 'tmhm' })
    expect(fieldAction(named('ITEM_FIRE_STONE'), town())).toEqual({ kind: 'party', use: 'evoStone' })
  })

  it('묻는 갈래가 정확히 148종이다 — 회복 38 · 기술머신 100 · 돌 10', () => {
    // ⚠️ 숫자를 세는 이유: 갈래를 하나 빠뜨리면 그 도구들이 조용히 "못 쓴다"가
    // 된다. 눈으로는 안 보이고 세면 보인다
    const asks = file.items.filter((it) => fieldAction(it, town()).kind === 'party')
    expect(asks).toHaveLength(148)
    const byUse = new Map<string, number>()
    for (const it of asks) {
      const got = fieldAction(it, town())
      if (got.kind !== 'party') continue
      byUse.set(got.use, (byUse.get(got.use) ?? 0) + 1)
    }
    expect([...byUse].sort()).toEqual([['evoStone', 10], ['heal', 38], ['tmhm', 100]])
  })

  it('리펠 셋만 걸음을 갖고, 그 값이 롬에서 온다', () => {
    expect(repelStepsOf(named('ITEM_REPEL'))).toBe(100)
    expect(repelStepsOf(named('ITEM_SUPER_REPEL'))).toBe(200)
    expect(repelStepsOf(named('ITEM_MAX_REPEL'))).toBe(250)
    // 같은 갈래(19)에 있지만 비드로는 걸음이 아니다
    expect(repelStepsOf(named('ITEM_BLACK_FLUTE'))).toBeNull()
    expect(repelStepsOf(named('ITEM_WHITE_FLUTE'))).toBeNull()
    const withSteps = file.items.filter((it) => repelStepsOf(it) !== null)
    expect(withSteps).toHaveLength(3)
  })

  it('리펠은 남아 있으면 새로 못 쓴다', () => {
    expect(fieldAction(named('ITEM_REPEL'), town())).toEqual({ kind: 'repel', steps: 100 })
    expect(fieldAction(named('ITEM_REPEL'), town({ repelSteps: 1 })).kind).toBe('blocked')
  })

  it('탈출로프는 **동굴이면서 허락된** 맵에서만 된다', () => {
    const rope = named('ITEM_ESCAPE_ROPE')
    expect(fieldAction(rope, town()).kind).toBe('blocked')
    expect(fieldAction(rope, town({ mapType: MAP_TYPE_CAVE })).kind).toBe('blocked')
    expect(fieldAction(rope, town({ escapeRopeAllowed: true })).kind).toBe('blocked')
    expect(fieldAction(rope, town({ mapType: MAP_TYPE_CAVE, escapeRopeAllowed: true })))
      .toEqual({ kind: 'escapeRope' })
  })

  it('낚싯대는 앞이 물이어야 던진다', () => {
    expect(fieldAction(named('ITEM_OLD_ROD'), town()).kind).toBe('blocked')
    expect(fieldAction(named('ITEM_OLD_ROD'), town({ waterAhead: true })))
      .toEqual({ kind: 'fish', rod: 'old' })
    expect(fieldAction(named('ITEM_GOOD_ROD'), town({ waterAhead: true })))
      .toEqual({ kind: 'fish', rod: 'good' })
    expect(fieldAction(named('ITEM_SUPER_ROD'), town({ waterAhead: true })))
      .toEqual({ kind: 'fish', rod: 'super' })
  })

  it('파멸의세계에서는 물이 있어도 못 낚는다', () => {
    // `CanUseFishingRod`가 헤더 열하나를 이름으로 막는다 — 573~583이다.
    // 저기 물처럼 보이는 것은 물이 아니라서, 앞이 물이어도 막혀야 한다
    const rod = named('ITEM_SUPER_ROD')
    for (const mapId of [573, 578, 583]) {
      expect(fieldAction(rod, town({ mapId, waterAhead: true })).kind, `맵 ${String(mapId)}`)
        .toBe('blocked')
    }
    // 그 앞뒤 맵은 안 막힌다 — 범위를 넓게 잡으면 멀쩡한 물가가 같이 죽는다
    for (const mapId of [572, 584]) {
      expect(fieldAction(rod, town({ mapId, waterAhead: true })).kind, `맵 ${String(mapId)}`)
        .toBe('fish')
    }
  })

  it('계통이 없는 것과 원작이 막는 것을 가른다', () => {
    // 타운맵은 **우리가 아직 안 만든 것**이지 원작이 막는 것이 아니다
    expect(fieldAction(named('ITEM_TOWN_MAP'), town())).toEqual({ kind: 'missing', what: '타운맵' })
    // 몬스터볼은 원작도 밖에서 못 쓴다 (`ITEM_USE_FUNC_NONE`)
    expect(fieldAction(named('ITEM_POKE_BALL'), town()).kind).toBe('blocked')
  })

  it('기술머신 번호가 TM01→0 · HM01→92로 이어진다', () => {
    expect(tmIndex(named('ITEM_TM01'))).toBe(0)
    expect(tmIndex(named('ITEM_TM92'))).toBe(91)
    expect(tmIndex(named('ITEM_HM01'))).toBe(92)
    expect(tmIndex(named('ITEM_HM08'))).toBe(99)
    expect(tmIndex(named('ITEM_POTION'))).toBeNull()
    // 100개가 빠짐없이 하나씩 자리를 갖는다
    const seen = new Set(file.items.map((it) => tmIndex(it)).filter((n) => n !== null))
    expect(seen.size).toBe(100)
  })

  it('기술머신이 가르치는 기술이 롬 표에서 온다', () => {
    // HM01은 풀베기(15), HM03은 파도타기(57) — 비전머신 여덟은 우리 필드 기술
    // 표(`fieldMoves.ts`)와 **같은 번호**여야 한다
    expect(tmMove(named('ITEM_HM01'), file.tmMoves)).toBe(15)
    expect(tmMove(named('ITEM_HM02'), file.tmMoves)).toBe(19)
    expect(tmMove(named('ITEM_HM03'), file.tmMoves)).toBe(57)
    expect(tmMove(named('ITEM_HM04'), file.tmMoves)).toBe(70)
    expect(tmMove(named('ITEM_HM05'), file.tmMoves)).toBe(432)
    expect(tmMove(named('ITEM_HM06'), file.tmMoves)).toBe(249)
    expect(tmMove(named('ITEM_HM07'), file.tmMoves)).toBe(127)
    expect(tmMove(named('ITEM_HM08'), file.tmMoves)).toBe(431)
    expect(new Set(file.tmMoves).size).toBe(100)
  })

  it('배울 수 있는지는 종족표의 비트가 정한다', () => {
    const turtwig = byId.get(387)!
    const magikarp = byId.get(129)!
    const arceus = byId.get(493)!
    // 모부기는 풀베기(HM01)를 배우고 구애의뽕(TM01)은 못 배운다
    expect(canLearnTm(turtwig.tm, 92)).toBe(true)
    expect(canLearnTm(turtwig.tm, 0)).toBe(false)
    // 잉어킹과 메타몽은 하나도 못 배운다 — 이건 사실이라 눈금이 된다
    const count = (bits: string): number =>
      [...Array(100).keys()].filter((i) => canLearnTm(bits, i)).length
    expect(count(magikarp.tm)).toBe(0)
    expect(count(byId.get(132)!.tm)).toBe(0)
    expect(count(arceus.tm)).toBeGreaterThan(70)
  })

  it('갈래 스물다섯이 전부 답을 갖는다 — 조용히 넘어가는 도구가 없다', () => {
    const kinds = new Set(file.items.map((it) => it.fieldUseFunc ?? FieldUse.NONE))
    for (const kind of kinds) {
      const sample = file.items.find((it) => (it.fieldUseFunc ?? 0) === kind)!
      const got = fieldAction(sample, town({
        mapType: MAP_TYPE_CAVE, escapeRopeAllowed: true, waterAhead: true,
      }))
      expect(got.kind, `갈래 ${String(kind)}`).toBeTruthy()
    }
    expect(kinds.size).toBe(25)
  })
})
