// 앱 하나가 쓰는 휘발 칸 (PARITY §7.3)
//
// ⚠️ **칸이 하나뿐이다.** 원작 `PoketchMemory`가 버퍼 하나를 모든 앱이 돌려
// 쓰고, 되읽을 때 마지막에 쓴 앱인지를 본다 — 계산기에 숫자를 남기고
// 만보기에 갔다 오면 계산기가 0으로 돌아온다. 그 성질을 지키려고 앱마다
// `useState`를 두지 않고 이 고리 하나로 모은다.
import { useCallback } from 'react'
import { usePoketchStore } from '../../state/poketchStore'

export function usePoketchMemory<T>(app: number, initial: T): [T, (next: T) => void] {
  const write = usePoketchStore((s) => s.write)
  // 마지막에 쓴 앱이 내가 아니면 없는 것과 같다 — 그것이 원작의 `activeAppID`다
  const stored = usePoketchStore((s) => (s.memoryApp === app ? s.memory : null))
  const set = useCallback((next: T) => { write(app, next) }, [app, write])
  return [(stored ?? initial) as T, set]
}
