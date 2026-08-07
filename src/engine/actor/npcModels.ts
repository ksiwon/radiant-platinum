// 플래티넘 NPC 그림 → BDSP 인물 모델 (DATA.md §2.16)
//
// 플래티넘 오버월드 NPC는 판때기 그림이고 이름이 `BUG_CATCHER`처럼 **뜻으로**
// 붙어 있다(디컴프). BDSP는 같은 신오를 3D로 다시 만든 것이라 같은 사람들이
// 들어 있는데 번들 이름은 `tr1006_00`처럼 번호다. 다만 번들 **안**의 텍스처
// 이름에 갈래가 적혀 있어서(`tr0001_00_champion_body_col`) 그것으로 잇는다.
//
// ⚠️ **어느 뭉치를 쓰느냐가 먼저다.** BDSP 인물은 두 벌이다:
//
//   · `persons/battle/tr####` — **등신.** 배틀에 서는 몸이고 124벌 있다
//   · `persons/field/fc####`  — **치비.** 오버월드를 걸어 다니는 몸이고 161벌
//
// 우리는 등신을 쓴다(PLAN §4.3). BDSP가 혹평받은 대목이 치비 오버월드이고,
// 포켓몬 모델·3인칭 추적 카메라와 맞는 것도 등신이다. 처음에 치비 쪽을 먼저
// 훑어 표를 만들었는데 그건 **정해 둔 아트 방향과 반대**였다.
//
// 그래서 등신을 먼저 찾고, 거기 없는 사람만 치비에서 찾는다. 오버월드에만
// 있는 사람들(MAID, GAME_DIRECTOR)은 배틀 몸이 아예 없다 — 트레이너가 아니니
// 당연하다. 그 둘은 치비로라도 세우는 편이 판때기보다 낫다.
//
// ⚠️ **비슷한 이름으로 이으면 안 된다.** 느슨하게 맞춰 봤더니 그중
// `PARASOL_LADY → lady`(진짜는 `parasollady`)와 `MIDDLE_AGED_WOMAN → man`이
// 섞여 있었다. 부분 문자열은 그럴듯한 오답을 만든다.
//
// 그래서 두 갈래만 쓴다:
//
//   ① **글자가 같은 것.** 두 자료가 독립적으로 같은 낱말을 골랐다는 뜻이라
//      더 볼 것이 없다.
//   ② **아래 표에 손으로 적은 것.** 같은 낱말에 접사만 다르거나(`breederM`),
//      영어에서 같은 것을 가리키는 낱말이거나(fisherman ↔ angler)일 때만 적는다.
//
// 일본어 갈래 이름을 짚어야 아는 것들(EXPERT ↔ veteran? BEAUTY ↔ women?)은
// **일부러 비워 뒀다.** 여기서 지어내면 화면에 엉뚱한 사람이 선다.

/** 이름을 견줄 꼴로 — 소문자 글자만 남긴다 */
export function normalize(name: string): string {
  return name.toLowerCase().replace(/[^a-z]/g, '')
}

/**
 * 손으로 적은 짝.
 *
 * 왼쪽은 플래티넘 그림 이름, 오른쪽은 BDSP 번들 안의 갈래 낱말이다.
 * **근거를 못 대는 짝은 안 적는다** — 비어 있는 편이 틀린 것보다 낫다
 */
export const NPC_MODEL_ALIAS: Readonly<Record<string, string>> = {
  // 주인공 둘. BDSP도 제 주인공을 hero·heroine이라 부른다
  PLAYER_M: 'hero',
  PLAYER_F: 'heroine',
  // 같은 낱말에 성별 접사만 다르다
  POKEMON_BREEDER_M: 'breederM',
  POKEMON_BREEDER_F: 'breederF',
  PSYCHIC: 'psychicM',
  // 같은 낱말의 다른 꼴
  POLICEMAN: 'police',
  TWIN: 'twins',
  TUBER_M: 'tuber',
  TUBER_F: 'tuber',
  POKECENTER_NURSE: 'nursejoy',
  // 학생. school kid와 student가 같은 것을 가리킨다
  SCHOOL_KID_M: 'studentM',
  SCHOOL_KID_F: 'studentF',
  // 낚시꾼. fisherman과 angler가 같은 것을 가리킨다
  FISHERMAN: 'angler',
}

/** 번들 뭉치 하나 */
export interface BundleSet {
  /** 번들 → 그 안에 든 갈래 낱말들 */
  bundles: Readonly<Record<string, readonly string[]>>
  vocabulary: readonly string[]
}

export interface NpcModelTable {
  /** 등신. 먼저 여기서 찾는다 */
  battle: BundleSet
  /** 치비. 등신에 없는 사람만 여기서 찾는다 */
  field: BundleSet
}

/** 어느 뭉치의 누구인가 */
export interface NpcModelRef {
  build: 'battle' | 'field'
  tag: string
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
 * 이 그림에 붙는 갈래. 못 찾으면 `null`.
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

/**
 * 이 그림에 세울 모델. **등신이 먼저다.**
 *
 * 등신에 없으면 치비로 내려간다 — 판때기보다는 낫기 때문이다. 어느 쪽을 골랐는지
 * 함께 돌려주므로, 화면 쪽에서 "이 사람은 치비다"를 알 수 있다
 */
export function modelFor(spriteName: string, table: NpcModelTable): NpcModelRef | null {
  const full = modelTagFor(spriteName, table.battle.vocabulary)
  if (full !== null) return { build: 'battle', tag: full }
  const chibi = modelTagFor(spriteName, table.field.vocabulary)
  return chibi === null ? null : { build: 'field', tag: chibi }
}
