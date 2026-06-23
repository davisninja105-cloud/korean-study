/**
 * TTS provider abstraction.
 *
 * The active provider is chosen by the TTS_PROVIDER env var (default: 'google').
 * Adding a new provider: implement the interface and add it to the `providers` map.
 * Call sites only ever touch `activeTtsProvider` — they never import a specific provider.
 *
 * Google Cloud TTS setup (required before cloud synthesis works):
 *   1. Enable the Cloud Text-to-Speech API on the Google Cloud project that owns
 *      the GOOGLE_SERVICE_ACCOUNT_KEY service account.
 *   2. No new credentials needed — the same GOOGLE_SERVICE_ACCOUNT_KEY already used
 *      by lib/google-docs.ts is reused here with the cloud-platform scope.
 *   3. Provision a Vercel Blob store and set BLOB_READ_WRITE_TOKEN in .env.local +
 *      Vercel env. Install `@vercel/blob`: npm i @vercel/blob.
 */

import { GoogleAuth } from 'google-auth-library'

// ── Provider interface ─────────────────────────────────────────────────────

export interface TtsProvider {
  id: string
  defaultVoice: string
  synthesize(
    text: string,
    voice?: string
  ): Promise<{ audio: Buffer; contentType: string }>
}

// ── Google Cloud Text-to-Speech (Neural2) ─────────────────────────────────

const googleNeural2Provider: TtsProvider = {
  id: 'google-neural2',
  defaultVoice: 'ko-KR-Neural2-A',

  async synthesize(text: string, voice = 'ko-KR-Neural2-A') {
    const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY
    if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY is not set')

    // Reuse the GoogleAuth pattern from lib/google-docs.ts, with TTS scope.
    const auth = new GoogleAuth({
      credentials: JSON.parse(raw),
      scopes: ['https://www.googleapis.com/auth/cloud-platform'],
    })
    const client = await auth.getClient()
    const token = await client.getAccessToken()
    if (!token.token) throw new Error('Failed to obtain Google access token for TTS')

    const res = await fetch(
      'https://texttospeech.googleapis.com/v1/text:synthesize',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token.token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          input: { text },
          voice: { languageCode: 'ko-KR', name: voice },
          audioConfig: { audioEncoding: 'MP3' },
        }),
      }
    )

    if (!res.ok) {
      const error = await res.text()
      throw new Error(`Google TTS error: ${error}`)
    }

    const data = (await res.json()) as { audioContent?: string }
    if (!data.audioContent) throw new Error('No audioContent in Google TTS response')

    return {
      audio: Buffer.from(data.audioContent, 'base64'),
      contentType: 'audio/mpeg',
    }
  },
}

// ── ElevenLabs (eleven_multilingual_v2) ───────────────────────────────────

const elevenLabsProvider: TtsProvider = {
  id: 'elevenlabs',
  // Default voice ID from the ElevenLabs voice library.
  // Browse https://elevenlabs.io/voice-library, pick one that sounds good for
  // Korean, and paste its ID here (or override per-call via the voice param).
  // 'pNInz6obpgDQGcFmaJgB' is "Adam" — a clear multilingual voice.
  defaultVoice: 'pNInz6obpgDQGcFmaJgB',

  async synthesize(text: string, voice = 'pNInz6obpgDQGcFmaJgB') {
    const apiKey = process.env.ELEVENLABS_API_KEY
    if (!apiKey) throw new Error('ELEVENLABS_API_KEY is not set')

    const res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voice}`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': apiKey,
          'Content-Type': 'application/json',
          Accept: 'audio/mpeg',
        },
        body: JSON.stringify({
          text,
          model_id: 'eleven_multilingual_v2',
          voice_settings: { stability: 0.5, similarity_boost: 0.75 },
        }),
      }
    )

    if (!res.ok) {
      const error = await res.text()
      throw new Error(`ElevenLabs TTS error ${res.status}: ${error}`)
    }

    return {
      audio: Buffer.from(await res.arrayBuffer()),
      contentType: 'audio/mpeg',
    }
  },
}

// ── Provider registry ──────────────────────────────────────────────────────

const providers: Record<string, TtsProvider> = {
  google: googleNeural2Provider,
  elevenlabs: elevenLabsProvider,
}

/** The active provider. Swap via TTS_PROVIDER env (default: 'google'). */
export const activeTtsProvider: TtsProvider =
  providers[process.env.TTS_PROVIDER ?? 'google'] ?? googleNeural2Provider
