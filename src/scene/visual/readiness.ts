// 대체 자산의 준비 상태 (FIRST_PERSON §4.4·§11.3)
//
// `terrainMark`가 「지형 요청이 커밋됐나」를 말한다면 이것은 「그 요청의 **대체물**이
// 몇 개 섰고 몇 개가 현행 표현으로 물러났나」를 말한다. 준비 판정은 둘을 같이 본다.
//
// ⚠️ **새 타이머를 안 만든다.** 요청 번호가 `terrainMark`의 것이고, 늦게 끝난 옛
// 요청은 여기서 버려진다 — 새 맵의 숫자를 옛 맵이 덮지 못한다.
import { tallyDecisions } from './resolve'
import type { PartDecision } from './types'

interface VisualReadiness {
  req: number
  pending: number
  ready: number
  fallback: number
  unclassified: number
  failed: number
  /** 준비 끝 — 기다릴 교체가 없다. 실패·물러남이 있어도 끝은 끝이다(따로 센다) */
  settled: boolean
}

let current: VisualReadiness = {
  req: -1, pending: 0, ready: 0, fallback: 0, unclassified: 0, failed: 0, settled: true,
}

/** 이 요청의 결정을 적는다. 더 옛 요청이면 버린다 */
export function noteVisualDecisions(req: number, decisions: readonly PartDecision[]): boolean {
  if (req < current.req) return false
  const t = tallyDecisions(decisions)
  current = { req, ...t, settled: t.pending === 0 }
  return true
}

/** 읽기만 된다 — 밖(촬영 도구)이 준비를 기다릴 때 쓴다 */
export function visualReadiness(): VisualReadiness {
  return current
}

/** 시험용 */
export function resetVisualReadiness(): void {
  current = { req: -1, pending: 0, ready: 0, fallback: 0, unclassified: 0, failed: 0, settled: true }
}
