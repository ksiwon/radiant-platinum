// 오버월드에 서 있는 **포켓몬** 그림 (DATA.md §2.16)
//
// 사람은 BDSP 인물 모델로 서고(`npcModels`), 포켓몬은 배틀에 쓰는 그 모델로
// 선다(`scene/NpcMonModels`). 어느 그림이 포켓몬인가를 여기 한 군데에 둔다 —
// **사람 쪽도 이 표를 봐야 하기 때문이다.**
//
// ⚠️ **안 보면 포켓몬 자리에 사람이 선다.** 배치표에서 `PIKACHU` 그림으로 선
// 트레이너 셋이 전부 포켓몬키즈라, 그림→갈래를 배치로 세면 피카츄가 여자아이가
// 된다 (`npcModels`의 `classOfSprite`).
//
// ⚠️ **이름을 지어 맞추지 않는다.** 원작 `graphicsID` 이름이 그대로 종족
// 이름인 것만 담는다 (`NpcMonModels.test`가 이 표의 이름이 실제 배치표에
// 있는지 되짚는다). 로토무는 폼마다 그림이 따로라 폼 번호까지 적는다

/** 그림 이름 → `[종족, 폼]` */
const MON_BY_NAME: Readonly<Record<string, readonly [number, number]>> = {
  PIKACHU: [25, 0], CLEFAIRY: [35, 0], PSYDUCK: [54, 0], MACHOP: [66, 0],
  MAGIKARP: [129, 0], TORCHIC: [255, 0], SHROOMISH: [285, 0], SKITTY: [300, 0],
  STARLY: [396, 0], PACHIRISU: [417, 0], DRIFLOON: [425, 0], BUNEARY: [427, 0],
  HAPPINY: [440, 0], CROAGUNK: [453, 0], UXIE: [480, 0], MESPRIT: [481, 0],
  AZELF: [482, 0], HEATRAN: [485, 0], REGIGIGAS: [486, 0], GIRATINA_ALTERED: [487, 0],
  GIRATINA_ORIGIN: [487, 1], CRESSELIA: [488, 0], DARKRAI: [491, 0], SHAYMIN: [492, 0],
  ARCEUS: [493, 0],
  ROTOM_HEAT: [479, 1], ROTOM_WASH: [479, 2], ROTOM_FROST: [479, 3],
  ROTOM_FAN: [479, 4], ROTOM_MOW: [479, 5],
}

/** 이 그림이 실제 포켓몬 모델로 설 수 있는가. 아니면 판때기로 남는다 */
export function overworldMon(name: string): readonly [number, number] | null {
  return MON_BY_NAME[name] ?? null
}

/** 시험이 표 전체를 훑을 수 있게 이름만 내 준다 */
export const OVERWORLD_MON_NAMES: readonly string[] = Object.keys(MON_BY_NAME)
