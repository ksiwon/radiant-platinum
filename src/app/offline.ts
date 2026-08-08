// 서비스 워커 등록 (PLAN §4.6)
//
// ⚠️ **개발 중에는 안 켠다.** 워커가 껍데기를 캐시하면 vite의 HMR이 낡은 js를
// 물고 오고, 그러면 "고쳤는데 화면이 안 바뀐다"를 쫓게 된다.
//
// 실패해도 아무 일도 없다 — 오프라인이 안 될 뿐 게임은 그대로 돈다. 그래서
// 던지지 않고 삼킨다. `file://`이나 안전하지 않은 오리진에서는 애초에 못 쓴다.
import { APP_ROOT } from '../data/assetBase'

export function registerOffline(): void {
  if (import.meta.env.DEV) return
  if (!('serviceWorker' in navigator)) return
  // 등록은 첫 화면이 뜬 뒤에 한다. 여는 순간에 하면 워커 설치가 첫 프레임과
  // 대역폭을 다툰다
  window.addEventListener('load', () => {
    void navigator.serviceWorker
      .register(`${APP_ROOT}sw.js`, { scope: APP_ROOT })
      .catch(() => { /* 오프라인이 안 될 뿐이다 */ })
  })
}
