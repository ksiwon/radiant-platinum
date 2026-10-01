import { createRoot } from 'react-dom/client'
import { BootGate } from './app/BootGate'
import { registerOffline } from './app/offline'
import { ChunkBoundary } from './ui/screens/ChunkBoundary'

// ⚠️ `<App />`을 곧바로 그리지 않는다. 공개판은 설치본이 있어야 콘텐츠를 부를
// 수 있고, 없으면 앱 셸만으로 된 설치 화면이 떠야 한다 (`app/boot.ts`)
//
// ⚠️ **맨 바깥에도 경계를 둔다** (`ChunkBoundary`). 설치 화면·타이틀의 설정창처럼
// 안쪽 경계가 없는 지연 화면이 청크를 못 받으면 여기서 받는다 — 없으면 루트가
// 통째로 내려가 빈 화면만 남는다. `vite:preloadError`는 듣지 않는다: 거기서
// 새로 고치면 필드의 진행이 말없이 사라진다 (PLAN §4.6)
createRoot(document.getElementById('root')!).render(
  <ChunkBoundary where="앱" outermost>
    <BootGate />
  </ChunkBoundary>,
)

// 껐다 켜도, 인터넷이 없어도 열리게 한다. 실패해도 게임은 그대로 돈다
registerOffline()
