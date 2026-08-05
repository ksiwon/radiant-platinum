// 세이브 상태 (PLAN §3.2 ①) — 영속. React 리렌더는 저빈도라 zustand로 충분하다.
// 프레임 단위 값(좌표 등)은 절대 여기 넣지 않는다. worldState가 담당한다.
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { idbStorage } from './idbStorage'

/** 전국도감 493종을 담는 비트필드 크기 (ceil(493/8) = 62, 여유 두어 64) */
export const DEX_BYTES = 64

/** 스크립트 플래그 4106개를 담는 바이트 수 */
export const FLAG_BYTES = Math.ceil(FLAG_COUNT / 8)

/**
 * 도감 비트필드. `Uint8Array`는 기본이 `ArrayBufferLike`라 SharedArrayBuffer 뷰까지 허용하는데,
 * 세이브 데이터는 structured clone으로 오가는 독립 버퍼여야 하므로 `ArrayBuffer`로 좁힌다.
 */
export type DexField = Uint8Array<ArrayBuffer>

export interface TrainerInfo {
  name: string
  gender: 'boy' | 'girl'
  id: number
  secretId: number
  playtimeMs: number
}

// 개체 모델은 엔진이 갖는다 — 능력치·경험치 계산이 붙어 있고 배틀에서도 같은 것을
// 쓴다. 여기서 다시 정의하면 두 벌이 어긋난다.
import type { PokemonInstance } from '../engine/pokemon/instance'
import { FLAG_COUNT, SAVED_VAR_COUNT } from '../engine/script/vars'

export type { PokemonInstance }

export type ItemId = string

/**
 * 스크립트 플래그·변수 (DATA.md §2.10).
 *
 * 이름표 붙은 불리언 묶음이 아니라 **원작과 같은 번호 공간**이다. 스크립트가
 * `SetFlag 342`처럼 번호로 쓰고, 그 번호가 NPC의 등장 조건이기도 하다 —
 * 우리가 이름을 새로 지으면 그 고리가 끊긴다.
 */
export type SaveFlags = Uint8Array<ArrayBuffer>
export type SaveVars = Uint16Array<ArrayBuffer>

export interface SaveData {
  version: number
  trainer: TrainerInfo
  /** 라이벌 이름. 대사에 끼워 넣는다 (`BufferRivalName`) */
  rivalName: string
  party: PokemonInstance[]
  boxes: PokemonInstance[][]
  bag: Record<ItemId, number>
  badges: number // 비트마스크
  pokedex: { seen: DexField; caught: DexField }
  /** 스크립트 플래그 4106개 */
  flags: SaveFlags
  /** 스크립트 변수 288칸 */
  vars: SaveVars
  position: { mapId: string; x: number; y: number; z: number; facing: number }
  money: number
}

export const SAVE_VERSION = 2

export function createNewSave(): SaveData {
  return {
    version: SAVE_VERSION,
    trainer: { name: '', gender: 'girl', id: 0, secretId: 0, playtimeMs: 0 },
    rivalName: '',
    party: [],
    boxes: [],
    bag: {},
    badges: 0,
    pokedex: { seen: new Uint8Array(DEX_BYTES), caught: new Uint8Array(DEX_BYTES) },
    flags: new Uint8Array(FLAG_BYTES),
    vars: new Uint16Array(SAVED_VAR_COUNT),
    position: { mapId: 'twinleaf', x: 0, y: 0, z: 0, facing: 0 },
    money: 3000,
  }
}

/** 도감 비트필드 헬퍼 — dexNo는 1부터 시작하는 전국도감 번호 */
export function dexHas(field: Uint8Array, dexNo: number): boolean {
  const i = dexNo - 1
  return (field[i >> 3]! & (1 << (i & 7))) !== 0
}

export function dexSet(field: Uint8Array, dexNo: number): DexField {
  // 불변 갱신 — 구독자가 변화를 감지할 수 있어야 한다.
  // new Uint8Array(view)는 ArrayBufferLike로 추론되므로 길이로 만들고 복사한다.
  const next = new Uint8Array(field.length)
  next.set(field)
  const i = dexNo - 1
  next[i >> 3]! |= 1 << (i & 7)
  return next
}

interface SaveStore extends SaveData {
  /** 비동기 스토리지라 첫 프레임에는 아직 복원 전일 수 있다 */
  hydrated: boolean
  markSeen: (dexNo: number) => void
  markCaught: (dexNo: number) => void
  /** 스크립트 한 판이 끝날 때 그 결과를 통째로 받는다 */
  commitScriptState: (vars: ArrayLike<number>, flags: ArrayLike<number>) => void
  addPlaytime: (ms: number) => void
  resetSave: () => void
}

/** 마이그레이션 체인 — 버전을 올릴 때마다 케이스를 덧붙인다 */
function migrate(persisted: unknown, from: number): SaveData {
  let s = persisted as SaveData
  if (from < 1) s = { ...createNewSave(), ...s, version: 1 }
  // 2에서 `flags`가 이름표 묶음에서 원작의 번호 공간으로 바뀌었다. 옛 값은
  // 옮길 곳이 없다 — 그 시절 플래그를 쓰는 코드가 하나도 없었다
  if (from < 2) s = { ...s, ...createNewSave(), version: 2, party: s.party, boxes: s.boxes }
  return s
}

export const useSaveStore = create<SaveStore>()(
  persist(
    (set) => ({
      ...createNewSave(),
      hydrated: false,

      markSeen: (dexNo) =>
        set((s) => ({ pokedex: { ...s.pokedex, seen: dexSet(s.pokedex.seen, dexNo) } })),

      markCaught: (dexNo) =>
        set((s) => ({
          pokedex: {
            seen: dexSet(s.pokedex.seen, dexNo), // 잡았으면 본 것이기도 하다
            caught: dexSet(s.pokedex.caught, dexNo),
          },
        })),

      // 복사해서 넣는다 — 엔진 쪽 배열은 프레임마다 제자리에서 바뀌므로
      // 그대로 두면 스토어가 변화를 못 보고 저장도 안 된다
      commitScriptState: (vars, flags) =>
        set({ vars: Uint16Array.from(vars), flags: Uint8Array.from(flags) }),

      addPlaytime: (ms) =>
        set((s) => ({ trainer: { ...s.trainer, playtimeMs: s.trainer.playtimeMs + ms } })),

      resetSave: () => set(createNewSave()),
    }),
    {
      name: 'save',
      storage: idbStorage<SaveStore>(),
      version: SAVE_VERSION,
      migrate: migrate as (p: unknown, v: number) => SaveStore,
      // 액션은 저장하지 않는다 — 상태만
      partialize: (s) =>
        ({
          version: s.version,
          trainer: s.trainer,
          party: s.party,
          boxes: s.boxes,
          bag: s.bag,
          badges: s.badges,
          pokedex: s.pokedex,
          flags: s.flags,
          vars: s.vars,
          rivalName: s.rivalName,
          position: s.position,
          money: s.money,
        }) as SaveStore,
      // IndexedDB는 비동기라 복원 완료 시점을 UI가 알아야 한다.
      // 이 시점 이전에 저장하면 빈 세이브가 실제 세이브를 덮어쓴다.
      onRehydrateStorage: () => () => {
        useSaveStore.setState({ hydrated: true })
      },
    },
  ),
)
