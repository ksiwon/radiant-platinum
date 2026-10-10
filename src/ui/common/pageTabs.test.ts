// 탭 잠금 — 잠긴 탭은 눌러도 안 불리고 흐리다
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import { PageTabs } from './PageTabs'

describe('PageTabs disabled', () => {
  const html = renderToStaticMarkup(createElement(PageTabs, {
    pages: [{ key: 'a', label: '가', disabled: true }, { key: 'b', label: '나' }], at: 1,
  }))

  it('잠긴 탭만 disabled다', () => {
    expect(html.match(/<button[^>]*>/g)?.map((b) => b.includes('disabled=""'))).toEqual([true, false])
  })
})
