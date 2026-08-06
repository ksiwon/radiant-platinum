// 확인 지점 — 시험용 순간이동 표.
//
// 만들어 둔 것을 눈으로 봐야 할 때, 처음부터 걸어가서 확인할 수는 없다. 여기
// 적힌 자리로 바로 뛰어들고, 몇 걸음만 걸으면 그것이 보이게 한다.
//
// **좌표를 손으로 적지 않는다.** 적어 두면 그 순간 자료와 갈라지고, 자료가
// 바뀌면 조용히 벽 속에 서게 된다. 대신 "몇 번 맵의 몇 번째 워프"처럼 **자료를
// 가리키기만** 하고, 실제 칸은 격자를 보고 그때 정한다. 그래서 이 표는 맵이
// 바뀌어도 따라간다 — 시험에서 전부 걸어갈 수 있는 칸인지 확인한다.
import type { MapGrid } from '../map/grid'
import type { Warp } from '../map/world'
import { isEncounterTile } from '../battle/encounter'

/** 파티에 넣을 한 마리 */
export interface PartySpec {
  species: number
  level: number
}

/**
 * 어느 칸에 세울지. 전부 자료를 가리키는 방식이다.
 *
 * · `warp` — 그 맵의 n번째 워프 **위**. 도착한 직후와 같은 자리다
 * · `atWarp` — 그 워프 **옆의 걸어갈 수 있는 칸**에서 워프를 보고 선다.
 *   "문 앞에 서서 나가 보기"가 이것이다
 * · `grass` — 그 맵 안 풀숲 한가운데. 야생을 확인하는 자리다
 */
export type Spot =
  | { kind: 'warp'; index: number }
  | { kind: 'atWarp'; index: number }
  | { kind: 'grass' }

/** 도착하자마자 열 배틀 */
export type DevBattle =
  | { kind: 'trainer'; id: number }
  | { kind: 'wild'; species: number; level: number }

export interface Checkpoint {
  id: string
  label: string
  /**
   * **어떤 환경인가.** 실내인지 야외인지, 밝은지 어두운지, 넓은지 좁은지.
   *
   * 확인할 것(`try`)과 따로 두는 이유: 같은 야외라도 작은 마을과 큰 도시는
   * 프레임도 스트리밍도 다르게 나온다. 무엇을 볼지 고르기 전에 **어디로
   * 가는지**부터 알아야 한다
   */
  env: string
  /** 여기서 해 볼 만한 것들. 화면 오른쪽에 줄 단위로 뜬다 */
  try: readonly string[]
  /** 맵 헤더 번호 */
  map: number
  spot: Spot
  party?: readonly PartySpec[]
  /** 파티를 다치게 둔다 — 회복을 확인하는 자리 */
  hurt?: boolean
  /** [아이템 번호, 개수]. 주머니는 아이템 표가 정한다 */
  items?: readonly (readonly [number, number])[]
  money?: number
  /** 비트마스크. 배지 수로 갈리는 화면을 볼 때 쓴다 */
  badges?: number
  battle?: DevBattle
}

/** 첫 파트너 셋. 예지호수에서 받는 것과 같은 종족 번호다 */
const TURTWIG = 387

const POKE_BALL = 4
const POTION = 17

/**
 * 확인 지점 표.
 *
 * 고른 기준은 하나다 — **지금 만들어 둔 것 중 눈으로 봐야 하는 것.** 배틀·상점처럼
 * 조건이 필요한 자리는 그 조건도 같이 채워 준다. 다만 **이야기 플래그는 안 건드린다**:
 * 순간이동은 길을 막은 사람을 그냥 지나치는 것이라 진행도를 꾸며 낼 이유가 없고,
 * 꾸며 내면 "여기까지 온 판"이 진짜와 달라진다.
 */
export const CHECKPOINTS: readonly Checkpoint[] = [
  {
    id: 'room',
    label: '주인공 방 · 계단 앞',
    env: '실내 · 2층 방 (좁고 밝다)',
    try: [
      '계단으로 1층에 내려가 본다',
      'TV·게임기 간판을 읽는다',
      '좁은 방에서 3인칭 카메라가 벽을 뚫는지 본다',
    ],
    map: 415,
    spot: { kind: 'atWarp', index: 0 },
  },
  {
    id: 'door',
    label: '집 1층 · 현관 앞',
    env: '실내 · 1층 거실 (밖으로 나가는 문이 있다)',
    try: [
      '문으로 나간다 — 문 타일이 통행 불가라 갇히던 자리다',
      '엄마에게 말을 건다',
      '나가자마자 야외 청크가 제때 따라붙는지 본다',
    ],
    map: 414,
    spot: { kind: 'atWarp', index: 0 },
  },
  {
    id: 'twinleaf',
    label: '떡잎마을',
    env: '야외 · 작은 마을 (원작 지형 모델 · NPC 8명)',
    try: [
      '1인칭(V·휠)으로 둘러보고 보는 쪽으로 걷는다',
      'NPC 판때기가 카메라를 따라 도는지 본다',
      '집 뒷면과 나무 줄기가 뚫려 보이지 않는지 본다',
      '낮·밤에 따라 하늘색과 BGM이 갈리는지 본다',
    ],
    map: 411,
    spot: { kind: 'atWarp', index: 1 },
  },
  {
    id: 'grass',
    label: '201번도로 풀숲',
    env: '야외 · 도로 풀숲 (인카운터가 도는 자리)',
    try: [
      '한 칸 걸으면 야생이 나온다',
      '도망·포획·경험치까지 한 바퀴 돈다',
      '풀이 빽빽한 자리에서 프레임을 함께 본다',
    ],
    map: 342,
    spot: { kind: 'grass' },
    party: [{ species: TURTWIG, level: 5 }],
    items: [[POKE_BALL, 10], [POTION, 5]],
  },
  {
    id: 'wild',
    label: '야생전 바로',
    env: '배틀 · 야생전 (들어가자마자 열린다)',
    try: [
      '체력판·게이지 색·명령 넷을 본다',
      '설정의 배틀 진행·이야기 속도를 여기서 잰다',
      '기술 연출 다섯 틀과 타입 색을 본다',
      '등판과 기절에서 울음소리가 나는지 듣는다',
      '메뉴를 키보드(↑↓←→·Z·X)로만 끝까지 돌려 본다',
    ],
    map: 342,
    spot: { kind: 'grass' },
    party: [{ species: TURTWIG, level: 8 }],
    items: [[POKE_BALL, 10], [POTION, 5]],
    battle: { kind: 'wild', species: 403, level: 7 },
  },
  {
    id: 'rival',
    label: '라이벌전 (펄 · 찌르꼬 L7 · 모부기 L9)',
    env: '배틀 · 트레이너전 (원작 첫 라이벌전과 같은 편성)',
    try: [
      'AI가 무엇을 고르는지 본다',
      '2마리 교체와 상금·기술 습득까지 간다',
      '야생 곡이 아니라 트레이너 곡으로 바뀌는지 듣는다',
    ],
    map: 411,
    spot: { kind: 'atWarp', index: 1 },
    party: [{ species: TURTWIG, level: 9 }],
    items: [[POTION, 5]],
    battle: { kind: 'trainer', id: 247 },
  },
  {
    id: 'sandgem',
    label: '잔모래마을',
    env: '야외 · 마을 (건물과 NPC 15명)',
    try: [
      'NPC 사이에서 간판을 읽는다',
      '포켓몬센터·프렌들리숍 문으로 드나든다',
      '문마다 소리가 나는지 듣는다',
    ],
    map: 418,
    spot: { kind: 'atWarp', index: 1 },
  },
  {
    id: 'mart',
    label: '프렌들리숍 안',
    env: '실내 · 상점 (소지금 2만엔)',
    try: [
      '사기·팔기·소지금이 맞는지 본다',
      '메뉴를 키보드로만 끝까지 돌려 본다',
    ],
    map: 419,
    spot: { kind: 'warp', index: 0 },
    money: 20000,
    party: [{ species: TURTWIG, level: 5 }],
    items: [[POTION, 3]],
  },
  {
    id: 'center',
    label: '포켓몬센터 안 (파티가 다쳐 있다)',
    env: '실내 · 포켓몬센터 (파티가 다쳐 있다)',
    try: [
      '회복으로 HP가 실제로 차오르는지 본다',
      '실내 NPC 5명에게 말을 건다',
      '회복 소리가 나는지 듣는다',
    ],
    map: 420,
    spot: { kind: 'warp', index: 0 },
    party: [{ species: TURTWIG, level: 12 }, { species: 403, level: 10 }],
    hurt: true,
  },
  {
    id: 'oreburgh',
    label: '무쇠시티',
    env: '야외 · 큰 도시 (NPC 28명 · 워프 16개 — 제일 무거운 자리)',
    try: [
      '건물이 많은 자리에서 프레임과 드로우콜을 본다',
      '워프를 오가며 스트리밍이 끊기는지 본다',
      '여기서 안 버티면 다른 데도 안 버틴다',
    ],
    map: 45,
    spot: { kind: 'atWarp', index: 0 },
  },
  {
    id: 'mine',
    label: '무쇠탄갱 (작업원 원사와 배틀)',
    env: '실내 · 동굴 (어둡고 높이가 진다)',
    try: [
      '어두운 실내의 조명과 층 높이를 본다',
      '트레이너전 2마리를 치른다',
      '동굴 곡으로 바뀌는지 듣는다',
    ],
    map: 198,
    spot: { kind: 'atWarp', index: 0 },
    party: [{ species: TURTWIG, level: 12 }, { species: 403, level: 10 }],
    items: [[POTION, 5]],
    battle: { kind: 'trainer', id: 195 },
  },
]

/** 세운 자리. 좌표는 타일 한가운데, `facing`은 `atan2(dx, dz)`라 0이 남쪽이다 */
export interface Placement {
  x: number
  z: number
  facing: number
}

/** 남 → 북 → 동 → 서. 순서를 고정해야 같은 표가 늘 같은 칸을 준다 */
const AROUND: readonly (readonly [number, number])[] = [[0, 1], [0, -1], [1, 0], [-1, 0]]

const center = (tx: number, tz: number, facing: number): Placement =>
  ({ x: tx + 0.5, z: tz + 0.5, facing })

/** 그 칸을 보는 방향. 캐릭터 `facing`은 `atan2(vx, vz)`라 0이 남쪽(+z)이다 */
function look(fromX: number, fromZ: number, toX: number, toZ: number): number {
  return Math.atan2(toX - fromX, toZ - fromZ)
}

/**
 * 확인 지점을 실제 칸으로 푼다. 풀 수 없으면 null —
 * 그 경우 화면이 그 줄을 흐리게 두고, 시험이 잡는다.
 */
export function resolveSpot(
  grid: MapGrid, mapId: number, spot: Spot, warps: readonly Warp[],
): Placement | null {
  if (spot.kind === 'grass') return grassSpot(grid, mapId)

  const w = warps[spot.index]
  if (!w) return null
  // 워프 위는 문이면 통행 불가다. 그대로 세우면 갇히므로 씬이 `walkOutOfDoor`로
  // 한 칸 내려 준다 — 여기서는 자리만 가리킨다
  if (spot.kind === 'warp') return center(w.x, w.z, 0)

  for (const [dx, dz] of AROUND) {
    const tx = w.x + dx, tz = w.z + dz
    if (grid.isBlocked(tx, tz)) continue
    return center(tx, tz, look(tx, tz, w.x, w.z))
  }
  return null
}

/**
 * 그 맵 풀숲의 한가운데.
 *
 * 행렬을 통째로 훑지 않고 **그 맵이 차지한 청크만** 본다 — 오버월드가 960×960이라
 * 전부 훑으면 92만 칸이다. 후보의 무게중심에 가장 가까운 칸을 고르는 이유는
 * 구역 귀퉁이가 아니라 풀숲 안쪽에 서기 위해서다. 같으면 앞선 칸이 이긴다
 */
function grassSpot(grid: MapGrid, mapId: number): Placement | null {
  const n = grid.chunkTiles
  const found: number[] = []
  let sx = 0, sz = 0
  for (const c of grid.meta.chunks) {
    if (c.zone !== mapId) continue
    for (let tz = c.my * n; tz < (c.my + 1) * n; tz++) {
      for (let tx = c.mx * n; tx < (c.mx + 1) * n; tx++) {
        if (grid.isBlocked(tx, tz) || !isEncounterTile(grid.behavior(tx, tz))) continue
        found.push(tx, tz)
        sx += tx; sz += tz
      }
    }
  }
  if (found.length === 0) return null
  const count = found.length / 2
  const cx = sx / count, cz = sz / count
  let best = 0, bestD = Infinity
  for (let i = 0; i < found.length; i += 2) {
    const d = (found[i]! - cx) ** 2 + (found[i + 1]! - cz) ** 2
    if (d < bestD) { bestD = d; best = i }
  }
  return center(found[best]!, found[best + 1]!, 0)
}
