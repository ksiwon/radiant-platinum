// 문서에 적는 표식 (`sceneMark.ts`)
//
// ⚠️ **표식이 틀리면 자동 검사가 조용히 거짓말을 한다.** 실제로 그랬다 —
// 서 있는 칸을 `round`로 적는 바람에 한 칸씩 위로 어긋났고, 밖에서 보면
// 주인공이 **벽 안에 서 있는** 좌표가 나왔다. 그 좌표로 길을 내니 첫 걸음부터
// 막혀서 "게임이 얼었다"고 읽었다. 얼지 않았고, 표식이 틀렸다.
import { describe, expect, it, beforeEach, vi } from 'vitest'
import { markMap, markMenu, markScene, markScript, markTalk, markTile } from './sceneMark'

/**
 * `<html>` 하나짜리 문서.
 *
 * 시험 환경이 노드라 `document`가 없다. jsdom을 들이는 대신 이 모듈이 실제로
 * 만지는 것 하나(`documentElement.dataset`)만 세운다 — 재려는 것이 DOM이
 * 아니라 **무슨 값을 적는가**이기 때문이다
 */
const dataset: Record<string, string> = {}
vi.stubGlobal('document', { documentElement: { dataset } })

const data = (): Record<string, string> => dataset

describe('표식', () => {
  beforeEach(() => {
    for (const key of Object.keys(dataset)) delete dataset[key]
  })

  it('서 있는 칸은 격자와 같은 셈법이다 — 칸 가운데에 서도 그 칸이다', () => {
    // 주인공은 늘 `칸 + 0.5`에 선다 (`field.ts`의 `playerMovable`). 격자는
    // `floor`로 묻는다 (`map/grid.ts`의 `isBlockedAtWorld`)
    markTile(8.5, 4.5)
    expect(data().tile).toBe('8,4')
    markTile(8.99, 4.01)
    expect(data().tile).toBe('8,4')
  })

  it('음수 칸에서도 격자와 같다 — `round`는 여기서 0 쪽으로 당긴다', () => {
    markTile(-0.5, -3.5)
    expect(data().tile).toBe('-1,-4')
  })

  it('맵 번호는 음수면 지운다 — 타이틀에는 맵이 없다', () => {
    markMap(411)
    expect(data().map).toBe('411')
    markMap(-1)
    expect(data().map).toBeUndefined()
  })

  it('대사창과 스크립트는 따로 적는다 — 대사 없이 도는 스크립트가 있다', () => {
    markScript(true)
    markTalk(false)
    expect(data().script).toBe('1')
    expect(data().talk).toBeUndefined()
  })

  it('장면과 메뉴는 겹쳐 적는다 — 메뉴 위에 무엇이 떴는지가 남아야 한다', () => {
    markScene('menu')
    markMenu('bag')
    expect(data().scene).toBe('menu')
    expect(data().menu).toBe('bag')
    markMenu(null)
    expect(data().menu).toBeUndefined()
  })
})
