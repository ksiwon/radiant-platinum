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

// ⚠️ **개발 서버가 sim의 진짜 표를 들고 도는 것을 여기서 잡는다.**
//
// 빌드는 sim의 데이터 모듈 자리에 우리 표를 끼운다(`tools/distribution/pkmnDiet.mjs`).
// 그 갈아 끼우기가 개발 서버에서만 빠지면 **아무 오류 없이** 배틀이 딴 수치로
// 돌고, 그보다 나쁘게는 껍데기가 걸린 표와 안 걸린 표가 섞인다 — 실제로
// `FormatsData`만 비고 `Pokedex`에 폼이 남아서, 아래 `species.all()`이 로토무
// 폼에서 터졌다. 야생도 트레이너도 열리자마자 닫혔고 화면에는 아무 말도 없었다.
//
// 폼은 롬 표에 **절대 안 들어온다**(우리는 493종을 번호로 넣는다). 그러니
// 로토무 폼이 보이면 그것은 sim의 표다
// ⚠️ **개발 서버에서만 잰다** (`MODE === 'development'`). 시험은 껍데기 없이
// sim의 표를 그대로 쓰는 것이 맞다 — `DEV`로 재면 시험 145벌이 여기서 선다
if (import.meta.env.MODE === 'development') {
  let simsOwn: boolean
  try { simsOwn = gen4.species.get('rotomheat').exists } catch { simsOwn = true }
  if (simsOwn) {
    throw new Error(
      '개발 서버가 @pkmn/sim의 진짜 표를 들고 있다 — 미리 묶기가 껍데기를 안 걸었다. '
      + 'vite.config.ts의 optimizeDeps.exclude에 @pkmn/sim이 있는지 보라',
    )
  }
}

// ⚠️ `Dex.forGen(4)`는 **세대로 거르지 않는다.** 4세대 규칙과 4세대 수치를 얹어
// 줄 뿐, 표에는 이후 세대 항목이 그대로 남아 있다 — 실측으로 종족 532개, 기술
// 468개, 특성 193개가 더 들어 있고 전부 `exists: true`다. 그대로 두면 `조로아크`가
// 571번으로 오가는데 우리 데이터에는 493번까지밖에 없다.
//
// 그래서 양방향 모두 4세대 범위에서 자른다. 경계 밖은 "그런 것 없음"이다.
const MAX_SPECIES = 493
const MAX_MOVE = 467
const MAX_ABILITY = 123

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
    if (s.num <= 0 || s.num > MAX_SPECIES || s.forme) continue
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
    if (mv.num <= 0 || mv.num > MAX_MOVE) continue
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
    if (a.num <= 0 || a.num > MAX_ABILITY) continue
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

// ── 반대 방향 ────────────────────────────────────────────────────────────────
// 프로토콜은 이름으로 말한다(`|switch|p1a: 빛나|Turtwig, L5, F`). 우리 UI·모델·
// 연출은 전부 번호로 도는 체계라, 들어오는 이름을 여기서 번호로 되돌린다.
//
// 위쪽 정방향 색인을 뒤집지 않고 덱스에 직접 묻는다 — 폼 이름(`Deoxys-Attack`)이나
// 파생 기술(`Hidden Power Water`)처럼 정방향 색인이 안 담고 있는 이름도 프로토콜에는
// 나올 수 있고, 그 경우에도 번호는 기본형과 같기 때문이다.

/** sim 종족 이름 → 롬 번호. 모르는 이름이면 null */
export function romSpecies(name: string): number | null {
  const s = gen4.species.get(name)
  return s.exists && s.num > 0 && s.num <= MAX_SPECIES ? s.num : null
}

/** sim 기술 이름 → 롬 번호. 모르는 이름이면 null */
export function romMove(name: string): number | null {
  const m = gen4.moves.get(name)
  return m.exists && m.num > 0 && m.num <= MAX_MOVE ? m.num : null
}

/** sim 특성 이름 → 롬 번호. 모르는 이름이면 null */
export function romAbility(name: string): number | null {
  const a = gen4.abilities.get(name)
  return a.exists && a.num > 0 && a.num <= MAX_ABILITY ? a.num : null
}
