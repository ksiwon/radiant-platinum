// 기술 연출 (PLAN §7.3 · PARITY §2.13)
//
// 기술마다 원작 대본을 읽는다 (`res/moves/<이름>/anim.s` → `moveAnimTable`).
// 대본이 정하는 것이 셋이다:
//
//   입자   `loads`·`emitters` — 어느 `.spa`를 어느 프레임에 어디에 세우는가.
//          그리는 것은 `SplParticles`이고 알갱이는 **원작 것 그대로**다
//   무대   번쩍임·물들임·떨림·눌림·사라짐 — `stageRefs.moveImpact`를 거쳐
//          `BattleStage`가 몸과 배경에 건다
//   도형   대본에 이미터가 없는 기술(46개)과 입자 자료를 아직 못 받은 그 한 번.
//          틀 다섯에 타입 색을 갈아 끼운다 (`engine/battle/vfx`)
//
// 상태 이상·능력 변화 연출(원작 「부분 연출」)은 `StatusVfx`가 따로 돌고 여기서 같이 세운다.
//
// ⚠️ **입자가 서면 도형은 물러난다.** 둘을 겹쳐 그리면 같은 자리에 두 벌이
// 포개져 무엇이 원작인지 알아볼 수 없다. 무대에 거는 것은 어느 쪽이든 돈다.
import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import {
  AdditiveBlending, BackSide, Color, Mesh, MeshBasicMaterial,
  type Group, type MeshBasicMaterial as BasicMaterial,
} from 'three'
import { loadMoveAnims, loadMoves } from '../../data/gameData'
import { battleClock } from '../../engine/battle/presentationClock'
import { MOVE_FRAMES, archetypeFor, setMoveFrames, setMoveImpact, statusPan, type Archetype } from '../../engine/battle/vfx'
import { moveSoundTimes, type TimedSound } from '../../engine/battle/moveSound'
import { music } from '../../engine/audio/music'
import { typeColor } from '../../engine/battle/typeColor'
import { useBattleStore } from '../../state/battleStore'
import type { SlotId } from '../../engine/battle/events'
import { clearMoveImpact, moveImpact, tallOf } from './stageRefs'
import { GIRTH, muzzleY, shapeSpan, torsoY } from './moveAnchor'
import type { MoveAnim } from '../../engine/battle/moveAnimTable'
import type { SplFile } from '../../engine/battle/spl/resource'
import {
  elementFamilyForType,
  moveVisualSignature,
  type ElementFamily,
  type MoveVisualSignature,
} from './moveElements'
import { SplParticles } from './SplParticles'
import { StatusVfx } from './StatusVfx'
import { moveAnimFrames } from '../../engine/battle/moveLength'
import { preloadSplPack, splFileFor, splPackReader, SPL_WAZA } from './splPack'
import { splMetre, type Vec3 } from './splPlace'
import type { SplCue } from './splDraw'
import { BdspSequence } from './fx/BdspSequence'
import { warmFxEffects } from './fx/BdspEffect'
import { moveSeqPlan, preloadMoveSeqs } from './fx/moveSeq'
import { planFrames, type SeqPlan } from '../../engine/battle/fx/sequence'

/** 60fps 기준 프레임을 초로 */
const secs = (frames: number): number => frames / 60

interface Shot {
  kind: Archetype
  /** 때린 쪽·맞은 쪽의 자리. 몸에 거는 것은 이 둘로 가른다 */
  by: SlotId
  at: SlotId
  /**
   * 범위 기술에서 `at` 말고 같이 맞은 자리들 (`lastMove.spread`). BDSP 시퀀스는 한 번만 돌고 맞는 쪽 명령은 한 몸(`trg=1`)만 겨누므로
   * 이 자리들에는 **맞는 쪽의 몸 반응 · 입자를 한 벌씩 더** 건다 (`BdspSequence`의 `reactors`)
   */
  also: readonly SlotId[]
  /** 더블 판인가 — 시퀀스의 싱글 · 더블 갈래 */
  doubles: boolean
  family: ElementFamily
  color: string
  signature: MoveVisualSignature
  /** 쓴 쪽과 맞는 쪽의 발판 자리 */
  from: [number, number]
  to: [number, number]
  /**
   * 원작 이미터들. 대본에 없거나 자료를 아직 못 받았으면 `null`이고,
   * 그때만 도형이 대신 선다
   */
  cues: readonly SplCue[] | null
  /** 이미터를 붙일 세 자리와 배율 (`splPlace`) */
  place: { by: Vec3, foe: Vec3, metre: number } | null
  /** 같은 배틀 안에서 기술마다 다른 그림이 나오게 하는 씨앗 */
  seed: number
  /**
   * 이 연출이 **연출 시계에서 시작한 시각**(초).
   *
   * ⚠️ **델타를 쌓지 않는다.** 예전에는 `t.current += delta / 길이`였고, 그
   * `t`가 `useRef`라 같은 컴포넌트가 다음 연출에 다시 쓰이면 **앞 연출의 진행도를
   * 물려받았다** — 새 기술이 이미 반쯤 지난 채로 시작하거나 첫 프레임에 끝났다.
   * 지금은 시작 시각 하나만 들고 진행도를 매번 다시 잰다
   * (`engine/battle/presentationClock`)
   */
  startedAt: number
  /**
   * 이 연출이 도는 프레임. 박자(`playback`)가 쉬는 값과 **같은 자리에서 온다**
   * (`engine/battle/moveLength`)
   */
  frames: number
  /**
   * 몸에 거는 것(떨림·눌림·물들임·사라짐)이 도는 프레임.
   *
   * ⚠️ **전체 길이와 다르다.** 전체는 입자가 사그라지기를 기다리느라 3초까지
   * 가는데, 원작에서 몸을 흔드는 것은 `Func_Shake` 같은 태스크 몇십 프레임이다
   * — 전체에 맞춰 늘이면 포켓몬이 3초 내내 떨린다. 그래서 여기는 **대본 자체가
   * 서는 시간**(`anim.frames`)이고 그것이 곧 그 태스크들의 길이다
   */
  bodyFrames: number
  /**
   * BDSP 연출 시퀀스 (BATTLE_FX §4). 있으면 **DS 입자 · 도형 · 무대 몫을 다 끄고** 이것만 돈다 —
   * 몸의 나감 · 맞음도 시퀀스가 시킨다(`stageRefs.seqStage`)
   */
  seq: SeqPlan | null
  /**
   * 이 기술이 내는 소리 — 원작 대본의 소리를 BDSP 시퀀스의 소리 칸에 짝지은 것(시작에서 몇 초 뒤 · `moveSoundTimes`).
   * 자리는 쓴 쪽 기준이라 내 쪽이면 뒤집는다(`statusPan`)
   */
  sounds: TimedSound[]
}

/**
 * 대본의 `loads`·`emitters`를 이미터 목록으로.
 *
 * ⚠️ **하나라도 못 받았으면 통째로 `null`이다.** 이미터 셋 중 둘만 서면 원작에
 * 없는 그림이 나온다 — 그럴 바에는 도형 한 벌로 가는 편이 낫다.
 *
 * `member`는 `battle_particles.order`의 줄 번호이고 그것이 곧 `waza` 묶음의
 * 멤버 번호다. `ps`는 그 대본이 자료를 실어 둔 입자계 칸이다
 */
const wazaFile = splPackReader(SPL_WAZA)

function cuesOf(anim: MoveAnim | null): readonly SplCue[] | null {
  if (anim === null || anim.emitters.length === 0) return null
  const loaded = new Map<number, SplFile>()
  for (const load of anim.loads) {
    const file = splFileFor(SPL_WAZA, load.member)
    if (file === null) return null
    loaded.set(load.ps, file)
  }
  const cues: SplCue[] = []
  for (const e of anim.emitters) {
    const file = loaded.get(e.ps)
    if (file === undefined) return null
    cues.push({ file, res: e.res, at: e.at, frame: e.at_frame })
  }
  return cues.length > 0 ? cues : null
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
function Shape({ shot, done }: { shot: Shot; done: (seq: number) => void }) {
  const head = useRef<Mesh>(null)
  const tail = useRef<Mesh>(null)
  const particles = useRef<Group>(null)
  const flash = useRef<Mesh>(null)
  /** 이 연출이 끝났다고 이미 알렸는가. 두 번 알리면 다음 연출이 지워진다 */
  const ended = useRef(false)
  // ⚠️ **원작 입자가 서면 도형 구름은 안 뿌린다.** 둘 다 그리면 같은 자리에
  // 두 벌이 겹쳐서 무엇이 원작인지 알아볼 수 없다. 다만 머리·꼬리 메시는
  // **지우지 않고 숨긴다** — 무대에 거는 값(`moveImpact`)과 배경 물들임이
  // 같은 `useFrame` 안에서 그 뒤에 오기 때문이다
  const usesSpl = shot.cues !== null
  const particleIds = useMemo(
    () => (usesSpl
      ? []
      : Array.from({ length: shot.signature.particles }, (_, index) => index)),
    [shot.signature.particles, usesSpl],
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

  useFrame(() => {
    // 진행도는 **시작 시각부터 지금까지**로 잰다 — 쌓아 둔 값이 아니다.
    // 모든 연출이 같은 시계를 보므로 게이지·글·공과 순서가 안 어긋난다
    const k = (battleClock.now() - shot.startedAt) / secs(shot.frames)
    if (k >= 1) {
      if (ended.current) return
      ended.current = true
      clearMoveImpact()
      // ⚠️ **누가 끝났는지 같이 알린다.** 그냥 `done()`이면 이미 다음 연출이
      // 서 있을 때 앞엣것의 종료가 그 새 연출을 지운다
      done(shot.seed)
      return
    }
    if (k < 0) return

    // 무대가 읽을 것을 먼저 적는다 — 몸 떨림·눌림·물들임·사라짐과 화면 흔들림은
    // 도형이 아니라 무대가 건다 (`stageRefs`).
    //
    // ⚠️ **몸에 거는 것은 제 시계로 돈다.** 전체 길이는 입자가 사그라지기를
    // 기다리는 시간이라 3초까지 가는데, 원작이 몸을 흔드는 것은 그 안의 태스크
    // 몇십 프레임이다 (`Shot.bodyFrames`). 다 끝나면 `t`를 1로 두어 무대가
    // 놓게 한다 — `moveImpact.t >= 1`이 「걸린 것이 없다」는 뜻이다
    const body = k * shot.frames / shot.bodyFrames
    const sig = shot.signature
    if (body >= 1) {
      clearMoveImpact()
    } else {
      moveImpact.t = body
      moveImpact.attacker = shot.by
      moveImpact.defender = shot.at
      moveImpact.camera = sig.camera
      moveImpact.shake = sig.shake
      moveImpact.tint = sig.tint
      moveImpact.squash = sig.squash
      moveImpact.vanish = sig.vanish
    }
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
      // 배경 물들임도 몸에 거는 것과 같은 시계다 — 원작의 `Func_FadeBg`가
      // 대본 안의 태스크지 연출 전체 길이가 아니다
      mat.opacity = tone.strength * Math.sin(Math.min(1, body * 1.4) * Math.PI)
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
      <mesh ref={head} material={material} visible={!usesSpl}>
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
      <mesh ref={tail} material={material} visible={!usesSpl}>
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
 * 박자(`playback`)가 쉬는 그 자리다. 둘이 **같은 함수**를 보므로
 * (`engine/battle/moveLength`) 연출이 잘리거나 빈 화면이 남지 않는다
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

  // ⚠️ **여기서 미리 받는다.** 기술이 나가는 그 프레임에는 기다릴 수 없다 —
  // 배틀에 들어설 때 시작해 두면 첫 수까지 등장 연출 몇 초 사이에 끝난다
  useEffect(() => {
    void preloadSplPack(SPL_WAZA)
  }, [])

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

  // 박자(`playback`)와 무대(`BattleStage`)에 「이 기술은 몇 프레임인가」를 꽂는다.
  // ⚠️ **엔진이 218KB짜리 대본 표를 직접 못 집는다** — 그것을 든 곳이 여기뿐이라
  // 여기서 꽂고, 배틀을 나갈 때 되돌린다 (`vfx`의 `setMoveFrames`)
  //
  // ⚠️ **BDSP 시퀀스가 있는 기술은 그 시퀀스가 길이를 낸다** — 맞는 쪽 체력이 깎이는 프레임
  // (`GaugeDamage`)까지다. 박자는 거기서 다음 사건(체력 깎임)으로 가고, 시퀀스의 꼬리(입자가
  // 사그라지는 것 · 몸이 돌아오는 것)는 그 위에서 마저 돈다 — BDSP도 게이지가 연출 도중에 준다.
  // 시퀀스는 30fps라 두 배 한다
  const [seqReady, setSeqReady] = useState(0)
  // ⚠️ **명부를 구독한다.** 무대가 서는 순간에는 명부가 아직 빌 수 있다 — 그때 한 번만 받으면
  // 아무것도 안 받고 판 내내 DS로 간다(실측: 몸통박치기가 DS 돌진으로 나갔다)
  const roster = useBattleStore((s) => s.roster)
  const scene = useThree((s) => s.scene)
  useEffect(() => {
    let alive = true
    const moves = new Set<number>()
    for (const r of Object.values(roster)) for (const m of r.moves ?? []) moves.add(m)
    if (moves.size === 0) return undefined
    void preloadMoveSeqs(moves).then(() => {
      if (!alive) return
      setSeqReady((n) => n + 1)
      // 처음 쓰는 기술도 안 멎게 판이 열리는 동안 파이프라인을 굽는다 (`warmFxEffects`)
      const prefabs: string[] = []
      for (const m of moves) {
        for (const mine of [true, false]) for (const p of moveSeqPlan(m, mine)?.particles ?? []) prefabs.push(p.prefab)
      }
      void warmFxEffects(prefabs, scene).catch((e: unknown) => { console.warn('[fx] 미리 굽기 실패', e) })
    })
    return () => { alive = false }
  }, [roster, scene])
  // 명부의 기술 소리도 미리 편다 — 처음 내는 소리는 워커 합성을 기다려 늦는다
  useEffect(() => {
    if (anims === null) return
    const seqs = new Set<number>()
    for (const r of Object.values(roster)) for (const m of r.moves ?? []) for (const s of anims[m]?.sounds ?? []) seqs.add(s.seq)
    if (seqs.size > 0) void music.prewarm([...seqs])
  }, [roster, anims])
  useEffect(() => {
    if (anims === null) return undefined
    setMoveFrames((move, mine, doubles) => {
      const plan = moveSeqPlan(move, mine, doubles)
      if (plan) return 2 * (plan.hit ?? planFrames(plan))
      return moveAnimFrames(anims[move ?? -1] ?? null, wazaFile)
    })
    // 맞는 소리 · 깜박임은 게이지가 아니라 몸이 움찔하는 프레임이다 — 박자가 그 시각을 기술 사건에 실어 보낸다
    setMoveImpact((move, mine, doubles) => {
      const impact = moveSeqPlan(move, mine, doubles)?.impact ?? null
      return impact === null ? null : 2 * impact
    })
    return () => {
      setMoveFrames(null)
      setMoveImpact(null)
    }
  }, [anims, seqReady])

  const cast = view?.lastMove ?? null
  const doubles = view?.active.p1b != null || view?.active.p2b != null
  useEffect(() => {
    if (!cast) return
    // 같은 기술이 이어서 나올 수 있으므로 순번으로 가른다
    const key = String(cast.seq)
    if (last.current === key) return
    last.current = key
    const move = cast.move === null ? null : (table?.byId.get(cast.move) ?? null)
    const attacker = spotAt(cast.by)
    // 대상이 없는 줄(전체기·자기 강화)은 맞은편 첫 자리를 겨눈다
    // 범위 기술은 `to`가 대표 대상 하나다 — 맞은 자리 전체가 `spread`에 있다. 대표 대상이 없으면 그 첫째다
    const at = cast.to ?? cast.spread[0] ?? (cast.by.startsWith('p1') ? 'p2a' : 'p1a')
    const also = cast.spread.filter((s) => s !== at && s !== cast.by)
    const target = spotAt(at)
    const kind = archetypeFor(move)
    const anim = anims?.[cast.move ?? 0] ?? null
    const seq = moveSeqPlan(cast.move, cast.by.startsWith('p1'), doubles)
    // 판 도중 배운 기술처럼 미리 못 받은 것은 이번엔 DS로 가고 다음부터 BDSP다
    if (seq === null && cast.move !== null) void preloadMoveSeqs([cast.move])
    setShot({
      seq,
      sounds: moveSoundTimes(anim?.sounds ?? [], seq === null ? null : seq.sounds),
      kind,
      by: cast.by,
      at,
      also,
      doubles,
      family: elementFamilyForType(move?.type ?? 0),
      color: typeColor(move?.type ?? 0),
      signature: moveVisualSignature(anim),
      from: attacker,
      // 제 몸에 거는 것은 목표가 자기 자신이다
      to: kind === 'self-buff' ? attacker : target,
      cues: cuesOf(anim),
      // ⚠️ **몸통 높이에 건다.** 원작이 이미터를 붙이는 `WORLD_POS_TYPE_NORMAL`이
      // 스프라이트 한가운데라, 발밑에 붙이면 연출이 통째로 땅으로 내려온다
      place: {
        by: [attacker[0], torsoY(cast.by), attacker[1]],
        foe: [target[0], torsoY(at), target[1]],
        metre: splMetre((tallOf(cast.by) + tallOf(at)) / 2),
      },
      seed: cast.seq,
      startedAt: battleClock.now(),
      // 박자와 **같은 자리에서** 온다 — 어긋나면 연출이 잘리거나 빈 화면이 남는다
      frames: moveAnimFrames(anim, wazaFile),
      // 대본 자체가 서는 시간. 0이면 지금까지의 한 벌로 (`Shot.bodyFrames`)
      bodyFrames: Math.max(1, anim?.frames === undefined || anim.frames === 0
        ? MOVE_FRAMES
        : anim.frames),
    })
  }, [cast, table, anims, spotAt, doubles])

  return (
    <>
      {/*
        상태 이상·능력 변화 연출 (원작 「부분 연출」). 기술 연출과 같은 깃발 아래에 선다 —
        원작도 「전투 애니메이션」을 끄면 `PlayBattleAnimation`이 이 여덟을 안 튼다
        (`BtlCmd_PlayBattleAnimation`의 `BattleSystem_AreAnimationsOn`)
      */}
      <StatusVfx spotAt={spotAt} />
      {shot && <MoveShot shot={shot} setShot={setShot} spotAt={spotAt} />}
    </>
  )
}

/** 기술 한 번 — 도형과 원작 입자 */
function MoveShot({ shot, setShot, spotAt }: {
  shot: Shot
  setShot: (next: (now: Shot | null) => Shot | null) => void
  spotAt: (slot: SlotId) => [number, number]
}) {
  const voice = <MoveSounds key={`s${String(shot.seed)}`} sounds={shot.sounds} startedAt={shot.startedAt} mine={shot.by.startsWith('p1')} />
  if (shot.seq) {
    return (
      <>
      {voice}
      <BdspSequence
        key={shot.seed}
        plan={shot.seq}
        roles={[shot.by, shot.at]}
        reactors={shot.also}
        spotAt={spotAt as (slot: string) => [number, number]}
        startedAt={shot.startedAt}
        vanish={shot.signature.vanish}
        onDone={() => { setShot((now) => (now === null || now.seed === shot.seed ? null : now)) }}
      />
      </>
    )
  }
  return (
    <>
      {voice}
      <Shape
        // ⚠️ **연출마다 새 컴포넌트다.** 같은 인스턴스를 다시 쓰면 `useRef`에
        // 남은 앞 연출의 값이 이어진다 (`Shot.startedAt`의 머리말)
        key={shot.seed}
        shot={shot}
        done={(seq) => {
          setShot((now) => (now === null || now.seed === seq ? null : now))
        }}
      />
      {shot.cues !== null && shot.place !== null && (
        <SplParticles
          cues={shot.cues}
          by={shot.place.by}
          foe={shot.place.foe}
          metre={shot.place.metre}
          seed={shot.seed}
        />
      )}
    </>
  )
}

/**
 * 기술 소리 — 정한 시각이 지나면 한 번씩 낸다. 연출 시계로 잰다(탭을 숨기면 시계와 함께 선다 · `presentationClock`).
 * 연출이 끝나 이 컴포넌트가 내려가면 아직 안 낸 소리는 버린다 — 다음 기술 위로 앞 기술의 소리가 나지 않는다
 */
function MoveSounds({ sounds, startedAt, mine }: { sounds: readonly TimedSound[]; startedAt: number; mine: boolean }) {
  const played = useRef(0)
  useFrame(() => {
    const t = battleClock.now() - startedAt
    while (played.current < sounds.length && t >= sounds[played.current]!.at) {
      const s = sounds[played.current]!
      played.current += 1
      void music.playEffect(s.seq, 1, { pan: statusPan(s.pan, mine) })
    }
  })
  return null
}
