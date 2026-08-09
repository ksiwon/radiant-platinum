// 앱 셸 — `public/`에서 배포물로 나가도 되는 것 (COPYRIGHT.md §2 표 · IMPORT.md §8)
//
// ⚠️ **여기 없는 것은 안 나간다.** Vite의 `publicDir` 복사를 끄고(`copyPublicDir:
// false`) 이 목록만 손으로 옮긴다. 목록을 뒤집은 이유는 하나다 — 금지 목록은
// 새 폴더가 생길 때마다 뚫리지만 허용 목록은 안 뚫린다. `public/data`와
// `public/models`가 리포에 없는 채로 배포물에 645MB 들어가 있던 것이 그 증거다.
//
// 개발 서버는 그대로 `public/` 전체를 준다. 개발판은 기존 raw 산출물을 계속
// 써야 하기 때문이다 (COPYRIGHT.md §5) — 갈리는 것은 **빌드**뿐이다.
import { readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

/**
 * `public/` 아래에서 배포물로 옮길 것.
 *
 * `dir`는 그 아래 전부, `file`은 그 하나. `index.html`은 여기 없다 — Vite가
 * 뿌리에서 직접 만들고 해시 붙은 js·css를 물려 준다
 */
export const PUBLIC_SHELL = [
  { kind: 'file', path: 'manifest.webmanifest' },
  { kind: 'file', path: 'sw.js' },
  // 파비콘·앱 아이콘·인트로 그림. 전부 우리가 만든 것이다
  { kind: 'dir', path: 'assets' },
]

function walk(root, rel) {
  const abs = join(root, ...rel.split('/'))
  let st
  try { st = statSync(abs) } catch { return [] }
  if (!st.isDirectory()) return [rel]
  return readdirSync(abs).flatMap((name) => walk(root, `${rel}/${name}`))
}

/**
 * 셸 목록을 실제 파일 경로로 편다. 없는 것은 조용히 빠진다 —
 * 깨끗한 clone에도 `public/assets`가 있지만, 없다고 빌드를 세울 이유는 없다
 */
export function collectShell(publicDir) {
  return PUBLIC_SHELL.flatMap((e) => walk(publicDir, e.path))
}
