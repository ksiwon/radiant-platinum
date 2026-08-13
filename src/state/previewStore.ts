// 포켓몬 미리보기 창 (`ScrCmd_DrawPokemonPreview`)
//
// 전설과 마주치기 **직전에** 그 모습을 창 하나에 띄우는 연출이다 — 에메랄드의
// 크레세리아, 예지의 호수의 엠라이트, 포켓몬저택의 마나피가 이 창을 쓴다.
// 스크립트가 열고(`DrawPokemonPreview`) 스크립트가 닫는다(`RemovePokemonPreview`).
//
// ⚠️ **창이 떠 있는 동안 스크립트가 안 선다.** 원작도 그린 뒤 곧바로 다음 명령을
// 돌리고, 지우는 쪽만 애니메이션이 끝나기를 기다린다
import { create } from 'zustand'

interface PreviewStore {
  /** 보여 줄 종족 번호. 없으면 창이 닫혀 있다 */
  species: number | null
  /** 0 수컷 · 1 암컷 · 2 무성 (`GENDER_*`) */
  gender: number
  draw: (species: number, gender: number) => void
  remove: () => void
}

export const usePreviewStore = create<PreviewStore>()((set) => ({
  species: null,
  gender: 0,
  draw: (species, gender) => { set({ species, gender }) },
  remove: () => { set({ species: null }) },
}))
