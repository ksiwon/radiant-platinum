// 배틀팩토리 시설 장면을 게임에 잇는다 (PARITY §9.3)
//
// 차례는 `engine/frontier/factoryScene`이 들고, 여기는 그 차례가 시키는 일을 **필드의 것**으로 한다:
// 글과 메뉴는 필드 대사창(`sayOurs` · `askOurs`), 소리 · 저장 · 기록은 필드 서비스, 판의 값은 `factoryStore`.
//
// ⚠️ **대사창은 원작 글이다.** 장면 뱅크(365)와 트레이너 뱅크(614)의 줄을 칸만 채워 올린다 —
// 우리 글(`showOurText`)의 길을 빌릴 뿐, 지어낸 문장은 없다
import { APP_ROOT } from '../data/assetBase'
import { fillMenuText } from '../data/uiText'
import { askOurs, fieldScripts, sayOurs } from '../engine/script/field'
import { MENU_NO, MENU_YES } from '../engine/script/world'
import {
  VAR_BATTLE_FACTORY_LOBBY_LOAD_ACTION, VAR_BATTLE_FACTORY_PRINT_STATE,
} from '../engine/script/vars'
import { ChallengeType } from '../engine/frontier/factory'
import {
  runFactoryScene, SCENE_SOUND, SCENE_TEXT, type FactorySceneHost, type SceneEnd,
} from '../engine/frontier/factoryScene'
import { opponentGfx } from '../engine/frontier/stageMotion'
import { closeFactoryStage, factoryStageStep, type StageStep } from './factoryStage'

/** 주인공 그림 (`OBJ_EVENT_GFX_PLAYER_M` · `_F`) — `GetPlayerObjEventGfx` */
const PLAYER_M_GFX = 0
const PLAYER_F_GFX = 97
import {
  factoryTables, giveFactoryBattlePoints, useFactoryStore,
} from '../state/factoryStore'
import { useSaveStore } from '../state/saveStore'

/** 한 프레임씩 들여다보며 기다린다 — 소리 · 저장은 끝났다는 알림이 없다 */
function until(done: () => boolean): Promise<void> {
  return new Promise((resolve) => {
    const look = (): void => { if (done()) resolve(); else setTimeout(look, 16) }
    look()
  })
}

function sceneLine(at: number, slots: readonly string[] = []): string {
  return fillMenuText(factoryTables()?.scene[at] ?? '', slots)
}

const VAR_OF = {
  loadAction: VAR_BATTLE_FACTORY_LOBBY_LOAD_ACTION,
  printState: VAR_BATTLE_FACTORY_PRINT_STATE,
} as const

function host(): FactorySceneHost {
  const store = useFactoryStore.getState
  const services = () => fieldScripts.services
  return {
    say: (text, slots) => sayOurs(sceneLine(text, slots)),
    yesNo: async (text, yes, slots) =>
      await askOurs(sceneLine(text, slots), { kind: 'yesno', cursor: yes ? MENU_YES : MENU_NO }) === MENU_YES,
    list: async (text, options, slots) => {
      const picked = await askOurs(sceneLine(text, slots), {
        kind: 'list',
        entries: options.map((o, i) => ({ text: sceneLine(o), value: i })),
        cursor: 0,
        canCancel: true,
      })
      return picked >= 0 ? picked : null
    },
    trainerIntro: (trainer) => sayOurs(store().trainerIntro(trainer)),
    stage: async (cue) => {
      const sound = services().sound
      const playerGfx = useSaveStore.getState().trainer.gender === 'girl' ? PLAYER_F_GFX : PLAYER_M_GFX
      const step: StageStep =
        cue === 'opponent' ? { kind: 'opponent', gfx: opponentGfx(store().trainerClass()) }
          : cue === 'thorton' ? { kind: 'thorton', sound: () => { sound?.playEffect(SCENE_SOUND.thorton) } }
            : cue === 'leaveRoom' ? {
              kind: 'leaveRoom',
              door: async () => {
                if (!sound) return
                sound.playEffect(SCENE_SOUND.door)
                await until(() => !sound.effectPlaying(SCENE_SOUND.door))
              },
            }
              : { kind: cue }
      await factoryStageStep(step, playerGfx)
    },
    sound: async (seq) => {
      const sound = services().sound
      if (!sound) return
      sound.playEffect(seq)
      await until(() => !sound.effectPlaying(seq))
    },
    fanfare: async (seq) => {
      const sound = services().sound
      if (!sound) return
      sound.playFanfare(seq)
      await until(() => !sound.fanfarePlaying())
    },
    save: async () => {
      // `_137B` — 「리포트를 작성하고 있습니다」를 **한 번에** 찍고 아이콘을 띄운 채 쓴다
      const world = fieldScripts.world
      const save = services().saveGame
      world?.showText(sceneLine(SCENE_TEXT.saving))
      world?.printer?.finish()
      if (save) {
        save.showIcon()
        save.begin()
        await until(() => save.result() !== null)
        save.hideIcon()
      }
      world?.closeBox(true)
    },
    reset: () => { location.assign(APP_ROOT) },
    getVar: (which) => fieldScripts.vars.get(VAR_OF[which]),
    setVar: (which, value) => { fieldScripts.vars.set(VAR_OF[which], value) },
    addRecord: (id) => { services().records?.add(id, 1) },
    playerName: () => useSaveStore.getState().trainer.name,

    challenge: () => store().round?.challenge ?? ChallengeType.SINGLE,
    streak: () => store().round?.streak ?? 0,
    battle: () => store().round?.battle ?? 0,
    round: () => store().roundNumber(),
    trainer: () => store().trainer(),
    opponentInfo: () => store().opponentInfo(),
    partyNames: () => store().partyNames(),
    rental: () => store().rental(),
    trade: () => store().trade(),
    fight: () => store().fight(),
    won: () => { store().won() },
    finishRound: () => store().finishRound(),
    giveBattlePoints: (bp) => { giveFactoryBattlePoints(bp) },
    endChallenge: () => { store().endChallenge() },
    suspend: () => { store().suspend() },
    random: (n) => Math.floor(Math.random() * n),
  }
}

let running = false

/** 장면이 도는 중인가 — 참인 동안 로비 스크립트가 `LaunchBattleFrontierScene`에 서 있다 */
export function factorySceneRunning(): boolean {
  return running
}

/**
 * 장면을 연다 (`FRONTIER_SCENE_FACTORY_CORRIDOR`).
 *
 * ⚠️ **표를 못 받으면 곧바로 끝낸다.** 그때 `LOAD_ACTION`은 로비가 적어 둔 0xFF 그대로라, 다음에 로비가
 * 열리면 원작의 「저장 안 하고 껐다」로 닫힌다 — 도전이 없었던 것과 같은 결과다
 */
export function openFactoryScene(challenge: ChallengeType, openLevel: boolean, resume: boolean): void {
  if (running) return
  running = true
  void (async (): Promise<SceneEnd | null> => {
    const store = useFactoryStore.getState()
    if (!await store.open(challenge, openLevel, resume)) return null
    return runFactoryScene(host(), resume)
  })()
    .catch((e: unknown) => { console.error('배틀팩토리 장면', e) })
    .finally(() => {
      closeFactoryStage()
      useFactoryStore.getState().close()
      running = false
    })
}
