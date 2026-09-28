// 깨어진 세계로 빨려 드는 문 (`dw_warp/dw_warp.c` · PARITY §8.15)
//
// 창기둥에서 난천이 「서둘러야 해」 하고 화면이 검게 닫힌 뒤 도는 필드 밖 앱이다. 원작 그대로다:
//
//   모델   `titledemo.narc` 16(`op_ana` — 노드 일곱 · 재질 여덟)을 원점에, BCA0 18 · BTA0 17을 한 틱에 한 프레임(240, 돈다)
//   카메라 원점을 10칸(160유닛) 위에서 거의 곧장 내려다본다(각 `0x10000 − 0x3fef`). 화각은 반각 4004에서 틱마다
//          `p >> 8`씩 줄고 `p`는 60·256에서 0x80씩 준다(16·256 밑으로 안 간다) — 문이 점점 다가온다
//   차례   검은 데서 16단계로 밝아지고(`StartScreenFade … BRIGHTNESS_IN, 16, 1`) → 86틱 동안 돌며 16번째 틱에
//          `SEQ_SE_PL_SYUWA2` → 20단계로 검게 닫히고 → 닫히면 끝
//
// 빛은 안 쓴다 — 원작 빛(0,0,−1)이 누운 문의 면과 직각이라 확산이 0이고 전역 색이 다 31이다. 텍스처 색 그대로가 가깝다.
// 바탕은 검정이다(`G3X_SetClearColor(GX_RGB(0, 0, 0) …)`).
//
// ⚠️ **틱은 1/60초로 센다** — 원작 본 루프는 1/30초지만 우리 엔진 전체가 1/60초로 세므로 그것을 따른다
// (COMPLETION_20260928 §0의 갈림길)
import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import type { BufferGeometry, Group, Material, Texture } from 'three'
import { DoubleSide, MeshBasicMaterial } from 'three'
import { cinematicStage, CINEMATIC_ORIGIN } from './battle/stageRefs'
import { loadDemoAnims, loadDemoMesh, loadDemoSheet, type ChunkMesh } from './chunkMesh'
import { propMaterials } from './propMeshes'
import { markSeeThrough } from './fx/seeThrough'
import { nodeMatrixAt, splitByNode, uvOffsetAt, type PropClip } from './propAnim'
import { fadeDone, startFade } from '../engine/script/fade'
import { music } from '../engine/audio/music'
import { useDwWarpStore } from '../state/dwWarpStore'

/** `(22 * 0xffff) / 360` — 원작 화각은 반각이고 한 바퀴가 65536이다 */
const FOV_START = 4004
const PERSP_START = 60 << 8
const PERSP_STEP = 0x80
const PERSP_MIN = 16 << 8
/** `DWARP_ANM_DURATION` · `DWARP_SND_EFFECT_DELAY` */
const LOOP_TICKS = 85
const SE_DELAY = 15
const SEQ_SE_PL_SYUWA2 = 1491
/** 카메라 거리 160유닛 = 10칸, 기울기 `0x3fef` (90°에서 17 모자란다) */
const CAMERA_DIST = 10
const CAMERA_PITCH = (0x3fef / 65536) * Math.PI * 2

/** 원작 화각(반각 · 65536 한 바퀴) → three의 세로 전각(도) */
const fovDegrees = (half: number): number => (2 * half * 360) / 65536

type Mapped = Material & { map: Texture | null }
const mapped = (m: Material | undefined): Mapped | null =>
  m !== undefined && 'map' in m ? (m as Mapped) : null

/** 연출 한 벌의 진행 (`DistortionWorldWarp`) */
interface Warp {
  state: 0 | 1 | 2 | 3
  frameCnt: number
  seCnt: number
  fov: number
  persp: number
  anim: number
  acc: number
}

export function DwWarpStage() {
  const finish = useDwWarpStore((s) => s.finish)
  const [model, setModel] = useState<{ mesh: ChunkMesh, materials: Material[], clips: (PropClip | null)[], info: NonNullable<Awaited<ReturnType<typeof loadDemoAnims>>>['info'] } | null>(null)
  const warp = useRef<Warp>({ state: 0, frameCnt: 0, seCnt: 0, fov: FOV_START, persp: PERSP_START, anim: 0, acc: 0 })
  const joints = useRef(new Map<number, Group>())

  useEffect(() => {
    let alive = true
    void Promise.all([loadDemoMesh('portal'), loadDemoSheet('portal'), loadDemoAnims('portal')])
      .then(([mesh, sheet, anims]) => {
        if (!alive || anims === null) return
        const materials = propMaterials(mesh, sheet)
        for (const m of materials) {
          (m as MeshBasicMaterial).fog = false
          // 원작은 윤곽을 안 그린다(`G3X_EdgeMarking(FALSE)`) — 윤곽 후처리에서 뺀다
          markSeeThrough(m, true)
        }
        // 그림 알파(A3I5 · A5I3)로 비치는 재질 — 고리와 성운이 겹쳐 보여야 한다 (`demoModels`의 `blend`)
        for (const i of anims.blend) {
          const m = materials[i]
          if (!m) continue
          m.transparent = true
          m.depthWrite = false
          m.alphaTest = 0.01
          m.needsUpdate = true
        }
        setModel({ mesh, materials, clips: anims.clips, info: anims.info })
      })
      // 모델이 없어도 연출의 길이와 페이드는 원작대로 흐른다 — 스크립트가 영영 서지 않게
      .catch(() => { /* 문만 안 보인다 */ })
    return () => { alive = false }
  }, [])

  // 앱이 설 때 — 카메라를 가져오고 검은 데서 밝힌다 (`DWWarp_Init`)
  useEffect(() => {
    cinematicStage.active = true
    cinematicStage.target.copy(CINEMATIC_ORIGIN)
    cinematicStage.position.set(
      CINEMATIC_ORIGIN.x,
      CINEMATIC_ORIGIN.y + CAMERA_DIST * Math.sin(CAMERA_PITCH),
      CINEMATIC_ORIGIN.z + CAMERA_DIST * Math.cos(CAMERA_PITCH),
    )
    cinematicStage.fov = fovDegrees(FOV_START)
    startFade(16, 1, 1, 0)
    return () => { cinematicStage.active = false }
  }, [])

  const parts = useMemo(
    () => (model ? splitByNode(model.mesh, model.info.submeshNodes) : null),
    [model],
  )
  const backdrop = useMemo(() => new MeshBasicMaterial({ color: 0x000000, fog: false, side: DoubleSide }), [])
  useEffect(() => () => { backdrop.dispose() }, [backdrop])

  useFrame((_, dt) => {
    const w = warp.current
    w.acc += Math.min(dt, 0.25) * 60
    let ticks = Math.floor(w.acc)
    w.acc -= ticks
    while (ticks-- > 0) {
      // `DWWarp_Update` — 그리기 전에 애니를 한 프레임 민다
      w.anim++
      // `DWWarp_Main`
      if (w.state === 0) {
        if (fadeDone()) w.state = 1
      } else if (w.state === 1) {
        if (w.seCnt === SE_DELAY) void music.playEffect(SEQ_SE_PL_SYUWA2)
        w.seCnt++
        w.frameCnt++
        if (w.frameCnt > LOOP_TICKS) w.state = 2
      } else if (w.state === 2) {
        startFade(20, 1, 0, 0)
        w.state = 3
      } else if (fadeDone()) {
        finish()
        return
      }
      // `DWWarp_CameraMove` — 끝나는 틱만 빼고 늘 돈다
      w.fov -= w.persp >> 8
      w.persp = Math.max(PERSP_MIN, w.persp - PERSP_STEP)
    }
    cinematicStage.fov = fovDegrees(Math.max(1, w.fov))

    if (!model) return
    for (const clip of model.clips) {
      if (clip === null) continue
      const frame = w.anim % clip.frames
      if (clip.kind === 'BCA0') {
        for (const [node, group] of joints.current) {
          const base = model.info.nodes[node]
          if (!base) continue
          group.matrixAutoUpdate = false
          group.matrix.copy(nodeMatrixAt(base, clip.anim, node, frame))
          group.matrixWorldNeedsUpdate = true
        }
      } else if (clip.kind === 'BTA0') {
        for (const [i, spec] of model.mesh.materials.entries()) {
          const name = model.info.materials[i]
          const map = mapped(model.materials[i])?.map
          if (name === undefined || !map || spec.tex === null) continue
          const [u, v] = uvOffsetAt(clip.anim, name, model.info.uv[i] ?? [0, 0], frame)
          map.offset.set(u, v)
        }
      }
    }
  })

  return (
    <group name="깨어진 세계 문" position={CINEMATIC_ORIGIN}>
      {/* 바탕 — 원작의 지우는 색(검정) */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -40, 0]} material={backdrop}>
        <planeGeometry args={[400, 400]} />
      </mesh>
      {model && parts && [...parts].map(([node, geometry]: [number, BufferGeometry]) => (
        <group key={node} ref={(g) => { if (g) joints.current.set(node, g) }}>
          <mesh geometry={geometry} material={model.materials} />
        </group>
      ))}
    </group>
  )
}
