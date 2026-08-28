// 포켓몬 몸을 **화면 위에 얹는 것**으로 바꾼다.
//
// 미리보기 자리 둘이 같은 일을 한다 — 전설과 마주치기 직전의 창
// (`PokemonPreviewStage`)과 파트너를 고를 때의 원(`field/StarterMon`).
// 둘 다 세상 속 물체가 아니라 **화면에 얹힌 그림**이라, 뒤에 무엇이 있든
// 가려지면 안 된다.
import { Group, Material, Mesh } from 'three'
import { type MonBody } from './battle/monModel'

/** 얹히는 그림의 그리는 차례. 무대의 다른 것들보다 뒤에 간다 */
export const OVERLAY_ORDER = 950

function cloneOverlayMaterials(root: Group): Material[] {
  const made: Material[] = []
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return
    const clone = (material: Material): Material => {
      const next = material.clone()
      next.depthTest = false
      next.depthWrite = false
      made.push(next)
      return next
    }
    object.material = Array.isArray(object.material)
      ? object.material.map(clone)
      : clone(object.material)
    object.renderOrder = OVERLAY_ORDER
  })
  return made
}

/**
 * 이 몸을 얹히는 그림으로 갈아 끼우고, 내릴 때 새로 만든 재질을 버린다.
 *
 * ⚠️ **재질을 복제한다.** 같은 종을 배틀에서도 쓰는데 원본을 손보면 그쪽까지
 * 깊이 검사가 꺼진다 — `useMonBody`의 `prepare`로 넘겨 이 몸에만 건다
 */
export function asOverlay(body: MonBody): () => void {
  const made = cloneOverlayMaterials(body.root)
  return () => {
    made.forEach((material) => {
      material.dispose()
    })
  }
}
