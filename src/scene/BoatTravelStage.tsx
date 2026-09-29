// 배로 건너가기의 배 앱 (`cutscenes/boat_cutscene/canalave_ship.c` · `snowpoint_ship.c` · PARITY §1.26)
//
// 고정 카메라 앞에서 배 모델 하나가 애니 넷(운하 — BCA0 · BMA0 · BTA0 · BTP0) · 셋(선단 — BCA0 · BMA0 · BTA0)을 90프레임
// 한 번 돈다 (`scene/boatCutscene`의 차례). 카메라는 원점을 거리 666.9유닛(0x29AEC1) · 각 x −10750에서 보고 화각 반각 1473 ·
// 자르는 면 150~900유닛이다(`CAMERA_DEFAULT_*_CLIP`). 바탕은 검정(`Easy3D_Init`).
//
// 빛은 **떠난 맵의 지역 빛**이다 (`BoatCutscene.areaModelAttrs` — 필드가 쓰던 것을 그대로 넘긴다). 배가 뜨는 맵 여섯이 모두
// 지역 빛 0번(바깥 · 시간으로 바뀐다)이라 그 벌에서 지금 시각의 틀을 고른다(`AreaLightManager_New`). 배 모델은 재질색도
// 전역 것을 쓴다(`NNS_G3dMdlUseGlbDiff` · `Amb` · `Spec` · `Emi`) — 켠 빛만 재질 것이다
import { useEffect, useMemo, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { BackSide, MeshBasicMaterial } from 'three'
import { cinematicStage, CINEMATIC_ORIGIN } from './battle/stageRefs'
import { aimDemoCamera, DemoInstance, fxTiles, loadDemoModel, type DemoLighting, type DemoLoaded } from './demoInstance'
import { boatLive, boatTravelReady } from './boatCutscene'
import { assets, readJson } from '../data/providers/assetProvider'
import type { AreaLightTemplate } from '../import/platinum/areaLight'
import { worldState } from '../state/worldState'

/** `BOAT_TRAVEL_CUTSCENE_CAMERA_BASE_*` (`cutscenes/boat_cutscene.h`) */
const CAMERA = { dist: 0x29aec1, angleX: -10750, fov: 1473, near: 150 * 4096, far: 900 * 4096 }
/** 배가 뜨는 맵의 지역 빛 (`area_data.narc` 14 · 15 · 19 → 0 — `.audit/probe/areaLightIds.mjs`) */
const OUTDOOR_LIGHT = 0

let areaLights: Promise<AreaLightTemplate[][]> | null = null
const loadAreaLights = (): Promise<AreaLightTemplate[][]> => {
  areaLights ??= (readJson(assets(), 'data/areaLight.json') as Promise<{ files: AreaLightTemplate[][] }>)
    .then((j) => j.files)
    .catch((e: unknown) => { areaLights = null; throw e })
  return areaLights
}

/** 지금 시각의 틀 — 끝 시각이 지금보다 뒤인 첫 틀 (`GetSecondsSinceMidnight() / 2`) */
function templateAt(templates: readonly AreaLightTemplate[], hour: number): AreaLightTemplate | null {
  const now = Math.floor((hour * 3600) / 2)
  return templates.find((t) => t.end > now) ?? templates[0] ?? null
}

function lightingOf(t: AreaLightTemplate): DemoLighting {
  return {
    lights: t.lights.map((l) => (l ? { dir: [l.dir[0] / 4096, l.dir[1] / 4096, l.dir[2] / 4096] as const, color: l.color } : null)),
    global: { diffuse: t.diffuse, ambient: t.ambient, specular: t.specular, emission: t.emission },
  }
}

export function BoatTravelStage() {
  const camera = useThree((s) => s.camera)
  const [model, setModel] = useState<DemoLoaded | null>(null)
  const [lighting, setLighting] = useState<DemoLighting | null>(null)
  const name = boatLive.model

  useEffect(() => {
    let alive = true
    if (name === null) return
    void Promise.all([loadDemoModel(name), loadAreaLights().catch(() => null)]).then(([m, lights]) => {
      if (!alive) return
      const t = lights?.[OUTDOOR_LIGHT] ? templateAt(lights[OUTDOOR_LIGHT], worldState.time.gameHour) : null
      setLighting(t ? lightingOf(t) : null)
      setModel(m)
      // 모델을 못 받아도 차례는 원작 길이대로 흐른다 — 프레임 수는 원작 90이다
      boatTravelReady(m ? m.anims.clips.map((c) => c?.frames ?? 90) : [90])
    })
    return () => { alive = false }
  }, [name])

  // 자르는 면은 원작 값 — 나갈 때 되돌린다
  useEffect(() => {
    const lens = camera as { near: number, far: number, updateProjectionMatrix?: () => void }
    const near = lens.near, far = lens.far
    return () => {
      cinematicStage.active = false
      lens.near = near
      lens.far = far
      lens.updateProjectionMatrix?.()
    }
  }, [camera])

  const backdrop = useMemo(() => new MeshBasicMaterial({ color: 0x000000, fog: false, side: BackSide }), [])
  useEffect(() => () => { backdrop.dispose() }, [backdrop])

  useFrame(() => {
    const on = boatLive.phase === 'travel'
    cinematicStage.active = on
    if (!on) return
    aimDemoCamera(camera, [0, 0, 0], CAMERA.angleX, 0, fxTiles(CAMERA.dist), CAMERA.fov, fxTiles(CAMERA.near), fxTiles(CAMERA.far))
  })

  return (
    <group name="배로 건너가기" position={CINEMATIC_ORIGIN}>
      <mesh material={backdrop}>
        <sphereGeometry args={[70, 16, 12]} />
      </mesh>
      {model && (
        <DemoInstance
          name={name ?? '배'} data={model} lighting={lighting}
          pose={() => (boatLive.phase === 'travel' && boatLive.travel
            ? { pos: [0, 0, 0], scale: [1, 1, 1], frames: boatLive.travel.frames }
            : null)}
        />
      )}
    </group>
  )
}
