// 비전기술 컷인의 씬 쪽 상태 (`engine/actor/hmCutIn`)
//
// 규칙은 엔진에 있고 여기는 **누가 나오는가**와 **누가 굴리는가**만 든다.
// 자리와 밴드는 프레임마다 바뀌므로 스토어에 안 넣는다 — 스토어에 넣으면
// 마흔 몇 프레임짜리 연출 하나가 리렌더를 마흔 번 낸다 (`FadeOverlay`가
// 같은 이유로 스타일을 직접 만진다).
import { create } from 'zustand'
import { startHmCutIn, tickHmCutIn, type HmCutInState } from '../engine/actor/hmCutIn'
import { music } from '../engine/audio/music'
import { genderOf, isShiny } from '../engine/pokemon/instance'
import { loadSpecies, type SpeciesTable } from '../data/gameData'
import { useSaveStore } from '../state/saveStore'

/** 성비를 물어볼 종족표. 컷인 한 번에 받아 오면 늦으므로 미리 든다 */
let speciesTable: SpeciesTable | null = null
void loadSpecies().then((table) => { speciesTable = table }).catch(() => { speciesTable = null })

/** 지금 도는 컷인. 프레임마다 바뀌므로 리액트 밖이다 */
export const hmCutIn = { now: null as HmCutInState | null }

interface HmCutInMon {
  species: number
  form: number
  gender: 'male' | 'female' | 'genderless'
  shiny: boolean
}

interface HmCutInStore {
  /** 나올 포켓몬. null이면 아무것도 안 뜬다 */
  mon: HmCutInMon | null
  show: (mon: HmCutInMon) => void
  hide: () => void
}

export const useHmCutInStore = create<HmCutInStore>()((set) => ({
  mon: null,
  show: (mon) => { set({ mon }) },
  hide: () => { set({ mon: null }) },
}))

/**
 * 컷인을 건다 (`PlayHMCutIn`).
 *
 * ⚠️ **자리가 비면 안 연다.** 원작은 `Party_GetPokemonBySlotIndex`가 늘 답하는
 * 자리에서만 부르는데(스크립트가 `FindPartySlotWithMove`로 찾아 넘긴다), 우리
 * 쪽은 파티 화면에서 오는 길도 있어서 자리가 빌 수 있다 — 그때는 몸 없이
 * 밴드만 열렸다 닫히는 그림이 되므로 아예 안 연다
 */
export function startHmCutInFor(slot: number): void {
  const save = useSaveStore.getState()
  const mon = save.party[slot]
  if (!mon || mon.isEgg) { hmCutIn.now = null; return }
  // 성별도 색이 다른 것도 개체에 안 적혀 있다 — PID가 정한다
  // (`engine/pokemon/instance`). 종족표가 아직 안 왔으면 성별 없는 몸이다
  const species = speciesTable?.byId.get(mon.species)
  useHmCutInStore.getState().show({
    species: mon.species,
    form: mon.form,
    gender: species ? genderOf(mon.pid, species.genderRatio) : 'genderless',
    shiny: isShiny(mon.pid, save.trainer.id, save.trainer.secretId),
  })
  hmCutIn.now = startHmCutIn(slot)
}

/** 다 끝났는가. 스크립트가 이걸 기다린다 (`ScriptContext_WaitForHMCutInFinished`) */
export function hmCutInDone(): boolean {
  return hmCutIn.now === null
}

/** 한 프레임. 게임 루프가 부른다 */
export function hmCutInTick(): void {
  const s = hmCutIn.now
  if (s === null) return
  if (tickHmCutIn(s)) {
    hmCutIn.now = null
    useHmCutInStore.getState().hide()
    return
  }
  // 한가운데 서는 그 프레임에 운다 (`Pokemon_PlayCry`)
  if (s.cry) {
    const mon = useHmCutInStore.getState().mon
    if (mon) void music.playCry(mon.species)
  }
}

/** 맵을 옮기거나 판을 새로 열 때. 남겨 두면 밴드가 그대로 걸려 있다 */
export function resetHmCutIn(): void {
  hmCutIn.now = null
  useHmCutInStore.getState().hide()
}
