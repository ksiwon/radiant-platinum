// 트레일러의 장면들 — `docs/orders/REELS_20261003.md`의 큐 번호 그대로다
//
// `cp`는 확인 지점(`src/engine/dev/checkpoints.ts`), `steps`는 찍기 전에 세우는 것, `seconds`는 찍는 길이다.
// ⚠️ 야외는 `hour`를 꼭 준다 — 안 주면 실제 시계를 따라가 새벽에 찍은 장면이 밤이 된다(창기둥이 그랬다).
// 찍는 동안 (`at`은 모두 찍기 시작에서 센 초):
//   `hold`        키를 누른 채 — 걷기. `holdFor`초에 뗀다(없으면 끝까지). 풀숲 속에서 멈춰 서는 컷
//   `move`        카메라 움직임 — `dolly`(눈 · 시선을 곧게 옮긴다) · `yaw`(1인칭 고개). `at`초 뒤에 시작
//   `recKeys`     [{ at, key, act? }] — 그 시각에 누를 키. `act`가 'down'이면 누른 채로 두고 'up'이면 뗀다(없으면 한 번 누름)
//   `recEval`     [{ at, js }] — 그 시각에 페이지에서 돌릴 식. 기다리지 않는 식이어야 한다(`void …`) — 가상 시계가 멈춰 있어 기다리면
//                 안 끝나고, 5초가 넘으면 캡처가 끊고 적는다. 시선 · 조우 컷인처럼 찍는 도중에 열어야 하는 것
//   `keepUI`      true면 화면 위 HTML(대사창 · HP 상자 · 명령 메뉴)을 안 숨긴다 — 기본은 글 없는 화면
//   `overlays`    true면 글은 숨기되 화면 전환 막(조우 섬광 · 배틀이 서는 흰 막)은 남긴다
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
    id: 'B5-switch', what: '202번도로 — 빛나가 풀숲을 서성이다 걸음 조우로 꼬링크를 만난다', cp: 'grass',
    // 202번도로 풀숲에 선다. 그 맵 풀숲 표의 첫 칸이 꼬링크다(`encounters.json` 141 · 슬롯 0 = 403)
    steps: [{ do: 'hour', hour: 15 }, { do: 'warp', map: 343, spot: { kind: 'grass' }, after: 6000 }],
    // 풀숲을 오가다 — 걸음 조우 판정 하나만 고정한다(`encounters.rng`의 다음 두 번 = 통과 · 슬롯 0). 판정 · 풀 흔들림 · 컷인은 게임 그대로다
    seconds: 13, hold: 'ArrowLeft', holdFor: 1.3, recKeys: [{ at: 1.5, key: 'ArrowRight', act: 'down' }, { at: 2.9, key: 'ArrowRight', act: 'up' },
      { at: 3.1, key: 'ArrowLeft', act: 'down' }, { at: 4.6, key: 'ArrowLeft', act: 'up' },
      { at: 8.0, key: 'z' }, { at: 8.8, key: 'z' }, { at: 9.6, key: 'z' }],
    recEval: [{ at: 3.0, js: "void (async()=>{const e=(await import('/src/engine/battle/encounterSystem.ts')).encounters;const r=e.rng;let n=0;e.rng=()=>{if(n++<2)return 0;e.rng=r;return r()}})()" }],
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
    settle: 200, seconds: 8, recKeys: [{ at: 0.2, key: 'z' }],
  },
  {
    id: 'C4-night', what: '밤 배틀 기술 — 몸통박치기', cp: 'grass-night',
    steps: [{ do: 'wild', species: 399, level: 5, after: 100 }, { do: 'menu' }, { do: 'keys', keys: ['z'], gap: 500 }],
    settle: 200, seconds: 8, recKeys: [{ at: 0.2, key: 'z' }],
  },
  {
    id: 'C5-cave', what: '동굴 무대 기술', cp: 'oreburgh-gate',
    // 배틀 배경은 배틀이 설 때의 world.mapId로 정해진다 — 259(무쇠길 관문)에 내려앉기 전에 열면 시작 맵의 풀밭이 박혔다
    steps: [{ do: 'map', map: 259 }, { do: 'wild', species: 74, level: 8, after: 100 }, { do: 'menu' },
      { do: 'keys', keys: ['z'], gap: 500 }],
    settle: 200, seconds: 8, recKeys: [{ at: 0.2, key: 'z' }],
  },
  {
    id: 'C6-catch', what: '볼 던지기 → 빨려 듦 → 흔들림 → 잡힘', cp: 'grass',
    // 몬스터볼로 잡는다(사용자 요청). 그냥 던지면 판마다 빠져나와서 포획 판정만 고정한다(아래 eval).
    // ⚠️ **볼 주머니를 비우고 넣는다.** 주머니 첫 칸이 던져진다
    steps: [{ do: 'hour', hour: 15 },
      { do: 'eval', js: `(async () => { const { useSaveStore } = await import('/src/state/saveStore.ts'); const { loadItems } = await import('/src/data/gameData.ts'); const bank = await loadItems(); const p = bank.get(4).pocket ?? 0; const s = useSaveStore.getState(); for (const e of [...(s.bag[p] ?? [])]) useSaveStore.getState().removeItem(p, e.item, e.count); useSaveStore.getState().addItem(p, 4, 5); return useSaveStore.getState().bag[p].map((e) => e.item) })()` },
      // 포획 판정만 고정한다 — 부르는 자리에 `throwBall`이 있을 때만 0을 낸다(흔들림 넷 다 통과). 입자 · AI는 그대로다
      { do: 'eval', js: "(()=>{const r=Math.random;Math.random=function(){const st=new Error().stack??'';return st.includes('throwBall')?0:r()};return 'ok'})()" },
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
    // 높이 22에서는 맵 끝이 회색 허공 위 섬처럼 보였다(rec-22) — 낮게 깔아 맞은편 숲이 지평선을 막게 한다
    move: { type: 'dolly', rel: true, from: { eye: [-6, 7, 10], gaze: [0, 2, -24] }, to: { eye: [4, 6.5, 6], gaze: [2, 2, -28] } },
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
  // ── D11~13. 챔피언 — 방에 들어가 난천을 만나고(대사 → 컷인) 화강돌 → 루카리오 → 한카리아스 ──
  // 확인 지점 `champion`은 뛰어들자마자 배틀을 연다 — 배지 8 파티만 빌리고(`mart8`) 챔피언의 방 입구로 옮겨 걸어 들어간다
  {
    id: 'D11-champion', what: '챔피언의 방 — 난천에게 걸어가 말을 건다 → 컷인 → 화강돌', cp: 'mart8',
    steps: [{ do: 'warp', map: 185, spot: { kind: 'warp', index: 1 }, after: 6000 }],
    seconds: 16, hold: 'ArrowUp', holdFor: 3.0,
    recKeys: [{ at: 3.4, key: 'z' }, { at: 4.6, key: 'z' }, { at: 5.8, key: 'z' }, { at: 7.0, key: 'z' }, { at: 8.2, key: 'z' },
      { at: 9.4, key: 'z' }, { at: 10.6, key: 'z' }, { at: 11.8, key: 'z' }],
  },
  ...[[448, 'D12-lucario', '루카리오'], [445, 'D13-garchomp', '한카리아스']].map(([sp, id, name]) => ({
    id, what: `챔피언전 — 난천의 ${name} 기술`, cp: 'mart8',
    // 난천의 파티 순서만 메모리에서 바꾼다 — 그 포켓몬이 먼저 나온다. 기술 · AI는 그대로
    steps: [{ do: 'warp', map: 185, spot: { kind: 'warp', index: 1 }, after: 6000 },
      { do: 'eval', js: `(async()=>{const {loadTrainers}=await import('/src/data/gameData.ts');const t=(await loadTrainers()).get(267);const i=t.party.findIndex((m)=>m.species===${String(sp)});if(i>0){const [m]=t.party.splice(i,1);t.party.unshift(m)}return t.party.map((m)=>m.species)})()` },
      // `pt.trainer`로 바로 열면 무대가 숲으로 섰다(rec-22) — D11처럼 걸어가 말을 걸어 연다. 컷인 · 화강돌 대사는 `menu`가 넘긴다
      { do: 'walk', key: 'ArrowUp', ms: 3000 }, { do: 'menu' }, { do: 'keys', keys: ['z'], gap: 500 }],
    settle: 200, seconds: 9, recKeys: [{ at: 0.2, key: 'z' }],
  })),
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
  // B3F는 확인 지점이 좁은 판 끝이다 — 북쪽은 아래층으로 떨어지는 구멍이고(맵 576 → 577 → 579) 옆은 막혔다.
  // 걸어 들어가면 빈 하늘을 떨어지는 그림이 된다(rec-22). 1인칭으로 떠 있는 판들을 둘러보기만 한다
  {
    id: 'E3-b3f', what: '깨어진 세계 B3F — 1인칭으로 떠 있는 판을 둘러본다', cp: 'distortion-b3f',
    steps: [{ do: 'first' }], seconds: 3, move: { type: 'yaw', at: 0.1, seconds: 2.8, from: -30, to: 60, pitch: 4 },
  },
  {
    // 깨어진 세계의 벽 걸음 — 판 끝에서 서쪽으로 걸어 벽으로 뛰어오르면 몸과 카메라가 90° 돌고 벽 위를 걷는다
    // (`.audit/probe/distortionWalk.mjs` ① · 지역 (10,1,28) → 서쪽 벽 (8,2,28)). 뛰어든 직후의 첫 `at`은 맵이 덮어써서 두 번 준다
    id: 'E3-wall', what: '깨어진 세계 B3F — 벽으로 뛰어올라 벽 위를 걷는다', cp: 'distortion-b3f',
    steps: [{ do: 'at', x: 12, z: 28 }, { do: 'at', x: 12, z: 28, after: 3000 }],
    seconds: 3.5, recKeys: [{ at: 0.3, key: 'ArrowLeft', act: 'down' }, { at: 3.3, key: 'ArrowLeft', act: 'up' }],
  },
  ...[['E3-b4f', 'distortion-b4f', 'B4F']].map(([id, cp, floor]) => ({
    id, what: `깨어진 세계 ${floor} — 1인칭으로 둘러보다 3인칭으로 걷는다`, cp,
    steps: [{ do: 'first' }],
    seconds: 6, hold: 'ArrowUp', holdFor: 2.0, move: { type: 'yaw', at: 0.2, seconds: 1.8, from: 0, to: 70, pitch: 6 },
    recKeys: [{ at: 2.4, key: 'KeyV' }, { at: 2.9, key: 'ArrowLeft', act: 'down' }, { at: 5.6, key: 'ArrowLeft', act: 'up' }],
  })),
  {
    // 원작 그대로 — 기라티나가 서 있고, 다가가 A를 누르면 울음 → 대사 → 배틀 (`DistortionWorldGiratinaRoom_Giratina`)
    // 진행도를 「기라티나가 왔다」(13)로 두고 방을 다시 열면 기라티나가 선다. 몸이 커서 네 칸 앞에 세운다 (NPC는 `position`이 아니라 칸 좌표 `x` · `z`)
    id: 'E3-giratina', what: '기라티나의 방 — 서 있는 기라티나에게 다가가 A → 배틀', cp: 'giratina',
    steps: [
      { do: 'warp', map: 582, spot: { kind: 'open' }, after: 6000 },
      { do: 'eval', js: "(async()=>{(await import('/src/engine/script/field.ts')).fieldScripts.vars.set(16469,10)})()" },
      { do: 'eval', js: "(async()=>{const w=(await import('/src/state/worldState.ts')).worldState;w.player.position.set(15.5,w.player.position.y,25.5);w.player.prevPosition.copy(w.player.position);w.player.facing=Math.PI;return [w.player.position.x,w.player.position.y,w.player.position.z]})()" },
      { do: 'wait', ms: 1500 },
      { do: 'eval', js: "(async()=>{const w=(await import('/src/state/worldState.ts')).worldState;w.player.position.set(15.5,w.player.position.y,25.5);w.player.prevPosition.copy(w.player.position);w.player.facing=Math.PI;return [w.player.position.x,w.player.position.y,w.player.position.z]})()" },
      { do: 'wait', ms: 1500 },
      { do: 'walk', key: 'ArrowUp', ms: 3500 },
      { do: 'eval', js: "(async()=>{const w=(await import('/src/state/worldState.ts')).worldState;return [(await import('/src/engine/script/field.ts')).fieldScripts.vars.get(16469),w.player.position.x,w.player.position.z]})()" },
      { do: 'until', js: "(async()=>(await import('/src/engine/script/field.ts')).fieldScripts.vars.get(16469)>=11)()", key: 'KeyZ', gap: 700, after: 3000, timeout: 40000 },
      { do: 'eval', js: "(async()=>{const w=(await import('/src/state/worldState.ts')).worldState;return [(await import('/src/engine/script/field.ts')).fieldScripts.vars.get(16469),w.player.position.x,w.player.position.z]})()" },
      { do: 'walk', key: 'ArrowUp', ms: 3500 },
      { do: 'eval', js: "(async()=>{const w=(await import('/src/state/worldState.ts')).worldState;return [(await import('/src/engine/script/field.ts')).fieldScripts.vars.get(16469),w.player.position.x,w.player.position.z]})()" },
      { do: 'until', js: "(async()=>(await import('/src/engine/script/field.ts')).fieldScripts.vars.get(16469)>=12)()", key: 'KeyZ', gap: 700, after: 3000, timeout: 40000 },
      { do: 'eval', js: "(async()=>{const w=(await import('/src/state/worldState.ts')).worldState;return [(await import('/src/engine/script/field.ts')).fieldScripts.vars.get(16469),w.player.position.x,w.player.position.z]})()" },
      { do: 'walk', key: 'ArrowUp', ms: 3500 },
      { do: 'eval', js: "(async()=>{const w=(await import('/src/state/worldState.ts')).worldState;return [(await import('/src/engine/script/field.ts')).fieldScripts.vars.get(16469),w.player.position.x,w.player.position.z]})()" },
      { do: 'until', js: "(async()=>(await import('/src/engine/script/field.ts')).fieldScripts.vars.get(16469)>=13)()", key: 'KeyZ', gap: 700, after: 3000, timeout: 40000 },
      { do: 'eval', js: "(async()=>{const w=(await import('/src/state/worldState.ts')).worldState;return [(await import('/src/engine/script/field.ts')).fieldScripts.vars.get(16469),w.player.position.x,w.player.position.z]})()" },
      { do: 'until', js: "(async()=>!document.querySelector('[class*=\"_frame_\"]'))()", key: 'KeyZ', gap: 900, after: 1500 },
      { do: 'eval', js: "(async()=>{const w=(await import('/src/state/worldState.ts')).worldState;const {npcActors}=await import('/src/engine/actor/npcs.ts');const g=npcActors.list.find((a)=>a.localID===128);w.player.position.z=g.z+0.5+4;w.player.prevPosition.copy(w.player.position);w.player.facing=Math.PI;return [npcActors.list.map((a)=>[a.localID,a.x,a.z]),w.player.position.x,w.player.position.z]})()" },
      { do: 'wait', ms: 2000 }],
    seconds: 12, hold: 'ArrowUp', holdFor: 0.8,
    // 글(대사창 · 배틀 정보)은 숨기고 조우 섬광 · 배틀이 서는 흰 막은 남긴다 — 다른 장면과 같은 글 없는 화면
    overlays: true,
    recKeys: [{ at: 1.0, key: 'z' }, { at: 2.8, key: 'z' }, { at: 4.4, key: 'z' }, { at: 6.0, key: 'z' }],
  },
]
