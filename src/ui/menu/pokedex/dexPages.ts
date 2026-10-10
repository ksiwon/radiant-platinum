// 도감의 쪽 다섯과 열림 규칙 (`ov21_021E29DC.c:541-555`).
//
// 차례는 원작 그대로 「설명 · 분포 · 울음소리 · 크기 · 모습」이고 이름표는 롬 102~106이다. **열리지 않은 쪽은 건너뛴다** —
// 원작도 그 단추를 끈다. 규칙은 셋이다:
//
//   설명      늘 열린다 (안 본 칸이면 「?」)
//   분포      본 종부터       울음소리  본 종부터
//   크기      **잡은 종만** (`CS_CAUGHT`)
//   모습      모습이 둘 이상인 종 (`PokedexSort_CanDetectForms`)
//
// ⚠️ 모습 쪽의 「본 모습만」은 세이브가 안농 말고 모습·성별 본 기록을 안 갖고 있어 못 건다 — 있는 모습을 다 보인다 (PARITY).
import { wrapCursor } from '../useMenuKeys'

/** 쪽 열쇠. 차례가 곧 쪽 번호다 */
export const PAGE_KEYS = ['info', 'area', 'cry', 'size', 'forms'] as const
export type PageKey = (typeof PAGE_KEYS)[number]

/** 쪽 이름표의 롬 줄 — 도감 뱅크 102~106 */
export const PAGE_TEXT_FIRST = 102

export const PAGE_INFO = 0
export const PAGE_AREA = 1
export const PAGE_CRY = 2
export const PAGE_SIZE = 3
export const PAGE_FORMS = 4

/** 쪽 이름표 한 줄. 뱅크가 아직 안 왔으면 빈 글이다 */
export function pageLabel(page: number, ui: readonly string[]): string {
  return ui[PAGE_TEXT_FIRST + page] ?? ''
}

/** 열림 규칙의 입력 */
interface PageGate {
  seen: boolean
  caught: boolean
  /** 그 종이 가질 수 있는 모습 수 (`formCount`) */
  forms: number
  /** 크기 비교 표(`dexHeightWeight.json`)가 왔는가. 안 왔으면 크기 쪽을 닫는다 — 빈 쪽을 열지 않는다 */
  sized?: boolean
}

/** 지금 열린 쪽 번호들 (오름차순). 설명은 늘 들어 있다 */
export function openPages(g: PageGate): readonly number[] {
  const out = [PAGE_INFO]
  if (g.seen) out.push(PAGE_AREA, PAGE_CRY)
  if (g.caught && g.sized !== false) out.push(PAGE_SIZE)
  if (g.seen && g.forms > 1) out.push(PAGE_FORMS)
  return out
}

const ALL_PAGES: readonly number[] = PAGE_KEYS.map((_, i) => i)

/**
 * ←→ 한 번. 모습 쪽에서 모습이 여럿이면 모습을 넘기고, **끝에서 한 번 더 밀면 쪽을 넘긴다** — 안 그러면 안농 모습 쪽에
 * 들어간 뒤 ←→가 28가지 모습만 돌아 다른 쪽으로 못 나간다. 오른쪽으로 들어오면 첫 모습, 왼쪽으로 들어오면 끝 모습에
 * 선다. 모습 쪽을 떠나면 첫 모습으로 돌아간다 — 설명 쪽 그림도 그 모습이다.
 *
 * `open`은 지금 열린 쪽이다. 안 주면 다섯 쪽이 다 열린 것으로 친다. 열린 쪽이 지금 쪽 하나뿐이면 제자리다
 */
export function stepPage(
  page: number, form: number, forms: number, delta: -1 | 1, open: readonly number[] = ALL_PAGES,
): { page: number, form: number } {
  if (page === PAGE_FORMS && forms > 1) {
    const next = form + delta
    if (next >= 0 && next < forms) return { page, form: next }
  }
  const ring = open.includes(page) ? open : [...open, page].sort((a, b) => a - b)
  const here = ring.indexOf(page)
  const next = ring[wrapCursor(here, delta, ring.length)] ?? page
  return { page: next, form: next === PAGE_FORMS && delta < 0 ? Math.max(0, forms - 1) : 0 }
}

/** 종이 바뀌었을 때 지금 쪽이 아직 열려 있는가. 닫혔으면 설명으로 돌아간다 */
export function keepPage(page: number, open: readonly number[]): number {
  return open.includes(page) ? page : PAGE_INFO
}
