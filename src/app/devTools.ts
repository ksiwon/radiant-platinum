// 배포본에서도 **개발 손잡이를 켤 수 있게** 한다 — `?dev=1`.
//
//     https://…/?dev=1     켠다 (다음부터는 주소에 안 붙여도 켜져 있다)
//     https://…/?dev=0     끈다
//
// 켜지면 셋이 붙는다: 백틱(`) 확인 지점 표 · 왼쪽 위 계기판 · `window.pt`.
// 켜졌는지는 **계기판이 보이는 것으로** 안다 — 조용히 켜지는 손잡이를 두지 않는다.
//
// ⚠️ **왜 필요한가.** 굽힌 것과 개발 서버는 같은 화면을 안 낸다. 실측으로
// 같은 떡잎마을이 `--mode development` 번들에서는 콘솔 2,440줄·배틀타워 최저
// 48fps였는데, 프로덕션으로 구우면 2줄·60fps다. 그러니 「사람이 받는 것」을
// 보려면 배포본에서 봐야 하는데, 확인 지점 표가 `import.meta.env.DEV` 안에
// 있어서 배포본에서는 백틱이 아무 일도 안 했다 (실측: 롬·에셋을 다 설치해
// 타이틀까지 간 배포 사이트에서 눌러도 `[data-checkpoint]`가 0줄).
//
// ⚠️ **에셋 갈래는 절대 안 건드린다.** 이 손잡이는 화면에 개발 UI를 붙일 뿐,
// 무엇을 읽고 어디서 뜰지(`app/boot.ts`의 `decide`)에는 손대지 않는다. 그 갈래를
// 밖에서 못 바꾸는 것이 배포의 경계이고 e2e ㉓이 그것을 잰다 — `?assets=opfs`가
// 배포본에서 안 먹는 것은 그대로다.
//
// ⚠️ **한 번 읽고 굳힌다.** 렌더마다 `localStorage`를 읽으면 그 값이 프레임
// 중간에 바뀔 수 있고, 계기판과 백틱이 서로 다른 답을 볼 수 있다.

/** 켠 것을 기억하는 자리. 새로 고쳐도 켜져 있어야 한다 */
const KEY = 'rp.devTools'

let decided: boolean | null = null

/**
 * 개발 손잡이가 켜져 있는가. 개발 서버에서는 늘 참이다.
 *
 * @param dev `import.meta.env.DEV`. **시험이 양쪽을 다 돌릴 수 있어야 한다** —
 * vitest 안에서는 그 값이 늘 참이라, 인자로 못 받으면 「그냥 열면 꺼져 있다」를
 * 영영 못 잰다 (`boot.ts`의 `BootEnv.dev`와 같은 자리다)
 */
export function devToolsOn(dev: boolean = import.meta.env.DEV): boolean {
  decided ??= dev || readFlag()
  return decided
}

function readFlag(): boolean {
  if (typeof location === 'undefined') return false
  const asked = new URLSearchParams(location.search).get('dev')
  try {
    if (asked === '1') {
      localStorage.setItem(KEY, '1')
      return true
    }
    if (asked === '0') {
      localStorage.removeItem(KEY)
      return false
    }
    return localStorage.getItem(KEY) === '1'
  } catch {
    // 저장소가 막힌 브라우저에서도 그 판만큼은 켜진다
    return asked === '1'
  }
}
