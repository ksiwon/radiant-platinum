// 조우 컷인을 세계에 붙인다 (`engine/battle/encounterCutIn`)
//
// 규칙과 프레임 표는 엔진 쪽에 있고, 여기는 **언제 걸고 무엇이 그것을 보는가**만
// 한다 — 걸음 계수기가 `engine/actor/steps`와 `scene/stepSystem`으로 갈린 것과
// 같은 나눔이다.
//
// 원작의 차례가 그대로다 (`encounter.c`의 `FieldTask_Encounter`):
//
//   ① 사람과 사람을 멈춘다        `MapObjectMan_PauseAllMovement`
//   ② 컷인을 돌린다               `FieldTransition_StartEncounterEffect`
//   ③ **끝나면** 맵을 내리고 배틀을 부른다
//
// ⚠️ **③이 ②를 기다리는 것이 요점이다.** 안 기다리면 배틀 화면이 컷인 위로
// 덮여서, 두 번 번쩍이는 동안 화면에 이미 체력 상자가 서 있다.
import { cutInForBattle, cutInFrame, EncounterCutIn, specialCutInFor } from '../engine/battle/encounterCutIn'
import { trainerCutIn, type SpecialCutIn } from '../engine/battle/cutInTrainer'
import { bannerCutIn, type CutInContext } from '../engine/battle/cutInBanner'
import { eliteCutIn } from '../engine/battle/cutInElite'
import { readSpa, type SplFile } from '../engine/battle/spl/resource'
import { assets } from '../data/providers/assetProvider'
import { terrainOf } from '../engine/battle/terrain'
import { mapById, world as mapWorld } from '../engine/map/world'
import { worldState } from '../state/worldState'
import { useSaveStore } from '../state/saveStore'
import { loadTrainerNames, loadTrainers } from '../data/gameData'
import { gameLocale } from '../state/optionsStore'
import { battleSongFor } from '../engine/audio/battleSongs'
import { markCutIn } from '../app/sceneMark'

let running: SpecialCutIn | null = null

/**
 * 컷인과 함께 트는 배틀 곡 — **컷인 첫 틱에 곡이 바뀐다** (`FieldTask_RunEncounterEffect` 0단계가 `EncounterEffect_Start` 바로 뒤에
 * `Sound_SetSceneAndPlayBGM(SOUND_SCENE_BATTLE, …)`). 곡 지휘자(`scene/MusicDirector`)가 본다. 배틀이 열리면 배틀 가게가 같은 곡을
 * 고르므로 다시 안 튼다
 */
export const cutInSong: { now: number | null } = { now: null }

/**
 * 화면에 그릴 수 있는 원작 셈 컷인 (`cutInTrainer` — 덮개 `ui/field/cutInCanvas`가 `CutInFrame.draw`를 그린다).
 *
 * ⚠️ **안 그려지는 것을 걸면 공 없는 번쩍임만 남는다** — 여기 없는 번호는 들판 여섯(`EncounterCutIn`)이나 지형대로 돈다
 */
const DRAWN: ReadonlySet<number> = new Set(Array.from({ length: 25 }, (_, i) => i + 6))

/** 이름을 적는 컷인 (관장 · 사천왕 · 챔피언) — 이름표가 오기를 기다린 뒤에 건다. 사천왕 · 챔피언은 입자 두 벌도 */
const NAMED = (effect: number): boolean => effect >= 12 && effect <= 24
let trainerNames: readonly string[] = []
let eliteParticles: (SplFile | null)[] = [null, null]
let namesLoading: Promise<void> | null = null
/** 트레이너 이름표 · 사천왕 입자 — 못 받으면 이름 칸이 비고 입자 없이 돈다 */
function namesReady(): Promise<void> {
  namesLoading ??= Promise.all([
    loadTrainerNames(gameLocale()).then((n) => { trainerNames = n }),
    Promise.all([1, 2].map(async (n) => readSpa(new Uint8Array(await assets().bytes(`data/encounterEffect/eliteParticle${String(n)}.spa`)))))
      .then((got) => { eliteParticles = got }, () => { /* 입자만 빈다 */ }),
  ]).then(() => undefined, () => { namesLoading = null })
  return namesLoading
}

function context(): CutInContext {
  return {
    trainerName: (id) => trainerNames[id] ?? '',
    playerGender: useSaveStore.getState().trainer.gender === 'girl' ? 1 : 0,
    particles: (n) => eliteParticles[n - 1] ?? null,
  }
}

/** 번호 하나의 컷인 — 그릴 수 있는 것은 `cutInTrainer` · `cutInBanner`가 든다 */
function cutInOf(effect: number): SpecialCutIn {
  if (!DRAWN.has(effect)) return new EncounterCutIn(effect)
  const ctx = context()
  return trainerCutIn(effect) ?? bannerCutIn(effect, ctx) ?? eliteCutIn(effect, ctx) ?? new EncounterCutIn(effect)
}
let waiting: (() => void)[] = []

/**
 * 컷인 하나를 걸고 **끝날 때까지 기다린다.**
 *
 * 돌아온 뒤에 배틀을 연다 — 원작의 `FieldTask_Encounter`가 그 차례다.
 * 이미 도는 것이 있으면 그것이 끝나기를 기다리고 새로 안 건다
 */
function runCutIn(effect: number): Promise<void> {
  if (running === null) {
    running = cutInOf(effect)
    cutInFrame.now = null
    markCutIn(effect)
  }
  return new Promise((resolve) => waiting.push(resolve))
}

/** 컷인이 도는 중인가 — 원작에서는 `FieldTask_Encounter`가 도는 동안이다 */
export function cutInRunning(): boolean {
  return running !== null
}

/**
 * 맵을 옮기거나 배틀이 딴 길로 열리면 지운다.
 *
 * ⚠️ **기다리던 쪽을 반드시 풀어 준다.** 안 풀면 `runCutIn`을 기다리던 자리가
 * 영영 서고 그 배틀이 안 열린다
 */
export function resetCutIn(): void {
  running = null
  cutInSong.now = null
  cutInFrame.now = null
  markCutIn(null)
  const woken = waiting
  waiting = []
  for (const resolve of woken) resolve()
}

export const cutInSystem = {
  fixedUpdate(): void {
    if (running === null) return
    const at = running.tick()
    cutInFrame.now = at
    if (!at.done) return
    // ⚠️ **끝난 프레임의 그림은 남겨 둔다** — 그 프레임이 검정이고, 배틀 화면이
    // 제 검은 막을 올리기 전까지 그 검정이 이음매를 덮는다. 지우는 것은
    // `resetCutIn`이고 배틀이 열린 뒤에 부른다
    running = null
    const woken = waiting
    waiting = []
    for (const resolve of woken) resolve()
  },
}

/**
 * 이 자리에서 배틀을 열면 어느 컷인인가.
 *
 * 지형은 **밟고 선 칸**이 먼저다 — 무대 고르기·도롱마담 옷감과 같은 자
 * (`battle/terrain`의 `terrainOf`)를 쓴다. 원작도 컷인과 무대가 같은 `dto->terrain`을 본다.
 *
 * ⚠️ **파도타기 중이면 물이다.** 그때 밟고 선 칸이 실제로 물 거동값이라
 * `terrainOf`가 알아서 물을 낸다 — 여기서 따로 갈라 두면 두 자리가 갈린다
 */
/** 배틀 하나의 조우 — 컷인이 보는 것 (`FieldBattleDTO`의 그 몫) */
interface CutInBattle {
  trainer: boolean
  foeLevel: number
  /** 첫 상대의 분류 (`dto->trainer[1].header.trainerType`) */
  trainerClass?: number
  /** `BATTLE_TYPE_DOUBLES` */
  doubles?: boolean
  /** 야생의 「싸울 수 있는 첫 마리」 종족 */
  foeSpecies?: number
}

function cutInFor(o: CutInBattle): number {
  const special = specialCutInFor({
    trainerClass: o.trainer ? (o.trainerClass ?? -1) : null,
    doubles: o.doubles ?? false,
    foeSpecies: o.foeSpecies ?? 0,
  })
  if (special !== null && DRAWN.has(special)) return special
  const here = mapWorld.grid?.behaviorAtWorld(
    worldState.player.position.x, worldState.player.position.z) ?? null
  // ⚠️ **선두가 아니라 「싸울 수 있는 첫 마리」다** (`Party_FindFirstEligibleBattler`).
  // 리펠이 보는 그 마리와 같다 (`scene/stepSystem`의 `publishMods`)
  const mine = useSaveStore.getState().party.find((m) => !m.isEgg && m.hp > 0)
  return cutInForBattle({
    trainer: o.trainer,
    terrain: terrainOf(here, mapById(mapWorld.mapId)?.battleBg ?? -1),
    myLevel: mine?.level ?? 0,
    foeLevel: o.foeLevel,
  })
}

/**
 * 컷인을 돌리고 **끝난 뒤에** 배틀을 연다 (`FieldTask_Encounter`의 0 → 2단계).
 *
 * ⚠️ **연 다음 곧바로 지운다.** 배틀 화면이 제 검은 막을 들고 뜨므로
 * (`ui/battle/battleScreen.css`의 `wipe`) 이음매는 그쪽이 덮는다. 안 지우면
 * 컷인의 마지막 검정이 배틀 위에 영영 남는다
 */
export async function cutInThenBattle(
  o: CutInBattle, open: () => void,
): Promise<void> {
  const effect = cutInFor(o)
  if (NAMED(effect)) await namesReady()
  cutInSong.now = battleSongFor({
    kind: o.trainer ? 'trainer' : 'wild',
    trainerClass: o.trainer ? (o.trainerClass ?? null) : null,
    doubles: o.doubles ?? false,
    foeSpecies: o.foeSpecies ?? 0,
    mapId: mapWorld.mapId,
  })
  await runCutIn(effect)
  open()
  resetCutIn()
}

/**
 * 트레이너전도 같은 차례다 (`FieldTask_Encounter`가 야생·트레이너를 안 가른다).
 *
 * ⚠️ **상대 레벨을 먼저 알아야 한다** — 컷인 번호가 그것으로 갈린다. 트레이너의
 * 첫 마리가 곧 `Party_FindFirstEligibleBattler`의 답이다(막 만든 파티라 아무도
 * 안 쓰러져 있다). 표를 여기서 먼저 받지만 **더 기다리게 되지는 않는다** —
 * 배틀이 어차피 같은 표를 받고(`battleStore`), 받아 둔 것은 캐시된다
 *
 * ⚠️ **못 받으면 컷인 없이 연다.** 소리·연출 때문에 배틀 자체가 안 열리면 안 된다
 */
export async function cutInThenTrainerBattle(
  trainerID: number, open: () => void, pair: { second?: number } = {},
): Promise<void> {
  let battle: CutInBattle
  try {
    const table = await loadTrainers()
    const trainer = table.get(trainerID)
    // 더블은 배틀 가게와 같은 자로 잰다 (`battleStore.startTrainer`의 `doubles`) — 트레이너 둘이면 늘 더블이고, 한 사람의 더블은
    // 양쪽 다 두 마리가 있어야 선다. 편(`partner`)은 상대가 둘일 때만 서므로 따로 안 본다
    const second = pair.second ?? 0
    const other = second !== 0 && second !== trainerID
    const able = useSaveStore.getState().party.filter((m) => !m.isEgg && m.hp > 0).length
    battle = {
      trainer: true,
      foeLevel: trainer.party[0]?.level ?? 0,
      trainerClass: trainer.class,
      doubles: other || (trainer.double && trainer.party.length >= 2 && able >= 2),
    }
  } catch { open(); return }
  await cutInThenBattle(battle, open)
}

/**
 * 컷인의 **한 프레임에 세워 둔다** (개발 콘솔 `pt.cutIn`).
 *
 * ⚠️ **화면으로 확인할 길이 이것뿐이다.** 컷인은 서른여덟 프레임에 지나가는데
 * 헤드리스는 초당 네댓 장밖에 못 그려서(`pnpm shot` 머리말) 도중을 못 잡는다.
 * 그래서 굴리지 않고 **그 프레임의 값을 그대로 얹어 둔다** — 덮개도 후처리도
 * 카메라도 `cutInFrame.now` 하나만 보므로 그 프레임이 화면에 그대로 선다.
 *
 * `frame`이 음수면 지운다
 */
export function pinCutIn(effect: number, frame: number): void {
  resetCutIn()
  if (frame < 0) return
  if (NAMED(effect) && trainerNames.length === 0) {
    // 이름표가 아직이면 받고 나서 세운다 — 콘솔에서 부르는 길이라 한 박자 늦어도 된다
    void namesReady().then(() => { pinCutIn(effect, frame) })
    return
  }
  const cut = cutInOf(effect)
  let at = cut.tick()
  for (let i = 0; i < frame; i += 1) at = cut.tick()
  cutInFrame.now = at
}
