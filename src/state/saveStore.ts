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
import { PARTY_MAX, type PokemonInstance, type Status } from '../engine/pokemon/instance'

/** `constants/pokemon.h`의 `MAX_FRIENDSHIP_VALUE` */
const MAX_FRIENDSHIP = 255
/** `generated/items.txt` — 이 볼에 든 아이는 친밀도가 한 칸 더 오른다 */
const ITEM_LUXURY_BALL = 11
import { FLAG_COUNT, SAVED_VAR_COUNT } from '../engine/script/vars'

export type { PokemonInstance }

// 가방은 사전이 아니라 **주머니 8개 × 칸**이다. 원작이 그렇고, 그 모양이
// 화면에도 그대로 드러난다 (칸 수 상한·번호순 정렬)
import { addItem, emptyBag, removeItem, type Pockets } from '../engine/bag/bag'

// 보관 시스템도 엔진이 갖는다 — 18 × 30이라는 모양과 "지금 박스에서 시작해
// 한 바퀴"라는 규칙이 원작 코드에서 나온 것이라, 스토어가 다시 적으면 두 벌이 된다
import {
  BOX_COUNT, defaultWallpaper, emptyBoxes, store as storeInBox, swapSlots, withSlot,
  type Boxes, type BoxSpot,
} from '../engine/pokemon/boxes'

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
  /** 보관 시스템 18박스 × 30칸. 빈 자리는 null이다 (`engine/pokemon/boxes`) */
  boxes: Boxes
  /**
   * 지금 열려 있는 박스 (`PCBoxes.currentBoxID`).
   *
   * 장식이 아니다 — 잡은 포켓몬이 **여기부터** 자리를 찾는다. 박스를 옮겨 두면
   * 잡히는 자리도 따라 옮겨진다
   */
  currentBox: number
  /** 박스마다의 벽지 번호 (`PCBoxes.wallpapers`) */
  wallpapers: number[]
  bag: Pockets
  badges: number // 비트마스크
  pokedex: { seen: DexField; caught: DexField }
  /**
   * 전국도감을 켰는가 (`Pokedex_IsNationalDexObtained`).
   *
   * 스크립트가 `GetSetNationalDexEnabled`로 켜고 묻는다 — 마박사의 PC가 뭘로
   * 뜨는지, 파크에 들어갈 수 있는지가 이 값으로 갈린다
   */
  nationalDex: boolean
  /** 스크립트 플래그 4106개 */
  flags: SaveFlags
  /** 스크립트 변수 288칸 */
  vars: SaveVars
  /**
   * 지금 서 있는 자리. 리포트를 쓸 때 여기 값이 남는다.
   *
   * 엔진과 **같은 번호 체계**다 — `map`은 맵 헤더 번호, `matrix`는 그 맵이 선
   * 격자 번호다. 워프가 쓰는 것과 같은 짝이라 되돌아갈 때 그대로 넘겨주면 된다
   */
  position: { map: number; matrix: number; x: number; z: number; facing: number }
  money: number
  /**
   * 전멸했을 때 깨어날 자리 (`FieldOverworldState_SetBlackOutWarpId`).
   *
   * `spawns.json`의 번호다. 포켓몬센터에 **들어서면** 여기가 갈린다 —
   * 간호사에게 말을 걸 필요가 없다(`FieldMapChange_UpdateGameData`)
   */
  healSpot: number
  /** 열린 공중날기 자리들. `spawns.json`의 번호를 비트로 든다 */
  flySpots: number
  /**
   * 러닝슈즈를 받았는가 (`PlayerData_HasRunningShoes`).
   *
   * ⚠️ **플래그가 아니다.** 이것만 `PlayerData`의 칸이라 스크립트 플래그 배열에
   * 없다. 엄마가 201번도로에서 돌아온 뒤에 준다 — 그전에는 못 뛴다
   */
  runningShoes: boolean
}

export const SAVE_VERSION = 7

/** 원작 상한. 이걸 넘으면 돈이 안 늘어난다 */
export const MAX_MONEY = 999999

/**
 * 새 게임이 시작되는 자리 (`src/location.c`의 `sPlayerStartLocation`).
 *
 * 떡잎마을 주인공 집 2층. 맵 번호는 디컴프의 `map_headers.txt` 줄 순서와 우리
 * 표가 411~418에서 그대로 겹쳐서 확정된다 (411 T01 = TWINLEAF_TOWN,
 * 415 T01R0202 = TWINLEAF_TOWN_PLAYER_HOUSE_2F).
 *
 * ⚠️ 좌표와 방향은 **우리 단위로 옮긴 값이다.** 원작은 `x = 4, z = 6,
 * faceDirection = FACE_UP`인데,
 *
 *   · 우리 좌표는 칸의 **가운데**를 가리킨다 — 워프도 `x + 0.5`로 세운다
 *   · 우리 `facing`은 라디안이고 `atan2(vx, vz)`라 0이 남쪽이다. 북쪽이 π다
 *
 * 그대로 두면 주인공이 칸 모서리에 서서 **문 쪽(남쪽)을 보고** 시작한다
 */
export const START_LOCATION = {
  map: 415, matrix: 129, x: 4.5, z: 6.5, facing: Math.PI,
} as const

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
    boxes: emptyBoxes(),
    currentBox: 0,
    wallpapers: Array.from({ length: BOX_COUNT }, (_, i) => defaultWallpaper(i)),
    // 원작도 빈 가방으로 시작한다. 몬스터볼은 예진호수에서 마박사가 준다
    bag: emptyBag(),
    badges: 0,
    pokedex: { seen: new Uint8Array(DEX_BYTES), caught: new Uint8Array(DEX_BYTES) },
    nationalDex: false,
    flags: new Uint8Array(FLAG_BYTES),
    vars: new Uint16Array(SAVED_VAR_COUNT),
    position: { ...START_LOCATION },
    money: 3000,
    // 0번이 떡잎마을 주인공 집이다 — 원작도 센터에 가기 전엔 집에서 깨어난다
    healSpot: 0,
    flySpots: 0,
    // 러닝슈즈는 201번도로에서 돌아온 뒤 엄마가 준다 (`GiveRunningShoes`)
    runningShoes: false,
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
  /**
   * 필드가 뜨면 `scripts_init_new_game`을 돌려야 한다.
   *
   * 인트로가 세우고 `MapStreamer`가 내린다. 스크립트 자료는 필드가 뜰 때 오므로
   * 인트로 화면에서는 아직 못 돌린다
   */
  pendingInit: boolean
  markSeen: (dexNo: number) => void
  markCaught: (dexNo: number) => void
  /** 전국도감을 켠다 (`Pokedex_ObtainNationalDex`) */
  obtainNationalDex: () => void
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
   * 파티 두 마리의 자리를 바꾼다.
   *
   * 맨 앞이 **선두**다 — 배틀에 먼저 나가고 야생 조우의 레벨 판정도 그 마리가
   * 기준이라, 순서는 화면 장식이 아니다
   */
  swapParty: (a: number, b: number) => void
  /**
   * 파티 뒤에 한 마리를 붙인다 (`Party_AddPokemon`).
   *
   * ⚠️ **가득 차 있으면 부르는 쪽이 먼저 막아야 한다.** 원작도 여기서 실패를
   * 돌려주고 스크립트가 그 값으로 갈라진다 — 박스로 넘기지 않는다
   */
  addToParty: (mon: PokemonInstance) => void
  /** 친밀도를 올린다. 255에서 멈춘다 (`MAX_FRIENDSHIP_VALUE`) */
  addFriendship: (slot: number, amount: number) => void
  /** 뱃지 하나 (`TrainerInfo_SetBadge`). 비전머신 자격이 여기 걸려 있다 */
  giveBadge: (badge: number) => void
  /** 박스를 넘긴다. 잡은 포켓몬이 이 박스부터 자리를 찾는다 */
  setCurrentBox: (box: number) => void
  /**
   * 파티 한 마리를 박스로 보낸다 (`CommonScript_DepositPokemon`).
   *
   * ⚠️ **마지막 한 마리는 못 맡긴다.** 파티가 비면 야생과 마주쳤을 때 내보낼
   * 것이 없다 — 원작이 "싸울 포켓몬이 없어집니다!"로 막는 자리다.
   * 자리가 없거나 그 한 마리면 null
   */
  depositMon: (index: number) => BoxSpot | null
  /** 박스 한 마리를 파티로 꺼낸다. 파티가 6마리면 false */
  withdrawMon: (at: BoxSpot) => boolean
  /** 박스 안에서, 또는 박스끼리 자리를 바꾼다 */
  swapBoxSlots: (a: BoxSpot, b: BoxSpot) => void
  /** 부활 지점을 옮긴다. 포켓몬센터에 들어서면 씬이 부른다 */
  setHealSpot: (index: number) => void
  /** 공중날기 자리를 연다 */
  unlockFly: (index: number) => void
  /**
   * 파티 전원을 회복한다 — 포켓몬센터가 하는 일이다.
   *
   * HP 최댓값은 종족값 표가 있어야 나오고 그 표는 비동기로 온다. 그래서
   * **계산은 바깥이 하고** 여기서는 받은 값을 넣기만 한다
   */
  healParty: (full: (mon: PokemonInstance) => { hp: number; pp: number[] }) => void
  /**
   * 그 자리의 상태이상만 바꾼다 (`Pokemon_SetValue(MON_DATA_STATUS)`).
   *
   * 필드에서 독이 풀리는 자리가 여기다 (`Pokemon_TrySurvivePoison`) —
   * 배틀은 제 상태를 따로 들고 끝날 때 여기로 되돌려 놓는다
   */
  setStatus: (slot: number, status: Status) => void
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

/**
 * 인트로가 끝났다. 이름·성별·라이벌 이름을 적고 판을 연다.
 *
 * 플래그는 **여기서 안 세운다** — 필드가 뜰 때 `scripts_init_new_game`이 돈다
 * (`MapStreamer`). 그 표를 손으로 옮기면 130여 줄을 베끼는 것이고, 우리는 이미
 * 그 바이트코드를 싣고 있다
 */
export function startNewGame(
  who: { name: string; gender: TrainerInfo['gender']; rivalName: string },
): void {
  const fresh = createNewSave()
  useSaveStore.setState({
    ...fresh,
    trainer: { ...fresh.trainer, name: who.name, gender: who.gender },
    rivalName: who.rivalName,
    hydrated: true,
    loaded: false,
    /** 필드가 뜨면 새 게임 초기화를 돌려야 한다 */
    pendingInit: true,
  })
}

/**
 * 이 한 마리를 빼면 싸울 것이 없어지는가 (`BoxAppMan_OnLastAliveMon`).
 *
 * ⚠️ **마릿수가 아니라 살아 있는 수를 센다.** "여섯 마리 중 다섯이 기절"이면
 * 남은 하나를 못 맡긴다. 거꾸로 **기절한 마리는 하나뿐이어도 맡길 수 있다** —
 * 원작이 옮기려는 그 마리의 HP까지 함께 보기 때문이다
 */
function lastAliveMon(party: readonly PokemonInstance[], index: number): boolean {
  if ((party[index]?.hp ?? 0) <= 0) return false
  return party.filter((mon) => mon.hp > 0).length < 2
}

/** 상태 필드만. 액션은 저장하지 않는다 */
function snapshot(s: SaveStore, position: SaveData['position']): SaveData {
  return {
    version: SAVE_VERSION,
    trainer: s.trainer,
    rivalName: s.rivalName,
    party: s.party,
    boxes: s.boxes,
    currentBox: s.currentBox,
    wallpapers: s.wallpapers,
    bag: s.bag,
    badges: s.badges,
    pokedex: s.pokedex,
    nationalDex: s.nationalDex,
    flags: s.flags,
    vars: s.vars,
    position,
    money: s.money,
    healSpot: s.healSpot,
    flySpots: s.flySpots,
    runningShoes: s.runningShoes,
  }
}

export const useSaveStore = create<SaveStore>()(
    (set) => ({
      ...createNewSave(),
      hydrated: false,
      loaded: false,
      pendingInit: false,

      markSeen: (dexNo) =>
        set((s) => ({ pokedex: { ...s.pokedex, seen: dexSet(s.pokedex.seen, dexNo) } })),

      obtainNationalDex: () => { set({ nationalDex: true }) },

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

      swapParty: (a, b) =>
        set((st) => {
          if (a === b || a < 0 || b < 0 || a >= st.party.length || b >= st.party.length) return st
          const party = [...st.party]
          const held = party[a]!
          party[a] = party[b]!
          party[b] = held
          return { party }
        }),

      setCurrentBox: (box) => {
        set({ currentBox: ((box % BOX_COUNT) + BOX_COUNT) % BOX_COUNT })
      },

      depositMon: (index) => {
        const st = useSaveStore.getState()
        const mon = st.party[index]
        if (!mon || lastAliveMon(st.party, index)) return null
        const put = storeInBox(st.boxes, st.currentBox, mon)
        if (put === null) return null
        set({ boxes: put.boxes, party: st.party.filter((_, i) => i !== index) })
        return put.at
      },

      withdrawMon: (at) => {
        const st = useSaveStore.getState()
        const mon = st.boxes[at.box]?.[at.slot]
        if (!mon || st.party.length >= PARTY_MAX) return false
        set({ boxes: withSlot(st.boxes, at, null), party: [...st.party, mon] })
        return true
      },

      swapBoxSlots: (a, b) => {
        set((st) => ({ boxes: swapSlots(st.boxes, a, b) }))
      },

      addToParty: (mon) => {
        set((st) => (st.party.length >= PARTY_MAX ? st : { party: [...st.party, mon] }))
      },

      setStatus: (slot, status) => {
        set((st) => ({
          party: st.party.map((mon, i) => (i === slot ? { ...mon, status, statusTurns: 0 } : mon)),
        }))
      },

      addFriendship: (slot, amount) => {
        set((st) => ({
          party: st.party.map((mon, i) => (
            i === slot
              // ⚠️ 럭셔리볼은 +1 (`ITEM_LUXURY_BALL`). 원작은 여기에 둘을 더
              // 얹는다 — 도구의 `HOLD_EFFECT_FRIENDSHIP_UP`이 1.5배, 알을 받은
              // 곳에서 올리면 +1. 도구의 효과 표가 아직 없어서 그 둘은 안 붙었다
              ? { ...mon, friendship: Math.min(MAX_FRIENDSHIP, mon.friendship + amount
                + (amount > 0 && mon.ball === ITEM_LUXURY_BALL ? 1 : 0)) }
              : mon
          )),
        }))
      },

      giveBadge: (badge) => { set((st) => ({ badges: st.badges | (1 << badge) })) },

      setHealSpot: (index) => { set({ healSpot: index }) },

      unlockFly: (index) =>
        set((st) => ({ flySpots: st.flySpots | (1 << index) })),

      healParty: (full) =>
        set((st) => ({
          party: st.party.map((mon) => {
            const { hp, pp } = full(mon)
            return {
              ...mon,
              hp,
              status: 'ok' as const,
              moves: mon.moves.map((slot, i) => ({ ...slot, pp: pp[i] ?? slot.pp })),
            }
          }),
        })),

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
