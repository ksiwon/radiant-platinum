// `@pkmn/sim`에서 게임 데이터 corpus를 뺀다 (DEPLOY.md §4 · COPYRIGHT.md §2)
//
// ⚠️ **트리 셰이킹으로는 안 된다.** `sim/dex.mjs`가 데이터 모듈 110개를 전부
// **정적으로** import 하고, 그것을 `dexData` 하나로 스프레드해서 만든다.
// 참조가 실제로 살아 있으니 롤업이 뺄 수 없다 — 실측 8,881kB가 그렇게 들어갔다.
//
// 그래서 **모듈을 갈아 끼운다.** `resolveId`에서 데이터 모듈을 잡아 빈 표를
// 내보내는 껍데기로 돌린다. 껍데기는 같은 이름을 같은 모양으로 내보내므로
// `dex.mjs`는 아무것도 모른다.
//
// ⚠️ **엔진 코드와 게임 데이터를 구별한다.** `@pkmn/sim`은 MIT지만, 그 라이선스는
// 패키지 코드에 대한 것이지 그 안에 담긴 포켓몬 데이터에 대한 권리를 주지 않는다.
// 여기서 빼는 것은 **표**고, 남기는 것은 그 표를 다루는 **코드**다. 남은 것이
// 무엇이고 왜 아직 못 뺐는지는 `KEPT`에 그대로 적는다.
//
// ⚠️ **뺐다고 주장하지 않는다.** 빌드가 끝나면 `provenance.mjs`가 청크 안을 다시
// 세고, `check.mjs`가 그 숫자를 blocker에 적는다. 이 파일이 하는 말과 그 숫자가
// 어긋나면 숫자가 이긴다.
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

/**
 * 우리 표가 있는 자리. 껍데기가 여기서 다시 내보낸다.
 *
 * ⚠️ **절대 경로로 적는다.** 가상 모듈에는 자기 자리가 없어서 상대 경로가
 * 어디를 가리킬지 정해지지 않는다
 */
const TABLES = resolve(import.meta.dirname, '../../src/engine/battle/dex/tables.ts')
  .split('\\').join('/')

/**
 * `data/` 아래 모듈을 **우리 표로** 바꾼다.
 *
 * ⚠️ 여기 없는 모듈이 하나라도 남으면 blocker가 안 풀린다 — `provenance.mjs`가
 * `@pkmn/sim/build/esm/data/` 아래에서 온 것을 전부 세기 때문이다
 */
const OURS = (names) => `export { ${names.join(', ')} } from ${JSON.stringify(TABLES)}\n`

export const SHIMS = [
  // ── 표: 사용자의 롬에서 채운다 (`src/engine/battle/dex/provider.ts`) ───────
  //
  // 수치·이름은 롬, 효과 구현은 `MechanicsRegistry`다. 왜 그렇게 갈랐는지는
  // COPYRIGHT.md §2.9 · DEPLOY.md §4
  { match: /^data\/index\.mjs$/, source: OURS(['Abilities', 'Aliases', 'Conditions', 'Rulesets', 'Items', 'Moves', 'Natures', 'Pokedex', 'Scripts', 'TypeChart', 'Tags']) },
  { match: /^data\/pokedex\.mjs$/, source: OURS(['Pokedex']) },
  { match: /^data\/moves\.mjs$/, source: OURS(['Moves']) },
  { match: /^data\/items\.mjs$/, source: OURS(['Items']) },
  { match: /^data\/abilities\.mjs$/, source: OURS(['Abilities']) },
  { match: /^data\/conditions\.mjs$/, source: OURS(['Conditions']) },
  { match: /^data\/rulesets\.mjs$/, source: OURS(['Rulesets']) },
  { match: /^data\/typechart\.mjs$/, source: OURS(['TypeChart']) },
  { match: /^data\/natures\.mjs$/, source: OURS(['Natures']) },
  { match: /^data\/scripts\.mjs$/, source: OURS(['Scripts']) },

  // ── 세대 사슬: 미리 평탄화했다 ──────────────────────────────────────────
  //
  // ⚠️ **gen4가 base를 그대로 상속한다.** `loadData`는 base가 아닌 모드의
  // 부모를 `Scripts.inherit || 'base'`로 정한다. 우리 `Scripts`에는 `inherit`이
  // 없으므로 gen4 → base 한 단계뿐이고, base의 표가 곧 4세대 평탄화 결과다.
  // 그래서 gen1~8·bdsp·legends 모드는 통째로 빈 것이 맞다 (실측 217kB)
  { match: /^data\/mods\//, source: 'export {}\n' },

  // ── 습득기술: 5,202kB. 전 세대 전 종족의 기술 습득표다 ──────────────────────
  //
  // 배틀 심판은 이걸 안 본다 — 팀 합법성 검사(`TeamValidator`)만 본다. 우리는
  // 팀을 롬에서 만들고 `gen4customgame`으로 검증 없이 넣으므로 한 번도 안 읽힌다
  { match: /(^|\/)learnsets\.mjs$/, source: 'export const Learnsets = {}\n' },
  { match: /(^|\/)legality\.mjs$/, source: 'export const Legality = {}\n' },

  // ── 설명문: 778kB. 기술·특성·아이템의 영어 설명이다 ────────────────────────
  //
  // 우리는 롬의 글을 쓴다 (`data/names/`). `Dex.getDescs`가 빈 표에서 못 찾으면
  // null을 돌려주고, 그 자리는 우리 글로 채워진다
  { match: /^data\/text\/abilities\.mjs$/, source: 'export const AbilitiesText = {}\n' },
  { match: /^data\/text\/items\.mjs$/, source: 'export const ItemsText = {}\n' },
  { match: /^data\/text\/moves\.mjs$/, source: 'export const MovesText = {}\n' },
  { match: /^data\/text\/default\.mjs$/, source: 'export const DefaultText = {}\n' },

  // ── 티어·별명·GO: 489kB ──────────────────────────────────────────────────
  //
  // `FormatsData`는 대전 티어(OU/UU…)와 현행 룰의 사용 가능 여부다. 4세대
  // 싱글에 티어 개념을 안 쓴다. `Aliases`는 이름 별명인데 우리는 **번호**로
  // 잇는다 (`bridge.ts`). `PokemonGoData`는 다른 게임 데이터다
  { match: /(^|\/)formats-data\.mjs$/, source: 'export const FormatsData = {}\n' },
  { match: /^data\/aliases\.mjs$/, source: 'export const Aliases = {}\n' },
  { match: /^data\/pokemongo\.mjs$/, source: 'export const PokemonGoData = {}\n' },
  { match: /^data\/tags\.mjs$/, source: 'export const Tags = {}\n' },
]

/**
 * `data/` 아래에서 **안 갈아 끼우는** 모듈. 지금은 없다.
 *
 * 비어 있는 것이 목표 상태다 — 하나라도 남으면 `provenance.mjs`가 그것을 세고
 * `check.mjs`가 blocker에 적는다. 이 목록은 그 자리에 무엇이 왜 남았는지를
 * 사람이 읽을 수 있게 두는 칸이고, 지금은 남은 것이 없다
 */
export const KEPT = []

/** `build/esm/` 아래 경로로 정규화. pnpm의 해시 경로를 안 본다 */
function relOf(id) {
  const at = id.replace(/\\/g, '/').indexOf('/@pkmn/sim/build/esm/')
  return at < 0 ? null : id.replace(/\\/g, '/').slice(at + '/@pkmn/sim/build/esm/'.length)
}

const PREFIX = '\0pkmn-diet:'

/**
 * ⚠️ **`eval()` 하나가 CSP를 통째로 열게 만들던 자리** (DEPLOY.md §3).
 *
 * `sim/battle-stream.mjs`의 `>eval <js>`는 Showdown 서버 콘솔의 디버그 명령이다.
 * 우리는 그 줄을 한 번도 안 보내지만, 코드에 `eval(`이 있다는 것만으로 CSP에
 * `'unsafe-eval'`이 필요해진다 — 스크립트 정책을 통째로 여는 대가로 우리가 안
 * 쓰는 디버그 기능을 남기는 것은 맞바꿈이 안 맞는다.
 *
 * 그래서 그 호출만 던지는 문장으로 바꾼다. 나머지 스트림 코드는 그대로다.
 */
const EVAL_SITE = { file: 'sim/battle-stream.mjs', from: 'eval(message)', to: EVAL_REPLACEMENT() }

function EVAL_REPLACEMENT() {
  return "(() => { throw new Error('>eval is removed in this build') })()"
}

/**
 * 개발 서버의 미리 묶기(esbuild)에도 같은 것을 건다.
 *
 * ⚠️ **안 걸면 개발과 배포가 갈린다.** `optimizeDeps`는 롤업이 아니라 esbuild가
 * 하고, 그 길에는 위 `resolveId`가 안 불린다 — 그러면 개발판만 진짜 표를 들고
 * 돌게 되고, 표가 없어서 나는 문제를 배포 직전에야 만난다. 같은 규칙을 같은
 * 파일에서 읽어 양쪽에 건다
 */
export function pkmnDietEsbuild() {
  return {
    name: 'radiant-pkmn-diet-esbuild',
    setup(build) {
      build.onLoad({ filter: /@pkmn[\\/]sim[\\/]build[\\/]esm[\\/].*\.mjs$/ }, (args) => {
        const rel = relOf(args.path)
        if (!rel) return null
        const shim = SHIMS.find((s) => s.match.test(rel))
        if (shim) return { contents: shim.source, loader: 'js' }
        if (rel !== EVAL_SITE.file) return null
        const code = readFileSync(args.path, 'utf8')
        return { contents: code.replaceAll(EVAL_SITE.from, EVAL_SITE.to), loader: 'js' }
      })
    },
  }
}

/**
 * @returns {import('vite').Plugin}
 */
export function pkmnDiet() {
  const swapped = new Set()
  let strippedEval = false

  return {
    name: 'radiant-pkmn-diet',
    enforce: 'pre',

    async resolveId(source, importer, options) {
      if (!importer || !importer.includes('@pkmn')) return null
      const got = await this.resolve(source, importer, { ...options, skipSelf: true })
      if (!got) return null
      const rel = relOf(got.id)
      if (!rel) return null
      const shim = SHIMS.find((s) => s.match.test(rel))
      if (!shim) return null
      swapped.add(rel)
      return PREFIX + rel
    },

    load(id) {
      if (!id.startsWith(PREFIX)) return null
      const rel = id.slice(PREFIX.length)
      const shim = SHIMS.find((s) => s.match.test(rel))
      // 껍데기임을 소스에 적어 둔다. 배포물을 열어 본 사람이 무엇인지 알 수 있게
      return `// @pkmn/sim ${rel} — 게임 데이터라 뺐다 (tools/distribution/pkmnDiet.mjs)\n${shim.source}`
    },

    transform(code, id) {
      if (relOf(id) !== EVAL_SITE.file) return null
      if (!code.includes(EVAL_SITE.from)) {
        // 패키지가 올라 호출 모양이 바뀌면 조용히 지나가면 안 된다
        this.error(`${EVAL_SITE.file}에서 ${EVAL_SITE.from}을 못 찾았다 — CSP 가정이 깨졌다`)
      }
      strippedEval = true
      return { code: code.replaceAll(EVAL_SITE.from, EVAL_SITE.to), map: null }
    },

    buildEnd() {
      // 하나도 안 갈렸으면 규칙이 안 맞은 것이다. 조용히 통과시키면 8.5MB가 그대로 나간다
      if (swapped.size === 0) this.error('pkmnDiet: 갈아 끼운 모듈이 0개다 — 경로 규칙이 안 맞는다')
      if (!strippedEval) this.error('pkmnDiet: battle-stream의 eval을 못 지웠다')
    },
  }
}
