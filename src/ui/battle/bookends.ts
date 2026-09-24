// 판의 첫 줄과 끝 줄 (PARITY §2.24 · §2.2b).
//
// 사건이 아니라 **판 자체의 사실**이라 사건 줄기(`messages.battleText`) 밖에서
// 만든다 — 누가 걸어왔는지, 이긴 뒤 상대가 무슨 말을 하는지, 상금이 얼마인지.
// 트레이너가 둘인 판은 원작이 두 사람을 **한 창에** 담는 줄을 따로 들고 있다
// (`battle_display.c` 6010 `LoadBattleStartMessage` · `subscript_battle_won.s` _087).
import { romLine } from './romLine'
import { MSG } from './romText'

/** 한 트레이너의 이름 두 칸 (`battleStore`의 `TrainerTag`) */
interface Named { cls: string | null; name: string | null }

interface Bookends {
  /** 롬의 배틀 글 뱅크 (`battle_strings`) */
  lines: readonly string[]
  kind: 'wild' | 'trainer' | 'factory' | 'safari'
  outcome: 'win' | 'loss' | 'caught' | 'fled' | 'foeFled' | null
  /** 상대 트레이너. 둘이면 태그 배틀이다 */
  foes: readonly Named[]
  /** 분류가 없는 상대(배틀팩토리)의 한 칸짜리 이름 */
  foeName: string | null
  foeClass: string | null
  foeTrainer: string | null
  /** 상대마다의 끝말 (`battleStore`의 `defeatLines`) */
  defeatLines: readonly string[]
  prize: number
  playerName: string | null
}

/**
 * 트레이너전의 첫 줄 — 누가 걸어왔는가. 야생이면 null.
 *
 * 롬은 분류·이름을 두 칸으로 받는 줄과 이름 한 칸짜리 줄을 따로 들고 있고,
 * 트레이너가 둘이면 두 사람을 한 줄에 담는다 (`YouAreChallengedByTr1AndTr2`)
 */
export function openingLine(b: Bookends): string | null {
  if (b.kind !== 'trainer') return null
  const [one, two] = b.foes
  if (one !== undefined && two !== undefined) {
    return romLine(b.lines, MSG.youAreChallengedByTr1AndTr2, one.cls, one.name, two.cls, two.name)
  }
  return romLine(b.lines, MSG.youAreChallengedByTr, b.foeClass, b.foeTrainer)
    ?? romLine(b.lines, MSG.youAreChallengedByLinkTr, b.foeName)
}

/**
 * 판이 끝나고 나오는 줄들. **하나가 아니라 여럿이다.**
 *
 * 이긴 트레이너전은 「이겼다!」 → **상대마다의 끝말**(`TRMSG_DEFEAT`) → 상금 차례다
 * (`subscript_battle_won.s`). 트레이너 둘이면 「{둘}의 승부에서 이겼다!」 한 줄에
 * 둘의 끝말이 차례로 붙는다(_087). 상금은 사건 자리가 아니라 여기서 찍는다 —
 * 사건 자리에 두면 「이겼다!」보다 먼저 뜬다.
 *
 * 진 판은 원작이 창 셋을 잇는다 (`subscript_battle_lost.s`) — 「싸울 수 있는
 * 포켓몬이 없다!」 → 「... ... ... ...」 → 「눈앞이 캄캄해졌다!」.
 * ⚠️ 사이의 상금 줄(34·35)은 아직 못 놓는다 — 진 판에 돈이 깎이는 일 자체가 없다.
 *
 * 포획·도망은 이미 그 순간의 사건이 말했다. 여기서 또 말하지 않는다
 */
export function closingLines(b: Bookends): string[] {
  const out: (string | null)[] = []
  if (b.outcome === 'win') {
    if (b.kind === 'trainer') {
      const [one, two] = b.foes
      out.push(one !== undefined && two !== undefined
        ? romLine(b.lines, MSG.playerBeatTr1AndTr2, one.cls, one.name, two.cls, two.name)
        : romLine(b.lines, MSG.playerDefeatedTr, b.foeClass, b.foeTrainer)
          ?? romLine(b.lines, MSG.playerDefeatedLinkTr, b.foeName))
      out.push(...b.defeatLines)
      if (b.prize > 0) {
        out.push(romLine(b.lines, MSG.playerGotMoneyForWinning, b.playerName, String(b.prize)))
      }
    } else {
      // ⚠️ **야생전은 원작이 아무 말도 안 한다.** 이긴 순간이 곧 배틀의 끝이라
      // 줄이 없다(`subscript_battle_won.s`의 야생 갈래가 곧장 페이드로 간다) —
      // 우리 화면은 로그가 그대로 서 있으므로 한 줄을 놓는다
      out.push('배틀에서 이겼다!')
    }
  } else if (b.outcome === 'loss') {
    out.push(
      romLine(b.lines, MSG.playerIsOutOfUsablePokemon, b.playerName),
      romLine(b.lines, MSG.blackedOutDotDotDot),
      romLine(b.lines, MSG.playerBlackedOut, b.playerName),
    )
  }
  return out.filter((x): x is string => x !== null)
}
