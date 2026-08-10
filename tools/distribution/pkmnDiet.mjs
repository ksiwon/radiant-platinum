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

/**
 * `build/esm/` 아래 상대 경로 → 그 자리에 넣을 껍데기.
 *
 * 내보내는 이유는 시험이 **실제 패키지 파일과 맞대 보기** 위해서다 —
 * 패키지가 올라 경로가 바뀌면 규칙이 조용히 아무것도 안 맞게 된다
 */
export const SHIMS = [
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

  // ── 안 쓰는 세대 모드: 217kB ──────────────────────────────────────────────
  //
  // `Dex.forGen(4)`는 gen4 → gen5 → gen6 → gen7 → gen8 → base(gen9)로만 거슬러
  // 올라간다 (`Scripts.inherit`). gen1·2·3은 반대 방향이라 4세대가 절대 안 읽고,
  // bdsp·legends는 gen8에서 갈라진 다른 가지다. `dexes[mod]`는 만들어지기만 하고
  // `loadData()`가 안 불린다 — 우리가 그 mod로 배틀을 안 하기 때문이다
  { match: /^data\/mods\/(gen1|gen2|gen3|gen8bdsp|gen8legends)\//, source: 'export {}\n' },
]

/**
 * 아직 못 뺀 것. **숨기지 않는다.**
 *
 * 이 표에 있는 것은 전부 **코드와 데이터가 한 파일에 섞여 있다** — `moves.mjs`의
 * 한 항목은 위력·명중률 같은 수치와 `onHit(target, source)` 같은 구현이 한
 * 객체다. 수치만 빼려면 파일을 반으로 가르는 변환이 필요하고, 그건 이 자리에서
 * 조용히 할 일이 아니다.
 *
 * `pokedex.mjs`는 다르다 — 순수 데이터고, 사용자의 롬에 같은 것이 있다.
 * 그것을 OPFS 설치본에서 주입하는 것이 다음 일이다 (DEPLOY.md §4).
 */
export const KEPT = [
  { file: 'data/pokedex.mjs', why: '종족 표 — 순수 데이터. 롬에서 주입할 수 있다. **다음 일**' },
  { file: 'data/moves.mjs', why: '기술 — 위력·명중률 같은 수치와 `onHit` 구현이 한 객체다' },
  { file: 'data/items.mjs', why: '도구 — 수치와 구현이 한 객체다. 같은 이유' },
  { file: 'data/abilities.mjs', why: '특성 — 수치와 구현이 한 객체다. 같은 이유' },
  { file: 'data/conditions.mjs', why: '상태 이상 — 거의 전부가 구현 코드다' },
  { file: 'data/rulesets.mjs', why: '룰 — 구현. `gen4customgame`이 여기서 나온다' },
  { file: 'data/typechart.mjs', why: '상성표 7kB — 타입 18×18 격자' },
  { file: 'data/natures.mjs', why: '성격 1.5kB — 25종의 능력치 보정' },
  { file: 'data/scripts.mjs', why: '배틀 진행 구현. 데이터가 아니다' },
  { file: 'data/index.mjs', why: '위 표들을 모으는 자리. 437바이트' },
  { file: 'data/mods/gen4..gen8/*', why: '4세대로 거슬러 올라가는 사슬. 세대 차이만 담는다' },
]

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
