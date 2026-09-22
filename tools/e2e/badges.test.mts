// 다리들의 **표**가 롬·제품과 갈리지 않았는가 (`badges.mjs` · 지시서 §4·§5)
//
// ⚠️ **걸음을 재는 시험이 아니다.** 실제로 걸어지는가는 탐침과 `pnpm journey`가
// 잰다. 여기서 잠그는 것은 **표가 하나인가** 하나다 — 하네스가 손으로 옮겨 적은
// 좌표는 언젠가 한쪽만 고쳐지고, 그때 판은 「길이 없다」로 조용히 떨어진다
// (`two-bakers-must-match`).
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { PASTORIA_WATER } from '../../src/engine/world/pastoriaGym'
import { VEILSTONE_GYM_MAP } from '../../src/engine/world/veilstoneGym'
import { MAP, PASTORIA, pastoriaButtons, VEILSTONE } from './badges.mjs'
import { gridOf, matrixOf, missingData, npcsOf, warpsOf } from './route.mjs'

/** 자료를 아직 안 구운 기계에서는 **미실행**이다. 통과가 아니다 */
const HAVE = missingData().length === 0
const ROOT = resolve(import.meta.dirname, '../..')
const DECOMP = resolve(ROOT, 'raw/decomp/res/field/events')
/** 디컴프가 없는 기계에서는 롬 대조를 **안 돈다** — 건너뛴 것은 통과가 아니다 */
const HAVE_ROM = existsSync(DECOMP)

const romEvents = (name: string): {
  coord_events?: { script: number, x: number, z: number, width: number, length: number }[]
  object_events?: { id: string, script: number, x: number, z: number }[]
} => JSON.parse(readFileSync(resolve(DECOMP, `${name}.json`), 'utf8')) as never

describe.skipIf(!HAVE)('들판 체육관 단추', () => {
  it('구운 좌표 이벤트에서 열 자리를 읽는다', () => {
    const buttons = pastoriaButtons()
    expect(buttons).toHaveLength(10)
    // 물 높이 셋은 **제품의 값**이다. 하네스가 0·2·4를 따로 적지 않는다
    const by = (w: number) => buttons.filter((b) => b.water === w).length
    expect(by(PASTORIA_WATER.high), '파랑').toBe(2)
    expect(by(PASTORIA_WATER.middle), '초록').toBe(4)
    expect(by(PASTORIA_WATER.low), '노랑').toBe(4)
  })

  it.skipIf(!HAVE_ROM)('그 열 자리가 롬의 좌표 이벤트와 같다', () => {
    const rom = romEvents('events_pastoria_city_gym').coord_events ?? []
    /** 항목 차례: 1 `BlueButton` → 2 · 2 `GreenButton` → 3 · 3 `YellowButton` → 4 */
    const want = rom
      .filter((c) => c.script >= 2 && c.script <= 4)
      .map((c) => `${String(c.x)},${String(c.z)}@${String(c.script)}`)
      .sort()
    const script = { [PASTORIA_WATER.high]: 2, [PASTORIA_WATER.middle]: 3, [PASTORIA_WATER.low]: 4 }
    const got = pastoriaButtons()
      .map((b) => `${String(b.x)},${String(b.z)}@${String(script[b.water])}`)
      .sort()
    expect(got).toEqual(want)
    // 단추는 **한 칸짜리**다 — 넓으면 밟을 자리를 우리가 잘못 고르고 있다는 뜻이다
    for (const c of rom.filter((one) => one.script >= 2 && one.script <= 4)) {
      expect(c.width, `${String(c.x)},${String(c.z)}의 너비`).toBe(1)
      expect(c.length, `${String(c.x)},${String(c.z)}의 길이`).toBe(1)
    }
  })

  it('문 위 칸과 맥실러 아래 칸은 격자가 안 막는다 — 전제', () => {
    const g = gridOf(matrixOf(PASTORIA.map))
    expect(g.blocked(PASTORIA.door.x, PASTORIA.door.z), '문 위 칸').toBe(false)
    expect(g.blocked(PASTORIA.front.x, PASTORIA.front.z), '맥실러 아래 칸').toBe(false)
  })
})

describe.skipIf(!HAVE)('장막 체육관 자리', () => {
  it('상수가 제품의 맵 번호와 같다', () => {
    expect(VEILSTONE.map).toBe(VEILSTONE_GYM_MAP)
  })

  it('문 위 칸과 자두 아래 칸은 격자가 안 막는다 — 전제', () => {
    const g = gridOf(matrixOf(VEILSTONE.map))
    expect(g.blocked(VEILSTONE.door.x, VEILSTONE.door.z), '문 위 칸').toBe(false)
    expect(g.blocked(VEILSTONE.front.x, VEILSTONE.front.z), '자두 아래 칸').toBe(false)
  })
})

describe.skipIf(!HAVE || !HAVE_ROM)('넷째·다섯째 배지 길의 자리들', () => {
  /**
   * 맥실러는 배치표에 **체육관 문 칸**으로 적혀 있고 숨어 있다 — 좌표 이벤트가
   * 그 문을 열어 그를 꺼냈다가 다시 치운다. 이 자리가 바뀌면 §4.1 ④의 이야기가
   * 다른 곳에서 벌어진다는 뜻이다
   */
  it('장막시티의 맥실러가 체육관 문 칸에 적혀 있다', () => {
    const rom = romEvents('events_veilstone_city')
    const wake = (rom.object_events ?? []).find((o) => o.id === 'LOCALID_CRASHER_WAKE')
    const door = warpsOf(MAP.veilstone).find((w) => w.to === VEILSTONE.map)
    expect(wake, '맥실러').toBeDefined()
    expect(door, '체육관 문').toBeDefined()
    expect([wake?.x, wake?.z]).toEqual([door?.x, door?.z])
  })

  /** 동행 상대는 **스크립트 16**이다 (지시서 §4.1 ⑦ — 엔트리 차례로 셌다) */
  it('장막시티 동행 상대가 스크립트 16이다', () => {
    const rom = romEvents('events_veilstone_city')
    const one = (rom.object_events ?? []).find((o) => o.id === 'LOCALID_COUNTERPART')
    expect(one?.script).toBe(16)
    expect(npcsOf(MAP.veilstone).some((n) => n.script === 16), '구운 명부에도 있다').toBe(true)
  })

  /**
   * ⚠️ **비전머신02는 창고 바닥의 도구 볼이다** (지시서 §4.1 ⑧′).
   * 핸섬은 말만 한다 — 이 자리가 바뀌면 줍는 걸음이 빈 칸을 친다
   */
  it('비전머신02가 창고 (13,8)의 도구 볼이다', () => {
    const rom = romEvents('events_veilstone_city_galactic_warehouse')
    const ball = (rom.object_events ?? []).find((o) => o.id === 'LOCALID_ITEM_HM02')
    expect([ball?.x, ball?.z]).toEqual([13, 8])
  })

  /** 들판 체육관 문 앞의 라이벌전은 **한 칸**이다 — 정확히 그 칸을 밟아야 선다 */
  it('들판 라이벌전이 체육관 문 아래 한 칸이다', () => {
    const rom = romEvents('events_pastoria_city')
    const rival = (rom.coord_events ?? []).find((c) => c.script === 18)
    const door = warpsOf(MAP.pastoria).find((w) => w.to === PASTORIA.map)
    expect(rival?.width).toBe(1)
    expect(rival?.length).toBe(1)
    expect([rival?.x, rival?.z]).toEqual([door?.x, (door?.z ?? 0) + 1])
  })
})
