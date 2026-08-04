// 존(맵) 데이터와 충돌 질의 (PLAN §4.2 / Phase 1)
// tools/extract/maps.js가 뽑은 JSON을 평평한 타일 격자로 펴서 O(1) 질의를 제공한다.
// React를 모르는 순수 TS 계층이다 — 씬 연결은 src/scene이 담당한다.

/** 타일 u16의 최상위 비트가 통행 불가 플래그 */
export const IMPASSABLE = 0x8000
/** 나머지 비트가 타일 거동. 오버월드 전체 어휘는 54종 */
export const BEHAVIOR_MASK = 0x7fff

/**
 * 확인된 거동 값. 나머지는 아직 의미를 특정하지 않았다 — 원시값으로 다룬다.
 *
 * 풀숲은 인카운터 표와의 교차검증으로 확정했다: 오버월드 67개 존에서
 * "육상 인카운터가 있다 ⟺ 0x0002 타일이 있다"가 오탐·누락 0으로 성립한다.
 * 완전히 독립된 두 자료(타일 격자와 pl_enc_data)의 대조라 우연히 맞을 수 없다.
 *
 * ⚠️ 처음엔 0x0015를 풀숲으로 봤다. 빈도 2위에 넓은 덩어리 분포라는 이유였는데,
 * 같은 교차검증에서 33:34로 깨졌다 — 231번**수로**에 0x0015가 6912칸인데 육상
 * 출현률이 0이고, 217번도로는 출현률 30인데 0x0015가 하나도 없었다. 물이었다.
 * 빈도와 분포 모양은 의미의 근거가 되지 못한다.
 */
export const Behavior = {
  NORMAL: 0x0000,
  TALL_GRASS: 0x0002,
  /** 넓은 수면. 수로(W) 존을 채운다 — W231에만 6912칸 */
  WATER_OPEN: 0x0015,
  /** 작은 물. 13개 존에 1114칸뿐이고 트윈리프의 연못이 여기다 */
  WATER_POND: 0x0010,
} as const

/**
 * 물 판정.
 *
 * 두 값을 합쳐야 맞다 — 파도타기가 있는 36개 존 중 **35개**를 덮고 누락은 1개다.
 * 하나씩 보면 어느 쪽도 결정적이지 않다: 0x0015는 오탐 11(수면은 있는데 파도타기
 * 표가 없는 존), 0x0010은 오탐 0이지만 누락 23이다.
 *
 * ⚠️ 처음엔 0x0015만 물로 적었다. 트윈리프 연못이 파랗게 렌더되지 않아서 들켰다 —
 * 그 연못은 0x0010이다. 하나를 찾았다고 그게 전부라고 볼 근거는 없었다.
 */
export function isWater(behavior: number): boolean {
  return behavior === Behavior.WATER_OPEN || behavior === Behavior.WATER_POND
}

/**
 * 이동 시스템이 필요로 하는 것의 전부. 존 격자든 오버월드 전역 격자든
 * 이것만 만족하면 갈아 끼울 수 있다 — 실내(존)와 실외(오버월드)는 격자의
 * 크기와 출처가 다를 뿐 이동 코드에는 같은 것이다.
 */
export interface CollisionGrid {
  /** 월드 좌표(1타일 = 1유닛) 기준 */
  isBlockedAtWorld(x: number, z: number): boolean
}

export interface Building {
  model: number
  x: number
  y: number
  z: number
  rot: [number, number, number]
  scale: [number, number, number]
}

export interface ZoneChunk {
  id: number
  matrix: { x: number; y: number }
  /** 존 로컬 타일 좌표에서 이 청크의 좌상단 */
  origin: { x: number; z: number }
  tiles: number[]
  buildings: Building[]
}

export interface ZoneData {
  zone: string
  zoneId: number
  matrix: { id: number; name: string }
  chunkTiles: number
  size: { x: number; z: number }
  chunks: ZoneChunk[]
}

/**
 * 여러 청크를 하나의 평평한 격자로 펴 둔다.
 * 청크 경계를 매 질의마다 계산하면 이동 코드가 지저분해지고 느려진다.
 */
export class ZoneGrid implements CollisionGrid {
  readonly width: number
  readonly depth: number
  readonly data: ZoneData
  private readonly tiles: Uint16Array

  constructor(data: ZoneData) {
    this.data = data
    this.width = data.size.x
    this.depth = data.size.z
    // 청크가 없는 칸은 통행 불가로 채운다 — 존 경계 밖으로 걸어 나가지 않게
    this.tiles = new Uint16Array(this.width * this.depth).fill(IMPASSABLE)
    const n = data.chunkTiles
    for (const c of data.chunks) {
      for (let ty = 0; ty < n; ty++) {
        for (let tx = 0; tx < n; tx++) {
          const gx = c.origin.x + tx
          const gz = c.origin.z + ty
          if (gx >= this.width || gz >= this.depth) continue
          this.tiles[gz * this.width + gx] = c.tiles[ty * n + tx]!
        }
      }
    }
  }

  /** 격자 밖은 통행 불가로 취급한다 */
  tileAt(tx: number, tz: number): number {
    if (tx < 0 || tz < 0 || tx >= this.width || tz >= this.depth) return IMPASSABLE
    return this.tiles[tz * this.width + tx]!
  }

  isBlocked(tx: number, tz: number): boolean {
    return (this.tileAt(tx, tz) & IMPASSABLE) !== 0
  }

  behavior(tx: number, tz: number): number {
    return this.tileAt(tx, tz) & BEHAVIOR_MASK
  }

  /** 월드 좌표(1타일 = 1유닛) 기준 질의 */
  isBlockedAtWorld(x: number, z: number): boolean {
    return this.isBlocked(Math.floor(x), Math.floor(z))
  }

  /** 통행 가능한 타일 중 격자 중앙에 가장 가까운 곳 — 스폰 지점 기본값 */
  findSpawn(): { x: number; z: number } {
    const cx = this.width / 2, cz = this.depth / 2
    let best: { x: number; z: number } | null = null
    let bestD = Infinity
    for (let tz = 0; tz < this.depth; tz++) {
      for (let tx = 0; tx < this.width; tx++) {
        if (this.isBlocked(tx, tz)) continue
        const d = (tx - cx) ** 2 + (tz - cz) ** 2
        if (d < bestD) { bestD = d; best = { x: tx + 0.5, z: tz + 0.5 } }
      }
    }
    return best ?? { x: cx, z: cz }
  }
}

/** 현재 이동 판정에 쓰이는 격자. 씬이 넣고 이동 시스템이 읽는다 */
export const activeZone: { grid: CollisionGrid | null } = { grid: null }
