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
// ⚠️ **`pnpm extract`가 다 굽지 않는다.** 롬에서 오는 것은 그 체인이 굽고,
// BDSP 번들에서 오는 것(주인공·사람 모델·포켓몬·변형·배틀 무대·사람 표·
// 타격 프레임)은 `pnpm extract:models`가 굽는다. 둘 다 돌려야 다 찬다.

const under = (prefix) => (p) => p.startsWith(prefix)
const oneOf = (...names) => (p) => names.includes(p)
const nameIn = (dir, ...heads) => (p) =>
  heads.some((h) => p.startsWith(`${dir}/${h}`))

/**
 * 앞에서부터 먼저 맞는 것이 임자다.
 *
 * `name`은 목차의 열쇠다. `make`는 그 그룹을 다시 굽는 명령이고,
 * 자료가 없을 때 `pnpm assets:check`가 그대로 찍어 준다.
 * `make`는 **그 자리를 다시 채우는 명령**이다 — 버킷이 없을 때 이걸 그대로 찍는다
 */
export const GROUPS = [
  // 덩치들. 지금도 gitignore라 새 기계에 없다
  { name: 'chunks', make: 'pnpm extract:chunks', match: under('data/chunks/') },
  { name: 'props', make: 'pnpm extract:props && pnpm extract:propAnims', match: under('data/props/') },
  { name: 'mapTextures', make: 'pnpm extract:mapTextures', match: under('data/tex/') },
  { name: 'sound', make: 'pnpm extract:sound', match: under('data/sound/') },
  { name: 'pokegra', make: 'pnpm extract:pokegra', match: under('data/pokemon/') },
  {
    name: 'trainerSprites',
    make: 'pnpm extract:trainerSprites',
    match: under('data/trainers/'),
  },
  { name: 'starterScene', make: 'pnpm extract:starterScene', match: under('data/starter/') },
  { name: 'particles', make: 'pnpm extract:particles', match: under('data/particles/') },
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
    name: 'berries',
    make: 'pnpm extract:berries',
    match: oneOf('data/berries.json'),
  },
  {
    name: 'distortion',
    make: 'pnpm extract:distortion',
    match: oneOf('data/distortion.json', 'data/distortionSky.png', 'data/distortionSky.json'),
  },
  {
    name: 'pokedexSort',
    make: 'pnpm extract:pokedexSort',
    match: (p) => /^data\/pokedexSort\.[a-z]+\.json$/.test(p),
  },
  {
    name: 'pokedexHabitat',
    make: 'pnpm extract:pokedexHabitat',
    match: oneOf('data/pokedexHabitat.json'),
  },
  {
    name: 'moves',
    make: 'pnpm extract:moves',
    match: (p) => p === 'data/moves.json' || nameIn('data/names', 'moves.', 'labels.')(p),
  },
  {
    name: 'distortionProps',
    make: 'pnpm extract:distortionProps',
    match: (p) => p.startsWith('data/distortionProps/'),
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
  {
    name: 'encounters',
    make: 'pnpm extract:encounters',
    match: oneOf('data/encounters.json', 'data/encountersEx.json'),
  },
  { name: 'marts', make: 'pnpm extract:marts', match: oneOf('data/marts.json') },
  { name: 'npcTrades', make: 'pnpm extract:npcTrades', match: oneOf('data/npcTrades.json') },
  // 배틀프런티어의 개체 형 951과 트레이너 315 (PARITY §9.3). 배틀팩토리에
  // 들어갈 때만 읽는다 — 138KB라 첫 왕복에 실을 것이 아니다
  { name: 'frontier', make: 'pnpm extract:frontier', match: oneOf('data/frontier.json') },
  { name: 'spawns', make: 'pnpm extract:spawns', match: oneOf('data/spawns.json') },
  {
    // 가방 그림 여덟 장 × 두 벌과 주머니 아이콘 (DESIGN.md §5). 가방 화면을
    // 열 때만 읽는다 — 6KB라 크지도 않다
    name: 'bagSprite',
    make: 'pnpm extract:bagSprite',
    match: oneOf('data/bagSprite.json', 'data/bagSprite.png', 'data/bagPockets.png'),
  },
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
    // 명예의 전당 배경 (PARITY §8.11). 전당에 오를 때만 받는다
    name: 'hallOfFameBg',
    make: 'pnpm extract:hallOfFameBg',
    match: oneOf('data/hallOfFameBg.png'),
  },
  {
    // 포획 강좌의 가리키는 손 (`battle/indicator.c`). 202번도로에서 한 번 받는다
    name: 'pointerHand',
    make: 'pnpm extract:pointerHand',
    match: oneOf('data/pointerHand.png'),
  },
  {
    // 도서관 텔레비전 뉴스 (`StartLibraryTV`). 운하시티 도서관 3층에서 한 번 받는다
    name: 'libraryTv',
    make: 'pnpm extract:libraryTv',
    match: oneOf('data/libraryTv.png'),
  },
  {
    // 창기둥과 깨어진 세계로 가는 문 — 필드 밖 연출의 모델
    name: 'demoModels',
    make: 'pnpm extract:demoModels',
    match: (p) => p.startsWith('data/demo/'),
  },
  {
    // 배틀팩토리 복도 · 배틀룸 판
    name: 'frontierBg',
    make: 'pnpm extract:frontierBg',
    match: (p) => p.startsWith('data/frontier/'),
  },
  {
    // 지역 빛 네 벌 — 배로 건너가기의 배가 받는다
    name: 'areaLight',
    make: 'pnpm extract:areaLight',
    match: oneOf('data/areaLight.json'),
  },
  {
    // 조우 컷인의 그림 — 관장 · 사천왕 · 갤럭시 컷인이 받는다
    name: 'encounterEffect',
    make: 'pnpm extract:encounterEffect',
    match: (p) => p.startsWith('data/encounterEffect/'),
  },
  {
    // 벽지 암호 낱말표 (축복TV 3층 · `GetWallpaperFromCustomMessageWords`)
    name: 'wallpaperWords',
    make: 'pnpm extract:wallpaperWords',
    match: oneOf('data/wallpaperWords.json'),
  },
  {
    // 게임코너 슬롯머신 (PARITY §7.6). 기계 앞에 앉을 때만 받는다
    name: 'slots',
    make: 'pnpm extract:slots',
    match: oneOf('data/slotBg.png', 'data/slotSprites.png', 'data/slotSprites.json'),
  },
  {
    // 신수유적 벽글을 안농 모양으로 찍는 글꼴 (PARITY §6.8). 벽글을 읽을 때만 받는다
    name: 'unownFont',
    make: 'pnpm extract:unownFont',
    match: oneOf('data/unownFont.json', 'data/unownFont.png'),
  },
  {
    name: 'boxWallpapers',
    make: 'pnpm extract:boxWallpapers',
    match: oneOf('data/boxWallpapers.json', 'data/boxWallpapers.png'),
  },
  {
    name: 'poketchMap',
    make: 'pnpm extract:poketchMap',
    match: oneOf('data/poketchMap.json', 'data/poketchMap.png'),
  },
  {
    name: 'credits',
    make: 'pnpm extract:credits',
    // 배치표는 판마다 한 벌이다 (`credits.<판>.json` — PARITY §8.12)
    match: (p) => p === 'data/credits.json' || /^data\/credits\d+\.png$/.test(p)
      || /^data\/credits\.[a-z]+\.json$/.test(p),
  },
  {
    name: 'townMap',
    make: 'pnpm extract:townMap',
    match: oneOf('data/townMap.json', 'data/townMap.png'),
  },
  {
    name: 'signposts',
    make: 'pnpm extract:signposts',
    match: oneOf('data/signposts.json', 'data/signposts.png'),
  },

  {
    name: 'npcSprites',
    make: 'pnpm extract:npcSprites',
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
    // 인자 없이 돌면 `persons/`의 두 뭉치를 다 훑어 제자리에 쓴다
    make: 'py -3.13 tools/extract/bdspNpc.py',
    match: oneOf('data/bdspNpc.json'),
  },
  {
    name: 'player',
    // ⚠️ **`dawn_to_glb.py`는 은퇴했다.** 그것은 받아 온 `raw/models/Dawn/Dawn.dae`를
    // Blender 4.2로 물리는 길이었고, 재료를 리포가 만들지 못한다. 무엇보다
    // **사용자는 그 몸을 한 번도 못 봤다** — 브라우저는 처음부터 번들에서 구웠다
    // (`import/bdsp/convert.ts`가 `persons/battle/pc0002_00`을 내보낸다).
    // 개발만 다른 몸을 보고 있었고, 그래서 팔 내림 상수가 사용자가 안 쓰는 몸에
    // 맞춰져 있었다 (`actor/gait`의 `armDrop`). 지금은 둘이 같은 것을 굽는다
    make: 'pnpm extract:player',
    match: oneOf('models/dawn.glb'),
  },
  {
    // 자전거 한 대. 인물이 아니라 소품 번들에서 온다 (DATA.md §4.2.1)
    name: 'bike',
    make: 'pnpm extract:bike',
    match: oneOf('models/bike.glb'),
  },
  {
    // 길에 떨어진 도구로 서는 몬스터볼 하나 (`scene/ItemBalls`)
    name: 'pokeball',
    make: 'pnpm extract:pokeball',
    match: oneOf('models/pokeball.glb'),
  },
  {
    // 주인공이 **들고 타는 것들**이 한 번들에 같이 있다
    // (`Characters/persons/field/pc_parts`): 파도타기 몸 `naminori_00_00` ·
    // 공중날기 몸 `sora_00_00` · 물뿌리개 · 낚싯대 셋(`fo1005~1007`).
    // 지금 쓰는 것은 파도타기뿐이지만 한 파일이라 따로 자를 것이 없다
    name: 'pcParts',
    make: 'pnpm extract:pcParts',
    match: oneOf('models/pcParts.glb'),
  },
  {
    name: 'arena',
    make: 'pnpm extract:arenas',
    match: under('models/arena/'),
  },
  {
    // 실내 방 — BDSP가 입체로 다시 지은 건물 안 117벌 (docs/DATA.md §2.17.5)
    name: 'room',
    make: 'pnpm extract:rooms',
    match: under('models/room/'),
  },
  {
    // 바깥 — BDSP 야외 지역 13벌 + 대습지. 굽는 쪽은 설치기와 같은 타입스크립트다 (docs/DATA.md §2.17.6)
    name: 'field',
    make: 'pnpm extract:fields',
    match: under('models/field/'),
  },
  {
    // 종·폼 본체는 `extract:pokemon`이, 이로치 팔레트와 여성 개체는
    // `extract:pokemonVariants`가 굽는다 — 한 그룹이지만 명령이 둘이다
    name: 'pokemon3d',
    make: 'pnpm extract:pokemon && pnpm extract:pokemonVariants',
    match: under('models/pokemon/'),
  },
  {
    // 종마다 다른 타격 프레임. 배틀이 열릴 때 한 번 받는다 (11.9KB)
    name: 'motionTiming',
    make: 'pnpm extract:motionTiming',
    match: (p) => p === 'data/motionTiming.json',
  },
]

/** 이 파일을 만드는 것은 누구인가. 아무도 아니면 null — 부르는 쪽이 세운다 */
export function ownerOf(path) {
  return GROUPS.find((g) => g.match(path)) ?? null
}
