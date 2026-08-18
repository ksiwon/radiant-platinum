// 기술 연출 (PLAN §7.3)
//
// 기술이 471개라 하나씩 만들 수 없다. 다섯 틀에 타입 색만 갈아 끼운다 —
// 어느 틀인지는 롬의 기술 데이터가 정하고(`engine/battle/vfx`) 색은 타입 표에서
// 온다. 그래서 10만볼트는 노란 줄기, 오물폭탄은 보라 덩어리가 된다.
//
// **원작 연출을 한 컷씩 옮기는 것이 아니다.** 원작은 기술마다 연출 파일이 따로
// 있는데 그 표를 아직 안 읽었다. 지금 보여 주는 것은 "어떤 종류의 사건인가"다 —
// 때렸는지, 날렸는지, 쐈는지, 제 몸에 걸었는지, 상대에게 걸었는지.
//
// 도형만 쓴다. 파티클을 쓰면 예산(§10.1)을 먼저 잡아먹고, 4세대 화면에는
// 또렷한 도형이 오히려 맞는다.
import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import {
  AdditiveBlending, BackSide, Color, Mesh, MeshBasicMaterial,
  type Group, type MeshBasicMaterial as BasicMaterial,
} from 'three'
import { loadMoveAnims, loadMoves } from '../../data/gameData'
import { MOVE_FRAMES, archetypeFor, type Archetype } from '../../engine/battle/vfx'
import { typeColor } from '../../engine/battle/typeColor'
import { useBattleStore } from '../../state/battleStore'
import type { SlotId } from '../../engine/battle/events'
import { clearMoveImpact, moveImpact, tallOf } from './stageRefs'
import { GIRTH, muzzleY, shapeSpan, torsoY } from './moveAnchor'
import type { MoveAnim } from '../../engine/battle/moveAnimTable'
import {
  elementFamilyForType,
  moveVisualSignature,
  type ElementFamily,
  type MoveVisualSignature,
} from './moveElements'

/** 60fps 기준 프레임을 초로 */
const DURATION = MOVE_FRAMES / 60

export interface Shot {
  kind: Archetype
  /** 때린 쪽·맞은 쪽의 자리. 몸에 거는 것은 이 둘로 가른다 */
  by: SlotId
  at: SlotId
  family: ElementFamily
  color: string
  signature: MoveVisualSignature
  /** 쓴 쪽과 맞는 쪽의 발판 자리 */
  from: [number, number]
  to: [number, number]
}

/** 0→1 진행에서 한 번 부풀었다 꺼지는 값. 연출이 툭 끊기지 않게 한다 */
function pulse(t: number): number {
  return Math.sin(Math.min(1, Math.max(0, t)) * Math.PI)
}

/**
 * 한 번 도는 연출.
 *
 * 틀마다 도형 두 개를 쓰고 `useFrame`에서 자리만 고쳐 쓴다 — 프레임마다
 * `setState`를 하면 React가 배틀 중에 계속 다시 그린다
 */
function Shape({ shot, done }: { shot: Shot; done: () => void }) {
  const head = useRef<Mesh>(null)
  const tail = useRef<Mesh>(null)
  const particles = useRef<Group>(null)
  const flash = useRef<Mesh>(null)
  const t = useRef(0)
  const particleIds = useMemo(
    () => Array.from({ length: shot.signature.particles }, (_, index) => index),
    [shot.signature.particles],
  )
  const color = useMemo(() => new Color(shot.color), [shot.color])
  const material = useMemo(
    () =>
      new MeshBasicMaterial({
        color,
        transparent: true,
        depthWrite: false,
        blending: AdditiveBlending,
      }),
    [color],
  )
  useEffect(
    () => () => {
      material.dispose()
    },
    [material],
  )

  // 도형이 사라져도 무대에 걸어 둔 것이 남으면 다음 턴까지 몸이 물든다
  useEffect(() => clearMoveImpact, [])

  useFrame((_, delta) => {
    t.current += delta / DURATION
    const k = t.current
    if (k >= 1) {
      clearMoveImpact()
      done()
      return
    }

    // 무대가 읽을 것을 먼저 적는다 — 몸 떨림·눌림·물들임·사라짐과 화면 흔들림은
    // 도형이 아니라 무대가 건다 (`stageRefs`)
    const sig = shot.signature
    moveImpact.t = k
    moveImpact.attacker = shot.by
    moveImpact.defender = shot.at
    moveImpact.camera = sig.camera
    moveImpact.shake = sig.shake
    moveImpact.tint = sig.tint
    moveImpact.squash = sig.squash
    moveImpact.vanish = sig.vanish
    const h = head.current,
      l = tail.current
    if (!h || !l) return
    const [fx, fz] = shot.from,
      [tx, tz] = shot.to
    // 나가는 높이·맞는 높이·도형 크기를 **그 자리에 선 몸**에서 뽑는다
    const from = muzzleY(shot.by)
    const to = shot.kind === 'self-buff' ? from : torsoY(shot.at)
    const span = shapeSpan(shot.by, shot.at)
    const fade = pulse(k)
    material.opacity = fade

    switch (shot.kind) {
      case 'contact-melee': {
        // 달려가서 부딪고 돌아온다. 앞의 반은 가고 뒤의 반은 온다
        const go = k < 0.5 ? k * 2 : (1 - k) * 2
        h.position.set(fx + (tx - fx) * go, from + (to - from) * go, fz + (tz - fz) * go)
        h.scale.setScalar((0.55 + 0.5 * go) * span)
        // 부딪는 순간에만 터진다
        const hit = pulse(Math.max(0, (k - 0.45) / 0.25))
        l.position.set(tx, to, tz)
        l.scale.setScalar((0.2 + hit * 1.9) * span)
        break
      }
      case 'projectile': {
        // 덩어리가 날아가 맞는다. 뒤에 꼬리가 따라붙는다
        h.position.set(
          fx + (tx - fx) * k,
          from + (to - from) * k + Math.sin(k * Math.PI) * shot.signature.lift,
          fz + (tz - fz) * k,
        )
        h.scale.setScalar(0.5 * span)
        const back = Math.max(0, k - 0.12)
        l.position.set(
          fx + (tx - fx) * back,
          from + (to - from) * back + Math.sin(back * Math.PI) * shot.signature.lift,
          fz + (tz - fz) * back,
        )
        l.scale.setScalar(0.3 * (1 - k) * span)
        break
      }
      case 'beam': {
        // 줄기가 이어졌다가 끊긴다. 길이만 늘렸다 줄인다
        const grow = Math.min(1, k * 2.2)
        const cut = Math.max(0, (k - 0.7) / 0.3)
        const a = cut,
          b = grow
        const mid = (a + b) / 2
        // ⚠️ 줄기는 **입에서 몸통으로 비스듬히** 간다. y를 한 값으로 두면
        // 큰 놈이 작은 놈을 쏠 때 줄기가 상대 머리 위를 지난다
        h.position.set(fx + (tx - fx) * mid, from + (to - from) * mid, fz + (tz - fz) * mid)
        const run = Math.hypot(tx - fx, tz - fz)
        h.rotation.set(-Math.atan2(to - from, run), Math.atan2(tx - fx, tz - fz), 0, 'YXZ')
        h.scale.set(0.34 * span, 0.34 * span,
          Math.max(0.01, (b - a) * Math.hypot(run, to - from)))
        l.position.set(tx, to, tz)
        l.scale.setScalar(grow >= 1 ? 0.9 * fade * span : 0)
        break
      }
      case 'self-buff': {
        // 발밑에서 고리가 올라온다
        const rise = tallOf(shot.by) * 1.25
        const ring = tallOf(shot.by) * GIRTH
        h.position.set(fx, 0.1 + k * rise, fz)
        h.scale.set(ring * (1 - k * 0.4), 0.12, ring * (1 - k * 0.4))
        l.position.set(fx, 0.1 + Math.max(0, k - 0.3) * rise, fz)
        l.scale.set(ring * 0.75, 0.1, ring * 0.75)
        break
      }
      default: {
        // 상대 둘레를 점이 돈다
        const a = k * Math.PI * 4
        const r = tallOf(shot.at) * GIRTH * 1.4
        h.position.set(tx + Math.cos(a) * r, to + Math.sin(a * 2) * r * 0.4, tz + Math.sin(a) * r)
        h.scale.setScalar(0.34 * span)
        l.position.set(tx - Math.cos(a) * r, to - Math.sin(a * 2) * r * 0.4, tz - Math.sin(a) * r)
        l.scale.setScalar(0.34 * span)
        break
      }
    }

    // 배경은 앞에서 훅 물들고 천천히 돌아온다 — 원작의 `startAlpha → endAlpha`
    // 뒤에 되돌리는 짝이 붙는 것과 같은 모양이다
    const wall = flash.current
    const tone = shot.signature.flash
    if (wall !== null && tone !== null) {
      const mat = wall.material as BasicMaterial
      mat.opacity = tone.strength * Math.sin(Math.min(1, k * 1.4) * Math.PI)
    }

    const cloud = particles.current
    if (!cloud) return
    for (let index = 0; index < cloud.children.length; index += 1) {
      const particle = cloud.children[index]!
      const delay = index * 0.035
      const progress = Math.max(0, Math.min(1, (k - delay) / (1 - delay)))
      // 도는 정도는 대본의 공전 반지름에서 온다. 안 도는 기술은 제자리에서 퍼진다
      const spin = shot.signature.orbit > 0 ? 2 + shot.signature.orbit * 6 : 4.1
      const angle = progress * Math.PI * spin + index * 2.4
      const px = fx + (tx - fx) * progress
      const pz = fz + (tz - fz) * progress
      const py = from + (to - from) * progress
      particle.visible = progress > 0 && progress < 1
      switch (shot.family) {
        case 'flame':
          particle.position.set(
            px + Math.cos(angle) * 0.16 * span,
            py + (Math.sin(progress * Math.PI) * 0.8 + (index % 3) * 0.08) * span,
            pz + Math.sin(angle) * 0.16 * span,
          )
          particle.scale.setScalar((0.22 + (index % 3) * 0.05) * pulse(progress) * span)
          break
        case 'water':
          particle.position.set(
            px + Math.cos(angle) * 0.22 * span,
            py + Math.sin(progress * Math.PI) * 0.6 * span,
            pz + Math.sin(angle) * 0.22 * span,
          )
          particle.scale.set(0.13 * span, (0.13 + progress * 0.18) * span, 0.13 * span)
          break
        case 'spark':
          particle.position.set(
            px + Math.sin(angle * 2) * 0.23 * span,
            py + Math.sin(angle * 3) * 0.22 * span,
            pz + Math.cos(angle * 2) * 0.23 * span,
          )
          particle.scale.set(0.07 * span, 0.32 * span, 0.07 * span)
          particle.rotation.set(angle, angle * 0.7, angle * 1.3)
          break
        case 'frost':
          particle.position.set(
            px + Math.cos(angle) * 0.35 * span,
            py + Math.sin(progress * Math.PI) * 0.5 * span,
            pz + Math.sin(angle) * 0.35 * span,
          )
          particle.scale.setScalar((0.12 + (index % 3) * 0.035) * span)
          particle.rotation.set(angle * 0.5, angle, -angle * 0.6)
          break
        case 'leaf':
          particle.position.set(
            px + Math.cos(angle) * 0.48 * span,
            py + Math.sin(angle * 0.55) * 0.35 * span,
            pz + Math.sin(angle) * 0.48 * span,
          )
          particle.scale.set(0.08 * span, 0.24 * span, 0.16 * span)
          particle.rotation.set(angle, angle * 0.4, angle * 0.7)
          break
        case 'stone':
          // 돌덩이는 땅에서 솟아 포물선으로 간다 — 바닥이 기준이다
          particle.position.set(
            px,
            0.15 + Math.sin(progress * Math.PI) * (0.6 + (index % 3) * 0.25) * span
              + (to - 0.15) * progress,
            pz,
          )
          particle.scale.setScalar((0.12 + (index % 4) * 0.045) * span)
          particle.rotation.set(angle, angle * 0.7, angle * 0.4)
          break
        case 'spirit': {
          const gather = (0.4 + progress * 0.8) * span
          particle.position.set(
            tx + Math.cos(angle) * gather,
            to + Math.sin(angle * 1.7) * 0.45 * span,
            tz + Math.sin(angle) * gather,
          )
          particle.scale.setScalar((0.1 + pulse(progress) * 0.14) * span)
          break
        }
        case 'wind':
          particle.position.set(
            px + Math.cos(angle) * 0.65 * span,
            py + (progress * 0.5 + Math.sin(angle) * 0.25) * span,
            pz + Math.sin(angle) * 0.65 * span,
          )
          particle.scale.set(0.28 * span, 0.045 * span, 0.28 * span)
          particle.rotation.set(Math.PI / 2, 0, angle)
          break
        case 'venom':
          particle.position.set(
            px + Math.cos(angle) * 0.28 * span,
            py + (Math.sin(progress * Math.PI) * 0.45 - progress * 0.2) * span,
            pz + Math.sin(angle) * 0.28 * span,
          )
          particle.scale.set(0.13 * span, (0.18 + progress * 0.14) * span, 0.13 * span)
          break
        default:
          particle.position.set(
            tx + Math.cos(angle) * progress * 1.2 * span,
            to + Math.sin(angle) * progress * 0.5 * span,
            tz + Math.sin(angle) * progress * 1.2 * span,
          )
          particle.scale.setScalar((0.08 + pulse(progress) * 0.12) * span)
      }
    }
  })

  const rod = shot.kind === 'beam'
  return (
    <group>
      {/*
        배경 물들임 (`Func_FadeBg`, 108개 · 색 13가지).

        ⚠️ **무대 앞이 아니라 뒤다.** 원작이 물들이는 것은 배경 층이라 포켓몬은
        그대로 보인다. 그래서 경기장(반지름 12)보다 큰 구를 안쪽 면으로 두른다 —
        앞에 판을 깔면 몸까지 같이 죽어서 화면이 그냥 어두워진다
      */}
      {shot.signature.flash !== null && (
        <mesh ref={flash}>
          <sphereGeometry args={[40, 16, 12]} />
          <meshBasicMaterial
            color={shot.signature.flash.color}
            side={BackSide}
            transparent
            depthWrite={false}
            opacity={0}
          />
        </mesh>
      )}
      <mesh ref={head} material={material}>
        {rod ? (
          <boxGeometry args={[1, 1, 1]} />
        ) : shot.family === 'flame' || shot.family === 'leaf' ? (
          <coneGeometry args={[0.42, 0.9, 7]} />
        ) : shot.family === 'frost' || shot.family === 'spark' ? (
          <octahedronGeometry args={[0.52, 0]} />
        ) : shot.family === 'stone' ? (
          <dodecahedronGeometry args={[0.5, 0]} />
        ) : shot.family === 'spirit' || shot.family === 'wind' ? (
          <torusGeometry args={[0.42, 0.12, 7, 20]} />
        ) : (
          <icosahedronGeometry args={[0.5, 1]} />
        )}
      </mesh>
      <mesh ref={tail} material={material}>
        {shot.kind === 'self-buff' ? (
          <torusGeometry args={[1, 0.12, 6, 24]} />
        ) : (
          <icosahedronGeometry args={[0.5, 0]} />
        )}
      </mesh>
      <group ref={particles}>
        {particleIds.map((index) => (
          <mesh key={index} material={material}>
            {shot.family === 'flame' || shot.family === 'leaf' ? (
              <coneGeometry args={[1, 1.8, 6]} />
            ) : shot.family === 'water' || shot.family === 'venom' ? (
              <sphereGeometry args={[1, 9, 7]} />
            ) : shot.family === 'spark' || shot.family === 'frost' ? (
              <octahedronGeometry args={[1, 0]} />
            ) : shot.family === 'stone' ? (
              <dodecahedronGeometry args={[1, 0]} />
            ) : shot.family === 'wind' || shot.family === 'spirit' ? (
              <torusGeometry args={[1, 0.18, 5, 14]} />
            ) : (
              <tetrahedronGeometry args={[1, 0]} />
            )}
          </mesh>
        ))}
      </group>
    </group>
  )
}

/**
 * 뷰가 기술을 내밀면 한 번 돈다.
 *
 * 박자(`playback`)가 `MOVE_FRAMES`만큼 쉬는 그 자리다. 둘이 같은 상수를 보므로
 * 연출이 잘리거나 빈 화면이 남지 않는다
 */
export function MoveVfx({
  spotAt,
}: {
  /**
   * 그 자리의 바닥 좌표. **자리마다 다르다** — 더블에서 쪽만 보고 두 점을
   * 쓰면 옆 짝을 때려도 도형이 첫째 마리에게 날아간다 (PARITY §2.2)
   */
  spotAt: (slot: SlotId) => [number, number]
}) {
  const view = useBattleStore((s) => s.view)
  const [shot, setShot] = useState<Shot | null>(null)
  const [table, setTable] = useState<Awaited<ReturnType<typeof loadMoves>> | null>(null)
  /** 기술 연출 대본. 색인이 기술 번호다 */
  const [anims, setAnims] = useState<readonly (MoveAnim | null)[] | null>(null)
  const last = useRef<string | null>(null)

  useEffect(() => {
    let alive = true
    void loadMoves()
      .then((t) => {
        if (alive) setTable(t)
      })
      .catch(() => {
        /* 도형 없이 간다 */
      })
    void loadMoveAnims()
      .then((a) => {
        if (alive) setAnims(a)
      })
      .catch(() => {
        /* 대본이 없으면 밋밋한 한 벌로 간다 */
      })
    return () => {
      alive = false
    }
  }, [])

  const cast = view?.lastMove ?? null
  useEffect(() => {
    if (!cast) return
    // 같은 기술이 이어서 나올 수 있으므로 순번으로 가른다
    const key = String(cast.seq)
    if (last.current === key) return
    last.current = key
    const move = cast.move === null ? null : (table?.byId.get(cast.move) ?? null)
    const attacker = spotAt(cast.by)
    // 대상이 없는 줄(전체기·자기 강화)은 맞은편 첫 자리를 겨눈다
    const target = spotAt(cast.to ?? (cast.by.startsWith('p1') ? 'p2a' : 'p1a'))
    const kind = archetypeFor(move)
    setShot({
      kind,
      by: cast.by,
      at: cast.to ?? (cast.by.startsWith('p1') ? 'p2a' : 'p1a'),
      family: elementFamilyForType(move?.type ?? 0),
      color: typeColor(move?.type ?? 0),
      signature: moveVisualSignature(anims?.[cast.move ?? 0] ?? null),
      from: attacker,
      // 제 몸에 거는 것은 목표가 자기 자신이다
      to: kind === 'self-buff' ? attacker : target,
    })
  }, [cast, table, anims, spotAt])

  if (!shot) return null
  return (
    <Shape
      shot={shot}
      done={() => {
        setShot(null)
      }}
    />
  )
}
