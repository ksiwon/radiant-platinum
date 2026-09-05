// 몸 하나를 흰색으로 지웠다 되돌린다 (PARITY §3.1).
//
// 원작 진화는 두 스프라이트를 **팔레트째** 흰색으로 민 다음(`PokemonSprite_StartFade`)
// 그 흰 실루엣 둘을 주고받는다. 우리 몸은 3D라 팔레트가 없으므로 재질의 바탕색과
// 자체발광을 흰색으로 끌어올린다.
//
// ⚠️ **재질을 그대로 만지면 안 된다.** `SkeletonUtils.clone`은 그래프만 복제하고
// **재질은 참조를 나눠 쓴다**(`battle/monModel`의 `makeBody`는 이로치·암컷 갈래에
// 걸린 것만 따로 복제한다). 그대로 칠하면 같은 종이 서 있는 다른 화면 — 파티
// 미리보기·명예의 전당 — 까지 같이 하얘진다. 그래서 여기서 **이 몸 몫으로 한 벌
// 복제**하고 내릴 때 버린다.
//
// ⚠️ **파이프라인이 늘지 않는다.** three는 셰이더를 **원문 문자열로** 캐시하므로
// (`warmPipelines` 머리말), 같은 설정의 복제본은 프로그램을 새로 안 굽는다.
import { Color, type Material, type Mesh, type Object3D } from 'three'

/** 흰색으로 밀 수 있는 재질이 갖춰야 할 것 */
interface Tintable extends Material {
  color?: Color
  emissive?: Color
}

interface Held {
  material: Tintable
  color: Color | null
  emissive: Color | null
}

const WHITE = new Color(1, 1, 1)

export interface Whitener {
  /** 0이면 제 색, 1이면 새하얗다 */
  set: (amount: number) => void
  /** 몸을 내릴 때 — 복제한 재질을 버린다 */
  dispose: () => void
}

/**
 * `root` 밑의 재질을 이 몸 몫으로 복제하고, 흰색으로 미는 손잡이를 준다.
 *
 * ⚠️ **자체발광까지 올린다.** 바탕색만 희게 하면 빛을 받는 회색이 되고 실루엣이
 * 안 읽힌다 — 원작의 흰 실루엣은 **스스로 밝다**
 */
export function whitenBody(root: Object3D): Whitener {
  const held: Held[] = []
  root.traverse((node) => {
    const mesh = node as Mesh
    if (!mesh.isMesh || !mesh.material) return
    const own = (material: Material): Material => {
      const next = material.clone() as Tintable
      held.push({
        material: next,
        color: next.color ? next.color.clone() : null,
        emissive: next.emissive ? next.emissive.clone() : null,
      })
      return next
    }
    mesh.material = Array.isArray(mesh.material) ? mesh.material.map(own) : own(mesh.material)
  })

  return {
    set: (amount) => {
      const t = Math.min(1, Math.max(0, amount))
      for (const at of held) {
        if (at.color) at.material.color?.copy(at.color).lerp(WHITE, t)
        if (at.emissive) at.material.emissive?.copy(at.emissive).lerp(WHITE, t)
      }
    },
    dispose: () => {
      for (const at of held) at.material.dispose()
      held.length = 0
    },
  }
}
