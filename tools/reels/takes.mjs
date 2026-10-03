// 트레일러의 장면들 — `docs/orders/REELS_20261003.md`의 큐 번호 그대로다
//
// `cp`는 확인 지점(`src/engine/dev/checkpoints.ts`), `steps`는 찍기 전에 세우는 것, `seconds`는 찍는 길이다.
// ⚠️ 야외는 `hour`를 꼭 준다 — 안 주면 실제 시계를 따라가 새벽에 찍은 장면이 밤이 된다(창기둥이 그랬다).
// 찍는 동안: `hold`(키를 누른 채 — 걷기), `move`(카메라 움직임 — `dolly` · `yaw`), `recKeys`(그 시각에 누를 키).
// 큐의 길이보다 넉넉히 찍고 묶을 때 자른다 (`assemble.mjs`의 `cut`). 자리는 `--still`로 한 장씩 찍어 맞춘다

export const TAKES = [
  // ── B. 마을 ──
  {
    id: 'B1-room', what: '방 — 어깨 높이에서 부감으로 크레인', cp: 'room',
    steps: [{ do: 'hour', hour: 9 }, { do: 'hideText' }],
    settle: 6000, seconds: 4.5,
    // 주인공 · TV 어깨 너머(눈높이) → 뒤 · 위로 끌어 올려 방 전체 부감 — 주인공 (8.5, 0, 5.5) · TV는 왼쪽 벽
    move: {
      type: 'dolly', seconds: 2.2,
      from: { eye: [9.6, 1.35, 6.9], gaze: [5.2, 1.0, 4.4] },
      to: { eye: [7.6, 5.4, 10.4], gaze: [6.8, 0.2, 5.0] },
    },
  },
  // 부감 팬 — 확인 지점은 주인공이 문 앞에서 북(−Z)을 보고 선다. `rel`은 주인공 자리 기준
  {
    id: 'B2-twinleaf', what: '떡잎마을 높은 부감 · 대각선 팬', cp: 'twinleaf', steps: [{ do: 'hour', hour: 11 }], seconds: 3,
    move: { type: 'dolly', rel: true, from: { eye: [-26, 16, 18], gaze: [-11, 0, -3] }, to: { eye: [-12, 16, 16], gaze: [-4, 0, -6] } },
  },
  {
    id: 'B3-jubilife', what: '축복시티 광장 높은 부감 · 위로 팬', cp: 'jubilife', steps: [{ do: 'hour', hour: 12 }], seconds: 3,
    move: { type: 'dolly', rel: true, from: { eye: [0, 24, 34], gaze: [0, 0, 4] }, to: { eye: [0, 24, 22], gaze: [0, 0, -8] } },
  },
  {
    id: 'B4-floaroma', what: '꽃향기마을 꽃밭 팬', cp: 'floaroma', steps: [{ do: 'hour', hour: 14 }], seconds: 3,
    move: { type: 'dolly', rel: true, from: { eye: [8, 9, 16], gaze: [-6, 0, 0] }, to: { eye: [-6, 9, 16], gaze: [-14, 0, -2] } },
  },
  {
    // B5 → B6 한 컷 — 3인칭으로 뒤따르며 풀숲에 들어가다가 V, 그대로 1인칭으로 걷는다 (문서 「시점」 첫 번째 전환)
    id: 'B5-switch', what: '201번도로 — 풀숲을 따라 걷다가 3인칭 → 1인칭', cp: 'grass',
    // 풀숲은 북으로 몇 칸뿐이고 그 뒤가 숲 벽이다 — 한 칸 들어가 서쪽으로 풀숲 줄을 따라 걷는다
    steps: [{ do: 'hour', hour: 15 }, { do: 'walk', key: 'ArrowRight', ms: 500 }, { do: 'walk', key: 'ArrowUp', ms: 1000 }],
    seconds: 3, hold: 'ArrowLeft', holdFor: 2.4, recKeys: [{ at: 0.9, key: 'KeyV' }],
    move: { type: 'yaw', at: 0.95, seconds: 0.4, from: 270, to: 270, pitch: -10 },
  },

  // ── C. 배틀 ── (키: 명령은 세로 목록 FIGHT·BAG·POKEMON·RUN, 기술도 세로 — ui/battle/BattleScreen.tsx)
  {
    id: 'C1-wild', what: '야생 배틀 등장 — 뒷모습 너머 꼬링크 · 내보내기까지', cp: 'grass',
    steps: [{ do: 'hour', hour: 15 }, { do: 'wild', species: 403, level: 5, after: 100 }],
    // 「나타났다!」 줄이 키를 기다린다 — 넘겨야 모부기가 나온다
    settle: 0, seconds: 8, recKeys: [{ at: 2.6, key: 'z' }, { at: 3.4, key: 'z' }, { at: 4.2, key: 'z' }],
  },
  {
    id: 'C3-move', what: '기술 — 모부기 흡수', cp: 'grass',
    steps: [{ do: 'hour', hour: 15 }, { do: 'wild', species: 403, level: 5, after: 100 }, { do: 'menu' }, { do: 'keys', keys: ['z', 'ArrowDown', 'ArrowDown'], gap: 500 }],
    settle: 200, seconds: 6, recKeys: [{ at: 0.2, key: 'z' }],
  },
  {
    id: 'C4-night', what: '밤 배틀 기술 — 몸통박치기', cp: 'grass-night',
    steps: [{ do: 'wild', species: 399, level: 5, after: 100 }, { do: 'menu' }, { do: 'keys', keys: ['z'], gap: 500 }],
    settle: 200, seconds: 6, recKeys: [{ at: 0.2, key: 'z' }],
  },
  {
    id: 'C5-cave', what: '동굴 무대 기술', cp: 'oreburgh-gate',
    steps: [{ do: 'wild', species: 74, level: 8, after: 100 }, { do: 'menu' }, { do: 'keys', keys: ['z'], gap: 500 }],
    settle: 200, seconds: 6, recKeys: [{ at: 0.2, key: 'z' }],
  },
  {
    id: 'C6-catch', what: '볼 던지기 → 빨려 듦 → 흔들림 → 잡힘', cp: 'grass',
    steps: [{ do: 'hour', hour: 15 }, { do: 'wild', species: 399, level: 2, after: 100 }, { do: 'menu' },
      // 가방이 다 열리기 전에 누른 → 는 먹지 않는다(첫 판은 회복 주머니에서 상처약을 썼다) — 열고 한참 기다린다
      { do: 'keys', keys: ['ArrowDown', 'z'], gap: 900 }, { do: 'wait', ms: 1500 },
      { do: 'click', selector: '[data-pilot="pocket-2"]', after: 900 }],
    settle: 300, seconds: 10, recKeys: [{ at: 0.2, key: 'z' }],
  },
  // 확인 지점 `rival`은 뛰어드는 동안 배틀이 시작돼 등장이 찍힐 때도 안 찍힐 때도 있었다 — 풀숲에 서서 같은 편성(247)을 부른다
  { id: 'C9-rival', what: '라이벌전 — 등장 · 내보내기', cp: 'grass', steps: [{ do: 'hour', hour: 15 }, { do: 'trainer', id: 247, after: 100 }], settle: 0, seconds: 9 },

  // ── D. 여정 몽타주 ──
  {
    id: 'D1-lake', what: '호수와 숲 높은 부감 — 엄격호수', cp: 'valor', steps: [{ do: 'hour', hour: 10 }, { do: 'hideText' }], seconds: 2.5,
    move: { type: 'dolly', rel: true, from: { eye: [-6, 22, 14], gaze: [0, 0, -20] }, to: { eye: [4, 20, 8], gaze: [2, 0, -24] } },
  },
  {
    id: 'D2-windworks', what: '바닷가 도시 — 해변시티 부감 · 바다 쪽 팬', cp: 'sunyshore', steps: [{ do: 'hour', hour: 13 }], seconds: 2.5,
    move: { type: 'dolly', rel: true, from: { eye: [-6, 18, 18], gaze: [4, 0, -4] }, to: { eye: [8, 18, 14], gaze: [14, 0, -6] } },
  },
  {
    id: 'D3-flowers', what: '꽃향기마을 꽃밭 — 1인칭', cp: 'floaroma',
    steps: [{ do: 'hour', hour: 14 }, { do: 'walk', key: 'ArrowDown', ms: 1400 }, { do: 'first' }, { do: 'look', yaw: 270, pitch: -8 }],
    seconds: 2.5, hold: 'ArrowUp',
  },
  {
    id: 'D4-snow', what: '선단시티 눈길 — 3인칭 낮게 돌기', cp: 'snowpoint', steps: [{ do: 'hour', hour: 13 }], seconds: 2.5,
    move: { type: 'dolly', rel: true, from: { eye: [-8, 4.5, 6], gaze: [0, 1.2, -2] }, to: { eye: [-3, 4, 8.5], gaze: [0, 1.2, -2] } },
  },
  {
    // 서 있다가 V로 1인칭, 곧바로 고개를 돌려 도시를 훑는다 (문서 「시점」 두 번째 전환)
    // 축복시티는 길 높이에서 건물이 회색 기둥으로 나왔다(2026-10-04 · `.audit/reels/findings/`)
    // 해변시티는 걸어 나온 자리가 늦게 들어와 2초 동안 하얬다 — 떡잎마을로
    id: 'D5-first', what: '떡잎마을 — 3인칭 → 1인칭 둘러보기', cp: 'twinleaf',
    steps: [{ do: 'hour', hour: 10 }, { do: 'walk', key: 'ArrowDown', ms: 900 }], settle: 20_000, seconds: 3.5, recKeys: [{ at: 0.8, key: 'KeyV' }],
    move: { type: 'yaw', at: 1.0, seconds: 2.3, from: 180, to: 290, pitch: 4 },
  },
  {
    id: 'D6-night', what: '밤의 연고시티 — 1인칭', cp: 'hearthome',
    // 걷지 않고 고개만 돌린다 — 1인칭으로 앞을 모르고 걸으면 화단 · 벽에 박힌다
    steps: [{ do: 'hour', hour: 21 }, { do: 'warp', map: 86 }, { do: 'at', x: 470, z: 700 }, { do: 'first' }, { do: 'look', yaw: 100 }],
    seconds: 2.5, move: { type: 'yaw', seconds: 2.5, from: 100, to: 190, pitch: 3 },
  },
  {
    id: 'D7-forest', what: '영원의 숲 길 — 3인칭 부감', cp: 'forest', steps: [{ do: 'hour', hour: 13 }], seconds: 2.5,
    move: { type: 'dolly', rel: true, from: { eye: [-8, 14, 10], gaze: [0, 0, -2] }, to: { eye: [-2, 14, 6], gaze: [2, 0, -6] } },
  },
  {
    // 213번도로 바닷가는 비가 오고 숲으로 걸어 들어갔다 — 엄격호수 물가를 눈높이로 둘러본다
    id: 'D8-lakeside', what: '엄격호수 물가 — 1인칭 둘러보기', cp: 'valor',
    steps: [{ do: 'hour', hour: 10 }, { do: 'hideText' }, { do: 'first' }, { do: 'look', yaw: 320, pitch: -4 }],
    seconds: 2.5, move: { type: 'yaw', seconds: 2.5, from: 320, to: 40, pitch: -4 },
  },
  { id: 'D9-trainer', what: '트레이너 조우 → 등장', cp: 'grass', steps: [{ do: 'hour', hour: 15 }, { do: 'trainer', id: 1, after: 100 }], settle: 0, seconds: 8 },
  { id: 'D11-champion', what: '챔피언 난천', cp: 'champion', steps: [], settle: 0, seconds: 10 },
  // ── E1. 기술 연타 — 챔피언전 파티(배지 8 · 토대부기 L55 앞)의 기술 넷과 사천왕전 하나 ──
  ...[0, 1, 2, 3].map((n) => ({
    id: `E1-${'abcd'[n]}`, what: `기술 연타 ${String(n + 1)}`, cp: 'champion',
    steps: [{ do: 'menu' }, { do: 'keys', keys: ['z', ...Array(n).fill('ArrowDown')], gap: 500 }],
    settle: 200, seconds: 6, recKeys: [{ at: 0.2, key: 'z' }],
  })),
  {
    id: 'E1-e', what: '기술 연타 5 — 사천왕전', cp: 'elite',
    steps: [{ do: 'menu' }, { do: 'keys', keys: ['z', 'ArrowDown'], gap: 500 }],
    settle: 200, seconds: 6, recKeys: [{ at: 0.2, key: 'z' }],
  },

  // ── E. 동상 · 반전 ──
  {
    id: 'E2-spear', what: '창기둥 — 높은 곳에서 천천히 밀기', cp: 'spear', steps: [{ do: 'hour', hour: 14 }, { do: 'hideText' }], seconds: 3,
    move: { type: 'dolly', rel: true, from: { eye: [0, 26, 26], gaze: [0, 0, -6] }, to: { eye: [0, 18, 15], gaze: [0, 0, -8] } },
  },
  {
    // 1인칭으로 걷다가 V로 3인칭으로 빠진다 (문서 「시점」 세 번째 전환 — 반대 방향)
    id: 'E3-distortion', what: '깨어진 세계 — 1인칭 → 3인칭', cp: 'distortion',
    steps: [{ do: 'first' }], seconds: 4, hold: 'ArrowUp', recKeys: [{ at: 1.8, key: 'KeyV' }],
  },
  { id: 'E3-giratina', what: '기라티나 — 깨어진 세계에서 만남', cp: 'giratina', steps: [{ do: 'wild', species: 487, level: 47, after: 100 }], settle: 0, seconds: 7 },
]
