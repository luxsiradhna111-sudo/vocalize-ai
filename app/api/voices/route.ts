import { NextResponse } from 'next/server'
import { listVoices } from '@/lib/edge-tts'

export const runtime = 'nodejs'
// Cache the voice catalog at the route level for a day.
export const revalidate = 86400

export async function GET() {
  try {
    const voices = await listVoices()
    return NextResponse.json(
      { voices },
      {
        headers: {
          'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=604800',
        },
      },
    )
  } catch (err) {
    const message =
      err instanceof Error && err.name === 'AbortError'
        ? 'Timed out while loading the voice list. Please refresh to try again.'
        : 'Could not load the voice list from the TTS service.'
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
