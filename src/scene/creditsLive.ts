// 크레딧 시계와 3D 무대 사이의 다리 — 화면(`ui/menu/CreditsScreen`)이 틱마다 `view`를 쓰고 무대(`CreditsStage`)가 프레임마다 읽는다.
//
// React 상태로 두지 않는다 — 60Hz로 바뀌는 값이라 구독하는 화면이 매 틱 다시 그려진다. 무대는 `useFrame`에서 직접 읽는다
// (`scene/sceneRefs`와 같은 방식이다)
import type { CreditsView } from '../engine/world/creditsStage'

export const creditsLive: {
  view: CreditsView | null
  /** 무대가 모델 · 그림을 다 받았는가 — 화면은 이것을 기다렸다 시계를 시작한다 */
  ready: boolean
} = { view: null, ready: false }
