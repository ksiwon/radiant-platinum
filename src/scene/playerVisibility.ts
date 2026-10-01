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
//
// ⚠️ **조각도 `visible`로 끄면 안 된다 — 그림자가 같이 사라진다.** `visible`이
// 꺼진 메시는 그림자 패스에도 안 들어가서, 1인칭에서는 자전거와 낚싯대 그림자만
// 땅을 달리고 사람 그림자가 없었다. 그래서 **색과 깊이를 안 쓰게만** 한다
// (`colorWrite` · `depthWrite`). 그림자 패스는 제 재질(`scene.overrideMaterial`의
// 그림자 재질)로 그리므로 이 둘을 안 본다 — three r185 `Renderer`가 `allowOverride`인
// 재질을 그림자 재질로 갈아 끼운다
import type { Material, Object3D } from 'three'

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
 * 감추기 전의 재질 깃발.
 *
 * ⚠️ **조각이 아니라 재질에 적는다.** 한 재질을 여러 조각이 같이 쓰면 조각마다
 * 적을 때 둘째 조각이 「이미 끈 값」을 원래 값으로 적어 버려, 나올 때 순서에 따라
 * 꺼진 채로 남는다. 재질 하나에 한 번만 적고 되돌릴 때 지운다
 */
const original = new WeakMap<Material, { colorWrite: boolean, depthWrite: boolean }>()

function materialsOf(mesh: Object3D): readonly Material[] {
  const material = (mesh as { material?: Material | Material[] }).material
  if (material === undefined) return []
  return Array.isArray(material) ? material : [material]
}

/** 색도 깊이도 안 쓰게 한다 — 화면에는 없고 그림자는 진다 */
function ghost(material: Material): void {
  if (!original.has(material)) {
    original.set(material, { colorWrite: material.colorWrite, depthWrite: material.depthWrite })
  }
  material.colorWrite = false
  material.depthWrite = false
}

/** 감추기 전 깃발로 되돌린다. 안 감춘 재질은 안 건드린다 */
function unghost(material: Material): void {
  const was = original.get(material)
  if (was === undefined) return
  material.colorWrite = was.colorWrite
  material.depthWrite = was.depthWrite
  original.delete(material)
}

/**
 * 1인칭이면 살덩이를 **화면에서만** 지운다. 아니면 되돌린다.
 *
 * 켜짐(`visible`)은 어느 쪽이든 **원래 켜져 있던 것만** 켠다 — 대체 복장은 그대로
 * 꺼 둔다. 그림자는 켜진 조각이 진다.
 *
 * 조각을 하나도 못 받았으면(모델이 아직 안 온 폴백 `GreyBox`) `false`를 준다 —
 * 그때는 부르는 쪽이 그룹을 통째로 끈다
 */
export function showPlayerSkin(skin: readonly SkinPart[] | null, first: boolean): boolean {
  if (!skin || skin.length === 0) return false
  for (const part of skin) {
    part.mesh.visible = part.shown
    for (const material of materialsOf(part.mesh)) {
      if (first) ghost(material)
      else unghost(material)
    }
  }
  return true
}
