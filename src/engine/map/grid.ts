// 행렬 격자 (DATA.md §4.1)
//
// 오버월드와 실내를 구분하지 않는다 — 둘 다 "행렬 하나 = 격자 하나"이고 크기만 다르다.
// 오버월드는 960×960(1.8MB)이라 통째로 들고 있어도 되고, 실내 269개는 다 합쳐야
// 1.33MB다. 충돌을 청크 단위로 스트리밍하면 경계에서 아직 도착하지 않은 청크를
// 통행 불가로 오판한다 — 그럴 이유가 없다. 스트리밍은 렌더링에만 쓴다.
import { BEHAVIOR_MASK, IMPASSABLE, type Building, type CollisionGrid } from './zone'
import { heightInChunk } from './height'
import { resolveDynamicHeight } from './dynamicHeight'

interface MatrixChunk {
  /** 행렬 안 선형 인덱스. buildings의 키다 */
  i: number
  mx: number
  my: number
  /** land_data 파일 번호 */
  land: number
  /** 맵 헤더 id. 행렬에 headers가 없으면 -1 */
  zone: number
}

export interface MatrixMeta {
  id: number
  name: string
  /** 청크 단위 */
  width: number
  height: number
  /** 타일 단위 */
  tileWidth: number
  tileHeight: number
  chunks: MatrixChunk[]
  buildings: Record<string, Building[]>
  /** 오버월드에만 있다 */
  spawn?: { x: number; z: number; map: number }
  /** 숨은 자리가 바꿔 끼우는 청크 — 오버월드에만 있다 (`map/matrixSwaps`) */
  swaps?: MatrixSwap[]
}

/** 갈아 끼울 청크 하나 (`tools/extract/matrices.js`의 `swapCells`) */
export interface MatrixSwapCell {
  /** 행렬 칸 번호 */
  i: number
  land: number
  /** 32×32 통행값, u16 LE를 base64로 */
  tiles: string
  buildings: Building[]
}

/** 숨은 자리 하나가 바꾸는 청크 묶음 */
interface MatrixSwap {
  /** `enum HiddenLocation` */
  hidden: number
  /** 열렸을 때 바꾸는가(파도의길) · 안 열렸을 때 바꾸는가(떠나는샘길) */
  when: 'unlocked' | 'locked'
  cells: MatrixSwapCell[]
}

export class MapGrid implements CollisionGrid {
  readonly meta: MatrixMeta
  /**
   * 통행값 격자 — 오버월드가 960×960이라 **92만 칸**이다.
   *
   * ⚠️ **`private`는 타입스크립트의 약속일 뿐 런타임에는 그냥 열거되는
   * 속성이다.** 그래서 이 격자를 `grid` prop으로 받는 R3F 컴포넌트를 다시
   * 그릴 때, R3F의 개발 전용 「Changed Props」 자국이 이것을 **한 칸씩 펼쳐**
   * `performance.measure`의 `detail`에 실었다 — 실측(2026-09-09 `_land42`
   * 13바퀴): `detail.devtools.properties`가 **924,116개**였고 그 호출이
   * `Failed to execute 'measure' on 'Performance': Data cannot be cloned,
   * out of memory.`로 터졌다.
   *
   * ⚠️ **그 예외가 R3F의 커밋 안에서 났다.** 그 바퀴의 지형 요청 #27은
   * `submitted`까지 갔는데 `committed`가 **없다**(`terrainTrace`) — 자료도
   * 빌드도 멀쩡했고 커밋만 잃었다. 밖에서는 「지형이 안 온다」로 보인다.
   *
   * 그래서 **진짜 사적 필드**로 둔다. 읽는 법은 그대로고, 열거하는 쪽에는
   * 아예 안 보인다. 밖에서 이 셋을 읽는 자리는 없다(실측 0건).
   *
   * ⚠️ **이것은 개발 서버의 자국이다.** 배포 production은 이 `measure`를
   * 한 번도 안 부른다(실측). 그러니 이 수정이 고치는 것은 **개발에서 도는
   * 우리 검사**고, 쌓이는 자원 자체는 따로 봐야 한다
   */
  readonly #tiles: Uint16Array
  readonly #zoneOfChunk: Int16Array
  readonly #chunkByIndex = new Map<number, MatrixChunk>()

  constructor(meta: MatrixMeta, tiles: Uint16Array) {
    const expected = meta.tileWidth * meta.tileHeight
    if (tiles.length !== expected) {
      throw new Error(`행렬 ${meta.id} 격자 크기 불일치: ${tiles.length} ≠ ${expected}`)
    }
    this.meta = meta
    this.#tiles = tiles
    this.#zoneOfChunk = new Int16Array(meta.width * meta.height).fill(-1)
    for (const c of meta.chunks) {
      this.#zoneOfChunk[c.i] = c.zone
      this.#chunkByIndex.set(c.i, c)
    }
  }

  /** 갈아 끼우기 전의 원래 값 — 되돌릴 때 쓴다 (`swapChunk`) */
  readonly #original = new Map<number, { tiles: Uint16Array; land: number; buildings: Building[] | undefined }>()
  #revision = 0
  /**
   * 청크를 갈아 끼울 때마다 오른다. 그린 쪽(`ChunkModels`)이 이 값을 보고 다시 받는다.
   * 사적 필드 뒤에 둔다 — 열거되는 속성은 `meta` 하나라야 한다(`gridPrivacy.test.ts`)
   */
  get revision(): number { return this.#revision }

  /**
   * 청크 한 칸을 갈아 끼운다 — 충돌 칸 · land_data 번호(모델·높이가 이 번호로 찾는다) · 소품
   * (`MapMatrix_RevealSeabreakPath` · `MapMatrix_RevealSpringPath`). `null`이면 원래대로 되돌린다.
   *
   * @returns 바뀐 것이 있었나
   */
  swapChunk(i: number, next: { tiles: Uint16Array; land: number; buildings: Building[] } | null): boolean {
    const c = this.#chunkByIndex.get(i)
    if (!c) return false
    const n = this.chunkTiles
    const ox = c.mx * n
    const oz = c.my * n
    const was = this.#original.get(i)
    if (next === null) {
      if (was === undefined) return false
      this.#write(ox, oz, was.tiles)
      c.land = was.land
      if (was.buildings === undefined) delete this.meta.buildings[String(i)]
      else this.meta.buildings[String(i)] = was.buildings
      this.#original.delete(i)
      this.#revision++
      return true
    }
    if (was === undefined) {
      const tiles = new Uint16Array(n * n)
      for (let z = 0; z < n; z++) tiles.set(this.#tiles.subarray((oz + z) * this.meta.tileWidth + ox, (oz + z) * this.meta.tileWidth + ox + n), z * n)
      this.#original.set(i, { tiles, land: c.land, buildings: this.meta.buildings[String(i)] })
    } else if (c.land === next.land) return false
    this.#write(ox, oz, next.tiles)
    c.land = next.land
    if (next.buildings.length > 0) this.meta.buildings[String(i)] = next.buildings
    else delete this.meta.buildings[String(i)]
    this.#revision++
    return true
  }

  #write(ox: number, oz: number, tiles: Uint16Array): void {
    const n = this.chunkTiles
    for (let z = 0; z < n; z++) this.#tiles.set(tiles.subarray(z * n, z * n + n), (oz + z) * this.meta.tileWidth + ox)
  }

  get tileWidth() { return this.meta.tileWidth }
  get tileHeight() { return this.meta.tileHeight }
  /** 청크 한 변의 타일 수. 4세대 전 행렬이 32로 같다 */
  get chunkTiles() { return this.meta.tileWidth / this.meta.width }

  /** 격자 밖은 통행 불가. 청크가 없는 칸도 추출 시점에 IMPASSABLE로 채워져 있다 */
  tileAt(tx: number, tz: number): number {
    if (tx < 0 || tz < 0 || tx >= this.meta.tileWidth || tz >= this.meta.tileHeight) return IMPASSABLE
    return this.#tiles[tz * this.meta.tileWidth + tx]!
  }

  isBlocked(tx: number, tz: number): boolean {
    return (this.tileAt(tx, tz) & IMPASSABLE) !== 0
  }

  behavior(tx: number, tz: number): number {
    return this.tileAt(tx, tz) & BEHAVIOR_MASK
  }

  isBlockedAtWorld(x: number, z: number): boolean {
    return this.isBlocked(Math.floor(x), Math.floor(z))
  }

  behaviorAtWorld(x: number, z: number): number {
    return this.behavior(Math.floor(x), Math.floor(z))
  }

  chunkIndexAt(tx: number, tz: number): number {
    const n = this.chunkTiles
    const cx = Math.floor(tx / n)
    const cz = Math.floor(tz / n)
    if (cx < 0 || cz < 0 || cx >= this.meta.width || cz >= this.meta.height) return -1
    return cz * this.meta.width + cx
  }

  /**
   * 월드 좌표의 지면 높이(타일 단위). 높이 데이터가 없거나 판이 없으면 null.
   *
   * `near`는 지금 높이다 — 다리와 그 밑처럼 판이 겹치는 자리에서 어느 층인지
   * 가르는 유일한 단서다. 0을 넘기면 다리 위를 걷다가 밑으로 떨어진다
   *
   * ⚠️ **구워진 높이가 마지막 답이 아니다.** 승강판·물바닥처럼 딛는 면이
   * 움직이는 자리는 그 위에 판을 한 겹 얹는다 (`map/dynamicHeight`) — BDHC만
   * 보면 리그 승강기가 올라가는 동안 사람이 바닥에 남는다
   */
  heightAtWorld(x: number, z: number, near = 0): number | null {
    return resolveDynamicHeight(
      this.bakedHeightAtWorld(x, z, near), Math.floor(x), Math.floor(z), near)
  }

  /**
   * 판을 얹기 **전**의, 구워진 높이만 (`CalculateObjectHeight`).
   *
   * 얹은 답과 구별해야 하는 자리가 하나 있다 — 「딛는 높이가 판에서 왔는가」를
   * 묻는 칸이다(들판시티 체육관의 물). 얹은 답을 다시 넣으면 늘 판이 이긴다
   */
  bakedHeightAtWorld(x: number, z: number, near = 0): number | null {
    const i = this.chunkIndexAt(Math.floor(x), Math.floor(z))
    if (i < 0) return null
    const c = this.#chunkByIndex.get(i)
    if (!c) return null
    const n = this.chunkTiles
    // 판 좌표는 청크 원점 기준이라 청크가 놓인 자리를 빼고 묻는다
    return heightInChunk(c.land, x - c.mx * n, z - c.my * n, near)
  }

  /** 맵 헤더 id. 청크가 없거나 행렬에 headers가 없으면 -1 */
  zoneAt(tx: number, tz: number): number {
    const i = this.chunkIndexAt(tx, tz)
    return i < 0 ? -1 : this.#zoneOfChunk[i]!
  }

  /**
   * 그 칸에 놓인 소품의 모델 번호 (`FieldSystem_FindCollidingLoadedMapProp*`).
   *
   * 없으면 −1이다. 들판시티 체육관의 단추가 어느 색인지, 앞에 선 나무가 꿀
   * 나무인지를 이걸로 가른다 — 배치표에는 모델 번호만 있고 이름이 없다
   */
  propModelAt(tx: number, tz: number): number {
    const i = this.chunkIndexAt(tx, tz)
    if (i < 0) return -1
    for (const b of this.meta.buildings[String(i)] ?? []) {
      if (Math.floor(b.x) === tx && Math.floor(b.z) === tz) return b.model
    }
    return -1
  }

  /** 렌더 창: 주어진 청크를 중심으로 반경 r 이내의 실제 청크들 */
  chunksAround(centerIndex: number, r: number): MatrixChunk[] {
    if (centerIndex < 0) return []
    const cx = centerIndex % this.meta.width
    const cz = (centerIndex / this.meta.width) | 0
    const out: MatrixChunk[] = []
    for (let dz = -r; dz <= r; dz++) {
      for (let dx = -r; dx <= r; dx++) {
        const x = cx + dx, z = cz + dz
        if (x < 0 || z < 0 || x >= this.meta.width || z >= this.meta.height) continue
        const c = this.#chunkByIndex.get(z * this.meta.width + x)
        if (c) out.push(c)
      }
    }
    return out
  }
}
