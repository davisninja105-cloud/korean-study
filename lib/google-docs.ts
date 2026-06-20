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

interface DocsTextStyle {
  bold?:            boolean
  underline?:       boolean
  // backgroundColor is an object when set; absent or null when not highlighted.
  backgroundColor?: { color?: { rgbColor?: object } } | null
}

interface DocsTextRun {
  content?:   string
  textStyle?: DocsTextStyle
}

interface DocsParagraphElement {
  textRun?:       DocsTextRun
  horizontalRule?: object
  pageBreak?:      object
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
  table?:     DocsTable
}

interface DocsBody {
  content?: DocsStructuralElement[]
}

interface DocsTab {
  tabProperties?: { title?: string }
  documentTab?:   { body?: DocsBody }
  childTabs?:     DocsTab[]
}

interface DocsDocument {
  tabs?: DocsTab[]
}

// --- Public return type ---

export interface LessonData {
  /** Plain text of the lesson (no formatting markers). */
  text: string
  /**
   * Deduped list of text spans the tutor explicitly bolded, underlined, or
   * highlighted — a high-confidence "this is being actively taught" signal.
   *
   * Note: run-level textStyle reflects emphasis applied inside body text.
   * Text that's bold only because it's in a Heading paragraph *style* may not
   * carry run-level bold — acceptable, since headings aren't vocab items.
   */
  emphasized: string[]
}

export async function fetchGoogleDoc(documentId: string): Promise<LessonData[]> {
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

// Returns true when a textStyle has any explicit emphasis.
function isEmphasized(style?: DocsTextStyle): boolean {
  if (!style) return false
  if (style.bold === true) return true
  if (style.underline === true) return true
  // backgroundColor is present and has a nested color object when a highlight
  // colour is set; it's absent or null when there is no highlight.
  if (style.backgroundColor?.color?.rgbColor) return true
  return false
}

// Walk the tab body and split into lesson objects. A paragraph containing a
// horizontal rule marks a lesson boundary (same as before, now returns LessonData).
function splitIntoLessons(content: DocsStructuralElement[]): LessonData[] {
  const lessons: LessonData[] = []
  let currentText = ''
  // Collect emphasized spans into a Set to dedup automatically.
  let currentEmphasized = new Set<string>()

  function flushLesson() {
    lessons.push({
      text: normalize(currentText),
      emphasized: [...currentEmphasized]
        .map((s) => s.normalize('NFC').trim())
        .filter((s) => s.length > 0),
    })
    currentText = ''
    currentEmphasized = new Set()
  }

  for (const element of content) {
    if (element.paragraph) {
      if (paragraphIsHorizontalRule(element.paragraph)) {
        flushLesson()
        continue
      }
      const { text, emphasized } = paragraphData(element.paragraph)
      currentText += text
      for (const e of emphasized) currentEmphasized.add(e)
    } else if (element.table) {
      // Tables: plain text only (emphasis inside tables is unusual, skip).
      currentText += tableText(element.table)
    }
  }
  flushLesson()

  return lessons.filter((l) => l.text.length > 0)
}

function paragraphIsHorizontalRule(paragraph: DocsParagraph): boolean {
  return (paragraph.elements ?? []).some((el) => el.horizontalRule !== undefined)
}

// Returns plain body text AND the set of emphasized spans from this paragraph.
// Adjacent emphasized runs are merged before being added to the set.
function paragraphData(paragraph: DocsParagraph): { text: string; emphasized: string[] } {
  let text = ''
  const emphasized: string[] = []
  let emphBuffer = ''   // accumulates adjacent emphasized runs

  for (const el of paragraph.elements ?? []) {
    const run = el.textRun
    if (!run?.content) continue

    const content = run.content
    text += content

    if (isEmphasized(run.textStyle)) {
      emphBuffer += content
    } else {
      if (emphBuffer) {
        // Flush buffered emphasized run — strip trailing newlines (paragraph ends).
        const span = emphBuffer.replace(/\n/g, '').trim()
        if (span) emphasized.push(span)
        emphBuffer = ''
      }
    }
  }
  // Flush any trailing emphasized content.
  if (emphBuffer) {
    const span = emphBuffer.replace(/\n/g, '').trim()
    if (span) emphasized.push(span)
  }

  // Docs paragraphs already end their content with a newline; ensure one so
  // paragraphs without trailing newlines don't run together.
  return {
    text: text.endsWith('\n') ? text : text + '\n',
    emphasized,
  }
}

// Flatten a table to tab-separated cells / newline-separated rows.
function tableText(table: DocsTable): string {
  let text = ''
  for (const row of table.tableRows ?? []) {
    const cells = (row.tableCells ?? []).map((cell) =>
      (cell.content ?? [])
        .map((el) => (el.paragraph ? paragraphData(el.paragraph).text.trim() : ''))
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
