// 안 그려지던 물체 열 종 (PARITY §1.27)
//
// 배치된 그림 172종 중 열 종은 화면에 **아무것도 안 세우고 있었다.** 간판
// 여섯(212건) · 눈덩이(19) · 책(7) · 사천왕 방문(8) · 로토무 방 벽(1),
// 다 합쳐 배치 247건이다.
//
// ⚠️ **판때기를 못 찾은 것이 아니라 원작에 판때기가 없다.** 원작에서 이 열
// 종은 **3D 오브젝트**라 2D 그림표(`mmodel.narc`)에 아예 없고, 렌더러 표가
// 사람 렌더러가 아닌 쪽으로 보낸다 (`ov5_021FAF40.c`). 그래서 `npcSprite`가
// `null`을 주고 `NpcSprites`가 조용히 건너뛰었다.
//
// ⚠️ **돌지 않는다.** 원작이 자리만 주고 그린다 —
// `Simple3D_DrawRenderObjWithPos`에 회전 인자가 없다 (`ov5_021F1310`).
// 배치표의 `facing`은 말을 걸 때 쓰는 값이지 모델을 돌리는 값이 아니다.
//
// ⚠️ **길은 이미 막고 있었다.** 안 보여도 통행은 `actor/obstacles`가 맡는다
// (§1.28) — 눈덩이 미는 것도 얼음 미끄럼도 그대로 돌고 있었다. 없던 것은 몸뿐이다.
//
// ⚠️ **BDSP 위에서도 같은 자리다.** BDSP 방 · 지역 · 던전은 원작 칸 좌표 그대로
// 지어져(`BdspRoom` · `BdspField` 머리말) 옮길 오프셋이 없고, 땅 높이도 원작과
// 같다 — 여기 세우는 자리(`groundYAt`)를 그대로 쓴다. 다만 **간판은 BDSP 지역에
// 구워져 있는 곳이 많다**(`isBakedSign`) — 그 자리에서만 원작 간판을 안 세운다.
// 실측(바깥 간판 189곳 · 칸 한가운데에서 1.2칸 안): 간판 26/29 · 우편함 2/2 ·
// 게시판 59/64(`Guide`) · 화살표 70/72 · 체육관 8/8 · 팁 14/14, 합 179곳이 BDSP에
// 있다. 나머지 열 곳(2~13칸 떨어짐)은 원작 것을 세운다 — 맵 통째로 내리면 빠진다
import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { InstancedMesh, Matrix4, Mesh, Vector3, type Material, type Object3D } from 'three'
import { npcActors, type NpcActor } from '../engine/actor/npcs'
import { PROP_KIND_BY_GFX } from '../import/platinum/fldeffProps'
import { useLoadedProps } from './propMeshes'
import { groundYAt } from './distortion'
import { world } from '../engine/map/world'
import type { MapGrid } from '../engine/map/grid'

/**
 * BDSP가 구워 둔 간판 · 우편함 · 게시판 재질 (`SignBoard_0x` · `Boardletter` · `Boardnumber` · `Post_01` · `Guide_0x` ·
 * `GuideLetter_01`). 게시판 빛(`GuideLight`) · 벽보(`Poster`)는 아니다
 */
export function isBakedSign(m: Material): boolean {
  return /SignBoard|Boardletter|Boardnumber|_Post_\d|_Guide(Letter)?_\d/.test(m.name)
}

/** 원작 간판 여섯 종(29~34 — 간판 · 우편함 · 게시판 · 화살표 · 체육관 · 팁)만 BDSP 것과 견준다 */
const SIGN_KINDS = new Set([29, 30, 31, 32, 33, 34])

/** 원작 간판 칸 한가운데와 BDSP 간판 한가운데가 이만큼(칸) 안이면 같은 간판이다 — 실측 짝은 다 이 안이다 */
const SIGN_MATCH = 1.2

/** 지금 씬에 붙은 BDSP 층들의 간판 자리 (x, z) */
const bakedSigns = new Set<readonly [number, number]>()

/**
 * BDSP 층이 붙을 때 그 안의 간판 자리를 등록한다. 돌려준 함수로 뗀다.
 * 씬이 제자리(원점)에 놓인 채로 부른다 — BDSP 층은 행렬 원점에 그대로 선다
 */
export function holdBdspSigns(root: Object3D): () => void {
  root.updateMatrixWorld(true)
  const mine: (readonly [number, number])[] = []
  const at = new Matrix4()
  const c = new Vector3()
  root.traverse((o) => {
    if (!(o instanceof Mesh)) return
    const mats = (Array.isArray(o.material) ? o.material : [o.material]) as Material[]
    if (!mats.some(isBakedSign)) return
    o.geometry.computeBoundingBox()
    const box = o.geometry.boundingBox
    if (!box) return
    box.getCenter(c)
    const center = c.clone()
    if (o instanceof InstancedMesh) {
      for (let i = 0; i < o.count; i++) {
        o.getMatrixAt(i, at)
        const w = center.clone().applyMatrix4(at.premultiply(o.matrixWorld))
        mine.push([w.x, w.z])
      }
    } else {
      const w = center.applyMatrix4(o.matrixWorld)
      mine.push([w.x, w.z])
    }
  })
  for (const p of mine) bakedSigns.add(p)
  return () => { for (const p of mine) bakedSigns.delete(p) }
}

/** 이 자리(월드 x, z)에 BDSP가 구운 간판이 있는가 */
export function bakedSignNear(x: number, z: number): boolean {
  for (const [sx, sz] of bakedSigns) if (Math.hypot(sx - x, sz - z) < SIGN_MATCH) return true
  return false
}

/** 이 그림이 판때기가 아니라 소품인가 */
function propKindOf(gfx: number): number | null {
  return PROP_KIND_BY_GFX.get(gfx) ?? null
}

interface Props {
  grid: MapGrid
  layer: number
  /** 맵이 바뀌면 배치를 다시 훑는다 */
  mapId: number
}

export function ObjectProps({ grid, layer, mapId }: Props) {
  /**
   * 이 맵에서 소품으로 서야 하는 사람들.
   *
   * ⚠️ **`info.sprite`가 아니라 `gfx`를 본다** — 자리표시자(`OBJ_EVENT_GFX_VAR_*`)는
   * 변수로 실제 그림이 정해지고, 그 결과가 간판일 수 있다
   */
  const [placed, setPlaced] = useState<readonly { actor: NpcActor, kind: number }[]>([])
  useEffect(() => {
    const out: { actor: NpcActor, kind: number }[] = []
    for (const actor of npcActors.list) {
      const kind = propKindOf(actor.gfx)
      if (kind !== null) out.push({ actor, kind })
    }
    setPlaced(out)
  }, [mapId])

  /** 이 맵이 쓰는 종류만 받는다. 열을 다 받을 이유가 없다 */
  const kinds = useMemo(
    () => [...new Set(placed.map((p) => p.kind))].sort((a, b) => a - b),
    [placed],
  )
  const { byKind, offsets } = useLoadedProps(kinds)

  const meshes = useRef<(Mesh | null)[]>([])

  useFrame(() => {
    for (const [i, at] of placed.entries()) {
      const mesh = meshes.current[i]
      if (!mesh) continue
      const x = at.actor.x + 0.5
      const z = at.actor.z + 0.5
      // ⚠️ **숨은 사람은 안 세운다.** 사천왕 방문과 로토무 방 벽은 이야기가
      // 진행되면 플래그로 사라진다 — 그 플래그를 보는 것이 `visible`이다.
      // BDSP가 그 자리에 간판을 구워 두었으면 두 벌이 되므로 안 세운다
      mesh.visible = at.actor.visible && !(SIGN_KINDS.has(at.kind) && bakedSignNear(x, z))
      if (!mesh.visible) continue
      const off = offsets[at.kind] ?? [0, 0, 0]
      mesh.position.set(
        x + off[0]!,
        groundYAt(grid, world.mapId, x, z, layer, at.actor.y) + off[1]!,
        z + off[2]!,
      )
    }
  })

  if (placed.length === 0) return null
  return (
    <group>
      {placed.map((at, i) => {
        const got = byKind.get(at.kind)
        if (got === undefined) return null
        return (
          <mesh
            key={`${String(at.actor.localID)}/${String(i)}`}
            ref={(m) => { meshes.current[i] = m }}
            geometry={got.mesh.geometry}
            material={got.materials}
            visible={false}
          />
        )
      })}
    </group>
  )
}
