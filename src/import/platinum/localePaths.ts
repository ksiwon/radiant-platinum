// 지역판마다 자리가 다른 파일 (DATA.md §3.1)
//
// ⚠️ **한국판은 글자가 그려진 그림을 통째로 옮겨 뒀다.** 일본판(CPUJ)이 원래
// 자리고, 한국판(CPUK)은 아래 서른둘을 전부 `/resource/kor/…` 밑으로 옮겼다.
// 미국판(CPUE)은 그중 일곱만 `/resource/eng/…`로 옮기고 나머지는 일본판 자리에
// 그대로 뒀다. 그래서 자리를 하나만 박아 두면 **어느 판에서는 반드시 틀린다.**
//
// 실제로 틀렸다: `box.narc` · `poketch.narc` · `fld_trade.narc` 셋이 미국판
// 자리로 박혀 있어서, 한국판 롬으로 설치하면 그 세 그룹만 "못 읽었다"로 죽었다.
// 수입기가 읽는 자리 37개를 세 롬에 대조해 보니 어긋나는 것이 정확히 그 셋이었다.
//
// 표는 손으로 적은 것이 아니라 **세 롬의 FNT를 견줘서** 뽑았다. 파일 이름으로
// 짝지었고, 이름이 겹치는 것은 없었다. `localePaths.test.ts`가 세 롬을 열어
// 서른두 줄 × 세 판을 전부 다시 확인한다.
//
// ⚠️ **`/data/plbr.dat`은 여기 없다.** 미국판에만 있고 옮겨진 것이 아니라
// 아예 없는 파일이다 (일본판·한국판 둘 다 없다) — 자리 문제가 아니다.

/** 한 줄. `ja`가 열쇠고, 없는 칸은 일본판 자리를 그대로 쓴다는 뜻이다 */
interface Moved {
  en?: string
  ko: string
}

/**
 * 옮겨진 자리 서른둘. 열쇠는 **일본판(원래) 자리**다.
 *
 * ⚠️ 줄을 손으로 늘리지 않는다 — 롬을 견줘서 뽑고 시험으로 굳힌다.
 */
const MOVED: Readonly<Record<string, Moved>> = {
  '/arc/batt_rec_gra.narc': { en: '/resource/eng/batt_rec/batt_rec_gra.narc', ko: '/resource/kor/batt_rec/batt_rec_gra.narc' },
  '/arc/pms_aikotoba.narc': { en: '/resource/eng/pms_aikotoba/pms_aikotoba.narc', ko: '/resource/kor/pms_aikotoba/pms_aikotoba.narc' },
  '/battle/graphic/b_plist_gra.narc': { ko: '/resource/kor/b_plist/b_plist_gra.narc' },
  '/battle/graphic/batt_obj.narc': { ko: '/resource/kor/battle_graphic/batt_obj.narc' },
  '/battle/graphic/pl_b_plist_gra.narc': { ko: '/resource/kor/b_plist/pl_b_plist_gra.narc' },
  '/battle/graphic/pl_batt_obj.narc': { ko: '/resource/kor/battle_graphic/pl_batt_obj.narc' },
  '/battle/graphic/vs_demo_gra.narc': { ko: '/resource/kor/vs_demo/vs_demo_gra.narc' },
  '/contest/graphic/contest_bg.narc': { ko: '/resource/kor/contest_graphic/contest_bg.narc' },
  '/contest/graphic/contest_obj.narc': { ko: '/resource/kor/contest_graphic/contest_obj.narc' },
  '/data/namein.narc': { ko: '/resource/kor/nameinput/namein.narc' },
  '/data/slot.narc': { ko: '/resource/kor/slot/slot.narc' },
  '/demo/title/op_demo.narc': { ko: '/resource/kor/opening_demo/op_demo.narc' },
  '/demo/title/titledemo.narc': { ko: '/resource/kor/title/titledemo.narc' },
  '/fielddata/pokemon_trade/fld_trade.narc': { ko: '/resource/kor/pokemon_trade/fld_trade.narc' },
  '/frontier/graphic/frontier_bg.narc': { en: '/resource/eng/frontier_graphic/frontier_bg.narc', ko: '/resource/kor/frontier_graphic/frontier_bg.narc' },
  '/frontier/graphic/frontier_obj.narc': { en: '/resource/eng/frontier_graphic/frontier_obj.narc', ko: '/resource/kor/frontier_graphic/frontier_obj.narc' },
  '/graphic/bag_gra.narc': { ko: '/resource/kor/bag/bag_gra.narc' },
  '/graphic/box.narc': { ko: '/resource/kor/box/box.narc' },
  '/graphic/imageclip.narc': { ko: '/resource/kor/dress_up_graphic/imageclip.narc' },
  '/graphic/mystery.narc': { ko: '/resource/kor/mysterycard/mystery.narc' },
  '/graphic/nutmixer.narc': { ko: '/resource/kor/nutmixer/nutmixer.narc' },
  '/graphic/pl_bag_gra.narc': { ko: '/resource/kor/bag/pl_bag_gra.narc' },
  '/graphic/pl_plist_gra.narc': { ko: '/resource/kor/pokelist/pl_plist_gra.narc' },
  '/graphic/pl_pst_gra.narc': { ko: '/resource/kor/p_status/pl_pst_gra.narc' },
  '/graphic/plist_gra.narc': { ko: '/resource/kor/pokelist/plist_gra.narc' },
  '/graphic/poketch.narc': { ko: '/resource/kor/poketch/poketch.narc' },
  '/graphic/pst_gra.narc': { ko: '/resource/kor/p_status/pst_gra.narc' },
  '/graphic/scratch.narc': { en: '/resource/eng/scratch/scratch.narc', ko: '/resource/kor/scratch/scratch.narc' },
  '/graphic/touch_subwindow.narc': { ko: '/resource/kor/touch_subwindow/touch_subwindow.narc' },
  '/graphic/trainer_case.narc': { ko: '/resource/kor/trainer_case/trainer_case.narc' },
  '/graphic/wlmngm_tool.narc': { en: '/resource/eng/wifi_lobby_minigame/wlmngm_tool.narc', ko: '/resource/kor/wifi_lobby_minigame/wlmngm_tool.narc' },
  '/graphic/zukan.narc': { en: '/resource/eng/zukan/zukan.narc', ko: '/resource/kor/zukan/zukan.narc' },
}

/** 한 파일이 세 판에서 놓인 자리 */
interface MovedFile {
  ja: string
  en: string
  ko: string
}

const ROWS: readonly MovedFile[] = Object.entries(MOVED)
  .map(([ja, row]) => ({ ja, en: row.en ?? ja, ko: row.ko }))

/**
 * 어느 판의 자리를 적어 넣어도 그 줄을 찾게 한다.
 *
 * ⚠️ **열쇠를 일본판 자리 하나로 못 박으면 안 된다.** 변환기를 쓰는 사람은 자기
 * 앞에 있는 롬을 덤프해서 그 자리를 적는다 — 미국판을 보고 온 사람은
 * `/resource/eng/zukan/zukan.narc`이라고 적을 것이고, 그러면 이 표를 스쳐
 * 지나가 **또 한국판에서만 죽는다.** 셋 다 같은 줄로 들어오게 한다
 */
const INDEX = new Map<string, MovedFile>()
for (const row of ROWS) {
  INDEX.set(row.ja, row)
  INDEX.set(row.en, row)
  INDEX.set(row.ko, row)
}

/** 옮겨진 자리 전부. 시험이 세 롬에 대조한다 */
export function movedFiles(): readonly MovedFile[] {
  return ROWS
}

/**
 * 이 지역판에서 그 파일이 놓인 자리.
 *
 * 표에 없는 자리는 그대로 돌려준다 — 롬 파일 340개 중 옮겨진 것은 서른둘뿐이고,
 * 나머지는 세 판이 같은 자리를 쓴다
 */
export function localePath(path: string, locale: string): string {
  const row = INDEX.get(path)
  if (!row) return path
  if (locale === 'ko') return row.ko
  if (locale === 'en') return row.en
  return row.ja
}
