// 배틀 글을 한 줄씩 (DATA.md §2.11)
//
// 전에는 사건이 생기는 대로 여섯 줄짜리 기록장에 쌓았다. 정보는 다 있지만
// **원작의 박자**가 아니다 — 원작은 한 문장을 다 찍고 A를 기다린 다음 지운다.
// 그 사이가 있어야 "누가 무엇을 했는지"가 읽힌다.
//
// 필드 대사창이 쓰는 인쇄기를 그대로 쓴다. 글자 속도·A로 빨리 감기가 이미
// 원작대로 맞춰져 있으므로 배틀에서 따로 만들 이유가 없다.
import { useEffect, useRef, useState } from 'react'
import { MessagePrinter, printedText, TEXT_SPEED } from '../../engine/script/printer'
import { MessageSlots } from '../../engine/script/text'

/** 배틀 글은 창을 안 지우고 이어 찍는다. 한 줄이 끝나면 다음 줄로 갈아탄다 */
const OPTIONS = { speed: TEXT_SPEED.normal, canSkip: true, autoScroll: false }

export interface BattleText {
  /** 지금 찍힌 만큼 */
  text: string
  /** 다 찍었는가. 메뉴는 이때만 뜬다 */
  done: boolean
  /** 아직 안 읽은 줄이 남았는가 */
  pending: boolean
  /** A. 찍는 중이면 빨리 감고, 다 찍었으면 다음 줄로 */
  advance: () => void
}

/**
 * 줄 목록을 한 줄씩 흘린다.
 *
 * `lines`는 배틀이 시작된 뒤로 **쌓이기만** 하는 목록이다. 그래서 커서를
 * 인덱스 하나로 들고 있으면 되고, 새 줄이 붙어도 읽던 자리를 안 잃는다
 */
export function useBattleText(lines: readonly string[]): BattleText {
  const [at, setAt] = useState(0)
  const [text, setText] = useState('')
  const [done, setDone] = useState(true)
  const printer = useRef<MessagePrinter | null>(null)
  const slots = useRef(new MessageSlots())

  // 줄이 바뀌면 인쇄기를 새로 만든다
  const line = lines[at] ?? null
  useEffect(() => {
    if (line === null) { printer.current = null; setText(''); setDone(true); return }
    printer.current = new MessagePrinter(line, slots.current, OPTIONS)
    setText('')
    setDone(false)
  }, [line])

  // 프레임마다 한 자씩. 글이 실제로 늘어난 프레임에만 setState 한다
  useEffect(() => {
    let raf = 0
    let last = ''
    const poll = (): void => {
      raf = requestAnimationFrame(poll)
      const p = printer.current
      if (p === null) return
      // 인쇄기는 버튼을 스스로 묻는다. 여기서는 안 눌린 것으로 굴리고
      // 빨리 감기는 `advance`가 직접 시킨다 — rAF와 키 입력의 박자가 다르다
      p.tick({ pressed: false, held: false })
      const now = printedText(p)
      if (now !== last) { last = now; setText(now) }
      if (p.finished && !done) setDone(true)
    }
    raf = requestAnimationFrame(poll)
    return () => { cancelAnimationFrame(raf) }
  }, [done])

  const advance = (): void => {
    const p = printer.current
    if (p !== null && !p.finished) {
      // 찍는 중이면 먼저 다 채운다. 원작도 A 한 번은 "빨리"고 두 번째가 "다음"이다
      p.finish()
      setText(printedText(p))
      setDone(true)
      return
    }
    if (at < lines.length - 1) setAt(at + 1)
  }

  return { text, done, pending: at < lines.length - 1, advance }
}
