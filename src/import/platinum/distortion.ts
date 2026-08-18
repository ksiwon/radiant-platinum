// 깨어진 세계의 **판과 통행 격자** — 브라우저에서 (DATA.md §2.22 · PARITY §6.10)
//
// 여기만 맵이 평범한 격자가 아니다. 바닥·서쪽 벽·동쪽 벽·천장 네 갈래의 「떠 있는
// 판」이 겹쳐 있고, 서 있는 판이 무엇이냐에 따라 같은 (x,y,z)가 다른 통행 자료를
// 가리킨다. 그 자료가 맵 자료에 없어서 롬은 전용 NARC 둘을 읽는다:
//
//   /fielddata/tornworld/tw_arc.narc       파일 0 = 맵 열의 목차, 1~10 = 맵마다
//   /fielddata/tornworld/tw_arc_attr.narc  판마다의 통행 격자 열두 벌 (u16 1024개)
//
// ⚠️ **자료가 반씩 갈린다.** 층 잇는 차례 · 움직이는 발판 · 승강 경로 · 칸을
// 밟으면 도는 사건 프로그램은 NARC이 아니라 **오버레이의 C 배열**이라 사용자의
// 롬 하나로는 못 꺼낸다 — 그쪽은 `pnpm gen:distortionTables`가 소스에 굽는다.
// 둘을 합치는 자리는 `data/distortionFile.ts` 하나이고, 읽는 쪽 스무 군데는
// 합쳐진 것만 본다.
//
// ⚠️ **`bounds`는 양끝을 포함한다.** `size`가 개수가 아니라 **차이**다
// (`start + size`까지가 안이다). 개수로 읽으면 판마다 한 줄씩 좁아진다.
//
// ⚠️ **노드 쪽(`tools/extract/distortion.js`)과 바이트로 같아야 한다**
import { narcEntry } from './nds'
import {
  breathe, check, json, readRomFile, type ConvertContext, type Produced,
} from './convertTypes'

const MAIN = '/fielddata/tornworld/tw_arc.narc'
const ATTR = '/fielddata/tornworld/tw_arc_attr.narc'

/** 목차 한 줄 — 맵 번호4 + 파일 번호2 + 세계 좌표 오프셋 s16 셋 */
const MAP_INFO_SIZE = 12
const PLATFORM_SIZE = 20
const JUMP_SIZE = 40
const CAMERA_SIZE = 24
const GHOST_TEMPLATE_SIZE = 12
const GHOST_TRIGGER_SIZE = 20
/** 맵 파일 머리 — 갈래 셋의 구역 크기와 여분 */
const HEADER_SIZE = 20

interface Bounds {
  x: number, y: number, z: number
  sx: number, sy: number, sz: number
}

/** `DistWorldBounds` 여섯 s16 */
function readBounds(v: DataView, off: number): Bounds {
  return {
    x: v.getInt16(off, true), y: v.getInt16(off + 2, true), z: v.getInt16(off + 4, true),
    sx: v.getInt16(off + 6, true), sy: v.getInt16(off + 8, true), sz: v.getInt16(off + 10, true),
  }
}

interface Platform { kind: number, attr: number, bounds: Bounds, rows: number, cols: number }

interface MapBody {
  platforms: Platform[]
  jumps: unknown[]
  cameras: unknown[]
  props: unknown[]
  triggers: unknown[]
  visibleGroups: number
}

function readMapFile(buf: Uint8Array): MapBody {
  const v = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  const platformSize = v.getInt32(4, true)
  const jumpSize = v.getInt32(8, true)
  const cameraSize = v.getInt32(12, true)
  const platformAt = HEADER_SIZE
  const jumpAt = platformAt + platformSize
  const cameraAt = jumpAt + jumpSize
  const ghostAt = cameraAt + cameraSize

  const platforms = []
  if (platformSize) {
    const count = v.getInt32(platformAt, true)
    for (let i = 0; i < count; i++) {
      const o = platformAt + 4 + i * PLATFORM_SIZE
      platforms.push({
        kind: v.getInt16(o, true),
        attr: v.getUint16(o + 2, true),
        bounds: readBounds(v, o + 4),
        rows: v.getUint16(o + 16, true),
        cols: v.getUint16(o + 18, true),
      })
    }
    if (platformAt + 4 + count * PLATFORM_SIZE !== jumpAt) throw new Error('판 구역 크기가 안 맞는다')
  }

  const jumps = []
  if (jumpSize) {
    const count = v.getInt32(jumpAt, true)
    for (let i = 0; i < count; i++) {
      const o = jumpAt + 4 + i * JUMP_SIZE
      jumps.push({
        handler: v.getUint16(o, true),
        dir: v.getInt16(o + 2, true),
        bounds: readBounds(v, o + 8),
        dx: v.getInt16(o + 20, true),
        dy: v.getInt16(o + 22, true),
        dz: v.getInt16(o + 24, true),
        spriteAngle: v.getInt16(o + 26, true),
        steps: v.getInt16(o + 28, true),
        axis: v.getUint16(o + 30, true),
        inverted: v.getUint16(o + 32, true),
        facing: v.getInt16(o + 34, true),
        platformKind: v.getInt16(o + 36, true),
        platformIndex: v.getUint16(o + 38, true),
      })
    }
    if (jumpAt + 4 + count * JUMP_SIZE !== cameraAt) throw new Error('뛰는 자리 구역 크기가 안 맞는다')
  }

  const cameras = []
  if (cameraSize) {
    const count = v.getInt32(cameraAt, true)
    for (let i = 0; i < count; i++) {
      const o = cameraAt + 4 + i * CAMERA_SIZE
      cameras.push({
        bounds: readBounds(v, o),
        angleX: v.getUint16(o + 12, true),
        angleY: v.getUint16(o + 14, true),
        angleZ: v.getUint16(o + 16, true),
        dir: v.getInt16(o + 18, true),
        steps: v.getInt32(o + 20, true),
      })
    }
    if (cameraAt + 4 + count * CAMERA_SIZE !== ghostAt) throw new Error('카메라 구역 크기가 안 맞는다')
  }

  const templateCount = v.getInt32(ghostAt, true)
  const triggerCount = v.getInt32(ghostAt + 4, true)
  const visible = v.getUint32(ghostAt + 8, true)
  const props = []
  for (let i = 0; i < templateCount; i++) {
    const o = ghostAt + 12 + i * GHOST_TEMPLATE_SIZE
    props.push({
      group: v.getUint32(o, true),
      kind: v.getUint16(o + 4, true),
      x: v.getInt16(o + 6, true), y: v.getInt16(o + 8, true), z: v.getInt16(o + 10, true),
    })
  }
  const triggers = []
  const triggerAt = ghostAt + 12 + templateCount * GHOST_TEMPLATE_SIZE
  for (let i = 0; i < triggerCount; i++) {
    const o = triggerAt + i * GHOST_TRIGGER_SIZE
    triggers.push({
      group: v.getUint32(o, true),
      dir: v.getInt16(o + 4, true),
      show: v.getInt16(o + 6, true),
      bounds: readBounds(v, o + 8),
    })
  }
  const end = triggerAt + triggerCount * GHOST_TRIGGER_SIZE
  if (end !== buf.length) {
    throw new Error(`맵 파일 크기가 안 맞는다: ${String(end)} ≠ ${String(buf.length)}`)
  }

  return { platforms, jumps, cameras, props, triggers, visibleGroups: visible }
}

export async function convertDistortion(ctx: ConvertContext): Promise<Produced> {
  const main = await readRomFile(ctx, MAIN)
  const attrNarc = await readRomFile(ctx, ATTR)

  const info = narcEntry(main, 0)
  if (!info) throw new Error(`${MAIN}에 목차가 없다`)
  const iv = new DataView(info.buffer, info.byteOffset, info.byteLength)
  const mapCount = iv.getInt32(0, true)
  if (4 + mapCount * MAP_INFO_SIZE !== info.length) throw new Error('목차 크기가 안 맞는다')
  const STEPS = mapCount + 1

  const maps = []
  for (let i = 0; i < mapCount; i++) {
    const o = 4 + i * MAP_INFO_SIZE
    const fileIndex = iv.getUint16(o + 4, true)
    const file = narcEntry(main, fileIndex + 1)
    if (!file) throw new Error(`${MAIN}에 ${String(fileIndex + 1)}번 맵 파일이 없다`)
    maps.push({
      map: iv.getUint32(o, true),
      offsetX: iv.getInt16(o + 6, true),
      offsetY: iv.getInt16(o + 8, true),
      offsetZ: iv.getInt16(o + 10, true),
      ...readMapFile(file),
    })
    ctx.onProgress?.(i + 1, STEPS)
    await breathe(ctx)
  }

  // 통행 격자. 판마다 `rows × cols`만 쓰지만 파일은 늘 1024칸이다
  const attrs: number[][] = []
  for (let i = 0; ; i++) {
    const buf = narcEntry(attrNarc, i)
    if (!buf) break
    if (buf.length % 2) throw new Error(`통행 격자가 u16 배수가 아니다: ${String(buf.length)}`)
    const av = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
    const cells = new Array<number>(buf.length / 2)
    for (let k = 0; k < cells.length; k++) cells[k] = av.getUint16(k * 2, true)
    attrs.push(cells)
  }

  // 판이 가리키는 격자 번호가 실제로 있는지, `rows × cols`가 격자 안에 드는지
  for (const m of maps) {
    for (const p of m.platforms) {
      const grid = attrs[p.attr]
      if (grid === undefined) {
        throw new Error(`맵 ${String(m.map)}: 통행 격자 ${String(p.attr)}이 없다`)
      }
      if (p.rows * p.cols > grid.length) {
        throw new Error(
          `맵 ${String(m.map)}: 판 ${String(p.rows)}×${String(p.cols)}가 격자 ${String(grid.length)}칸을 넘는다`,
        )
      }
    }
  }

  check(ctx)
  ctx.onProgress?.(STEPS, STEPS)
  return new Map([['data/distortion.json', json({ maps, attrs })]])
}
