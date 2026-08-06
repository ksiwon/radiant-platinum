// 오디오 언락 게이트 골격 (PLAN §11.1) — 첫 제스처에서 resume
let ctx: AudioContext | null = null

export function getAudioContext(): AudioContext {
  if (!ctx) ctx = new AudioContext()
  return ctx
}

/**
 * 첫 제스처가 들어오면 부를 것들.
 *
 * 음악이 여기를 직접 부르면 서로를 import 하게 된다 — 등록만 받는다
 */
const woken: (() => void)[] = []
let already = false

export function onAudioUnlock(fn: () => void): void {
  if (already) { fn(); return }
  woken.push(fn)
}

export function installAudioUnlock() {
  const resume = () => {
    const c = getAudioContext()
    if (c.state !== 'running') void c.resume()
    already = true
    for (const fn of woken.splice(0)) fn()
  }
  for (const ev of ['pointerdown', 'keydown', 'touchend'] as const) {
    window.addEventListener(ev, resume, { once: true, passive: true })
  }
  // 탭 복귀 시 재시도 (iOS interrupted 대응)
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && ctx && ctx.state !== 'running') void ctx.resume()
  })
}
