// 배틀팩토리 시설 장면 (PARITY §9.3) — `frontier_scripts_battle_factory.s`의 싱글·더블 갈래
//
// 로비 스크립트가 `LaunchBattleFrontierScene`으로 넘기면 원작은 **다른 VM**(오버레이 104)이 복도와 배틀룸을
// 굴린다. 그 VM은 옮기지 않았고, 이 파일이 그 스크립트의 차례를 그대로 밟는다:
//
//   상대 정보 → 「먼저 포켓몬 대여를」 → 고르기 → 「안으로 들어오세요」 → 인사(수철이면 등장) → 배틀
//   ├ 졌다   → 「대여 포켓몬과 맡겨둔 포켓몬을 교환」 → 저장 · LOAD_ACTION 3
//   ├ 일곱째 → BP · 「교환」 → 저장 · LOAD_ACTION 1
//   └ 이겼다 → 「수고하셨습니다」 + 팡파르 → 「다음은 N번째」 [계속한다 · 쉰다 · 포기한다]
//                계속 → 상대 정보 → 「교환을 하겠습니까?」 → (교환) → 「안으로」 …
//                쉰다 → 「리포트를 쓰고 종료」 → LOAD_ACTION 2 · 접어 두기 · 저장 · 끈다
//                포기 → 「중지하겠습니까?」 → 「교환」 · LOAD_ACTION 3 · 저장
//
// ⚠️ **끝낼 때 반드시 `LOAD_ACTION`을 적는다.** 로비는 그 값으로 뒤처리를 고른다
// (`scripts_init_battle_factory.s`) — 0xFF(도전 중)로 남기면 「저장 안 하고 껐다」가 뜨고 연승이 지워진다.
//
// ⚠️ **「기록한다」(배틀 비디오)는 안 띄운다.** 비디오를 남기는 곳이 없다. 원작도 비디오를 못 쓰는 판이면
// 그 줄을 뺀 목록을 띄운다(`_0D7E` — 계속한다 · 쉰다 · 포기한다)
import { ChallengeType, printAtNext } from './factory'
import { BATTLES_PER_ROUND } from './factoryTables'

/** `TEXT_BANK_BATTLE_FACTORY_SCENE` — `res/text/battle_factory_scene.json`의 차례 */
export const SCENE_TEXT = {
  choosePokemon: 0,
  goIn: 2,
  wellDone: 3,
  areYouReady: 4,
  tradeQuestion: 5,
  breakQuestion: 11,
  retireQuestion: 12,
  bpEarned: 16,
  receiveBp: 17,
  returnPokemon: 18,
  saving: 19,
  info3Mon: 21,
  info2Mon: 22,
  info1Mon: 23,
  infoFirstMove: 24,
  infoCommonType: 25,
  infoVariedTypes: 26,
  continueOption: 31,
  restOption: 33,
  retireOption: 34,
  headApproaching: 35,
  thortonIntro: 36,
  thortonIntroGold: 37,
  beatThorton: 38,
  beatThortonGold: 39,
} as const

/** 로비가 읽는 끝맺음 (`VAR_BATTLE_FACTORY_LOBBY_LOAD_ACTION`) */
export const LOAD_ACTION = { roundDone: 1, rested: 2, ended: 3, inProgress: 0xff } as const

/** 은·금 인쇄 (`VAR_BATTLE_FACTORY_PRINT_STATE`). 장면은 「받을 차례」까지만 적고 새기는 것은 로비다 */
export const PRINT_STATE = { none: 0, silverPending: 1, silver: 2, goldPending: 3, gold: 4 } as const

/** 소리 — `public/data/sound/index.json`의 `songs[]`에서 이름으로 찾은 번호 */
export const SCENE_SOUND = {
  /** `SEQ_SE_DP_KAIDAN2` — 배틀룸 문 */
  door: 1539,
  /** `SEQ_ASA` — 이긴 뒤 회복 */
  wellDone: 1166,
  /** `SEQ_PL_POINTGET3` — BP */
  bp: 1221,
  /** `SEQ_SE_PL_FAC01` — 수철이 연기 속에서 나온다 */
  thorton: 1412,
  /** `SEQ_SE_DP_SAVE` */
  save: 1563,
} as const

/** 게임 기록 (`generated/game_records.txt`) */
export const SCENE_RECORD = {
  /** `RECORD_UNK_059` — 시설장과 붙은 수 (`_0A82`) */
  headBattles: 59,
  /** `RECORD_BATTLE_FACTORY_VICTORIES` */
  victories: 60,
} as const

/** `VAR_BATTLE_FACTORY_LOBBY_LOAD_ACTION` · `VAR_BATTLE_FACTORY_PRINT_STATE` 두 칸 */
export type SceneVar = 'loadAction' | 'printState'

/**
 * 무대의 한 토막 — 판 · 사람 · 암전 (`scene/factoryStage`). 스크립트의 걸음 · 암전 · 문 소리 자리 그대로다:
 *
 *   open 복도에 들어선다 · appOut/appIn 빌리기 · 바꾸기 화면 앞뒤 · goIn 문으로 · toRoom 배틀룸에 들어가 불을 켠다 ·
 *   opponent 상대가 들어온다 · thorton 연기 속 수철(소리까지) · battle/afterBattle 배틀 앞뒤 · leaveRoom 상대가 나가고
 *   복도로(문 소리까지) · close 로비로 돌아가기 전 암전
 */
type StageCue =
  | 'open' | 'appOut' | 'appIn' | 'goIn' | 'toRoom' | 'opponent' | 'thorton' | 'battle' | 'brainBattle' | 'afterBattle' | 'leaveRoom' | 'close'

/** 상대 정보에 들어갈 이름들 — 첫 셋의 종족 · 첫 마리의 첫 기술 · 제일 많은 타입(없으면 null) */
export interface OpponentInfo {
  readonly species: readonly string[]
  readonly firstMove: string
  readonly commonType: string | null
}

/**
 * 장면이 바깥에 시키는 일.
 *
 * 글은 **장면 뱅크의 번호와 칸 값**으로 넘긴다 — 칸 번호가 곧 배열 자리다(`{STRVAR_1 0, 3, …}`는 3번 칸).
 * 연승 · 판 번호는 모델이 들고 있고 장면은 물어서 쓴다
 */
export interface FactorySceneHost {
  say(text: number, slots?: readonly string[]): Promise<void>
  /** 예/아니오. `yes`가 처음 커서 자리다 (`ShowYesNoMenu …, MENU_YES`) */
  yesNo(text: number, yes: boolean, slots?: readonly string[]): Promise<boolean>
  /** 글 뒤에 목록. 고른 줄의 자리, B면 null */
  list(text: number, options: readonly number[], slots?: readonly string[]): Promise<number | null>
  /** 시설 트레이너의 인사 (뱅크 614의 `번호 × 3`) */
  trainerIntro(trainer: number): Promise<void>
  /** 무대의 한 토막 — 끝날 때까지 선다 (`StageCue`) */
  stage(cue: StageCue): Promise<void>
  sound(seq: number): Promise<void>
  fanfare(seq: number): Promise<void>
  /** 「리포트를 작성하고 있습니다」를 띄운 채 쓴다 (`_137B`) */
  save(): Promise<void>
  /** 전원을 끈다 (`BF_FUNC_RESET_SYSTEM`) */
  reset(): void
  getVar(which: SceneVar): number
  setVar(which: SceneVar, value: number): void
  addRecord(id: number): void
  playerName(): string

  // ── 모델 ─────────────────────────────────────────────────────────────────
  challenge(): ChallengeType
  /** 지금 연승 (`currentStreak`) */
  streak(): number
  /** 이번 라운드에서 치른 판 수 0~7 (`unk_06`) */
  battle(): number
  /** 라운드 번호 (`unk_0E` — 들어올 때 연승 ÷ 7, 8에서 멈춘다) */
  round(): number
  /** 이번 판 상대 트레이너 */
  trainer(): number
  opponentInfo(): OpponentInfo
  /** 고른 셋의 종족 이름 (`BF_FUNC_UNK_34`) */
  partyNames(): readonly string[]
  rental(): Promise<void>
  trade(): Promise<void>
  /** 배틀을 치른다. 이겼으면 참 */
  fight(): Promise<boolean>
  /** 이겼다 — 판 수와 연승이 하나씩 오른다 (`BF_FUNC_UNK_14` · `INCREMENT_CURRENT_STREAK`) */
  won(): void
  /** 라운드를 마쳤다 — 표식을 세우고 기록을 적는다. 받을 BP (`BF_FUNC_UNK_22` · `UNK_35`) */
  finishRound(): number
  giveBattlePoints(bp: number): void
  /** 졌거나 포기했다 — 표식을 끄고 기록을 적는다 (`BF_FUNC_UNK_21`) */
  endChallenge(): void
  /** 쉰다 — 지금 판을 리포트에 접어 둔다 (`BF_FUNC_UNK_10`) */
  suspend(): void
  /** 0 ~ n−1 (`GetRandom`) */
  random(n: number): number
}

/** `_1612` — 표에 적는 연승은 9999에서 멈춘다 */
const nextStreak = (h: FactorySceneHost): number => Math.min(h.streak() + 1, 9999)

/** 상대 정보 (`_04A9` → `_05F3`). 라운드가 오를수록 덜 알려 준다 */
async function sayOpponentInfo(h: FactorySceneHost): Promise<void> {
  const info = h.opponentInfo()
  const [a = '', b = '', c = ''] = info.species
  switch (Math.min(h.round(), 4)) {
    case 0: return h.say(SCENE_TEXT.info3Mon, ['', a, '', b, '', c])
    case 1: return h.say(SCENE_TEXT.info2Mon, ['', a, '', b])
    case 2: return h.say(SCENE_TEXT.info1Mon, [info.firstMove, a])
    case 3: return h.say(SCENE_TEXT.infoFirstMove, [info.firstMove])
    default:
      return info.commonType === null
        ? h.say(SCENE_TEXT.infoVariedTypes)
        : h.say(SCENE_TEXT.infoCommonType, [info.commonType])
  }
}

/** 끝맺음 (`_12BF` → `_12F3`) — 교환 안내 · 저장 */
async function returnAndSave(h: FactorySceneHost, announce: boolean): Promise<void> {
  if (announce) await h.say(SCENE_TEXT.returnPokemon)
  await h.save()
  await h.sound(SCENE_SOUND.save)
  // `_1303` · `_115C` — 검게 닫고 로비로
  await h.stage('close')
}

/** 배틀룸에 들어가 한 판 (`_07DC` → `_084E` → `_0AD0`). 이겼으면 참 */
async function enterAndFight(h: FactorySceneHost): Promise<boolean> {
  await h.say(SCENE_TEXT.goIn)
  // `_07DC` → `_084E` — 과학자가 비켜서고 문으로 · 문 소리 · 배틀룸
  await h.stage('goIn')
  await h.sound(SCENE_SOUND.door)
  await h.stage('toRoom')
  const head = printAtNext(h.challenge(), h.streak())
  if (head !== 0) {
    // `_14E6` · `_150B` — 연기 속에서 수철이 나오고(`_154A` — 소리는 무대가 낸다) 빌린 셋을 읊는다. 넷째 칸은
    // 10~99 사이 아무 수다
    await h.stage('thorton')
    const names = h.partyNames()
    const slots = [names[0] ?? '', names[1] ?? '', names[2] ?? '', String(10 + h.random(90))]
    await h.say(head === 1 ? SCENE_TEXT.thortonIntro : SCENE_TEXT.thortonIntroGold, slots)
    h.addRecord(SCENE_RECORD.headBattles)
  } else {
    await h.stage('opponent')
    await h.trainerIntro(h.trainer())
  }
  // `_0A41` — 수철이면 브레인 컷인(`FrontierScrCmd_47 2`) · 아니면 트레이너 곡과 띠 늘이기(`FrontierScrCmd_3F 3`)
  await h.stage(head !== 0 ? 'brainBattle' : 'battle')
  const won = await h.fight()
  await h.stage('afterBattle')
  if (!won) {
    // `_1233` — 상대가 나가고 복도로
    await h.stage('leaveRoom')
    return false
  }
  h.addRecord(SCENE_RECORD.victories)
  // `_15AA` · `_15DE` — 은은 아직 없을 때만, 금은 은을 가진 뒤에만 「받을 차례」가 선다
  if (head === 1) {
    if (h.getVar('printState') === PRINT_STATE.none) h.setVar('printState', PRINT_STATE.silverPending)
    await h.say(SCENE_TEXT.beatThorton, [String(nextStreak(h))])
  } else if (head === 2) {
    if (h.getVar('printState') === PRINT_STATE.silver) h.setVar('printState', PRINT_STATE.goldPending)
    await h.say(SCENE_TEXT.beatThortonGold, [String(nextStreak(h))])
  }
  // `_0B30` — 상대가 나가고 복도로
  await h.stage('leaveRoom')
  return true
}

/** 어떻게 끝났나 — 시험이 갈래를 가른다 */
export type SceneEnd = 'lost' | 'roundDone' | 'rested' | 'retired'

/**
 * 장면 한 판.
 *
 * @param resume 쉬었던 도전을 잇는가 (로비의 `VAR_MAP_LOCAL_0x03`). 이으면 판 수가 0이 아니고 곧바로
 *               「다음은 N번째」로 간다 (`_0471`)
 */
export async function runFactoryScene(h: FactorySceneHost, resume: boolean): Promise<SceneEnd> {
  /** `VAR_0x8003` — 방금 이어 왔거나 기록을 남겼다. 시설장 예고를 건너뛴다 */
  let skipHeadNotice = resume && h.battle() > 0
  /** `BF_FUNC_UNK_41` — 시설장 예고는 한 장면에 한 번 */
  let headNoticed = false
  let atMenu = skipHeadNotice

  // `_0407` — 복도에 들어선다 (쉬었다 이어도 같다)
  await h.stage('open')
  if (!atMenu) {
    await sayOpponentInfo(h)
    await h.say(SCENE_TEXT.choosePokemon)
    await h.stage('appOut')
    await h.rental()
    await h.stage('appIn')
  }

  for (;;) {
    if (!atMenu) {
      const won = await enterAndFight(h)
      if (!won) {
        // `_1233` → `_12AA`
        h.endChallenge()
        h.setVar('loadAction', LOAD_ACTION.ended)
        await returnAndSave(h, true)
        return 'lost'
      }
      h.won()
      if (h.battle() >= BATTLES_PER_ROUND) {
        // `_0BD9` — 라운드를 마쳤다
        const bp = h.finishRound()
        h.setVar('loadAction', LOAD_ACTION.roundDone)
        await h.say(SCENE_TEXT.bpEarned)
        h.giveBattlePoints(bp)
        await h.say(SCENE_TEXT.receiveBp, [h.playerName(), String(bp)])
        await h.fanfare(SCENE_SOUND.bp)
        await returnAndSave(h, true)
        return 'roundDone'
      }
      // `_0C17`
      await h.say(SCENE_TEXT.wellDone)
      await h.fanfare(SCENE_SOUND.wellDone)
      skipHeadNotice = false
    }
    atMenu = false

    // `_0C29` — 판 사이 메뉴
    for (;;) {
      if (printAtNext(h.challenge(), h.streak()) !== 0 && !skipHeadNotice && !headNoticed) {
        headNoticed = true
        await h.say(SCENE_TEXT.headApproaching, [String(nextStreak(h))])
      }
      const picked = await h.list(
        SCENE_TEXT.areYouReady,
        [SCENE_TEXT.continueOption, SCENE_TEXT.restOption, SCENE_TEXT.retireOption],
        [String(h.battle() + 1)],
      )
      if (picked === 0) break
      if (picked === 1) {
        // `_113E` — 쉰다
        if (!await h.yesNo(SCENE_TEXT.breakQuestion, true)) continue
        h.setVar('loadAction', LOAD_ACTION.rested)
        h.suspend()
        await returnAndSave(h, false)
        h.reset()
        return 'rested'
      }
      // `_1199` — 포기한다 (B도 여기로 온다)
      if (!await h.yesNo(SCENE_TEXT.retireQuestion, false)) continue
      await h.say(SCENE_TEXT.returnPokemon)
      h.endChallenge()
      h.setVar('loadAction', LOAD_ACTION.ended)
      await returnAndSave(h, false)
      return 'retired'
    }

    // `_0E9F` — 계속한다
    await sayOpponentInfo(h)
    if (await h.yesNo(SCENE_TEXT.tradeQuestion, true)) {
      await h.stage('appOut')
      await h.trade()
      await h.stage('appIn')
    }
  }
}
