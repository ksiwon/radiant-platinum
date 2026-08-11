// 시험 실행에서만 쓰는 `@vanilla-extract/css` 대역
//
// ⚠️ **CSS를 굽는 데 시험 시간의 대부분이 갔다.** `@vanilla-extract/vite-plugin`은
// `.css.ts` 하나를 구우려고 별도의 vite 실행을 띄우는데, 그것이 시험 실행 전체를
// 느리게 만든다 — 실측으로 배틀 시험 27벌이 **219초 → 36초**, 빈 시험 하나가
// **76초 → 0.3초**였다. transform 1,066초가 3초가 됐다.
//
// 시험은 화면을 안 그린다. 여기서 필요한 것은 `.css.ts`가 **같은 이름들을
// 내보내는 것**뿐이고, 그 안의 값이 진짜 클래스 이름인지는 아무 시험도 안 본다
// (`.css`를 직접 가져오는 시험 파일이 하나도 없다). 그래서 vite 플러그인을 빼고
// 이 대역을 끼운다 — `.css.ts`는 **그대로 실행되므로** 그 안의 타입 오류와
// 실행 오류는 여전히 잡힌다.
//
// ⚠️ **진짜 CSS가 나오는지는 여기서 안 잰다.** 그건 `pnpm build`가 매번 굽고,
// 스타일이 실제로 화면에 붙는지는 브라우저 실측이 본다 (DEPLOY.md §5).

let serial = 0

/** 매번 다른 이름. 같은 이름 두 개가 나오면 두 스타일이 한 칸처럼 보인다 */
function fresh(kind: string): string {
  serial += 1
  return `${kind}_${serial.toString(36)}`
}

export function style(_rule?: unknown, debugId?: string): string {
  return fresh(debugId ?? 'style')
}

export function styleVariants(
  map: Record<string, unknown>,
  _mapper?: unknown,
  debugId?: string,
): Record<string, string> {
  const out: Record<string, string> = {}
  for (const key of Object.keys(map)) out[key] = fresh(`${debugId ?? 'variant'}_${key}`)
  return out
}

export function keyframes(_steps?: unknown, debugId?: string): string {
  return fresh(debugId ?? 'keyframes')
}

/** 전역 스타일은 돌려줄 것이 없다. 부작용만 있는 함수다 */
export function globalStyle(_selector: string, _rule: unknown): void {
  /* 굽지 않는다 */
}

/**
 * 계약은 **모양이 중요하다** — 화면 코드가 `vars.panel.text`처럼 깊이 들어간다.
 * 잎을 CSS 변수 글자로 바꾸고 나머지 구조는 그대로 둔다
 */
export function createThemeContract<T>(shape: T, prefix = '--rp'): T {
  const walk = (node: unknown, path: string): unknown => {
    if (node !== null && typeof node === 'object') {
      const out: Record<string, unknown> = {}
      for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
        out[key] = walk(value, `${path}-${key}`)
      }
      return out
    }
    return `var(${path})`
  }
  return walk(shape, prefix) as T
}

/** `createTheme(contract, tokens)`는 클래스 이름 하나를 돌려준다 */
export function createTheme(_contract: unknown, _tokens?: unknown, debugId?: string): string {
  return fresh(debugId ?? 'theme')
}

export function createGlobalTheme(_selector: string, _contract: unknown, _tokens?: unknown): void {
  /* 굽지 않는다 */
}

export function fontFace(_rule: unknown, debugId?: string): string {
  return fresh(debugId ?? 'font')
}

export function globalKeyframes(_name: string, _steps: unknown): void {
  /* 굽지 않는다 */
}

export function assignVars(_contract: unknown, _tokens: unknown): Record<string, string> {
  return {}
}
