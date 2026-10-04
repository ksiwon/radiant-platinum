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
    id: 'B5-switch', what: '201번도로 — 풀숲을 따라 걷다가 3인칭 → 1인칭 → 두리번 → 꼬링크 조우', cp: 'grass',
    // 풀숲은 북으로 몇 칸뿐이고 그 뒤가 숲 벽이다 — 한 칸 들어가 서쪽으로 풀숲 줄을 따라 걷는다. 더 들어가면 숲 가장자리를
    // 스쳐 걸어서 V를 누른 순간 눈이 나무 속에 들었다
    steps: [{ do: 'hour', hour: 15 }, { do: 'walk', key: 'ArrowRight', ms: 500 }, { do: 'walk', key: 'ArrowUp', ms: 600 }],
    // 1인칭으로 풀숲을 두리번거리다 꼬링크를 만난다 — 조우 컷인 → 배틀 → 「나타났다!」 → 모부기 내보내기까지 한 컷
    seconds: 12, hold: 'ArrowLeft', holdFor: 1.5, recKeys: [{ at: 0.9, key: 'KeyV' },
      { at: 7.0, key: 'z' }, { at: 7.8, key: 'z' }, { at: 8.6, key: 'z' }],
    recEval: [{ at: 3.9, js: 'void globalThis.pt.encounterWild(403, 5)' }],
    move: { type: 'yaw', at: 1.7, seconds: 2.2, from: 270, to: 205, pitch: -12 },
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
    // 배틀 배경은 배틀이 설 때의 world.mapId로 정해진다 — 259(무쇠길 관문)에 내려앉기 전에 열면 시작 맵의 풀밭이 박혔다
    steps: [{ do: 'map', map: 259 }, { do: 'wild', species: 74, level: 8, after: 100 }, { do: 'menu' }, { do: 'keys', keys: ['z'], gap: 500 }],
    settle: 200, seconds: 6, recKeys: [{ at: 0.2, key: 'z' }],
  },
  {
    id: 'C6-catch', what: '볼 던지기 → 빨려 듦 → 흔들림 → 잡힘', cp: 'grass',
    // 몬스터볼은 판마다 빠져나왔다(네 판 다) — 꼭 잡히는 마스터볼을 넣어 둔다. 보라 BDSP `eb001_capture`도 그대로 보인다
    steps: [{ do: 'hour', hour: 15 },
      { do: 'eval', js: `(async () => { const { useSaveStore } = await import('/src/state/saveStore.ts'); const { loadItems } = await import('/src/data/gameData.ts'); const bank = await loadItems(); useSaveStore.getState().addItem(bank.get(1).pocket ?? 0, 1, 1); return bank.get(1).pocket })()` },
      { do: 'wild', species: 399, level: 2, after: 100 }, { do: 'menu' },
      // 가방이 다 열리기 전에 누른 → 는 먹지 않는다(첫 판은 회복 주머니에서 상처약을 썼다) — 열고 한참 기다린다
      { do: 'keys', keys: ['ArrowDown', 'z'], gap: 900 }, { do: 'wait', ms: 1500 },
      { do: 'click', selector: '[data-pilot="pocket-2"]', after: 900 }],
    settle: 300, seconds: 10, recKeys: [{ at: 0.2, key: 'z' }],
  },
  // 확인 지점 `rival`은 뛰어드는 동안 배틀이 시작돼 등장이 찍힐 때도 안 찍힐 때도 있었다 — 풀숲에 서서 같은 편성(247)을 부른다
  // 배틀에 사람이 안 선다 — 「승부를 걸어왔다」 · 「내보냈다」 줄을 Z로 넘겨야 볼이 화면 밖에서 날아와 상대 → 내 포켓몬 차례로 선다
  // 트레이너전은 필드에서처럼 조우 컷인부터 — 찍는 도중에 연다(`recEval`). 미리 열면 컷인이 찍기 전에 끝난다
  { id: 'C9-rival', what: '라이벌전 — 조우 컷인 → 볼이 날아와 차례로 선다', cp: 'grass', steps: [{ do: 'hour', hour: 15 }],
    recEval: [{ at: 0.3, js: 'void globalThis.pt.encounter(247)' }],
    seconds: 11, recKeys: [{ at: 3.6, key: 'z' }, { at: 4.8, key: 'z' }, { at: 6.0, key: 'z' }, { at: 7.2, key: 'z' }] },

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
    // 확인 지점 앞에서 걸어 내려가던 길은 간판에 박혔다 — 서쪽 꽃밭 한가운데(167,668)에 세우고 북쪽으로 꽃밭을 가로질러 걷는다.
    // 뛰어든 직후의 첫 `at`은 맵이 자리 잡으며 덮어써서 두 번 준다
    steps: [{ do: 'hour', hour: 14 }, { do: 'at', x: 167, z: 668 }, { do: 'at', x: 167, z: 668 }, { do: 'first' }, { do: 'look', yaw: 0, pitch: -14 }],
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
    // 찍기 전 `walk`는 문간에서 안 먹었다(확인 지점에 막 내려선 직후라 키가 안 들어간다) — 문 앞에 선 채 V를 눌러 눈이 문짝 속에
    // 들었다. 찍는 동안 0.7초 걸어 나온 뒤 V를 누른다
    steps: [{ do: 'hour', hour: 10 }], settle: 20_000, seconds: 3.5, hold: 'ArrowDown', holdFor: 0.7, recKeys: [{ at: 0.9, key: 'KeyV' }],
    move: { type: 'yaw', at: 1.0, seconds: 2.3, from: 180, to: 290, pitch: 4 },
  },
  {
    id: 'D6-night', what: '밤의 연고시티 — 1인칭', cp: 'hearthome',
    // 걷지 않고 고개만 돌린다 — 1인칭으로 앞을 모르고 걸으면 화단 · 벽에 박힌다. (470,700)은 화가가 오가는 길이라 머리가 카메라를 뚫었다
    steps: [{ do: 'hour', hour: 21 }, { do: 'warp', map: 86 }, { do: 'at', x: 466, z: 704 }, { do: 'first' }, { do: 'look', yaw: 100 }],
    seconds: 2.5, move: { type: 'yaw', seconds: 2.5, from: 100, to: 190, pitch: 3 },
  },
  {
    id: 'D7-forest', what: '영원의 숲 길 — 3인칭 부감', cp: 'forest', steps: [{ do: 'hour', hour: 13 }], seconds: 2.5,
    move: { type: 'dolly', rel: true, from: { eye: [-8, 14, 10], gaze: [0, 0, -2] }, to: { eye: [-2, 14, 6], gaze: [2, 0, -6] } },
  },
  {
    // 1인칭으로 도시를 둘러본다 — 실제 크기의 건물 사이. (엄격호수 물가는 둘레가 비어 허공이 보였다)
    id: 'D8-city', what: '축복시티 거리 — 1인칭 둘러보기', cp: 'jubilife',
    steps: [{ do: 'hour', hour: 11 }, { do: 'hideText' }, { do: 'walk', key: 'ArrowDown', ms: 1400 }, { do: 'first' }, { do: 'look', yaw: 140, pitch: 4 }],
    seconds: 3, move: { type: 'yaw', seconds: 3, from: 140, to: 230, pitch: 4 },
  },
  { id: 'D9-trainer', what: '트레이너 조우 컷인 → 내보내기', cp: 'grass', steps: [{ do: 'hour', hour: 15 }],
    recEval: [{ at: 0.3, js: 'void globalThis.pt.encounter(1)' }],
    seconds: 10, recKeys: [{ at: 3.6, key: 'z' }, { at: 4.8, key: 'z' }, { at: 6.0, key: 'z' }] },
  // 확인 지점이 무대를 세우는 동안(4초 남짓) 자리표시자가 보인다 — 무대가 선 뒤부터 찍고, 줄을 넘겨 미카루게 · 토대부기가 나오게 한다
  { id: 'D11-champion', what: '챔피언 난천 — 볼이 날아와 선다', cp: 'champion', steps: [], settle: 6000, seconds: 8,
    recKeys: [{ at: 0.8, key: 'z' }, { at: 2.0, key: 'z' }, { at: 3.2, key: 'z' }, { at: 4.4, key: 'z' }] },
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
    // 확인 지점은 이야기가 내려놓는 칸(1층 로컬 (34,30))에 서고 첫 진입 장면이 돈다 — 서쪽 한 칸 걷고 신오 챔피언과
    // 기라티나 그림자까지 본 뒤(진행도 1) (33,30)에 선다. 거기서 서쪽을 보고 1인칭으로 걷다 V로 빠진다
    steps: [{ do: 'map', map: 573, after: 3000 },
      { do: 'until', js: "(async()=>{const f=await import('/src/engine/script/field.ts');return f.fieldScripts.vars.get(16469)>=1&&!f.scriptBusy()})()" },
      { do: 'walk', key: 'ArrowLeft', ms: 90 },
      { do: 'eval', js: "(async()=>{const p=(await import('/src/state/worldState.ts')).worldState.player;return [p.position.x,p.position.y,p.position.z,p.facing]})()" },
      { do: 'first' }],
    // 1인칭으로 판 위를 걷고 → V → 3인칭 내려다보기로 발판 줄을 따라 남쪽으로 더 걷는다
    seconds: 6, hold: 'ArrowUp', holdFor: 2.0, recKeys: [{ at: 2.2, key: 'KeyV' },
      { at: 2.8, key: 'ArrowDown', act: 'down' }, { at: 5.2, key: 'ArrowDown', act: 'up' }],
  },
  { id: 'E3-giratina', what: '기라티나 — 깨어진 세계에서 만남', cp: 'giratina',
    // 배틀 배경은 배틀이 설 때의 world.mapId로 한 번 정해진다 — 582에 내려앉기 전에 열면 시작 맵(풀숲) 배경이 박혔다
    // 필드에서 그대로 만난다 — 전설 전용 조우 컷인 → 배틀 → 기라티나 등장까지 한 컷
    steps: [{ do: 'map', map: 582 }], seconds: 10, recEval: [{ at: 0.8, js: 'void globalThis.pt.encounterWild(487, 47)' }] },
]
