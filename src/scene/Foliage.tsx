// 입체 나무 (DATA.md §2.2)
//
// 원작에는 나무의 3D 모양이 **없다.** 판때기 한 장과 그 위에 그린 그림뿐이다.
// 그래서 여기서 세우는 형태는 우리가 만든 것이다 — 숨기지 않고 적어 둔다.
//
// 대신 **자리와 크기와 색은 전부 원작에서 온다.** 서는 자리는 잎이 덮고 있던
// 칸이고, 꼭대기는 그 칸을 덮은 잎의 꼭대기이고, 색은 그 그림에서 실제로 제일
// 많이 쓰인 색이다(`plateColors`). 그래서 떡잎마을의 연둣빛과 무쇠탄갱의
// 검푸른 잎이 서로 다르게 남고, 나무가 가리던 것을 그대로 가린다.
//
// 그림이 같은 나무는 청크를 넘어 한 인스턴스 메시로 모은다 — 창 안에 3천 그루가
// 서므로 그루마다 그리면 안 된다.
//
// **좌표계는 밑동이 원점이고 단위는 나무 반지름 배수다.** 잎 한가운데를 원점으로
// 두면 줄기 길이가 타일 단위라 반지름에 따라 나무가 제 줄기에서 떠오르거나
// 파묻힌다. 밑동을 잡으면 나무 전체가 한 덩어리로 자란다.
//
// ⚠️ **줄기만 그 단위를 안 쓴다.** 줄기 굵기는 원작이 **타일로** 정해 놓았다
// (`TRUNK_R`). 잎과 함께 반지름 배수로 키우면 숲 벽(반지름 1.4)에서 줄기가
// 1.8타일까지 굵어져 두 칸 간격의 이웃과 맞닿는다 — 나무가 아니라 통나무 담이
// 된다. 그래서 줄기는 인스턴스 메시를 따로 쓰고 가로만 고정 배율로 세운다.
//
// 폴리곤 티를 걷어내는 것은 **법선**이 한다. 잎 덩이의 법선을 면이 아니라
// 덩이 중심에서 뻗은 방향으로 주면, 20면짜리 덩이도 공처럼 매끄럽게 빛을 받고
// 윤곽만 울퉁불퉁하게 남는다 — three.js 계열 스타일라이즈드 나무가 쓰는 길이다
// (douges.dev "fluffy trees" · Codrops "Fractals to Forests").
import { useEffect, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import {
  BufferAttribute, BufferGeometry, Color, DataTexture, Frustum, IcosahedronGeometry,
  InstancedMesh, Matrix4, MeshBasicMaterial, MeshLambertMaterial, MultiplyBlending,
  OctahedronGeometry, Quaternion, Sphere, Vector3,
} from 'three'
import { worldState } from '../state/worldState'
import { cellX, cellZ, type Cell, type TreeSite } from './plates'

/** 잎 덩이의 세로 눌림. 1이면 완전한 공이라 버섯처럼 보인다 */
const CROWN_SQUASH = 0.8
/**
 * 잎 덩이 여섯. `[x, y, z, 반지름]`이고 y는 잎 무리 원점 기준이다.
 *
 * 셋이었다. 셋이면 어느 각도에서든 **공 세 개**로 읽혀서, 윤곽선이 큰 원호
 * 세 개로 끊긴다 — 사용자가 "폴리곤 느낌"이라 한 것의 절반이 그 윤곽이다.
 * 여섯이면 크기가 제각각인 덩이가 서로 물려서 윤곽에 큰 원호가 안 남는다.
 *
 * 삼각형은 안 늘어난다: 큰 덩이 하나만 80면이고 나머지 다섯은 20면이라
 * 3개(120)에서 6개(180)로 60개 는 것이 전부다
 */
const BLOBS: readonly (readonly [number, number, number, number])[] = [
  [0, 0.02, 0, 0.92],
  [0.42, 0.30, -0.18, 0.55],
  [-0.36, 0.22, 0.32, 0.50],
  [0.10, -0.28, 0.44, 0.44],
  [-0.44, -0.12, -0.34, 0.42],
  [0.02, 0.52, 0.10, 0.46],
]
/**
 * 덩이마다 세분. 0이면 20면이라 각지고 1이면 80면이다.
 *
 * ⚠️ **세분을 올려서 매끈하게 만드는 것이 아니다.** 법선을 덩이 중심에서
 * 뻗은 방향으로 주므로 20면짜리도 빛은 공처럼 받는다(`ballNormals`). 세분은
 * **윤곽**에만 쓰인다 — 그래서 화면에서 제일 큰 덩이 하나만 1이다
 */
const BLOB_DETAIL = [1, 0, 0, 0, 0, 0]
/** 잎 덩이를 울퉁불퉁하게 미는 정도(반지름 배수). 0이면 매끈한 공이다 */
const LUMP = 0.16
/**
 * 잎 무리의 세로 높이 · 위로 뻗는 높이 (나무 반지름 배수). `BLOBS`에서 나온 값이다.
 *
 * 덩이마다 아래로 `y − r×0.8` · 위로 `y + r×0.8`이고, 그 최소·최대가
 * −0.714(첫 덩이)와 +0.888(마지막 덩이)다 → 1.602.
 * 가로는 최대 |x|+r = 0.97이라 폭 1.94다. 원작 나무 한 그루가 폭 2.06타일이므로
 * 반지름 1.06이 원작 크기다 — 그래서 `RADIUS`가 그 언저리다
 */
const CROWN_H = 1.602
const CROWN_TOP = 0.888

/**
 * 잎 아래끝까지의 줄기 길이 (나무 반지름 배수).
 *
 * **이것 때문에 나무가 원작보다 높아진다.** 원작 판은 35° 누워 있어서 세로로
 * 1.08타일밖에 안 차지하는데, 잎 무리만 해도 1.4타일이라 줄기 자리가 안 남는다.
 * 판을 그대로 세운 그림(잎 밑에 줄기가 그려져 있다)이 곧 원작이 의도한 모습이라
 * 그쪽을 따른다.
 *
 * 값은 3인칭 카메라가 정한다. 카메라가 플레이어 뒤 8·위 4라 26.6°로 내려다보는데,
 * 잎이 제 밑을 0.86r까지 가린다(잎 겉면 어느 점에서든 `y − 0.5·가로거리`의
 * 최솟값이다. `plates.test`가 실제 지오메트리로 잰다). 1.0이면 그 위로 조금
 * 남고, 그보다 짧으면 잎에 통째로 먹힌다
 */
export const BARE = 1.0
/** 잎 무리 원점. 아래끝이 딱 `BARE`에 오도록 올린다 */
const CROWN_Y = BARE + (CROWN_H - CROWN_TOP)
/** 나무 꼭대기 (반지름 배수). 시험이 원작 판 더미 높이와 견주는 값이다 */
export const TREE_TOP = BARE + CROWN_H

/**
 * 줄기 밑동의 반지름 — **타일**. 나무 반지름 배수가 아니다.
 *
 * **원작이 그려 놓은 값이다.** 나무 그림 한 장에는 위에서 내려다본 그루터기가
 * 같이 들어 있고(`tree01` 오른쪽 위 칸의 나이테), 그 갈색 덩이가
 * `tree01`·`tree2_01`·`tree04_2` **셋 다 18×18텍셀**이다. 그 판이 실측으로
 * 전부 2.0×1.88타일(`tree01` 평평한 판 2,317장이 하나도 안 어긋난다)이므로
 * 한 텍셀이 0.067타일이고, 그루터기는 **1.20타일** — 반지름 0.60이다.
 *
 * 예전 값은 0.315×나무반지름이라 홀로 선 나무에서 0.30타일, 곧 원작의 절반이었다.
 * 그래서 메운 바닥에 깔린 나이테가 줄기 밖으로 삐져나왔다
 */
export const TRUNK_R = 0.60

/**
 * 줄기 마디 `[높이, 반지름, 휜 만큼]`.
 *
 * ⚠️ **높이만 나무 반지름 배수고 반지름·휨은 `TRUNK_R` 배수다.** 인스턴스
 * 행렬이 가로를 `TRUNK_R`로, 세로를 나무 높이로 따로 키운다 — 그래야 숲 벽의
 * 큰 나무도 줄기는 원작 굵기로 남는다.
 *
 * 뿌리목을 굵게 두는 것이 땅에 박힌 느낌을 만든다 — 위아래가 같은 굵기면
 * 파이프가 꽂힌 것으로 보인다. 마지막 마디는 잎 속으로 들어가 잎과 줄기 사이가
 * 뚫리지 않게 한다. 조금씩 휘어 두는 것은 그루마다 Y축으로 아무렇게나 돌려
 * 세우기 때문이다 — 곧은 기둥이면 돌려도 다 같아 보인다
 *
 * **첫 마디가 땅 밑이다.** 밑동을 땅 높이에 딱 맞춰 끊어 두면 안 된다:
 * 줄기는 뚜껑이 없는 통이라 한쪽이 조금만 떠도 속이 들여다보인다. 밑동 둘레의
 * 땅이 세운 자리보다 낮은 나무가 실측 122그루(0.05타일 넘게 116 · 최대 7타일)라
 * 드문 일이긴 하지만, 묻어 두면 그 122그루가 통째로 없어지는 대신 잃는 것이 없다.
 *
 * 뿌리목은 두 마디로 나눈다. 한 번에 좁히면 원뿔이 되어 밑동에 **깃 하나가
 * 걸린 것**처럼 각이 선다
 */
export const TRUNK: readonly (readonly [number, number, number])[] = [
  [-0.10, 1.00, 0.000],
  [0.05, 0.86, 0.007],
  [0.22, 0.64, 0.030],
  [0.70, 0.46, 0.083],
  [1.72, 0.31, 0.183],
]
/** 줄기 단면의 각. 6이면 마디 사이마다 12삼각형, 줄기 하나가 48이다 */
const TRUNK_SIDES = 6
/** 밑동이 어두워지는 정도. 땅에 닿는 자리는 그늘이라 여기서 색이 앉는다 */
const TRUNK_SHADE = 0.62

/**
 * 가지 `[갈라지는 높이, 뻗는 길이, 오르는 높이]`.
 *
 * 길이·높이는 `TRUNK_R`·나무 반지름 배수다. 줄기 하나만 서 있으면 잎 무리가
 * 막대에 꽂힌 것으로 읽힌다 — 잎 아래끝으로 가지가 두어 개 들어가 있어야
 * 잎이 **거기서 자란 것**으로 보인다.
 *
 * 셋을 120°로 돌려 낸다. 잎에 반쯤 파묻히므로 단면은 넷이면 된다
 */
const BRANCHES: readonly (readonly [number, number, number])[] = [
  [0.72, 1.35, 0.55],
  [0.95, 1.10, 0.48],
  [1.18, 0.85, 0.38],
]
/** 가지 단면의 각 */
const BRANCH_SIDES = 4
/** 가지 뿌리·끝의 반지름 (`TRUNK_R` 배수) */
const BRANCH_R0 = 0.30
const BRANCH_R1 = 0.13

/** 몇 타일마다 한 그루. 원작 개별 나무가 폭 2.06타일이라 그것이 원작 밀도다 */
const STRIDE = 2
/**
 * 나무 반지름(타일). 흩어 놓지 않으면 윗선이 자로 그은 듯 평평해진다.
 *
 * 아래끝 0.95가 폭 1.83타일 — 원작 나무 한 그루의 2.06타일 언저리다. 위끝 1.4는
 * 폭 2.7타일이라 두 칸 간격에서 이웃과 크게 겹쳐 숲 벽이 통짜로 닫힌다
 */
export const RADIUS_MIN = 0.95
const RADIUS_MAX = 1.40
/** 그루마다 흔드는 폭 */
const RADIUS_JITTER = 0.12

/**
 * 잎이 옆으로 뻗는 제일 먼 거리 (나무 반지름 배수). `BLOBS`에서 나온 값이다 —
 * `max(|x| + r)`가 둘째 덩이의 0.42 + 0.55 = 0.97이다.
 *
 * 나무가 소품·울타리에 얼마나 가까이 설 수 있는지를 이 값이 정한다
 */
export const CROWN_REACH = 0.97

/**
 * 키를 반지름과 **따로** 흔드는 폭.
 *
 * ⚠️ **이게 없으면 숲이 카펫이 된다.** 크기를 균등 배율 하나로만 주면 짙은 숲에서
 * `want`가 다 같아서(판이 넉 장 쌓인 칸이 이어진다) 반지름 흔들림 ±0.12 안에서만
 * 갈리고, 우듬지가 한 높이에 늘어선다. 위에서 내려다보면 나무 하나하나가 아니라
 * 초록 덩어리 한 장으로 읽힌다 — 실제로 그렇게 찍혔다.
 *
 * ±22%면 두 칸 간격에서 이웃과 확실히 어긋나면서도, 원작 판 더미가 정한
 * 큰 크기 차이(숲 벽 대 길가 나무)는 안 지운다
 */
const HEIGHT_JITTER = 0.22

/**
 * 3인칭에서 카메라가 이만큼 가까운 나무는 지운다 (타일).
 *
 * 3인칭 카메라는 플레이어 뒤 8타일·위 4타일에 있다(`actor/camera`의 `THIRD`).
 * 숲 옆에 서면 그 사이의 나무가 화면을 통째로 덮는다. 5.5타일은 플레이어까지의
 * 거리 8.9보다 한참 짧아서, 지워도 플레이어와 그 둘레는 그대로 남는다.
 *
 * 1인칭은 눈이 곧 플레이어라 지우면 코앞의 나무가 사라진다 — 안 건다
 */
const HIDE_RADIUS = 5.5
/** 이 구간에서 크기가 0으로 줄어든다. 갑자기 없어지면 깜빡임으로 보인다 */
const HIDE_FADE = 2.0

/**
 * 카메라 거리로 정하는 그루당 배율. 0이면 삼각형이 찌부러져 안 보인다.
 *
 * 거리만으로 정하므로 시간을 안 탄다 — 카메라가 멈추면 그림도 멈춘다
 */
export function nearScale(distance: number, active: boolean): number {
  if (!active) return 1
  return Math.min(1, Math.max(0, (distance - HIDE_RADIUS) / HIDE_FADE))
}

export interface FoliageGroup {
  /** 같은 그림을 쓰는 나무를 한 덩어리로 묶는 열쇠 */
  key: string
  leaf: number[]
  trunk: number
  /** [세울 자리, 청크 원점 x, 청크 원점 z] */
  items: [TreeSite, number, number][]
}

/**
 * 자리에서 뽑는 난수.
 *
 * 프레임마다 흔들리면 안 되고 청크를 다시 세울 때도 같아야 한다. 그래서
 * `Math.random`이 아니라 좌표를 섞는다 — 같은 나무는 늘 같은 모습으로 선다
 */
function hash(x: number, z: number, salt: number): number {
  const s = Math.sin(x * 127.1 + z * 311.7 + salt * 74.7) * 43758.5453
  return s - Math.floor(s)
}

/**
 * 공을 울퉁불퉁하게 만든다.
 *
 * 매끈한 구는 어느 각도에서 봐도 그냥 초록 공이다 — 잎 뭉치로 안 읽힌다.
 * 정점을 제자리에서 안팎으로 밀어 덩어리진 윤곽을 만든다. **삼각형이 하나도
 * 안 는다** — 세분을 올리는 것과 값이 다르다.
 *
 * 같은 자리는 늘 같은 값이라 나무가 흔들리지 않고, 그루마다 다르게 돌려
 * 세우므로 같은 지오메트리라도 서로 달라 보인다
 */
export function lumpy(geo: BufferGeometry, r: number, amount = LUMP): void {
  const pos = geo.getAttribute('position') as BufferAttribute
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i)
    // 세 방향의 결을 겹쳐 한 방향으로 쏠리지 않게 한다
    const wave = Math.sin(x * 4.1 + y * 2.7) + Math.sin(y * 3.3 + z * 4.9)
      + Math.sin(z * 3.7 + x * 2.3)
    const k = 1 + wave * amount / 3
    pos.setXYZ(i, x * k, y * k, z * k)
  }
  // 밀고 나면 원래 반지름보다 커지거나 작아진다. 폭이 원작 판 너비에서
  // 벗어나지 않게 되돌린다
  geo.computeBoundingSphere()
  const grew = (geo.boundingSphere?.radius ?? r) / r
  if (grew > 0) geo.scale(1 / grew, 1 / grew, 1 / grew)
}

/** 조각 하나를 한 색으로 칠한다. 정점 색이 색을 나르므로 재질은 한 벌이면 된다 */
export function paint(geo: BufferGeometry, rgb: number): BufferGeometry {
  const c = new Color(rgb)
  const n = geo.getAttribute('position').count
  const color = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) {
    color[i * 3] = c.r; color[i * 3 + 1] = c.g; color[i * 3 + 2] = c.b
  }
  geo.setAttribute('color', new BufferAttribute(color, 3))
  return geo
}

/**
 * 덩이의 법선을 **중심에서 뻗은 방향**으로 갈아 끼운다.
 *
 * ⚠️ **폴리곤 느낌의 정체가 이것이다.** 면 법선으로 그리면 20면짜리 덩이가
 * 20개의 평면으로 또렷이 갈려 보인다 — 주사위에 색을 칠한 것과 같다. 법선만
 * 공의 것으로 바꾸면 같은 삼각형 수로 **빛은 공처럼** 흐르고, 각진 것은
 * 윤곽선에만 남는다. 세분을 올리는 것과 값이 다르다: 삼각형이 하나도 안 는다.
 *
 * `lumpy`가 정점을 민 뒤라 중심 방향과 실제 면이 조금 어긋나 있는데, 그
 * 어긋남이 오히려 잎덩이의 결처럼 보인다
 */
export function ballNormals(geo: BufferGeometry, cx: number, cy: number, cz: number): void {
  const pos = geo.getAttribute('position') as BufferAttribute
  const normal = new Float32Array(pos.count * 3)
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i) - cx, y = pos.getY(i) - cy, z = pos.getZ(i) - cz
    const len = Math.hypot(x, y, z) || 1
    normal[i * 3] = x / len; normal[i * 3 + 1] = y / len; normal[i * 3 + 2] = z / len
  }
  geo.setAttribute('normal', new BufferAttribute(normal, 3))
}

/**
 * 잎을 **위아래로 물들인다.**
 *
 * 원작 그림에서 뽑은 색이 밝은 것부터 온다(`plateColors`). 예전에는 덩이마다
 * 하나씩 골라 칠했는데, 그러면 덩이 하나가 통짜 한 색이라 플라스틱으로 보인다 —
 * 실제 잎은 위가 볕을 받고 아래가 제 그늘에 든다.
 *
 * 그래서 **덩이 안에서** 높이로 섞는다. 색은 여전히 원작 것뿐이고, 우리가 하는
 * 것은 그 사이를 잇는 것뿐이다. 자리로 뽑은 잡음을 조금 얹어 등고선이 안 보이게 한다
 */
function paintCrown(
  geo: BufferGeometry, colors: readonly number[], low: number, high: number,
): BufferGeometry {
  const light = new Color(colors[0] ?? 0x4f9e52)
  const dark = new Color(colors[colors.length - 1] ?? colors[0] ?? 0x2f6b34)
  const pos = geo.getAttribute('position') as BufferAttribute
  const color = new Float32Array(pos.count * 3)
  const c = new Color()
  const span = high - low || 1
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i)
    const t = Math.min(1, Math.max(0, (y - low) / span))
    // 잡음은 자리가 정한다 — 프레임마다 흔들리면 안 되고 같은 모양은 같아야 한다
    const wave = Math.sin(x * 5.3 + z * 3.1) * Math.sin(y * 4.7 + x * 2.9)
    c.copy(dark).lerp(light, Math.min(1, Math.max(0, t * t + wave * 0.12)))
    color[i * 3] = c.r; color[i * 3 + 1] = c.g; color[i * 3 + 2] = c.b
  }
  geo.setAttribute('color', new BufferAttribute(color, 3))
  return geo
}

/**
 * 조각들을 한 지오메트리로 합친다.
 *
 * ⚠️ **색인을 먼저 푼다.** 이걸 안 하면 색인이 있는 조각의 삼각형이 통째로
 * 사라진다. `CylinderGeometry`가 그랬다 — 정점 12개에 색인 30개(삼각형 10개)인데
 * 색인을 버리고 정점만 이어 붙이면 연속 3개씩 묶여 **수평 조각 4개**가 되고,
 * 그 넷은 잎 속과 땅속에 하나씩 묻혀 화면에 줄기가 아예 안 나왔다.
 *
 * ⚠️ **법선은 조각이 들고 온 것을 그대로 쓴다.** 예전에는 합친 뒤 다시 셌는데,
 * 색인이 없으므로 그것이 곧 면 법선이라 덩이가 20개의 평면으로 갈려 보였다.
 * 조각마다 제 법선을 실어 오면(`ballNormals` · 줄기의 옆방향) 매끄럽게 흐른다.
 * 법선이 없는 조각이 하나라도 있으면 예전처럼 다시 센다
 */
export function merge(parts: readonly BufferGeometry[]): BufferGeometry {
  const flat = parts.map((p) => (p.getIndex() ? p.toNonIndexed() : p))
  let verts = 0
  for (const p of flat) verts += p.getAttribute('position').count
  const carry = flat.every((p) => p.getAttribute('normal'))
  const position = new Float32Array(verts * 3)
  const color = new Float32Array(verts * 3)
  const normal = carry ? new Float32Array(verts * 3) : null
  let at = 0
  for (const p of flat) {
    const pos = p.getAttribute('position') as BufferAttribute
    const col = p.getAttribute('color') as BufferAttribute
    const nrm = p.getAttribute('normal') as BufferAttribute | undefined
    for (let i = 0; i < pos.count; i++) {
      position[(at + i) * 3] = pos.getX(i)
      position[(at + i) * 3 + 1] = pos.getY(i)
      position[(at + i) * 3 + 2] = pos.getZ(i)
      color[(at + i) * 3] = col.getX(i)
      color[(at + i) * 3 + 1] = col.getY(i)
      color[(at + i) * 3 + 2] = col.getZ(i)
      if (normal && nrm) {
        normal[(at + i) * 3] = nrm.getX(i)
        normal[(at + i) * 3 + 1] = nrm.getY(i)
        normal[(at + i) * 3 + 2] = nrm.getZ(i)
      }
    }
    at += pos.count
    p.dispose()
  }
  const out = new BufferGeometry()
  out.setAttribute('position', new BufferAttribute(position, 3))
  out.setAttribute('color', new BufferAttribute(color, 3))
  if (normal) out.setAttribute('normal', new BufferAttribute(normal, 3))
  else out.computeVertexNormals()
  out.computeBoundingSphere()
  return out
}

/**
 * 줄기와 가지. 마디마다 다각형 고리를 놓고 사이를 잇는다.
 *
 * 색인 없이 삼각형을 바로 쌓는다 — 조각을 합칠 때 색인을 잃을 여지를 안 만든다.
 *
 * ⚠️ **가로는 `TRUNK_R` 배수 · 세로는 나무 반지름 배수다.** 두 축의 배율이
 * 달라서 법선을 축 방향으로 그냥 뽑으면 안 되지만, 줄기는 거의 수직이라
 * 가로 방향(고리의 바깥)으로 주는 것이 실제와 거의 같다 — 그리고 그렇게 줘야
 * 여섯 면이 여섯 개의 널판으로 안 갈린다
 */
export function trunkGeometry(rgb: number, far = false): BufferGeometry {
  const sides = far ? 4 : TRUNK_SIDES
  const rungs = far ? [TRUNK[0]!, TRUNK[TRUNK.length - 1]!] : TRUNK
  const base = new Color(rgb)
  const top = TRUNK[TRUNK.length - 1]![0]
  const shade = (h: number): Color =>
    new Color().copy(base).multiplyScalar(
      TRUNK_SHADE + (1 - TRUNK_SHADE) * Math.min(1, Math.max(0, h) / top))

  const position: number[] = []
  const color: number[] = []
  const normal: number[] = []
  /**
   * 고리 사이를 잇는 띠 하나.
   *
   * `lean`은 마디가 **어느 쪽으로** 휘는지다(라디안). 줄기는 늘 +X로 휘고
   * 가지는 셋이 서로 다른 쪽으로 뻗는다 — 이걸 안 나누고 고리의 시작각만
   * 돌리면 가지 셋이 전부 같은 방향으로 나간다
   */
  const band = (
    lo: readonly [number, number, number], hi: readonly [number, number, number],
    lean: number, cLo: Color, cHi: Color, n: number,
  ): void => {
    const lx = Math.cos(lean), lz = Math.sin(lean)
    const ring = (m: readonly [number, number, number], k: number): [number, number, number] => {
      const a = (k / n) * Math.PI * 2 + lean
      return [m[2] * lx + Math.cos(a) * m[1], m[0], m[2] * lz + Math.sin(a) * m[1]]
    }
    const out = (k: number): [number, number, number] => {
      const a = (k / n) * Math.PI * 2 + lean
      return [Math.cos(a), 0, Math.sin(a)]
    }
    for (let k = 0; k < n; k++) {
      const a0 = ring(lo, k), a1 = ring(lo, k + 1)
      const b0 = ring(hi, k), b1 = ring(hi, k + 1)
      const n0 = out(k), n1 = out(k + 1)
      // 밖에서 봤을 때 반시계로 감는다. 뒤집으면 재질이 앞면만 그려서 통째로 사라진다
      const tri: [[number, number, number], Color, [number, number, number]][] = [
        [a0, cLo, n0], [b0, cHi, n0], [b1, cHi, n1],
        [a0, cLo, n0], [b1, cHi, n1], [a1, cLo, n1],
      ]
      for (const [p, c, nv] of tri) {
        position.push(p[0], p[1], p[2])
        color.push(c.r, c.g, c.b)
        normal.push(nv[0], nv[1], nv[2])
      }
    }
  }

  for (let s = 0; s + 1 < rungs.length; s++) {
    const lo = rungs[s]!, hi = rungs[s + 1]!
    band(lo, hi, 0, shade(lo[0]), shade(hi[0]), sides)
  }
  // 가지. 먼 나무에는 안 단다 — 30타일에서는 잎에 다 파묻혀 안 읽힌다
  if (!far) {
    BRANCHES.forEach(([at, reach, rise], i) => {
      // 셋을 고르게 돌린다. 그루마다 나무 전체를 Y축으로 아무렇게나 돌려 세우므로
      // 여기서 또 흔들 이유가 없다
      const lean = (i / BRANCHES.length) * Math.PI * 2
      // 뿌리는 줄기 속, 끝은 잎 아래끝 안쪽이다. 마디 둘이면 족하다
      band([at, BRANCH_R0, 0], [at + rise, BRANCH_R1, reach], lean,
        shade(at), shade(at + rise), BRANCH_SIDES)
    })
  }
  const geo = new BufferGeometry()
  geo.setAttribute('position', new BufferAttribute(new Float32Array(position), 3))
  geo.setAttribute('color', new BufferAttribute(new Float32Array(color), 3))
  geo.setAttribute('normal', new BufferAttribute(new Float32Array(normal), 3))
  return geo
}

/**
 * 밑동에 지는 **접지 그림자**. 폭·중심의 어두운 정도 (나무 반지름 배수).
 *
 * ⚠️ **그림자 맵으로는 이 자리가 절대 안 어두워진다.** 태양이 (24, 42, 18)이라
 * 고도 54.5°인데, 우듬지 한가운데가 밑동에서 2.3r 위에 있으므로 그 그림자는
 * 밑동에서 2.3/tan54.5° = **1.6r 옆에** 진다. 발밑은 늘 훤하다 — 그래서 나무가
 * 땅에 심긴 것이 아니라 얹혀 있는 것으로 보인다.
 *
 * 이건 태양 그림자가 아니라 **가려짐(앰비언트 오클루전)**이다. 잎이 하늘을
 * 막아서 밑동 둘레에 반구광이 덜 닿는 것이고, 방향을 안 타므로 밑동에 그대로
 * 맺힌다. 그루마다 크기가 다르고(행렬이 그대로 곱해진다) 가장자리에서 풀린다 —
 * 원작이 깔았던 **크기 무관한 하드한 동그라미**(`tshadow`)와 다른 점이 그것이다
 */
export const CONTACT_R = 1.15
export const CONTACT_DARK = 0.5
/** 땅에서 띄우는 높이. 0이면 지형과 같은 깊이라 얼룩진다 */
const CONTACT_Y = 0.02

/**
 * 가운데가 어둡고 가장자리에서 1(그대로)이 되는 회색 원.
 *
 * 곱하기로 섞으므로 1은 "안 건드림"이다. 알파를 안 쓰는 이유는 곱하기 혼합이
 * 알파를 안 보기 때문이다 — 네 귀퉁이는 값이 1이라 사각형인 것이 안 보인다
 */
export function contactTexture(): DataTexture {
  const N = 64
  const data = new Uint8Array(N * N * 4)
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const dx = ((x + 0.5) / N) * 2 - 1, dy = ((y + 0.5) / N) * 2 - 1
      // 제곱으로 풀어야 가장자리가 선으로 안 남는다 — 1차로 풀면 테두리가 보인다
      const k = Math.max(0, 1 - Math.hypot(dx, dy))
      const v = Math.round(255 * (1 - CONTACT_DARK * k * k))
      const o = (y * N + x) * 4
      data[o] = v; data[o + 1] = v; data[o + 2] = v; data[o + 3] = 255
    }
  }
  const tex = new DataTexture(data, N, N)
  tex.needsUpdate = true
  return tex
}

/** 밑동에 까는 판 한 장. 그루당 삼각형 2개다 */
export function contactGeometry(): BufferGeometry {
  const r = CONTACT_R, y = CONTACT_Y
  const geo = new BufferGeometry()
  geo.setAttribute('position', new BufferAttribute(new Float32Array([
    -r, y, -r, r, y, -r, r, y, r,
    -r, y, -r, r, y, r, -r, y, r,
  ]), 3))
  geo.setAttribute('uv', new BufferAttribute(new Float32Array([
    0, 0, 1, 0, 1, 1,
    0, 0, 1, 1, 0, 1,
  ]), 2))
  const normal = new Float32Array(18)
  for (let i = 1; i < 18; i += 3) normal[i] = 1
  geo.setAttribute('normal', new BufferAttribute(normal, 3))
  geo.computeBoundingSphere()
  return geo
}

/**
 * 잎 무리. 가까운 것은 삼각형 180개(80 + 20×5), 먼 것은 48개다.
 *
 * ⚠️ **먼 것도 덩이 여섯을 그대로 둔다.** 몇 개로 줄이면 삼각형은 줄지만
 * **실루엣이 바뀐다** — 30타일이면 나무 하나가 화면에서 180픽셀이라 윤곽이
 * 달라지는 것이 보인다. 줄이는 것은 덩이 하나하나의 면 수다: 20면짜리
 * 정이십면체 대신 8면짜리 정팔면체를 쓴다. 법선이 공의 것이라 그 거리에서는
 * 빛도 윤곽도 거의 그대로다.
 *
 * 짙은 숲이 창 하나에 4,628그루까지 서는데(떡잎마을 일대 실측) 대부분은 먼 것이다.
 * 그리고 **줄이는 것의 대부분은 LOD가 아니라 프러스텀 컬링**이다 — 카메라가
 * 한 방향만 보므로 실제로 화면에 드는 것은 15~30%다
 */
export function crownGeometry(leaf: number[], far = false): BufferGeometry {
  const parts: BufferGeometry[] = []
  const low = CROWN_Y - (CROWN_H - CROWN_TOP)
  const high = CROWN_Y + CROWN_TOP
  for (const [x, y, z, r] of BLOBS) {
    const i = parts.length
    const geo = far
      ? new OctahedronGeometry(r, 0)
      : new IcosahedronGeometry(r, BLOB_DETAIL[i] ?? 0)
    lumpy(geo, r)
    geo.scale(1, CROWN_SQUASH, 1)
    geo.translate(x, CROWN_Y + y, z)
    // 법선은 **덩이 중심에서** 뻗는다 — 면 법선으로 두면 주사위가 된다
    ballNormals(geo, x, CROWN_Y + y, z)
    parts.push(paintCrown(geo, leaf, low, high))
  }
  return merge(parts)
}

/**
 * 한 그루의 잎과 줄기를 한 덩어리로 — **시험과 도구용**이다.
 *
 * 화면은 둘을 따로 그린다(가로 배율이 달라서다). 여기서는 줄기를 `TRUNK_R`만큼
 * 줄여 붙여서, 실제로 서는 것과 같은 모양 한 벌을 만든다
 */
export function treeGeometry(leaf: number[], trunk: number, far = false): BufferGeometry {
  const stem = trunkGeometry(trunk, far)
  stem.scale(TRUNK_R, 1, TRUNK_R)
  return merge([stem, crownGeometry(leaf, far)])
}

/**
 * 지면 높이를 묻는다. 판이 없으면 null.
 *
 * `near`는 잎 아래끝이다 — 다리 위·절벽 위처럼 한 자리를 판이 여럿 덮을 때
 * **잎에 제일 가까운 판**이 그 나무가 자란 땅이다. 플레이어가 층을 가르는 규칙과
 * 같은 것을 쓴다 (`map/height`)
 */
export type GroundAt = (x: number, z: number, near: number) => number | null

/**
 * 그 자리에서 제일 가까운 **막힌 것**까지의 거리 (타일). 없으면 `Infinity`.
 *
 * 막힌 것은 집·간판 같은 소품과, 원작 청크에 세워져 있는 판(울타리·표지판)이다
 * (`ChunkModels`의 `solidCells`)
 */
export type ClearAt = (x: number, z: number) => number

/**
 * 칸 하나에 나무를 세울 자리. 자리는 **밑동**이다.
 *
 * `STRIDE` 간격의 칸만 대표로 세운다. 이러면 원작 판이 몇 겹이든, 눕든 서든,
 * **덮은 넓이에 비례해** 나무가 선다 — 숲 벽 한 자리에 판이 넉 장 겹쳐 있어서
 * 판마다 세우면 브로콜리가 된다
 *
 * ⚠️ **밑동 높이는 잎이 아니라 땅이 정한다.** 잎 아래끝(`cell.minY`)에 세우면
 * 나무가 뜬다 — 원작 판은 나무를 *위에서 본 그림*이라 땅보다 위에 걸려 있다.
 * 오버월드 48,525그루를 재 보면 **48,331그루가 땅 위에 떠 있고**(0.1타일 넘게
 * 8,890 · 0.5타일 넘게 671 · 2타일 넘게 265) 191그루는 땅에 파묻혀 있다.
 *
 * 뜬 만큼은 그림자가 어긋난 거리이기도 하다. 태양이 (24, 42, 18)이라 수평 30 ·
 * 수직 42고, 그림자는 뜬 높이의 30/42 = 0.71배만큼 옆으로 밀린다 — 2타일 뜬
 * 나무는 그림자가 1.4타일 떨어진 데 진다.
 */
export function treeAt(
  key: number, cell: Cell, ground?: GroundAt, site?: { x: number; z: number },
  /**
   * 소품·울타리까지의 거리. 주면 **그 안으로는 안 자란다.**
   *
   * ⚠️ **원작 판은 겹쳐도 안 보였다.** 나무는 위에서 본 그림 한 장이라 집
   * 옆에 걸쳐 있어도 화면에서는 집이 덮었다. 그걸 입체로 세우면 **줄기가
   * 벽을 뚫고 잎이 지붕에 박힌다** — 실측으로 마을 열 곳에서 98그루가 그랬고
   * (연고시티 29 · 선단시티 22 · 잔모래마을 19), 제일 깊은 것은 2.17타일이었다.
   *
   * 지우지 않고 **줄인다.** 원작 판이 거기 있었다는 것은 사실이라, 나무를
   * 통째로 빼면 집 둘레에 민둥한 고리가 생긴다. 최소 크기(`RADIUS_MIN`)로도
   * 안 들어가는 자리만 비운다
   */
  clear?: ClearAt,
): Matrix4 | null {
  const tx = cellX(key), tz = cellZ(key)
  if (!site) {
    if (((tx % STRIDE) + STRIDE) % STRIDE !== 0) return null
    if (((tz % STRIDE) + STRIDE) % STRIDE !== 0) return null
  }

  // **크기를 원작 판 더미의 높이가 정한다.** 숲 벽은 판이 넉 장 쌓여 2.6타일을
  // 채우고 홀로 선 나무는 한 장에 1.1타일이다. 그 차이를 반지름으로 옮기면
  // 숲은 크게 자라 서로 닿아 벽이 되고 길가 나무는 작게 남는다
  const want = (cell.maxY - cell.minY) / CROWN_H
  const jitter = (hash(tx, tz, 9) - 0.5) * 2 * RADIUS_JITTER
  const grown = Math.min(RADIUS_MAX, Math.max(RADIUS_MIN, want)) + jitter
  // 키는 따로 흔든다. 균등 배율만 주면 우듬지가 한 높이에 늘어서 카펫이 된다
  const tall = 1 + (hash(tx, tz, 11) - 0.5) * 2 * HEIGHT_JITTER
  // ⚠️ **흩지 않는다.** 예전엔 칸 한가운데에서 ±0.9타일 흩었는데, 그러면
  // 원작이 나무 밑에 깔아 둔 그림자 판(`tshadow`)에서 나무가 벗어난다 — 홀로
  // 선 나무 1,022그루가 **1,022그루 다** 그 동그라미 밖에 있었고 중앙값이
  // 1.20타일이었다. 흩는 것은 반지름·키·회전이 한다.
  //
  // 자리는 `treeSites`가 정한다 — 그림자 판이 있으면 그 한가운데, 없으면 격자
  const x = site ? site.x : tx + STRIDE / 2
  const z = site ? site.z : tz + STRIDE / 2
  // 소품·울타리 안으로는 안 자란다. 최소 크기로도 안 들어가면 아예 안 세운다
  const room = clear?.(x, z) ?? Infinity
  if (room < RADIUS_MIN * CROWN_REACH) return null
  const r = Math.min(grown, room / CROWN_REACH)
  const h = r * tall
  // 높이 자료가 없는 칸이 6%다(48,525 중 2,970). 그때만 잎 아래끝으로 물러선다
  const foot = ground?.(x, z, cell.minY) ?? cell.minY
  return new Matrix4().compose(
    new Vector3(x, foot, z),
    new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), hash(tx, tz, 10) * Math.PI * 2),
    new Vector3(r, h, r),
  )
}

/**
 * 이 거리부터 값싼 모양으로 바꾼다 (타일).
 *
 * 30타일이면 나무 하나가 화면에서 180픽셀쯤이다. 그 크기에서 잎 덩이의 세분
 * (80면과 20면)과 줄기 단면(6각과 3각)은 구별이 안 된다 — 실루엣만 지키면 된다.
 * 그보다 가까우면 1인칭으로 밑동까지 걸어가므로 온전한 모양이 필요하다
 */
const LOD_DISTANCE = 30
/** 나무를 감싸는 공의 반지름 (반지름 배수). 프러스텀 판정에 쓴다 */
const TREE_SPHERE = 1.35
/**
 * 화면 밖이어도 이만큼은 남긴다 (타일).
 *
 * **그림자 때문이다.** 화면 밖 나무도 그림자는 화면 안에 질 수 있다. 태양이
 * (24, 42, 18)이라 수평 30·수직 42 — 고도 54.5°다. 나무가 제일 클 때 3.8타일
 * (`TREE_TOP` × `RADIUS_MAX`)이므로 그림자는 3.8/tan54.5° = 2.7타일 뻗는다.
 * 4타일이면 그 위로 남는다
 */
export const CULL_MARGIN = 4

/** 그림이 같으면 모양도 같다. 청크를 넘을 때마다 다시 만들 이유가 없다 */
const shapes = new Map<string, BufferGeometry>()
/** 색은 지오메트리의 정점 색이 나르므로 재질은 한 벌이면 된다 */
const leafMaterial = new MeshLambertMaterial({ vertexColors: true })
/** 접지 그림자는 나무 종류를 안 탄다 — 지오메트리도 재질도 한 벌뿐이다 */
let contactShape: BufferGeometry | null = null
let contactPaint: MeshBasicMaterial | null = null
/**
 * 접지 그림자의 재질.
 *
 * **곱하기로 섞는다** — 땅을 어둡게 만드는 것이지 그 위에 회색을 얹는 것이
 * 아니다. 곱하기는 순서를 안 타므로 그루끼리 정렬할 필요도 없다. 안개는 끈다:
 * 안개가 이 값을 안개색 쪽으로 끌면 곱하는 수가 달라진다.
 *
 * ⚠️ **`premultipliedAlpha`가 없으면 WebGPU에서 통째로 안 섞인다.** three의
 * WebGPU 파이프라인은 곱하기 혼합을 프리멀티플라이드일 때만 만들고, 아니면
 * "Invalid blending"으로 떨어뜨린다(`WebGPUPipelineUtils` 574줄). 판은
 * 그려지는데(드로우콜에도 잡힌다) 화면에는 아무 변화가 없었다 — 나무 밑이
 * 그대로 텅 비어 있었고, 눈으로는 "안 만들었나 보다"까지밖에 알 수 없었다
 */
export function contactMaterial(): MeshBasicMaterial {
  return new MeshBasicMaterial({
    map: contactTexture(),
    blending: MultiplyBlending, premultipliedAlpha: true,
    transparent: true, depthWrite: false, fog: false,
  })
}

function contact(): [BufferGeometry, MeshBasicMaterial] {
  contactShape ??= contactGeometry()
  contactPaint ??= contactMaterial()
  return [contactShape, contactPaint]
}

const offset = new Matrix4()
const scaled = new Matrix4()
const stem = new Matrix4()
const shrink = new Vector3()
const viewProj = new Matrix4()
const frustum = new Frustum()
const sphere = new Sphere()

function shapeOf(key: string, leaf: number[], far: boolean): BufferGeometry {
  const id = far ? `${key}/far` : key
  let geo = shapes.get(id)
  if (!geo) {
    geo = crownGeometry(leaf, far)
    shapes.set(id, geo)
  }
  return geo
}

function stemOf(key: string, trunk: number, far: boolean): BufferGeometry {
  const id = far ? `${key}/줄기/far` : `${key}/줄기`
  let geo = shapes.get(id)
  if (!geo) {
    geo = trunkGeometry(trunk, far)
    shapes.set(id, geo)
  }
  return geo
}

const place = new Vector3()
const spin = new Quaternion()
const size = new Vector3()

/**
 * 그루의 행렬에서 **줄기의 행렬**을 뽑는다.
 *
 * 자리와 회전은 그대로고 세로 배율도 그대로다. 가로만 `TRUNK_R`로 바꾼다 —
 * 줄기 굵기가 원작이 정한 타일 값이라 나무 크기를 안 따라가야 한다
 */
function stemMatrix(tree: Matrix4, into: Matrix4): Matrix4 {
  tree.decompose(place, spin, size)
  return into.compose(place, spin, size.set(TRUNK_R, size.y, TRUNK_R))
}

export function Foliage(
  { groups, ground, clear }: { groups: FoliageGroup[]; ground?: GroundAt; clear?: ClearAt },
) {
  const camera = useThree((s) => s.camera)

  const meshes = useMemo(() => groups.map((g) => {
    const matrices: Matrix4[] = []
    for (const [site, originX, originZ] of g.items) {
      // 지면은 **월드 좌표로** 묻는다. 그림자 판에 붙은 자리가 청크 경계를 넘을 수
      // 있고, 그때는 옆 청크의 판이 답이다
      const m = treeAt(site.key, site.cell, ground
        ? (x, z, near) => ground(x + originX, z + originZ, near)
        : undefined, site,
      clear ? (x, z) => clear(x + originX, z + originZ) : undefined)
      if (!m) continue
      // 판 좌표가 청크 로컬이라 청크가 놓인 자리를 더해야 월드가 된다.
      // 높이는 청크가 이미 갖고 있어서 안 더한다 — 밑동이 곧 월드 높이다
      matrices.push(m.premultiply(offset.makeTranslation(originX, 0, originZ)))
    }
    // 가까운 것과 먼 것을 **따로 그린다.** 인스턴스 하나가 지오메트리를 바꿔
    // 달 수는 없으므로 메시를 둘 두고 프레임마다 나눠 담는다.
    //
    // 잎과 줄기도 따로다 — 줄기는 가로 배율이 나무 크기를 안 따라간다(`TRUNK_R`)
    const make = (far: boolean, stem: boolean) => {
      const mesh = new InstancedMesh(
        stem ? stemOf(g.key, g.trunk, far) : shapeOf(g.key, g.leaf, far),
        leafMaterial, matrices.length)
      mesh.name = `${stem ? '줄기' : '나무'}${far ? '(먼 것)' : ''}`
      mesh.castShadow = true
      mesh.receiveShadow = true
      // 인스턴스가 청크를 가로질러 흩어져 있어서 메시 단위 절두체가 뜻이 없다 —
      // 대신 그루마다 직접 판정해 **보이는 것만 앞에서부터 채운다**
      mesh.frustumCulled = false
      mesh.count = 0
      return mesh
    }
    // 밑동의 접지 그림자. LOD를 안 나눈다 — 판 한 장이라 줄일 것이 없다
    const [shape, material] = contact()
    const shade = new InstancedMesh(shape, material, matrices.length)
    shade.name = '밑동 그림자'
    shade.frustumCulled = false
    shade.count = 0
    // 카메라와의 거리는 **잎**으로 잰다. 화면을 가리는 것이 잎이라 밑동으로 재면
    // 나무가 나보다 키가 큰 만큼 늦게 비켜 준다
    const spots = matrices.map((m) => {
      const p = new Vector3().setFromMatrixPosition(m)
      return p.setY(p.y + CROWN_Y * new Vector3().setFromMatrixScale(m).x)
    })
    const radius = matrices.map((m) => TREE_SPHERE * new Vector3().setFromMatrixScale(m).x)
    // 줄기 행렬은 미리 뽑아 둔다 — 프레임마다 분해하면 그루당 한 번씩이다
    const stems = matrices.map((m) => stemMatrix(m, new Matrix4()))
    return {
      key: g.key,
      near: make(false, false), far: make(true, false),
      stemNear: make(false, true), stemFar: make(true, true),
      shade, matrices, stems, spots, radius,
    }
  }), [groups, ground, clear])

  /**
   * 프레임마다 그루를 셋으로 가른다: 화면 밖 · 가까운 것 · 먼 것.
   *
   * 화면 밖은 아예 안 담는다 — `count`를 줄이면 그만큼 GPU에 안 올라간다.
   * 짙은 숲은 창 하나에 4,628그루가 서는데(실측) 카메라가 한 방향만 보므로
   * 대부분이 뒤에 있다.
   *
   * 인스턴스 행렬을 고쳐 쓰는 것이라 백엔드를 안 탄다 — 셰이더로 지우면
   * WebGPU 노드 재질과 WebGL2 폴백을 따로 봐야 한다
   */
  useFrame(() => {
    const active = worldState.camera.mode !== 'first'
    viewProj.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse)
    frustum.setFromProjectionMatrix(viewProj)
    for (const g of meshes) {
      let n = 0, f = 0, s = 0
      for (let i = 0; i < g.spots.length; i++) {
        const spot = g.spots[i]!
        sphere.set(spot, g.radius[i]! + CULL_MARGIN)
        if (!frustum.intersectsSphere(sphere)) continue
        const distance = spot.distanceTo(camera.position)
        const k = nearScale(distance, active)
        if (k <= 0) continue // 코앞이라 지운 것
        // 행렬의 자리값이 곧 밑동이고 `scale`은 자리값을 안 건드린다. 그래서
        // 줄어드는 나무는 저절로 땅에 붙은 채 작아진다
        scaled.copy(g.matrices[i]!)
        stem.copy(g.stems[i]!)
        if (k < 1) { scaled.scale(shrink.setScalar(k)); stem.scale(shrink) }
        if (distance < LOD_DISTANCE) {
          g.near.setMatrixAt(n, scaled)
          g.stemNear.setMatrixAt(n++, stem)
        } else {
          g.far.setMatrixAt(f, scaled)
          g.stemFar.setMatrixAt(f++, stem)
        }
        g.shade.setMatrixAt(s, scaled)
        s++
      }
      g.near.count = n
      g.stemNear.count = n
      g.far.count = f
      g.stemFar.count = f
      g.shade.count = s
      g.near.instanceMatrix.needsUpdate = true
      g.stemNear.instanceMatrix.needsUpdate = true
      g.far.instanceMatrix.needsUpdate = true
      g.stemFar.instanceMatrix.needsUpdate = true
      g.shade.instanceMatrix.needsUpdate = true
    }
  })

  // 창이 옮겨 가면 앞의 인스턴스 메시는 버린다. `<primitive>`는 알아서 안 치워
  // 주므로 두면 청크를 넘을 때마다 GPU 버퍼가 쌓인다. 지오메트리와 재질은
  // 공유하는 것이라 여기서 안 지운다
  useEffect(() => () => {
    for (const g of meshes) {
      g.near.dispose(); g.far.dispose()
      g.stemNear.dispose(); g.stemFar.dispose()
      g.shade.dispose()
    }
  }, [meshes])

  return (
    <group>
      {meshes.map(({ key, near, far, stemNear, stemFar, shade }) => (
        <group key={key}>
          <primitive object={near} />
          <primitive object={far} />
          <primitive object={stemNear} />
          <primitive object={stemFar} />
          <primitive object={shade} />
        </group>
      ))}
    </group>
  )
}
