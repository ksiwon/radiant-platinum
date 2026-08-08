import { createRoot } from 'react-dom/client'
import { App } from './app/App'
import { registerOffline } from './app/offline'

createRoot(document.getElementById('root')!).render(<App />)

// 껐다 켜도, 인터넷이 없어도 열리게 한다. 실패해도 게임은 그대로 돈다
registerOffline()
