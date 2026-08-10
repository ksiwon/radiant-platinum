// `tsResolve.mjs`가 등록하는 해석 훅. 확장자 없는 상대 경로에 `.ts`를 붙여 본다
export async function resolve(specifier, context, next) {
  // ⚠️ **JSON은 attribute를 붙여 준다.** 번들러는 `import x from './a.json'`을
  // 그냥 받는데 node ESM은 `with { type: 'json' }`을 요구한다. 앱 코드를 node
  // 사정에 맞춰 고칠 수는 없으므로 여기서 채운다
  if (/\.json$/.test(specifier)) {
    const got = await next(specifier, { ...context, importAttributes: { type: 'json' } })
    // 결과에도 실어야 `load`까지 간다 — context에만 넣으면 검사에서 걸린다
    return { ...got, format: 'json', importAttributes: { type: 'json' } }
  }
  if ((specifier.startsWith('./') || specifier.startsWith('../'))
      && !/\.[cm]?[jt]sx?$|\.css$/.test(specifier)) {
    try { return await next(`${specifier}.ts`, context) } catch { /* 아래로 */ }
  }
  return next(specifier, context)
}
