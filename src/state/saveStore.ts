// 세이브 상태 (PLAN §3.2 ①) — 영속. React 리렌더는 저빈도라 zustand로 충분하다.
// 프레임 단위 값(좌표 등)은 절대 여기 넣지 않는다. worldState가 담당한다.
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { idbStorage } from './idbStorage'

/** 전국도감 493종을 담는 비트필드 크기 (ceil(493/8) = 62, 여유 두어 64) */
export const DEX_BYTES = 64

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

// Phase 1에서 확장한다. 지금은 필드의 존재와 자리를 확정하는 것이 목적 —
// 마이그레이션 체인을 v1부터 시작해 두어야 나중에 붙일 필요가 없다.
export interface PokemonInstance {
  species: number
  level: number
}

export type ItemId = string

export interface SaveData {
  version: number
  trainer: TrainerInfo
  party: PokemonInstance[]
  boxes: PokemonInstance[][]
  bag: Record<ItemId, number>
  badges: number // 비트마스크
  pokedex: { seen: DexField; caught: DexField }
  flags: Record<string, boolean | number>
  position: { mapId: string; x: number; y: number; z: number; facing: number }
  money: number
}

export const SAVE_VERSION = 1

export function createNewSave(): SaveData {
  return {
    version: SAVE_VERSION,
    trainer: { name: '', gender: 'girl', id: 0, secretId: 0, playtimeMs: 0 },
    party: [],
    boxes: [],
    bag: {},
    badges: 0,
    pokedex: { seen: new Uint8Array(DEX_BYTES), caught: new Uint8Array(DEX_BYTES) },
    flags: {},
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
  setFlag: (key: string, value: boolean | number) => void
  addPlaytime: (ms: number) => void
  resetSave: () => void
}

/** 마이그레이션 체인 — 버전을 올릴 때마다 케이스를 덧붙인다 */
function migrate(persisted: unknown, from: number): SaveData {
  let s = persisted as SaveData
  if (from < 1) s = { ...createNewSave(), ...s, version: 1 }
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

      setFlag: (key, value) => set((s) => ({ flags: { ...s.flags, [key]: value } })),

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
