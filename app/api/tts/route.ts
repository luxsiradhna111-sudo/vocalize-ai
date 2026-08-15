import { type NextRequest, NextResponse } from 'next/server'
import { synthesize } from '@/lib/edge-tts'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_CHARS = 5000

interface TtsBody {
  text?: unknown
  voice?: unknown
  rate?: unknown
  pitch?: unknown
}

// Clamp helpers so the client can't send extreme prosody values.
function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n))
}

export async function POST(req: NextRequest) {
  let body: TtsBody
  try {
    body = (await req.json()) as TtsBody
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
  }

  const text = typeof body.text === 'string' ? body.text.trim() : ''
  const voice = typeof body.voice === 'string' ? body.voice : ''

  if (!text) {
    return NextResponse.json({ error: 'Please enter some text to convert to speech.' }, { status: 400 })
  }
  if (text.length > MAX_CHARS) {
    return NextResponse.json(
      { error: `Text is too long. Please keep it under ${MAX_CHARS.toLocaleString()} characters.` },
      { status: 400 },
    )
  }
  if (!voice || !/^[a-zA-Z]{2,3}-[a-zA-Z0-9-]+$/.test(voice)) {
    return NextResponse.json({ error: 'Please choose a valid voice.' }, { status: 400 })
  }

  // Client sends multipliers (1 = normal). Convert to Edge's SSML syntax.
  const rateMult = clamp(Number(body.rate) || 1, 0.5, 2)
  const pitchMult = clamp(Number(body.pitch) || 1, 0, 2)
  const ratePct = Math.round((rateMult - 1) * 100)
  const pitchHz = Math.round((pitchMult - 1) * 50)
  const rate = `${ratePct >= 0 ? '+' : ''}${ratePct}%`
  const pitch = `${pitchHz >= 0 ? '+' : ''}${pitchHz}Hz`

  try {
    const audio = await synthesize({ text, voice, rate, pitch, timeoutMs: 10_000 })
    return new NextResponse(new Uint8Array(audio), {
      status: 200,
      headers: {
        'Content-Type': 'audio/mpeg',
        'Content-Length': String(audio.length),
        'Cache-Control': 'no-store',
      },
    })
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Speech generation failed. Please try again.'
    const status = message.includes('timed out') ? 504 : 502
    return NextResponse.json({ error: message }, { status })
  }
}
