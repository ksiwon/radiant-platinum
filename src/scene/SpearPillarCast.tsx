// 창기둥 영상의 배우 넷 — 주인공 · 태홍 · 디아루가 · 펄기아를 BDSP 3D 몸으로 세운다 (PARITY §8.15)
//
// 원작은 넷을 2D 판때기로 그리고(`billboard`), 걸음 무늬가 그림을 갈아 끼운다. 우리는 같은 자리 · 같은 걸음에 BDSP 몸을 세운다.
// 땅 · 기둥 · 구슬 · 은하 · 호수 · 기라티나는 여전히 원작 DS 모델이다 (`SpearPillarMovieStage`).
//
//   자리 · 크기   `movieLive.movie.shown`의 그 물체 — 발밑이 자리다(판때기도 아래 가운데가 자리였다). 무대 한 유닛은 한 칸이다
//   보는 쪽 · 몸짓  걸음 무늬 + 지금 그려진 그림 (`engine/world/spearPillarCast`). 걸으면 걷고 서면 선다. 돌아설 때는 몸이 돈다
//   디아루가 · 펄기아  나타나는 배율 곡선(0 · 0.3 · 0.6 · 1 · 1.2 · 1.1 · 1)을 곱한다. 튀어나와 우는 때(`pops`의 끝)에 울음 동작
//
// ⚠️ **사람의 걸음은 절차형이다** (`actor/locomotion`) — 오프닝 · 명예의 전당의 주인공과 같다. 태홍의 몸(`tr1086_00`)에는
// 걷기 클립이 없고 주인공의 것을 옮겨 오는 길(`NpcModels`)은 필드 NPC 전용이라 여기서는 안 탄다
import { useEffect, useLayoutEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Group } from 'three'
import { createRig, updateLocomotion, type Rig } from '../engine/actor/locomotion'
import { WALK_SPEED, RUN_SPEED } from '../engine/actor/player'
import { BDSP_TO_WORLD, normalizeModel, PLAYER_HEIGHT } from '../engine/model/normalize'
import { personPose, turnToward } from '../engine/world/spearPillarCast'
import { fxTiles } from './demoInstance'
import { useMonBody } from './monBody'
import { motionClipSeconds, play } from './battle/monModel'
import { usePersonModel } from './personModel'
import { playerModelPath } from './playerModelPath'
import { movieLive } from './spearPillarMovie'

const FX = 4096

/** 이 열쇠의 물체가 영상에서 그려질 때 3D 몸으로 세우는가 — 로딩에서도 이 이름은 DS 모델을 안 받는다 */
export const BDSP_CAST = new Set(['dialga', 'palkia', 'hero', 'heroine', 'cyrus'])

/** 디아루가 · 펄기아가 서는 키(칸) — 원작 판때기가 그려진 폭(`shots/spearMovie`의 scene2-text22 · 약 100px)에 BDSP 몸의 폭을 맞췄다 — 몸의 키는 `MonBody.tall`(배틀 배율을 먹인 값) */
const LEGEND_HEIGHT = 2.2
/** 서 있는 몸이 도는 빠르기 — 필드 NPC의 한 번 돌기(`NpcModels`의 `TURN_RATE`)와 같다 (라디안/초) */
const TURN_RATE = (Math.PI / 2) / (8 / 60)
/** 걷는 동안 사람 걸음에 주는 빠르기 (m/s) — 영상의 걸음(0.94칸/초)에 걸음걸이가 너무 안 미끄러지는 값 */
const MOVIE_STEP_SPEED = 1.6

function shownOf(key: string) {
  return movieLive.movie?.shown.objects.find((o) => o.key === key) ?? null
}

/** 사람 하나 — `key`는 영상 물체 이름(`player` · `cyrus`) */
export function MovieHuman({ objectKey, path, height }: { objectKey: string, path: ReturnType<typeof playerModelPath> | `models/npc/${string}.glb`, height: number | 'bdsp' }) {
  const outer = useRef<Group>(null)
  const wrapper = useRef<Group>(null)
  const model = usePersonModel(path)
  const rig = useRef<Rig | null>(null)
  const yaw = useRef(Number.NaN)

  useLayoutEffect(() => {
    if (!wrapper.current || !model) return
    // 'bdsp' — 그 몸의 원래 키에 필드 NPC와 같은 배율을 곱한다 (사람 사이 키 차이는 원작 그대로 남는다)
    const tall = height === 'bdsp' ? normalizeModel(wrapper.current, model, 1).nativeHeight * BDSP_TO_WORLD : height
    normalizeModel(wrapper.current, model, tall)
    rig.current = createRig(model, wrapper.current, path)
    return () => { rig.current = null }
  }, [model, path, height])

  useFrame((_, delta) => {
    const node = outer.current
    if (!node) return
    const me = shownOf(objectKey)
    node.visible = me !== null && model !== null
    if (!me) return
    node.position.set(fxTiles(me.pos[0]), fxTiles(me.pos[1]), fxTiles(me.pos[2]))
    const pose = personPose(me.pattern, me.active, Math.floor((me.frame[0] ?? 0) / FX))
    yaw.current = Number.isNaN(yaw.current) ? pose.yaw : turnToward(yaw.current, pose.yaw, TURN_RATE * delta)
    node.rotation.y = yaw.current
    if (rig.current) updateLocomotion(rig.current, delta, pose.walking ? MOVIE_STEP_SPEED : 0, WALK_SPEED, RUN_SPEED)
  })

  return (
    <group ref={outer} name={objectKey} visible={false}>
      <group ref={wrapper}>{model && <primitive object={model} />}</group>
    </group>
  )
}

/** 디아루가 · 펄기아 — 몸이 오면 서고, 튀어나와 우는 때 울음 동작을 한 번 튼다 */
export function MovieLegend({ objectKey, species, which }: { objectKey: string, species: number, which: 0 | 1 }) {
  const outer = useRef<Group>(null)
  const body = useMonBody(species)
  /** 지난 틱에 튀어나오기가 끝나 있었는가 — 처음 본 틱에 이미 끝나 있으면(장면 2에서 다시 서는 몸) 울지 않는다 */
  const wasDone = useRef<boolean | null>(null)

  // 울음이 끝나면 대기로 돌아온다
  useEffect(() => {
    if (!body) return
    const back = () => { play(body, 'wait') }
    body.mixer.addEventListener('finished', back)
    return () => { body.mixer.removeEventListener('finished', back) }
  }, [body])

  useFrame(() => {
    const node = outer.current
    if (!node || !body) return
    const me = shownOf(objectKey)
    node.visible = me !== null
    if (!me) return
    node.position.set(fxTiles(me.pos[0]), fxTiles(me.pos[1]), fxTiles(me.pos[2]))
    // 나타나는 배율은 x에만 걸린다(원작 판때기는 가로로만 부푼다) — 3D 몸에는 한 배율로 곱한다
    node.scale.setScalar((LEGEND_HEIGHT / body.tall) * (me.scale[0] / FX))
    // 영상 안 카메라(+z)를 본다
    node.rotation.y = 0
    const pop = movieLive.movie?.pops.find((p) => p.which === which)
    const done = pop !== undefined && pop.state === 2
    if (done && wasDone.current === false && motionClipSeconds(body, 'cry') !== null) play(body, 'cry')
    wasDone.current = done
  })

  return (
    <group ref={outer} name={objectKey} visible={false}>
      {body && <primitive object={body.root} />}
    </group>
  )
}

/** 영상 안 빛 — 원작 두 빛 쪽(위 · 앞)에서 흰빛, 어두운 쪽을 채우는 약한 환경 */
export function MovieCastLights() {
  return (
    <>
      <ambientLight intensity={1.1} />
      <directionalLight position={[0, 10, 8]} intensity={2.2} />
    </>
  )
}

/** 사람 키 — 주인공은 필드와 같은 1.5칸, 태홍은 그 몸의 키에 `BDSP_TO_WORLD` */
export const HUMAN_HEIGHT = { player: PLAYER_HEIGHT, cyrus: 'bdsp' } as const
