// `tsResolve.mjs`가 등록하는 해석 훅. 확장자가 없으면 `.ts`·`/index.ts`를 본다.
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export async function resolve(spec, ctx, next) {
  if (spec.startsWith('.') && !/\.[cm]?[jt]s$/.test(spec)) {
    try {
      const url = new URL(spec, ctx.parentURL)
      for (const ext of ['.ts', '/index.ts']) {
        if (existsSync(fileURLToPath(new URL(url.href + ext)))) return next(spec + ext, ctx)
      }
    } catch { /* 상대가 아니면 그냥 넘긴다 */ }
  }
  return next(spec, ctx)
}
