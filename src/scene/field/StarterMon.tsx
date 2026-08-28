// 확인을 물을 때 뜨는 미리보기 (`StartPreviewGraphicsMovement`)
//
// 원작은 고른 볼의 화면 좌표에서 **화면 한가운데로 6프레임에** 날아온다.
// 날아오는 것이 둘인데 — 흰 원(`StarterPreviewWindow`, `ev_pokeselect` 14번)과
// 그 위의 앞모습 80×80 한 컷 — **같은 인자로 같이** 움직인다. 우리는 그 한 컷
// 자리에 실제 3D 몸을 세운다.
//
// ⚠️ **가방 안에 두면 안 보인다.** 한때 열린 가방 속 `[0, -27, 36]`에 박아
// 두어서, 화면에는 볼 뒤로 새싹 끝만 몇 픽셀 나왔다 (REPAIR §30).
//
// ⚠️ **원도 여기서 그린다.** DOM은 캔버스 위라 UI에서 그리면 그 위에 서야 할
// 포켓몬을 도로 덮는다.
import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Box3, Group, Matrix4, Mesh, type PerspectiveCamera, SkinnedMesh, Vector3 } from 'three'
import { type MonBody } from '../battle/monModel'
import { useMonBody } from '../monBody'
import { OVERLAY_ORDER, asOverlay } from '../monOverlay'
import {
  PREVIEW_DISC, PREVIEW_SPRITE, SCREEN, dsToNdc, previewShot,
} from '../../ui/field/starterScene'
import { starterScene } from './starterRefs'

/**
 * 카메라 앞 몇 칸에 세우는가.
 *
 * 화면에 얹히는 그림이라 이 값 자체는 안 보인다 — 크기를 그 거리의 화각으로
 * 되돌려 재기 때문이다. 가방(가장 앞이 카메라에서 2.7칸)보다 앞이면 된다
 */
const DEPTH = 2

/** 원 뒤로 얼마나 물리는가. 같은 자리에 두면 어느 쪽이 앞인지 안 정해진다 */
const BEHIND = 0.01

export function StarterMon({ species, at }: { species: number; at: number }) {
  const group = useRef<Group>(null)
  const disc = useRef<Mesh>(null)
  const inner = useRef<Group>(null)
  const ray = useMemo(() => new Vector3(), [])
  const direction = useMemo(() => new Vector3(), [])
  // 몸이 안 오면 아래 절차형 몸이 대신 선다
  const body = useMonBody(species, { prepare: asOverlay })

  /**
   * 잰 몸 상자. 처음 보일 때 한 번만 잰다
   */
  const fit = useRef<{ span: number, center: Vector3 } | null>(null)
  useEffect(() => {
    fit.current = null
  }, [body])
  useFrame(({ camera, size }) => {
    const node = group.current
    if (node === null) return
    const on = starterScene.confirming && starterScene.pick === at
    node.visible = on
    if (!on) return

    if (body !== null && fit.current === null) fit.current = measure(body)
    const shot = previewShot(at, starterScene.previewT)
    const [nx, ny] = dsToNdc(shot.x, shot.y, size.width / size.height)
    ray.set(nx, ny, 0.5).unproject(camera)
    direction.copy(ray).sub(camera.position).normalize()
    node.position.copy(camera.position).addScaledVector(direction, DEPTH)
    // 화면에 얹힌 그림이라 늘 카메라를 마주 본다
    node.quaternion.copy(camera.quaternion)

    // 화면 높이에서 차지할 몫을 그 거리의 세상 크기로 되돌린다
    const lens = camera as PerspectiveCamera
    const view = 2 * DEPTH * Math.tan((lens.fov * Math.PI) / 360)
    const ring = disc.current
    if (ring !== null) ring.scale.setScalar((PREVIEW_DISC / SCREEN.height) * view * shot.scale / 2)
    const mon = inner.current
    const box = fit.current
    if (mon !== null && box !== null) {
      // 원작은 종에 상관없이 앞모습 한 컷 80×80에 담는다 — 그 칸을 그대로 쓴다
      const cell = (PREVIEW_SPRITE / SCREEN.height) * view * shot.scale
      const scale = cell / box.span
      mon.scale.setScalar(scale)
      // 잰 상자의 한가운데가 원 한가운데에 오게 옮긴다
      mon.position.copy(box.center).multiplyScalar(-scale)
    }
  })

  const hue = (species * 47) % 360
  return (
    <group ref={group} visible={false}>
      {/*
        미리보기 창(`ev_pokeselect` 14번)은 128×128에 색이 검정·흰색 둘뿐이고
        칠한 자리가 **지름 95의 원** 하나다 — 그래서 굽지 않고 여기서 그린다
      */}
      <mesh ref={disc} position={[0, 0, -BEHIND]} renderOrder={OVERLAY_ORDER - 1}>
        <circleGeometry args={[1, 64]} />
        <meshBasicMaterial color="#ffffff" depthTest={false} depthWrite={false} fog={false} />
      </mesh>
      {/*
        ⚠️ **여기만 빛을 건다.** 무대의 가방·볼은 원작이 무광이라 안 거는데
        (`StarterStage` 머리말), 미리보기는 원작이 2D 앞모습 한 컷이던 자리라
        우리가 3D 몸을 세운 것이다 — 안 걸면 흰 원 위에 **검은 그림자**로
        찍힌다(실측). 거리를 짧게 묶어 두어 신오까지 새지 않는다.
        전설 미리보기(`PokemonPreviewStage`)도 같은 이유로 같은 빛을 쓴다
      */}
      <pointLight position={[0.4, 0.55, 0.8]} intensity={1.7} distance={2.5} color="#e8f1ff" />
      <group ref={inner}>
        {body ? (
          <primitive object={body.root} />
        ) : (
          <mesh position={[0, 0.5, 0]} renderOrder={OVERLAY_ORDER}>
            <capsuleGeometry args={[0.32, 0.5, 8, 16]} />
            <meshBasicMaterial
              color={`hsl(${String(hue)} 52% 62%)`}
              depthTest={false}
              depthWrite={false}
              fog={false}
            />
          </mesh>
        )}
      </group>
    </group>
  )
}

/**
 * 몸이 **지금 자세로** 차지하는 상자 (뿌리 기준).
 *
 * ⚠️ **`tall`로도 기하 상자로도 안 된다.** 앞의 것은 종족 자료의 키고
 * (`height × scale`), 뒤의 것은 스킨을 안 먹인 **묶은 자세**다 — 둘 다 실제로
 * 서 있는 몸보다 크다. 실측으로 모부기가 0.83·0.79인데 화면에 선 키는 0.45라,
 * 어느 쪽으로 나눠도 원의 절반짜리가 나왔다.
 *
 * `SkinnedMesh.computeBoundingBox`가 뼈를 먹인 정점으로 다시 잰다. 정점을 다
 * 도는 값이라 **처음 보일 때 한 번만** 부른다 — 대기 동작은 크게 안 움직여서
 * 그 한 번으로 충분하다
 */
function measure(body: MonBody): { span: number, center: Vector3 } {
  const world = new Box3()
  const one = new Box3()
  body.root.updateWorldMatrix(false, true)
  body.root.traverse((object) => {
    if (!(object instanceof Mesh) || !object.visible) return
    if (object instanceof SkinnedMesh) {
      object.computeBoundingBox()
      if (object.boundingBox === null) return
      one.copy(object.boundingBox)
    } else {
      object.geometry.computeBoundingBox()
      if (object.geometry.boundingBox === null) return
      one.copy(object.geometry.boundingBox)
    }
    world.union(one.applyMatrix4(object.matrixWorld))
  })
  if (world.isEmpty()) return { span: body.tall, center: new Vector3(0, body.tall / 2, 0) }
  const local = world.applyMatrix4(new Matrix4().copy(body.root.matrixWorld).invert())
  const size = local.getSize(new Vector3())
  // ⚠️ 깊이는 안 센다 — 몸이 카메라를 마주 보므로 화면을 차지하는 것은 가로·세로다
  return { span: Math.max(size.x, size.y, 1e-3), center: local.getCenter(new Vector3()) }
}
