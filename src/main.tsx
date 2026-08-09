import { createRoot } from 'react-dom/client'
import { BootGate } from './app/BootGate'
import { registerOffline } from './app/offline'

// ⚠️ `<App />`을 곧바로 그리지 않는다. 공개판은 설치본이 있어야 콘텐츠를 부를
// 수 있고, 없으면 앱 셸만으로 된 설치 화면이 떠야 한다 (`app/boot.ts`)
createRoot(document.getElementById('root')!).render(<BootGate />)

// 껐다 켜도, 인터넷이 없어도 열리게 한다. 실패해도 게임은 그대로 돈다
registerOffline()
