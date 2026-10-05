// 깨어진 세계의 배틀 무대 (`arena.ts` 17번 · docs/orders/BATTLE_FX_20261004.md §6)
//
// BDSP에는 이 무대가 없다 — 깨어진 세계는 플래티넘에만 있다. 그렇다고 창기둥(`g069`)을 빌리면 기라티나와 싸우는 자리가
// 돌기둥 신전이 된다. 그래서 **걸어 들어온 그 세계의 조각으로** 무대를 세운다:
//
//   발밑    붉은 돌바닥(`s_land`)과 푸른 벼랑(`criffp`)으로 두른 섬 하나. 발판 소품과 같은 그림이다
//   둘레    원작 떠 있는 발판(`fldeff.narc` 0x7C~ · 2~19번)을 위아래 · 거꾸로 흩어 띄운다. 나무(22)는 몇 섬에만
//   하늘    필드의 소용돌이 하늘 그대로 (`DistortionSky`) — 그 층의 어둡기도 따라온다
//
// 재질은 필드 소품과 같다(`propMaterials` · 빛을 안 받는다). 원작 텍셀 색이 그대로 서야 필드에서 본 세계와 같은 곳이 된다
import { useEffect, useMemo, useState } from 'react'
import { BufferAttribute, BufferGeometry, DoubleSide, MeshBasicMaterial, RepeatWrapping, type Material, type Texture } from 'three'
import {
  loadDistortionPropMesh, loadDistortionPropSheet, sliceTexture, type ChunkMesh,
} from '../chunkMesh'
import { propMaterials } from '../propMeshes'
import { DistortionSky } from '../DistortionSky'
import { fieldScripts } from '../../engine/script/field'
import { VAR_DISTORTION_WORLD_PROGRESS } from '../../engine/script/vars'
import { world } from '../../engine/map/world'

/** 바닥 섬의 반지름 (m) — 배틀 카메라의 기본 샷이 담는 땅보다 넉넉히. `arena.ts` 17번의 `radius`가 이 안쪽이다 */
const ISLAND = 11
/** 벼랑 깊이 (m). 발판 소품의 벼랑(6칸)과 같다 */
const CLIFF = 5
/** 벼랑 그림 한 장이 덮는 길이 (m) — `criffp`는 32×32, 두 칸이다 */
const CLIFF_TILE = 2

/** 둘레에 띄울 발판 종류 (`loadDistortionPropMesh`) — 6~7칸짜리 섬들 */
const ISLES = [2, 3, 4, 5, 6, 7, 8, 9, 16, 17, 18, 19] as const
/** 나무 (`tree_sbt01`) */
const TREE = 22

/** 섬 둘레 반지름 — 세 겹 굴곡을 더해 원판으로 안 보이게 한다 */
function rim(theta: number): number {
  return ISLAND + 1.4 * Math.sin(3 * theta + 0.7) + 0.7 * Math.sin(7 * theta + 2.1) + 0.35 * Math.sin(13 * theta)
}

const SEGMENTS = 96

/** 윗면 — 부채꼴. UV는 세계 좌표 1m = 1칸이라 돌바닥이 필드와 같은 크기로 되풀이한다 */
function topGeometry(): BufferGeometry {
  const pos: number[] = [0, 0, 0]
  const uv: number[] = [0, 0]
  for (let i = 0; i <= SEGMENTS; i++) {
    const t = (i / SEGMENTS) * Math.PI * 2
    const r = rim(t)
    const x = Math.cos(t) * r
    const z = Math.sin(t) * r
    pos.push(x, 0, z)
    uv.push(x, z)
  }
  const index: number[] = []
  // 위에서 보면 반시계로 감는다 — 법선이 +y
  for (let i = 1; i <= SEGMENTS; i++) index.push(0, i + 1, i)
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3))
  g.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2))
  g.setIndex(index)
  g.computeVertexNormals()
  return g
}

/** 벼랑 — 둘레를 따라 내려간 띠. 아래로 갈수록 좁아져 떠 있는 바위처럼 보인다 */
function cliffGeometry(): BufferGeometry {
  const pos: number[] = []
  const uv: number[] = []
  let run = 0
  let px = rim(0), pz = 0
  for (let i = 0; i <= SEGMENTS; i++) {
    const t = (i / SEGMENTS) * Math.PI * 2
    const r = rim(t)
    const x = Math.cos(t) * r
    const z = Math.sin(t) * r
    run += Math.hypot(x - px, z - pz)
    px = x; pz = z
    const u = run / CLIFF_TILE
    pos.push(x, 0, z, x * 0.4, -CLIFF, z * 0.4)
    // 그림 한 장이 벼랑 전체다 — 위에서부터 붉은 입술 · 푸른 빛 띠 · 검은 몸 · 푸른 끝. 세로로 되풀이하면 필드의 발판과 다른 줄무늬가 된다
    uv.push(u, 1, u, 0)
  }
  const index: number[] = []
  for (let i = 0; i < SEGMENTS; i++) {
    const a = i * 2, b = a + 1, c = a + 2, d = a + 3
    index.push(a, c, b, b, c, d)
  }
  const g = new BufferGeometry()
  g.setAttribute('position', new BufferAttribute(new Float32Array(pos), 3))
  g.setAttribute('uv', new BufferAttribute(new Float32Array(uv), 2))
  g.setIndex(index)
  g.computeVertexNormals()
  return g
}

/** 둘레의 섬 하나 — 자리 · 돌림 · 크기 */
interface Isle { kind: number, at: [number, number, number], rot: [number, number, number], scale: number }

/**
 * 둘레 섬 배치. 매번 같은 자리에 서도록 씨앗을 고정한다 — 판마다 다르면 같은 배틀을 다시 찍을 때 배경이 바뀐다.
 * 카메라가 서는 쪽(+z)은 비워 둔다. 앞을 가리면 포켓몬이 섬에 묻힌다
 */
function isles(): Isle[] {
  let seed = 0x5d34
  const rand = (): number => {
    seed = (seed * 1103515245 + 12345) & 0x7fffffff
    return seed / 0x7fffffff
  }
  const out: Isle[] = []
  for (let i = 0; i < 22; i++) {
    // 배틀 카메라가 보는 쪽(−z) 부채꼴 안에 — 넓게 흩으면 화면 밖으로 다 빠졌다
    const theta = Math.PI + (rand() - 0.5) * Math.PI * 0.7
    const dist = 30 + rand() * 45
    const x = Math.sin(theta) * dist
    const z = Math.cos(theta) * dist
    // 바닥 섬 너머는 지평선 아래로 숨으므로 눈높이보다 위에 띄운다
    const y = 2 + rand() * 16
    // 셋에 하나는 뒤집혀 있다 — 깨어진 세계는 위아래가 없다
    const flip = rand() < 0.33 ? Math.PI : 0
    const tilt = (rand() - 0.5) * 0.5
    out.push({
      kind: rand() < 0.18 ? TREE : ISLES[Math.floor(rand() * ISLES.length)]!,
      at: [x, y, z],
      rot: [flip + tilt, rand() * Math.PI * 2, (rand() - 0.5) * 0.4],
      scale: 1.4 + rand() * 1.0,
    })
  }
  return out
}

interface Loaded { mesh: ChunkMesh, materials: Material[] }

export function DistortionArena({ onUp }: { onUp: (up: boolean) => void }) {
  const [floor, setFloor] = useState<{ top: Texture, side: Texture } | null>(null)
  const [props, setProps] = useState<Map<number, Loaded>>(new Map())
  const placed = useMemo(isles, [])

  useEffect(() => {
    let alive = true
    const kinds = [...new Set(placed.map((p) => p.kind))]
    void Promise.all([
      // 0번 발판이 바닥 그림 둘을 다 갖고 있다 (`criffp` · `s_land`)
      Promise.all([loadDistortionPropMesh(0), loadDistortionPropSheet(0)]),
      Promise.all(kinds.map((k) => Promise.all([loadDistortionPropMesh(k), loadDistortionPropSheet(k)])
        .then(([mesh, sheet]) => [k, { mesh, materials: propMaterials(mesh, sheet) }] as const)
        .catch(() => null))),
    ]).then(([[mesh, sheet], got]) => {
      if (!alive || sheet === null) return
      const pick = (tex: string): Texture | null => {
        const spec = mesh.materials.find((m) => m.tex === tex)
        const item = sheet.items.find((s) => s.tex === tex && s.pal === (spec?.pal ?? ''))
        if (!spec || !item) return null
        // 바닥은 우리 UV로 되풀이한다 — 원작 `rep` 비트와 상관없이 양쪽으로 반복
        const t = sliceTexture(sheet, item, 3)
        t.wrapS = RepeatWrapping
        t.wrapT = RepeatWrapping
        return t
      }
      const top = pick('s_land')
      const side = pick('criffp')
      if (top && side) setFloor({ top, side })
      setProps(new Map(got.filter((v) => v !== null)))
    }).catch(() => { /* 옛 설치본에는 소품이 없다 — 하늘만 선다 */ })
    return () => { alive = false }
  }, [placed])

  // 바닥이 서야 「무대가 왔다」다 — 그 전엔 `useSceneReady`가 기다린다
  useEffect(() => {
    if (floor === null) return
    onUp(true)
    return () => { onUp(false) }
  }, [floor, onUp])

  const top = useMemo(topGeometry, [])
  const cliff = useMemo(cliffGeometry, [])
  const mats = useMemo(() => floor && {
    top: new MeshBasicMaterial({ map: floor.top }),
    side: new MeshBasicMaterial({ map: floor.side, side: DoubleSide, alphaTest: 0.5 }),
  }, [floor])
  useEffect(() => () => {
    top.dispose()
    cliff.dispose()
  }, [top, cliff])
  useEffect(() => () => {
    if (!mats) return
    mats.top.dispose()
    mats.side.dispose()
    mats.top.map?.dispose()
    mats.side.map?.dispose()
  }, [mats])

  // 소용돌이 하늘은 그 층의 것이다 — 기라티나 방이면 기라티나가 내려선 뒤의 어둡기다
  const mapId = world.mapId
  return (
    <group>
      <DistortionSky mapId={mapId} progress={() => fieldScripts.vars.get(VAR_DISTORTION_WORLD_PROGRESS)} />
      {mats && (
        <>
          <mesh name="깨어진 세계 무대 바닥" geometry={top} material={mats.top} />
          <mesh name="깨어진 세계 무대 벼랑" geometry={cliff} material={mats.side} />
        </>
      )}
      {placed.map((p, i) => {
        const got = props.get(p.kind)
        if (!got) return null
        return (
          <mesh
            key={i}
            geometry={got.mesh.geometry}
            material={got.materials}
            position={p.at}
            rotation={p.rot}
            scale={p.scale}
          />
        )
      })}
    </group>
  )
}
