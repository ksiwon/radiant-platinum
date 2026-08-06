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
import { AdditiveBlending, Color, Mesh, MeshBasicMaterial } from 'three'
import { loadMoves } from '../../data/gameData'
import { MOVE_FRAMES, archetypeFor, type Archetype } from '../../engine/battle/vfx'
import { typeColor } from '../../engine/battle/typeColor'
import { useBattleStore } from '../../state/battleStore'

/** 60fps 기준 프레임을 초로 */
const DURATION = MOVE_FRAMES / 60

export interface Shot {
  kind: Archetype
  color: string
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
  const t = useRef(0)
  const color = useMemo(() => new Color(shot.color), [shot.color])
  const material = useMemo(
    () => new MeshBasicMaterial({
      color, transparent: true, depthWrite: false, blending: AdditiveBlending,
    }),
    [color],
  )
  useEffect(() => () => { material.dispose() }, [material])

  useFrame((_, delta) => {
    t.current += delta / DURATION
    const k = t.current
    if (k >= 1) { done(); return }
    const h = head.current, l = tail.current
    if (!h || !l) return
    const [fx, fz] = shot.from, [tx, tz] = shot.to
    const fade = pulse(k)
    material.opacity = fade

    switch (shot.kind) {
      case 'contact-melee': {
        // 달려가서 부딪고 돌아온다. 앞의 반은 가고 뒤의 반은 온다
        const go = k < 0.5 ? k * 2 : (1 - k) * 2
        h.position.set(fx + (tx - fx) * go, 1.1, fz + (tz - fz) * go)
        h.scale.setScalar(0.55 + 0.5 * go)
        // 부딪는 순간에만 터진다
        const hit = pulse(Math.max(0, (k - 0.45) / 0.25))
        l.position.set(tx, 1.2, tz)
        l.scale.setScalar(0.2 + hit * 1.9)
        break
      }
      case 'projectile': {
        // 덩어리가 날아가 맞는다. 뒤에 꼬리가 따라붙는다
        h.position.set(fx + (tx - fx) * k, 1.2 + Math.sin(k * Math.PI) * 1.1, fz + (tz - fz) * k)
        h.scale.setScalar(0.5)
        const back = Math.max(0, k - 0.12)
        l.position.set(fx + (tx - fx) * back, 1.2 + Math.sin(back * Math.PI) * 1.1, fz + (tz - fz) * back)
        l.scale.setScalar(0.3 * (1 - k))
        break
      }
      case 'beam': {
        // 줄기가 이어졌다가 끊긴다. 길이만 늘렸다 줄인다
        const grow = Math.min(1, k * 2.2)
        const cut = Math.max(0, (k - 0.7) / 0.3)
        const a = cut, b = grow
        h.position.set(fx + (tx - fx) * ((a + b) / 2), 1.2, fz + (tz - fz) * ((a + b) / 2))
        h.scale.set(0.34, 0.34, Math.max(0.01, (b - a) * Math.hypot(tx - fx, tz - fz)))
        l.position.set(tx, 1.2, tz)
        l.scale.setScalar(grow >= 1 ? 0.9 * fade : 0)
        break
      }
      case 'self-buff': {
        // 발밑에서 고리가 올라온다
        h.position.set(fx, 0.3 + k * 2.4, fz)
        h.scale.set(1.5 * (1 - k * 0.4), 0.12, 1.5 * (1 - k * 0.4))
        l.position.set(fx, 0.3 + Math.max(0, k - 0.3) * 2.4, fz)
        l.scale.set(1.1, 0.1, 1.1)
        break
      }
      default: {
        // 상대 둘레를 점이 돈다
        const a = k * Math.PI * 4
        h.position.set(tx + Math.cos(a) * 1.3, 1.0 + Math.sin(a * 2) * 0.5, tz + Math.sin(a) * 1.3)
        h.scale.setScalar(0.34)
        l.position.set(tx - Math.cos(a) * 1.3, 1.0 - Math.sin(a * 2) * 0.5, tz - Math.sin(a) * 1.3)
        l.scale.setScalar(0.34)
        break
      }
    }
  })

  const rod = shot.kind === 'beam'
  return (
    <group>
      <mesh ref={head} material={material}>
        {rod ? <boxGeometry args={[1, 1, 1]} /> : <icosahedronGeometry args={[0.5, 1]} />}
      </mesh>
      <mesh ref={tail} material={material}>
        {shot.kind === 'self-buff'
          ? <torusGeometry args={[1, 0.12, 6, 24]} />
          : <icosahedronGeometry args={[0.5, 0]} />}
      </mesh>
    </group>
  )
}

/**
 * 뷰가 기술을 내밀면 한 번 돈다.
 *
 * 박자(`playback`)가 `MOVE_FRAMES`만큼 쉬는 그 자리다. 둘이 같은 상수를 보므로
 * 연출이 잘리거나 빈 화면이 남지 않는다
 */
export function MoveVfx({ mine, foe }: { mine: [number, number]; foe: [number, number] }) {
  const view = useBattleStore((s) => s.view)
  const [shot, setShot] = useState<Shot | null>(null)
  const [table, setTable] = useState<Awaited<ReturnType<typeof loadMoves>> | null>(null)
  const last = useRef<string | null>(null)

  useEffect(() => {
    let alive = true
    void loadMoves().then((t) => { if (alive) setTable(t) }).catch(() => { /* 도형 없이 간다 */ })
    return () => { alive = false }
  }, [])

  const cast = view?.lastMove ?? null
  useEffect(() => {
    if (!cast) return
    // 같은 기술이 이어서 나올 수 있으므로 순번으로 가른다
    const key = String(cast.seq)
    if (last.current === key) return
    last.current = key
    const move = cast.move === null ? null : table?.byId.get(cast.move) ?? null
    const ours = cast.by === 'p1'
    const attacker = ours ? mine : foe
    const target = ours ? foe : mine
    const kind = archetypeFor(move)
    setShot({
      kind,
      color: typeColor(move?.type ?? 0),
      from: attacker,
      // 제 몸에 거는 것은 목표가 자기 자신이다
      to: kind === 'self-buff' ? attacker : target,
    })
  }, [cast, table, mine, foe])

  if (!shot) return null
  return <Shape shot={shot} done={() => { setShot(null) }} />
}
