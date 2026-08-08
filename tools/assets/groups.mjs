// 에셋을 **누가 만드는가** (COPYRIGHT.md §5 · §6)
//
// `public/data`와 `public/models`에 놓이는 것은 전부 롬에서 구운 것이라 리포에
// 안 들어간다. 그러면 새 기계에서 "없다"는 것까지는 알아도 **무엇을 돌려야
// 생기는지**를 모른다. 그 짝을 여기 한 군데에 둔다.
//
// ⚠️ **손으로 적은 표가 아니다.** 짝은 추출기 소스에서 뽑았다 —
// `writeJson('species.json', …)` · `OUT_DIR = 'public/data/npc'` 처럼 쓰는 자리를
// 전부 훑었다. 그리고 `manifest.mjs`가 **아무에게도 안 물린 파일이 하나라도
// 있으면 선다.** 그래서 추출기가 새 파일을 뱉기 시작하면 조용히 빠지지 않는다.
//
// ⚠️ **`pnpm extract` 체인에 없는 것이 셋 있다.** 사람 그림(`npcSprites.js`)은
// pnpm 스크립트 자체가 없고, BDSP에서 오는 셋(주인공·배틀 무대·사람 표)은
// 파이썬이라 별도로 돌린다. 이 표는 그 사실을 감추지 않고 그대로 적는다.

const under = (prefix) => (p) => p.startsWith(prefix)
const oneOf = (...names) => (p) => names.includes(p)
const nameIn = (dir, ...heads) => (p) =>
  heads.some((h) => p.startsWith(`${dir}/${h}`))

/**
 * 앞에서부터 먼저 맞는 것이 임자다.
 *
 * `name`은 매니페스트의 열쇠이자 `pnpm assets:pull --group=<name>`의 이름이다.
 * `make`는 **그 자리를 다시 채우는 명령**이다 — 버킷이 없을 때 이걸 그대로 찍는다
 */
export const GROUPS = [
  // 덩치들. 지금도 gitignore라 새 기계에 없다
  { name: 'chunks', make: 'pnpm extract:chunks', match: under('data/chunks/') },
  { name: 'props', make: 'pnpm extract:props', match: under('data/props/') },
  { name: 'mapTextures', make: 'pnpm extract:mapTextures', match: under('data/tex/') },
  { name: 'sound', make: 'pnpm extract:sound', match: under('data/sound/') },
  { name: 'pokegra', make: 'pnpm extract:pokegra', match: under('data/pokemon/') },
  { name: 'starterScene', make: 'pnpm extract:starterScene', match: under('data/starter/') },
  { name: 'dialogue', make: 'pnpm extract:dialogue', match: under('data/dialogue/') },
  { name: 'matrices', make: 'pnpm extract:matrices', match: under('data/matrices/') },

  // `names/`는 갈래가 다섯이다. 이름표는 그 자료를 뽑는 추출기가 같이 뱉는다
  {
    name: 'headers',
    make: 'pnpm extract:headers',
    match: (p) => p === 'data/maps.json' || nameIn('data/names', 'locations.')(p),
  },
  {
    name: 'items',
    make: 'pnpm extract:items',
    match: (p) => p === 'data/items.json' || nameIn('data/names', 'items.', 'itemDescriptions.')(p),
  },
  {
    name: 'moves',
    make: 'pnpm extract:moves',
    match: (p) => p === 'data/moves.json' || nameIn('data/names', 'moves.', 'labels.')(p),
  },
  {
    name: 'species',
    make: 'pnpm extract:species',
    match: (p) => p === 'data/species.json' || nameIn('data/names', 'species.')(p),
  },
  {
    name: 'trainers',
    make: 'pnpm extract:trainers',
    match: (p) =>
      p === 'data/trainers.json' || nameIn('data/names', 'trainers.', 'trainerClasses.')(p),
  },

  { name: 'bdhc', make: 'pnpm extract:bdhc', match: oneOf('data/bdhc.bin', 'data/bdhc.json') },
  { name: 'events', make: 'pnpm extract:events', match: oneOf('data/events.json') },
  {
    name: 'scripts',
    make: 'pnpm extract:scripts',
    match: oneOf('data/scripts.bin', 'data/scripts.json'),
  },
  { name: 'encounters', make: 'pnpm extract:encounters', match: oneOf('data/encounters.json') },
  { name: 'marts', make: 'pnpm extract:marts', match: oneOf('data/marts.json') },
  { name: 'spawns', make: 'pnpm extract:spawns', match: oneOf('data/spawns.json') },
  {
    name: 'itemIcons',
    make: 'pnpm extract:itemIcons',
    match: oneOf('data/itemIcons.json', 'data/itemIcons.png'),
  },
  {
    name: 'pokeIcons',
    make: 'pnpm extract:pokeIcons',
    match: oneOf('data/pokeIcons.json', 'data/pokeIcons.png'),
  },
  {
    name: 'boxWallpapers',
    make: 'pnpm extract:boxWallpapers',
    match: oneOf('data/boxWallpapers.json', 'data/boxWallpapers.png'),
  },
  {
    name: 'signposts',
    make: 'pnpm extract:signposts',
    match: oneOf('data/signposts.json', 'data/signposts.png'),
  },

  // ⚠️ pnpm 스크립트가 없다. `extract` 체인에도 안 들어 있어서 손으로 돌려야 한다
  {
    name: 'npcSprites',
    make: 'node tools/extract/npcSprites.js',
    match: (p) => p === 'data/npcSprites.json' || under('data/npc/')(p),
  },

  // 모델. BDSP 번들에서 오고 파이썬을 거친다 (PLAN §4.3)
  {
    name: 'npcModels',
    make: 'pnpm extract:npcModels',
    match: (p) => p === 'data/npcModels.json' || under('models/npc/')(p),
  },
  {
    name: 'bdspNpcTable',
    make: 'py -3.13 tools/extract/bdspNpc.py <persons/field> public/data/bdspNpc.json',
    match: oneOf('data/bdspNpc.json'),
  },
  {
    name: 'player',
    make: 'py -3.13 tools/extract/dawn_to_glb.py',
    match: oneOf('models/dawn.glb'),
  },
  {
    name: 'arena',
    make: 'pnpm extract:arenas',
    match: under('models/arena/'),
  },
]

/** 이 파일을 만드는 것은 누구인가. 아무도 아니면 null — 부르는 쪽이 세운다 */
export function ownerOf(path) {
  return GROUPS.find((g) => g.match(path)) ?? null
}
