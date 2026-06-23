import { NextRequest, NextResponse } from 'next/server'
import { createHash } from 'crypto'
import { activeTtsProvider } from '@/lib/tts'

/**
 * GET /api/tts?text=…&voice=…
 *
 * Returns a stable audio URL for the given Korean text.
 * Each (provider, voice, text) triple is synthesized once and stored in Vercel Blob.
 * Subsequent requests return the cached Blob URL immediately (no re-synthesis).
 *
 * Requires BLOB_READ_WRITE_TOKEN in env (Vercel Blob storage).
 * Falls back gracefully when the token or Cloud TTS API are not yet configured —
 * returns a 503 so the client can fall back to browser speechSynthesis.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const text = searchParams.get('text')?.trim() ?? ''
  const voice = searchParams.get('voice')?.trim() || activeTtsProvider.defaultVoice

  if (!text) return NextResponse.json({ error: 'Missing text' }, { status: 400 })

  // Vercel Blob token check — avoid importing the module when it's not configured.
  const blobToken = process.env.KOREAN_BLOB_READ_WRITE_TOKEN ?? process.env.BLOB_READ_WRITE_TOKEN
  if (!blobToken) {
    return NextResponse.json(
      { error: 'Blob storage not configured (KOREAN_BLOB_READ_WRITE_TOKEN missing)' },
      { status: 503 }
    )
  }

  // Cache key: deterministic hash of (provider, voice, text)
  const cacheKey = createHash('sha256')
    .update(`${activeTtsProvider.id}:${voice}:${text}`)
    .digest('hex')
    .slice(0, 24)
  const blobPath = `tts/${cacheKey}.mp3`

  // Import @vercel/blob lazily so the module loads cleanly without the token.
  const { head, put } = await import('@vercel/blob')

  // Check cache
  try {
    const existing = await head(blobPath, { token: blobToken })
    return NextResponse.json({ url: existing.url, cached: true })
  } catch {
    // Not found — synthesize
  }

  // Synthesize
  try {
    const { audio, contentType } = await activeTtsProvider.synthesize(text, voice)
    const blob = await put(blobPath, audio, {
      access: 'public',
      contentType,
      token: blobToken,
      addRandomSuffix: false,
    })
    return NextResponse.json({ url: blob.url, cached: false })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'TTS synthesis failed' },
      { status: 503 }
    )
  }
}
