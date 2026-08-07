// 파트너 고르는 장면의 3D 무대 (`choose_starter/choose_starter_app.c`)
//
// **오버월드와 같은 Canvas를 쓴다.** 영속 Canvas 불변식(PLAN §3.3)이라 캔버스를
// 따로 띄울 수 없고, 배틀 무대(`battle/BattleStage`)가 이미 같은 방식이다 —
// 무대를 신오에서 멀리 떨어뜨려 놓고(`STARTER_ORIGIN`) 카메라만 옮긴다.
//
// 모델 여섯은 롬에서 구운 것이다(`tools/extract/starterScene.js`). 자리·각도·
// 카메라는 `ui/field/starterScene`이 원작 소스에서 그대로 옮겨 온 값이다.
//
// ⚠️ **빛을 안 건다.** 원작이 `NNS_G3dGlbLightColor(0, GX_RGB(31,31,31))`에
// 재질 확산·환경도 다 흰색이라 사실상 무광이다. 여기서 조명을 넣으면 그건
// 우리가 만든 명암이고, three의 광원은 씬 전체에 걸려서 신오까지 밝아진다
import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  BackSide, DoubleSide, FrontSide, Group, Mesh, MeshBasicMaterial,
  type BufferGeometry, type Material,
} from 'three'
import {
  loadStarterMesh, loadStarterSheet, sliceTexture, type ChunkMesh, type TexSheet,
} from '../chunkMesh'
import { STARTER_ORIGIN, starterStage } from '../battle/stageRefs'
import {
  BALL_POSITION, CAMERA_CHOOSE, CAMERA_OPEN, CAMERA_FRAMES, FRAME_MS, GROUND_PLACE,
  STARTER_MODEL, cameraPosition, type CameraShot,
} from '../../ui/field/starterScene'
import { starterScene } from './starterRefs'

/**
 * DS 단위 → 우리 타일.
 *
 * 원작 값이 볼 간격 82 · 카메라 거리 200쯤이라 그대로 두면 카메라가 far(200)에
 * 걸려 아무것도 안 보인다. 카메라와 무대에 **같은 배수**를 곱하므로 화면은
 * 한 픽셀도 안 달라진다
 */
const UNIT = 1 / 50

/** 뒤를 덮는 판까지의 거리(DS 단위). 볼 중 제일 먼 것보다 뒤면 된다 */
const BACKDROP = 260

interface Loaded {
  id: number
  geometry: BufferGeometry
  materials: Material[]
}

/**
 * 이 장면 전용 재질.
 *
 * `chunkMesh.makeMaterial`을 안 쓴다 — 저쪽은 `MeshLambertMaterial`이라 빛이
 * 있어야 보이고, 여기는 무광이어야 한다. 안개도 끈다: 필드 안개가 100타일쯤에서
 * 걷히는데 이 무대는 그보다 훨씬 멀리 있는 것으로 계산된다
 */
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
      fog: false,
    })
    cache.set(key, made)
    return made
  })
}

/** 원작 프레임 수만큼 0→1로 가는 값 */
function ramp(elapsedMs: number, frames: number): number {
  return Math.min(1, elapsedMs / (frames * FRAME_MS))
}

function lerpShot(a: CameraShot, b: CameraShot, t: number): CameraShot {
  return {
    pitch: a.pitch + (b.pitch - a.pitch) * t,
    distance: a.distance + (b.distance - a.distance) * t,
    target: [
      a.target[0] + (b.target[0] - a.target[0]) * t,
      a.target[1] + (b.target[1] - a.target[1]) * t,
      a.target[2] + (b.target[2] - a.target[2]) * t,
    ],
  }
}

export function StarterStage() {
  const [loaded, setLoaded] = useState<Loaded[]>([])
  const caseClosed = useRef<Group>(null)
  const caseOpen = useRef<Group>(null)
  const balls = useRef<Group>(null)

  useEffect(() => {
    let alive = true
    const wanted = [
      STARTER_MODEL.caseClosed, STARTER_MODEL.caseOpen,
      ...STARTER_MODEL.balls, STARTER_MODEL.ground,
    ]
    void Promise.all(wanted.map((id) =>
      Promise.all([loadStarterMesh(id), loadStarterSheet(id)])
        .then(([mesh, sheet]): Loaded => ({
          id, geometry: mesh.geometry, materials: materialsOf(mesh, sheet),
        }))
        .catch(() => null)))
      .then((got) => { if (alive) setLoaded(got.filter((v) => v !== null)) })
      .catch(() => { if (alive) setLoaded([]) })
    return () => { alive = false }
  }, [])

  // 카메라를 가져간다. 화면에 있는 동안만이다 — 나가면 필드가 도로 갖는다
  useEffect(() => {
    starterStage.active = true
    return () => { starterStage.active = false }
  }, [])

  useFrame(() => {
    const scene = starterScene
    // 가방이 열리기 전에는 처음 자리, 고르기 시작하면 6프레임에 걸쳐 옮겨 간다.
    // 원작 `AdvanceStarterMovement`가 선형이다
    const shot = scene.camera === 'open'
      ? CAMERA_OPEN
      : lerpShot(CAMERA_OPEN, CAMERA_CHOOSE, ramp(scene.cameraSince, CAMERA_FRAMES))
    const [ex, ey, ez] = cameraPosition(shot)
    starterStage.position.set(
      STARTER_ORIGIN.x + ex * UNIT,
      STARTER_ORIGIN.y + ey * UNIT,
      STARTER_ORIGIN.z + ez * UNIT,
    )
    starterStage.target.set(
      STARTER_ORIGIN.x + shot.target[0] * UNIT,
      STARTER_ORIGIN.y + shot.target[1] * UNIT,
      STARTER_ORIGIN.z + shot.target[2] * UNIT,
    )
    if (caseClosed.current) caseClosed.current.visible = !scene.opened
    if (caseOpen.current) caseOpen.current.visible = scene.opened
    if (balls.current) balls.current.visible = scene.opened
  })

  const by = useMemo(() => new Map(loaded.map((l) => [l.id, l])), [loaded])
  const piece = (id: number): Loaded | undefined => by.get(id)

  const ground = piece(STARTER_MODEL.ground)
  const closed = piece(STARTER_MODEL.caseClosed)
  const open = piece(STARTER_MODEL.caseOpen)

  return (
    <group position={STARTER_ORIGIN} scale={UNIT}>
      {/*
        뒤를 덮는다. 이 무대가 신오 위에 떠 있어서 안 덮으면 하늘 돔과 먼 지형이
        비친다. 원작은 필드 화면을 알파로 섞어 두지만, 우리는 이 장면에 들어오기
        전에 `FadeScreenOut`으로 이미 화면을 껐다
      */}
      <mesh position={[0, 0, -BACKDROP]} scale={[1200, 900, 1]}>
        <planeGeometry />
        <meshBasicMaterial color="#0a0d16" fog={false} side={BackSide} />
      </mesh>
      {ground && (
        <group
          position={GROUND_PLACE.position as unknown as [number, number, number]}
          scale={GROUND_PLACE.scale as unknown as [number, number, number]}
          rotation={[0, GROUND_PLACE.rotationY, 0]}
        >
          <mesh geometry={ground.geometry} material={ground.materials} />
        </group>
      )}
      <group ref={caseClosed}>
        {closed && <mesh geometry={closed.geometry} material={closed.materials} />}
      </group>
      <group ref={caseOpen} visible={false}>
        {open && <mesh geometry={open.geometry} material={open.materials} />}
      </group>
      <group ref={balls} visible={false}>
        {STARTER_MODEL.balls.map((id, at) => {
          const ball = piece(id)
          if (!ball) return null
          return (
            <group key={id} position={BALL_POSITION[at] as unknown as [number, number, number]}>
              <mesh geometry={ball.geometry} material={ball.materials} />
              <BallCursor at={at} />
            </group>
          )
        })}
      </group>
    </group>
  )
}

/**
 * 고른 볼 위의 커서.
 *
 * 원작은 스프라이트(`ev_pokeselect` 10~13번)를 화면 좌표에 놓지만, 우리는 볼에
 * 붙여 3D로 띄운다 — 카메라가 움직이는 동안 스프라이트 좌표를 다시 풀어 놓는
 * 것보다 그 자리에 붙어 있는 편이 어긋날 데가 없다.
 *
 * 원작이 고른 볼만 `psel_mb_*`를 돌린다(`UpdateSelectedPokeballAnimation` —
 * 나머지는 0프레임에 세운다). 그 곡선은 아직 안 굽는다
 */
function BallCursor({ at }: { at: number }) {
  const ref = useRef<Mesh>(null)
  useFrame(({ clock }) => {
    const on = starterScene.opened && starterScene.cursorShown && starterScene.pick === at
    const mesh = ref.current
    if (!mesh) return
    mesh.visible = on
    if (on) mesh.position.y = 26 + Math.sin(clock.elapsedTime * 6) * 2
  })
  return (
    <mesh ref={ref} position={[0, 26, 0]} rotation={[Math.PI, 0, 0]} visible={false}>
      <coneGeometry args={[5, 9, 4]} />
      <meshBasicMaterial color="#ffe9a8" fog={false} />
    </mesh>
  )
}
