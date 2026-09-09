// Liveness check for the trend feeds. Feeds rot silently — run this when
// /trends stops filling up:  node scripts/check-sources.mjs
const UA = { 'user-agent': 'postwise/1.0' }
const BROWSER = { 'user-agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/125 Safari/537.36' }
const get = (u, h = UA) => fetch(u, { headers: h })
const countItems = xml => (xml.match(/<(item|entry)[\s>][\s\S]*?<\/\1>/g) ?? []).length

const SOURCES = {
  hackernews: async () => (await (await get('https://hn.algolia.com/api/v1/search_by_date?tags=story&numericFilters=points%3E40&hitsPerPage=40')).json()).hits.length,
  devto: async () => (await (await get('https://dev.to/api/articles?tag=webdev&top=2&per_page=10')).json()).length,
  lobsters: async () => (await (await get('https://lobste.rs/t/javascript,web.json')).json()).length,
  reddit: async () => countItems(await (await get('https://www.reddit.com/r/webdev/.rss', BROWSER)).text()),
  'web.dev': async () => countItems(await (await get('https://web.dev/static/blog/feed.xml')).text()),
  vercel: async () => countItems(await (await get('https://vercel.com/atom')).text()),
  comeau: async () => countItems(await (await get('https://www.joshwcomeau.com/rss.xml')).text()),
  kentcdodds: async () => countItems(await (await get('https://kentcdodds.com/blog/rss.xml')).text()),
  smashing: async () => countItems(await (await get('https://www.smashingmagazine.com/feed/')).text()),
  csstricks: async () => countItems(await (await get('https://css-tricks.com/feed/')).text()),
}

let failed = 0
for (const [name, fn] of Object.entries(SOURCES)) {
  try {
    const n = await fn()
    if (!n) throw new Error('0 items')
    console.log(`  ok    ${name.padEnd(12)} ${n}`)
  } catch (e) {
    failed++
    console.log(`  FAIL  ${name.padEnd(12)} ${e.message}`)
  }
}
// One dead feed is survivable (allSettled absorbs it); half of them is not.
process.exit(failed > Object.keys(SOURCES).length / 2 ? 1 : 0)
