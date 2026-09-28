// 게임코너 슬롯머신 한 번 앉기 (PARITY §7.6 · `ScrCmd_267`)
//
// 필드가 연다(`scene/fieldServices`의 `slots`) — 화면이 닫히면 `onClose`가 코인 · 연속 보너스 변수 · 기록을 옮긴다
// (`ov101_021D0F3C` · `sub_0203E35C`). 그동안 게임코너 스크립트는 `ScrCmd_267`에 서 있다
import { create } from 'zustand'
import type { SlotOutcome } from '../engine/gameCorner/slotMachine'
import { useMenuStore } from './menuStore'

interface SlotSession {
  /** 기계 번호 0~11 */
  readonly machine: number
  /** 그 기계의 오늘 설정 0~5 (`slotSetting`) */
  readonly setting: number
  readonly coins: number
  readonly onClose: (outcome: SlotOutcome) => void
}

interface SlotState {
  session: SlotSession | null
  open: (session: SlotSession) => void
  close: (outcome: SlotOutcome) => void
}

export const useSlotStore = create<SlotState>((set, get) => ({
  session: null,
  open: (session) => {
    set({ session })
    useMenuStore.getState().open('slots')
  },
  close: (outcome) => {
    const session = get().session
    if (!session) return
    set({ session: null })
    const menu = useMenuStore.getState()
    if (menu.stack.includes('slots')) menu.back()
    session.onClose(outcome)
  },
}))
