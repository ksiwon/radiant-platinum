// 메뉴 창 안의 3D 포켓몬 — **자리만 냈다** (SYSTEM §2.4). 본체는 PV 꾸러미가 만든다.
//
// 이 파일이 지금 하는 일은 도감(P7)이 **최종 props 모양으로** 이 부품을 쓸 수 있게 하는 것이다. PV가 들어오면
// 이 컴포넌트가 마운트할 때 `state/monViewportStore`에 구멍(ref)과 `{species, form, gender, shiny}`를 올리고,
// 떨어지기 넷(모델 없음 · 오는 중 · 렌더러 죽음 · 안 본 칸의 「?」)에서 `{key}_front.png`를 `pixelSprite` 3배(240)로
// 그린다. 그 전에는 **빈 투명 상자**다 — 도감 화면은 그 자리에 아무것도 안 보여도 선다.
//
// 계약: 글자 0, `aria-hidden`, `role` 없음. 구멍은 CSS 320×320 이하다.
export interface MonViewportProps {
  /** 종족 번호. 안 본 칸이면 `null`이고 이때는 「?」를 그린다 (PV) */
  species: number | null
  form?: number
  gender?: 'male' | 'female' | 'none'
  shiny?: boolean
  /** 구멍의 한 변(px). 320을 넘지 않는다 */
  size?: number
}

import * as css from './monViewport.css'

/** 구멍의 한 변 상한 (CSS px) */
export const VIEWPORT_MAX = 320

export function MonViewport({ size = 240 }: MonViewportProps) {
  const side = Math.min(VIEWPORT_MAX, size)
  return <div className={css.viewport} aria-hidden data-mon-viewport style={{ width: side, height: side }} />
}
