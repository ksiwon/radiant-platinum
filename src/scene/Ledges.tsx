// 방지턱의 단차 (PARITY §1.11 · FIRST_PERSON §7.4)
//
// ⚠️ **원작 높이 자료에는 단차가 없다.** 턱 341칸이 341칸 다 양쪽이 같은 높이고,
// 턱은 바닥에 그린 **그림**이다 (`allpeak`). 고정 부감에서는 그림만으로 「여기는
// 뛰어내리는 곳」이 읽혔다 — 실측: 오버월드 남 305 · 서 21 · 동 15, 실내 0칸.
//
// 3인칭·1인칭에서는 그 그림이 잔디에 그은 갈색 선으로만 보인다. 그래서 나무·바위와
// 마찬가지로 **우리가 세운다**. 뛰는 규칙(`actor/ledge`)은 손대지 않는다: 높이는
// 그림이고 통행은 여전히 거동값이 정한다.
//
// 모양은 `ledgeVisual`에 있다 — 자리는 원본 칸 텍셀, 높이는 §7.4.3 초기값이다.
//
// ⚠️ **BDSP 지역이 그리는 바깥에서는 BDSP가 턱을 그린다.** 지역 glb가 턱 341칸 중 336칸에 낮은 절벽(`M_C_001_Cliff_04` ·
// `Cliff_04B`)을 구워 두었다 — 칸 한가운데가 땅보다 0.16(0.1~0.25) 높고 착지 쪽 +0.5~0.75에서 땅으로 닫힌다(`Ledges.test`).
// 그래서 그 위에는 안 세운다. **BDSP가 턱을 안 그린 다섯 칸**(`BDSP_BARE_LEDGES` — 221번도로 x 314 · z 896~900의 동쪽 턱)만
// 세운다. 그 칸은 BDSP 땅이 평평해서 안 세우면 보이지 않는 한쪽 문이 된다.
// BDSP 기믹 `obj0025_01~04`(`P_C_001_Bank_0x` · `FieldEmbankmentEntity`)는 턱이 아니다 — 한 칸 안의 둥근 둔덕(높이 0.42 ·
// 가운데가 가장 높고 사방이 대칭)이라 뛰는 방향이 없다
// **색을 못 읽으면 안 세운다** (§4.4의 준비 대기). 그림 묶음이 오기 전에 상자를
// 먼저 올리면 같은 자리에 두 벌이 겹쳤다가 바뀐다
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { InstancedMesh, MeshLambertMaterial, Mesh, Object3D, type BufferGeometry } from 'three'
import type { MapGrid } from '../engine/map/grid'
import { worldState } from '../state/worldState'
import { bdspReady, bdspVersion, subscribeBdsp } from './bdspReady'
import { loadTexSheet, type TexSheet } from './chunkMesh'
import { recipeMode } from './visual/recipes'
import {
  ledgeFacing, ledgeGeometry, ledgeRuns, ledgeSwatch,
  type LedgeSwatch, type LedgeTile,
} from './ledgeVisual'

/**
 * BDSP 지역이 턱을 안 그린 칸과 그 칸을 그리는 지역 (`Ledges.test`의 실측). 턱 341칸 중 이 다섯만 지역 glb의 땅이 평평하다 —
 * 221번도로(맵 392)의 동쪽으로 뛰는 세로 턱 한 줄이다. BDSP가 이 길을 고쳐 지으며 턱을 뺐고, 우리 통행은 원작대로 턱이다
 */
export const BDSP_BARE_LEDGES: readonly { x: number, z: number, field: string }[] = [
  { x: 314, z: 896, field: 'area001' },
  { x: 314, z: 897, field: 'area001' },
  { x: 314, z: 898, field: 'area001' },
  { x: 314, z: 899, field: 'area001' },
  { x: 314, z: 900, field: 'area001' },
]

/** BDSP가 그리는 동안 우리가 세울 턱인가 — 그 칸을 그리는 지역이 서서 그려질 때만 참이다 */
export function bdspBareLedge(x: number, z: number, ready: (key: string) => boolean = bdspReady): boolean {
  return BDSP_BARE_LEDGES.some((c) => c.x === x && c.z === z && ready(c.field))
}

function collect(grid: MapGrid, center: number, radius: number, only?: (x: number, z: number) => boolean): LedgeTile[] {
  const out: LedgeTile[] = []
  const n = grid.chunkTiles
  const near = worldState.player.position.y
  for (const chunk of grid.chunksAround(center, radius)) {
    const x0 = chunk.mx * n
    const z0 = chunk.my * n
    for (let z = z0; z < z0 + n; z++) {
      for (let x = x0; x < x0 + n; x++) {
        const facing = ledgeFacing(grid.behavior(x, z))
        if (!facing) continue
        if (only !== undefined && !only(x, z)) continue
        out.push({
          x: x + 0.5,
          y: grid.heightAtWorld(x + 0.5, z + 0.5, near) ?? 0,
          z: z + 0.5,
          dx: facing.dx,
          dz: facing.dz,
        })
      }
    }
  }
  return out
}

/**
 * 묶음에서 `allpeak` 색을 꺼낸다. 이름이 둘이다 — 바깥은 `allpeak`,
 * 동굴은 `dun_allpeak`고 둘 다 같은 자리에 같은 짜임으로 그려져 있다
 */
function swatchOf(sheet: TexSheet): LedgeSwatch | null {
  for (const name of ['allpeak', 'dun_allpeak']) {
    const item = sheet.items.find((s) => s.tex === name)
    if (item === undefined) continue
    const got = ledgeSwatch({ width: sheet.width, pixels: sheet.pixels }, item)
    if (got !== null) return got
  }
  return null
}

const material = new MeshLambertMaterial({ name: '턱', vertexColors: true })

/**
 * **예전 모양** — 칸마다 갈색 상자 하나와 뛰는 쪽에 짙은 상자 하나.
 *
 * 개발판에서 `pt.visualMode = 'legacy'`일 때만 선다 (§4.6). 전후를 같은 자리·같은
 * 시각에 찍어 견주는 대조군이다 — 사용자 메뉴에는 안 낸다
 */
function LegacyLedges({ tiles }: { tiles: readonly LedgeTile[] }) {
  const top = useRef<InstancedMesh>(null)
  const face = useRef<InstancedMesh>(null)
  const dummy = useMemo(() => new Object3D(), [])
  useEffect(() => {
    const tops = top.current
    const faces = face.current
    if (!tops || !faces) return
    tops.count = tiles.length
    faces.count = tiles.length
    tiles.forEach((t, i) => {
      dummy.position.set(t.x, t.y + 0.09, t.z)
      dummy.rotation.set(0, 0, 0)
      dummy.scale.set(1, 1, 1)
      dummy.updateMatrix()
      tops.setMatrixAt(i, dummy.matrix)
      dummy.position.set(t.x + t.dx * 0.43, t.y + 0.09, t.z + t.dz * 0.43)
      dummy.rotation.set(0, Math.atan2(t.dx, t.dz), 0)
      dummy.updateMatrix()
      faces.setMatrixAt(i, dummy.matrix)
    })
    tops.instanceMatrix.needsUpdate = true
    faces.instanceMatrix.needsUpdate = true
  }, [dummy, tiles])
  if (tiles.length === 0) return null
  return (
    <group>
      <instancedMesh ref={top} args={[undefined, undefined, tiles.length]} castShadow receiveShadow>
        <boxGeometry args={[0.96, 0.18, 0.96]} />
        <meshStandardMaterial color="#7c5b36" roughness={0.94} />
      </instancedMesh>
      <instancedMesh ref={face} args={[undefined, undefined, tiles.length]} castShadow receiveShadow>
        <boxGeometry args={[0.9, 0.26, 0.12]} />
        <meshStandardMaterial color="#4d3825" roughness={0.98} />
      </instancedMesh>
    </group>
  )
}

/** 그림에 그려 둔 턱을 **줄 단위 쐐기**로 세운다 (§7.4). */
export function Ledges(
  { grid, chunkIndex, radius, texSet, bdsp = false }: {
    grid: MapGrid; chunkIndex: number; radius: number; texSet: number
    /** BDSP 층이 그리는 중이다 — BDSP가 턱을 안 그린 칸(`bdspBareLedge`)만 세운다 */
    bdsp?: boolean
  },
) {
  const legacy = recipeMode() === 'legacy'
  const [swatch, setSwatch] = useState<LedgeSwatch | null>(null)
  useEffect(() => {
    let alive = true
    void loadTexSheet(texSet).then((sheet) => { if (alive) setSwatch(swatchOf(sheet)) })
    return () => { alive = false }
  }, [texSet])

  // BDSP 지역이 서고 떨어질 때마다 다시 고른다 — 세울 칸이 `bdspBareLedge`를 읽는다. 열쇠는 지금 세울 칸들이다
  useSyncExternalStore(subscribeBdsp, bdspVersion)
  const bare = bdsp
    ? BDSP_BARE_LEDGES.filter((c) => bdspBareLedge(c.x, c.z)).map((c) => `${String(c.x)},${String(c.z)}`).join('|')
    : null
  const tiles = useMemo(() => {
    const keep = bare === null ? null : new Set(bare.split('|'))
    return collect(grid, chunkIndex, radius, keep === null ? undefined : (x, z) => keep.has(`${String(x)},${String(z)}`))
  }, [grid, chunkIndex, radius, bare])
  const runs = useMemo(() => (legacy ? [] : ledgeRuns(tiles)), [legacy, tiles])

  const meshes = useMemo(() => {
    if (swatch === null) return []
    // 같은 길이의 줄은 모양 하나를 나눠 쓴다 — 창 하나에 줄이 수십 개다
    const shapes = new Map<number, BufferGeometry>()
    return runs.map((run, i) => {
      let shape = shapes.get(run.tiles)
      if (!shape) { shape = ledgeGeometry(run.tiles, swatch); shapes.set(run.tiles, shape) }
      const mesh = new Mesh(shape, material)
      mesh.name = '턱'
      mesh.castShadow = true
      mesh.receiveShadow = true
      mesh.position.set(run.x, run.y, run.z)
      mesh.rotation.y = Math.atan2(run.dx, run.dz)
      return { key: `${String(i)}/${String(run.tiles)}`, mesh, shape }
    })
  }, [runs, swatch])

  useEffect(() => () => {
    const seen = new Set<BufferGeometry>()
    for (const m of meshes) if (!seen.has(m.shape)) { seen.add(m.shape); m.shape.dispose() }
  }, [meshes])

  if (legacy) return <LegacyLedges tiles={tiles} />
  // ⚠️ **턱이 없는 판에서는 아무것도 안 올린다.** 빈 그리기가 매 프레임 나가면
  // WebGL2로 내려가는 기계에서 `GL_INVALID_OPERATION: glDrawElements`가 뜬다
  // (실측: 사이클숍 맵 71 · `.audit/probe/cycleShop.mjs`). 실내가 전부 그렇다
  if (meshes.length === 0) return null
  return (
    <group>
      {meshes.map(({ key, mesh }) => <primitive key={key} object={mesh} />)}
    </group>
  )
}
