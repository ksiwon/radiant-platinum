// 소지금·코인 창 (`FieldMenu_CreateMoneyWindow` · `FieldMenu_DrawCoinWindow`)
//
// 글은 한 자도 우리가 짓지 않는다 — 이름표 「용돈」과 문장 틀 「{수}원」이
// 롬 뱅크 543의 18·19번이고, 코인의 「{수}개」는 뱅크 361의 197번이다.
//
// 자리도 원작 그대로다. 상점 앞은 `ShowMoney 20, 2`, 게임코너는 코인이 20,2고
// 돈이 20,7이다 — 두 창이 겹치지 않게 원작이 띄워 둔 간격이다.
import { useEffect, useState } from 'react'
import { COIN_WINDOW_TEXT, fillMenuText, loadUiText, MONEY_WINDOW_TEXT } from '../../data/uiText'
import { useGameLocale } from '../../state/optionsStore'
import { useCurrencyStore, type CurrencyWindow as WindowState } from '../../state/currencyStore'
import * as css from './currencyWindow.css'

/**
 * 타일 → 퍼센트. 원작 화면이 32×24타일(256×192픽셀)이다.
 *
 * ⚠️ `.css.ts`가 아니라 여기 있다 — vanilla-extract는 스타일 파일이 함수를
 * 내보내는 것을 막는다
 */
const pctX = (tiles: number): string => `${String((tiles / 32) * 100)}%`
const pctY = (tiles: number): string => `${String((tiles / 24) * 100)}%`

/** `MONEY_WINDOW_WIDTH`·`_HEIGHT` — 10×4타일 */
const MONEY_SIZE = { w: 10, h: 4 }
/** `COIN_BP_WINDOW_WIDTH`·`_HEIGHT` — 10×2타일 */
const COIN_SIZE = { w: 10, h: 2 }

export function CurrencyWindow() {
  const money = useCurrencyStore((s) => s.money)
  const coins = useCurrencyStore((s) => s.coins)
  const locale = useGameLocale()
  const [text, setText] = useState<{ label: string, money: string, coins: string } | null>(null)

  useEffect(() => {
    let alive = true
    void Promise.all([loadUiText('shop', locale), loadUiText('menuEntries', locale)])
      .then(([shop, menu]) => {
        if (!alive) return
        setText({
          label: shop[MONEY_WINDOW_TEXT.label] ?? '',
          money: shop[MONEY_WINDOW_TEXT.amount] ?? '',
          coins: menu[COIN_WINDOW_TEXT] ?? '',
        })
      })
      .catch(() => { setText(null) })
    return () => { alive = false }
  }, [locale])

  if (money === null && coins === null) return null

  return (
    <div className={css.stage}>
      {money !== null && (
        <Box at={money} size={MONEY_SIZE} label={text?.label ?? ''} format={text?.money ?? ''} />
      )}
      {coins !== null && (
        <Box at={coins} size={COIN_SIZE} label={null} format={text?.coins ?? ''} />
      )}
    </div>
  )
}

/** 창 하나. 이름표가 없으면 숫자 한 줄뿐이다 (코인 창이 그렇다) */
function Box(
  { at, size, label, format }:
  { at: WindowState, size: { w: number, h: number }, label: string | null, format: string },
) {
  return (
    <div
      className={css.box}
      style={{
        left: pctX(at.left),
        top: pctY(at.top),
        width: pctX(size.w),
        height: pctY(size.h),
      }}
    >
      {label !== null && <span className={css.label}>{label}</span>}
      {/* 원작은 자릿수를 공백으로 맞춰 찍는데(6자리·5자리) 우리 글꼴은 폭이
          고르지 않다. 오른쪽 맞춤이 같은 결과를 낸다 */}
      <span className={css.amount}>{fillMenuText(format, [at.value.toLocaleString('ko-KR')])}</span>
    </div>
  )
}
