import { GoogleAuth } from 'google-auth-library'

// Title of the Google Doc tab to sync lessons from. Only content inside this
// tab is read; all other tabs are ignored.
const LESSON_TAB_TITLE = '수업 노트'

// The Docs API (needed to read tabs) requires OAuth2, not an API key. We
// authenticate as a service account; the target Doc must be shared with the
// service account's email (Viewer is enough).
async function getAccessToken(): Promise<string> {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY is not set')

  const auth = new GoogleAuth({
    credentials: JSON.parse(raw),
    scopes: ['https://www.googleapis.com/auth/documents.readonly'],
  })
  const client = await auth.getClient()
  const token = await client.getAccessToken()
  if (!token.token) throw new Error('Failed to obtain Google access token')
  return token.token
}

// --- Minimal subset of the Google Docs API v1 response shape we rely on ---
interface DocsTextRun {
  content?: string
}

interface DocsParagraphElement {
  textRun?: DocsTextRun
  horizontalRule?: object
  pageBreak?: object
}

interface DocsParagraph {
  elements?: DocsParagraphElement[]
}

interface DocsTableCell {
  content?: DocsStructuralElement[]
}

interface DocsTableRow {
  tableCells?: DocsTableCell[]
}

interface DocsTable {
  tableRows?: DocsTableRow[]
}

interface DocsStructuralElement {
  paragraph?: DocsParagraph
  table?: DocsTable
}

interface DocsBody {
  content?: DocsStructuralElement[]
}

interface DocsTab {
  tabProperties?: { title?: string }
  documentTab?: { body?: DocsBody }
  childTabs?: DocsTab[]
}

interface DocsDocument {
  tabs?: DocsTab[]
}

export async function fetchGoogleDoc(documentId: string): Promise<string[]> {
  const accessToken = await getAccessToken()

  // Use the Docs API v1 with includeTabsContent so the response exposes the
  // document's tab structure (the Drive export endpoint cannot see tabs).
  const res = await fetch(
    `https://docs.googleapis.com/v1/documents/${documentId}?includeTabsContent=true`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  )
  if (!res.ok) {
    const error = await res.text()
    throw new Error(`Failed to fetch Google Doc: ${error}`)
  }

  const doc = (await res.json()) as DocsDocument
  const tab = findTabByTitle(doc.tabs ?? [], LESSON_TAB_TITLE)
  if (!tab) {
    const titles = collectTabTitles(doc.tabs ?? [])
    throw new Error(
      `Tab "${LESSON_TAB_TITLE}" not found in document. Tabs present: ${
        titles.length ? titles.join(', ') : '(none)'
      }`
    )
  }

  const content = tab.documentTab?.body?.content ?? []
  return splitIntoLessons(content)
}

// Recursively search top-level tabs and their child tabs for a matching title.
function findTabByTitle(tabs: DocsTab[], title: string): DocsTab | undefined {
  for (const tab of tabs) {
    if (tab.tabProperties?.title?.trim() === title) return tab
    const child = findTabByTitle(tab.childTabs ?? [], title)
    if (child) return child
  }
  return undefined
}

function collectTabTitles(tabs: DocsTab[]): string[] {
  const titles: string[] = []
  for (const tab of tabs) {
    if (tab.tabProperties?.title) titles.push(tab.tabProperties.title)
    titles.push(...collectTabTitles(tab.childTabs ?? []))
  }
  return titles
}

// Walk the tab body and split into lesson strings. A paragraph containing a
// horizontal rule marks a lesson boundary (this replaces the old <hr> split).
function splitIntoLessons(content: DocsStructuralElement[]): string[] {
  const lessons: string[] = []
  let current = ''

  for (const element of content) {
    if (element.paragraph) {
      if (paragraphIsHorizontalRule(element.paragraph)) {
        lessons.push(current)
        current = ''
        continue
      }
      current += paragraphText(element.paragraph)
    } else if (element.table) {
      current += tableText(element.table)
    }
  }
  lessons.push(current)

  return lessons.map(normalize).filter((s) => s.length > 0)
}

function paragraphIsHorizontalRule(paragraph: DocsParagraph): boolean {
  return (paragraph.elements ?? []).some((el) => el.horizontalRule !== undefined)
}

function paragraphText(paragraph: DocsParagraph): string {
  let text = ''
  for (const el of paragraph.elements ?? []) {
    if (el.textRun?.content) text += el.textRun.content
  }
  // Docs paragraphs already end their content with a newline; ensure one so
  // paragraphs without trailing newlines don't run together.
  return text.endsWith('\n') ? text : text + '\n'
}

// Flatten a table to tab-separated cells / newline-separated rows, mirroring
// the table handling the previous HTML-based parser provided.
function tableText(table: DocsTable): string {
  let text = ''
  for (const row of table.tableRows ?? []) {
    const cells = (row.tableCells ?? []).map((cell) =>
      (cell.content ?? [])
        .map((el) => (el.paragraph ? paragraphText(el.paragraph).trim() : ''))
        .join(' ')
        .trim()
    )
    text += cells.join('\t') + '\n'
  }
  return text
}

function normalize(text: string): string {
  return text
    // Collapse 3+ blank lines into a single blank line
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
