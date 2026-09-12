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
import { retireTexture } from '../retireTexture'
import { SplShow, type SplCue, type SplGroup } from './splDraw'
import { splBasis, type SplBasis, type Vec3 } from './splPlace'

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
 * @param from 붙는 순간 이미 몇 프레임이 지난 것으로 볼 것인가.
 *   ⚠️ **연출은 입자 묶음보다 먼저 시작한다** — 묶음을 받아 오는 동안 무대는
 *   이미 돌고 있으므로, 0에서 세면 큐가 그만큼 늦게 선다(알 부화는 첫 조각이
 *   51프레임인데 묶음이 그보다 늦게 와서 아예 안 보였다). 부르는 쪽이 공유
 *   시계(`cinematicStore`의 `startedAt`)로 잰 값을 준다
 * @param basis DS 축을 우리 월드 축에 얹는 자. 안 주면 두 자리에서 세운다.
 *   ⚠️ **연출 무대는 두 자리가 같다** — 진화·부화는 몸 하나가 가운데 서므로
 *   `splBasis(by, foe)`가 뒷걸음질한 축을 낸다(`by === foe`면 +X가 −Z가 된다).
 *   원작 입자 공간이 「카메라가 +Z에서 원점을 본다」이고 우리 연출 카메라도
 *   그러므로, 그런 자리는 **항등 기저**를 넣어 준다
 * @param onDone 입자가 다 죽었을 때
 */
export function SplParticles({
  cues,
  by,
  foe,
  metre,
  basis,
  from,
  seed,
  onDone,
}: {
  cues: readonly SplCue[]
  by: Vec3
  foe: Vec3
  metre: number
  basis?: SplBasis
  from?: number
  seed?: number
  onDone?: () => void
}) {
  const show = useMemo(() => {
    const made = new SplShow(cues, by, foe, basis ?? splBasis(by, foe), metre, seed)
    // 늦게 붙었으면 그만큼 감아 둔다. 한 걸음이 싸고 연출이 길어야 몇백이다
    const skip = Math.min(600, Math.max(0, Math.floor(from ?? 0)))
    for (let i = 0; i < skip; i++) made.step()
    return made
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `from`은 붙는 순간의 값이라 딸림값이 아니다
  }, [cues, by, foe, metre, basis, seed])
  const rigs = useMemo(() => show.groups.map(buildRig), [show])
  const meshes = useRef<(Mesh | null)[]>([])
  const acc = useRef(0)
  const ended = useRef(false)

  useEffect(() => () => {
    for (const r of rigs) {
      r.geometry.dispose()
      r.material.dispose()
      // 입자 그림은 미뤄서 버린다 — 1,765장 중 780장이 32×32다 (REPAIR §48)
      retireTexture(r.map)
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
