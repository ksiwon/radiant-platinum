// 배틀 화면 쪼개기 (SYSTEM 4.15) — **이동만 했다**는 것을 잠근다.
//
// `BattleScreen.tsx` 한 파일을 moves · switch · battlehud 셋이 고친다. 그래서 P0a가 먼저 쪼갰다:
//
//   BattleScreen.tsx   짜맞춤과 상태 (HUD가 맡는다)
//   HudPlates.tsx      `MonCard` · `PartyGauge` · `ExpLine` (HUD)
//   CommandArea.tsx    `RootMenu` · `SafariMenu` · `YesNo` · `MoveMenu` · `MoveRows` (기술)
//   battleScreen.css   screen · field · card · log · barFill · keyHint …  (HUD)
//   command.css        button · menu · pp · askWho · waiting · backButton …  (기술)
//
// ⚠️ 클래스 이름 하나만 바뀌어도 `battleGauge` · `potionRow` · `captureBall`(e2e)이 선다. 하네스(`tools/e2e/drive.mjs`)가
// 읽는 이름과 DOM을 여기서 소스로 못 박는다. 화면 DOM 자체는 e2e 배틀 셋이 잰다.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import * as hudCss from './battleScreen.css'
import * as cmdCss from './command.css'

const read = (name: string): string => readFileSync(new URL(`./${name}`, import.meta.url), 'utf8')
const code = (name: string): string => read(name).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '')

/** 하네스와 `hpDrain` 계약이 읽는 클래스 */
const HARNESS = ['cardFoe', 'cardMine', 'barFill', 'hpText', 'logText'] as const

describe('클래스 이름이 그대로다', () => {
  it('하네스가 읽는 다섯이 battleScreen.css에 그대로 있다', () => {
    for (const name of HARNESS) expect(hudCss, name).toHaveProperty(name)
    for (const name of HARNESS) expect(read('battleScreen.css.ts'), name).toContain(`export const ${name} = `)
  })

  it('명령 구역의 이름은 command.css로 나갔고 HUD 쪽에는 안 남았다', () => {
    // 판 얼굴이 둘(`buttonCmd` · `buttonType`)이 되고 물음 줄(`askWho` · `waiting`)은 글창으로 올라갔다 (P5)
    const moved = ['buttonCmd', 'buttonType', 'buttonOn', 'menu', 'side', 'pp', 'ppNow', 'ppMax', 'ppLow', 'ppOut',
      'backStrip', 'caret', 'face', 'wedge', 'label', 'labelCol', 'subLine', 'sep', 'matchLine',
      'matchTone', 'TINT', 'itemIcon', 'learnRoot']
    for (const name of moved) {
      expect(cmdCss, name).toHaveProperty(name)
      expect(hudCss, name).not.toHaveProperty(name)
    }
  })

  it('HUD 쪽 이름은 battleScreen.css에 그대로 있다', () => {
    // 공 줄은 판 위의 작은 창(`tray`)이 되었고 무대 위 맨 글자(`foeTrainer` · `gaugeRow`)는 없어졌다 (P11)
    const stayed = ['screen', 'fallback', 'field', 'foeSlot', 'mineSlot', 'tray', 'gaugeBall',
      'card', 'cardHead', 'monName', 'barRow', 'barTrack', 'expRow', 'expFill', 'hpNow', 'caughtMark', 'statusTag',
      'console_', 'log', 'nextArrow', 'wipe', 'wipeHold', 'openVeil', 'loading', 'loadingBack', 'closeVeil',
      'closeVeilOn', 'levelPanel', 'keyHint']
    for (const name of stayed) expect(hudCss, name).toHaveProperty(name)
  })

  it('BATTLE_LINE 처방이 있고 logText가 그것을 쓴다 (Galmuri11 20)', () => {
    const css = read('battleScreen.css.ts')
    expect(css).toContain('export const BATTLE_LINE = ')
    const text = css.slice(css.indexOf('export const logText'))
    expect(text.slice(0, text.indexOf('})'))).toContain('...BATTLE_LINE')
  })
})

describe('옮긴 컴포넌트', () => {
  it('HudPlates가 판 그리기를 맡는다 — 게이지 임자가 한 훅이다', () => {
    const hud = code('HudPlates.tsx')
    for (const name of ['MonCard', 'PartyGauge', 'ExpLine']) expect(hud, name).toMatch(new RegExp(`function ${name}\\(`))
    expect(hud).toContain('css.cardFoe')
    expect(hud).toContain('css.cardMine')
    expect(hud).toContain('css.barFill')
    expect(hud).toContain('css.hpText')
    expect(hud).toContain('useDrain(ratio, drainMs')
  })

  it('BattleScreen에는 판 그리기 정의가 안 남았다', () => {
    const screen = code('BattleScreen.tsx')
    for (const name of ['MonCard', 'PartyGauge', 'ExpLine']) {
      expect(screen, name).not.toMatch(new RegExp(`function ${name}\\(`))
    }
    expect(screen).toContain("from './HudPlates'")
  })

  it('CommandArea가 명령 구역을 맡는다', () => {
    const area = code('CommandArea.tsx')
    for (const name of ['RootMenu', 'SafariMenu', 'YesNo', 'MoveMenu', 'MoveRows']) {
      expect(area, name).toMatch(new RegExp(`function ${name}\\(`))
    }
    const screen = code('BattleScreen.tsx')
    for (const name of ['RootMenu', 'SafariMenu', 'YesNo', 'MoveMenu', 'MoveRows']) {
      expect(screen, name).not.toMatch(new RegExp(`function ${name}\\(`))
    }
    expect(screen).toContain("from './CommandArea'")
  })

  it('글창의 클래스(log · logText · nextArrow)는 BattleScreen이 그대로 쓴다', () => {
    const screen = code('BattleScreen.tsx')
    expect(screen).toContain('css.log')
    expect(screen).toContain('css.logText')
    expect(screen).toContain('css.nextArrow')
  })
})

describe('빈 prop으로 미리 깐 배선', () => {
  it('MoveMenu가 겨눈 대상을 올릴 자리(onAim)가 있다', () => {
    expect(code('CommandArea.tsx')).toMatch(/onAim\??:\s*\(target: number \| null\) => void/)
    expect(code('BattleScreen.tsx')).toContain('onAim={setAimTarget}')
  })

  it('MonCard의 aimed는 표식(data-aimed)만 단다 — 판의 모양은 안 바뀐다', () => {
    const hud = code('HudPlates.tsx')
    expect(hud).toContain("data-aimed={aimed ? '' : undefined}")
  })

  it('SwitchScreen이 replacing을 받는다', () => {
    expect(code('SwitchScreen.tsx')).toMatch(/replacing\?: string \| null/)
    expect(code('BattleScreen.tsx')).toContain('replacing={asking?.key ?? null}')
  })
})

describe('기술 배우기 껍데기', () => {
  it('LearnMove가 useLearnFlow를 쓰고 새 기술과 단을 뿌리에 단다', () => {
    const learn = code('LearnMove.tsx')
    expect(learn).toContain("from '../common/learnFlow'")
    expect(learn).toContain('useLearnFlow(')
    expect(learn).toContain('{...flow.rootProps}')
    // 단 · 새 기술 속성은 learnFlow가 이름을 쥔다
    const flow = readFileSync(new URL('../common/learnFlow.ts', import.meta.url), 'utf8')
    expect(flow).toContain("'data-learn-stage': stage")
    expect(flow).toContain("'data-learn-new': input.move")
  })

  it('잊을 기술 칸이 data-move-id를 단다', () => {
    expect(code('LearnMove.tsx')).toContain('moveId={id}')
    expect(code('CommandButton.tsx')).toContain('data-move-id={moveId}')
  })

  it('다섯째 칸(새 기술)은 button이고 PP 꼴이 없다 — 하네스가 PP 꼴로 잊을 칸을 센다', () => {
    const learn = code('LearnMove.tsx')
    const tail = learn.slice(learn.indexOf('on={cursor === rows.length}'))
    expect(tail.slice(0, tail.indexOf('/>'))).not.toContain('css.pp')
  })
})
