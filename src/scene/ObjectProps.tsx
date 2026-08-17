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
import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { DoubleSide, FrontSide, Mesh, MeshBasicMaterial, type Material } from 'three'
import { npcActors, type NpcActor } from '../engine/actor/npcs'
import { PROP_KIND_BY_GFX } from '../import/platinum/fldeffProps'
import {
  loadDistortionPropMesh, loadDistortionPropOffsets, loadDistortionPropSheet, sliceTexture,
  type ChunkMesh, type TexSheet,
} from './chunkMesh'
import { groundYAt } from './distortion'
import { world } from '../engine/map/world'
import type { MapGrid } from '../engine/map/grid'

/** 이 그림이 판때기가 아니라 소품인가 */
export function propKindOf(gfx: number): number | null {
  return PROP_KIND_BY_GFX.get(gfx) ?? null
}

interface Loaded {
  kind: number
  mesh: ChunkMesh
  materials: Material[]
}

function materialsOf(mesh: ChunkMesh, sheet: TexSheet | null): Material[] {
  const cache = new Map<string, Material>()
  return mesh.materials.map((spec) => {
    const key = `${spec.tex ?? ''}/${spec.pal ?? ''}/${String(spec.rep)}/${String(spec.a)}/${String(spec.f)}`
    const hit = cache.get(key)
    if (hit) return hit
    const item = sheet?.items.find((s) => s.tex === spec.tex && s.pal === (spec.pal ?? ''))
    const translucent = spec.a < 31
    const made = new MeshBasicMaterial({
      map: item && sheet ? sliceTexture(sheet, item, spec.rep) : null,
      vertexColors: true,
      // 4세대 텍스처는 색 0을 투명으로 쓴다
      alphaTest: translucent ? 0 : 0.5,
      transparent: translucent,
      opacity: translucent ? spec.a / 31 : 1,
      depthWrite: !translucent,
      side: spec.f === 3 ? DoubleSide : FrontSide,
    })
    cache.set(key, made)
    return made
  })
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

  const [loaded, setLoaded] = useState<readonly Loaded[]>([])
  const [offsets, setOffsets] = useState<readonly (readonly number[])[]>([])

  /** 이 맵이 쓰는 종류만 받는다. 열을 다 받을 이유가 없다 */
  const kinds = useMemo(
    () => [...new Set(placed.map((p) => p.kind))].sort((a, b) => a - b),
    [placed],
  )

  useEffect(() => {
    let alive = true
    if (kinds.length === 0) {
      setLoaded([])
      return
    }
    void Promise.all([
      loadDistortionPropOffsets(),
      Promise.all(kinds.map((kind) =>
        Promise.all([loadDistortionPropMesh(kind), loadDistortionPropSheet(kind)])
          .then(([mesh, sheet]): Loaded => ({ kind, mesh, materials: materialsOf(mesh, sheet) }))
          .catch(() => null))),
    ])
      .then(([off, got]) => {
        if (!alive) return
        setOffsets(off)
        setLoaded(got.filter((v): v is Loaded => v !== null))
      })
      .catch(() => {
        if (alive) setLoaded([])
      })
    return () => {
      alive = false
    }
  }, [kinds])

  const byKind = useMemo(() => new Map(loaded.map((l) => [l.kind, l])), [loaded])
  const meshes = useRef<(Mesh | null)[]>([])

  useFrame(() => {
    for (const [i, at] of placed.entries()) {
      const mesh = meshes.current[i]
      if (!mesh) continue
      // ⚠️ **숨은 사람은 안 세운다.** 사천왕 방문과 로토무 방 벽은 이야기가
      // 진행되면 플래그로 사라진다 — 그 플래그를 보는 것이 `visible`이다
      mesh.visible = at.actor.visible
      if (!mesh.visible) continue
      const off = offsets[at.kind] ?? [0, 0, 0]
      const x = at.actor.x + 0.5
      const z = at.actor.z + 0.5
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
