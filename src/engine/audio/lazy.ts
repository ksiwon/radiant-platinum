// 소리 뭉치를 첫 화면 밖에서 연다 (PLAN §10.4)
//
// ⚠️ **`music`을 정적으로 잡으면 첫 화면이 커진다.** `music`은 sseq·swar·렌더
// 워커까지 끌고 오고, 그 뭉치가 gzip 11.1kB다. 그런데 소리는 사용자가 화면을
// 한 번 건드리기 전에는 브라우저가 아예 안 내보낸다 — 첫 페인트에 있어야 할
// 이유가 없다.
//
// ⚠️ **그래도 늦으면 안 된다.** 커서를 처음 움직일 때 452KB를 기다리게 하지
// 않으려고 타이틀이 뜨자마자 `warmMenu()`로 미리 편다. 그때 이 뭉치도 같이
// 들어오므로, 실제로 소리를 낼 때는 이미 와 있다.
//
// ⚠️ **이 파일은 `music`을 정적 import 하지 않는다.** 하면 여기 있는 의미가
// 통째로 사라진다 — `app/initialChunk.test.ts`가 그것을 센다.

type Music = typeof import('./music')['music']
type Sfx = typeof import('./sfx')['SFX']

let chunk: Promise<{ music: Music, SFX: Sfx }> | null = null

/** 한 번만 연다. 두 번째부터는 같은 약속을 돌려준다 */
function open(): Promise<{ music: Music, SFX: Sfx }> {
  chunk ??= Promise.all([import('./music'), import('./sfx')])
    .then(([m, s]) => ({ music: m.music, SFX: s.SFX }))
  return chunk
}

/** 메뉴 커서 소리. 아직 안 왔으면 이번 한 번은 조용히 지나간다 */
export function menuBeep(): void {
  void open().then((a) => a.music.playEffect(a.SFX.MENU)).catch(() => { /* 소리는 필수가 아니다 */ })
}

/** 메뉴 소리를 미리 편다. 깨어나기 전이면 줄을 서고 첫 입력 때 받는다 */
export function warmMenu(): void {
  void open().then((a) => a.music.prewarm([a.SFX.MENU])).catch(() => { /* 위와 같다 */ })
}

/** 곡 하나를 튼다. 아직 안 깨어났으면 `music`이 번호만 적어 두었다가 깨울 때 튼다 */
export function playSong(id: number): void {
  void open().then((a) => a.music.play(id)).catch(() => { /* 위와 같다 */ })
}
