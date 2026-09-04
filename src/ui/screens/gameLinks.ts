// 만든 사람의 다른 게임 — 타이틀의 「이런 게임은 어떠세요?」가 여는 목록.
//
// 같은 사람이 만든 포켓몬 소재 웹 게임이 셋이다 (Pokemon Aegis · Radiant
// Platinum · PokeRhythm). 셋 다 각자의 도메인에 따로 서 있어서, 하나를 하러 온
// 사람에게 나머지 둘로 가는 길이 화면 어디에도 없었다.
//
// ⚠️ **「나를 뺀 둘」을 손으로 적지 않는다.** 사이트마다 둘씩 적어 두면 게임이
// 하나 늘 때 세 군데를 고쳐야 하고, 한 군데를 빠뜨려도 아무도 모른다. 목록은
// 셋을 다 적고 내보낼 때 `SELF`만 걸러낸다 — 그래서 이 파일은 세 저장소에 **같은
// 내용**으로 놓이고 `SELF` 한 줄만 다르다.
//
// ⚠️ **소개는 한 줄이다.** 한때 갈래 딱지와 두 줄짜리 설명이 더 붙어 있었는데,
// 「PokeRhythm · 리듬게임 · 롬에서 뽑은 악보를 그대로 치기 · 4·5세대 브금 557곡을…」
// 처럼 같은 말을 세 번 하는 카드가 됐다. 여기서 할 일은 「무슨 게임인가」 하나다 —
// 나머지는 건너가면 그쪽 첫 화면이 말한다.
//
// ⚠️ **게임마다 색을 새로 만들지 않는다.** 테마 계약에 없는 색은 화면에 없다
// (DESIGN.md §2). 셋은 이름과 그 한 줄로 갈린다.

// ⚠️ **바깥으로 안 낸다.** 이 둘을 부르는 곳이 여기뿐이라
// `tools/audit/unusedExports.mjs`가 선다 — 세 저장소가 같은 파일을 나눠 갖는다는
// 것은 사람의 약속이지 이 저장소가 재는 것이 아니다
interface OtherGame {
  key: string
  /** 게임 이름 — 옮기지 않는다. 셋 다 로마자 고유명이다 */
  name: string
  url: string
  /** 무슨 게임인가. 이 한 줄이 카드의 전부다 */
  line: string
}

/** 이 사이트가 그 셋 중 누구인가. 목록에서 자기 자신을 빼는 데 쓴다 */
const SELF = 'radiant'

const GAMES: OtherGame[] = [
  {
    key: 'aegis',
    name: 'Pokemon Aegis',
    url: 'https://aegis.siwon.it.kr',
    line: '포켓몬 타워 디펜스 X TFT 게임',
  },
  {
    key: 'radiant',
    name: 'Radiant Platinum',
    url: 'https://radiant.siwon.it.kr',
    line: '포켓몬 플래티넘을 브라우저에서 3D로',
  },
  {
    key: 'pokerhythm',
    name: 'PokeRhythm',
    url: 'https://pokerhythm.siwon.it.kr',
    line: '포켓몬 BGM 리듬게임',
  },
]

/** 여기 말고 갈 수 있는 곳 — 목록에서 나만 뺀 것 */
export const OTHER_GAMES: OtherGame[] = GAMES.filter((g) => g.key !== SELF)
