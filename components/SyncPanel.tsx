'use client'

import { useState } from 'react'

interface Props {
  onSynced: () => void
}

// The app always syncs the same fixed Google Doc, so the id is a constant.
const DOC_ID = process.env.NEXT_PUBLIC_GOOGLE_DOC_ID ?? ''

export default function SyncPanel({ onSynced }: Props) {
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleSync = async () => {
    setLoading(true)
    setResult(null)
    setError(null)
    try {
      const res = await fetch('/api/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ documentId: DOC_ID }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)
      if (data.newLessons === 0) {
        setResult(data.message ?? 'No new content since last sync')
      } else {
        const remainingNote = data.remaining > 0 ? ` (${data.remaining} more remaining — tap Sync again)` : ''
        setResult(`Synced ${data.newLessons} lesson(s) — created ${data.newCards} new cards!${remainingNote}`)
        onSynced()
      }
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Unknown error'
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-md p-6">
      <h2 className="text-lg font-semibold text-gray-700 dark:text-gray-200 mb-1">Sync Google Doc</h2>
      <p className="text-sm text-gray-400 dark:text-gray-400 mb-4">Pull in any new lessons from your notes.</p>
      <button
        onClick={handleSync}
        disabled={loading || !DOC_ID}
        className="w-full min-h-11 bg-button text-button-foreground px-5 py-3 rounded-xl font-medium hover:bg-button-hover transition-colors disabled:opacity-50"
      >
        {loading ? 'Syncing…' : 'Sync now'}
      </button>
      {!DOC_ID && (
        <p className="mt-3 text-sm text-red-500">NEXT_PUBLIC_GOOGLE_DOC_ID is not configured.</p>
      )}
      {result && <p className="mt-3 text-sm text-green-600 dark:text-green-400">{result}</p>}
      {error && <p className="mt-3 text-sm text-red-500 dark:text-red-400">Error: {error}</p>}
    </div>
  )
}
