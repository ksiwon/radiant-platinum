import { create } from 'zustand'

export type DoorPhase = 'closed' | 'opening' | 'open' | 'closing'

export interface DoorVisual {
  tag: number
  x: number
  z: number
  yaw: number
  phase: DoorPhase
  since: number
}

export function doorYaw(x: number, z: number, playerX: number, playerZ: number): number {
  const dx = x + 0.5 - playerX
  const dz = z + 0.5 - playerZ
  if (Math.abs(dx) > Math.abs(dz)) return Math.atan2(Math.sign(dx), 0)
  return Math.atan2(0, Math.sign(dz) || 1)
}

interface DoorVisualStore {
  doors: Record<number, DoorVisual>
  load: (x: number, z: number, tag: number, playerX: number, playerZ: number) => void
  open: (tag: number) => void
  close: (tag: number) => void
  unload: (tag: number) => void
  clear: () => void
}

function phase(doors: Record<number, DoorVisual>, tag: number, next: DoorPhase) {
  const door = doors[tag]
  return door ? { ...doors, [tag]: { ...door, phase: next, since: performance.now() } } : doors
}

/** 스크립트 문 명령과 R3F 메시 사이의 상태 다리. */
export const useDoorVisualStore = create<DoorVisualStore>()((set) => ({
  doors: {},
  load: (x, z, tag, playerX, playerZ) => {
    set((state) => ({
      doors: {
        ...state.doors,
        [tag]: { tag, x, z, yaw: doorYaw(x, z, playerX, playerZ), phase: 'closed', since: performance.now() },
      },
    }))
  },
  open: (tag) => { set((state) => ({ doors: phase(state.doors, tag, 'opening') })) },
  close: (tag) => { set((state) => ({ doors: phase(state.doors, tag, 'closing') })) },
  unload: (tag) => {
    set((state) => {
      const doors = { ...state.doors }
      delete doors[tag]
      return { doors }
    })
  },
  clear: () => { set({ doors: {} }) },
}))
