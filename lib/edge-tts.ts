import crypto from 'node:crypto'
import WebSocket from 'ws'

/**
 * Minimal server-side client for Microsoft Edge's online read-aloud TTS
 * service (the same engine used by the "edge-tts" tooling). It requires no
 * API key — it authenticates with a public trusted-client token plus a
 * time-based "Sec-MS-GEC" token that we compute on each request.
 */

const TRUSTED_CLIENT_TOKEN = '6A5AA1D4EAFF4E9FB37E23D68491D6F4'
const CHROMIUM_FULL_VERSION = '143.0.3650.75'
const CHROMIUM_MAJOR_VERSION = CHROMIUM_FULL_VERSION.split('.')[0]
const SEC_MS_GEC_VERSION = `1-${CHROMIUM_FULL_VERSION}`
const WIN_EPOCH = 11644473600 // seconds between 1601-01-01 and 1970-01-01

const BASE_URL = 'speech.platform.bing.com/consumer/speech/synthesize/readaloud'
const VOICES_URL = `https://${BASE_URL}/voices/list?trustedclienttoken=${TRUSTED_CLIENT_TOKEN}`
const WSS_URL = `wss://${BASE_URL}/edge/v1?TrustedClientToken=${TRUSTED_CLIENT_TOKEN}`

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) ' +
  `Chrome/${CHROMIUM_FULL_VERSION.split('.')[0]}.0.0.0 Safari/537.36 ` +
  `Edg/${CHROMIUM_FULL_VERSION.split('.')[0]}.0.0.0`

const AUDIO_FORMAT = 'audio-24khz-48kbitrate-mono-mp3'

export interface EdgeVoice {
  /** e.g. "en-US-JennyNeural" — the value sent to the synth API. */
  shortName: string
  /** e.g. "en-US" */
  locale: string
  /** "Male" | "Female" */
  gender: string
  /** Human-friendly name, e.g. "Microsoft Jenny Online (Natural)". */
  friendlyName: string
  /** Short display name, e.g. "Jenny". */
  displayName: string
  /** Content categories, e.g. ["News", "Novel"]. */
  categories: string[]
  /** Personalities, e.g. ["Friendly", "Positive"]. */
  personalities: string[]
}

/**
 * Generates the time-based Sec-MS-GEC security token. The timestamp is a
 * Windows file-time (100ns ticks since 1601) rounded down to a 5-minute
 * window, concatenated with the trusted token and SHA-256 hashed.
 */
function generateSecMsGec(): string {
  // Windows file-time in seconds (since 1601), rounded down to a 5-min window.
  const seconds = Math.floor(Date.now() / 1000) + WIN_EPOCH
  const rounded = seconds - (seconds % 300)
  // Convert to 100ns ticks. Use BigInt: the value exceeds JS's safe-integer
  // range, so plain Number math would corrupt the hash input and yield 403s.
  const ticks = BigInt(rounded) * 10_000_000n

  return crypto
    .createHash('sha256')
    .update(`${ticks.toString()}${TRUSTED_CLIENT_TOKEN}`, 'ascii')
    .digest('hex')
    .toUpperCase()
}

function connectionUrl(): string {
  return `${WSS_URL}&Sec-MS-GEC=${generateSecMsGec()}&Sec-MS-GEC-Version=${SEC_MS_GEC_VERSION}`
}

interface RawVoice {
  Name: string
  ShortName: string
  Gender: string
  Locale: string
  FriendlyName: string
  VoiceTag?: {
    ContentCategories?: string[]
    VoicePersonalities?: string[]
  }
}

let voicesCache: { data: EdgeVoice[]; at: number } | null = null
const VOICES_TTL = 1000 * 60 * 60 * 6 // 6 hours

/** Fetches the full catalog of Edge Online (Natural) voices (300+). */
export async function listVoices(timeoutMs = 10_000): Promise<EdgeVoice[]> {
  if (voicesCache && Date.now() - voicesCache.at < VOICES_TTL) {
    return voicesCache.data
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const res = await fetch(
      `${VOICES_URL}&Sec-MS-GEC=${generateSecMsGec()}&Sec-MS-GEC-Version=${SEC_MS_GEC_VERSION}`,
      {
        headers: {
          'User-Agent': USER_AGENT,
          Authority: 'speech.platform.bing.com',
          'Sec-CH-UA': `" Not;A Brand";v="99", "Microsoft Edge";v="${CHROMIUM_FULL_VERSION.split('.')[0]}", "Chromium";v="${CHROMIUM_FULL_VERSION.split('.')[0]}"`,
          'Accept-Encoding': 'gzip, deflate, br',
          'Accept-Language': 'en-US,en;q=0.9',
        },
        signal: controller.signal,
      },
    )

    if (!res.ok) {
      throw new Error(`Voice list request failed (${res.status})`)
    }

    const raw = (await res.json()) as RawVoice[]
    const data: EdgeVoice[] = raw.map((v) => ({
      shortName: v.ShortName,
      locale: v.Locale,
      gender: v.Gender,
      friendlyName: v.FriendlyName,
      displayName: deriveDisplayName(v),
      categories: v.VoiceTag?.ContentCategories ?? [],
      personalities: v.VoiceTag?.VoicePersonalities ?? [],
    }))

    voicesCache = { data, at: Date.now() }
    return data
  } finally {
    clearTimeout(timer)
  }
}

// "en-US-JennyNeural" -> "Jenny"; falls back to the FriendlyName.
function deriveDisplayName(v: RawVoice): string {
  const parts = v.ShortName.split('-')
  const last = parts[parts.length - 1] ?? ''
  const stripped = last.replace(/Neural$/i, '').replace(/Multilingual$/i, ' Multilingual')
  return stripped.trim() || v.FriendlyName
}

export interface SynthesizeOptions {
  text: string
  voice: string
  /** Percentage, e.g. "+0%", "-25%", "+50%". */
  rate?: string
  /** Hertz offset, e.g. "+0Hz", "-10Hz", "+20Hz". */
  pitch?: string
  /** Percentage volume, e.g. "+0%". */
  volume?: string
  timeoutMs?: number
}

function escapeXml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function buildSsml(text: string, voice: string, rate: string, pitch: string, volume: string) {
  const locale = voice.split('-').slice(0, 2).join('-') || 'en-US'
  return (
    `<speak version='1.0' xmlns='http://www.w3.org/2001/10/synthesis' xml:lang='${locale}'>` +
    `<voice name='${voice}'>` +
    `<prosody pitch='${pitch}' rate='${rate}' volume='${volume}'>` +
    `${escapeXml(text)}` +
    `</prosody></voice></speak>`
  )
}

function ssmlHeadersMessage(requestId: string, ssml: string): string {
  const timestamp = new Date().toString()
  return (
    `X-RequestId:${requestId}\r\n` +
    `Content-Type:application/ssml+xml\r\n` +
    `X-Timestamp:${timestamp}Z\r\n` +
    `Path:ssml\r\n\r\n` +
    ssml
  )
}

function speechConfigMessage(): string {
  const timestamp = new Date().toString()
  const config = {
    context: {
      synthesis: {
        audio: {
          metadataoptions: {
            sentenceBoundaryEnabled: 'false',
            wordBoundaryEnabled: 'false',
          },
          outputFormat: AUDIO_FORMAT,
        },
      },
    },
  }
  return (
    `X-Timestamp:${timestamp}\r\n` +
    `Content-Type:application/json; charset=utf-8\r\n` +
    `Path:speech.config\r\n\r\n` +
    JSON.stringify(config)
  )
}

/**
 * Synthesizes speech and resolves with a single MP3 buffer. Opens a WebSocket
 * to the Edge service, streams the audio chunks back, and enforces a timeout.
 */
export function synthesize({
  text,
  voice,
  rate = '+0%',
  pitch = '+0Hz',
  volume = '+0%',
  timeoutMs = 10_000,
}: SynthesizeOptions): Promise<Buffer> {
  return new Promise<Buffer>((resolve, reject) => {
    const requestId = crypto.randomUUID().replace(/-/g, '')
    const chunks: Buffer[] = []
    let settled = false

    const ws = new WebSocket(connectionUrl(), {
      headers: {
        'User-Agent': USER_AGENT,
        Origin: 'chrome-extension://jdiccldimpahigehkmmmdchbncknpkhm',
        'Accept-Encoding': 'gzip, deflate, br',
        'Accept-Language': 'en-US,en;q=0.9',
        Pragma: 'no-cache',
        'Cache-Control': 'no-cache',
      },
    })

    const finish = (err: Error | null, buf?: Buffer) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      try {
        ws.close()
      } catch {
        // ignore
      }
      if (err) reject(err)
      else resolve(buf as Buffer)
    }

    const timer = setTimeout(() => {
      finish(new Error('TTS service timed out. Please try again.'))
    }, timeoutMs)

    ws.on('open', () => {
      ws.send(speechConfigMessage())
      ws.send(ssmlHeadersMessage(requestId, buildSsml(text, voice, rate, pitch, volume)))
    })

    ws.on('message', (data: WebSocket.RawData, isBinary: boolean) => {
      if (isBinary) {
        // Binary frame: [2-byte big-endian header length][header][audio bytes].
        const buf = data as Buffer
        if (buf.length < 2) return
        const headerLength = buf.readUInt16BE(0)
        if (buf.length > headerLength + 2) {
          chunks.push(buf.subarray(headerLength + 2))
        }
        return
      }

      const message = data.toString()
      if (message.includes('Path:turn.end')) {
        if (chunks.length === 0) {
          finish(new Error('No audio was returned by the TTS service.'))
        } else {
          finish(null, Buffer.concat(chunks))
        }
      }
    })

    ws.on('error', (err) => {
      finish(new Error(`Could not reach the TTS service: ${err.message}`))
    })

    ws.on('close', (code) => {
      if (!settled) {
        if (chunks.length > 0) finish(null, Buffer.concat(chunks))
        else finish(new Error(`TTS connection closed unexpectedly (code ${code}).`))
      }
    })
  })
}
