// 파트너 고르는 장면 — 굽는 쪽 둘 parity와, 구운 애니가 원작대로 움직이는가 (DATA.md §2.14)
//
// ⚠️ **애니를 눈으로 「움직이더라」 하지 않는다.** 원작은 `psel_all` 마지막 프레임에서 덮인
// 가방(모델 1)을 감추고 열린 가방(모델 8)을 켠다 — 그러니 마지막 프레임의 덮인 가방이 열린
// 가방과 **같은 자리**에 서야 갈아 끼우는 순간이 안 튄다. 그것을 정점 거리로 잰다. 화면이
// 쓰는 바로 그 함수(`scene/propAnim`의 `nodeMatricesAt`)로 잰다.
import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { openNds } from './nds'
import { convertStarterScene } from './starterScene'
import { readNsbca, type JntAnim } from './nsbca'
import { SUPPORTED } from './validate'
import { nodeMatricesAt, type NodeBase } from '../../scene/propAnim'
import {
  BALL_POSITION, CAMERA_CHOOSE, CURSOR_BOB, CURSOR_SCREEN, OPEN_FRAMES, cursorShot, depthOf,
  pixelAt, projectToScreen, screenToWorld, textColor,
} from '../../ui/field/starterScene'
import {
  DATA, decodePngBytes, fileSource, romPath, withData, withRom,
} from '../../data/romData.testkit'
import { Vector3 } from 'three'

const EN = SUPPORTED.releases.find((r) => r.gameCode === 'CPUE')!

withRom('en')('파트너 고르는 장면 — 굽는 쪽 둘이 같다', () => {
  it('⚠️ 모델 · 애니 · 목차는 바이트로, 그림은 픽셀로 같다', async () => {
    if (!existsSync(resolve(DATA, 'starter/anims.bin'))) {
      expect.unreachable('public/data/starter/anims.bin이 없다 — pnpm extract:starterScene')
      return
    }
    const fs = await openNds(fileSource(romPath('en')!))
    const out = await convertStarterScene({ fs: fs!, locale: 'en', release: EN })

    const diff: string[] = []
    let same = 0
    for (const [path, bytes] of out) {
      const file = resolve(DATA, path.replace(/^data\//, ''))
      if (!existsSync(file)) { diff.push(`${path}: 노드 쪽에 없다`); continue }
      const expected = readFileSync(file)
      if (path.endsWith('.png')) {
        // deflate는 같은 픽셀에서 여러 정답을 낸다 — 그림은 픽셀로 잰다 (`decodePngBytes`)
        const a = decodePngBytes(bytes), b = decodePngBytes(expected)
        const ok = a.width === b.width && a.height === b.height
          && Buffer.from(a.pixels).equals(Buffer.from(b.pixels))
        if (ok) same++
        else diff.push(`${path}: 픽셀이 다르다`)
        continue
      }
      if (Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).equals(expected)) same++
      else diff.push(`${path}: ${String(bytes.byteLength)}B 대 ${String(expected.byteLength)}B`)
    }
    expect(diff, `${String(diff.length)}개가 어긋난다`).toEqual([])
    // 모델 여섯 × (.bin · .png) + 애니 바이트 + 목차
    expect(same).toBe(14)
  }, 300_000)
})

/** 굽는 쪽의 `PT3C` 자 (`chunks.ts`의 `POS_SCALE` · `VERTEX_BYTES`) */
const POS_SCALE = 256
const VERTEX_BYTES = 24

/** `PT3C` 한 벌에서 서브메시마다 그 서브메시가 쓰는 정점 자리(타일) */
function submeshPoints(file: string): [number, number, number][][] {
  const buf = readFileSync(resolve(DATA, file))
  const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength)
  const len = view.getUint32(4, true)
  const meta = JSON.parse(buf.subarray(8, 8 + len).toString('utf8')) as {
    verts: number, submeshes: [number, number, number][]
  }
  const head = 8 + len + ((4 - (len % 4)) % 4)
  const idxAt = head + meta.verts * VERTEX_BYTES
  const pos = (k: number): [number, number, number] => {
    const o = head + k * VERTEX_BYTES
    return [0, 1, 2].map((a) => view.getInt16(o + a * 2, true) / POS_SCALE) as [number, number, number]
  }
  return meta.submeshes.map(([, start, count]) => {
    const seen = new Set<number>()
    for (let i = 0; i < count; i++) seen.add(view.getUint16(idxAt + (start + i) * 2, true))
    return [...seen].map(pos)
  })
}

interface Index {
  clips: Record<string, number>
  anims: Record<string, [number, number]>
  info: Record<string, { submeshNodes: number[], nodes: NodeBase[], parents: number[] }>
  text: string[]
}

const index = (): Index => JSON.parse(readFileSync(resolve(DATA, 'starter/index.json'), 'utf8')) as Index
const clip = (idx: Index, model: number): JntAnim => {
  const [at, size] = idx.anims[String(model)]!
  const bytes = new Uint8Array(readFileSync(resolve(DATA, 'starter/anims.bin')))
  return readNsbca(bytes.subarray(at, at + size))[0]!
}

/**
 * 모델 하나를 그 프레임의 자세로 편다 — 화면(`StarterStage`의 `Rigged`)과 같은 셈이다.
 * 서브메시마다 따로 돌려준다
 */
function posed(model: number, frame: number, chain = true): [number, number, number][][] {
  const idx = index()
  const info = idx.info[String(model)]!
  const anim = clip(idx, model)
  const subs = submeshPoints(`starter/${String(model)}.bin`)
  const mats = nodeMatricesAt(
    chain ? info : { nodes: info.nodes }, anim, new Set(info.submeshNodes), frame,
  )
  return subs.map((pts, i) => {
    const mat = mats.get(info.submeshNodes[i]!)
    return pts.map((p): [number, number, number] => {
      const v = new Vector3(...p)
      if (mat) v.applyMatrix4(mat)
      return [v.x, v.y, v.z]
    })
  })
}

/** `a`의 점마다 `b`에서 가장 가까운 점까지 거리의 평균 */
function meanNearest(a: readonly number[][], b: readonly number[][]): number {
  let sum = 0
  for (const p of a) {
    let best = Infinity
    for (const q of b) {
      const d = (p[0]! - q[0]!) ** 2 + (p[1]! - q[1]!) ** 2 + (p[2]! - q[2]!) ** 2
      if (d < best) best = d
    }
    sum += Math.sqrt(best)
  }
  return sum / a.length
}

withData(
  'starter/index.json', 'starter/anims.bin', 'starter/1.bin', 'starter/8.bin', 'starter/3.bin',
)('파트너 고르는 장면 — 구운 애니', () => {
  it('길이가 원작 프레임 수다 — 가방 41 · 볼 73', () => {
    const idx = index()
    expect(clip(idx, 1).frames).toBe(OPEN_FRAMES)
    expect(idx.clips['1']).toBe(OPEN_FRAMES)
    for (const id of [3, 5, 7]) {
      expect(clip(idx, id).frames).toBe(73)
      expect(idx.clips[String(id)]).toBe(73)
    }
  })

  it('⚠️ psel_all 마지막 프레임의 덮인 가방이 열린 가방과 겹친다 — 갈아 끼울 때 안 튄다', () => {
    const idx = index()
    const info = idx.info['1']!
    // 가방 두 짝(노드 10 `tran_down` · 11 `tran_top`)만 견준다 — 볼과 그림자는 열린 가방에 없다
    const halves = (frame: number): [number, number, number][] =>
      posed(1, frame).filter((_, i) => info.submeshNodes[i]! >= 10).flat()
    const open = submeshPoints('starter/8.bin').flat()
    // 실측 0.0011타일 — 고정소수 한 칸 언저리다
    expect(meanNearest(halves(OPEN_FRAMES - 1), open)).toBeLessThan(0.01)
    // 0프레임은 덮여 있다 — 위 값이 우연이 아니라 애니가 연 것이다. 실측 0.63타일이다
    // (윗짝은 그대로고 아랫짝만 90° 서 있다)
    expect(meanNearest(halves(0), open)).toBeGreaterThan(0.3)
  })

  it('psel_all이 볼 셋을 원작 자리(`selectionMatrix`)에 내려놓는다', () => {
    const idx = index()
    const anim = clip(idx, 1)
    // 노드 4 · 6 · 8이 볼 셋(`psel_mb_a/b/c`)이다. 이동은 DS 유닛이다
    ;[4, 6, 8].forEach((node, at) => {
      const last = anim.tracks.find((t) => t.node === node)!.frames[anim.frames - 1]!
      expect(last.t).toEqual([...BALL_POSITION[at]!])
    })
  })

  it('⚠️ 볼의 흔들림은 노드 사슬을 따라야 산다', () => {
    const idx = index()
    const anim = clip(idx, 3)
    // 맨 위 노드 0(`mb_null_a`)이 x로 −3유닛까지 간다. 볼(2)·그림자(1)는 그 자식이다
    expect(idx.info['3']!.parents).toEqual([-1, 0, 0, 0])
    const swing = anim.tracks.find((t) => t.node === 0)!.frames
    const far = swing.reduce((best, f, i) => (Math.abs(f.t![0]) > Math.abs(swing[best]!.t![0]) ? i : best), 0)
    expect(swing[far]!.t![0]).toBeCloseTo(-3, 3)
    const shift = (chain: boolean): number => {
      // 서브메시 0이 그림자(노드 1)다
      const rest = posed(3, 0, chain)[0]![0]!, moved = posed(3, far, chain)[0]![0]!
      return moved[0] - rest[0]
    }
    // 사슬로 셈하면 그림자가 3유닛(= 3/16타일) 밀리고, 사슬 없이는 꼼짝 않는다
    expect(shift(true)).toBeCloseTo(-3 / 16, 3)
    expect(shift(false)).toBeCloseTo(0, 6)
  })

  it('`{COLOR n}`이 글창 팔레트의 n·2+1번 — 모부기 초록 · 불꽃숭이 빨강 · 팽도리 파랑', () => {
    const { text } = index()
    expect(text).toHaveLength(16)
    const rgb = (hex: string): number[] => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
    const dominant = (hex: string): number => {
      const c = rgb(hex)
      return c.indexOf(Math.max(...c))
    }
    // 뱅크 360: 1번 `{COLOR 3}` 모부기 · 2번 `{COLOR 1}` 불꽃숭이 · 3번 `{COLOR 2}` 팽도리
    expect(dominant(textColor(text, 1)!)).toBe(0)
    expect(dominant(textColor(text, 2)!)).toBe(2)
    expect(dominant(textColor(text, 3)!)).toBe(1)
    expect(textColor(text, 0)).toBeUndefined()
  })
})

describe('파트너 고르는 장면 — 커서 자리', () => {
  it('화면 점을 볼 깊이로 되돌리면 다시 그 화면 점에 찍힌다', () => {
    CURSOR_SCREEN.forEach((screen, at) => {
      const depth = depthOf(BALL_POSITION[at]!, CAMERA_CHOOSE)
      expect(depth).toBeGreaterThan(0)
      const [x, y] = projectToScreen(screenToWorld(screen, depth, CAMERA_CHOOSE), CAMERA_CHOOSE)
      expect(x).toBeCloseTo(screen[0], 6)
      expect(y).toBeCloseTo(screen[1], 6)
    })
  })

  it('판 크기가 원작 픽셀 그대로다 — 32픽셀 판의 위아래 끝이 32픽셀 떨어져 찍힌다', () => {
    const depth = depthOf(BALL_POSITION[1]!, CAMERA_CHOOSE)
    const top = screenToWorld([130, 82 - 16], depth, CAMERA_CHOOSE)
    const bottom = screenToWorld([130, 82 + 16], depth, CAMERA_CHOOSE)
    const span = Math.hypot(top[0] - bottom[0], top[1] - bottom[1], top[2] - bottom[2])
    expect(span).toBeCloseTo(32 * pixelAt(depth), 6)
  })

  it('커서는 32프레임에 한 번 8픽셀 오르내린다 — 처음엔 아래로', () => {
    const [x, y] = CURSOR_SCREEN[0]!
    expect(cursorShot(0, 0)).toEqual([x, y])
    expect(cursorShot(0, CURSOR_BOB.frames / 4)[1]).toBeCloseTo(y + 8, 6)
    expect(cursorShot(0, (CURSOR_BOB.frames * 3) / 4)[1]).toBeCloseTo(y - 8, 6)
    expect(cursorShot(0, CURSOR_BOB.frames)[1]).toBeCloseTo(y, 6)
  })
})
