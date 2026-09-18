// 조각마다 표현을 **한 번** 정한다 (FIRST_PERSON §4.3·§4.5)
//
//     resolveParts → (대체물 준비) → markReady/markFailed → planOf
//
// ⚠️ **같은 삼각형을 둘이 맡으면 설정 오류다.** 먼저 온 쪽이 이기게 하지 않는다 —
// 둘 다 `fallback`으로 돌리고 까닭을 남긴다.
//
// ⚠️ **준비 전에는 안 지운다.** `pending`인 교체는 `removeOffsets`가 비어 있다.
// 기존 변환만 막고(`suppress`) 원본은 남아 있어서, 대체물이 늦거나 실패해도
// 빈자리가 안 생긴다.
import { footprintWithin, leanDegrees, uvFootprint } from './sourceParts'
import type {
  PartDecision, ResolvedVisualPlan, SourcePart, SourceSelector, VisualRecipe,
} from './types'

/** 어느 레시피까지 쓰나. 개발 비교(`candidate`)에서만 초안을 켠다 (§4.6) */
export type RecipeMode = 'legacy' | 'verified' | 'candidate'

export interface ResolveContext {
  mode: RecipeMode
  /** 그 조각의 그림 칸 크기. 그림이 없으면 null */
  itemSize: (part: SourcePart) => { w: number, h: number } | null
  /** 그 조각 그림의 한 사각형 지문 (`regionDigest`). 그림이 없으면 null */
  regionHash: (part: SourcePart, rect: readonly [number, number, number, number]) => string | null
}

/** 이 선택자가 조각에 맞나 — 지문은 따로 본다 */
function shapeMatches(sel: SourceSelector, part: SourcePart, ctx: ResolveContext): boolean {
  if (sel.kind !== undefined && sel.kind !== part.source.kind) return false
  if (sel.tex !== part.source.tex) return false
  if (sel.pal !== undefined && sel.pal !== part.source.pal) return false
  const size = ctx.itemSize(part)
  if (size === null) return false
  const fp = uvFootprint(part.uvBounds, part.source.rep, size.w, size.h)
  if (!footprintWithin(fp, sel.within)) return false
  if (sel.leanDeg !== undefined) {
    const lean = leanDegrees(part.normal)
    if (lean < sel.leanDeg[0] || lean > sel.leanDeg[1]) return false
  }
  return true
}

const decision = (
  part: SourcePart, patch: Partial<PartDecision> & Pick<PartDecision, 'status'>,
): PartDecision => ({
  componentId: part.componentId,
  group: part.group,
  outcome: 'keep',
  recipeId: null,
  removeOffsets: [],
  claimOffsets: [],
  keepStanding: false,
  reason: null,
  ...patch,
})

/**
 * 조각마다 결정 하나.
 *
 * - 맞는 레시피가 없다 → `unclassified` (현행 표현)
 * - 모양은 맞는데 지문이 다르다 → `fallback` (검수한 그 그림이 아니다)
 * - 초안인데 `candidate`가 아니다 → `fallback`
 * - 둘 이상이 맞는다 → `fallback` · 충돌
 * - `keep`·`augment` → `ready` (지울 것이 없으니 기다릴 것도 없다)
 * - `replace` → `pending` (대체물을 기다린다)
 */
export function resolveParts(
  parts: readonly SourcePart[], recipes: readonly VisualRecipe[], ctx: ResolveContext,
): PartDecision[] {
  if (ctx.mode === 'legacy') return parts.map((p) => decision(p, { status: 'unclassified', reason: 'legacy 모드' }))
  return parts.map((part) => {
    const shaped = recipes.filter((r) => r.selectors.some((s) => shapeMatches(s, part, ctx)))
    if (shaped.length === 0) return decision(part, { status: 'unclassified' })
    const exact = shaped.filter((r) => r.selectors.some((s) => shapeMatches(s, part, ctx)
      && s.regionHashes.includes(ctx.regionHash(part, s.within) ?? '')))
    if (exact.length === 0) {
      const sel = shaped[0]!.selectors.find((s) => shapeMatches(s, part, ctx))!
      return decision(part, {
        status: 'fallback', recipeId: shaped[0]!.id,
        reason: `지문 불일치 (${String(ctx.regionHash(part, sel.within))})`,
      })
    }
    const usable = exact.filter((r) => r.review === 'verified' || ctx.mode === 'candidate')
    if (usable.length === 0) {
      return decision(part, { status: 'fallback', recipeId: exact[0]!.id, reason: '초안 레시피' })
    }
    if (usable.length > 1) {
      return decision(part, {
        status: 'fallback',
        reason: `레시피 충돌: ${usable.map((r) => r.id).join(', ')}`,
      })
    }
    const recipe = usable[0]!
    return decision(part, {
      outcome: recipe.outcome,
      recipeId: recipe.id,
      claimOffsets: part.triangleOffsets,
      // 새 모델을 안 만드는 `keep`은 **원래대로 세운다** — 덩이만 막는다
      keepStanding: recipe.geometry === 'original' && recipe.outcome === 'keep',
      status: recipe.outcome === 'replace' ? 'pending' : 'ready',
    })
  })
}

/**
 * 삼각형 하나를 둘이 맡았는지 본다. 맡은 쪽을 **전부** `fallback`으로 돌린다.
 *
 * 조각은 서브메시 안에서 서로 안 겹치게 만들어지므로 보통 0건이다 — 여러
 * 출처(청크 조각 + 따로 만든 패치)의 결정을 합칠 때 잡힌다
 */
export function rejectDoubleClaims(decisions: readonly PartDecision[]): PartDecision[] {
  const owners = new Map<number, number[]>()
  decisions.forEach((d, i) => {
    for (const o of d.claimOffsets) {
      const list = owners.get(o)
      if (list) list.push(i)
      else owners.set(o, [i])
    }
  })
  const bad = new Set<number>()
  for (const list of owners.values()) if (list.length > 1) for (const i of list) bad.add(i)
  return decisions.map((d, i) => (bad.has(i)
    ? {
      ...d, status: 'fallback', removeOffsets: [], claimOffsets: [],
      keepStanding: false, reason: '같은 삼각형을 둘 이상이 맡았다',
    }
    : d))
}

/** 대체물이 섰다 — 그때 처음으로 지울 자리를 채운다 */
export function markReady(d: PartDecision): PartDecision {
  if (d.status !== 'pending') return d
  return { ...d, status: 'ready', removeOffsets: d.claimOffsets }
}

/** 대체물을 못 만들었다 — 현행 표현으로 돌린다. 다른 조각은 안 건드린다 */
export function markFailed(d: PartDecision, why: string): PartDecision {
  if (d.status !== 'pending' && d.status !== 'ready') return d
  return {
    ...d, status: 'failed', removeOffsets: [], claimOffsets: [], keepStanding: false, reason: why,
  }
}

/**
 * 결정들 → 한 청크의 계획.
 *
 * `suppress`는 새 레시피가 맡은 것(ready·pending) 전부, `remove`는 ready 교체만이다.
 * `fallback`·`unclassified`·`failed`는 어디에도 안 들어가 **현행 표현**이 그대로 돈다
 */
export function planOf(decisions: readonly PartDecision[]): ResolvedVisualPlan {
  const suppress = new Set<number>()
  const remove = new Set<number>()
  const stand = new Set<number>()
  const sig: string[] = []
  for (const d of decisions) {
    if (d.status !== 'ready' && d.status !== 'pending') continue
    for (const o of d.claimOffsets) suppress.add(o)
    for (const o of d.removeOffsets) remove.add(o)
    if (d.keepStanding) for (const o of d.claimOffsets) stand.add(o)
    sig.push(`${d.componentId}=${String(d.recipeId)}:${d.status}`)
  }
  return {
    key: sig.length === 0 ? 'legacy' : hashText(sig.sort().join('|')),
    suppressLegacyOffsets: suppress,
    removeOffsets: remove,
    standOffsets: stand,
    decisions,
  }
}

/** 열쇠용 짧은 지문 (FNV-1a 32비트) — 보안용이 아니다 */
export function hashText(s: string): string {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  return (h >>> 0).toString(16).padStart(8, '0')
}

/** 한 청크의 결정 요약 — 보고서와 준비 진단이 같은 수를 본다 */
export function tallyDecisions(decisions: readonly PartDecision[]): Record<PartDecision['status'], number> {
  const out = { pending: 0, ready: 0, fallback: 0, unclassified: 0, failed: 0 }
  for (const d of decisions) out[d.status] += 1
  return out
}
