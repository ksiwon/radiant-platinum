// 볼캡슐 씰의 입자 (PARITY §4.11) — `battle_anim/ov12_02235E94.c`
//
// 캡슐이 붙은 포켓몬이 볼에서 나올 때 씰마다 입자계가 하나씩 선다. 입자는 원작 `ball.bin` 그대로이고(`SPL_BALL`) 그리는 것은
// 기술·상태 연출과 같은 `SplParticles`다. 어느 입자가 어디서 언제 터지는가는 `engine/battle/fx/capsuleSeals`가 쥔다.
//
// ⚠️ **볼이 열리는 시각을 기다린다** (`ballOpen`). 입자계는 붙는 순간부터 돌기 때문에 일찍 붙이면 볼이 날아오는 동안 터져 버린다.
// ⚠️ **원작은 캡슐이 있으면 볼 종류의 열림 입자를 안 튼다** — 우리 볼 연출은 BDSP 시퀀스라 그것은 그대로 두고 씰 입자만 얹는다.
import { useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { burstSeals, sealDelayFrames, sealOffset, sealParticle } from '../../engine/battle/fx/capsuleSeals'
import type { BallSeal } from '../../engine/world/ballCapsule'
import { battleClock } from '../../engine/battle/presentationClock'
import { torsoY } from './moveAnchor'
import { SplParticles } from './SplParticles'
import type { SplCue } from './splDraw'
import { splFileFor, SPL_BALL } from './splPack'
import { cameraBasis, splMetre, type Vec3 } from './splPlace'
import { tallOf } from './stageRefs'

export function BallSealBurst({ seals, slot, floor, openAt, onDone }: {
  seals: readonly BallSeal[]
  slot: string
  /** 그 발판의 (x, z) */
  floor: readonly [number, number]
  /** 볼이 열려 몸이 나타나는 연출 시각 (`ballOpen`) */
  openAt: number
  onDone: () => void
}) {
  const camera = useThree((s) => s.camera)
  const [armed, setArmed] = useState(false)
  const left = useRef(0)

  useFrame(() => {
    if (!armed && battleClock.now() >= openAt) setArmed(true)
  })

  const shots = useMemo(() => {
    if (!armed) return []
    camera.updateMatrixWorld()
    const basis = cameraBasis(camera.matrixWorld.elements)
    const metre = splMetre(tallOf(slot))
    const out: { key: number, cues: SplCue[], by: Vec3, metre: number }[] = []
    burstSeals(seals).forEach((seal, i) => {
      const member = sealParticle(seal.type)
      const file = member === null ? null : splFileFor(SPL_BALL, member)
      // 묶음을 아직 못 받았으면 그 씰만 빠진다 — 연출이 늦어 멎는 것보다 낫다
      if (file === null) return
      const [dx, dy] = sealOffset(seal)
      const by: Vec3 = [
        floor[0] + (basis.ex[0] * dx + basis.ey[0] * dy) * metre,
        torsoY(slot) + (basis.ex[1] * dx + basis.ey[1] * dy) * metre,
        floor[1] + (basis.ex[2] * dx + basis.ey[2] * dy) * metre,
      ]
      out.push({ key: i, cues: [{ file, res: 0, at: 'attacker', frame: sealDelayFrames(seal) }], by, metre })
    })
    left.current = out.length
    return out.map((s) => ({ ...s, basis }))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 열리는 그 순간의 자리와 카메라로 한 번 세운다
  }, [armed])

  // 터뜨릴 것이 없는 연출은 바로 끝난다
  const emptied = useRef(false)
  if (armed && shots.length === 0 && !emptied.current) {
    emptied.current = true
    queueMicrotask(onDone)
  }

  return (
    <group>
      {shots.map((s) => (
        <SplParticles
          key={s.key}
          cues={s.cues}
          by={s.by}
          foe={s.by}
          metre={s.metre}
          basis={s.basis}
          seed={s.key + 1}
          onDone={() => {
            left.current -= 1
            if (left.current <= 0) onDone()
          }}
        />
      ))}
    </group>
  )
}
