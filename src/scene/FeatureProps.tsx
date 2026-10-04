// 장치가 움직이는 소품을 그린다 (PARITY §7.12)
//
// 청크가 그리는 소품 목록에서 빼고 여기서 따로 세운다 (`featureProps.ts` 머리말).
//
// ⚠️ **목록을 프레임마다 묻는다.** 장치를 세우는 것은 맵에 들어설 때 도는
// **스크립트**라 React 상태가 아니다 — 렌더 중에 읽으면 처음 한 프레임에는
// 아직 없다
//
// BDSP 기믹 모델로 서는 것(`FeatureProp.gimmick` — 꿀나무)은 그 모델을 클립째 세운다(`GimmickRig`). 기믹 그룹이 없으면 원작
// 소품이 서고, 받는 동안은 아무것도 안 선다 (`gimmickModels` 머리말)
import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { AnimationMixer, Group, LoopRepeat, type AnimationAction, type Material } from 'three'
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js'
import type { GLTF } from 'three/addons/loaders/GLTFLoader.js'
import { gimmickState, loadGimmick } from './gimmickModels'
import { unifySkeletons } from './unifySkeleton'
import {
  loadDistortionPropMesh, loadDistortionPropSheet, loadPropMesh, loadPropSheet, unlitMaterial,
  type ChunkMesh,
} from './chunkMesh'
import { featureTree, materialsFor } from './ChunkModels'
import { featureProps } from './movingProps'
import { Foliage, type FoliageGroup } from './Foliage'
import { cellKey } from './plates'
import type { PropTree } from './visual/propPlan'
import { PASTORIA_WATER_MODEL } from '../engine/world/pastoriaGym'
import { world } from '../engine/map/world'

interface Loaded {
  key: string
  mesh: ChunkMesh
  materials: Material[]
  /** 잎 카드를 바꾼 입체 나무 (`ChunkModels.featureTree`) — 꿀나무만 있다 */
  tree: PropTree | null
}

/** 어느 아카이브의 몇 번인가. 두 아카이브의 번호가 겹치므로 열쇠를 합쳐 쓴다 */
const modelKey = (from: 'prop' | 'fldeff', model: number): string =>
  `${from}/${String(model)}`

const loading = new Set<string>()

/**
 * 나무를 세우는 모델들. 나무는 월드 자리로 세우므로(`FeatureTree`) **자리가 바뀌면 다시 그려야 한다** — 꿀나무는 스물한
 * 맵 어디서나 열쇠가 `꿀나무` 하나라 열쇠만 보면 맵을 옮겨도 옛 자리에 남는다
 */
const treeModels = new Set<string>()

/** 나무 밑동이 설 땅. 청크 쪽 나무와 같은 자료다 (`ChunkModels`의 `groundAt`) */
const groundAt = (x: number, z: number, near: number): number | null =>
  world.grid?.heightAtWorld(x, z, near) ?? null

export function FeatureProps() {
  /** 지금 세워야 할 것들의 열쇠 목록. 바뀔 때만 다시 그린다 */
  const [keys, setKeys] = useState<string>('')
  const [meshes, setMeshes] = useState<Map<string, Loaded>>(new Map())
  const groups = useRef(new Map<string, Group>())

  const wanted = featureProps()
  /** 기믹 모델이 받아지면 한 번 다시 그린다 — 받는 동안은 아무것도 안 선다 */
  const [, setGimmickTick] = useState(0)

  useEffect(() => {
    let alive = true
    for (const prop of featureProps()) {
      if (prop.gimmick !== undefined) {
        void loadGimmick(prop.gimmick.name).then(() => { if (alive) setGimmickTick((n) => n + 1) })
      }
      const from = prop.from ?? 'prop'
      const key = modelKey(from, prop.model)
      if (loading.has(key)) continue
      loading.add(key)
      const load = from === 'fldeff'
        ? Promise.all([loadDistortionPropMesh(prop.model), loadDistortionPropSheet(prop.model)])
        : Promise.all([loadPropMesh(prop.model), loadPropSheet(prop.model)])
      void load
        .then(([mesh, sheet]) => {
          if (!alive) return
          // 잎 카드를 입체 나무로 바꾸는 소품은 카드를 뺀 몸통을 그린다 — 청크 쪽과 같은 레시피다
          const swapped = from === 'prop' ? featureTree(prop.model, mesh, sheet) : null
          const body = swapped?.mesh ?? mesh
          // 소품은 전부 양면으로 그린다 — 청크 쪽과 같은 규칙이다
          const own = new Map<string, Material>()
          const mats = materialsFor(body, sheet, own, body.materials.map(() => true), undefined, undefined, 'prop')
          const made: Loaded = {
            key, mesh: body,
            materials: from === 'prop' && prop.model === PASTORIA_WATER_MODEL ? unlitWater(mats) : mats,
            tree: swapped?.tree ?? null,
          }
          if (made.tree !== null) treeModels.add(key)
          setMeshes((old) => new Map(old).set(key, made))
        })
        .catch(() => { loading.delete(key) })
    }
    return () => { alive = false }
  }, [keys])

  useFrame(() => {
    const now = featureProps()
    const key = now.map((p) => {
      const model = modelKey(p.from ?? 'prop', p.model)
      return `${p.key}:${model}${treeModels.has(model) || p.gimmick ? `@${String(p.x)},${String(p.z)}` : ''}`
        + (p.gimmick ? `#${p.gimmick.clip}` : '')
    }).join('|')
    if (key !== keys) setKeys(key)
    for (const p of now) {
      const g = groups.current.get(p.key)
      if (g === undefined) continue
      g.position.set(p.x, p.y, p.z)
      g.rotation.set(p.rotX ?? 0, p.rotY ?? 0, p.rotZ ?? 0)
    }
  })

  return (
    <group>
      {wanted.map((p) => {
        if (p.gimmick !== undefined) {
          const st = gimmickState(p.gimmick.name)
          if (st === 'loading') return null
          if (st !== 'missing') {
            const [dx, dy, dz] = p.gimmick.shift
            return <GimmickRig key={p.key} gltf={st} clip={p.gimmick.clip} at={[p.x + dx, p.y + dy, p.z + dz]} />
          }
        }
        const got = meshes.get(modelKey(p.from ?? 'prop', p.model))
        if (got === undefined) return null
        return (
          <group
            key={p.key}
            ref={(g) => {
              if (g === null) groups.current.delete(p.key)
              else groups.current.set(p.key, g)
            }}
            position={[p.x, p.y, p.z]}
            rotation={[p.rotX ?? 0, p.rotY ?? 0, p.rotZ ?? 0]}
          >
            <mesh name={p.key} geometry={got.mesh.geometry} material={got.materials} castShadow receiveShadow />
            {got.tree !== null && <FeatureTree id={got.key} tree={got.tree} at={[p.x, p.y, p.z]} />}
          </group>
        )
      })}
    </group>
  )
}

/**
 * 들판 체육관 물바닥의 섞는 면만 빛을 안 받게 바꾼다 (`chunkMesh.unlitMaterial`).
 *
 * 원작 그림(`gym01_w`)은 (107,214,255) · 알파 182~255의 옅은 파랑인데, 실내 조명이 곱해져 초록 · 파랑이 넘치면서 **흰 판**이
 * 됐다 — 바닥 무늬도 발판도 안 비쳤다(`pastoria-water-3p`). 테두리(`gym01_6` · `gym01_9`)는 불투명한 황토라 그대로 둔다
 */
function unlitWater(materials: Material[]): Material[] {
  return materials.map((m) => (m.transparent ? unlitMaterial(m) : m))
}

/**
 * 소품이 세우는 입체 나무 — 꿀나무 (`ChunkModels.featureTree`).
 *
 * 나무(`Foliage`)는 그루마다 화면 안팎 · 거리를 **월드 좌표로** 재므로 월드 자리에 세운다. 그래도 흔들림(`rotZ`)은 몸통과
 * 같이 받아야 해서 소품의 자리 묶음 **안에** 두고 그 자리만큼 되돌려 놓는다 — 흔들림은 몸통 축을 그대로 돈다. 흔들리는
 * 각이 작아서 판정에 쓰는 자리는 안 흔들린 자리로 둔다
 */
function FeatureTree({ id, tree, at }: { id: string, tree: PropTree, at: readonly [number, number, number] }) {
  const [x, y, z] = at
  const groups = useMemo((): FoliageGroup[] => {
    const tx = x + tree.x, tz = z + tree.z
    return [{
      key: `feature ${id}`,
      leaf: tree.leaf,
      trunk: tree.trunk,
      items: [[{
        key: cellKey(Math.floor(tx), Math.floor(tz)),
        cell: { minY: y + tree.minY, maxY: y + tree.maxY, group: 0 },
        x: tx, z: tz,
      }, 0, 0]],
    }]
  }, [id, tree, x, y, z])
  return (
    <group position={[-x, -y, -z]}>
      <Foliage groups={groups} ground={groundAt} />
    </group>
  )
}

/** 틀 클립이 바뀔 때 섞는 시간(초). 우리 값이다 — 쉼 자세에서 흔들림으로 넘어갈 때 튀지 않을 만큼 */
const CLIP_FADE = 0.25

/**
 * 클립이 있는 BDSP 기믹 한 그루 (꿀나무). 뼈째 복제해 제 믹서로 돌린다 — `Object3D.clone()`으로 복제하면 뼈가 틀을 가리킨다
 * (`NpcModels`와 같은 까닭). 고른 클립을 반복하고, 바뀌면 섞어 넘어간다
 */
function GimmickRig({ gltf, clip, at }: { gltf: GLTF, clip: string, at: readonly [number, number, number] }) {
  const root = useMemo(() => {
    const made = cloneSkinned(gltf.scene)
    // 조각이 하나라 합칠 것이 없지만 규칙대로 부른다 — 복제하는 자리는 다 뼈대를 합친다 (`unifySkeleton.test`)
    unifySkeletons(made)
    return made
  }, [gltf])
  const mixer = useMemo(() => new AnimationMixer(root), [root])
  const playing = useRef<AnimationAction | null>(null)
  useEffect(() => {
    const found = gltf.animations.find((a) => a.name === clip)
    if (found === undefined) return
    const next = mixer.clipAction(found)
    if (next === playing.current) return
    next.reset().setLoop(LoopRepeat, Infinity).play()
    if (playing.current !== null) next.crossFadeFrom(playing.current, CLIP_FADE, false)
    playing.current = next
  }, [gltf, mixer, clip])
  useEffect(() => () => {
    mixer.stopAllAction()
    mixer.uncacheRoot(root)
  }, [mixer, root])
  useFrame((_, delta) => { mixer.update(delta) })
  return <primitive object={root} position={[at[0], at[1], at[2]]} />
}
