// 이야기가 갈아 끼우는 지역 물체 (`import/bdsp/field.ts`의 `ROOT_VARIANTS`)
//
// 굽는 쪽이 꺼진 뿌리(`R224b`)와 그 켜진 짝(`R224/R224`)의 차이를 glb 노드 `extras`에 접어 둔다:
//   { variant: 'r224b', mode: 'show' }  판이 켜질 때만 보인다 (꺼진 뿌리에만 있는 물체)
//   { variant: 'r224b', mode: 'hide' }  판이 켜지면 사라진다 (켜진 짝에만 있는 물체)
// 양쪽에 있는 물체는 표식이 없다 — 한 번만 서 있다. 깃발이 안 선 기본 상태는 표식 없는 것 + `hide` 쪽이라 전과 같은 장면이다.
//
// ⚠️ **어느 깃발이 판을 켜는지는 증명하지 못했다.** BDSP는 이 뿌리를 번들 밖 코드로 켠다(`field.ts`의 `ROOT_VARIANTS`). 판의 모습(꽃이 늘고
// 비석 곁 계단이 선다)으로 쉐이미 사건 뒤의 224번도로로 읽어 비석에 이름을 적은 깃발을 쓴다 — 바꿀 때는 `VARIANT_FLAGS` 한 줄이다
import type { Object3D } from 'three'
import { FLAG_WROTE_ON_ROUTE_224_TABLET } from '../engine/script/vars'

/** 판 이름 → 그 판을 켜는 이야기 깃발 */
export const VARIANT_FLAGS: Readonly<Record<string, number>> = {
  r224b: FLAG_WROTE_ON_ROUTE_224_TABLET,
}

export interface VariantNode {
  object: Object3D
  variant: string
  mode: 'show' | 'hide'
}

/** `root` 아래 판 표식이 달린 노드들 (glTF 노드 `extras`는 `userData`로 온다) */
export function variantNodes(root: Object3D): VariantNode[] {
  const out: VariantNode[] = []
  root.traverse((o) => {
    const u = o.userData as { variant?: unknown, mode?: unknown }
    if (typeof u.variant === 'string' && (u.mode === 'show' || u.mode === 'hide')) {
      out.push({ object: o, variant: u.variant, mode: u.mode })
    }
  })
  return out
}

/** 판이 켜졌을 때(`on`) 이 노드가 보이는가 */
export const variantVisible = (mode: VariantNode['mode'], on: boolean): boolean => (mode === 'show' ? on : !on)

/**
 * 판 표식 노드의 보이기를 지금 깃발대로 맞춘다. 판 이름이 `VARIANT_FLAGS`에 없으면 안 켜진 것으로 본다.
 * 바뀐 노드가 있으면 `true`
 */
export function applyVariants(nodes: readonly VariantNode[], flag: (id: number) => boolean): boolean {
  let changed = false
  const memo = new Map<string, boolean>()
  for (const n of nodes) {
    let on = memo.get(n.variant)
    if (on === undefined) {
      const id = VARIANT_FLAGS[n.variant]
      on = id !== undefined && flag(id)
      memo.set(n.variant, on)
    }
    const show = variantVisible(n.mode, on)
    if (n.object.visible !== show) { n.object.visible = show; changed = true }
  }
  return changed
}
