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
interface BundleSet {
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
interface NpcModelRef {
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

  // ⚠️ **둘 중 어느 쪽인지 몰라 비워 둔 자리는 `NPC_MODEL_BUNDLE`로 간다.**
  // 여기는 여전히 낱말이 같은 것만 적는다
}

/**
 * **눈으로 고른 짝** — 그림 이름 → 번들을 곧바로 적는다.
 *
 * 앞의 세 길(갈래 이름 · 배치표 · 낱말)이 다 못 답하는 자리가 있다. 트레이너가
 * 아니라 갈래가 없고, 같은 낱말을 달고 있는 사람이 BDSP 쪽에 여럿이라 낱말만
 * 보고는 절반을 틀린다 — `MIDDLE_AGED_WOMAN`의 `madam`이 `tr0047_00`(트레이너
 * 마담) · `fc0047_00` · `fc2023_00` 셋에 다 붙어 있다.
 *
 * 그래서 근거가 **후보를 다 3D로 찍어 나란히 놓고 사람이 고른 것**이다
 * (`.audit/plateReview.html` · `.audit/renderCands.mjs`가 만든다). 짐작이 아니라
 * 본 것이므로 낱말보다 세고, 줄마다 무엇을 보고 골랐는지 적는다.
 *
 * ⚠️ **갈래가 있는 그림은 여기 적지 않는다.** BDSP가 제 답을 적어 둔 자리를
 * 눈으로 덮으면 근거가 약해진다 — `npcModels.test`가 이 줄을 지킨다
 */
export const NPC_MODEL_BUNDLE: Readonly<Record<string, string>> = {
  // 남자 점원. BDSP에 점원은 여자 하나뿐이라(`clerk`) 점원을 **다 여자로
  // 통일한다** — 자리가 같은 `TEALA`·`CASHIER_F`와 같은 몸이 된다
  CASHIER_M: 'fc2024_00',
  // 체육관 안내원. 갈색 머리·둥근 색안경·베이지 조끼에 보라 소매까지 같다
  GYM_GUIDE: 'fc2014_00',
  // 갤럭시단 무리. 원작은 넷·셋이 **그림 한 장**인데 그 자리에 단원을
  // **한 명만** 세운다. `galacticM`은 갈래로 이미 서 있는 그 단원이다
  GRUNTS_GROUP_OF_4: 'fc1073_00',
  GRUNTS_GROUP_OF_3: 'fc1073_00',
  // 프런티어 안내원 셋. 원작 이름표가 `bfsm`(남)·`bfsw1`·`bfsw2`(여)로
  // 갈리는데 그림으로는 갈래가 안 읽힌다. **다른 안내원을 가져다 세운다** —
  // 이미 서 있는 접수원 둘로 나눈다
  FRONTIER_BOOTH_ATTENDANT: 'fc2015_00',
  FRONTIER_SINGLE_ATTENDANT: 'fc2015_00',
  FRONTIER_MULTI_ATTENDANT: 'fc2012_00',
  // 마박사. 흰 머리·콧수염·갈색 코트에 **서류가방**까지 들고 있다.
  // `doctor00`·`doctor01`·`doctor02` 셋 중 어느 쪽인지 못 짚던 자리다 —
  // 열어 보니 `doctor01`(`fc2003_01`)은 키 0.106짜리라 **사람이 아니다**
  PROF_ROWAN: 'fc2003_00',
  // 오박사. 남은 흰 가운 박사다
  PROF_OAK: 'fc2004_00',
  // 신비한 선물 배달원. 원작은 초록 모자에 초록 제복이고, BDSP에서
  // 모자 쓴 제복은 `police` 하나다
  MYSTERY_GIFT_DELIVERYMAN: 'fc0039_00',
  // NDS 든 아이. `child`·`child2` 중 못 고르겠다던 자리인데, 열어 보니
  // `child`가 **게임기를 들고 있다** — 든 물건까지 같은 자리다
  KID_WITH_NDS: 'fc2017_00',
  // 중년 여자. 보라 올림머리에 보라 옷 — 머리 모양까지 같다.
  // ⚠️ `madam` 낱말은 `tr0047_00`에도 붙어 있어서 낱말로 찾으면 트레이너
  // 마담이 온다. 번들을 곧바로 적는 이유가 이것이다
  MIDDLE_AGED_WOMAN: 'fc2023_00',
  // 눈설탕시티 남자
  SNOWPOINT_NPC_M: 'fc2028_00',

  // ⚠️ **핸섬과 플루토는 BDSP에 몸이 없다** — 필드 161벌·배틀 124벌을 다 세었고
  // 이름표가 안 붙은 셋(`fc1008_01`·`fc2039_00`·`fc2044_00`)까지 열어 봤다
  // (`.audit/lookerCharonCands.mjs`). 그래서 남의 몸을 **다시 칠해서** 세운다 —
  // 아래 `NPC_RECOLOR`가 임자고, 이름 뒤에 붙는 꼬리가 그 판을 가리킨다
  LOOKER: 'fc2009_00-looker',
  CHARON: 'fc1041_00-charon',
}

/** 다시 칠한 판 하나 */
interface Recolor {
  /** 머티리얼 → 레이어 프로퍼티 → 감마 `#rrggbb` */
  paint: Readonly<Record<string, Readonly<Record<string, string>>>>
  /** 아예 안 그릴 재질. 모자를 벗길 때 쓴다 */
  drop?: readonly string[]
  /** 왜 이 값인가 */
  why: string
}

/**
 * **레이어 색을 갈아 끼워 만드는 몸.** 키는 `번들-꼬리` 꼴이다.
 *
 * BDSP 인물은 색을 텍스처가 아니라 머티리얼에 둔다 —
 * `albedo = _MainTex(음영) × 레이어색[_MaskTex 채널]`(IMPORT의 `GROUP_FORMAT`
 * `npcModels` 5판). 그래서 레이어 색만 바꾸면 **음영이 그대로 살아 있는 채로**
 * 부위 색이 바뀐다. 위에 물감을 덧칠하는 것이 아니다.
 *
 * ⚠️ **색을 눈으로 고르지 않는다.** 목표는 롬 그림 앞모습에서 그 부위 픽셀의
 * 선형 평균이고(`.audit/spriteRegions.py`), 넣는 값은
 * **목표 ÷ 그 채널의 음영 평균**을 푼 것이다(`.audit/recolorSolve.py`). 그래서
 * 줄마다 「넣는 값 → 화면에 나올 색」이 적혀 있고 뒤엣것이 롬에서 잰 값이다.
 *
 * ⚠️ **원래 번들은 그대로 남는다.** `fc2033_01`은 게임디렉터(그림 242)가 쓰고
 * 있어서, 다시 칠한 것을 같은 이름으로 구우면 그 사람까지 바뀐다. 그래서 꼬리
 * 붙은 이름으로 따로 굽는다 — `baseBundle`이 원본 자리를 되돌려 준다
 */
export const NPC_RECOLOR: Readonly<Record<string, Recolor>> = {
  // 핸섬 — 국제경찰. **무릎까지 오는 코트를 입은 남자**가 BDSP에 리오와
  // 갬블러 둘뿐이고, 그중 모자가 따로 떨어지는 것이 리오다 (갬블러의 중절모는
  // `wear`에 붙어 있어 못 뗀다). `wear`의 두 채널이 코트 위(Skin 56%)와
  // 아래(Primary 38%)라 둘 다 코트 색으로 간다
  // (마스크를 열어 봤다: `.audit/mask-fc2009-wear.png`)
  'fc2009_00-looker': {
    drop: ['hat'],                          // 리오의 챙 넓은 모자. 원작에 없다
    paint: {
      hair: { _PrimaryColor: '#525247' },   // → #46463f 검은 머리
      wear: {
        _SkinColor: '#6f5932',              // → #594628 갈색 트렌치코트 (위)
        _PrimaryColor: '#6f5932',           // → #594628 같은 코트 (아래·자락)
      },
    },
    why: '롬 그림 213 앞모습에서 잰 부위 평균색',
  },
  // 플루토 — 갤럭시단 간부. 흰 가운에 안경 쓴 노인이라 연구원 몸에서 뜬다.
  // `hair`는 마스크가 100% Primary라 한 값으로 통째로 바뀐다
  'fc1041_00-charon': {
    paint: { hair: { _PrimaryColor: '#9b93d0' } },  // → #8b83bb 연보라 머리
    why: '롬 그림 214 앞모습에서 잰 머리 픽셀 88개의 평균색',
  },
}

/**
 * 꼬리를 뗀 진짜 번들 이름. 다시 칠한 판도 원본은 BDSP의 그 번들이다.
 *
 * ⚠️ **BDSP 번들 이름에는 `-`가 없다** (`fc0001_00`처럼 밑줄뿐이다). 그래서
 * 꼬리를 가르는 글자로 쓸 수 있다
 */
export function baseBundle(bundle: string): string {
  const cut = bundle.indexOf('-')
  return cut < 0 ? bundle : bundle.slice(0, cut)
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
 * 낫기 때문이다. 셋 다 못 답하는 자리는 눈으로 고른 표(`NPC_MODEL_BUNDLE`)가
 * 받는다
 */
export function modelFor(
  spriteName: string, table: NpcModelTable, spriteID?: number,
): NpcModelRef | null {
  const picked = NPC_MODEL_BUNDLE[spriteName]
  if (picked !== undefined && baseBundle(picked) in table[buildOf(picked)].bundles) {
    const paint = NPC_RECOLOR[picked]
    return { bundles: [picked], via: paint ? `다시 칠했다 · ${paint.why}` : '화면으로 골랐다' }
  }
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

/** BDSP 번들 → 굽는 자리. `tr`·`pc`는 등신, `fc`는 치비다 (꼬리는 안 본다) */
export function buildOf(bundle: string): 'battle' | 'field' {
  return bundle.startsWith('fc') ? 'field' : 'battle'
}

/**
 * 등신 몸(`tr*`·`pc*`)에서 실을 클립.
 *
 * 몸 하나에 여덟이 오는데 배틀에서 이어 붙일 자리가 있는 것은 셋이다 —
 * 등장 · 지시 · 패배(`scene/battle/BattleTrainers`). 나머지 다섯은 안 싣는다:
 * `wait_b`·`wait02_b`·`speak01_b`·`eye01_b`는 이어 붙일 자리가 없고
 * `advent02_b`는 **움직이는 채널이 0**이라 실어도 아무것도 안 한다
 * (PLAN.md의 클립 표가 여덟을 다 재 두었다).
 *
 * ⚠️ **굽는 쪽 둘이 이것을 같이 본다.** `tools/extract/npcModels.mjs`는
 * `.source`를 파이썬 `re`에 그대로 넘기고(`bdspGlb.py --clip-filter`),
 * `src/import/bdsp/convert.ts`는 이 정규식을 그대로 쓴다. 따로 적으면
 * 개발 서버와 설치본이 다른 클립을 싣는다
 */
export const TRAINER_CLIPS = /^(advent_b|order_b|lose01_b)$/

/**
 * 주인공 몸에 **치비에서 옮겨 실을** 필드 동작 클립 열여섯.
 *
 * 등신 몸(`pc0001_00`·`pc0002_00`)에 붙은 스물 몇은 전부 배틀 동작이라 낚시도
 * 폭포도 없다. 필드 동작은 치비(`fc0001_00`·`fc0002_00`)에만 있고, 쉬는 자세가
 * 서로 다른 두 리그라 **로컬 회전을 복사하면 안 된다** — 옮기는 수식은
 * `import/bdsp/retarget.ts`에 있다.
 *
 * 걷기·뛰기는 여기 없다. `actor/locomotion`이 뼈를 직접 돌려 만드는 것이고
 * (걸음이 속도에 묶여야 발이 안 미끄러진다), 그 자리를 클립으로 바꾸는 것은
 * 이 줄의 몫이 아니다.
 *
 * ⚠️ **굽는 쪽 둘이 이것을 같이 본다.** `tools/extract/npcModels.mjs`가
 * `bdspGlb.py --only`에 쉼표로 넘기고, `src/import/bdsp/convert.ts`가 같은
 * 목록을 `borrowOnly`로 넘긴다. 따로 적으면 개발 서버와 설치본이 다른 클립을
 * 싣는다
 */
export const HERO_FIELD_CLIPS = [
  // 낚시 (`engine/actor/fishing`의 단계와 짝이 맞는다)
  'fishing_start_f', 'fishing_loop_f', 'fishing_hit_f', 'fishing_hit_loop_f',
  'fishing_finish_f', 'fishing_finish_success_f', 'fishing_finish_success_loop_f',
  // 폭포오르기
  'waterfall_in_f', 'waterfall_loop_f', 'waterfall_end_f',
  // 락클라임. ⚠️ **`climb_down_f`는 안 싣는다** — 원작에서 `climb_up_f`와 키
  // 140개까지 바이트로 같은 자료다. 오르내림은 몸이 도는 것으로 갈린다
  'climb_up_f',
  // 공중날기
  'fly_on_f', 'fly_off_f',
  // 물주기 (`scene/berryPatches`)
  'watering_f', 'watering_loop_f', 'watering_end_f',
] as const

/**
 * 이 번들에 필드 동작을 꿔 줄 치비 번들. 없으면 `null`.
 *
 * 주인공 둘만이다 — 다른 사람은 오버월드에서 낚시도 폭포도 안 한다
 */
export function fieldClipDonor(bundle: string): string | null {
  if (bundle !== NPC_BUNDLE.hero && bundle !== NPC_BUNDLE.heroine) return null
  return `fc${bundle.slice(2)}`
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
