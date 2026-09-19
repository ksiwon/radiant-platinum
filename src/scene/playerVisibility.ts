// 1인칭에서 무엇을 끄는가 (FIRST_PERSON §9.2).
//
// ⚠️ **주인공 그룹을 통째로 끄면 안 된다.** 눈이 머리 안쪽에 있어서 몸은
// 꺼야 하는데, 같은 그룹에 **타고 있는 것**(자전거·파도타기·공중날기)이 달려
// 있고 손 뼈에는 **쓰고 있는 것**(낚싯대·물뿌리개)이 달려 있다. 그룹을 끄면
// 자전거를 타는데 화면에 아무것도 없이 속도만 빨라진다.
//
// 조각(`isMesh`)만 끄면 뼈는 켜진 채라 손에 매단 것이 그대로 보인다.
// 실측: 축복시티에서 자전거를 타고 1인칭으로 내려다보면 그 픽셀을 칠하는 것이
// `ob1004_00_bicycleSkin_2`이고, 몸(`sora_00_00_BodyASkin_2`)을 숨겨도 색이
// 안 바뀐다 — 이미 꺼져 있다는 뜻이다 (`pnpm shot … --blame`).
import type { Object3D } from 'three'

/** 조각 하나와 **등록할 때의** 켜짐 여부 */
export interface SkinPart {
  mesh: Object3D
  /**
   * 원래 켜져 있었나.
   *
   * ⚠️ **1인칭을 나올 때 전부 켜면 안 된다.** 대체 복장 조각은 기본 복장과
   * 겹쳐 z-fighting을 내므로 `personModel`이 꺼 둔다 — 그것까지 켜면 옷이 둘이다
   */
  shown: boolean
}

/**
 * 1인칭이면 살덩이를 끈다. 아니면 **원래 켜져 있던 것만** 되켠다.
 *
 * 조각을 하나도 못 받았으면(모델이 아직 안 온 폴백 `GreyBox`) `false`를 준다 —
 * 그때는 부르는 쪽이 그룹을 통째로 끈다
 */
export function showPlayerSkin(skin: readonly SkinPart[] | null, first: boolean): boolean {
  if (!skin || skin.length === 0) return false
  for (const part of skin) part.mesh.visible = first ? false : part.shown
  return true
}
