// 설정 — 원작의 여섯 항목.
//
// 항목도 값도 `options_menu` 뱅크(us#220)에서 그대로 온다. 우리가 이름을 새로
// 짓지 않는다.
//
// 여섯 항목이 다 먹는다: **이야기의 속도**(대사창 인쇄기), **배틀 애니메이션**
// (기술 연출과 카메라 샷을 통째로 끈다 — 원작의 그 항목이 하는 일이다),
// **시합규칙**(「교체」면 상대가 다음 마리를 내보내기 전에 우리도 바꿀지 묻는다),
// **사운드**, 그리고 우리가 연 **배틀 진행**·**시점**.
//
// 아래 네 줄은 원작에 없다. **배틀 진행**은 원작이 느리다고 오래 비판받은 대목을
// 우리가 손댈 수 있게 연 자리고(원작 길이는 `playback.ts`에 그대로 있다),
// 시점 전환은 3D로 옮기면서 생겼고, **언어**는 원작 롬이 언어마다 따로 찍혀 나와서
// 있을 수 없던 항목이며, "처음부터"는 원작이 타이틀에서 위+SELECT+B로 하는 것을
// 여기로 옮긴 것이다.
//
// 원작 항목의 글은 뱅크가 언어를 따라간다. 하지만 **우리가 연 항목은 뱅크에
// 없어서** 그 넷만 여기서 두 언어로 적어 둔다 — 언어를 영어로 두고 이 화면을
// 열었을 때 절반만 한국어로 남으면 그것 자체가 고장으로 보인다.
import { useEffect, useState } from 'react'
import { loadUiText, OPTIONS_TEXT } from '../../data/uiText'
import { useMenuStore } from '../../state/menuStore'
import {
  availableLanguages, LANGUAGE_NAMES, LANGUAGES, useGameLocale, useOptionsStore,
  type BattlePace, type BattleRule, type BattleScene,
  type Language, type Options, type SoundMode, type TextSpeed, type ViewMode,
} from '../../state/optionsStore'
import { APP_ROOT } from '../../data/assetBase'
import { useSaveStore } from '../../state/saveStore'
import { verifyEverything } from '../../app/integrityWatch'
import { clampCursor, useMenuKeys, wrapCursor } from './useMenuKeys'
import { MenuScreen } from './MenuScreen'
import * as css from './menuChrome.css'
import * as own from './dialog.css'

interface Row {
  key: keyof Options | 'reset' | 'verify'
  label: string
  /** 고를 수 있는 값의 글. 'reset'은 값이 없다 */
  values: string[]
  at: number
  help: string
  /** 원작에 없는 항목 */
  ours?: boolean
}

export function OptionsScreen() {
  const [text, setText] = useState<string[]>([])
  const [cursor, setCursor] = useState(0)
  const [confirming, setConfirming] = useState(false)
  /** 손으로 부른 에셋 확인의 진행·결과. 없으면 안 눌렀다는 뜻이다 */
  const [verifying, setVerifying] = useState<string | null>(null)
  const back = useMenuStore((s) => s.back)
  const closeAll = useMenuStore((s) => s.closeAll)
  const options = useOptionsStore()
  const resetSave = useSaveStore((s) => s.resetSave)
  const locale = useGameLocale()

  useEffect(() => {
    let alive = true
    // 옛 글을 안 지운다. 지우면 언어를 바꾼 순간 항목 이름이 한 번 비었다가
    // 돌아오고, 못 받으면 빈 화면으로 남는다 — 그대로 두면 옛 언어로 남는다
    void loadUiText('options', locale)
      .then((bank) => { if (alive) setText(bank) })
      .catch(() => { /* 빈 설정 */ })
    return () => { alive = false }
  }, [locale])

  const at = (i: number): string => text[i] ?? ''
  const pick = (list: readonly number[]): string[] => list.map(at)
  /**
   * 우리가 연 항목의 글. 원작 뱅크에 없으니 여기서 고른다.
   *
   * 자리는 `LANGUAGES`의 차례와 같다 — 한국어 · 영어 · 일본어
   */
  const our = <T,>(ko: T, en: T, ja: T): T => [ko, en, ja][options.language] ?? ko

  // 설치된 언어와 지금 언어. 화면과 `move`가 같은 목록을 봐야 한다
  const langs = availableLanguages()
  const here = LANGUAGES[options.language] ?? langs[0]!

  const rows: Row[] = [
    {
      key: 'speed', label: at(OPTIONS_TEXT.labels.speed),
      // 앞 셋은 원작 글이고 "즉시"는 우리가 연 자리다. 값은 원작의
      // `TEXT_SPEED_INSTANT`라 새로 지어낸 속도는 아니다
      values: [...pick(OPTIONS_TEXT.speed), '즉시'], at: options.speed,
      help: at(OPTIONS_TEXT.help.speed),
    },
    {
      key: 'battleScene', label: at(OPTIONS_TEXT.labels.battleScene),
      values: pick(OPTIONS_TEXT.battleScene), at: options.battleScene,
      help: at(OPTIONS_TEXT.help.battleScene),
    },
    {
      key: 'battleRule', label: at(OPTIONS_TEXT.labels.battleRule),
      values: pick(OPTIONS_TEXT.battleRule), at: options.battleRule,
      help: at(OPTIONS_TEXT.help.battleRule),
    },
    {
      key: 'sound', label: at(OPTIONS_TEXT.labels.sound),
      values: pick(OPTIONS_TEXT.sound), at: options.sound,
      help: at(OPTIONS_TEXT.help.sound),
    },
    {
      key: 'battlePace', label: our('배틀 진행', 'BATTLE PACE', 'バトルの速さ'),
      values: our(
        ['원작대로', '빠르게', '아주 빠르게'],
        ['AS ORIGINAL', 'FAST', 'VERY FAST'],
        ['原作どおり', 'はやい', 'とてもはやい'],
      ),
      at: options.battlePace,
      help: our(
        '글이 머무는 시간과 체력바 속도\n원작 후반 한 턴이 14초쯤 걸립니다',
        'How long text lingers, and gauge speed.\nA late-game turn runs about 14 seconds in the original.',
        'メッセージが残る時間とHPゲージの速さ\n原作では終盤の1ターンに14秒ほどかかります',
      ), ours: true,
    },
    {
      key: 'view', label: our('시점', 'CAMERA', 'カメラ'),
      values: our(['3인칭', '1인칭'], ['THIRD PERSON', 'FIRST PERSON'], ['三人称', '一人称']),
      at: options.view,
      help: our(
        '휠과 V로도 바꿉니다\n1인칭은 마우스로 둘러보고 보는 쪽으로 걷습니다',
        'The wheel and V switch it too.\nIn first person the mouse looks around and you walk where you look.',
        'ホイールとVでも切り替えられます\n一人称ではマウスで見回し、向いた方へ歩きます',
      ),
      ours: true,
    },
    {
      key: 'language', label: our('언어', 'LANGUAGE', '言語'),
      // 우리가 옮긴 말이 아니라 그 나라 롬에 찍힌 글이다. 그래서 이름·기술·설명까지
      // 통째로 바뀐다 — 화면 글만 갈아 끼우는 것이 아니다.
      //
      // 언어 이름은 그 언어로 적는 것이 맞다 — 어느 언어에서나 같다.
      // ⚠️ **설치된 것만 보여 준다.** 개발판은 세 벌이 다 있지만 공개판은
      // 사용자가 고른 롬 하나에서 나온 언어뿐이다 (optionsStore의
      // `setAvailableLocales`). 안 그러면 고를 수는 있는데 글이 전부 비는
      // 칸이 생긴다
      values: langs.map((l) => LANGUAGE_NAMES[l]), at: Math.max(0, langs.indexOf(here)),
      help: our(
        '이름도 기술도 설명도 그 나라 롬의 글로 바뀝니다\n지금 서 있는 맵의 대사까지 곧바로 바뀝니다',
        'Names, moves and descriptions all come from that ROM.\nEven the dialogue of the map you stand on switches at once.',
        '名前も技も説明も、その国のROMの文字になります\n今いるマップのセリフもすぐに切り替わります',
      ), ours: true,
    },
    {
      key: 'verify', label: our('에셋 확인', 'CHECK ASSETS', 'アセット確認'),
      values: [], at: 0,
      help: verifying ?? our(
        '설치된 파일을 전부 다시 읽어 확인합니다\n켤 때마다 하지 않는 검사입니다 — 몇 분 걸립니다',
        'Re-reads every installed file and checks it.\nThis is the check we skip on every start — it takes minutes.',
        'インストール済みのファイルを全部読み直して確かめます\n起動のたびには行わない検査です — 数分かかります',
      ), ours: true,
    },
    {
      key: 'reset', label: our('처음부터', 'NEW GAME', 'はじめから'),
      values: [], at: 0,
      help: our(
        '리포트를 지우고 새로 시작합니다\n지운 것은 되돌릴 수 없습니다',
        'Erases your report and starts over.\nWhat is erased cannot be brought back.',
        'レポートを消して最初から始めます\n消したものは元に戻せません',
      ), ours: true,
    },
  ]

  const row = rows[Math.min(cursor, rows.length - 1)]

  /**
   * 설치본을 손으로 전부 확인한다.
   *
   * ⚠️ **부팅에서 안 하는 검사가 여기 있다** (IMPORT.md §15). 개발판은
   * 설치 기록이 없어서 `null`이 오고, 그때는 할 말이 없다고 말한다
   */
  const checkAssets = (): void => {
    if (verifying) return
    setVerifying(our('확인하는 중… 0%', 'Checking… 0%', '確認中… 0%'))
    void verifyEverything((done, total) => {
      const pct = total > 0 ? Math.round((done / total) * 100) : 0
      setVerifying(our(`확인하는 중… ${pct}%`, `Checking… ${pct}%`, `確認中… ${pct}%`))
    })
      .then((got) => {
        if (!got) { setVerifying(our('개발판이라 확인할 설치 기록이 없습니다', 'Dev build — nothing installed to check', '開発版なので確認する記録がありません')); return }
        if (got.broken.length === 0) {
          setVerifying(our(`파일 ${got.ok}개가 전부 온전합니다`, `All ${got.ok} files are intact`, `ファイル${got.ok}件すべて無事です`))
          return
        }
        // ⚠️ 깨진 그룹만 말한다. 나머지는 그대로 쓴다
        setVerifying(our(
          `⚠️ 파일 ${got.broken.length}개가 어긋납니다 — 다시 만들 그룹: ${got.groups.join(' · ')}`,
          `⚠️ ${got.broken.length} files are wrong — groups to rebuild: ${got.groups.join(' · ')}`,
          `⚠️ ファイル${got.broken.length}件が食い違います — 作り直すグループ: ${got.groups.join(' · ')}`,
        ))
      })
      .catch((e: unknown) => { setVerifying(`⚠️ ${String(e)}`) })
  }

  const move = (delta: number): void => {
    if (!row || row.key === 'reset' || row.key === 'verify' || row.values.length === 0) return
    const next = wrapCursor(row.at, delta, row.values.length)
    // 언어 칸의 자리는 **설치된 목록 안의 자리**다. 저장하는 값은
    // `LANGUAGES` 기준 번호라 되돌려 준다
    const value = row.key === 'language' ? LANGUAGES.indexOf(langs[next]!) : next
    options.set(row.key,
      value as TextSpeed & BattleScene & BattleRule & SoundMode & ViewMode & BattlePace & Language)
  }

  useMenuKeys({
    up: () => { setCursor((c) => clampCursor(c, -1, rows.length)) },
    down: () => { setCursor((c) => clampCursor(c, 1, rows.length)) },
    left: () => { move(-1) },
    right: () => { move(1) },
    confirm: () => {
      if (row?.key === 'reset') { setConfirming(true); return }
      if (row?.key === 'verify') { checkAssets(); return }
      move(1)
    },
    cancel: () => { if (confirming) setConfirming(false); else back() },
  }, !confirming)

  if (confirming) return <ResetConfirm text={text} language={options.language} onNo={() => { setConfirming(false) }} onYes={() => {
    // 리포트를 지우고 타이틀로 나간다. 처음부터면 인트로부터 다시 봐야 한다
    // 에셋이 아니라 **앱 셸**로 돌아가는 것이다. CDN 주소를 쓰면 안 된다
    void resetSave().then(() => { closeAll(); location.assign(APP_ROOT) })
  }} />

  return (
    <MenuScreen
      title={at(OPTIONS_TEXT.title) || our('설정', 'OPTIONS', '設定')}
      foot={our(
        '↑↓ 항목 · ←→ 값 · Z 결정 · X 돌아가기',
        '↑↓ Item · ←→ Value · Z Set · X Back',
        '↑↓ 項目 · ←→ 値 · Z 決定 · X もどる',
      )}
    >
      <div className={own.center}>
        <div className={own.rows}>
          {rows.map((r, i) => (
            <div key={r.key} className={i === cursor ? own.optionRowOn : own.optionRow}>
              {i === cursor && <span className={css.caret} aria-hidden />}
              <span className={css.face}>
                <span className={own.rowLabel}>
                  {r.label}
                  {r.ours && <span className={own.ours}>{our('추가', 'ADDED', '追加')}</span>}
                </span>
                <span className={own.values}>
                  {r.values.map((v, k) => (
                    // ⚠️ **자리(k)로 묶는다. 글(v)로 묶으면 안 된다.**
                    //
                    // 뱅크가 오기 전 첫 그림에서 값은 전부 빈 글이다. 그때 글로
                    // 묶으면 한 줄의 두 칸이 **같은 열쇠**를 갖는데, React는 옛
                    // 자식을 열쇠로 색인한 Map에 담고(`mapRemainingChildren`)
                    // 남은 것만 지운다. 겹친 열쇠는 Map에서 덮여 사라지므로
                    // **지워지지 않고 DOM에 남는다.** 그렇게 남은 빈 칸이 고른
                    // 값 자리였으면 초록 판으로 보인다 — 글자 없는 초록 블럭이
                    // 그것이었다. 값은 자리가 곧 뜻이라 처음부터 k가 맞다
                    <span key={k} className={k === r.at ? own.valueOn : own.value}>{v}</span>
                  ))}
                </span>
              </span>
            </div>
          ))}
        </div>
        <div className={own.help}>{row?.help}</div>
      </div>
    </MenuScreen>
  )
}

/** 되돌릴 수 없는 것은 한 번 더 묻는다 */
function ResetConfirm(
  { text, language, onYes, onNo }:
  { text: string[]; language: Language; onYes: () => void; onNo: () => void },
) {
  /** 자리는 `LANGUAGES`의 차례와 같다 — 한국어 · 영어 · 일본어 */
  const our = (ko: string, en: string, ja: string): string => [ko, en, ja][language] ?? ko
  const [yes, setYes] = useState(false)
  useMenuKeys({
    left: () => { setYes(true) },
    right: () => { setYes(false) },
    confirm: () => { if (yes) onYes(); else onNo() },
    cancel: onNo,
  })
  return (
    <div className={css.overlay}>
      <div className={own.center}>
        <div className={own.prompt}>
          {our(
            '리포트를 지우고 처음부터 시작합니다\n정말로 괜찮겠습니까?',
            'Your report will be erased and the game starts over.\nIs that really all right?',
            'レポートを消して最初から始めます\n本当によろしいですか？',
          )}
        </div>
        <div className={own.choices}>
          <span className={yes ? own.choiceOn : own.choice}>{text[OPTIONS_TEXT.yes] ?? '예'}</span>
          <span className={yes ? own.choice : own.choiceOn}>{text[OPTIONS_TEXT.no] ?? '아니오'}</span>
        </div>
      </div>
      <div className={css.hint}>
        {our('←→ 고르기 · Z 결정 · X 그만둔다', '←→ Choose · Z Set · X Cancel', '←→ 選ぶ · Z 決定 · X やめる')}
      </div>
    </div>
  )
}
