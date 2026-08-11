// 4세대 배틀 구현 등록소 (COPYRIGHT.md §2.9 · DEPLOY.md §4)
//
// **왜 이 층이 있나.** 배틀 심판은 `@pkmn/sim`의 엔진이 맡는데, 그 패키지는
// 엔진 코드와 포켓몬 **데이터**를 한 파일에 담고 있다. MIT는 코드에 대한
// 라이선스지 그 안의 게임 데이터를 우리가 배포할 권리를 주지 않는다.
//
// 그래서 둘을 가른다:
//
//   · **수치·이름** → 사용자의 롬에서. `provider.ts`가 채운다
//   · **효과 구현** → 여기. `vendor/*.gen.ts`가 원문 그대로 들고 있다
//
// 이 파일은 그 둘을 합치는 규칙만 적는다.
import { ABILITY_MECHANICS } from './vendor/abilities.gen'
import { CONDITIONS } from './vendor/conditions.gen'
import { ITEM_MECHANICS } from './vendor/items.gen'
import { MOVE_MECHANICS } from './vendor/moves.gen'
import { RULESETS } from './vendor/rulesets.gen'
import { SCRIPTS } from './vendor/scripts.gen'
import { SPECIES_MECHANICS } from './vendor/species.gen'
import { TYPE_MECHANICS } from './vendor/types.gen'

/**
 * 구현 한 조각. 콜백과 선언형 효과가 섞여 있다.
 *
 * 모양을 더 조이지 않는다 — sim의 표는 항목마다 칸이 다르고, 여기서 좁게
 * 적으면 생성물이 바뀔 때마다 형이 깨진다. 값을 읽는 쪽은 sim이고 그쪽이
 * 자기 형을 갖고 있다
 */
export type Mechanics = Record<string, unknown>

/**
 * 롬에서 온 수치 위에 구현을 얹는다.
 *
 * ⚠️ **롬이 이긴다.** 같은 칸이 양쪽에 있으면 사용자의 롬 값을 쓴다 — 원작이
 * 정답이고 Showdown의 표는 그것을 옮겨 적은 것이기 때문이다. 실측으로 어긋난
 * 자리가 딱 하나 있었다: 참고 있기의 우선도가 롬 +3, Showdown +4다 (4세대는
 * +3이 맞다)
 */
export function withMechanics(rom: Mechanics, mechanics: Mechanics | undefined): Mechanics {
  return mechanics ? { ...mechanics, ...rom } : rom
}

export const MechanicsRegistry = {
  species: (id: string): Mechanics | undefined => SPECIES_MECHANICS[id],
  move: (id: string): Mechanics | undefined => MOVE_MECHANICS[id],
  ability: (id: string): Mechanics | undefined => ABILITY_MECHANICS[id],
  item: (id: string): Mechanics | undefined => ITEM_MECHANICS[id],
  type: (id: string): Mechanics | undefined => TYPE_MECHANICS[id],
  /** 도구는 롬 468종 중 배틀에 나오는 것만 구현이 있다 */
  hasItem: (id: string): boolean => id in ITEM_MECHANICS,
  conditions: CONDITIONS,
  rulesets: RULESETS,
  scripts: SCRIPTS,
}
