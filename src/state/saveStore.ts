// 세이브 상태 (PLAN §3.2 ①). React 리렌더는 저빈도라 zustand로 충분하다.
// 프레임 단위 값(좌표 등)은 절대 여기 넣지 않는다. worldState가 담당한다.
//
// ⚠️ **저절로 저장되지 않는다.** 예전에는 zustand persist가 값이 바뀔 때마다
// IndexedDB에 썼는데, 그러면 "리포트"라는 것이 의미가 없다 — 리포트를 안 쓰고
// 꺼도 다음에 켜면 걸어 둔 자리에 그대로 서 있다. 원작은 리포트를 쓴 그 순간만
// 남긴다. 디스크로 나가는 문은 `report()` 하나뿐이다 (`state/report.ts`).
import { create } from 'zustand'
import { clearReport, readReport, writeReport } from './report'

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

// 가방은 사전이 아니라 **주머니 8개 × 칸**이다. 원작이 그렇고, 그 모양이
// 화면에도 그대로 드러난다 (칸 수 상한·번호순 정렬)
import { addItem, emptyBag, removeItem, type Pockets } from '../engine/bag/bag'

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
  bag: Pockets
  badges: number // 비트마스크
  pokedex: { seen: DexField; caught: DexField }
  /** 스크립트 플래그 4106개 */
  flags: SaveFlags
  /** 스크립트 변수 288칸 */
  vars: SaveVars
  /**
   * 리포트를 쓴 자리.
   *
   * 엔진과 **같은 번호 체계**다 — `map`은 맵 헤더 번호, `matrix`는 그 맵이 선
   * 격자 번호다. 워프가 쓰는 것과 같은 짝이라 되돌아갈 때 그대로 넘겨주면 된다.
   * `map`이 음수면 아직 리포트를 안 쓴 새 판이고, 그때는 기본 스폰으로 간다
   */
  position: { map: number; matrix: number; x: number; z: number; facing: number }
  money: number
}

export const SAVE_VERSION = 4

/** 원작 상한. 이걸 넘으면 돈이 안 늘어난다 */
export const MAX_MONEY = 999999

/**
 * 새 세이브의 가방.
 *
 * ⚠️ **원작은 빈 가방으로 시작한다.** 몬스터볼 5개는 예진호수에서 마박사가
 * 주는 것이고, 그 장면은 인트로 스크립트에 있는데 인트로가 아직 없다. 지금
 * 빈 가방으로 두면 야생 포켓몬을 아예 못 잡으므로 그 자리를 임시로 채운다 —
 * 인트로가 붙으면 이 함수는 `emptyBag()`으로 되돌려야 한다
 */
function startingBag(): Pockets {
  const POKE_BALL = 4
  const POTION = 17
  return addItem(addItem(emptyBag(), POCKET_BALLS, POKE_BALL, 5)!, POCKET_MEDICINE, POTION, 5)!
}

const POCKET_BALLS = 2
const POCKET_MEDICINE = 1

export function createNewSave(): SaveData {
  return {
    version: SAVE_VERSION,
    // 이름은 비워 둔다. 원작은 인트로에서 짓게 하고, 그 화면이 붙기 전까지는
    // 씬이 롬의 제안 이름 첫 줄을 넣어 준다 (`MapStreamer`) — 우리가 이름을
    // 지어내지 않으려는 것이다.
    //
    // 트레이너 번호는 진짜 난수여야 한다. 0으로 두면 잡은 포켓몬이 전부 "다른
    // 사람이 잡은 것"이 아니라 같은 번호를 갖게 되고, 이로치 판정도 한쪽으로 쏠린다
    trainer: {
      name: '',
      gender: 'girl',
      id: Math.floor(Math.random() * 0x10000),
      secretId: Math.floor(Math.random() * 0x10000),
      playtimeMs: 0,
    },
    rivalName: '',
    party: [],
    boxes: [],
    bag: startingBag(),
    badges: 0,
    pokedex: { seen: new Uint8Array(DEX_BYTES), caught: new Uint8Array(DEX_BYTES) },
    flags: new Uint8Array(FLAG_BYTES),
    vars: new Uint16Array(SAVED_VAR_COUNT),
    position: { map: -1, matrix: 0, x: 0, z: 0, facing: 0 },
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
  /** 리포트를 한 번 찾아봤는가. IndexedDB가 비동기라 첫 프레임에는 아직이다 */
  hydrated: boolean
  /** 이 판이 리포트에서 이어 온 것인가. 타이틀이 "이어하기"를 띄울지 정한다 */
  loaded: boolean
  markSeen: (dexNo: number) => void
  markCaught: (dexNo: number) => void
  /** 스크립트 한 판이 끝날 때 그 결과를 통째로 받는다 */
  commitScriptState: (vars: ArrayLike<number>, flags: ArrayLike<number>) => void
  addPlaytime: (ms: number) => void
  /** 넣는다. 자리가 없으면 false — 스크립트가 그 결과로 갈린다 */
  addItem: (pocket: number, item: number, count: number) => boolean
  removeItem: (pocket: number, item: number, count: number) => boolean
  addMoney: (amount: number) => void
  /** 낸다. 모자라면 false */
  spendMoney: (amount: number) => boolean
  /**
   * 리포트를 쓴다. **디스크로 나가는 유일한 문이다.**
   *
   * 자리는 인자로 받는다 — 좌표는 프레임 상태(`worldState`)에 있고 이 스토어가
   * 그것을 알면 저빈도/고빈도 경계가 무너진다
   */
  report: (position: SaveData['position']) => Promise<void>
  /** 리포트를 읽어 그 자리에서 이어한다. 없으면 false */
  loadReport: () => Promise<boolean>
  /** 처음부터. 리포트도 같이 지운다 — 안 지우면 다음에 켤 때 옛 판이 되살아난다 */
  resetSave: () => Promise<void>
}

/** 상태 필드만. 액션은 저장하지 않는다 */
function snapshot(s: SaveStore, position: SaveData['position']): SaveData {
  return {
    version: SAVE_VERSION,
    trainer: s.trainer,
    rivalName: s.rivalName,
    party: s.party,
    boxes: s.boxes,
    bag: s.bag,
    badges: s.badges,
    pokedex: s.pokedex,
    flags: s.flags,
    vars: s.vars,
    position,
    money: s.money,
  }
}

export const useSaveStore = create<SaveStore>()(
    (set) => ({
      ...createNewSave(),
      hydrated: false,
      loaded: false,

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

      addItem: (pocket, item, count) => {
        const next = addItem(useSaveStore.getState().bag, pocket, item, count)
        if (next === null) return false
        set({ bag: next })
        return true
      },

      removeItem: (pocket, item, count) => {
        const next = removeItem(useSaveStore.getState().bag, pocket, item, count)
        if (next === null) return false
        set({ bag: next })
        return true
      },

      addMoney: (amount) =>
        set((s) => ({ money: Math.min(MAX_MONEY, s.money + amount) })),

      spendMoney: (amount) => {
        const { money } = useSaveStore.getState()
        if (money < amount) return false
        set({ money: money - amount })
        return true
      },

      report: async (position) => {
        await writeReport(snapshot(useSaveStore.getState(), position))
        set({ position, loaded: true })
      },

      loadReport: async () => {
        const data = await readReport(SAVE_VERSION)
        set({ hydrated: true })
        if (!data) return false
        set({ ...data, loaded: true })
        return true
      },

      resetSave: async () => {
        await clearReport()
        set({ ...createNewSave(), hydrated: true, loaded: false })
      },
    }),
)
