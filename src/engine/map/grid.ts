// 행렬 격자 (DATA.md §4.1)
//
// 오버월드와 실내를 구분하지 않는다 — 둘 다 "행렬 하나 = 격자 하나"이고 크기만 다르다.
// 오버월드는 960×960(1.8MB)이라 통째로 들고 있어도 되고, 실내 269개는 다 합쳐야
// 1.33MB다. 충돌을 청크 단위로 스트리밍하면 경계에서 아직 도착하지 않은 청크를
// 통행 불가로 오판한다 — 그럴 이유가 없다. 스트리밍은 렌더링에만 쓴다.
import { BEHAVIOR_MASK, IMPASSABLE, type Building, type CollisionGrid } from './zone'

export interface MatrixChunk {
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
}

export class MapGrid implements CollisionGrid {
  readonly meta: MatrixMeta
  private readonly tiles: Uint16Array
  private readonly zoneOfChunk: Int16Array
  private readonly chunkByIndex = new Map<number, MatrixChunk>()

  constructor(meta: MatrixMeta, tiles: Uint16Array) {
    const expected = meta.tileWidth * meta.tileHeight
    if (tiles.length !== expected) {
      throw new Error(`행렬 ${meta.id} 격자 크기 불일치: ${tiles.length} ≠ ${expected}`)
    }
    this.meta = meta
    this.tiles = tiles
    this.zoneOfChunk = new Int16Array(meta.width * meta.height).fill(-1)
    for (const c of meta.chunks) {
      this.zoneOfChunk[c.i] = c.zone
      this.chunkByIndex.set(c.i, c)
    }
  }

  get tileWidth() { return this.meta.tileWidth }
  get tileHeight() { return this.meta.tileHeight }
  /** 청크 한 변의 타일 수. 4세대 전 행렬이 32로 같다 */
  get chunkTiles() { return this.meta.tileWidth / this.meta.width }

  /** 격자 밖은 통행 불가. 청크가 없는 칸도 추출 시점에 IMPASSABLE로 채워져 있다 */
  tileAt(tx: number, tz: number): number {
    if (tx < 0 || tz < 0 || tx >= this.meta.tileWidth || tz >= this.meta.tileHeight) return IMPASSABLE
    return this.tiles[tz * this.meta.tileWidth + tx]!
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

  chunkIndexAt(tx: number, tz: number): number {
    const n = this.chunkTiles
    const cx = Math.floor(tx / n)
    const cz = Math.floor(tz / n)
    if (cx < 0 || cz < 0 || cx >= this.meta.width || cz >= this.meta.height) return -1
    return cz * this.meta.width + cx
  }

  /** 맵 헤더 id. 청크가 없거나 행렬에 headers가 없으면 -1 */
  zoneAt(tx: number, tz: number): number {
    const i = this.chunkIndexAt(tx, tz)
    return i < 0 ? -1 : this.zoneOfChunk[i]!
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
        const c = this.chunkByIndex.get(z * this.meta.width + x)
        if (c) out.push(c)
      }
    }
    return out
  }
}
