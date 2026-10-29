import { describe, expect, it } from 'vitest'

import Markdown from '@/app/_components/ui/markdown'

import { renderPage, text } from '../support/fixtures'

const show = async (source: string) =>
  (await renderPage(<Markdown>{source}</Markdown>)).doc.body

describe('Markdown in invitation messages', () => {
  it('renders emphasis, paragraphs, lists and links', async () => {
    const body = await show(
      'Hello **world** and *friends*\n\nSecond paragraph\n\n- one\n- two\n\n1. first\n2. second\n\n[site](https://example.com)'
    )
    expect(text(body.querySelector('strong'))).toBe('world')
    expect(text(body.querySelector('em'))).toBe('friends')
    expect(body.querySelectorAll('p')).toHaveLength(3)
    expect([...body.querySelectorAll('ul li')].map((li) => text(li))).toEqual([
      'one',
      'two',
    ])
    expect(body.querySelectorAll('ol li')).toHaveLength(2)
    const link = body.querySelector('a')!
    expect(link.getAttribute('href')).toBe('https://example.com')
    expect(link.getAttribute('rel')).toBe('noopener noreferrer nofollow')
    expect(link.getAttribute('target')).toBe('_blank')
  })

  it('renders headings (kept below the page title), quotes and code', async () => {
    const body = await show(
      '# Big\n\n### Small\n\n> quoted\n\n`inline`\n\n```\nblock\n```'
    )
    expect(body.querySelector('h1')).toBeNull()
    expect(text(body.querySelector('h2'))).toBe('Big')
    expect(text(body.querySelector('h3'))).toBe('Small')
    expect(text(body.querySelector('blockquote'))).toBe('quoted')
    expect(text(body.querySelector('p code'))).toBe('inline')
    expect(text(body.querySelector('pre'))).toBe('block')
  })

  it('shows raw HTML as text instead of rendering it', async () => {
    const body = await show(
      '<script>alert(1)</script> <b onclick="x()">bold</b>'
    )
    expect(body.querySelector('script')).toBeNull()
    expect(body.querySelector('b')).toBeNull()
    expect(text(body)).toContain('<script>alert(1)</script>')
  })

  it('does not link javascript: addresses', async () => {
    const body = await show('[click](javascript:alert(1))')
    expect(body.querySelector('a')!.getAttribute('href') ?? '').not.toMatch(
      /javascript/i
    )
  })

  it('leaves images out, so a message cannot make the viewer fetch from elsewhere', async () => {
    const body = await show(
      'before ![tracker](https://evil.example/pixel.png) after'
    )
    expect(body.querySelector('img')).toBeNull()
  })

  it('shows plain text as it was written', async () => {
    expect(text(await show('Just a note.'))).toBe('Just a note.')
  })

  it('links web addresses written without Markdown syntax', async () => {
    const body = await show(
      'Details at https://example.com/rsvp?x=1, or www.example.org.'
    )
    const links = [...body.querySelectorAll('a')]
    expect(links.map((a) => a.getAttribute('href'))).toEqual([
      'https://example.com/rsvp?x=1',
      'http://www.example.org',
    ])
    expect(
      links.every(
        (a) => a.getAttribute('rel') === 'noopener noreferrer nofollow'
      )
    ).toBe(true)
    // trailing punctuation is not part of the address
    expect(text(body)).toContain('x=1, or')
  })

  it('does not link something that only looks like a dangerous address', async () => {
    const body = await show('javascript:alert(1) and data:text/html,hi')
    expect(body.querySelector('a')).toBeNull()
  })

  it('keeps single line breaks', async () => {
    const body = await show('line one\nline two')
    expect(body.querySelectorAll('p')).toHaveLength(1)
    expect(body.querySelectorAll('br')).toHaveLength(1)
  })
})
