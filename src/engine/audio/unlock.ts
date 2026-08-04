// 오디오 언락 게이트 골격 (PLAN §11.1) — 첫 제스처에서 resume
let ctx: AudioContext | null = null

export function getAudioContext(): AudioContext {
  if (!ctx) ctx = new AudioContext()
  return ctx
}

export function installAudioUnlock() {
  const resume = () => {
    const c = getAudioContext()
    if (c.state !== 'running') void c.resume()
  }
  for (const ev of ['pointerdown', 'keydown', 'touchend'] as const) {
    window.addEventListener(ev, resume, { once: true, passive: true })
  }
  // 탭 복귀 시 재시도 (iOS interrupted 대응)
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden && ctx && ctx.state !== 'running') void ctx.resume()
  })
}
