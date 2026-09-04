// 버그 제보 — 타이틀 차림표가 여는 창 하나.
//
// ⚠️ **이 게임에서 바깥으로 나가는 유일한 자리다.** CSP `connect-src`의 바깥
// 오리진 하나가 여기 때문에 있다 (`tools/distribution/csp.mjs`). 그 하나를
// 열면서 약속의 등급이 **구조적**에서 **정책적**으로 내려갔으므로, 그 정책을
// 지키는 것이 이 파일의 일이다:
//
//   · 사람이 치고 사람이 누를 때만 나간다. 저 혼자 부르는 자리가 없다
//   · **OPFS를 안 읽는다.** 롬 바이트도 변환 결과도 리포트도 여기 안 담긴다
//   · 담기는 것은 사람이 친 제목·내용과 판·창 크기·브라우저 종류가 전부다
//   · 무엇이 담기는지를 **누르기 전에** 같은 화면에서 말한다
//
// 무엇이 나가고 무엇이 안 나가는지는 COPYRIGHT.md §11의 표가 정본이다.
// **여기를 고치면 그 표도 같이 고친다.**
//
// ⚠️ **라이브러리를 안 쓴다.** `@emailjs/browser`는 이 `fetch` 한 번을 감싼
// 것뿐인데 묶음이 늘고, 무엇보다 **무엇을 보내는지 이 파일만 봐서는 알 수 없게
// 된다.** 나가는 자리가 하나뿐인 앱에서 그것은 값이 크다.
//
// ⚠️ **아이기스·포케리듬과 같은 서식을 쓴다.** 받는 함이 하나라 제목에 게임
// 이름을 박는다 — 안 그러면 셋의 제보가 섞인다.
import { useEffect, useRef, useState } from 'react'
import { useMenuKeys } from '../menu/useMenuKeys'
import { VERSION } from './patchLog'
import * as css from './bugReport.css'

const API = 'https://api.emailjs.com/api/v1.0/email/send'
const SERVICE = 'service_ymdrp77'
const TEMPLATE = 'template_0gc815a'
/** EmailJS가 코드에 박으라고 준 열쇠다. 이것으로 되는 일은 이 서식으로 보내는 것뿐 */
const PUBLIC_KEY = 'gjdzeRNJdHhXF2hZu'
const TO = 'getosukuri@gmail.com'

const MAX_TITLE = 60
const MAX_BODY = 2000

type Phase = 'idle' | 'sending' | 'done' | 'fail'

/**
 * 사람이 안 적어 주는 것들.
 *
 * ⚠️ **여기에 롬에서 온 것을 넣지 않는다.** 지역판·설치 해시·리포트는 손만 뻗으면
 * 닿지만, 그것이 곧 COPYRIGHT.md가 「안 나간다」고 적은 그것이다
 */
function machine(): string {
  return [
    `판 ${VERSION}`,
    `창 ${window.innerWidth}×${window.innerHeight}`,
    navigator.userAgent,
  ].join('\n')
}

interface Props { onClose: () => void }

export function BugReport({ onClose }: Props) {
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [phase, setPhase] = useState<Phase>('idle')
  const first = useRef<HTMLInputElement | null>(null)

  useEffect(() => { first.current?.focus() }, [])

  // ⚠️ **보내는 중에는 안 닫는다.** 답을 못 받은 채 창이 사라지면 갔는지 모르니
  // 같은 제보를 두 번 쓰게 된다. `useMenuKeys`는 글자 칸으로 간 키를 이미
  // 비켜 주므로(`typingInto`), 치는 중에 X가 창을 닫지는 않는다
  useMenuKeys({ cancel: onClose }, phase !== 'sending')

  const ready = title.trim() !== '' && body.trim() !== '' && phase !== 'sending'

  async function send(e: React.FormEvent): Promise<void> {
    e.preventDefault()
    if (!ready) return
    setPhase('sending')
    try {
      const res = await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          service_id: SERVICE,
          template_id: TEMPLATE,
          user_id: PUBLIC_KEY,
          template_params: {
            name: 'Radiant Platinum 플레이어',
            title: `[레디언트] ${title.trim().slice(0, MAX_TITLE)}`,
            message: `${body.trim().slice(0, MAX_BODY)}\n\n────────\n${machine()}`,
            to_email: TO,
          },
        }),
      })
      if (!res.ok) throw new Error(`${String(res.status)}`)
      setPhase('done')
    } catch (err) {
      console.warn('제보를 못 보냈습니다', err)
      setPhase('fail')
    }
  }

  return (
    <div
      className={css.over}
      onClick={(e) => { if (e.target === e.currentTarget && phase !== 'sending') onClose() }}
    >
      <div className={css.panel}>
        <h2 className={css.title}>버그 제보</h2>

        {phase === 'done' ? (
          <>
            <p className={css.done}>보냈습니다. 읽고 고치겠습니다.</p>
            <p className={css.intro}>
              같은 것이 또 보이면 한 번 더 적어 주세요 — 어디서 무엇을 하다가 났는지가
              적혀 있으면 훨씬 빨리 찾습니다.
            </p>
            <div className={css.foot}>
              <span className={css.hint} />
              <button className={css.close} onClick={onClose}>돌아가기</button>
            </div>
          </>
        ) : (
          <form className={css.form} onSubmit={(e) => { void send(e) }}>
            <p className={css.intro}>만든 사람에게 곧장 갑니다. 계정도 로그인도 없습니다.</p>

            <label className={css.row}>
              <span className={css.label}>무엇이</span>
              <input
                ref={first}
                className={css.input}
                type="text"
                value={title}
                maxLength={MAX_TITLE}
                placeholder="한 줄로 — 「연고시티에서 못 나감」처럼"
                onChange={(e) => { setTitle(e.target.value) }}
              />
            </label>

            <label className={css.row}>
              <span className={css.label}>어떻게</span>
              <textarea
                className={css.textarea}
                value={body}
                maxLength={MAX_BODY}
                placeholder={'어디서 무엇을 하다가 났는지 적어 주시면 가장 빠릅니다.'}
                onChange={(e) => { setBody(e.target.value) }}
              />
            </label>

            {/* ⚠️ 접지 않는다 — 첫 화면이 「서버로 안 간다」를 약속한 게임이다 */}
            <p className={css.what}>
              적으신 글과 <b>게임 판 · 창 크기 · 브라우저 종류</b>가 함께 갑니다.
              <br />
              롬에서 나온 것은 하나도 안 갑니다 — 설치본도, 리포트도, 파일 이름도입니다.
            </p>

            {phase === 'fail' && (
              <p className={css.fail}>
                못 보냈습니다. 잠시 뒤에 다시 눌러 보세요. 인터넷이 끊겨 있어도 게임은
                그대로 됩니다.
              </p>
            )}

            <div className={css.foot}>
              <span className={css.hint}>X·Esc 닫기</span>
              <button
                type="button"
                className={css.close}
                onClick={onClose}
                disabled={phase === 'sending'}
              >
                그만두기
              </button>
              <button type="submit" className={css.send} disabled={!ready}>
                {phase === 'sending' ? '보내는 중…' : '보내기'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}
