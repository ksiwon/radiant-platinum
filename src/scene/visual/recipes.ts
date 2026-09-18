// 검수된 표현 레시피 (FIRST_PERSON §4.1·§4.6)
//
// ⚠️ **여기 오른 것만 게임에 걸린다.** 자동 분류가 맞아 보인다고 올리지 않는다 —
// 확대 원본 · 원본 판 · 대체 모델을 나란히 보고 뜻이 맞을 때 `verified`로 바꾼다
// (§12 「티켓별 제출 형식」). 초안은 `candidate` 모드에서만 돈다.
//
// ⚠️ **선택자는 그림 지문까지 본다.** 같은 이름의 그림이 묶음마다 다른 픽셀인 것이
// 92종이다(`.audit/first-person/coverage.json`). 이름만으로 옮기면 남의 그림에
// 레시피가 걸린다.
import type { RecipeMode } from './resolve'
import type { VisualRecipe } from './types'

const PLANTER_SHAPE = {
  version: 1,
  semantic: 'planter',
  outcome: 'replace',
  geometry: 'planter',
  materialProfile: 'rom-lit',
  anchor: 'ground-contact',
  provenance: '위치·폭·색은 원본 판과 화분 칸 텍셀. 용기 깊이·절두체 비율·식물 높이는 §6.1 시제품 초기값',
} as const

/**
 * **imped 사각 화분** (§6.1) — 검수됨.
 *
 * 지문 `c92159ee`는 축복시티(묶음 6)를 비롯한 17묶음의 화분 칸이다. 같은 칸이 묶음
 * 14·17에서는 화분이 아니라서 **지문으로만** 건다. 판이 정확히 45°일 때만 — 같은 칸
 * 16조각이 다른 각으로 서 있다.
 *
 * 검수 (2026-09-17, `docs/orders/FIRST_PERSON_FP_20260917.md` FP-02): 원본 칸 대지 ·
 * 축복시티 1·3인칭 전후 · WebGPU와 WebGL · 축복·영원·무쇠 세 도시 · 걷기
 */
const IMPED_PLANTER: VisualRecipe = {
  ...PLANTER_SHAPE,
  id: 'imped-planter',
  review: 'verified',
  selectors: [{
    kind: 'chunk', tex: 'imped', pal: 'imped',
    regionHashes: ['c92159ee'],
    within: [32, 32, 48, 48],
    leanDeg: [44.8, 45.2],
  }],
}

/**
 * 같은 화분의 **묶음 0 그림**(`e1000013`) — 초안. 묶음 0은 맵 `EVERYWHERE`·`NOTHING`만
 * 써서 플레이에서 볼 자리가 없다. 색 자리만 시험으로 맞춰 두었다
 */
const IMPED_PLANTER_SET0: VisualRecipe = {
  ...PLANTER_SHAPE,
  id: 'imped-planter-set0',
  review: 'draft',
  selectors: [{
    kind: 'chunk', tex: 'imped', pal: 'imped',
    regionHashes: ['e1000013'],
    within: [32, 32, 48, 48],
    leanDeg: [44.8, 45.2],
  }],
}

/**
 * **imped 둥근 식생** (§3 — 사각 화분으로 단정 금지) — 검수됨.
 *
 * 지문 `7bdd6519`는 화분 `c92159ee`와 같은 17묶음의 덤불 칸이다. 212번도로 북쪽(묶음 12)에서
 * 칸을 텍셀로 읽었다 — 네모 틀 없이 잎 다섯 단계와 밑 그늘(`#6b6b7b`)이다.
 *
 * 검수 (2026-09-17): 칸 텍셀 · 212번도로 정원 1인칭 멀리·가까이 전후 · WebGPU와 WebGL.
 * 걷기는 아직 안 봤다
 */
const IMPED_SHRUB: VisualRecipe = {
  id: 'imped-shrub',
  version: 1,
  semantic: 'shrub',
  outcome: 'replace',
  geometry: 'shrub',
  materialProfile: 'rom-lit',
  anchor: 'ground-contact',
  review: 'verified',
  selectors: [{
    kind: 'chunk', tex: 'imped', pal: 'imped',
    regionHashes: ['7bdd6519'],
    within: [48, 32, 64, 48],
    leanDeg: [44.8, 45.2],
  }],
  provenance: '위치·폭·색은 원본 판과 덤불 칸 텍셀. 높이(폭의 0.62)와 링 모양은 초기값',
}


/**
 * **bf_ueki01 둥근 덤불** (§3) — 16×16 한 장이 통째로 덤불이다.
 *
 * 묶음 72에서 96조각이 **바위 정이십면체**로 갔다. 칸을 텍셀로 읽으면 `imped`
 * 덤불과 같은 꼴이다 — 잎 다섯 단계(`#a5f75a`…`#217b39`)에 밑줄 그늘이 같은
 * `#6b6b7b`다(실측 2026-09-17). 그래서 색 읽는 자리도 같은 함수를 쓴다
 */
const BF_UEKI_SHRUB: VisualRecipe = {
  id: 'bf-ueki01-shrub',
  version: 1,
  semantic: 'shrub',
  outcome: 'replace',
  geometry: 'shrub',
  materialProfile: 'rom-lit',
  anchor: 'ground-contact',
  review: 'verified',
  selectors: [{
    kind: 'chunk', tex: 'bf_ueki01', pal: 'bf_ueki01_pl',
    regionHashes: ['592b8dc1'],
    within: [0, 0, 16, 16],
    leanDeg: [44.8, 45.2],
  }],
  provenance: '위치·폭·색은 원본 판과 16×16 칸 텍셀. 높이(폭의 0.62)와 링은 imped 덤불과 같은 초기값',
}

/**
 * **원작이 세워 둔 그림은 세운다** (§3 · FP-02).
 *
 * `plateLumps`는 눕힌 45°(63.4°) 사각형 중 그림 칸의 좌우 끝이 안 찬 것을
 * **덩이**로 보고 바위로 부풀린다. 담과 바위를 가르려고 만든 잣대인데, 그림 한
 * 장이 통째로 **한 물건의 앞모습**인 자산까지 같이 걸렸다 — 자전거 거치대가
 * 초록 바위가 되고 금빛 기둥이 바위가 된다.
 *
 * 그런 그림은 새 모델을 만들 것이 아니라 **원작처럼 세우면 된다.** 그래서
 * `outcome: 'keep'` · `geometry: 'original'`이다 — 지우는 것도 더하는 것도 없고,
 * 덩이로 가는 길만 막는다.
 *
 * ⚠️ **이름으로 안 고른다.** 같은 잣대에 걸린 `c07_meteo`(운석)와 `imped`의
 * 아래 칸들은 **진짜 바위**라 그대로 둔다. 여기 오른 여덟은 그림을 눈으로 보고
 * 고른 것이고(`.audit/first-person/rock-row-props.html`), 지문으로 잠근다
 */
const STAND_SHAPE = {
  version: 1,
  outcome: 'keep',
  geometry: 'original',
  materialProfile: 'cutout-lit',
  anchor: 'source-local',
  review: 'verified',
} as const

const STANDING_PROPS: readonly VisualRecipe[] = [
  {
    ...STAND_SHAPE,
    id: 'area07-hei-h3-pillar',
    semantic: 'sign',
    selectors: [{
      kind: 'chunk', tex: 'area07_hei_h3', pal: 'area07_hei_h3_pl',
      regionHashes: ['61acaee9'], within: [0, 0, 16, 32], leanDeg: [63.2, 63.7],
    }],
    provenance: '금빛 기둥 — 1×2칸 그림 한 장이 기둥 앞모습이다. 원작 그림을 그대로 세운다',
  },
  {
    ...STAND_SHAPE,
    id: 'yomawaru-plate',
    semantic: 'decal',
    selectors: [{
      kind: 'chunk', tex: 'yomawaru.1', pal: 'yomawaru2',
      regionHashes: ['e1d70931'], within: [0, 0, 16, 32], leanDeg: [44.8, 45.2],
    }],
    provenance: '다크펫 그림. 여럿이 이어진 것은 이미 담으로 남고 홀로 선 것만 덩이가 됐다',
  },
  {
    ...STAND_SHAPE,
    id: 'cyclestop-sign',
    semantic: 'sign',
    selectors: [{
      kind: 'chunk', tex: 'cyclestop', pal: 'cyclestop',
      regionHashes: ['c2edcf16'], within: [0, 0, 16, 16], leanDeg: [44.8, 45.2],
    }],
    provenance: '자전거 거치대 표지 — 묶음 6·7·8이 픽셀까지 같은 그림이다 (지문 하나)',
  },
  {
    ...STAND_SHAPE,
    id: 'numa-ki-plant',
    semantic: 'planter',
    selectors: [{
      kind: 'chunk', tex: 'numa_ki', pal: 'numa_ki_pl',
      regionHashes: ['03d20ebb'], within: [1, 1, 31, 32], leanDeg: [44.8, 45.2],
    }],
    provenance: '대야에 심은 잎 넓은 풀. 화분 모델을 씌우기에는 그릇 모양이 달라 원본 그림을 세운다',
  },
  {
    ...STAND_SHAPE,
    id: 'saku-rail',
    semantic: 'fence',
    selectors: [{
      kind: 'chunk', tex: 'saku', pal: 'saku',
      regionHashes: ['2793ef24'], within: [0, 0, 32, 16], leanDeg: [44.8, 45.2],
    }],
    provenance: '2×1칸 회색 가로대. 이름(saku=울타리)과 그림이 같은 것을 말한다',
  },
  {
    ...STAND_SHAPE,
    id: 'tesuri05-statue',
    semantic: 'sign',
    selectors: [{
      kind: 'chunk', tex: 'm_bf04_tesuri05', pal: 'tesuri05',
      regionHashes: ['88b3bae3'], within: [0, 0, 12, 16], leanDeg: [44.8, 45.2],
    }],
    provenance: '받침 위 금빛 조각상',
  },
  {
    ...STAND_SHAPE,
    id: 'bf-zou-statue',
    semantic: 'sign',
    selectors: [{
      kind: 'chunk', tex: 'bf_zou', pal: 'bf_zou_pl',
      regionHashes: ['c13f49f8'], within: [0, 0, 64, 64], leanDeg: [44.8, 45.2],
    }],
    provenance: '조각상 — 칸이 그림 아래쪽으로 감기므로 그림 한 장 전체를 지문으로 잠근다',
  },
  {
    ...STAND_SHAPE,
    id: 'mic-stand',
    semantic: 'sign',
    selectors: [{
      kind: 'chunk', tex: 'mic', pal: 'mic',
      regionHashes: ['2633eb4c'], within: [0, 0, 16, 16], leanDeg: [44.8, 45.2],
    }],
    provenance: '마이크 스탠드',
  },
]

/**
 * **imped 말뚝 울타리** (§6.2 · FP-03).
 *
 * 지문 `ad611b1d`(묶음 6~18 등 12묶음 · 흰색)와 `270d4b6d`(묶음 14·62 · 푸른 회색)는
 * 짜임이 같다 — 8텍셀마다 기둥, 가로대 둘. 세워지는 울타리 배치의 83%다. 사슬 말뚝
 * (`8feb19f7` 묶음 19)과 초록 말뚝(`e3243c1d` 묶음 17)은 짜임이 달라 안 건다.
 * 판이 정확히 45°일 때만 (`plates.leaning`이 세우는 그 판).
 *
 * 화면으로 본 곳 — 무쇠시티(묶음 7 · 흰색, 앞·뒤·걷기)와 선단시티(묶음 14 · 푸른
 * 회색, 4칸·1칸·반칸 토막). 반칸 토막도 기둥 하나가 제대로 선다
 */
const IMPED_FENCE: VisualRecipe = {
  id: 'imped-fence',
  version: 1,
  semantic: 'fence',
  outcome: 'replace',
  geometry: 'fence',
  materialProfile: 'rom-lit',
  anchor: 'ground-contact',
  review: 'verified',
  selectors: [{
    kind: 'chunk', tex: 'imped', pal: 'imped',
    regionHashes: ['ad611b1d', '270d4b6d'],
    within: [0, 0, 64, 16],
    leanDeg: [44.8, 45.2],
  }],
  provenance: '자리·길이·기둥 간격·높이·색은 원본 판과 울타리 칸 텍셀. 기둥·가로대 깊이는 §6.2 초기값',
}

/**
 * **imped 볼라드(말뚝) — 사슬 갈래** (FP-05).
 *
 * 묶음 19(`8feb19f7` · 배치 314)는 울타리와 같은 칸을 쓰지만 **가로대가 없다**.
 * 8텍셀마다 흰 말뚝이 서고 기둥 사이 행 6에 사슬 한 줄, 밑에 넓은 받침이 있다
 * (텍셀 실측). 파이트에리어·리조트에리어와 228~232번도로에 선다
 */
const IMPED_BOLLARD_CHAIN: VisualRecipe = {
  id: 'imped-bollard-chain',
  version: 1,
  semantic: 'bollard',
  outcome: 'replace',
  geometry: 'bollard-chain',
  materialProfile: 'rom-lit',
  anchor: 'ground-contact',
  review: 'verified',
  selectors: [{
    kind: 'chunk', tex: 'imped', pal: 'imped',
    regionHashes: ['8feb19f7'],
    within: [0, 0, 64, 16],
    leanDeg: [44.8, 45.2],
  }],
  provenance: '자리·길이·기둥 간격·높이·사슬 높이·색은 원본 판과 칸 텍셀. 깊이는 §6.2 초기값',
}

/**
 * **imped 볼라드 — 풀 갈래** (FP-05).
 *
 * 묶음 17(`e3243c1d` · 배치 29)은 사슬이 없고 **기둥 밑을 풀이 덮는다** (행 9~14가
 * 초록 세 단계고 말뚝마다 무늬가 다르다). 225~227번도로와 서바이벌에리어에 선다
 */
const IMPED_BOLLARD_GRASS: VisualRecipe = {
  ...IMPED_BOLLARD_CHAIN,
  id: 'imped-bollard-grass',
  geometry: 'bollard-grass',
  selectors: [{
    kind: 'chunk', tex: 'imped', pal: 'imped',
    regionHashes: ['e3243c1d'],
    within: [0, 0, 64, 16],
    leanDeg: [44.8, 45.2],
  }],
  provenance: '자리·길이·기둥 간격·높이·색은 원본 판과 칸 텍셀. 풀 덩이 비율은 §6.1 계열의 초기값',
}

/**
 * **화분에 심은 작은 나무** (`plant01`) — 나무 카드는 소품 85에만 있다, 배치 191 (FP-07).
 * 같은 그림을 쓰는 소품 86·522는 오른쪽 색 칸만 찍는 화분이다 (목록 실측).
 *
 * 그림 칸(32×32)의 왼쪽 반이 **잎 무성한 나무 한 장**(초록 다섯 · 줄기 갈색 셋)이고,
 * 오른쪽 띠의 분홍 `#d6639c`·노랑 `#ffbd5a`·청록 `#39ad84`은 **화분 면이 찍어 쓰는 색
 * 칸**이다 (텍셀 실측). 나무는 한 장이 20° 기울어 서 있을 뿐이라 옆에서 보면 종이다 —
 * 기준선에서 눈으로 본 결함 「센터 왼쪽 화분 소품이 납작한 판」이 이것이다.
 *
 * ⚠️ **나무 칸만 맡는다** (`within` 0,0,16,32 · 선 판만). 화분 윗면은 칸이 오른쪽 띠라
 * 안 걸린다 — 누운 면까지 90° 돌려 복제하면 같은 높이에 두 장이 겹친다.
 *
 * ⚠️ **덩이로 바꾸지 않는다.** 원본을 그대로 두고 **같은 카드를 등줄기 둘레로 90°
 * 돌려 한 벌 더** 세운다 — 새 색도 새 그림도 없다 (`propPlan` 머리말)
 */
const PLANT01_CROSS: VisualRecipe = {
  id: 'plant01-cross',
  version: 1,
  semantic: 'tree',
  outcome: 'augment',
  geometry: 'cross-cards',
  materialProfile: 'cutout-lit',
  anchor: 'source-local',
  review: 'verified',
  selectors: [{
    kind: 'prop', tex: 'plant01', pal: 'plant01',
    regionHashes: ['31186151'],
    within: [0, 0, 16, 32],
    // 선 판만 — 누운 면(90°)은 안 맡는다
    leanDeg: [0, 45],
  }, {
    // 같은 나무 카드가 **청크 332**(리조트 별장)에도 두 그루 선다 — 같은 칸·같은 지문
    // (FP-07 `tilted` 꼬리 · 청크 324는 색 칸만 찍는 화분이라 안 걸린다)
    kind: 'chunk', tex: 'plant01', pal: 'plant01',
    regionHashes: ['31186151'],
    within: [0, 0, 16, 32],
    leanDeg: [0, 45],
  }],
  provenance: '원본 카드를 그 등줄기(밑동을 지나는 카드 면 안의 기운 선) 둘레로 90° 돌린 사본. 새 좌표·색·그림 없음',
}

/**
 * **소품의 눕힌 카드를 세운다** (FP-07 `tilted` 꼬리 · `visual/propPlan.standProp`).
 *
 * 원작이 고정 카메라에서 서 보이라고 뒤로 눕힌 **그림 한 장이 곧 그 물건**인 소품이다.
 * 1인칭에서는 책이 기댄 판이 된다 — 제자리 화면으로 본 셋이다
 * (`shots/first-person/fp-tail`): 혼잡한 탑 묘비 · 체육관 입구 석상 · 배틀타워 조각상.
 *
 * ⚠️ **받침은 안 건드린다.** 석상·조각상의 받침은 진짜 입체고, 조각상 받침의 옆면(15.8°)도
 * 같은 그림을 쓰지만 `within`·`leanDeg`가 그 면을 뺀다
 */
const STAND_SHAPE_PROP = {
  version: 1,
  outcome: 'keep',
  geometry: 'stand-card',
  materialProfile: 'cutout-lit',
  anchor: 'source-local',
  review: 'verified',
} as const

const STANDING_PROP_CARDS: readonly VisualRecipe[] = [
  {
    ...STAND_SHAPE_PROP,
    id: 'tomb01-stand',
    semantic: 'sign',
    selectors: [{
      kind: 'prop', tex: 'tomb01', pal: 'tomb01',
      regionHashes: ['2a58c905'], within: [0, 0, 16, 16], leanDeg: [42, 43.5],
    }],
    provenance: '혼잡한 탑 묘비 (소품 492 · 배치 57) — 1칸 폭 그림 한 장이 비석 전체다',
  },
  {
    ...STAND_SHAPE_PROP,
    id: 'gym-obj1-statue',
    semantic: 'sign',
    selectors: [{
      kind: 'prop', tex: 'gym_obj1', pal: 'gym_obj1_pl',
      // 체육관 다섯 곳의 석상 모델(152·422·504·505·523)이 픽셀까지 같은 그림이다
      regionHashes: ['63f32386'], within: [0, 0, 32, 32], leanDeg: [35, 59],
    }],
    provenance: '체육관 입구 석상 — 받침(입체) 위에 얹은 석상 그림. 받침 앞 모서리에서 선다',
  },
  {
    ...STAND_SHAPE_PROP,
    id: 'bf-object01-statue',
    semantic: 'sign',
    selectors: [{
      kind: 'prop', tex: 'bf_object01', pal: 'bf_object01',
      // 칸 아래쪽 띠(v 0.75~)는 받침 면이 찍어 쓰는 색이다 — 조각상 그림만
      regionHashes: ['b7b228a7'], within: [0, 0, 32, 48], leanDeg: [44.8, 45.2],
    }],
    provenance: '배틀타워·배틀프런티어 조각상 (소품 548) — 45°로 눕힌 2칸 폭 그림',
  },
]

/**
 * **꿀나무** (소품 26 · 21그루 · FP-07 `tilted` 꼬리 · `visual/propPlan.propTree`).
 *
 * 그루터기 한 장(땅) + **55°로 눕혀 겹쳐 쌓은 잎 뭉치 세 장**이다 — 갈색 칸(26,28~64,64) ·
 * 황토 칸(0,0~34,30) · 노랑 칸(0,40~26,64). 고정 카메라에서는 둥근 금빛 나무로 보이지만
 * 1인칭에서는 기운 원판 세 장이다(`shots/first-person/fp-tail/eterna_283_526`).
 * 세 장을 청크 나무와 같은 입체 나무 하나로 바꾸고 그루터기는 둔다.
 * 잎 색은 카드마다 가장 많이 찍는 텍셀 (#c6ad39 · #ad9439 · #947b39), 줄기는 그루터기 갈색 #8c6331
 */
const HONEY_TREE: VisualRecipe = {
  id: 'honey-tree',
  version: 1,
  semantic: 'tree',
  outcome: 'replace',
  geometry: 'tree',
  materialProfile: 'rom-lit',
  anchor: 'ground-contact',
  review: 'verified',
  selectors: [
    { kind: 'prop', tex: 'treeeff01', pal: 'treeeff01_pl', regionHashes: ['d3b30bab'], within: [26, 28, 64, 64], leanDeg: [54, 56] },
    { kind: 'prop', tex: 'treeeff01', pal: 'treeeff01_pl', regionHashes: ['2c83014d'], within: [0, 0, 34, 30], leanDeg: [54, 56] },
    { kind: 'prop', tex: 'treeeff01', pal: 'treeeff01_pl', regionHashes: ['6adf1b67'], within: [0, 40, 26, 64], leanDeg: [54, 56] },
  ],
  provenance: '크기는 잎 카드 더미의 높이, 색은 잎 카드가 찍는 텍셀과 그루터기 칸. 새 색 없음',
}

export const VISUAL_RECIPES: readonly VisualRecipe[] = [
  IMPED_PLANTER, IMPED_PLANTER_SET0, IMPED_SHRUB, BF_UEKI_SHRUB, IMPED_FENCE,
  IMPED_BOLLARD_CHAIN, IMPED_BOLLARD_GRASS, PLANT01_CROSS, ...STANDING_PROPS,
  ...STANDING_PROP_CARDS, HONEY_TREE,
]

/**
 * 기본 게임이 쓰는 모드.
 *
 * `verified` 레시피가 하나도 없으면 `legacy`와 결과가 같다 — 그래서 기본값을
 * `verified`로 둬도 지금 화면이 안 바뀐다
 */
const DEFAULT_RECIPE_MODE: RecipeMode = 'verified'

/** 개발 비교 모드를 적어 두는 자리 (`sessionStorage`) — `firstPersonAudit --mode=candidate`가 쓴다 */
const RECIPE_MODE_KEY = 'pt.visualMode'

/**
 * 지금 쓸 모드. **개발판에서만** 바꿀 수 있다 (§4.6 — 사용자 메뉴에 안 낸다).
 *
 * `sessionStorage`라 `/play`로 넘어가도 남고 탭을 닫으면 사라진다. 못 읽으면 기본값이다
 */
export function recipeMode(): RecipeMode {
  if (!import.meta.env.DEV) return DEFAULT_RECIPE_MODE
  try {
    const v = globalThis.sessionStorage?.getItem(RECIPE_MODE_KEY)
    return v === 'legacy' || v === 'candidate' || v === 'verified' ? v : DEFAULT_RECIPE_MODE
  } catch {
    return DEFAULT_RECIPE_MODE
  }
}
