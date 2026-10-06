// BDSP 연출 시퀀스 받기 — 기술 · 볼 (BATTLE_FX §4).
//
// `data/fx/index.json`이 표다: `moves[기술 번호].seq` = `ew033` 같은 시퀀스 이름,
// `balls[볼 번호]` = `{ capture, ballout }` 프리팹 이름. 표가 없으면(이펙트 묶음을 안 깔았으면)
// 모든 것이 DS 입자로 떨어진다.
//
// ⚠️ **기술 길이는 동기로 답해야 한다.** 박자(`playback`)가 기술 사건을 꺼내는 그 순간에
// `moveFramesOf`로 길이를 묻는다. 그때 시퀀스를 받고 있으면 늦으므로, 판이 열리면 명부의
// 기술들(`RosterEntry.moves`)을 미리 받아 계획까지 펴 둔다(`preloadMoveSeqs`).
// 못 받은 기술은 DS 길이로 간다 — 그 판의 그 한 번만 DS 연출이 선다.
import { assets, onProviderSwap, readJson } from '../../../data/providers/assetProvider'
import { battleOptions, planSequence, type SeqData, type SeqPlan } from '../../../engine/battle/fx/sequence'
import type { BallMeta } from '../../../engine/battle/fx/ballPlans'
import { loadFxPrefab } from './fxAssets'

interface FxIndex {
  balls: Record<string, { capture: string; ballout: string }>
  moves: Record<string, { seq?: string }>
  /** 볼 모델 표와 파일 (`import/bdsp/fx.ts`의 `BallModelTable`) — 옛 판으로 구운 묶음에는 없다 */
  ballModel?: BallMeta & { files: Record<string, string> }
  /** 종 → 내보내기 착지 갈래 (`MoveType`, 0이 아닌 것만) */
  moveType?: Record<string, number>
  prefabs?: string[]
  missingPrefabs?: string[]
  /** 구운 시퀀스 이름 전부 */
  sequences?: string[]
  /** 상태 이상 · 능력 변화 시퀀스 이름들 (`es001`…) — 3판부터 */
  status?: string[]
  /** 날씨 번호(`WeatherData` 차례 — 1 쾌청 · 2 비 · 3 싸라기눈 · 4 모래바람) → 무대에 깔리는 프리팹 — 3판부터 */
  weather?: Record<string, string>
}

let index: Promise<FxIndex | null> | null = null
const seqs = new Map<string, Promise<SeqData | null>>()
/** 받아 펴 둔 기술 계획. 열쇠는 `기술:내쪽여부:더블여부:실내여부` */
const plans = new Map<string, SeqPlan>()

/** 이 판의 무대가 실내인가 — 무대가 설 때 정한다(`setSeqIndoor`). 시퀀스의 무대 갈래(`GroupOption 28`)를 고른다 */
let indoorField = false
export function setSeqIndoor(indoor: boolean): void {
  indoorField = indoor
}

onProviderSwap(() => {
  index = null
  installed = null
  seqs.clear()
  plans.clear()
  statusPlans.clear()
})

/** 표를 받아 봤는가 — 받기 전 `null` */
let installed: boolean | null = null

/** 이펙트 표. 묶음을 안 깔았으면 `null` */
export function fxIndex(): Promise<FxIndex | null> {
  index ??= (async () => {
    const provider = assets()
    if (!(await provider.exists('data/fx/index.json'))) return null
    return (await readJson(provider, 'data/fx/index.json')) as FxIndex
  })().catch(() => null).then((got) => { installed = got !== null; return got })
  return index
}

/** BDSP 이펙트 묶음이 깔렸는가 (동기). 표를 아직 안 받았으면 `false` — 판이 열리기 전에 `fxIndex()`를 걸어 둔다 */
export function bdspFxInstalled(): boolean {
  return installed === true
}

/** 시퀀스 한 벌. 없으면 `null` */
export function loadSeq(name: string): Promise<SeqData | null> {
  let got = seqs.get(name)
  if (!got) {
    got = (readJson(assets(), `data/fx/seq/${name}.json`) as Promise<SeqData>).catch(() => null)
    seqs.set(name, got)
  }
  return got
}

/**
 * 판이 열리면 부른다 — 기술마다 시퀀스를 받아 계획을 펴 두고, 프리팹도 미리 받는다.
 *
 * @param ball 쓰는 볼 번호는 기술과 상관없어 4(몬스터볼 자리표시)로 편다
 */
export async function preloadMoveSeqs(moves: Iterable<number>): Promise<void> {
  const idx = await fxIndex()
  if (!idx) return
  const missing = new Set((idx.missingPrefabs ?? []).map((p) => p.toLowerCase()))
  const todo = [...new Set(moves)].filter((m) => idx.moves[String(m)]?.seq)
  await Promise.all(todo.map(async (move) => {
    const name = idx.moves[String(move)]!.seq!
    const seq = await loadSeq(name)
    if (!seq) return
    // ⚠️ **쪽마다 따로 정한다.** 짝 · 홀 묶음(`GroupOption`)이 쪽마다 다른 프리팹을 골라서, 한쪽만
    // 빠질 수 있다. 빠진 쪽만 DS로 가고 그 쪽의 길이도 DS가 낸다 (`moveFramesOf`가 같은 표를 본다)
    // 싱글 · 더블 갈래(`GroupOption 0`)와 야외 · 실내 갈래(`GroupOption 28`)도 따로 편다 — 그 판에서만 서는 묶음이 있다 (`battleOptions`)
    for (const mine of [true, false]) {
      for (const doubles of [false, true]) {
        for (const indoor of [false, true]) {
          const plan = planSequence(seq, { attackerMine: mine, options: battleOptions(doubles, indoor) })
          // 프리팹이 하나라도 빠졌으면 이 쪽은 DS로 간다 — 반쪽짜리 BDSP 연출보다 낫다
          if (plan.particles.some((p) => missing.has(p.prefab.toLowerCase()))) continue
          // 화면에 아무것도 안 세우는 시퀀스도 DS로 간다 — `DummyLabel` 한 줄뿐인 빈 칸이 49벌 있다(속여때리기 `ew185` ·
          // 진흙폭탄 `ew426` · 유혹 `ew445` …). 계획을 세우면 무대가 DS 몫을 다 끄므로 그 기술은 아무것도 안 보였다
          if (showsNothing(plan)) continue
          plans.set(`${move}:${mine ? 1 : 0}:${doubles ? 1 : 0}:${indoor ? 1 : 0}`, plan)
          for (const p of plan.particles) void loadFxPrefab(p.prefab).catch(() => { /* 그릴 때 다시 */ })
        }
      }
    }
  }))
}

/**
 * 시퀀스가 화면에 세우는 것이 하나도 없는가 — 입자 · 시퀀스 모델 · 몸 · 다른 몸 감추기 · 흔들림 · 배경색이 없고 카메라는
 * 제자리로 돌리는 것뿐이다. 소리 · 게이지 · 글만 있는 계획이 그렇다
 */
export function showsNothing(plan: SeqPlan): boolean {
  return plan.particles.length === 0 && plan.models.length === 0 && plan.others.length === 0
    && plan.shakes.length === 0 && plan.back.length === 0
    && plan.body.every((t) => t.commands.length === 0)
    && plan.camera.every((c) => c.name.startsWith('CameraReset'))
}

/**
 * 상태 이상 · 능력 변화 → BDSP 시퀀스. `BattleMiscEffectData`가 원작 부분 연출 자리에 거는 것이고, 프리팹 이름이 뜻이다
 * (`es001_nemuri` 잠 · `es002_poison` · `es003_fire` · `es004_ice` · `es005_paralysis` · `es006_confusion` · `es008_up` · `es009_down`)
 */
export const STATUS_SEQ: Readonly<Record<string, string>> = {
  asleep: 'es001', poisoned: 'es002', burned: 'es003', frozen: 'es004',
  paralyzed: 'es005', confused: 'es006', statBoost: 'es008', statDrop: 'es009',
}

/** 받아 편 상태 연출 계획. 열쇠는 `상태:내쪽여부` */
const statusPlans = new Map<string, SeqPlan>()

/** 상태 연출 시퀀스를 받아 편다 — 판이 열릴 때 한 번. 묶음이 옛 판(2)이면 표에 `status`가 없어 DS로 간다 */
export async function preloadStatusSeqs(): Promise<void> {
  const idx = await fxIndex()
  const have = new Set(idx?.status ?? [])
  if (!idx || have.size === 0) return
  const missing = new Set((idx.missingPrefabs ?? []).map((p) => p.toLowerCase()))
  await Promise.all(Object.entries(STATUS_SEQ).map(async ([key, name]) => {
    if (!have.has(name)) return
    const seq = await loadSeq(name)
    if (!seq) return
    for (const mine of [true, false]) {
      // ⚠️ **상태 연출은 쓴 쪽과 맞는 쪽이 같은 마리다** — 원작 `BattleController_EmitPlayStatusEffect`. 시퀀스는 역할 0만 겨눈다
      const plan = planSequence(seq, { attackerMine: mine, options: battleOptions(false, indoorField), camera: false })
      if (plan.particles.some((p) => missing.has(p.prefab.toLowerCase())) || showsNothing(plan)) continue
      statusPlans.set(`${key}:${mine ? 1 : 0}`, plan)
      for (const p of plan.particles) void loadFxPrefab(p.prefab).catch(() => { /* 그릴 때 다시 */ })
    }
  }))
}

/** 색이 다른 포켓몬이 나올 때 별이 튄다 — `ee003`(「レア」). 옛 판 묶음이면 `null` */
export async function shinySeqPlan(mine: boolean): Promise<SeqPlan | null> {
  const idx = await fxIndex()
  if (!idx?.sequences?.includes('ee003')) return null
  const seq = await loadSeq('ee003')
  if (!seq) return null
  // ⚠️ **`GroupOption 29`가 자리를 고른다** — 231 · 232는 대상 0, 234 · 235는 2, 237 · 238은 7, 240 · 241은 9(BDSP 자리 번호)를
  // 겨누는 같은 별 묶음이다. 우리는 역할 0에 그 마리를 두므로 231(대상 0)을 고른다. 안 주면 묶음이 다 빠져 별이 하나도 안 섰다
  const plan = planSequence(seq, { attackerMine: mine, options: { ...battleOptions(false, indoorField), 29: 231 }, camera: false })
  for (const p of plan.particles) void loadFxPrefab(p.prefab).catch(() => { /* 그릴 때 다시 */ })
  return plan.particles.length > 0 ? plan : null
}

/** 받아 둔 상태 연출 계획 (동기). 없으면 DS 연출이다 */
export function statusSeqPlan(key: string, mine: boolean): SeqPlan | null {
  return statusPlans.get(`${key}:${mine ? 1 : 0}`) ?? null
}

/** 받아 둔 기술 계획 (동기). 없으면 DS 연출이다 */
export function moveSeqPlan(move: number | null, attackerMine: boolean, doubles = false): SeqPlan | null {
  if (move === null) return null
  return plans.get(`${move}:${attackerMine ? 1 : 0}:${doubles ? 1 : 0}:${indoorField ? 1 : 0}`) ?? null
}

/** 볼 번호의 프리팹 둘. 표에 없으면 몬스터볼(4) */
export async function ballPrefabs(ball: number): Promise<{ capture: string; ballout: string } | null> {
  const idx = await fxIndex()
  if (!idx) return null
  return idx.balls[String(ball)] ?? idx.balls['4'] ?? null
}
