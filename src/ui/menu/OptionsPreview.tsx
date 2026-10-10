// 설정 미리보기 — 아래 띠 오른쪽의 항목별 견본 아홉 (`options.md` §4.3).
//
// **순수 그림이다.** 상태는 받기만 하고, 스프라이트 · 이름 · 롬 글은 기존 로더(`gameData`)로 부른다. 판을 깔지 않고
// 창 얼굴 위에 바로 그린다. 값이 바뀌면 0.18s 크로스페이드(`previewBody`의 `key`)하고 창은 안 움직인다.
//
// 지어낸 수치가 없다: 글 머무름 30프레임(`WaitButtonABTime 30`)에 `BATTLE_PACE`를 곱한 값, 롬 뱅크 368의 835번 물음,
// 롬 이름(팽도리 · 찌르꼬 · 롱스톤 · 강석 · 물대포)이다.
import { useEffect, useState } from 'react'
import { useAssetImage } from '../../data/providers/useAssetUrl'
import {
  loadDialogueBank, loadMoveNames, loadSpeciesNames, loadTrainerClasses, loadTrainerNames,
  type DataLocale,
} from '../../data/gameData'
import { fillMenuText, loadUiText, OPTIONS_TEXT } from '../../data/uiText'
import { BATTLE_PACE, LANGUAGES, type Language, type Options } from '../../state/optionsStore'
import { pickLang, type RowKey } from './optionsRows'
import * as own from './optionsScreen.css'

/** 견본에 쓰는 롬 번호 — 전부 실제 자료다 */
const SAMPLE = {
  /** 팽도리(내 포켓몬 · 뒷모습) */ piplup: 393,
  /** 찌르꼬(상대 · 앞모습) */ starly: 396,
  /** 물대포 */ waterGun: 55,
  /** 롱스톤 */ onix: 95,
  /** 체육관 관장 강석 (`trainers.json` 246번) */ roark: 246,
  /** 분류 「체육관 관장」 */ gymLeaderClass: 62,
  /** 배틀 뱅크 */ battleBank: 368,
  /** 「…내보내려 하고 있다 / 포켓몬을 교체하시겠습니까?」 */ shiftAsk: 835,
} as const

/** 글 머무름의 원작 프레임 수 (`WaitButtonABTime 30`) */
const TEXT_HOLD_FRAMES = 30

/** 닫는다 줄이 보여 주는 바뀐 항목 한 줄 */
export interface ChangeLine { label: string, from: string, to: string }

export interface PreviewProps {
  row: RowKey
  options: Options
  language: Language
  /** 설치된 언어 수 — 하나면 그렇게 말한다 */
  installed: number
  /** 에셋 확인의 지금 상태 */
  verify: { text: string, warn: boolean } | null
  /** 확인이 도는 중이면 진행률(0~100) */
  verifyPct: number | null
  /** 닫는다 줄: 바뀐 항목 */
  changes: readonly ChangeLine[]
}

/** 불러온 값을 잡는다. 못 받으면 빈 채로 둔다 — 견본은 덤이다 */
function useLoaded<T>(load: () => Promise<T>, dep: unknown): T | undefined {
  const [got, setGot] = useState<T | undefined>(undefined)
  useEffect(() => {
    let alive = true
    load().then((v) => { if (alive) setGot(v) }, () => { /* 견본은 덤이다 */ })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- `load`는 `dep`에서 나온 클로저다
  }, [dep])
  return got
}

/** 배틀 애니메이션: 내 포켓몬 · 상대 포켓몬 도트 1배와, 「본다」일 때만 지나가는 물줄기 */
function SceneSample({ on, locale }: { on: boolean, locale: DataLocale }) {
  const mine = useAssetImage(`data/pokemon/${String(SAMPLE.piplup)}_back.png`)
  const foe = useAssetImage(`data/pokemon/${String(SAMPLE.starly)}_front.png`)
  const moves = useLoaded(() => loadMoveNames(locale), locale)
  return (
    <div className={own.duel}>
      <div className={own.duelMine} style={mine === null ? undefined : { backgroundImage: `url(${mine})` }} />
      <div className={own.duelFoe} style={foe === null ? undefined : { backgroundImage: `url(${foe})` }} />
      <span className={own.moveName}>{moves?.[SAMPLE.waterGun] ?? ''}</span>
      {on && <span className={own.jet} aria-hidden />}
    </div>
  )
}

/** 시합 룰: 「교체」는 물음까지, 「토너먼트」는 앞 줄만 (물음 없음) */
function RuleSample({ shift, locale }: { shift: boolean, locale: DataLocale }) {
  const bank = useLoaded(() => loadDialogueBank(locale, SAMPLE.battleBank), locale)
  const species = useLoaded(() => loadSpeciesNames(locale), locale)
  const trainers = useLoaded(() => loadTrainerNames(locale), locale)
  const classes = useLoaded(() => loadTrainerClasses(locale), locale)
  const raw = bank?.[SAMPLE.shiftAsk] ?? ''
  const filled = fillMenuText(raw, [
    classes?.[SAMPLE.gymLeaderClass] ?? '', trainers?.[SAMPLE.roark] ?? '', species?.[SAMPLE.onix] ?? '',
  ])
  // 롬은 쪽 나눔(`\f`) 앞이 알림이고 뒤가 물음이다
  const [notice = '', question = ''] = filled.split('\f')
  return (
    <div className={own.battleMessage}>
      {notice}
      {shift && question !== '' && `\n${question}`}
    </div>
  )
}

function PaceBar({ label, scale, on }: { label: string, scale: number, on: boolean }) {
  const frames = TEXT_HOLD_FRAMES * scale
  return (
    <>
      <span className={on ? own.paceOn : undefined}>{label}</span>
      <span className={own.paceTrack}>
        <span
          className={on ? own.paceFillOn : own.paceFill}
          style={{ display: 'block', width: `${String(scale * 100)}%` }}
        />
      </span>
      <span className={on ? `${own.paceNum} ${own.paceOn}` : own.paceNum}>{`${String(frames)}F`}</span>
    </>
  )
}

/** 배틀 진행: 글 머무름 30프레임 × 배율. 고른 막대만 채운다 */
function PaceSample({ at, labels }: { at: number, labels: readonly string[] }) {
  return (
    <div className={own.pace}>
      {BATTLE_PACE.map((scale, i) => (
        <PaceBar key={i} label={labels[i] ?? ''} scale={scale} on={i === at} />
      ))}
    </div>
  )
}

/** 시점: 글쇠 둘과 3인칭 ↔ 1인칭. 1인칭이면 마우스로 둘러본다는 한 줄 */
function ViewSample({ view, language }: { view: number, language: Language }) {
  const our = <T,>(ko: T, en: T, ja: T): T => pickLang(language, ko, en, ja)
  const names = our(['3인칭', '1인칭'], ['THIRD PERSON', 'FIRST PERSON'], ['三人称', '一人称'])
  return (
    <>
      <div className={own.keys}>
        <span className={own.cap}>V</span>
        <span className={own.cap}>{our('휠', 'WHEEL', 'ホイール')}</span>
      </div>
      <div className={own.cams}>
        {names.map((n, i) => <span key={i} className={i === view ? own.camOn : own.cam}>{n}</span>)}
      </div>
      {view === 1 && (
        <div className={own.pnote}>
          {our(
            '마우스로 둘러보고 보는 쪽으로 걷는다',
            'Look around with the mouse and walk where you look.',
            'マウスで見回し、向いた方へ歩く',
          )}
        </div>
      )}
    </>
  )
}

/** 언어: 그 언어로 바뀐 이 화면의 첫 묶음 — 항목 이름 셋과 설명 한 줄을 그 롬 글로 */
function LanguageSample({ language, installed }: { language: Language, installed: number }) {
  const locale = LANGUAGES[language] ?? 'ko'
  const bank = useLoaded(() => loadUiText('options', locale), locale)
  const our = <T,>(ko: T, en: T, ja: T): T => pickLang(language, ko, en, ja)
  const L = OPTIONS_TEXT.labels
  return (
    <>
      <div className={own.lang}>
        {[L.battleScene, L.battleRule, L.sound].map((at) => bank?.[at] ?? '').join(' · ')}
      </div>
      <div className={own.langHelp}>{bank?.[OPTIONS_TEXT.help.battleScene] ?? ''}</div>
      {installed < 2 && (
        <div className={own.pnote}>
          {our('설치된 언어는 한 가지입니다', 'Only one language is installed.', 'インストール済みの言語は一つです')}
        </div>
      )}
    </>
  )
}

/** 사운드: 왼쪽 · 오른쪽 두 칸. 스테레오면 엇갈려 울리고 모노면 같이 울린다 */
function SoundSample({ mono }: { mono: boolean }) {
  return (
    <div className={own.speakers}>
      <span className={own.speaker}>L</span>
      <span className={mono ? own.speaker : `${own.speaker} ${own.speakerLate}`}>R</span>
    </div>
  )
}

/** 에셋 확인: 도는 중이면 막대와 퍼센트, 끝났으면 결과 글, 안 눌렀으면 안내 */
function VerifySample(
  { verify, pct, language }: { verify: PreviewProps['verify'], pct: number | null, language: Language },
) {
  const our = <T,>(ko: T, en: T, ja: T): T => pickLang(language, ko, en, ja)
  if (pct !== null) {
    return (
      <div className={own.pace}>
        <span className={own.paceOn}>{our('확인', 'CHECK', '確認')}</span>
        <span className={own.paceTrack}>
          <span className={own.paceFillOn} style={{ display: 'block', width: `${String(pct)}%` }} />
        </span>
        <span className={`${own.paceNum} ${own.paceOn}`}>{`${String(pct)}%`}</span>
      </div>
    )
  }
  if (verify !== null) return <div className={own.pnote}>{verify.text}</div>
  return (
    <div className={own.pnote}>
      {our('켤 때마다 하지 않는 검사 — 몇 분', 'A check we skip on every start — minutes', '起動のたびには行わない検査 — 数分')}
    </div>
  )
}

/** 처음부터: 하는 일 세 걸음 */
function ResetSample({ language }: { language: Language }) {
  const steps = pickLang(language,
    ['세이브 파일로 받는다', '「백업에서 되찾기」에 한 벌 남긴다', '지우고 타이틀로 간다'],
    ['Save it as a file', 'Keep a copy under 「백업에서 되찾기」', 'Erase it and go to the title'],
    ['セーブファイルとして保存する', '「백업에서 되찾기」に一つ残す', '消してタイトルへ戻る'],
  )
  return <ol className={own.steps}>{steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
}

/** 닫는다: 바꾼 것 목록. 없으면 견본을 비운다 — 롬 설명(52번)은 대사창이 이미 보여 준다 */
function CloseSample({ changes }: { changes: readonly ChangeLine[] }) {
  if (changes.length === 0) return null
  return (
    <div className={own.diff}>
      {changes.map((c) => (
        <div key={c.label}>
          {c.label} <span className={own.diffOld}>{c.from}</span> → <span className={own.diffNew}>{c.to}</span>
        </div>
      ))}
    </div>
  )
}

export function OptionsPreview(p: PreviewProps) {
  const locale = LANGUAGES[p.language] ?? 'ko'
  const our = <T,>(ko: T, en: T, ja: T): T => pickLang(p.language, ko, en, ja)
  const paceLabels = our(
    ['원작대로', '빠르게', '아주 빠르게'], ['AS ORIGINAL', 'FAST', 'VERY FAST'], ['原作どおり', 'はやい', 'とてもはやい'],
  )
  return (
    <div className={own.preview} aria-hidden>
      <div key={p.row} className={own.previewBody}>
        {p.row === 'battleScene' && <SceneSample on={p.options.battleScene === 0} locale={locale} />}
        {p.row === 'battleRule' && <RuleSample shift={p.options.battleRule === 0} locale={locale} />}
        {p.row === 'battlePace' && (
          <>
            <PaceSample at={p.options.battlePace} labels={paceLabels} />
            <div className={own.pnote}>
              {our(
                '글 머무름 · 체력 게이지 · 기절에 같이 걸린다',
                'Applies to text hold, gauges and fainting.',
                'メッセージ・HPゲージ・ひんしに共通で効きます',
              )}
            </div>
          </>
        )}
        {p.row === 'view' && <ViewSample view={p.options.view} language={p.language} />}
        {p.row === 'language' && <LanguageSample language={p.language} installed={p.installed} />}
        {p.row === 'sound' && <SoundSample mono={p.options.sound === 1} />}
        {p.row === 'verify' && <VerifySample verify={p.verify} pct={p.verifyPct} language={p.language} />}
        {p.row === 'reset' && <ResetSample language={p.language} />}
        {p.row === 'close' && <CloseSample changes={p.changes} />}
      </div>
    </div>
  )
}
