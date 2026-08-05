// 스크립트가 바깥 세계에 부탁하는 것들 (DATA.md §2.10)
//
// 엔진(`engine/script`)은 React도 zustand도 모른다. 배틀 화면을 열고, 세이브의
// 파티를 세고, 트레이너 자료를 받는 일은 전부 여기서 이어 붙인다.
//
// 배틀 결과를 붙잡는 방식이 조금 특이하다. 배틀 스토어는 화면을 닫을 때
// `outcome`을 지우는데, 스크립트는 **닫힌 뒤에** 결과를 묻는다. 그래서 결과가
// 정해지는 순간 여기서 따로 받아 둔다.
import { loadDialogueBank, loadTrainers } from '../data/gameData'
import { fieldScripts } from '../engine/script/field'
import { useBattleStore } from '../state/battleStore'
import { useSaveStore } from '../state/saveStore'
import type { Trainer } from '../data/schema'

/** `TEXT_BANK_NPC_TRAINER_MESSAGES` — 트레이너 928명의 싸움 전후 대사 */
const TRAINER_MESSAGE_BANK = 617

/** 지금 배틀의 결과. 스크립트가 물어볼 때까지 들고 있는다 */
let battleResult: 'win' | 'loss' | null = null
/** 배틀을 스크립트가 열었는가. 야생 조우까지 여기 걸리면 안 된다 */
let waiting = false

let trainers: { get(id: number): Trainer } | null = null
let trainerMessages: string[] = []

/**
 * 배틀 스토어를 지켜본다.
 *
 * `outcome`이 정해지는 순간을 잡는다 — 화면이 닫히면 지워지기 때문이다
 */
function watchBattle(): () => void {
  return useBattleStore.subscribe((state, prev) => {
    if (!waiting) return
    if (state.outcome !== null && prev.outcome === null) {
      battleResult = state.outcome === 'win' ? 'win' : 'loss'
    }
    // 화면이 닫혀야 스크립트를 놓아준다. 결과만 나오고 화면이 떠 있으면
    // 대사창이 배틀 위에 겹친다
    if (state.phase === 'off' && prev.phase !== 'off') waiting = false
  })
}

/** 스크립트가 쓰는 바깥 세계를 붙인다. 정리 함수를 돌려준다 */
export function installFieldServices(locale: 'en' | 'ko' | 'ja' = 'ko'): () => void {
  void loadTrainers().then((table) => { trainers = table }).catch(() => { /* 이름만 빈다 */ })
  void loadDialogueBank(locale, TRAINER_MESSAGE_BANK)
    .then((bank) => { trainerMessages = bank })
    .catch(() => { /* 대사만 빈다 */ })

  // 세계가 먼저 만들어져 있을 수 있다. 그 자리에도 넣어 준다
  if (fieldScripts.world !== null) fieldScripts.world.services = services
  fieldScripts.services = services
  const stop = watchBattle()
  return () => {
    stop()
    fieldScripts.services = {}
  }
}

const services = {
  startTrainerBattle(trainerID: number): void {
    battleResult = null
    waiting = true
    void useBattleStore.getState().startTrainer(trainerID).catch(() => {
      // 배틀을 못 열면 스크립트가 영영 기다린다. 진 것으로 놓아준다
      battleResult = 'loss'
      waiting = false
    })
  },

  battleResult(): 'win' | 'loss' | null {
    return waiting ? null : battleResult
  },

  trainer(id: number): { double: boolean, msg: Record<string, number> } | null {
    const found = trainers?.get(id)
    return found === undefined ? null : { double: found.double, msg: found.msg }
  },

  trainerMessage(index: number): string {
    return trainerMessages[index] ?? ''
  },

  aliveMons(): number {
    return useSaveStore.getState().party.filter((mon) => mon.hp > 0).length
  },
}
