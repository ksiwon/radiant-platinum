// 맵 소품 하나를 **원작 클립대로** 돌린다 (PARITY §8.5).
//
// 언제 도는가를 짐작하지 않는다 — `MapPropAnimationManager_LoadPropAnimations`가
// 소품 모델을 올릴 때 애니마다 `loopCount = -1` · `looping = TRUE`로 세우고
// 첫 프레임으로 보낸다. 곧 **기본이 무한 반복**이고, 거기서 빠지는 것은 자료에
// 적힌 둘뿐이다:
//
//     flags & 1 (미룬 적재, 실측 34개)  그 자리에서 `return` — 스크립트가 튼다
//     isBicycleSlope (실측 2개)         `paused = TRUE` · `loopCount = 1`
//
// 그래서 폭포·용암·물결·에스컬레이터가 아무 신호 없이 돌고, 문 스무 종은
// 가만히 있다가 `LoadDoorAnimation`이 틀 때만 돈다.
import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import type { BufferGeometry, Group, Material, Texture } from 'three'
import { sliceTexture, type ChunkMesh, type TexSheet } from './chunkMesh'
import { DOOR_KIND } from '../import/platinum/propAnims'
import {
  FRAME_MS, nodeMatrixAt, splitByNode, uvOffsetAt, type PropAnimSet,
} from './propAnim'
import { useDoorVisualStore, type DoorVisual } from './doorVisualStore'

/**
 * 야도 체육관 단추 셋 (`pastoria_gym_*_button`).
 *
 * ⚠️ **저절로 돌면 안 된다.** 목차에는 미룬 적재가 안 걸려 있지만 체육관이
 * 이것들을 **한 번짜리로 따로** 세운다 — `PastoriaGym_UpdateButtonAnimations`가
 * 눌린 단추는 정방향으로, 나머지 둘은 역방향으로 한 번씩 돌린다. 여기서 반복을
 * 걸면 세 단추가 초당 네 번 깜빡인다
 */
const ONE_SHOT_MODELS = new Set([239, 240, 241])

/** 그림을 가진 재질만 골라 본다 — `Material` 밑동에는 `map`이 없다 */
type Mapped = Material & { map: Texture | null }
const mapped = (m: Material | undefined): Mapped | null =>
  m !== undefined && 'map' in m ? (m as Mapped) : null

interface Props {
  /** 소품 모델 번호 */
  model: number
  /** 이 배치가 놓인 칸 — 문 상태를 이 열쇠로 찾는다 (`grid.propModelAt`과 같다) */
  tile: readonly [number, number]
  mesh: ChunkMesh
  sheet: TexSheet | null
  /** 이 배치만의 재질 배열 (`materialsFor`) */
  materials: Material[]
  /**
   * 몸통 + 메운 면을 합친 기하 (`mergeByMaterial`).
   *
   * ⚠️ **노드를 안 쪼갤 때는 이걸 그려야 한다** — 몸통만 그리면 원작이 안 만든
   * 면을 메운 판이 통째로 빠진다 (`shell.ts`). 소품 배치 501개 기준 −Z가 64% ·
   * −X가 40%로 비어 있어서, 그쪽으로 돌아가면 반대편 벽 **안쪽**이 보인다
   */
  whole: BufferGeometry
  /** 메운 판만. 쪼갤 때는 몸통을 노드로 나누고 이것만 따로 한 번 더 그린다 */
  fill: BufferGeometry | null
  set: PropAnimSet
}

/**
 * 문이 지금 **몇 번째 클립**을 어디까지 돌고 있나.
 *
 * 원작은 **열 때 클립 0 · 닫을 때 클립 1**을 튼다
 * (`DoorAnimation_PlayOpenAnimation`·`PlayCloseAnimation`)
 */
function doorFrame(door: DoorVisual, ids: readonly number[], frames: (id: number) => number): {
  slot: number
  frame: number
} | null {
  const open = ids[0], shut = ids[1]
  if (open === undefined || shut === undefined) return null
  // 닫힌 자리가 곧 모델의 기본 자세다 — 되돌릴 것이 없다 (`nodeMatrixAt`)
  if (door.phase === 'closed') return null
  if (door.phase === 'open') return { slot: 0, frame: frames(open) - 1 }
  const slot = door.phase === 'opening' ? 0 : 1
  const span = frames(slot === 0 ? open : shut)
  const since = (performance.now() - door.since) / FRAME_MS
  return { slot, frame: Math.min(span - 1, Math.max(0, since)) }
}

export function AnimatedProp({ model, tile, mesh, sheet, materials, whole, fill, set }: Props) {
  const ids = set.table.props[String(model)]
  const info = set.table.models[String(model)]
  const isDoor = DOOR_KIND[model] !== undefined
  const doors = useDoorVisualStore((s) => s.doors)
  const door = useMemo(
    () => Object.values(doors).find((d) => d.x === tile[0] && d.z === tile[1]) ?? null,
    [doors, tile],
  )

  // ⚠️ **차례를 `ids`에 맞춘 채로 둔다.** 문은 「클립 0이 열기 · 1이 닫기」라
  // 자리가 곧 뜻이다 — 못 읽은 것을 걸러 내면 그 자리가 밀린다
  const clips = useMemo(() => (ids ?? []).map((id) => set.clip(id)), [ids, set])
  /** 저절로 도는가 — 미룬 적재·비탈·단추만 빠진다 */
  const loops = !set.table.deferred.includes(model)
    && !set.table.slopes.includes(model)
    && !ONE_SHOT_MODELS.has(model)

  // 관절 애니가 있으면 기하를 노드마다 쪼갠다. 나머지 84개는 안 쪼갠다
  const jointed = clips.some((c) => c?.kind === 'BCA0')
  const parts = useMemo(
    () => (jointed && info ? splitByNode(mesh, info.submeshNodes) : null),
    [jointed, info, mesh],
  )

  const groups = useRef(new Map<number, Group>())

  // BTP0가 갈아 끼울 그림을 미리 잘라 둔다 — 프레임 안에서 자르면 끊긴다
  const swaps = useMemo(() => {
    const out = new Map<string, Texture>()
    if (!sheet) return out
    for (const clip of clips) {
      if (clip?.kind !== 'BTP0') continue
      for (const track of clip.anim.tracks) {
        for (const key of track.keys) {
          const at = sheet.items.find((s) => s.tex === key.texture && s.pal === key.palette)
          const spec = mesh.materials.find((m) => m.tex === key.texture)
          if (at && !out.has(`${key.texture} ${key.palette}`)) {
            out.set(`${key.texture} ${key.palette}`, sliceTexture(sheet, at, spec?.rep ?? 3))
          }
        }
      }
    }
    return out
  }, [clips, sheet, mesh])
  useEffect(() => () => {
    for (const t of swaps.values()) t.dispose()
  }, [swaps])

  useFrame(() => {
    if (!info) return
    const free = performance.now() / FRAME_MS
    const running = isDoor && door
      ? doorFrame(door, ids ?? [], (id) => set.clip(id)?.frames ?? 1)
      : null
    for (const [slot, clip] of clips.entries()) {
      if (clip === null) continue
      let frame: number
      if (clip.kind === 'BCA0' && isDoor) {
        // 지금 도는 것이 이 자리의 클립일 때만 손댄다
        if (!running || running.slot !== slot) continue
        frame = running.frame
      } else if (loops) {
        frame = free % clip.frames
      } else {
        continue
      }

      if (clip.kind === 'BCA0') {
        for (const [node, group] of groups.current) {
          const base = info.nodes[node]
          if (!base) continue
          // ⚠️ **`decompose`로 넘기면 안 된다.** 미닫이의 마지막 프레임은 X
          // 배율이 **0**이라 행렬이 특이해지는데, three의 `decompose`는 그때
          // 배율을 (1,1,1)로 돌려준다 — 문짝이 문틀에 들어가기 직전에 도로
          // 커진다. 행렬을 그대로 얹는다
          group.matrixAutoUpdate = false
          group.matrix.copy(nodeMatrixAt(base, clip.anim, node, frame))
          group.matrixWorldNeedsUpdate = true
        }
      } else if (clip.kind === 'BTA0') {
        for (const [i, spec] of mesh.materials.entries()) {
          const name = info.materials[i]
          const map = mapped(materials[i])?.map
          if (name === undefined || !map || spec.tex === null) continue
          const [u, v] = uvOffsetAt(clip.anim, name, info.uv[i] ?? [0, 0], frame)
          map.offset.set(u, v)
        }
      } else {
        for (const [i, name] of info.materials.entries()) {
          const track = clip.anim.tracks.find((t) => t.material === name)
          const mat = mapped(materials[i])
          if (!track || !mat) continue
          let hit = track.keys[0]
          for (const k of track.keys) if (k.frame <= frame) hit = k
          const next = hit ? swaps.get(`${hit.texture} ${hit.palette}`) : undefined
          if (next && mat.map !== next) {
            mat.map = next
            mat.needsUpdate = true
          }
        }
      }
    }
  })

  if (!info || clips.every((c) => c === null)) return null
  // 노드를 안 쪼개는 84개는 지금까지 그리던 그것을 그대로 그린다
  if (!parts) return <mesh geometry={whole} material={materials} castShadow receiveShadow />
  return (
    <group>
      {[...parts].map(([node, geometry]: [number, BufferGeometry]) => (
        <group key={node} ref={(g) => { if (g) groups.current.set(node, g) }}>
          <mesh geometry={geometry} material={materials} castShadow receiveShadow />
        </group>
      ))}
      {fill !== null && <mesh geometry={fill} material={materials} castShadow receiveShadow />}
    </group>
  )
}

/** 이 소품이 애니를 갖고 있나 — 부르는 쪽이 갈래를 나눈다 */
export function hasPropAnim(set: PropAnimSet | null, model: number): boolean {
  return set !== null && set.table.props[String(model)] !== undefined
}

/** 소품 애니 표를 한 번만 받아 둔다 */
export function usePropAnimSet(load: () => Promise<PropAnimSet | null>): PropAnimSet | null {
  const [set, setSet] = useState<PropAnimSet | null>(null)
  useEffect(() => {
    let alive = true
    void load().then((got) => {
      if (alive) setSet(got)
    })
    return () => {
      alive = false
    }
  }, [load])
  return set
}
