// 원작 입자를 배틀 무대에 그린다 (PARITY §7.3).
//
// 자리·색·알파를 내는 것은 `splParticles`의 `SplShow`이고 여기는 **그것을 GPU에
// 얹는 일만** 한다. 묶음마다 사각형 하나를 인스턴스로 뿌리고, 셰이더는
// 「가운데를 뷰로 옮기고 두 축을 더한다」뿐이다.
//
// ⚠️ **TSL 노드 재질이다.** 이 저장소는 `WebGPURenderer`로 그리므로 날 GLSL
// `ShaderMaterial`은 WebGPU 길에서 아예 안 선다 — 노드로 쓰면 WebGPU와 WebGL2
// 두 길에서 같은 그림이 나온다 (`scene/fx/cutInWarp`와 같은 방식).
//
// ⚠️ **깊이를 안 쓴다.** 원작이 `G3X_AlphaBlend(TRUE)`로 섞고 깊이를 안 적는다.
// 그래서 그리는 차례가 곧 그림이고, 그 차례는 `renderOrder`로 온다.
import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  BufferAttribute, DoubleSide, DynamicDrawUsage, InstancedBufferAttribute,
  InstancedBufferGeometry, NormalBlending, type Mesh, type Texture,
} from 'three'
import { MeshBasicNodeMaterial } from 'three/webgpu'
import {
  attribute, cameraProjectionMatrix, modelViewMatrix, positionGeometry,
  texture, varying, vec4,
} from 'three/tsl'
import { splTexture } from '../../engine/battle/spl/texture'
import { SplShow, type SplCue, type SplGroup } from './splDraw'
import { splBasis, type Vec3 } from './splPlace'

/** 원작이 60Hz 태스크로 돈다 — 기계가 빨라도 입자가 빨리 날면 안 된다 */
const STEP = 1 / 60
/** 탭에서 돌아왔을 때 한꺼번에 앞으로 튀지 않게 (`GameLoop`과 같은 값) */
const MAX_DELTA = 0.25

/** 한 묶음이 쥐고 있는 GPU 물건 */
interface Rig {
  group: SplGroup
  geometry: InstancedBufferGeometry
  material: MeshBasicNodeMaterial
  map: Texture
  attrs: readonly InstancedBufferAttribute[]
}

/**
 * 사각형 하나.
 *
 * 꼭짓점 차례와 UV는 원작 `SPLUtil_DrawXYPlane` 그대로다 — 왼쪽 위가 (0,0)이고
 * 시계 방향이다. `quad`(=`polygonX/Y`)는 **축에 함께 곱해지므로** 자리에 굽고,
 * `uvSpan`(=`textureS/T`)은 되풀이·뒤집기를 담아 UV에 굽는다
 */
function quadGeometry(group: SplGroup): InstancedBufferGeometry {
  const [qx, qy] = group.quad
  const [su, sv] = group.uvSpan
  const g = new InstancedBufferGeometry()
  g.setAttribute('position', new BufferAttribute(new Float32Array([
    qx - 1, qy + 1, 0,
    qx + 1, qy + 1, 0,
    qx + 1, qy - 1, 0,
    qx - 1, qy - 1, 0,
  ]), 3))
  g.setAttribute('uv', new BufferAttribute(new Float32Array([
    0, 0,
    su, 0,
    su, sv,
    0, sv,
  ]), 2))
  g.setIndex([0, 1, 2, 0, 2, 3])
  g.instanceCount = 0
  return g
}

function buildRig(group: SplGroup): Rig {
  const geometry = quadGeometry(group)
  const attrs = [
    ['splCenter', group.center, 3],
    ['splAxisX', group.axisX, 3],
    ['splAxisY', group.axisY, 3],
    ['splColor', group.color, 3],
    ['splAlpha', group.alpha, 1],
  ] as const
  const made = attrs.map(([name, array, size]) => {
    const a = new InstancedBufferAttribute(array, size)
    a.setUsage(DynamicDrawUsage)
    geometry.setAttribute(name, a)
    return a
  })

  const map = splTexture(group.texture)
  const material = new MeshBasicNodeMaterial()
  material.transparent = true
  material.depthWrite = false
  // 원작이 `GX_CULL_NONE`이다 — 폴리곤 갈래는 뒤에서도 보여야 한다
  material.side = DoubleSide
  material.blending = NormalBlending

  // ⚠️ **타입 인자를 손으로 준다.** `attribute(name, 'vec3')`은 둘째 인자에서
  // 리터럴을 못 좁혀 `Node<string>`이 나오고, 그러면 `vec4(...)`가 안 받는다
  const center = attribute<'vec3'>('splCenter', 'vec3')
  const axisX = attribute<'vec3'>('splAxisX', 'vec3')
  const axisY = attribute<'vec3'>('splAxisY', 'vec3')
  const corner = positionGeometry
  // 가운데만 뷰로 옮기고, 두 축은 이미 뷰 공간 값이라 그대로 더한다
  // (`SPLDraw_Billboard`가 `G3_Identity()` 뒤에 뷰 자리 행렬을 통째로 싣는 것)
  const view = modelViewMatrix.mul(vec4(center, 1))
    .add(vec4(axisX.mul(corner.x).add(axisY.mul(corner.y)), 0))
  material.vertexNode = cameraProjectionMatrix.mul(view)

  const texel = texture(map)
  const tint = varying(attribute<'vec3'>('splColor', 'vec3'))
  const alpha = varying(attribute<'float'>('splAlpha', 'float'))
  material.colorNode = vec4(texel.rgb.mul(tint), texel.a.mul(alpha))

  return { group, geometry, material, map, attrs: made }
}

/**
 * 기술 한 번의 입자.
 *
 * @param cues 대본이 적어 둔 이미터들 (`moveAnimTable`의 `emitters`)
 * @param by 때린 쪽 몸통 자리 (m)
 * @param foe 맞는 쪽 몸통 자리 (m)
 * @param metre DS 한 단위가 몇 미터인가 (`splPlace`의 `splMetre`)
 * @param onDone 입자가 다 죽었을 때
 */
export function SplParticles({
  cues,
  by,
  foe,
  metre,
  seed,
  onDone,
}: {
  cues: readonly SplCue[]
  by: Vec3
  foe: Vec3
  metre: number
  seed?: number
  onDone?: () => void
}) {
  const show = useMemo(
    () => new SplShow(cues, by, foe, splBasis(by, foe), metre, seed),
    [cues, by, foe, metre, seed],
  )
  const rigs = useMemo(() => show.groups.map(buildRig), [show])
  const meshes = useRef<(Mesh | null)[]>([])
  const acc = useRef(0)
  const ended = useRef(false)

  useEffect(() => () => {
    for (const r of rigs) {
      r.geometry.dispose()
      r.material.dispose()
      r.map.dispose()
    }
  }, [rigs])

  // 새 기술이면 처음부터 — `show`가 갈리면 끝났다는 표시도 지운다
  useEffect(() => {
    acc.current = 0
    ended.current = false
  }, [show])

  useFrame((state, delta) => {
    acc.current += Math.min(delta, MAX_DELTA)
    // ⚠️ **한 프레임에 네 걸음까지만.** 무거운 프레임 뒤에 밀린 것을 다 몰아
    // 돌리면 연출이 한 칸 건너뛴 것처럼 보인다
    let steps = 0
    while (acc.current >= STEP && steps < 4) {
      show.step()
      acc.current -= STEP
      steps += 1
    }

    const camera = state.camera
    show.write(camera.matrixWorldInverse, camera.matrixWorld)
    for (const [i, r] of rigs.entries()) {
      const n = r.group.count
      const mesh = meshes.current[i]
      if (mesh) mesh.visible = n > 0
      r.geometry.instanceCount = n
      if (n === 0) continue
      for (const a of r.attrs) {
        a.clearUpdateRanges()
        a.addUpdateRange(0, n * a.itemSize)
        a.needsUpdate = true
      }
    }

    if (!ended.current && show.done) {
      ended.current = true
      onDone?.()
    }
  })

  return (
    <group>
      {/* 사각형 넷으로 잰 경계로는 인스턴스가 어디까지 가는지 모른다 — 자르지 않는다 */}
      {rigs.map((r, i) => (
        <mesh
          key={r.group.key}
          ref={(m) => {
            meshes.current[i] = m
          }}
          geometry={r.geometry}
          material={r.material}
          renderOrder={r.group.renderOrder}
          frustumCulled={false}
          visible={false}
        />
      ))}
    </group>
  )
}
