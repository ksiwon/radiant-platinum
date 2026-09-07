// 씬이 그리다 터졌을 때 (PLATINUM_3D_COMPLETION_PLAN §3.5 · PT-02)
//
// ⚠️ **오류의 갈래가 셋인데 받는 자리가 하나씩 다르다.** 하나로 다 잡았다고
// 말하면 안 된다 ([React 오류 경계](https://react.dev/reference/react/Component)):
//
//   ① **React 씬의 동기 오류** — 이 경계가 잡는다. `<WorldLoader/>`가 렌더 중에
//      터지면 R3F 나무가 통째로 무너지고, 경계가 없으면 **앱 전체가 언마운트되어
//      흰 화면**이 된다. 대사창도 메뉴도 같이 사라진다
//   ② **프레임 콜백의 오류** — 경계가 **못 잡는다.** `useFrame`은 렌더 단계가
//      아니라 R3F의 루프에서 불린다. 그쪽은 `scene/EngineDriver`가 직접 감싼다
//   ③ **비동기 초기화 실패** — 역시 못 잡는다. `gl` 팩토리의 거부는 R3F가 제
//      비동기 설정 안에서 기다리므로 처리 안 된 거부 하나가 될 뿐이다.
//      그쪽은 `scene/Stage`가 `markInitFailed`로 잡는다
//
// ⚠️ **터진 자리에 아무것도 안 그린다.** 여기서 대체 화면을 그리면 그것이
// R3F 나무 안이라 three 객체여야 하고, 3D를 못 쓰는 상황에서 3D로 사과문을
// 그리는 꼴이 된다. 사람에게 보이는 것은 DOM 쪽 `RendererTrouble`이다
import { Component, type ErrorInfo, type ReactNode } from 'react'
import { useRendererStore } from '../../state/rendererStore'

interface Props {
  children: ReactNode
  /** 어느 나무에서 터졌는지 — 사람에게 보일 한 줄에 붙는다 */
  where: string
}

interface State {
  crashed: boolean
}

export class SceneBoundary extends Component<Props, State> {
  override state: State = { crashed: false }

  static getDerivedStateFromError(): State {
    return { crashed: true }
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // ⚠️ **콘솔에만 적고 끝내지 않는다.** 배포 빌드에서 콘솔을 보는 사람은
    // 없다 — 상태로 옮겨야 창이 뜨고, 사람이 「다시 세우기」를 고를 수 있다
    console.error(`[scene] ${this.props.where}에서 터졌다`, error, info.componentStack)
    useRendererStore.getState().markSceneCrashed(
      `${this.props.where}: ${String(error.message || error)}`)
  }

  override render(): ReactNode {
    // ⚠️ **다시 그리려 들지 않는다.** 같은 나무를 그대로 다시 세우면 같은 자리에서
    // 또 터진다 — 다시 세우는 것은 세대를 올리는 `retry()`뿐이고, 그때는 이
    // 경계도 통째로 새로 만들어진다 (`<Canvas key={generation}>`)
    return this.state.crashed ? null : this.props.children
  }
}
