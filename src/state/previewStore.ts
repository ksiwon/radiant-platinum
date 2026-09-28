// 포켓몬 미리보기 창 (`ScrCmd_DrawPokemonPreview`)
//
// 전설과 마주치기 **직전에** 그 모습을 창 하나에 띄우는 연출이다 — 에메랄드의
// 크레세리아, 예지의 호수의 엠라이트, 포켓몬저택의 마나피가 이 창을 쓴다.
// 스크립트가 열고(`DrawPokemonPreview`) 스크립트가 닫는다(`RemovePokemonPreview`).
// 수다 녹음도 이 창에 페라페를 띄우고, 배운 뒤 **움직이게 한다**(`SetPokemonPreviewAnim`).
//
// ⚠️ **창이 떠 있는 동안 스크립트가 안 선다.** 원작도 그린 뒤 곧바로 다음 명령을
// 돌리고, 지우는 쪽만 애니메이션이 끝나기를 기다린다
import { create } from 'zustand'

/**
 * 창의 움직임 (`pokemon_preview_anim` 둘째 줄) — 컷 0 · 1을 이 프레임씩 번갈아 보인다.
 *
 * 원작 순서 그대로다: 컷 0을 1 · 컷 1을 8 · 컷 0을 32 · 컷 1을 4 · 컷 0을 4 · 컷 1을 4, 그리고 컷 0에서 멎는다
 * (`playbackMode` 1 — 한 번). `WaitPokemonPreviewAnim`은 **일곱째 칸(6번)에 닿을 때까지** 선다
 * (`SysTask_HandlePokemonPreview`의 `Sprite_GetAnimFrame == 6`)
 */
const PREVIEW_ANIM: readonly (readonly [cut: 0 | 1, frames: number])[] = [
  [0, 1], [1, 8], [0, 32], [1, 4], [0, 4], [1, 4],
]
/** 움직임이 끝나는 프레임 — 일곱째 칸에 닿는 순간 (1+8+32+4+4+4) */
export const PREVIEW_ANIM_FRAMES = PREVIEW_ANIM.reduce((n, [, f]) => n + f, 0)

/** 움직이기 시작한 뒤 그 프레임에 보이는 컷. 끝나면 0이다 */
export function previewCutAt(frame: number): 0 | 1 {
  let at = 0
  for (const [cut, frames] of PREVIEW_ANIM) {
    if (frame < at + frames) return cut
    at += frames
  }
  return 0
}

interface PreviewStore {
  /** 보여 줄 종족 번호. 없으면 창이 닫혀 있다 */
  species: number | null
  /** 0 수컷 · 1 암컷 · 2 무성 (`GENDER_*`) */
  gender: number
  /** 폼 (`DrawPokemonPreviewFromStruct`는 그 개체의 폼으로 그린다). 종족만 받은 창은 0이다 */
  form: number
  /** 움직이기 시작한 시각(`performance.now`, ms). 안 움직이면 null */
  animSince: number | null
  draw: (species: number, gender: number, form?: number) => void
  /** `SetPokemonPreviewAnim` */
  animate: () => void
  remove: () => void
}

export const usePreviewStore = create<PreviewStore>()((set) => ({
  species: null,
  gender: 0,
  form: 0,
  animSince: null,
  draw: (species, gender, form = 0) => { set({ species, gender, form, animSince: null }) },
  animate: () => { set({ animSince: performance.now() }) },
  remove: () => { set({ species: null, animSince: null }) },
}))

/** 움직임이 아직 도는가 (`WaitPokemonPreviewAnim`) */
export function previewAnimating(now = performance.now()): boolean {
  const since = usePreviewStore.getState().animSince
  if (since === null) return false
  return (now - since) * 60 / 1000 < PREVIEW_ANIM_FRAMES
}
