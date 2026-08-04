// 롬 번호 ↔ @pkmn/sim 다리 (PLAN §7.1 Simulation 계층)
//
// 배틀 로직은 @pkmn/sim이 맡는다. 우리 데이터는 롬에서 뽑은 **번호** 체계고 sim은
// 이름 체계라, 그 사이를 잇는 것이 이 파일의 전부다.
//
// **이름으로 잇지 않는다.** 롬은 `SmellingSalt`, sim은 `Smelling Salts`처럼 철자가
// 다른 경우가 있고 그런 건 조용히 "그런 기술 없음"이 되어 배틀이 이상해진다.
// 번호는 양쪽 다 게임 내부 인덱스라 정확히 일치한다 — `bridge.test.ts`가 493종·
// 466기술 전부를 대조해 그것을 매 실행마다 확인한다.
//
// ⚠️ 이 파일과 같은 폴더는 **지연 로딩 경계**다. @pkmn/sim은 brotli 715 kB라
// 초기 로딩에 끼면 안 된다. 오버월드 코드에서 여기를 정적 import 하지 말 것 —
// 배틀이 시작될 때 `await import()`로만 들어온다.
import { Dex } from '@pkmn/sim'

/** 플래티넘은 4세대다. sim의 세대별 덱스를 그 세대로 고정한다 */
export const gen4 = Dex.forGen(4)

let speciesIndex: Map<number, string> | null = null
let moveIndex: Map<number, string> | null = null
let abilityIndex: Map<number, string> | null = null

/**
 * 번호 → 종족 이름.
 *
 * 폼을 걸러낸다. sim의 4세대 덱스에도 메가·히스이·지역형이 남아 있어서
 * 같은 번호에 여러 항목이 걸린다 — 안 거르면 58번이 아케이드가 아니라
 * 히스이 가디로 잡힌다.
 */
function species(): Map<number, string> {
  if (speciesIndex) return speciesIndex
  const m = new Map<number, string>()
  for (const s of gen4.species.all()) {
    if (s.num <= 0 || s.forme) continue
    if (!m.has(s.num)) m.set(s.num, s.name)
  }
  speciesIndex = m
  return m
}

/**
 * 번호 → 기술 이름.
 *
 * 한 번호에 여러 항목이 걸리면 **id가 가장 짧은 것**을 쓴다. 실제로 걸리는 건
 * 파워(`hiddenpower`)뿐인데, sim이 타입별로 `hiddenpowerwater` 같은 파생 항목을
 * 만들어 두고 전부 같은 번호를 준다. 기본형은 언제나 접미사가 없다.
 */
function moves(): Map<number, string> {
  if (moveIndex) return moveIndex
  const shortest = new Map<number, { id: string; name: string }>()
  for (const mv of gen4.moves.all()) {
    if (mv.num <= 0) continue
    const cur = shortest.get(mv.num)
    if (!cur || mv.id.length < cur.id.length) shortest.set(mv.num, { id: mv.id, name: mv.name })
  }
  moveIndex = new Map([...shortest].map(([num, v]) => [num, v.name]))
  return moveIndex
}

/**
 * 번호 → 특성 이름.
 *
 * 특성은 PID의 최하위 비트가 두 후보 중 하나를 고른다. 번호를 안 넘기면 sim이
 * 종족의 첫 특성을 쓰므로, 안 이으면 절반이 조용히 틀린 특성으로 싸운다
 */
function abilities(): Map<number, string> {
  if (abilityIndex) return abilityIndex
  const m = new Map<number, string>()
  for (const a of gen4.abilities.all()) {
    if (a.num <= 0) continue
    if (!m.has(a.num)) m.set(a.num, a.name)
  }
  abilityIndex = m
  return m
}

/** 롬 특성 번호 → sim 특성 이름. 0(특성 없음)이나 모르는 번호면 null */
export function simAbility(id: number): string | null {
  return abilities().get(id) ?? null
}

/** 롬 종족 번호 → sim 종족 이름. 모르는 번호면 null */
export function simSpecies(id: number): string | null {
  return species().get(id) ?? null
}

/** 롬 기술 번호 → sim 기술 이름. 모르는 번호면 null */
export function simMove(id: number): string | null {
  return moves().get(id) ?? null
}
