// BDSP 야외 지역 번들 → glb (docs/orders/VISUAL_20260929.md §2)
//
// 무대(`arena.ts`)와 같은 꼴(정적 메시 + 재질)인데 **크기가 다르다.** 떡잎 · 잔모래 · 축복시티와 길들을 담은 `area001`은
// 메시 6,255개에 삼각형 150만 개이고, 무대처럼 전부 한 메시로 구우면 93MB다. 그 150만 중 120만이 **같은 메시의 사본**이다 —
// 낮은 나무 한 벌이 2,312번 · 나무 954번 · 풀 무더기 1,350번 선다(고유 메시 111개 · 고유 삼각형 29만). 그래서 같은 메시 ·
// 같은 재질을 두 번 넘게 쓰는 것은 **한 벌 + 세울 자리 목록**으로 쓴다 (`EXT_mesh_gpu_instancing` — three의 GLTFLoader가
// `InstancedMesh`로 편다).
//
// ⚠️ **좌표는 원작 칸 그대로다.** BDSP 야외는 원작 월드 좌표로 지어져 있고 x 부호만 반대다(떡잎마을 집 BDSP x −104~−115 ·
// z 876~886 ↔ 원작 104~115) — 무대처럼 x를 뒤집으면 그대로 맞는다. 높이도 같다: `area001`의 땅 466자리에서 BDSP − 원작 높이의
// 중앙값이 0.0이다 (`.audit/probe/bdspGroundH.py`)
//
// ⚠️ **굽는 쪽은 이것 하나다.** 개발 산출물(`pnpm extract:fields` → `tools/spike/bdspGroups.mjs`)도 이 파일을 돌린다 — 두 굽는 쪽이 갈릴 자리를 안 만든다
import { UNITY_PLANE } from './unityBuiltin'
import { bakeLooks, lanes, worldOf, type ImageShare, type Mat4 } from './arena'
import {
  ARRAY_BUFFER, ELEMENT_BUFFER, FLOAT, GlbBuffer, UINT, USHORT, verifyGlb, writeGlb, type Gltf,
} from './glb'
import { meshFrom, CHANNEL, type MeshData } from './mesh'
import { resource } from './texture'
import type { Environment } from './environment'
import type { UnityValue } from './typetree'

class FieldError extends Error {
  constructor(message: string) { super(message); this.name = 'FieldError' }
}

type Props = Record<string, UnityValue>
const num = (v: UnityValue | undefined, fallback = 0): number => (typeof v === 'number' ? v : fallback)
/**
 * `bool` 필드 읽기. typetree가 `bool`을 JS 불리언으로 푼다(`typetree.ts`) — `num`은 불리언을 못 읽어 늘 기본값을 돌려주므로
 * 꺼짐 검사가 한 번도 안 걸렸다. 숫자로 온 칸(스크립트 필드의 `m_Enabled 1`)도 받는다
 */
const flag = (v: UnityValue | undefined, fallback = true): boolean =>
  typeof v === 'boolean' ? v : typeof v === 'number' ? v !== 0 : fallback

/**
 * 프리팹에서 꺼져 있지만(`m_IsActive` false) **원작이 게임 중에 켜서 보이는** 물체 — 꺼 둔 것은 안 세우되 이 목록만 세운다.
 * 번들 안 스크립트 중에 이 물체를 켜는 것은 없다(`FieldEventDoorEntity` · `EffectActivator` · `EmissionColorChanger`…는 어느 것도
 * 이 물체를 참조하지 않는다 — 지역 번들 13벌의 MonoBehaviour 필드와 대조). 그래서 켜는 쪽은 번들 밖 코드이고, 근거는 **원작 땅 자료**다.
 *  - `Plane_Water (1)` (area001 `T01` · 떡잎마을 연못, 월드 (−112, 0.5, 895) · 10×10칸): 같은 번들의 다른 `Plane_Water`(`R203` · `R204`)는
 *    켜져 있고, 이 자리 100칸 중 40칸이 DS 물 칸(`isWater` — `0x0010`)이다. BDSP 화면에도 연못이 있다
 *  - `P_R_205b_Water_01` (area003 `R205b`, 원작 x 265~281 · z 522~541): 그 구역의 유일한 물 판이고, 박스 304칸 중 190칸이 DS 물 칸이다
 *  - `RoomInner` 재질 (집 · 관문 문 너머 가짜 실내): **켜지는지는 증명 못 했다.** 세우는 쪽 근거만 있다 — 재질이 `_ZOffset −1e‑5`로
 *    같은 높이의 땅을 이기게 지어졌고(아래 `ROOM_INNER`), 관문 방 바닥을 이 메시에서 쟀으며(`plates.test` 관문 시험), 바닥을 도려내는
 *    굽기(`carve`)와 `area004` 시험이 이 바닥이 서 있는 것을 전제한다. 꺼 둔 채로 두려면 이 항목과 그 셋을 함께 고쳐야 한다
 */
const ACTIVE_IN_PLAY: readonly { area: string, name: RegExp, material?: RegExp }[] = [
  { area: 'area001', name: /^Plane_Water \(1\)$/ },
  { area: 'area003', name: /^P_R_205b_Water_01$/ },
  { area: '*', name: /^P_C_001_RoomInner/, material: /RoomInner/ },
]

/**
 * **꺼진 뿌리 중 세우는 것** (area008만 있다 — 다른 지역의 꺼진 부모는 0). 뿌리가 꺼져 있으면 그 아래 전부가 안 보인다(`activeInHierarchy`).
 * area008의 꺼진 뿌리는 셋이다 — 번들 안 스크립트는 하나도 참조하지 않는다(MonoBehaviour 필드 대조). 근거는 `MapInfo`(`Dpr/scriptableobjects/gamesettings`)다:
 *  - `D18` (418개 · 원작 x 896~924 · z 192~224) = 꽃의 낙원. 존 285 `はなのらくえん`이 `AssetBundleName fields/area008`이다
 *  - `W231` (772개 · x 896~912 · z 224~480) = 바다갈림길. 존 490 `うみわれのみち`이 `fields/area008`이다
 *  둘은 플래티넘에도 있는 맵이고(우리 맵 274 `D18` · 472 `W231`) 이 판이 BDSP 그림의 **유일한 사본**이다(다른 지역에 같은 뿌리 없음).
 *  이야기가 열기 전엔 못 가는 곳이라 늘 세워도 보일 일이 없다. 안 세우면 열린 뒤에 BDSP 그림이 없다
 * 이야기가 켜는 꺼진 뿌리 (`ROOT_VARIANTS`):
 *  - `R224b` (909개 · 224번도로 아래 · x 864~926 · z 481~576): 켜진 `R224/R224`(774개)와 **같은 길의 다른 판**이다 — 메시 이름 · 자리가 같고
 *    (909개 중 766개가 켜진 쪽 배치와 이동 · 회전 · 배율 0.01 안에서 일치) 땅 · 절벽 · 못만 `_224` ↔ `_224b`로 갈린다. 둘 다 세우면 같은 풀 · 바위 · 땅이
 *    두 번 그려진다. 켜진 쪽이 기본 상태다. **언제 켜는지는 번들 · 데이터 어디에도 없다** (아래 `ROOT_VARIANTS`)
 */
const ACTIVE_ROOTS: readonly { area: string, name: string }[] = [
  { area: 'area008', name: 'D18' },
  { area: 'area008', name: 'W231' },
]

/** 이야기가 켜는 꺼진 뿌리 — 켜진 짝(`base`)을 갈아 끼우는 판 */
interface RootVariant {
  area: string
  /** 꺼진 뿌리 이름 */
  root: string
  /** 짝 — 꺼진 뿌리와 한 부모 밑에 선 켜진 뿌리 이름 */
  base: string
  /** glb 노드 `extras.variant`로 싣는 이름 — 실행 쪽(`scene/BdspField`의 `VARIANT_FLAGS`)이 깃발과 맺는다 */
  id: string
}

/**
 * **꺼진 뿌리를 따로 굽는다** — 안 세우지 않고 glb 안에 **접어 둔 채** 싣는다. 노드 `extras`가
 *  - `{ variant, mode: 'show' }`: 판이 켜질 때만 보이는 것 (꺼진 뿌리에만 있는 물체)
 *  - `{ variant, mode: 'hide' }`: 판이 켜지면 사라지는 것 (켜진 짝에만 있는 물체)
 * 를 가른다. 양쪽에 있는 물체(메시 · 재질 · 자리가 0.01칸 안에서 같다)는 표식 없이 한 번만 선다 — 판이 안 켜진 기본 상태는 전과 같은 장면이다.
 *
 * `R224b` (area008): 909개 중 908개가 서고(내장 메시 `P_C_001_InOut_01` 하나는 안 세운다) 766개가 `R224/R224`와 같아 표식 없이 한 번만 선다.
 * 142개가 `show`(꽃 `M_T_005_Flower_01~04` 131 · 계단 `OutStair` · 땅 · 못 · 절벽 · 바위 · 풀)이고 짝에만 있는 7개가 `hide`(땅 · 못 · 절벽 ·
 * 바위 `Rock_01` · 풀)다 (실측은 `field.test`)
 *
 * ⚠️ **언제 켜는지는 증명하지 못했다.** 번들 안에는 이 뿌리를 켜는 것이 없다 — `ev_script`(1,272개) · `masterdatas` · `gamesettings` · 지역 번들의
 * MonoBehaviour 어디에도 `R224b`가 없고, `MapInfo.ZoneData`(zone 411)에는 판 칸이 없다. 켜는 쪽은 번들 밖 코드다. `D18` · `W231`도 꺼져 있는 것이
 * 같은 길이다. 224번도로 스크립트(`ev_r224_flag_change`)는 `SYS_WORK_SYEIMI`(쉐이미 사건 상태)와 오박사 · 비석 깃발을 읽지만 물체를 켜는 명령은 오박사 몫이다
 * (`ev_r224_obj_change`). 판의 모습(꽃이 131 늘고 계단이 선다)만 쉐이미 사건 뒤로 읽힌다 — 어느 깃발로 켤지는 실행 쪽이 정한다. 이 표는 어느 물체가
 * 어느 판인지만 쥔다
 */
export const ROOT_VARIANTS: readonly RootVariant[] = [
  { area: 'area008', root: 'R224b', base: 'R224', id: 'r224b' },
]

/** 판 표식 — 노드 `extras`로 실린다 */
interface VariantMark { variant: string, mode: 'show' | 'hide' }

interface FieldStat {
  /** 세운 메시 (사본 포함) */
  placed: number
  /** 고유 메시 · 재질 조합 */
  unique: number
  /** 인스턴싱으로 쓴 조합 */
  instanced: number
  /** 고유 삼각형 · 사본까지 센 삼각형 */
  triangles: number
  placedTriangles: number
  materials: number
  /** 원작 좌표의 x · z 범위 */
  box: [number, number, number, number]
  bytes: number
  /** 실내 바닥 밑에서 잘라 낸 삼각형 (위 `ROOM_INNER`) */
  carved: number
  /** 꺼 둔 물체라 안 세운 것 (`ACTIVE_IN_PLAY` 예외 빼고) */
  inactive: number
  /** 부모가 꺼져 있어(`activeInHierarchy` false) 안 세운 것 (`ACTIVE_ROOTS` · `ROOT_VARIANTS` 빼고) */
  inactiveByParent: number
  /** 판(`ROOT_VARIANTS`)마다 — 접어 둔 채 실은 것(`shown` 켜질 때 보임 · `hidden` 켜지면 사라짐)과 짝과 같아 한 번만 세운 것(`shared`)의 배치 수 */
  variants: Record<string, { shown: number, hidden: number, shared: number }>
  problems: string[]
}


/**
 * `unity default resources`의 Plane(PathID 10209). 번들에 없어 `env.read`가 null이다 — 연못·늪의 물이 모두 이 평면이다
 * (떡잎마을 `Plane_Water (1)` · 201·203·204·205·212·213·214·225·227·228·229번 도로 · 축복·연고·늪 등 36자리).
 * Unity 모양 그대로: 10×10, 11×11 정점, 법선 +Y, UV = 격자/10
 */
/** 기본 평면 중 물만 세운다 — 그림자·그라데이션 판(`EntShadow` · `Grad` · `PlaneGrass`)은 따로 볼 일이다 */
const BUILTIN_PLANE_MATERIAL = /Water/

function unityPlane(): MeshData {
  const n = 11
  const pos = new Float32Array(n * n * 3)
  const nor = new Float32Array(n * n * 3)
  const uv = new Float32Array(n * n * 2)
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const v = j * n + i
      pos[v * 3] = 5 - i; pos[v * 3 + 2] = 5 - j
      nor[v * 3 + 1] = 1
      uv[v * 2] = i / 10; uv[v * 2 + 1] = j / 10
    }
  }
  const indices = new Uint32Array(10 * 10 * 6)
  let k = 0
  for (let j = 0; j < 10; j++) {
    for (let i = 0; i < 10; i++) {
      const a = j * n + i, b = a + 1, c = a + n, d = c + 1
      indices.set([a, c, b, b, c, d], k); k += 6
    }
  }
  return {
    name: 'Plane', vertexCount: n * n,
    attributes: new Map([[CHANNEL.position, pos], [CHANNEL.normal, nor], [CHANNEL.uv0, uv]]),
    intAttributes: new Map(),
    dimensions: new Map([[CHANNEL.position, 3], [CHANNEL.normal, 3], [CHANNEL.uv0, 2]]),
    indices,
    subMeshes: [{ firstByte: 0, indexCount: indices.length, topology: 0, baseVertex: 0, firstVertex: 0, vertexCount: n * n }],
    bindPose: new Float32Array(0), boneNameHashes: new Uint32Array(0),
  }
}

interface Group {
  meshPid: number
  mesh: MeshData
  wide: boolean
  slots: number[]
  worlds: Mat4[]
  /** 남의 구역에서 한 줄만 빌려 온 조각이면 그 줄의 z 범위(원작 칸) — 그 안의 삼각형만 남긴다 (`ZONE_SEAMS`) */
  seam?: readonly [number, number]
  /** 판 표식 (`ROOT_VARIANTS`) — 있으면 노드 `extras`에 싣는다 */
  mark?: VariantMark
}

/**
 * **지역 번들이 품은 남의 구역 중 안 세우는 것** — 구역(`Offset` 밑의 뿌리 `C04` · `R206` 같은 이름)으로.
 *
 * BDSP는 구역마다 지역 **하나**를 띄우고(`MapInfo.ZoneData[].AssetBundleName`), 경계 너머가 비지 않게 이웃 구역을 사본으로
 * 품는다. 우리는 가까운 지역을 여럿 한꺼번에 세우므로(`scene/BdspField`의 `pickFields`) 사본이 겹쳐 선다. 그래서 구역마다
 * **한 지역에만** 남긴다 — 남긴 지역의 상자가 그 구역을 품으므로 그 구역 가까이 오면 그 지역이 선다.
 *
 * 열여덟 구역이 둘 이상의 지역에 있다. 열여섯은 배치(메시 · 자리 0.01칸)가 사본끼리 하나도 안 다르다 — 그대로 두면 같은
 * 삼각형을 두세 번 그리고(연고시티 땅 5,862삼각형이 area004 · 005 · 007에), 섞어 그리는 그림자(`Grad_01` · 뿌리)와 더해 그리는
 * 입구 빛(`PokeCenLight`)은 겹친 만큼 진해진다. 번호가 낮은 지역에 남긴다.
 *
 * ⚠️ **area002의 영원시티(`C04`)와 206번도로(`R206`)만 한 칸 남쪽**(z +1)이다 — 구역 뿌리가 area002에서 (−288, 0, 513) ·
 * (−284, 0, 577), area003에서 512 · 576이다. 그 둘을 dz −1로 옮기면 배치 522/522 · 527/527이 area003과 꼭 맞는다.
 * 원작 칸과 맞는 쪽은 area003이다 — 센터 문 열둘이 워프 칸에서 0.06~0.40(area002는 0.80~1.28), 206번도로 관문 둘이 워프
 * 569 · 681을 품고(area002는 못 품는다) 표지판 · 나무열매 흙이 원작 칸에 선다. 그래서 그 둘은 area003에 남긴다 —
 * 둘 다 세우면 영원시티 건물이 한 칸 어긋나 두 벌 서고, 1인칭으로 센터 문 앞에 서면 area002 현관 기둥 사이에 선다.
 *
 * ⚠️ area007은 208번도로를 `Offset` 밖(번들 뿌리 바로 밑)에 조각 일곱으로 품는다 — 그 조각 이름이 구역 자리에 온다(`zoneOf`).
 * 배치 358이 area004의 `R208`과 하나도 안 다르다
 */
const FOREIGN_ZONES: Readonly<Record<string, readonly string[]>> = {
  area002: ['C04', 'R206'],
  area003: ['R204'],
  area005: ['C05', 'R209'],
  area006: ['C07', 'R215'],
  area007: ['C05', 'R212', 'P_R_208_Cliff_01', 'P_R_208_Ground_01', 'P_R_208_Ground_02', 'P_R_208_Pond_01', 'P_R_208_Water_01',
    'P_R_208_Water_02', 'P_C_001_SeedSoil_03'],
  area010: ['C01', 'R218'],
  area013: ['C06', 'C07', 'C08', 'R213', 'R214', 'R222'],
  area014: ['R228', 'W226'],
}

/**
 * 버린 사본에서 **한 줄만** 빌려 오는 조각.
 *
 * BDSP의 206번도로 땅은 127줄(구역 z 0~127)이고 원작 길은 128줄(576~703)이다. area003 사본만 세우면 207번도로(704~)와
 * 사이에 한 줄 틈(z 703~704 · x 278~329)이 나서 아래로 쏜 레이 15/15가 땅을 못 맞힌다 — area002가 한 칸 밀어 둔 것은 그
 * 이음매를 207번도로에 대려던 것이다. 그 줄의 땅 · 절벽만 남긴다 (땅 88 · 절벽 67삼각형 · 걸친 37은 버린다)
 */
const ZONE_SEAMS: Readonly<Record<string, Readonly<Record<string, { objects: readonly string[], z: readonly [number, number] }>>>> = {
  area002: { R206: { objects: ['P_R_206_Ground_01', 'P_R_206_Cliff_01'], z: [703, 704] } },
}

/**
 * **구역 안에서 물체 단위로 임자를 바꾸는 것** — `빌린다`는 버린 사본에서 통째로 세우고, `버린다`는 남긴 사본에서 뺀다.
 *
 * ⚠️ **206번도로의 나무열매 흙만 area002 쪽이 원작 칸이다.** 흙 메시는 뿌리에서 북쪽으로 1.1칸 뻗는데(제 좌표 z −1.10~0.11),
 * area003 사본의 흙 넷은 z 625.9~627.1 · 689.9~691.1이라 원작 밭 칸(627 · 691)의 한 칸 북쪽에 앉는다 — 밭에 선 나무열매 판이
 * 흙 옆 맨땅에 섰다. area002 사본은 626.9~628.1 · 690.9~692.1로 그 칸을 덮는다. 같은 구역의 문 · 관문 · 계단은 area003이 맞으므로
 * 흙만 바꾼다 (`BerryPatchProps.test`의 114곳)
 */
const ZONE_SWAPS: Readonly<Record<string, Readonly<Record<string, { borrow?: RegExp, drop?: RegExp }>>>> = {
  area002: { R206: { borrow: /SeedSoil/ } },
  area003: { R206: { drop: /SeedSoil/ } },
}

/** 물체가 선 구역 — `Offset` 바로 밑의 뿌리 이름. `Offset`이 없으면 번들 뿌리 바로 밑이다 (area007의 `R208`) */
function zoneOf(env: Environment, transformPid: number, memo: Map<number, string | null>): string | null {
  const had = memo.get(transformPid)
  if (had !== undefined) return had
  const chain: number[] = []
  let p = transformPid
  for (let guard = 0; p !== 0 && guard < 256; guard++) {
    chain.push(p)
    const t = env.read(p) as Props | null
    const father = num((t?.m_Father as Props | undefined)?.m_PathID)
    if (father === p) break
    p = father
  }
  const goName = (tp: number): string | null => {
    const t = env.read(tp) as Props | null
    const go = env.read(num((t?.m_GameObject as Props | undefined)?.m_PathID)) as Props | null
    return typeof go?.m_Name === 'string' ? go.m_Name : null
  }
  // chain: 물체 … 구역 뿌리 · Offset · 번들 뿌리
  let zone: string | null = null
  if (chain.length >= 3 && goName(chain[chain.length - 2]!) === 'Offset') zone = goName(chain[chain.length - 3]!)
  else if (chain.length >= 2) zone = goName(chain[chain.length - 2]!)
  memo.set(transformPid, zone)
  return zone
}

const markKey = (m: VariantMark | undefined): string => (m ? `${m.variant}:${m.mode}` : '')

/** 두 월드 행렬이 같은 자리인가 — 이동 · 회전 · 배율 열이 0.01 안에서 같다 (`ROOT_VARIANTS`) */
function sameSpot(a: Mat4, b: Mat4): boolean {
  for (let i = 0; i < 12; i++) if (Math.abs(a[i]! - b[i]!) > COPLANAR) return false
  return true
}

/** Unity 월드 행렬 → 원작 좌표(x 뒤집기)의 행렬. `F·W·F` (F = diag(−1, 1, 1)) */
export function flipped(w: Mat4): Mat4 {
  const m = Float64Array.from(w)
  // 행 0과 열 0의 부호를 바꾼다(교차 칸 [0]은 두 번 바뀌어 그대로)
  for (let c = 1; c < 4; c++) m[c] = -m[c]!
  for (let r = 1; r < 4; r++) m[r * 4] = -m[r * 4]!
  return m
}

/** 행 우선 4×4 → 이동 · 회전(사원수) · 배율. 밀림(shear)은 버린다 */
export function decompose(m: Mat4): { t: number[], r: number[], s: number[] } {
  const col = (c: number): number[] => [m[c]!, m[4 + c]!, m[8 + c]!]
  const cx = col(0), cy = col(1), cz = col(2)
  let sx = Math.hypot(...cx); const sy = Math.hypot(...cy); const sz = Math.hypot(...cz)
  const det = cx[0]! * (cy[1]! * cz[2]! - cy[2]! * cz[1]!) - cy[0]! * (cx[1]! * cz[2]! - cx[2]! * cz[1]!)
    + cz[0]! * (cx[1]! * cy[2]! - cx[2]! * cy[1]!)
  if (det < 0) sx = -sx
  const r00 = cx[0]! / sx, r10 = cx[1]! / sx, r20 = cx[2]! / sx
  const r01 = cy[0]! / sy, r11 = cy[1]! / sy, r21 = cy[2]! / sy
  const r02 = cz[0]! / sz, r12 = cz[1]! / sz, r22 = cz[2]! / sz
  const trace = r00 + r11 + r22
  let x: number, y: number, z: number, w: number
  if (trace > 0) {
    const k = 0.5 / Math.sqrt(trace + 1)
    w = 0.25 / k; x = (r21 - r12) * k; y = (r02 - r20) * k; z = (r10 - r01) * k
  } else if (r00 > r11 && r00 > r22) {
    const k = 2 * Math.sqrt(1 + r00 - r11 - r22)
    w = (r21 - r12) / k; x = 0.25 * k; y = (r01 + r10) / k; z = (r02 + r20) / k
  } else if (r11 > r22) {
    const k = 2 * Math.sqrt(1 + r11 - r00 - r22)
    w = (r02 - r20) / k; x = (r01 + r10) / k; y = 0.25 * k; z = (r12 + r21) / k
  } else {
    const k = 2 * Math.sqrt(1 + r22 - r00 - r11)
    w = (r10 - r01) / k; x = (r02 + r20) / k; y = (r12 + r21) / k; z = 0.25 * k
  }
  const len = Math.hypot(x, y, z, w) || 1
  return { t: [m[3]!, m[7]!, m[11]!], r: [x / len, y / len, z / len, w / len], s: [sx, sy, sz] }
}

/** glTF 노드 행렬(열 우선) */
function columnMajor(m: Mat4): number[] {
  const out: number[] = []
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) out.push(m[r * 4 + c]!)
  return out
}

// ── 문 너머 가짜 실내의 바닥 밑을 도려낸다 ─────────────────────────────────────
//
// ⚠️ BDSP 집 · 관문은 문 너머에 **가짜 실내**를 세운다 — 재질 이름 `M_C_001_RoomInner_##`, 바닥 하나에 낮은 벽 넷(높이 2)뿐인
// 상자다. 관문(`P_C_001_BarrierGate_01`)은 8×5.5칸짜리 체크 바닥을, 집은 문 뒤 2.5×1.75칸을 든다. 그 바닥이 **바깥 땅과 같은
// 높이로 겹친다** — 지역 14곳의 구운 glb에서 RoomInner 바닥 위 0.25칸 표본 59,140자리 중 57,819자리를 같은 높이(2mm 안)의 바깥 면이
// 덮는다(나머지 1,321자리는 밑이 비었거나 더 낮다). 덮은 쪽은 거의 땅(`Ground` · `GroundTile` · `Soil` · 바닷물 판)이다.
// 원작은 재질의 `_ZOffset`(RoomInner · 관문 껍데기 −1e‑5, 땅 0)으로 실내를 앞으로 당겨 이긴다. glTF에는 깊이 밀기가 없어서
// 1인칭으로 문간에 서면 체크 바닥과 풀이 얼룩으로 싸웠다. 그래서 굽기에서 **실내 바닥 발자국 안의 같은 높이 면을 잘라 낸다** —
// 원작 화면에서 보이는 것(실내 바닥)만 남는다.
//
// ⚠️ 사본으로 세운 메시(인스턴싱)는 안 자른다 — 한 벌을 자르면 모든 자리가 같이 뚫린다. 겹치는 사본은 문 앞 빛 웅덩이
// (`PokeCenLight`, 더해서 그린다) · 풀 이음매 · 길 · 문 문턱 몇 조각뿐이다. 잘라 낸 뒤 같은 표본에서 같은 높이로 덮인 자리는
// 1,403이고 전부 이 사본들이다. 바닥 발자국 밖에서 덮개를 잃은 자리는 0이다 (14곳 · 바닥 상자를 1칸 넓힌 무작위 표본 168,787)

/** 가짜 실내 재질 */
const ROOM_INNER = /RoomInner/
/** 야외 지역 번들 이름 (`convert.fieldBundles`와 같은 꼴) */
const FIELD_NAME = /^(area\d+|safari)$/
/** 같은 높이로 보는 차(칸). 겹친 자리는 다 2mm 안이다 */
const COPLANAR = 0.01
/** 수평으로 보는 면 — 법선 y 성분 */
const LEVEL = 0.9
/** 버리는 조각 넓이(칸²) — 구멍 삼각형 이음매의 부동소수점 부스러기 */
const SLIVER = 1e-6

/** xz 평면의 점 */
type Pt = [number, number]

/** 도려낼 실내 바닥 삼각형 하나 (원작 좌표 · xz는 반시계) */
export interface Hole {
  xz: [Pt, Pt, Pt]
  y: [number, number, number]
  box: [number, number, number, number]
}

const cross2 = (a: Pt, b: Pt, p: Pt): number => (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0])
function area2(poly: readonly Pt[]): number {
  let s = 0
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i]!, b = poly[(i + 1) % poly.length]!
    s += a[0] * b[1] - b[0] * a[1]
  }
  return s / 2
}

/** 볼록 다각형을 반평면 하나로 자른다 — `keep`이 1이면 a→b 왼쪽, −1이면 오른쪽을 남긴다 (Sutherland–Hodgman) */
function clipHalf(poly: readonly Pt[], a: Pt, b: Pt, keep: 1 | -1): Pt[] {
  const out: Pt[] = []
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i]!, q = poly[(i + 1) % poly.length]!
    const dp = keep * cross2(a, b, p), dq = keep * cross2(a, b, q)
    if (dp >= 0) out.push(p)
    if ((dp > 0 && dq < 0) || (dp < 0 && dq > 0)) {
      const t = dp / (dp - dq)
      out.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t])
    }
  }
  return out
}

/**
 * 볼록 다각형 `poly`에서 반시계 삼각형 `cut`을 뺀 나머지 — 서로 안 겹치는 볼록 조각들.
 * 변마다 바깥쪽을 떼어 내고 안쪽만 이어 자르면 끝에 남는 것이 `cut` 안이다(버린다). 감기 방향은 `poly`를 따른다
 */
export function subtractTriangle(poly: readonly Pt[], cut: readonly [Pt, Pt, Pt]): Pt[][] {
  const pieces: Pt[][] = []
  let rest: Pt[] = [...poly]
  for (let e = 0; e < 3 && rest.length >= 3; e++) {
    const a = cut[e]!, b = cut[(e + 1) % 3]!
    const outside = clipHalf(rest, a, b, -1)
    if (outside.length >= 3 && Math.abs(area2(outside)) > SLIVER) pieces.push(outside)
    rest = clipHalf(rest, a, b, 1)
  }
  return pieces
}

/** 원작 좌표의 실내 바닥 삼각형 — 수평인 것만 (가짜 실내에는 천장이 없다) */
export function holeOf(p0: readonly number[], p1: readonly number[], p2: readonly number[]): Hole | null {
  const ux = p1[0]! - p0[0]!, uy = p1[1]! - p0[1]!, uz = p1[2]! - p0[2]!
  const vx = p2[0]! - p0[0]!, vy = p2[1]! - p0[1]!, vz = p2[2]! - p0[2]!
  const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx
  const len = Math.hypot(nx, ny, nz)
  if (len < 1e-9 || Math.abs(ny) < LEVEL * len) return null
  let xz: [Pt, Pt, Pt] = [[p0[0]!, p0[2]!], [p1[0]!, p1[2]!], [p2[0]!, p2[2]!]]
  let y: [number, number, number] = [p0[1]!, p1[1]!, p2[1]!]
  if (area2(xz) < 0) { xz = [xz[0], xz[2], xz[1]]; y = [y[0], y[2], y[1]] }
  const xs = xz.map((p) => p[0]), zs = xz.map((p) => p[1])
  return { xz, y, box: [Math.min(...xs), Math.min(...zs), Math.max(...xs), Math.max(...zs)] }
}

/** 실내 바닥 삼각형의 그 자리 높이 */
function holeHeight(h: Hole, x: number, z: number): number {
  const [a, b, c] = h.xz
  const det = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1])
  const l1 = ((b[1] - c[1]) * (x - c[0]) + (c[0] - b[0]) * (z - c[1])) / det
  const l2 = ((c[1] - a[1]) * (x - c[0]) + (a[0] - c[0]) * (z - c[1])) / det
  return l1 * h.y[0] + l2 * h.y[1] + (1 - l1 - l2) * h.y[2]
}

/** 칸 4개 크기 격자에 구멍을 나눠 둔다 — 땅 삼각형마다 구멍 전부를 훑지 않게 */
const BIN = 4
export class HoleIndex {
  private readonly bins = new Map<string, Hole[]>()
  // ⚠️ 매개변수 속성(`constructor(readonly …)`)을 안 쓴다 — 노드 굽는 쪽이 타입만 벗겨 돌린다(`--experimental-strip-types`)
  constructor(holes: readonly Hole[]) {
    for (const h of holes) {
      for (let i = Math.floor(h.box[0] / BIN); i <= Math.floor(h.box[2] / BIN); i++) {
        for (let k = Math.floor(h.box[1] / BIN); k <= Math.floor(h.box[3] / BIN); k++) {
          const key = `${String(i)},${String(k)}`
          const list = this.bins.get(key)
          if (list) list.push(h)
          else this.bins.set(key, [h])
        }
      }
    }
  }

  near(box: readonly number[]): Hole[] {
    const seen = new Set<Hole>()
    for (let i = Math.floor(box[0]! / BIN); i <= Math.floor(box[2]! / BIN); i++) {
      for (let k = Math.floor(box[1]! / BIN); k <= Math.floor(box[3]! / BIN); k++) {
        for (const h of this.bins.get(`${String(i)},${String(k)}`) ?? []) {
          if (h.box[0] <= box[2]! && h.box[2] >= box[0]! && h.box[1] <= box[3]! && h.box[3] >= box[1]!) seen.add(h)
        }
      }
    }
    return [...seen]
  }
}

/** 잘라 낸 메시 — 정점은 제 좌표(유니티, x 안 뒤집음) 그대로 늘어난다 */
interface Carved {
  pos: Float32Array
  nrm: Float32Array
  uv: Float32Array
  count: number
  subs: Uint32Array[]
  /** 손댄 삼각형 수 */
  touched: number
}

/**
 * 한 자리에 선 메시에서 실내 바닥과 같은 높이로 겹치는 부분을 잘라 낸다.
 *
 * `toWorld`는 제 좌표 정점 번호 → 원작 좌표 점이다. 잘린 조각의 새 정점은 원래 삼각형 안의 무게중심 좌표로 위치 · 법선 · UV를
 * 고루 섞는다 — 땅은 평면이라 위치는 그 평면 위에 그대로 남는다. `skip`인 부분 메시는 건드리지 않는다
 */
export function carveMesh(
  pos: Float32Array, nrm: Float32Array, uv: Float32Array, count: number,
  subs: readonly Uint32Array[], skip: readonly boolean[],
  toWorld: (i: number) => [number, number, number], index: { near: (box: readonly number[]) => Hole[] },
): Carved | null {
  const world: [number, number, number][] = []
  for (let i = 0; i < count; i++) world.push(toWorld(i))
  // 새로 생긴 정점만 모은다 — 원래 정점은 끝에 앞으로 붙인다
  const P: number[] = [], N: number[] = [], U: number[] = []
  let n = count
  let touched = 0
  const out: Uint32Array[] = []
  for (let s = 0; s < subs.length; s++) {
    const tri = subs[s]!
    if (skip[s]) { out.push(tri); continue }
    const kept: number[] = []
    for (let t = 0; t + 2 < tri.length; t += 3) {
      const i0 = tri[t]!, i1 = tri[t + 1]!, i2 = tri[t + 2]!
      const a = world[i0]!, b = world[i1]!, c = world[i2]!
      const box = [Math.min(a[0], b[0], c[0]), Math.min(a[2], b[2], c[2]), Math.max(a[0], b[0], c[0]), Math.max(a[2], b[2], c[2])]
      const near = index.near(box)
      // 땅 평면의 높이 — xz 무게중심 좌표로 잰다. 선 면(수직)은 높이가 없다
      const det = (b[2] - c[2]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[2] - c[2])
      if (near.length === 0 || Math.abs(det) < 1e-9) { kept.push(i0, i1, i2); continue }
      const bary = (x: number, z: number): [number, number, number] => {
        const l1 = ((b[2] - c[2]) * (x - c[0]) + (c[0] - b[0]) * (z - c[2])) / det
        const l2 = ((c[2] - a[2]) * (x - c[0]) + (a[0] - c[0]) * (z - c[2])) / det
        return [l1, l2, 1 - l1 - l2]
      }
      const heightAt = (x: number, z: number): number => {
        const [l1, l2, l3] = bary(x, z)
        return l1 * a[1] + l2 * b[1] + l3 * c[1]
      }
      let pieces: Pt[][] = [[[a[0], a[2]], [b[0], b[2]], [c[0], c[2]]]]
      let cut = false
      const whole: Pt[] = [[a[0], a[2]], [b[0], b[2]], [c[0], c[2]]]
      for (const h of near) {
        // 높이는 **겹친 자리에서만** 잰다 — 바닥 삼각형(8칸)이 땅 삼각형보다 크면 땅 평면을 바닥 꼭짓점까지 늘려 재는 것은
        // 조금만 기울어도 어긋난다. 5cm 아래 깔린 큰 밑판(`area002` 땅 `Ground_01_01` y 2.95 · 그 위 실내 바닥 3.0)은 같은 높이가 아니다 — 안 자른다
        let overlap = whole
        for (let e = 0; e < 3 && overlap.length >= 3; e++) overlap = clipHalf(overlap, h.xz[e]!, h.xz[(e + 1) % 3]!, 1)
        if (overlap.length < 3 || Math.abs(area2(overlap)) <= SLIVER) continue
        if (overlap.some(([x, z]) => Math.abs(heightAt(x, z) - holeHeight(h, x, z)) > COPLANAR)) continue
        const next: Pt[][] = []
        for (const p of pieces) next.push(...subtractTriangle(p, h.xz))
        pieces = next
        cut = true
        if (pieces.length === 0) break
      }
      if (!cut) { kept.push(i0, i1, i2); continue }
      touched++
      const corner = [i0, i1, i2]
      for (const piece of pieces) {
        const ids = piece.map(([x, z]) => {
          const l = bary(x, z)
          // 원래 꼭짓점이면 그 정점을 그대로 쓴다
          for (let k = 0; k < 3; k++) if (Math.abs(l[k]! - 1) < 1e-9) return corner[k]!
          for (let d = 0; d < 3; d++) P.push(l[0] * pos[i0 * 3 + d]! + l[1] * pos[i1 * 3 + d]! + l[2] * pos[i2 * 3 + d]!)
          const nx = l[0] * nrm[i0 * 3]! + l[1] * nrm[i1 * 3]! + l[2] * nrm[i2 * 3]!
          const ny = l[0] * nrm[i0 * 3 + 1]! + l[1] * nrm[i1 * 3 + 1]! + l[2] * nrm[i2 * 3 + 1]!
          const nz = l[0] * nrm[i0 * 3 + 2]! + l[1] * nrm[i1 * 3 + 2]! + l[2] * nrm[i2 * 3 + 2]!
          const len = Math.hypot(nx, ny, nz) || 1
          N.push(nx / len, ny / len, nz / len)
          for (let d = 0; d < 2; d++) U.push(l[0] * uv[i0 * 2 + d]! + l[1] * uv[i1 * 2 + d]! + l[2] * uv[i2 * 2 + d]!)
          return n++
        })
        for (let k = 1; k + 1 < ids.length; k++) kept.push(ids[0]!, ids[k]!, ids[k + 1]!)
      }
    }
    out.push(Uint32Array.from(kept))
  }
  if (touched === 0) return null
  const grow = (base: Float32Array, more: number[], k: number): Float32Array => {
    const all = new Float32Array(n * k)
    all.set(base.subarray(0, count * k))
    all.set(more, count * k)
    return all
  }
  return { pos: grow(pos, P, 3), nrm: grow(nrm, N, 3), uv: grow(uv, U, 2), count: n, subs: out, touched }
}

/** 원작 좌표(x 뒤집은 행렬 `m`)로 옮긴 제 좌표 정점 — 정점은 유니티 그대로라 x를 먼저 뒤집는다 */
function placeFlipped(m: Mat4, pos: Float32Array, i: number): [number, number, number] {
  const x = -pos[i * 3]!, y = pos[i * 3 + 1]!, z = pos[i * 3 + 2]!
  return [
    m[0]! * x + m[1]! * y + m[2]! * z + m[3]!,
    m[4]! * x + m[5]! * y + m[6]! * z + m[7]!,
    m[8]! * x + m[9]! * y + m[10]! * z + m[11]!,
  ]
}

export async function exportField(
  env: Environment,
  encodePng: (rgba: Uint8Array, width: number, height: number) => Promise<Uint8Array>,
  options: {
    name?: string, maxSize?: number | null, share?: ImageShare,
    /**
     * 가짜 실내 바닥 밑을 도려낼까 (위 `ROOM_INNER`). 기본은 **야외 지역 이름**(`area###` · `safari`)일 때만 — 던전(`d##…`)도
     * 이 함수를 지나가는데, 던전 산출물은 이 고침과 상관없이 바이트가 그대로여야 한다
     */
    carve?: boolean
  } = {},
): Promise<{ glb: Uint8Array, stat: FieldStat }> {
  const name = options.name ?? 'field'
  const carve = options.carve ?? FIELD_NAME.test(name)
  const filters = env.ofType('MeshFilter')
  if (filters.length === 0) throw new FieldError('MeshFilter가 없다')

  const buf = new GlbBuffer()
  const { images, textures, materials, samplers, slotOf, uvOf, materialName } =
    await bakeLooks(env, encodePng, buf, { maxSize: options.maxSize ?? null, lights: true, share: options.share })

  // ── 메시 · 재질 조합마다 세울 자리를 모은다 ──
  const cache = new Map<number, Mat4>()
  const groups = new Map<string, Group>()
  const meshCache = new Map<number, { mesh: MeshData, wide: boolean } | null>()
  const zones = new Map<number, string | null>()
  let placed = 0
  let placedTriangles = 0
  let inactive = 0
  let inactiveByParent = 0
  const parentMemo = new Map<number, boolean>()
  const inactiveAncestor = (tp: number, area: string, memo: Map<number, boolean>): boolean => {
    const had = memo.get(tp)
    if (had !== undefined) return had
    const t = env.read(tp) as Props | null
    const father = num((t?.m_Father as Props | undefined)?.m_PathID)
    let hidden = false
    if (father !== 0 && father !== tp) {
      const ft = env.read(father) as Props | null
      const fgo = env.read(num((ft?.m_GameObject as Props | undefined)?.m_PathID)) as Props | null
      const fname = typeof fgo?.m_Name === 'string' ? fgo.m_Name : ''
      const off = fgo !== null && !flag(fgo.m_IsActive)
      const kept = off && (ACTIVE_ROOTS.some((r) => r.area === area && r.name === fname)
        || ROOT_VARIANTS.some((v) => v.area === area && v.root === fname))
      hidden = (off && !kept) || inactiveAncestor(father, area, memo)
    }
    memo.set(tp, hidden)
    return hidden
  }
  // ── 판 (`ROOT_VARIANTS`) — 꺼진 뿌리 밑이면 `variant`, 그 켜진 짝 밑이면 `base`. 부모 쪽에서 아래로 물려받는다 ──
  const variants = ROOT_VARIANTS.filter((v) => v.area === name)
  const lineageMemo = new Map<number, { variant: string | null, base: string | null }>()
  const goNameOf = (tp: number): string => {
    const t = env.read(tp) as Props | null
    const go = env.read(num((t?.m_GameObject as Props | undefined)?.m_PathID)) as Props | null
    return typeof go?.m_Name === 'string' ? go.m_Name : ''
  }
  const lineage = (tp: number): { variant: string | null, base: string | null } => {
    const had = lineageMemo.get(tp)
    if (had) return had
    const t = env.read(tp) as Props | null
    const father = num((t?.m_Father as Props | undefined)?.m_PathID)
    const up = father !== 0 && father !== tp ? lineage(father) : { variant: null, base: null }
    let { variant, base } = up
    const own = goNameOf(tp)
    for (const v of variants) {
      if (own === v.root && variant === null) variant = v.id
      // 짝: 꺼진 뿌리와 한 부모 밑에 선 같은 이름 아닌 켜진 뿌리 (`R224/R224` — 구역 뿌리 `R224`와 이름이 같아도 부모가 꺼진 뿌리를 품은 쪽이다)
      if (own === v.base && base === null && father !== 0) {
        const kids = ((env.read(father) as Props | null)?.m_Children as Props[] | undefined) ?? []
        if (kids.some((c) => goNameOf(num(c.m_PathID)) === v.root)) base = v.id
      }
    }
    const out = { variant, base }
    lineageMemo.set(tp, out)
    return out
  }
  /** 판의 배치 — 짝과 맞춘 뒤(아래) 노드가 된다 */
  const pending: { id: string, side: 'variant' | 'base', key: string, group: Omit<Group, 'worlds' | 'mark'>, world: Mat4, triangles: number }[] = []
  for (const filter of filters) {
    const mf = env.readEntry(filter) as Props | null
    if (!mf) continue
    const meshRef = mf.m_Mesh as Props | undefined
    // `unity default resources`의 기본 메시는 번들에 없다 — 물 평면만 같은 모양을 지어 세운다 (위 `UNITY_PLANE`)
    const builtin = num(meshRef?.m_FileID) !== 0
    const meshPid = builtin ? -num(meshRef?.m_PathID) : num(meshRef?.m_PathID)
    let got = meshCache.get(meshPid)
    if (got === undefined && builtin) {
      got = meshPid === -UNITY_PLANE ? { mesh: unityPlane(), wide: false } : null
      meshCache.set(meshPid, got)
    }
    if (got === undefined) {
      const meshValue = env.read(meshPid) as Props | null
      const holder = env.bundleOf(meshPid)
      try {
        got = meshValue ? { mesh: meshFrom(meshValue, (p) => (holder ? resource(holder, p) : null)), wide: num(meshValue.m_IndexFormat) === 1 } : null
      } catch { got = null }
      if (got && got.mesh.vertexCount === 0) got = null
      meshCache.set(meshPid, got)
    }
    if (!got) continue

    const goPid = num((mf.m_GameObject as Props | undefined)?.m_PathID)
    const go = env.read(goPid) as Props | null
    if (!go) continue
    const goActive = flag(go.m_IsActive)
    let transformPid = 0
    let slots: number[] = []
    let enabled = true
    for (const c of (go.m_Component as UnityValue[] | undefined) ?? []) {
      const holder = (Array.isArray(c) ? c[1] : c) as Props
      const ptr = (holder.component ?? holder) as Props
      const pid = num(ptr.m_PathID)
      const type = env.entryOf(pid)?.type
      if (type === 'Transform' || type === 'RectTransform') transformPid = pid
      if (type === 'MeshRenderer') {
        const mr = env.read(pid) as Props | null
        slots = ((mr?.m_Materials as Props[] | undefined) ?? []).map((p) => num(p.m_PathID))
        enabled = flag(mr?.m_Enabled)
      }
    }
    if (!enabled || slots.length === 0 || transformPid === 0) continue
    // ⚠️ **꺼 둔 물체는 안 세운다** (`m_IsActive` false) — 위 `ACTIVE_IN_PLAY`만 예외다. 부모가 꺼진 것(`activeInHierarchy`)도 같다 —
    // 꺼진 뿌리는 `ACTIVE_ROOTS`만 세운다
    if (inactiveAncestor(transformPid, name, parentMemo)) { inactiveByParent++; continue }
    if (!goActive) {
      const goName = typeof go.m_Name === 'string' ? go.m_Name : ''
      const mats = slots.map((m) => materialName.get(m) ?? '')
      const on = ACTIVE_IN_PLAY.some((r) => (r.area === '*' || r.area === name) && r.name.test(goName)
        && (!r.material || mats.some((m) => r.material!.test(m))))
      if (!on) { inactive++; continue }
    }
    if (builtin && !slots.every((m) => BUILTIN_PLANE_MATERIAL.test(materialName.get(m) ?? ''))) continue
    // 남의 구역 사본은 버린다 — 이음매 한 줄만 빌린다 (위 `FOREIGN_ZONES` · `ZONE_SEAMS`)
    let seam: readonly [number, number] | undefined
    const foreign = FOREIGN_ZONES[name]
    const swaps = ZONE_SWAPS[name]
    if (foreign || swaps) {
      const zone = zoneOf(env, transformPid, zones)
      const goName = typeof go.m_Name === 'string' ? go.m_Name : ''
      const swap = zone === null ? undefined : swaps?.[zone]
      if (swap?.drop?.test(goName) === true) continue
      if (zone !== null && foreign?.includes(zone) === true && swap?.borrow?.test(goName) !== true) {
        const borrow = ZONE_SEAMS[name]?.[zone]
        if (!borrow || !borrow.objects.includes(goName)) continue
        seam = borrow.z
      }
    }
    const key = `${String(meshPid)}:${slots.join(',')}${seam ? ':seam' : ''}`
    const world = worldOf(env, transformPid, cache)
    const triangleCount = got.mesh.subMeshes.reduce((a, s) => a + Math.floor(s.indexCount / 3), 0)
    const kin = variants.length > 0 ? lineage(transformPid) : { variant: null, base: null }
    if (kin.variant !== null || kin.base !== null) {
      // 판에 걸린 배치는 짝과 맞춰 본 뒤에 세운다 (아래)
      pending.push({
        id: (kin.variant ?? kin.base)!, side: kin.variant !== null ? 'variant' : 'base', key,
        group: { meshPid, mesh: got.mesh, wide: got.wide, slots, ...(seam ? { seam } : {}) }, world, triangles: triangleCount,
      })
      continue
    }
    const g = groups.get(key)
    if (g) g.worlds.push(world)
    else groups.set(key, { meshPid, mesh: got.mesh, wide: got.wide, slots, worlds: [world], ...(seam ? { seam } : {}) })
    placed++
    placedTriangles += triangleCount
  }
  // ── 판마다 켜진 짝과 꺼진 뿌리의 배치를 하나씩 맞춘다 — 메시 · 재질 · 자리(0.01칸)가 같으면 양쪽 상태에 한 번만 선다 ──
  const variantStat: FieldStat['variants'] = {}
  const putGroup = (key: string, p: (typeof pending)[number], mark?: VariantMark): void => {
    const tagged = mark ? `${key}:${mark.variant}:${mark.mode}` : key
    const g = groups.get(tagged)
    if (g) g.worlds.push(p.world)
    else groups.set(tagged, { ...p.group, worlds: [p.world], ...(mark ? { mark } : {}) })
  }
  for (const v of variants) {
    const stat = { shown: 0, hidden: 0, shared: 0 }
    variantStat[v.id] = stat
    const bases = pending.filter((p) => p.id === v.id && p.side === 'base')
    const kept = pending.filter((p) => p.id === v.id && p.side === 'variant')
    const taken = new Set<(typeof pending)[number]>()
    const matched = new Set<(typeof pending)[number]>()
    for (const k of kept) {
      const twin = bases.find((b) => !taken.has(b) && b.key === k.key && sameSpot(b.world, k.world))
      if (twin) { taken.add(twin); matched.add(k) }
    }
    for (const b of bases) {
      if (taken.has(b)) { putGroup(b.key, b); stat.shared++; placed++; placedTriangles += b.triangles; continue }
      putGroup(b.key, b, { variant: v.id, mode: 'hide' }); stat.hidden++; placed++; placedTriangles += b.triangles
    }
    for (const k of kept) {
      if (matched.has(k)) continue
      putGroup(k.key, k, { variant: v.id, mode: 'show' }); stat.shown++
    }
  }
  if (groups.size === 0) throw new FieldError('세울 메시가 하나도 없다')

  // ── 조합마다 메시 한 벌 (제 좌표 · x 뒤집기) ──
  const meshes: Record<string, unknown>[] = []
  const nodes: Record<string, unknown>[] = []
  let triangles = 0
  let instanced = 0
  let lowX = Infinity, highX = -Infinity, lowZ = Infinity, highZ = -Infinity
  const ordered = [...groups.values()].sort((a, b) => a.meshPid - b.meshPid || a.slots.join().localeCompare(b.slots.join())
    || Number(a.seam !== undefined) - Number(b.seam !== undefined)
    || markKey(a.mark).localeCompare(markKey(b.mark)))
  const subsOf = (g: Group): Uint32Array[] => g.mesh.subMeshes.map((sub) => {
    const first = Math.floor(sub.firstByte / (g.wide ? 4 : 2))
    return g.mesh.indices.subarray(first, first + sub.indexCount)
  })
  const isInner = (g: Group, s: number): boolean => {
    const mat = s < g.slots.length ? materialName.get(g.slots[s]!) : undefined
    return mat !== undefined && ROOM_INNER.test(mat)
  }

  // ── 가짜 실내 바닥 (위 `ROOM_INNER`) — 사본으로 선 것까지 자리마다 모은다 ──
  let holeIndex: HoleIndex | null = null
  if (carve) {
    const holes: Hole[] = []
    for (const g of ordered) {
      const subs = subsOf(g)
      const rawPos = g.mesh.attributes.get(CHANNEL.position)
      if (!rawPos || !subs.some((_, s) => isInner(g, s))) continue
      const src = lanes(rawPos, g.mesh.dimensions.get(CHANNEL.position), g.mesh.vertexCount, 3, [0, 0, 0])
      for (const w of g.worlds) {
        const m = flipped(w)
        subs.forEach((tri, s) => {
          if (!isInner(g, s)) return
          for (let t = 0; t + 2 < tri.length; t += 3) {
            const h = holeOf(placeFlipped(m, src, tri[t]!), placeFlipped(m, src, tri[t + 1]!), placeFlipped(m, src, tri[t + 2]!))
            if (h) holes.push(h)
          }
        })
      }
    }
    if (holes.length > 0) holeIndex = new HoleIndex(holes)
  }
  let carved = 0

  for (const g of ordered) {
    let n = g.mesh.vertexCount
    const rawPos = g.mesh.attributes.get(CHANNEL.position)
    if (!rawPos) continue
    let src = lanes(rawPos, g.mesh.dimensions.get(CHANNEL.position), n, 3, [0, 0, 0])
    let rawNrm = lanes(g.mesh.attributes.get(CHANNEL.normal), g.mesh.dimensions.get(CHANNEL.normal), n, 3, [0, 1, 0])
    let rawUv = lanes(g.mesh.attributes.get(CHANNEL.uv0), g.mesh.dimensions.get(CHANNEL.uv0), n, 2, [0, 0])
    let subs = subsOf(g)
    // 한 자리에만 선 메시(땅)만 자른다 — 위 `ROOM_INNER`의 ⚠️
    if (holeIndex && g.worlds.length === 1) {
      const m = flipped(g.worlds[0]!)
      const from = src
      const cut = carveMesh(src, rawNrm, rawUv, n, subs, subs.map((_, s) => isInner(g, s)), (i) => placeFlipped(m, from, i), holeIndex)
      if (cut) {
        src = cut.pos; rawNrm = cut.nrm; rawUv = cut.uv; n = cut.count; subs = cut.subs
        carved += cut.touched
      }
    }
    // 빌려 온 이음매는 그 줄 안에 세 꼭짓점이 다 든 삼각형만 남긴다 (위 `ZONE_SEAMS`)
    if (g.seam && g.worlds.length === 1) {
      const m = flipped(g.worlds[0]!)
      const [z0, z1] = g.seam
      const from = src
      const inside = (i: number): boolean => {
        const z = placeFlipped(m, from, i)[2]
        return z >= z0 - 1e-4 && z <= z1 + 1e-4
      }
      subs = subs.map((tri) => {
        const kept: number[] = []
        for (let t = 0; t + 2 < tri.length; t += 3) {
          if (inside(tri[t]!) && inside(tri[t + 1]!) && inside(tri[t + 2]!)) kept.push(tri[t]!, tri[t + 1]!, tri[t + 2]!)
        }
        return Uint32Array.from(kept)
      })
    }
    const pos = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) { pos[i * 3] = -src[i * 3]!; pos[i * 3 + 1] = src[i * 3 + 1]!; pos[i * 3 + 2] = src[i * 3 + 2]! }
    const nrm = new Float32Array(n * 3)
    for (let i = 0; i < n; i++) {
      const x = -rawNrm[i * 3]!, y = rawNrm[i * 3 + 1]!, z = rawNrm[i * 3 + 2]!
      const len = Math.hypot(x, y, z) || 1
      nrm[i * 3] = x / len; nrm[i * 3 + 1] = y / len; nrm[i * 3 + 2] = z / len
    }
    const aPos = buf.add(pos, 'VEC3', FLOAT, ARRAY_BUFFER, true)
    const aNrm = buf.add(nrm, 'VEC3', FLOAT, ARRAY_BUFFER)
    const uvAccessor = new Map<string, number>()
    const primitives: Record<string, unknown>[] = []
    for (let s = 0; s < subs.length; s++) {
      const tri = subs[s]!
      if (tri.length < 3) continue
      const pid = s < g.slots.length ? g.slots[s]! : 0
      const mat = materialName.get(pid)
      const slot = mat === undefined ? -1 : (slotOf.get(mat) ?? -1)
      const st = (mat === undefined ? undefined : uvOf.get(mat)) ?? [1, 1, 0, 0]
      const stKey = st.join(',')
      let aUv = uvAccessor.get(stKey)
      if (aUv === undefined) {
        const uvs = new Float32Array(n * 2)
        for (let i = 0; i < n; i++) {
          uvs[i * 2] = rawUv[i * 2]! * st[0] + st[2]
          uvs[i * 2 + 1] = 1 - (rawUv[i * 2 + 1]! * st[1] + st[3])
        }
        aUv = buf.add(uvs, 'VEC2', FLOAT, ARRAY_BUFFER)
        uvAccessor.set(stKey, aUv)
      }
      // x를 뒤집었으므로 감기를 되돌린다
      const idx = new Uint32Array(tri.length - (tri.length % 3))
      for (let i = 0; i + 2 < tri.length; i += 3) { idx[i] = tri[i + 2]!; idx[i + 1] = tri[i + 1]!; idx[i + 2] = tri[i]! }
      triangles += idx.length / 3
      const prim: Record<string, unknown> = {
        attributes: { POSITION: aPos, NORMAL: aNrm, TEXCOORD_0: aUv },
        indices: n <= 65536
          ? buf.add(Uint16Array.from(idx), 'SCALAR', USHORT, ELEMENT_BUFFER)
          : buf.add(idx, 'SCALAR', UINT, ELEMENT_BUFFER),
        mode: 4,
      }
      if (slot >= 0) prim.material = slot
      primitives.push(prim)
    }
    if (primitives.length === 0) continue
    meshes.push({ name: `${name}-${String(g.meshPid)}`, primitives })
    const mesh = meshes.length - 1
    const worlds = g.worlds.map(flipped)
    // 빌려 온 이음매의 뿌리는 남의 구역 한가운데다 — 지역 상자를 거기까지 늘리지 않는다
    // 켜질 때만 보이는 판의 배치도 상자에 안 넣는다 — 안 켠 기본 상태의 상자가 그대로다
    for (const w of g.seam || g.mark?.mode === 'show' ? [] : worlds) {
      if (w[3]! < lowX) lowX = w[3]!
      if (w[3]! > highX) highX = w[3]!
      if (w[11]! < lowZ) lowZ = w[11]!
      if (w[11]! > highZ) highZ = w[11]!
    }
    const extras = g.mark ? { extras: { ...g.mark } } : {}
    if (worlds.length === 1) {
      nodes.push({ mesh, matrix: columnMajor(worlds[0]!), ...extras })
      continue
    }
    instanced++
    const t = new Float32Array(worlds.length * 3), r = new Float32Array(worlds.length * 4), sc = new Float32Array(worlds.length * 3)
    worlds.forEach((w, i) => {
      const d = decompose(w)
      t.set(d.t, i * 3); r.set(d.r, i * 4); sc.set(d.s, i * 3)
    })
    nodes.push({
      mesh,
      ...extras,
      extensions: {
        EXT_mesh_gpu_instancing: {
          attributes: {
            TRANSLATION: buf.add(t, 'VEC3', FLOAT),
            ROTATION: buf.add(r, 'VEC4', FLOAT),
            SCALE: buf.add(sc, 'VEC3', FLOAT),
          },
        },
      },
    })
  }

  const gltf = {
    asset: { version: '2.0', generator: 'radiant-platinum bdsp field' },
    extensionsUsed: instanced > 0 ? ['EXT_mesh_gpu_instancing'] : undefined,
    scene: 0,
    scenes: [{ nodes: nodes.map((_, i) => i) }],
    nodes,
    meshes,
    materials,
    textures,
    images,
    accessors: buf.accessors,
    bufferViews: buf.views,
    buffers: [{ byteLength: buf.byteLength }],
  } as Gltf & { extensionsUsed?: string[] }
  if (!gltf.extensionsUsed) delete gltf.extensionsUsed
  if (samplers.length > 0) gltf.samplers = samplers
  const glb = writeGlb(gltf, buf.bytes())
  return {
    glb,
    stat: {
      placed, unique: groups.size, instanced, triangles, placedTriangles,
      materials: materials.length,
      box: [Math.floor(lowX), Math.floor(lowZ), Math.ceil(highX), Math.ceil(highZ)],
      bytes: glb.byteLength,
      carved,
      inactive,
      inactiveByParent,
      variants: variantStat,
      problems: verifyGlb(glb),
    },
  }
}
