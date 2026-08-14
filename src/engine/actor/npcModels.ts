// 플래티넘 NPC 그림 → BDSP 인물 모델 (DATA.md §2.16)
//
// 플래티넘 오버월드 NPC는 판때기 그림이고 이름이 `BUG_CATCHER`처럼 **뜻으로**
// 붙어 있다(디컴프). BDSP는 같은 신오를 3D로 다시 만든 것이라 같은 사람들이
// 들어 있는데 번들 이름은 `tr1006_00`처럼 번호다.
//
// ⚠️ **한동안 이름이 같은 것만 이었고, 그래서 절반이 판때기로 남았다.**
// 이름이 같기를 기다릴 이유가 없다 — **BDSP가 자기 답을 적어 두었다.**
// `TrainerTable`이 트레이너 갈래마다 어느 몸을 쓰는지 번들 이름으로 적고
// (`import/bdsp/trainerModels`), 플래티넘은 배치표에서 어느 그림이 어느 갈래로
// 싸우는지 적는다(`import/platinum/spriteTrainerClass`). 둘을 이으면 짐작이
// 한 번도 안 들어간다.
//
// 그래서 순서가 이렇다:
//
//   ① **그림 이름이 곧 갈래 이름** — `YOUNGSTER` → `TRAINER_CLASS_YOUNGSTER`.
//      성별 꼬리(`_M`/`_MALE`)와 고유명 앞머리(`LEADER_`, `CHAMPION_`…)는 뗀다.
//   ② **배치표가 말해 주는 갈래** — `EXPERT_M`으로 선 트레이너 여덟이 전부
//      베테랑이다. 이름만 봐서는 못 잇는 자리를 게임 자료가 이어 준다.
//   ③ **번들 안 텍스처 이름표** — 트레이너가 아닌 사람(간호사·메이드·게임
//      디렉터)은 갈래가 없다. 그 사람들만 `bdspNpc.json`의 낱말로 잇는다.
//
// ⚠️ **①이 ②보다 먼저다.** `RANCHER` 그림으로 선 트레이너는 「벨과 아빠」가
// 더 많은데(2:1), 그 갈래의 몸은 카우걸이다. 이름이 같은 갈래가 있으면 그것이
// 임자다.
//
// ⚠️ **비슷한 이름으로 잇지 않는다.** 느슨하게 맞춰 봤더니 그중
// `PARASOL_LADY → lady`(진짜는 `parasollady`)와 `MIDDLE_AGED_WOMAN → man`이
// 섞여 있었다. 부분 문자열은 그럴듯한 오답을 만든다. ③은 여전히 **글자가
// 같은 것**과 손으로 적은 표뿐이다.
// ⚠️ **여기만 `.ts`를 붙여 부른다.** 굽는 도구(`tools/extract/npcModels.mjs`)가
// 이 모듈을 노드로 그대로 불러 쓰는데, 노드의 타입 벗기기는 확장자를 안 적으면
// 못 찾는다. 규칙을 두 벌 두지 않으려고 치르는 값이다
import { TRAINER_MODELS } from '../../import/bdsp/trainerModels.ts'
import { SPRITE_TRAINER_CLASS, TRAINER_CLASS_NAMES } from '../../import/platinum/trainerClasses.ts'
import { overworldMon } from './overworldMon.ts'

/** 이름을 견줄 꼴로 — 소문자 글자만 남긴다 */
export function normalize(name: string): string {
  return name.toLowerCase().replace(/[^a-z]/g, '')
}

/**
 * 갈래 이름을 그림 이름과 견줄 꼴로.
 *
 * 플래티넘은 같은 사람을 두 자리에 다르게 적는다 — 갈래는
 * `TRAINER_CLASS_LEADER_ROARK`, 그림은 `OBJ_EVENT_GFX_ROARK`다. 역할 앞머리를
 * 떼고 성별 꼬리를 한 꼴로 맞추면 둘이 만난다
 */
function classKey(name: string): string {
  const bare = name
    .replace(/^(DP_)?(LEADER|ELITE_FOUR|CHAMPION|COMMANDER|TRAINER|GALACTIC)_/, '')
    .replace(/_2$/, '')
  // ⚠️ **여자를 먼저 본다.** `female`의 꼬리가 `male`이라 순서를 바꾸면
  // `PLAYER_FEMALE`이 `playerfem`이 되어 `PLAYER_F`와 안 만난다
  return normalize(bare).replace(/female$/, 'f').replace(/male$/, 'm')
}

/**
 * 손으로 적은 짝. **왼쪽은 플래티넘 그림 이름, 오른쪽은 갈래 이름**이다.
 *
 * 여기 있어도 되는 것은 두 자료가 **같은 사람을 다르게 부르는** 자리뿐이다.
 * 근거를 못 대는 짝은 안 적는다 — 비어 있는 편이 틀린 것보다 낫다
 */
export const SPRITE_CLASS_ALIAS: Readonly<Record<string, string>> = {
  // 「크래셔 마키」 — 플래티넘은 별명까지 그림 이름에 넣었고 갈래는 성만 쓴다
  CRASHER_WAKE: 'LEADER_WAKE',
  // 갤럭시단 보스. 갈래는 자리로, 그림은 이름으로 부른다
  CYRUS: 'GALACTIC_BOSS',
  // 배틀타워 타워 타이쿤
  PALMER: 'TOWER_TYCOON',
  // 용식. 갈래는 「라이벌」이다
  BARRY: 'RIVAL',
  // 같은 낱말에 접사만 다르다
  POKEMON_BREEDER_M: 'BREEDER_MALE',
  POKEMON_BREEDER_F: 'BREEDER_FEMALE',
  // ⚠️ **에스퍼는 그림이 하나다.** 남녀 갈래가 따로인데 오버월드 그림은
  // `PSYCHIC` 한 칸이고, 배치도 남 9 · 여 9로 반반이다. 어느 쪽을 골라도 절반은
  // 틀리므로 그림이 그린 사람(남)을 따른다
  PSYCHIC: 'PSYCHIC_MALE',
}

/**
 * 갈래 이름 → 갈래 번호. 이름이 같은 것만 본다.
 *
 * 고유명이 든 갈래는 앞머리를 떼고 견주므로 `ROARK`가 `LEADER_ROARK`에 붙는다
 */
const CLASS_BY_KEY: ReadonlyMap<string, number> = (() => {
  const out = new Map<string, number>()
  for (const [i, name] of TRAINER_CLASS_NAMES.entries()) {
    const key = classKey(name)
    if (!out.has(key)) out.set(key, i)
  }
  return out
})()

/** 그림 번호 → 배치표가 세어 준 갈래 */
const CLASS_BY_SPRITE: ReadonlyMap<number, number> =
  new Map(SPRITE_TRAINER_CLASS.map((r) => [r[0], r[1]]))

/** 갈래 번호 → BDSP 번들 */
const BUNDLE_BY_CLASS: ReadonlyMap<number, string> =
  new Map(TRAINER_MODELS.map((r) => [r[0], r[1]]))

/** 갈래 번호 → 그 짝을 확인해 준 근거 */
const WHY_CLASS: ReadonlyMap<number, string> =
  new Map(TRAINER_MODELS.map((r) => [r[0], r[3]]))

/**
 * 이 그림이 어느 트레이너 갈래인가. 사람이 아니거나 갈래가 없으면 `null`.
 *
 * ⚠️ **포켓몬은 여기서 빠진다.** `PIKACHU` 그림으로 선 트레이너 셋이 전부
 * 포켓몬키즈라서 배치표만 보면 그 그림에 사람이 붙는다 — 그러면 야생 피카츄가
 * 서야 할 자리에 여자아이가 선다
 */
export function classOfSprite(spriteName: string, spriteID?: number): number | null {
  if (overworldMon(spriteName) !== null) return null
  const named = SPRITE_CLASS_ALIAS[spriteName] ?? spriteName
  const byName = CLASS_BY_KEY.get(classKey(named))
  if (byName !== undefined) return byName
  return spriteID === undefined ? null : CLASS_BY_SPRITE.get(spriteID) ?? null
}

/** 번들 뭉치 하나 */
export interface BundleSet {
  /** 번들 → 그 안에 든 갈래 낱말들 */
  bundles: Readonly<Record<string, readonly string[]>>
  vocabulary: readonly string[]
}

export interface NpcModelTable {
  /** 등신. 배틀에 서는 몸이다 */
  battle: BundleSet
  /** 치비. 오버월드를 걸어 다니는 몸이다 */
  field: BundleSet
}

/** 어느 번들을 구울 것인가 */
export interface NpcModelRef {
  /**
   * 구울 번들. **앞엣것이 임자**고, 열다 끊기면 다음 것으로 넘어간다.
   *
   * ⚠️ 어떤 배틀 번들은 같은 폴더에 없는 CAB을 가리켜서 열다가 끊긴다
   * (`tr1085_00`의 재질). 그때 쓸 다음 후보가 **같은 번호의 필드 번들**이다 —
   * 앞 두 글자만 다르고 번호가 같으면 같은 사람이다 (`tr1085_00` ↔ `fc1085_00`)
   */
  bundles: readonly string[]
  /** 왜 이 사람인가. 표를 사람이 되짚을 수 있게 남긴다 */
  via: string
}

/** 갈래 낱말 → 그 낱말이 든 번들들. 옷만 다른 같은 사람이 여럿일 수 있다 */
export function bundlesByTag(set: BundleSet): Map<string, string[]> {
  const out = new Map<string, string[]>()
  for (const [bundle, tags] of Object.entries(set.bundles)) {
    for (const tag of tags) {
      const list = out.get(tag)
      if (list) list.push(bundle)
      else out.set(tag, [bundle])
    }
  }
  return out
}

/**
 * 손으로 적은 **낱말** 짝 — ③에서만 쓴다.
 *
 * 트레이너가 아닌 사람은 갈래가 없어서 번들 안 텍스처 이름표로만 이을 수 있다.
 * 같은 낱말에 접사만 다르거나 영어에서 같은 것을 가리킬 때만 적는다
 */
export const NPC_MODEL_ALIAS: Readonly<Record<string, string>> = {
  POKECENTER_NURSE: 'nursejoy',
  TWIN: 'twins',
  TUBER_M: 'tuber',
  TUBER_F: 'tuber',
  SCHOOL_KID_M: 'studentM',
  SCHOOL_KID_F: 'studentF',
  // 낚시꾼. fisherman과 angler가 같은 것을 가리킨다
  FISHERMAN: 'angler',

  // ── 갈래가 없는 마을 사람 ────────────────────────────────────────────────
  //
  // 트레이너가 아니라 배치표가 갈래를 안 알려 준다. 그래서 **롬이 그림에 붙여
  // 둔 텍스처 이름표**를 근거로 삼는다 (`res/graphics/field_sprites/meson.build`
  // 의 `basename`) — 그림 이름과 따로 붙은 두 번째 이름이고, 이미 396칸을
  // 대조하는 데 쓰고 있는 자료다 (`tools/extract/npcSprites.js`).
  //
  // ⚠️ **셋이 다 맞을 때만 적는다 — 성별 · 나이 · 하는 일.** 셋 다 두 이름표
  // 에서 읽히는 성질이라 "비슷해 보인다"가 아니다. BDSP 쪽에 그 셋을 만족하는
  // 사람이 **둘 이상이면 안 적는다.**

  // `pcwoman2`. ⚠️ **`pc`는 포켓몬센터다** — 같은 자리에 `pcwoman1`(간호사)과
  // `pcwoman3`(안 쓰는 접수원)이 있다. 센터 안 판매대에 선 점원이고, 신오
  // 전체에서 101곳으로 **사람 그림 중 제일 많이 놓인 것**이다
  TEALA: 'clerk',
  // `shopw1` — 가게 여자. BDSP의 점원이 하나뿐이라 센터 점원과 같은 몸이다
  CASHIER_F: 'clerk',
  // `woman6` · 하는 일이 접수다. BDSP에 접수원이 둘이라 자리로 나눈다
  RECEPTIONIST: 'reception01',
  WIFI_PLAZA_ATTENDANT_F: 'reception02',
  // `oldwoman1`·`oldwoman2` ↔ `grandmother01`·`grandmother02`. **번호까지 같다** —
  // ⚠️ 그림 이름은 `EXPERT_F`지만 롬의 이름표가 「늙은 여자 1」이다
  EXPERT_F: 'grandmother01',
  OLD_WOMAN: 'grandmother02',
  // `oldman2`. BDSP의 늙은 남자가 하나뿐이다 (`oldman1`은 엑스퍼트 남 → 베테랑)
  OLD_MAN: 'grandpa',
  // `middleman2`. `middleman1`은 포켓몬마니아 남이라 갈래로 이미 이어졌다 —
  // 남은 어른 남자가 BDSP에도 하나뿐이다 (`father`·`fat`은 따로 있다)
  MIDDLE_AGED_MAN: 'man',
  // `assistantw` — 연구실 조수 여자. BDSP의 여자 연구원이 하나뿐이다
  SCIENTIST_F: 'researcherF',
  // `girl4`. `girl1`~`girl3`은 전부 트레이너 갈래로 이어졌다
  SNOWPOINT_NPC_F: 'girl',
  // `mama` ↔ `mother`
  MOM: 'mother',
  // `baby` ↔ `baby`
  BABY_IN_PRAM: 'baby',

  // ⚠️ **여기 없는 것들은 「짝이 없어서」가 아니라 「둘 중 어느 쪽인지 몰라서」다.**
  // `KID_WITH_NDS`(`dsboy`)에 BDSP 아이가 `child`·`child2` 둘이고,
  // `MIDDLE_AGED_WOMAN`(`middlewoman2`)에 어른 여자가 `women2`·`women3`·`madam`
  // 셋이다. 어느 쪽인지 화면으로 확인하기 전에는 안 적는다 — 절반은 틀린다.
  //
  // `CASHIER_M`(`shopm1`)은 다르다. BDSP의 점원이 **여자 하나뿐**이라
  // (`clerk` — 화면에서 확인했다) 남자 점원에 붙일 몸이 아예 없다.
}

/**
 * 이 그림에 붙는 낱말. 못 찾으면 `null`.
 *
 * 글자가 같은 것이 먼저고, 그다음이 손으로 적은 표다. 부분 일치는 안 본다
 */
export function modelTagFor(
  spriteName: string, vocabulary: readonly string[],
): string | null {
  const want = normalize(spriteName)
  for (const tag of vocabulary) {
    if (normalize(tag) === want) return tag
  }
  const alias = NPC_MODEL_ALIAS[spriteName]
  if (alias !== undefined && vocabulary.includes(alias)) return alias
  return null
}

/** 옷만 다른 같은 사람이 여럿이면 어느 것부터 구울지 */
function tagOrder(set: BundleSet, tag: string): string[] {
  // ⚠️ **갈래를 둘 든 번들은 뒤로 민다.** `pc0001_12`가 `["hero","heroine"]`이라
  // 이름순으로는 `heroine`의 첫 번째가 되는데, 그건 남주 옷 번들에 여주 텍스처가
  // 섞여 든 것이라 **구우면 터진다.** 갈래를 하나만 든 번들이 그 사람 본체다
  const alone = (b: string): boolean => (set.bundles[b] ?? []).length === 1
  const all = [...(bundlesByTag(set).get(tag) ?? [])].sort()
  return [...all.filter(alone), ...all.filter((b) => !alone(b))]
}

/**
 * 이 그림에 세울 모델.
 *
 * 갈래로 이어지면 **BDSP가 적어 둔 그 번들**을 쓴다. 갈래가 없는 사람만
 * 낱말로 찾고, 그때는 등신을 먼저 보고 없으면 치비로 내려간다 — 판때기보다는
 * 낫기 때문이다
 */
export function modelFor(
  spriteName: string, table: NpcModelTable, spriteID?: number,
): NpcModelRef | null {
  const cls = classOfSprite(spriteName, spriteID)
  const bundle = cls === null ? undefined : BUNDLE_BY_CLASS.get(cls)
  if (bundle !== undefined) {
    const twin = `fc${bundle.slice(2)}`
    const order = [bundle, ...(twin in table.field.bundles ? [twin] : [])]
    return { bundles: order, via: `${TRAINER_CLASS_NAMES[cls!]} · ${WHY_CLASS.get(cls!) ?? ''}` }
  }
  for (const build of ['battle', 'field'] as const) {
    const tag = modelTagFor(spriteName, table[build].vocabulary)
    if (tag === null) continue
    const order = tagOrder(table[build], tag)
    if (order.length > 0) return { bundles: order, via: `이름표 ${tag}` }
  }
  return null
}

/** BDSP 번들 → 굽는 자리. `tr`·`pc`는 등신, `fc`는 치비다 */
export function buildOf(bundle: string): 'battle' | 'field' {
  return bundle.startsWith('fc') ? 'field' : 'battle'
}

/**
 * 이름이 붙은 번들 몇 개.
 *
 * 번호만 있는 이름이라 코드에서 안 읽히므로 여기 한 번 적어 둔다. 값은
 * 근거표에서 가져오므로 표가 바뀌면 여기도 따라 바뀐다
 */
export const NPC_BUNDLE = {
  /** 광휘 */
  hero: BUNDLE_BY_CLASS.get(CLASS_BY_KEY.get('playerm') ?? -1) ?? 'pc0001_00',
  /** 빛나 */
  heroine: BUNDLE_BY_CLASS.get(CLASS_BY_KEY.get('playerf') ?? -1) ?? 'pc0002_00',
  /** 용식 */
  rival: BUNDLE_BY_CLASS.get(CLASS_BY_KEY.get('rival') ?? -1) ?? 'tr0002_00',
  /** 신사 — 인트로에서 마박사 대역이다 */
  gentleman: BUNDLE_BY_CLASS.get(CLASS_BY_KEY.get('gentleman') ?? -1) ?? 'tr0046_00',
} as const

/** 이 트레이너 갈래가 배틀에서 쓸 번들. 없으면 `null` */
export function trainerModelBundle(trainerClass: number | null): string | null {
  if (trainerClass === null) return null
  return BUNDLE_BY_CLASS.get(trainerClass) ?? null
}
