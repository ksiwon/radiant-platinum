// sim이 붙잡는 표. **빌드가 `@pkmn/sim`의 데이터 모듈 자리에 이 파일을 끼운다**
// (`tools/distribution/pkmnDiet.mjs`).
//
// ⚠️ **객체를 바꿔 끼우지 않고 안을 채운다.** `dex.loadData()`는 표를 한 번
// 읽어 `dataCache`에 넣고 그 뒤로는 같은 참조를 계속 본다. 여기서 `Pokedex = {…}`
// 처럼 새 객체를 대입하면 sim은 옛 빈 객체를 계속 들고 있게 된다 — 표가
// 통째로 비어 있는데 오류는 안 나는, 제일 찾기 어려운 꼴이 된다.
import { MechanicsRegistry } from './mechanics'

type Table = Record<string, unknown>

/** 종족. `provider.ts`가 사용자의 롬으로 채운다 */
export const Pokedex: Table = {}
export const Moves: Table = {}
export const Items: Table = {}
export const Abilities: Table = {}
export const TypeChart: Table = {}
export const Natures: Table = {}

/** 상태·날씨·필드·룰·진행. 통째로 구현이라 롬이 채울 것이 없다 */
export const Conditions = MechanicsRegistry.conditions
// ⚠️ **베껴서 넣는다.** base가 `loadData`에서 이 표에 형식 301개를 밀어 넣으므로
// (`dataCache.Rulesets[format.id] = …`) 원본을 그대로 주면 생성물이 더럽혀진다
export const Rulesets: Table = { ...MechanicsRegistry.rulesets }
export const Scripts = MechanicsRegistry.scripts

/**
 * 안 쓰는 표. **빈 것이 맞다.**
 *
 * 습득기술·티어·별명은 팀 합법성 검사기만 보고, 우리는 롬에서 팀을 만들어
 * `gen4customgame`으로 검증 없이 넣는다 (DEPLOY.md §4)
 */
export const Learnsets: Table = {}
export const FormatsData: Table = {}
export const PokemonGoData: Table = {}
export const Aliases: Table = {}
export const Tags: Table = {}

/** 표를 전부 비운다. 설치본을 갈아 끼울 때 옛 롬의 수치가 남지 않게 */
export function clearBattleTables(): void {
  for (const t of [Pokedex, Moves, Items, Abilities, TypeChart, Natures]) {
    for (const k of Object.keys(t)) delete t[k]
  }
}
