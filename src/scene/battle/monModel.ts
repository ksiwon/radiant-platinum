// 배틀에 서는 포켓몬 3D 모델 (DATA.md §2.17.2)
//
// 4세대 배틀은 포켓몬이 80×80 도트 한 장이었고 우리도 그렇게 세워 왔다. 무대가
// BDSP의 진짜 3D가 되고 나서는 **그 한 장만 화면에서 튄다** — 앞쪽에 선 내
// 포켓몬이 픽셀 덩어리로 크게 뜬다. 공식 리메이크가 같은 493마리를 3D로 다시
// 만들어 두었으므로 무대를 가져온 자리에서 몸도 가져온다
// (`tools/extract/bdspPokemon.py`).
//
// ⚠️ **크기를 여기서 만지지 않는다.** 모델은 실측 크기로 구워져 있고(모부기
// 0.4m · 레쿠쟈 10.9m) 그대로 세우면 한 화면에 못 담는데, **프리팹의 자세가
// 이미 배틀 배율을 담고 있다.** 재어 보면 정확히 그렇다 — 자세를 먹인 뒤의 키가
// 모부기 0.79 = 0.40×1.98, 잠만보 1.81 = 2.03×0.89, 강철톤 0.85 = 1.66×0.51로
// `PokemonInfo.BattleScale`과 맞아떨어진다. 한 번 더 곱하면 네 배가 된다.
import {
  AnimationMixer, LoadingManager, LoopOnce, LoopRepeat,
  type AnimationAction, type AnimationClip, type Group,
} from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { clone as cloneSkinned } from 'three/addons/utils/SkeletonUtils.js'
import { modelUrl } from '../../data/assetBase'

/** 한 종의 모델 정보 */
export interface MonEntry {
  file: string
  /** 바인드 포즈에서 잰 키(m). 배율 곱하기 전이다 */
  height: number
  /** 배틀에서 곱하는 배율 (`BattleScale`) */
  scale: number
}

export interface MonIndex { pokemon: Record<string, MonEntry> }

let index: Promise<MonIndex> | null = null

export function loadMonIndex(): Promise<MonIndex> {
  index ??= fetch(modelUrl('pokemon/index.json'))
    .then((r) => (r.ok ? (r.json() as Promise<MonIndex>) : { pokemon: {} }))
    .catch(() => ({ pokemon: {} }))
  return index
}

/**
 * 배틀에서 쓰는 동작.
 *
 * BDSP 클립 이름은 `pm0387_00_00_ba10_waitA01`처럼 **번호가 뜻**이다:
 * `ba01` 등판(착지) · `ba02` 울음 · `ba10` 대기 · `ba20` 물리 · `ba21` 특수 ·
 * `ba30` 피격. 종마다 A·B·C 변주가 있어서 앞자리로만 고른다
 */
export const MOTION = {
  enter: /_ba01_/,
  cry: /_ba02_/,
  wait: /_ba10_/,
  physical: /_ba20_/,
  special: /_ba21_/,
  damage: /_ba30_/,
} as const

export type MotionName = keyof typeof MOTION

/** 그 동작의 클립. 없으면 대기, 그것도 없으면 첫 클립 */
export function clipFor(clips: readonly AnimationClip[], want: MotionName): AnimationClip | null {
  return clips.find((c) => MOTION[want].test(c.name))
    ?? clips.find((c) => MOTION.wait.test(c.name))
    ?? clips[0]
    ?? null
}

interface Loaded { scene: Group; clips: AnimationClip[]; entry: MonEntry }

const loader = new GLTFLoader(new LoadingManager())
const cache = new Map<number, Promise<Loaded | null>>()

/**
 * 한 종의 모델.
 *
 * 종마다 0.8MB라 493종이 388MB다 — **배틀이 열릴 때 그 두 마리만** 받는다.
 * 같은 종을 여럿 데리고 있어도 한 벌이면 되므로 캐시한다
 */
export function loadMonModel(species: number): Promise<Loaded | null> {
  let got = cache.get(species)
  if (!got) {
    got = loadMonIndex()
      .then(async (idx) => {
        const entry = idx.pokemon[String(species)]
        if (!entry) return null
        const gltf = await loader.loadAsync(modelUrl(`pokemon/${entry.file}`))
        return { scene: gltf.scene, clips: gltf.animations, entry }
      })
      .catch(() => null)
    cache.set(species, got)
  }
  return got
}

/**
 * 세울 몸 한 벌.
 *
 * ⚠️ **원본을 그대로 씬에 넣으면 안 된다.** 같은 종이 양쪽에 서면 하나의 뼈대를
 * 둘이 나눠 쓰게 되어 같은 자세로 함께 움직인다 — NPC에서 이미 겪었다
 * (`NpcModels`). `SkeletonUtils.clone`이 뼈까지 복제한다
 */
export interface MonBody {
  root: Group
  mixer: AnimationMixer
  clips: readonly AnimationClip[]
  /** 지금 도는 동작. 갈아 끼울 때 여기서 섞어 나간다 */
  action: AnimationAction | null
}

export function makeBody(loaded: Loaded): MonBody {
  const root = cloneSkinned(loaded.scene) as Group
  root.traverse((o) => {
    o.castShadow = true
    o.receiveShadow = false
    // ⚠️ **절두체 컬링을 끈다.** three가 스킨 메시의 경계구를 뼈로 다시 재는데,
    // 우리 모델에서는 그 값이 엉뚱하게 나온다 — 딱구리가 (−93, 0, 47)에
    // 반지름 0.09로 잡혀서 **통째로 잘려 나갔다.** 스킨은 멀쩡하다(파이썬으로
    // 정점을 직접 먹여 보면 제자리에 선다). 배틀에 서는 것이 두 마리뿐이라
    // 컬링을 끄는 값이 컬링으로 아끼는 값보다 크다
    o.frustumCulled = false
  })
  return { root, mixer: new AnimationMixer(root), clips: loaded.clips, action: null }
}

/** 이 동작만 되풀이한다. 나머지는 한 번 돌고 그 자세로 멈춘다 */
const LOOPS: ReadonlySet<MotionName> = new Set<MotionName>(['wait'])

/**
 * 동작을 갈아 끼운다.
 *
 * ⚠️ **딱 끊으면 안 된다.** 때리다 말고 대기로 튀면 뼈가 순간이동한다 —
 * 0.15초에 걸쳐 섞는다. 원작(BDSP)도 모션 사이를 블렌드한다
 * (`PokemonMotionBlendTime`이 종마다 그 시간을 적어 두었다)
 */
export function play(body: MonBody, want: MotionName): void {
  const clip = clipFor(body.clips, want)
  if (!clip) return
  const next = body.mixer.clipAction(clip)
  next.reset()
  next.setLoop(LOOPS.has(want) ? LoopRepeat : LoopOnce, Infinity)
  next.clampWhenFinished = !LOOPS.has(want)
  if (body.action && body.action !== next) next.crossFadeFrom(body.action, 0.15, false)
  next.play()
  body.action = next
}
