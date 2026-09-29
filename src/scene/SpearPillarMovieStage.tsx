// 창기둥 영상의 무대 (`overlay100` · PARITY §8.15 · `engine/world/spearPillarMovie`)
//
// 차례가 그린 순간(`movieLive.movie.shown`)을 그대로 옮긴다 — 물체마다 자리 · 크기와 애니 칸의 프레임:
//
//   BCA0 관절   노드 무리의 행렬 (`nodeMatricesAt` — 원작 사슬 그대로)
//   BTA0 UV    그림 밀기 (`uvOffsetAt`)
//   BTP0 그림   주인공 · 태홍 · 디아루가 · 펄기아의 그림 갈아 끼우기 (걸음 무늬 `Unk_ov100_021D5344`가 프레임을 정한다)
//   BMA0 재질   알파(구슬의 깜빡임 · 호수 셋의 빛무리 · 기둥이 무너지며 사라짐)와 은하의 확산색
//   BVA0 보임   검은 구슬의 번개 노드
//
// 빛은 원작 두 빛이다 (`ov100_021D47A0`) — 0번 흰빛 (0,−1,−1) · 1번 (23,23,25) (−2043,−3548,110). 재질마다 켠 빛과
// 확산 · 환경색(`demoModels`의 `light`)으로 원작 하드웨어 셈을 한다: 색 = Σ(환경 × 빛색 + 확산 × 빛색 × max(0, −빛·법선)),
// 채널마다 31에서 자른다. 환경 31 × 흰빛이면 늘 가득이라 그림 색 그대로다 — 실제로 명암이 드는 것은 1번 빛만 켠 땅과 기둥뿐이다
// (`.audit/probe/movieLights.mjs`).
//
// 카메라는 겨눔점 둘레의 원작 셈이다(`Camera_AdjustPositionAroundTarget`) — 거리 · 각 · 화각 반각 · 자르는 면.
// 바탕은 검정이다(`G3X_SetClearColor`를 안 부른다 — 초기값 검정 · 호수는 BG 바탕 0x421).
//
// ⚠️ **위 화면(2D)은 안 그린다.** 원작 장면 1 · 2는 3D를 아래 화면으로 옮기고(`ov100_021D4DC8(1)`) 위 화면에 물결치는 BG와
// 구슬 셋의 스프라이트를 띄운다. 우리는 한 화면이라 3D만 보인다 (PARITY §8.15)
import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { BackSide, MeshBasicMaterial } from 'three'
import { cinematicStage, CINEMATIC_ORIGIN } from './battle/stageRefs'
import { afterimageState } from './fx/afterimage'
import { aimDemoCamera, DemoInstance, fxTiles, loadDemoModel, type DemoLighting, type DemoLoaded, type DemoPose } from './demoInstance'
import { movieLive } from './spearPillarMovie'
import { ANIM_FRAMES, movieModels, type MovieModel } from '../engine/world/spearPillarMovie'
import { useSaveStore } from '../state/saveStore'

const FX = 4096

/** 원작 두 빛 (`ov100_021D47A0`) — 방향은 빛이 나아가는 쪽, 색은 RGB5 */
const LIGHTING: DemoLighting = {
  lights: [
    { dir: norm([0, -FX, -FX]), color: [31, 31, 31] },
    { dir: norm([-2043, -3548, 110]), color: [23, 23, 25] },
  ],
}

function norm(v: readonly [number, number, number]): [number, number, number] {
  const l = Math.hypot(v[0], v[1], v[2])
  return [v[0] / l, v[1] / l, v[2] / l]
}

/** 차례가 그린 순간의 그 물체 — fx32 자리 · 크기 · 프레임을 칸 · 배율 · 정수 프레임으로 (끝에 닿은 애니는 마지막 프레임) */
function poseOf(key: string, model: MovieModel): DemoPose | null {
  const me = movieLive.movie?.shown.objects.find((o) => o.key === key)
  if (!me) return null
  const counts = ANIM_FRAMES[model]
  return {
    pos: [fxTiles(me.pos[0]), fxTiles(me.pos[1]), fxTiles(me.pos[2])],
    scale: [me.scale[0] / FX, me.scale[1] / FX, me.scale[2] / FX],
    frames: me.frame.map((f, slot) => Math.max(0, Math.min((counts[slot] ?? 1) - 1, Math.floor(f / FX)))),
  }
}

/** 무대 — 모델을 다 받으면 차례가 선다 (`movieLive.ready`) */
export function SpearPillarMovieStage() {
  const heroine = useSaveStore((s) => s.trainer.gender === 'girl')
  const [loaded, setLoaded] = useState<ReadonlyMap<MovieModel, DemoLoaded>>(new Map())
  const [cast, setCast] = useState<readonly (readonly [string, MovieModel])[]>([])
  const camera = useThree((s) => s.camera)

  useEffect(() => {
    let alive = true
    const names = [...new Set([0, 1, 2].flatMap((s) => movieModels(s as 0 | 1 | 2, heroine)))]
    void Promise.all(names.map((name) => loadDemoModel(name).then((d) => [name, d] as const))).then((rows) => {
      if (!alive) return
      const map = new Map<MovieModel, DemoLoaded>()
      for (const [name, d] of rows) if (d) map.set(name, d)
      setLoaded(map)
      // 못 받은 것이 있어도 연다 — 그 물체만 안 보인다
      movieLive.ready = true
    })
    return () => { alive = false }
  }, [heroine])

  // 카메라를 가져온다 — 자르는 면은 원작 값, 나갈 때 되돌린다
  useEffect(() => {
    cinematicStage.active = true
    const lens = camera as { near: number, far: number, updateProjectionMatrix?: () => void }
    const near = lens.near, far = lens.far
    return () => {
      cinematicStage.active = false
      afterimageState.on = false
      lens.near = near
      lens.far = far
      lens.updateProjectionMatrix?.()
    }
  }, [camera])

  const backdrop = useMemo(() => new MeshBasicMaterial({ color: 0x000000, fog: false, side: BackSide }), [])
  useEffect(() => () => { backdrop.dispose() }, [backdrop])

  const castKey = useRef('')
  useFrame(() => {
    const m = movieLive.movie
    afterimageState.on = m?.afterimage === true
    const key = m ? `${String(m.scene)}|${[...m.objects.entries()].map(([k, o]) => `${k}:${o.model}`).join(',')}` : ''
    if (key !== castKey.current) {
      castKey.current = key
      setCast(m ? [...m.objects.entries()].map(([k, o]) => [k, o.model] as const) : [])
    }
    const cam = m?.shown.cam
    if (!cam || cam.dist === 0) return
    aimDemoCamera(
      camera, [fxTiles(cam.target[0]), fxTiles(cam.target[1]), fxTiles(cam.target[2])], cam.angle[0], cam.angle[1],
      fxTiles(cam.dist), cam.fov, fxTiles(cam.near), fxTiles(cam.far),
    )
  })

  return (
    <group name="창기둥 영상" position={CINEMATIC_ORIGIN}>
      {/* 바탕 — 지우는 색(검정) */}
      <mesh material={backdrop}>
        <sphereGeometry args={[55, 16, 12]} />
      </mesh>
      {cast.map(([key, model]) => {
        const data = loaded.get(model)
        return data
          ? <DemoInstance key={`${key}:${model}`} name={key} data={data} pose={() => poseOf(key, model)} lighting={LIGHTING} />
          : null
      })}
    </group>
  )
}
