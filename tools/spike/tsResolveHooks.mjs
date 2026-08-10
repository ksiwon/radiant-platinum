// `tsResolve.mjs`가 등록하는 해석 훅. 확장자 없는 상대 경로에 `.ts`를 붙여 본다
export async function resolve(specifier, context, next) {
  if ((specifier.startsWith('./') || specifier.startsWith('../'))
      && !/\.[cm]?[jt]sx?$|\.json$|\.css$/.test(specifier)) {
    try { return await next(`${specifier}.ts`, context) } catch { /* 아래로 */ }
  }
  return next(specifier, context)
}
