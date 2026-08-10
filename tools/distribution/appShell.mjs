// 앱 셸 — `public/`에서 배포물로 나가도 되는 것 (COPYRIGHT.md §2 표 · IMPORT.md §8)
//
// ⚠️ **여기 없는 것은 안 나간다.** Vite의 `publicDir` 복사를 끄고(`copyPublicDir:
// false`) 이 목록만 손으로 옮긴다. 목록을 뒤집은 이유는 하나다 — 금지 목록은
// 새 폴더가 생길 때마다 뚫리지만 허용 목록은 안 뚫린다. `public/data`와
// `public/models`가 리포에 없는 채로 배포물에 645MB 들어가 있던 것이 그 증거다.
//
// ⚠️ **폴더 단위로 적지 않는다.** `{ kind: 'dir', path: 'assets' }` 한 줄이던
// 때는 `public/assets`에 무엇을 떨어뜨리든 심사 없이 배포물에 실렸다. 폴더는
// 허용 목록처럼 보이지만 그 아래에 대해서는 아무것도 안 거른다. 그래서
// **파일 하나하나를 출처와 함께** 적는다.
//
// 새 파일을 넣으려면 여기에 경로와 출처를 적고 `docs/APP_SHELL.md`에 근거를
// 남긴다. 안 적힌 파일이 `public/assets`에 있으면 `pnpm boundary:pre`가 선다 —
// 조용히 실려 나가는 것보다 빌드가 서는 편이 낫다.
//
// 개발 서버는 그대로 `public/` 전체를 준다. 개발판은 기존 raw 산출물을 계속
// 써야 하기 때문이다 (COPYRIGHT.md §5) — 갈리는 것은 **빌드**뿐이다.
import { existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * `public/` 아래에서 배포물로 옮길 파일 — 전부, 하나씩.
 *
 * `origin`은 그 바이트가 어디서 왔는지다. `자체`가 아닌 것은 못 나간다.
 * `index.html`은 여기 없다 — Vite가 뿌리에서 직접 만들고 해시 붙은 js·css를
 * 물려 준다
 */
export const PUBLIC_SHELL = [
  { path: 'manifest.webmanifest', origin: '자체', note: 'PWA 매니페스트. 손으로 쓴 JSON' },
  { path: 'sw.js', origin: '자체', note: '앱 셸 전용 service worker. 손으로 쓴 JS' },
  { path: 'assets/mark.svg', origin: '자체', note: '파비콘 · PWA 아이콘 (코드로 그린다)' },
  { path: 'assets/mark-180.png', origin: '자체', note: 'apple-touch-icon (코드로 그린다)' },
]

/** 목록에 없는 파일이 있으면 안 되는 나무. 여기만 전수 대조한다 */
export const AUDITED_TREES = ['assets']

/**
 * 셸 목록을 실제 파일 경로로 편다. 없는 것은 조용히 빠진다 —
 * 깨끗한 clone에도 `public/assets`가 있지만, 없다고 빌드를 세울 이유는 없다
 */
export function collectShell(publicDir) {
  return PUBLIC_SHELL
    .map((e) => e.path)
    .filter((rel) => existsSync(join(publicDir, ...rel.split('/'))))
}

function walk(root, rel, out) {
  const abs = join(root, ...rel.split('/'))
  let st
  try { st = statSync(abs) } catch { return out }
  if (!st.isDirectory()) { out.push(rel); return out }
  for (const name of readdirSync(abs)) walk(root, `${rel}/${name}`, out)
  return out
}

/**
 * 심사받은 나무 안에 목록에 없는 파일이 있는가.
 *
 * 이것이 없으면 파일 단위 허용 목록이 반쪽이다 — 새 아이콘을 떨어뜨린 사람이
 * 목록에 적는 것을 잊으면 그냥 안 나갈 뿐이고, 왜 안 나가는지 아무도 모른다
 */
export function unlistedShellFiles(publicDir) {
  const listed = new Set(PUBLIC_SHELL.map((e) => e.path))
  return AUDITED_TREES
    .flatMap((tree) => walk(publicDir, tree, []))
    .filter((rel) => !listed.has(rel))
}
