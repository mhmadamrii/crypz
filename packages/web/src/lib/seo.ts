// One place for page metadata: title, description, canonical URL and the link-preview (Open Graph / X) tags.

export const SITE_URL = (import.meta.env.VITE_SITE_URL ?? 'https://crypz.space').replace(/\/$/, '')
export const SITE_NAME = 'crypz'
const OG_IMAGE = { url: `${SITE_URL}/opengraph-image.png`, width: 1200, height: 630 }
const OG_ALT = 'A crypto candle chart marked with a fib retracement and a trend line, drawn in crypz'

type Seo = {
  title: string
  description: string
  /** Path for the canonical URL, e.g. "/tools/position-size". */
  path: string
  /** Keep the page out of search results (app pages, login). */
  noindex?: boolean
}

export function seo({ title, description, path, noindex }: Seo) {
  const url = `${SITE_URL}${path}`
  return {
    meta: [
      { title },
      { name: 'description', content: description },
      ...(noindex ? [{ name: 'robots', content: 'noindex, nofollow' }] : []),
      { property: 'og:type', content: 'website' },
      { property: 'og:site_name', content: SITE_NAME },
      { property: 'og:url', content: url },
      { property: 'og:title', content: title },
      { property: 'og:description', content: description },
      { property: 'og:image', content: OG_IMAGE.url },
      { property: 'og:image:width', content: String(OG_IMAGE.width) },
      { property: 'og:image:height', content: String(OG_IMAGE.height) },
      { property: 'og:image:alt', content: OG_ALT },
      { name: 'twitter:card', content: 'summary_large_image' },
      { name: 'twitter:title', content: title },
      { name: 'twitter:description', content: description },
      { name: 'twitter:image', content: OG_IMAGE.url },
      { name: 'twitter:image:alt', content: OG_ALT },
    ],
    links: [{ rel: 'canonical', href: url }],
  }
}
