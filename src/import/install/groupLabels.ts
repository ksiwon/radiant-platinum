// 설치 그룹의 사람 이름 (IMPORT.md §4)
//
// 그룹 id(`npcModels`·`chunks`…)는 설치 기록과 변환기 사이의 열쇠다. 화면에
// 그대로 내면 「다시 만들 그룹: npcSprites · pokegra」가 되고, 사람은 그것으로
// 무엇이 깨졌는지 모른다. **바꾸는 것은 보여 줄 때뿐이다** — 기록·저널·data-boot는
// 계속 id를 쓴다.
//
// ⚠️ **`import/groups.ts`를 읽지 않는다.** 거기에는 변환기 열몇 벌이 달려 오고,
// 이 파일은 `app/boot.ts`가 정적으로 닿는 자리라 그것이 전부 첫 화면 청크가 된다
// (§15 · `installer.ts` 머리말). 그래서 표를 여기 따로 두고, 빠진 id가 없는지는
// 시험이 `ALL_GROUPS`와 맞대어 본다.
//
// 설정 화면은 세 언어로 같은 문장을 만든다 — 그래서 세 벌이다. 표에 없는 id는
// id 그대로 돌려준다: 모르는 이름을 지어내는 것보다 열쇠가 보이는 편이 낫다.

type Lang = 'ko' | 'en' | 'ja'

const LABELS: Readonly<Record<string, Readonly<Record<Lang, string>>>> = {
  // ── Platinum 롬 ──
  text: { ko: '글과 대사', en: 'Text and dialogue', ja: 'テキストとセリフ' },
  species: { ko: '포켓몬 정보', en: 'Pokémon data', ja: 'ポケモンのデータ' },
  moves: { ko: '기술', en: 'Moves', ja: 'わざ' },
  marts: { ko: '상점 물건', en: 'Shop stock', ja: 'ショップの品ぞろえ' },
  npcTrades: { ko: '포켓몬 교환', en: 'In-game trades', ja: 'ゲーム内のこうかん' },
  items: { ko: '도구', en: 'Items', ja: 'どうぐ' },
  maps: { ko: '맵 정보', en: 'Map data', ja: 'マップのデータ' },
  chunks: { ko: '지형', en: 'Terrain', ja: '地形' },
  scripts: { ko: '이벤트', en: 'Events', ja: 'イベント' },
  sound: { ko: '음악과 효과음', en: 'Music and sound', ja: '音楽と効果音' },
  encounters: { ko: '야생 포켓몬 출현', en: 'Wild encounters', ja: '野生ポケモンの出現' },
  trainers: { ko: '트레이너', en: 'Trainers', ja: 'トレーナー' },
  spawns: { ko: '부활 지점·공중날기', en: 'Respawn and Fly points', ja: '復活地点・そらをとぶ' },
  npcSprites: { ko: '인물 그림', en: 'Character sprites', ja: '人物の絵' },
  itemIcons: { ko: '도구 그림', en: 'Item icons', ja: 'どうぐの絵' },
  pokeIcons: { ko: '포켓몬 아이콘', en: 'Pokémon icons', ja: 'ポケモンのアイコン' },
  bagSprite: { ko: '가방 그림', en: 'Bag picture', ja: 'バッグの絵' },
  hallOfFameBg: { ko: '명예의 전당 배경', en: 'Hall of Fame backgrounds', ja: '殿堂入りの背景' },
  pointerHand: { ko: '가리키는 손', en: 'Pointing hand', ja: '指さしの手' },
  demoModels: { ko: '연출 모델', en: 'Cutscene models', ja: '演出のモデル' },
  frontierBg: { ko: '배틀프런티어 배경', en: 'Battle Frontier backgrounds', ja: 'バトルフロンティアの背景' },
  areaLight: { ko: '지역의 빛', en: 'Area lighting', ja: 'エリアの光' },
  encounterEffect: { ko: '배틀 시작 연출', en: 'Battle intro effects', ja: 'バトル開始の演出' },
  libraryTv: { ko: '도서관 텔레비전', en: 'Library TV', ja: '図書館のテレビ' },
  wallpaperWords: { ko: '벽지 암호 낱말', en: 'Wallpaper password words', ja: 'かべがみパスワードの言葉' },
  slots: { ko: '슬롯머신', en: 'Slot machines', ja: 'スロットマシン' },
  unownFont: { ko: '안농 글자', en: 'Unown letters', ja: 'アンノーン文字' },
  boxWallpapers: { ko: '박스 벽지', en: 'Box wallpapers', ja: 'ボックスのかべがみ' },
  poketchMap: { ko: '포켓치 지도', en: 'Pokétch map', ja: 'ポケッチのマップ' },
  signposts: { ko: '표지판', en: 'Signposts', ja: '看板' },
  particles: { ko: '기술 연출', en: 'Move effects', ja: 'わざの演出' },
  starterScene: { ko: '파트너 고르는 장면', en: 'Starter selection', ja: '最初のポケモン選び' },
  distortionProps: { ko: '깨어진 세계 소품', en: 'Distortion World props', ja: 'やぶれたせかいの小物' },
  pokegra: { ko: '포켓몬 그림', en: 'Pokémon sprites', ja: 'ポケモンの絵' },
  trainerSprites: { ko: '트레이너 그림', en: 'Trainer sprites', ja: 'トレーナーの絵' },
  berries: { ko: '나무열매', en: 'Berries', ja: 'きのみ' },
  credits: { ko: '엔딩 크레딧', en: 'Credits', ja: 'エンディングクレジット' },
  frontier: { ko: '배틀프런티어', en: 'Battle Frontier', ja: 'バトルフロンティア' },
  pokedex: { ko: '포켓몬 도감', en: 'Pokédex', ja: 'ポケモン図鑑' },
  townMap: { ko: '타운맵', en: 'Town Map', ja: 'タウンマップ' },
  distortion: { ko: '깨어진 세계', en: 'Distortion World', ja: 'やぶれたせかい' },
  // ── BDSP 폴더 ──
  npcModels: { ko: '사람 모델', en: 'Character models', ja: '人物のモデル' },
  monModels: { ko: '포켓몬 모델', en: 'Pokémon models', ja: 'ポケモンのモデル' },
  arenas: { ko: '배틀 무대', en: 'Battle stages', ja: 'バトルの舞台' },
  rooms: { ko: '실내', en: 'Interiors', ja: '屋内' },
  fields: { ko: '야외', en: 'Outdoor areas', ja: '屋外' },
  dungeons: { ko: '던전', en: 'Dungeons', ja: 'ダンジョン' },
  motionTiming: { ko: '타격 타이밍', en: 'Hit timing', ja: '攻撃のタイミング' },
  monVariants: { ko: '이로치·암컷 모습', en: 'Shiny and female forms', ja: '色違い・メスの姿' },
}

/** 그룹 하나의 사람 이름. 표에 없으면 id를 그대로 돌려준다 */
export function groupLabel(id: string, lang: Lang = 'ko'): string {
  return LABELS[id]?.[lang] ?? id
}

/** 여럿을 한 줄로. 화면 곳곳이 같은 구분자(` · `)를 쓴다 */
export function groupLabels(ids: readonly string[], lang: Lang = 'ko'): string {
  return ids.map((id) => groupLabel(id, lang)).join(' · ')
}
