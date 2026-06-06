/**
 * WordPress WXR (WordPress eXtended RSS) streaming XML parser.
 * Uses SAX-based event parsing to handle large export files without
 * loading the entire DOM into memory.
 */

import { createReadStream } from 'node:fs'
import { access, constants } from 'node:fs/promises'
import * as sax from 'sax'

export interface WxrItem {
  title: string
  slug: string
  type: 'post' | 'page'
  content: string
  pubDate: string
  author: string
  categories: string[]
  tags: string[]
  status: 'publish' | 'draft' | 'private'
}

/**
 * Parse a WordPress WXR export file, yielding WxrItem objects as they're found.
 * Only yields items where type is 'post' or 'page'.
 *
 * @throws Error if the file is not a valid WXR format
 */
export async function* parseWxrFile(filePath: string): AsyncGenerator<WxrItem> {
  await access(filePath, constants.R_OK)

  const items = await parseWxrStream(filePath)

  for (const item of items) {
    yield item
  }
}

function parseWxrStream(filePath: string): Promise<WxrItem[]> {
  return new Promise((resolve, reject) => {
    const parser = sax.createStream(true, { trim: false })
    const items: WxrItem[] = []

    let foundRss = false
    let foundChannel = false
    let inItem = false
    let currentTag = ''
    let currentText = ''
    let categoryDomain = ''

    let currentItem: Partial<WxrItem> = {}
    let currentCategories: string[] = []
    let currentTags: string[] = []

    parser.on('opentag', (node) => {
      const name = node.name

      if (name === 'rss') {
        foundRss = true
      } else if (name === 'channel') {
        foundChannel = true
      } else if (name === 'item') {
        inItem = true
        currentItem = {}
        currentCategories = []
        currentTags = []
      }

      if (inItem) {
        currentTag = name
        currentText = ''

        if (name === 'category') {
          const domain = node.attributes['domain']
          categoryDomain = typeof domain === 'string' ? domain : ''
        }
      }
    })

    parser.on('text', (text) => {
      if (inItem) {
        currentText += text
      }
    })

    parser.on('cdata', (cdata) => {
      if (inItem) {
        currentText += cdata
      }
    })

    parser.on('closetag', (name) => {
      if (!inItem) return

      if (name === 'item') {
        inItem = false

        const itemType = currentItem.type
        if (itemType === 'post' || itemType === 'page') {
          items.push({
            title: currentItem.title ?? '',
            slug: currentItem.slug ?? '',
            type: itemType,
            content: currentItem.content ?? '',
            pubDate: currentItem.pubDate ?? '',
            author: currentItem.author ?? '',
            categories: currentCategories,
            tags: currentTags,
            status: normalizeStatus(currentItem.status),
          })
        }
        return
      }

      const text = currentText

      switch (name) {
        case 'title':
          currentItem.title = text
          break
        case 'wp:post_name':
          currentItem.slug = text
          break
        case 'wp:post_type':
          currentItem.type = text as WxrItem['type']
          break
        case 'content:encoded':
          currentItem.content = text
          break
        case 'wp:post_date':
          currentItem.pubDate = toIsoDate(text)
          break
        case 'dc:creator':
          currentItem.author = text
          break
        case 'wp:status':
          currentItem.status = text as WxrItem['status']
          break
        case 'category':
          if (categoryDomain === 'category') {
            currentCategories.push(text)
          } else if (categoryDomain === 'post_tag') {
            currentTags.push(text)
          }
          categoryDomain = ''
          break
      }

      currentTag = ''
      currentText = ''
    })

    parser.on('error', (err) => {
      reject(new Error(`XML parse error: ${err.message}`))
    })

    parser.on('end', () => {
      if (!foundRss || !foundChannel) {
        reject(new Error('Not a valid WordPress export (WXR) file'))
        return
      }
      resolve(items)
    })

    const stream = createReadStream(filePath, { encoding: 'utf-8' })

    stream.on('error', (err) => {
      reject(new Error(`Failed to read file: ${err.message}`))
    })

    stream.pipe(parser)
  })
}

function normalizeStatus(status: string | undefined): WxrItem['status'] {
  switch (status) {
    case 'publish':
      return 'publish'
    case 'draft':
      return 'draft'
    case 'private':
      return 'private'
    default:
      return 'draft'
  }
}

function toIsoDate(wpDate: string): string {
  if (!wpDate || wpDate.trim() === '') return ''

  // WordPress date format: "2023-01-15 10:30:00"
  const trimmed = wpDate.trim()

  // If already ISO format, return as-is
  if (trimmed.includes('T')) return trimmed

  // Convert "YYYY-MM-DD HH:MM:SS" → ISO format
  const isoString = trimmed.replace(' ', 'T') + 'Z'

  // Validate the date is parseable
  const date = new Date(isoString)
  if (isNaN(date.getTime())) return trimmed

  return date.toISOString()
}
