// 주인공이 **들고 타는 것들** — BDSP의 `Characters/persons/field/pc_parts`.
//
// 한 번들에 여섯이 같이 들어 있다 (`.audit/fieldClipCensus.mjs`가 필드 번들
// 161벌의 메시 이름을 전수로 훑어 찾았다):
//
//     naminori_00_00_BodySkin      파도타기 몸   정점 1,422
//     sora_00_00_BodyASkin         공중날기 몸   정점 1,243
//     fo1013_00_wateringcanSkin    물뿌리개      정점   296
//     fo1005/1006/1007_00_roadSkin 낚싯대 셋     정점 92 · 71 · 492
//
// ⚠️ **파도타기에는 클립이 없다.** 원작도 안 쓴다 — 이 몸 위에 앉은 자세를
// 얹는 방식이라 돌릴 것이 애초에 없다. 그래서 굽는 쪽도 `--no-clips`다.
import type { Object3D } from 'three'

/** 번들 안의 이름. 이 이름으로 골라 쓴다 */
export const PC_PART = {
  surf: 'naminori_00_00_BodySkin',
  fly: 'sora_00_00_BodyASkin',
  wateringCan: 'fo1013_00_wateringcanSkin',
  rodOld: 'fo1005_00_roadSkin',
  rodGood: 'fo1006_00_roadSkin',
  rodSuper: 'fo1007_00_roadSkin',
} as const

/**
 * 파도타기 몸의 자리들 — **번들 좌표 그대로**다 (`.audit/surfMount.mjs`).
 *
 * 번들 원점은 몸보다 위에 있고, 몸의 발판은 `Origin_mcl`이 y −1.0에 놓여 있다.
 * 그래서 **그 자리를 물 높이로 올려** 놓는다 — 씬에 넣을 때 `lift`만큼 든다.
 *
 * ⚠️ **자리를 눈으로 맞춘 값이 하나도 없다.** 스킨을 실제로 먹여 잰 몸 상자가
 * y −1.0580 ~ −0.1239 · z −1.0126 ~ +0.5592고, 번들이 적어 둔 사람 앉는 자리
 * (`scaffold_Attach`)가 y −0.4041이다. 셋 다 여기 그대로 옮겼다
 */
export const SURF_MOUNT = {
  /** 씬에 넣을 때 드는 높이. `Origin_mcl`이 물 높이에 오게 한다 */
  lift: 1.0,
  /**
   * 사람이 앉는 높이 (`scaffold_Attach`, 든 뒤 기준).
   *
   * −0.4041 + 1.0. 물 높이에서 이만큼 위다
   */
  seat: 0.5959,
  /** 물에 잠기는 깊이. −1.0580 + 1.0 — 몸 밑이 물 높이보다 조금 아래다 */
  draft: 0.058,
  /** 몸 높이 (−0.1239 − (−1.0580)) */
  height: 0.9341,
} as const

/**
 * 이 번들에서 한 갈래만 남기고 나머지 메시를 끈다.
 *
 * 뼈는 그대로 둔다 — 스킨이 그 뼈를 보고 있고, 안 쓰는 뼈는 그리지 않으므로
 * 값이 없다. 나중에 공중날기 몸과 물뿌리개를 붙일 때 같은 파일을 그대로 쓴다.
 *
 * ⚠️ **이름이 하나가 아니다.** 번들에는 렌더러를 든 GameObject와 메시가 같은
 * 이름이라, GLTFLoader가 겹치는 이름에 `_1`·`_2`를 붙인다 — 실측으로 파도타기
 * 몸이 빈 `naminori_00_00_BodySkin`(자식 0) 하나와 그림 둘을 담은
 * `naminori_00_00_BodySkin_1`(Group)으로 갈려 있었다. 정확히 같은 이름만 찾으면
 * **빈 쪽을 끄고 진짜 메시는 그대로 남는다** — 그래서 접두사로 본다
 */
export function keepOnly(root: Object3D, name: string): void {
  root.traverse((o) => {
    for (const wanted of Object.values(PC_PART)) {
      if (o.name === wanted || o.name.startsWith(`${wanted}_`)) {
        o.visible = wanted === name
        return
      }
    }
  })
}
