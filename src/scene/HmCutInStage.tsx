// 비전기술 컷인의 몸 (`engine/actor/hmCutIn`)
//
// 원작은 아래 화면의 스프라이트 한 장이 지나가는 것이고, 우리는 **같은 자리를
// 같은 프레임 수로** 지나가는 3D 몸이다 — 전설 미리보기(`PokemonPreviewStage`)와
// 같은 수법으로 카메라 앞에 띄운다.
//
// ⚠️ **자리는 매 프레임 바뀌므로 리액트를 안 거친다.** 마흔 몇 프레임짜리
// 연출 하나에 리렌더 마흔 번을 낼 이유가 없다 (`hmCutInScene`이 같은 까닭을
// 적어 뒀다) — 어느 포켓몬인가만 스토어에서 받고, 자리는 `useFrame`이 읽는다.
import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Group, Vector3 } from 'three'
import { bodyOffset } from '../engine/actor/hmCutIn'
import { hmCutIn, useHmCutInStore } from './hmCutInScene'
import { useMonBody } from './monBody'
import { asOverlay } from './monOverlay'
import { previewModelScale } from './pokemonPreview3d'

/** 카메라에서 몸까지 (월드 단위). 미리보기와 같은 거리라 크기 식이 그대로 산다 */
const DEPTH = 4

/** 화면 반폭이 이 월드 길이다. 몸이 −1~1을 지나갈 때 실제로 가는 거리 */
const HALF_WIDTH = 2.6

export function HmCutInStage() {
  const mon = useHmCutInStore((s) => s.mon)
  const root = useRef<Group>(null)
  const ray = useMemo(() => new Vector3(), [])
  const direction = useMemo(() => new Vector3(), [])
  const right = useMemo(() => new Vector3(), [])

  const body = useMonBody(mon?.species ?? null, {
    form: mon?.form ?? 0,
    gender: mon?.gender,
    shiny: mon?.shiny,
    prepare: asOverlay,
  })

  useFrame(({ camera }) => {
    const group = root.current
    const now = hmCutIn.now
    if (!group) return
    if (now === null) { group.visible = false; return }
    group.visible = true
    // 화면 한가운데를 카메라 앞 `DEPTH`에 잡고, 거기서 오른쪽으로 밀어 둔다
    ray.set(0, 0, 0).unproject(camera)
    direction.copy(ray).sub(camera.position).normalize()
    group.position.copy(camera.position).addScaledVector(direction, DEPTH)
    right.set(1, 0, 0).applyQuaternion(camera.quaternion)
    group.position.addScaledVector(right, bodyOffset(now) * HALF_WIDTH)
    // 늘 카메라를 마주 본다 — 옆모습으로 지나가면 누구인지 안 읽힌다
    group.rotation.y = Math.atan2(
      camera.position.x - group.position.x,
      camera.position.z - group.position.z,
    )
  })

  if (mon === null) return null
  const scale = body ? previewModelScale(body.tall) * 1.6 : 0.8
  return (
    <group ref={root} renderOrder={920}>
      <group position={[0, -0.35, 0]} scale={scale}>
        {body ? <primitive object={body.root} /> : <CutInFallback species={mon.species} />}
      </group>
      <pointLight position={[0.6, 0.8, 1.2]} intensity={2.2} distance={4} color="#ffffff" />
    </group>
  )
}

/**
 * 그 종의 몸이 설치본에 없을 때 (`useMonBody`가 null).
 *
 * ⚠️ **아무것도 안 그리면 밴드만 열렸다 닫힌다** — 그러면 "컷인이 고장 났다"로
 * 읽힌다. 종족 번호에서 색을 뽑아 실루엣이라도 지나가게 한다
 */
function CutInFallback({ species }: { species: number }) {
  const hue = (species * 47) % 360
  return (
    <mesh position={[0, 0.5, 0]} renderOrder={950}>
      <capsuleGeometry args={[0.34, 0.5, 8, 16]} />
      <meshBasicMaterial
        color={`hsl(${String(hue)} 55% 64%)`}
        depthTest={false}
        depthWrite={false}
        fog={false}
      />
    </mesh>
  )
}
