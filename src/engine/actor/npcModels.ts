// 플래티넘 NPC 그림 → BDSP 인물 모델 (DATA.md §2.16)
//
// 플래티넘 오버월드 NPC는 판때기 그림이고 이름이 `BUG_CATCHER`처럼 **뜻으로**
// 붙어 있다(디컴프). BDSP는 같은 신오를 3D로 다시 만든 것이라 같은 사람들이
// 들어 있는데 번들 이름은 `fc1006_00`처럼 번호다. 다만 번들 **안**의 텍스처
// 이름에 갈래가 적혀 있어서(`fc1006_00_bugcatcher_body_col`) 그것으로 잇는다.
//
// ⚠️ **비슷한 이름으로 이으면 안 된다.** 느슨하게 맞춰 봤더니 48쌍이 붙었는데
// 그중 `PARASOL_LADY → lady`(진짜는 `parasollady`)와 `MIDDLE_AGED_WOMAN → man`이
// 섞여 있었다. 부분 문자열은 그럴듯한 오답을 만든다.
//
// 그래서 두 갈래만 쓴다:
//
//   ① **글자가 같은 것.** 두 자료가 독립적으로 같은 낱말을 골랐다는 뜻이라
//      더 볼 것이 없다. 32쌍이 여기에 떨어진다.
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

export interface NpcModelTable {
  /** 번들 → 그 안에 든 갈래 낱말들 */
  bundles: Readonly<Record<string, readonly string[]>>
  vocabulary: readonly string[]
}

/** 갈래 낱말 → 그 낱말이 든 번들들. 옷만 다른 같은 사람이 여럿일 수 있다 */
export function bundlesByTag(table: NpcModelTable): Map<string, string[]> {
  const out = new Map<string, string[]>()
  for (const [bundle, tags] of Object.entries(table.bundles)) {
    for (const tag of tags) {
      const list = out.get(tag)
      if (list) list.push(bundle)
      else out.set(tag, [bundle])
    }
  }
  return out
}

/**
 * 이 그림에 붙는 BDSP 갈래. 못 찾으면 `null`.
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
