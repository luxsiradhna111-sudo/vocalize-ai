'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

export type SpeechStatus = 'idle' | 'generating' | 'ready' | 'playing' | 'paused'

export interface UseSpeechReturn {
  voices: SpeechSynthesisVoice[]
  supported: boolean
  status: SpeechStatus
  error: string | null
  audioUrl: string | null
  /** Speaks the text live (no recording). Returns false on failure. */
  speak: (opts: SpeakOptions) => void
  pause: () => void
  resume: () => void
  stop: () => void
  /** Renders the speech to a downloadable audio blob using tab-audio capture. */
  generate: (opts: SpeakOptions) => Promise<void>
  reset: () => void
  setError: (msg: string | null) => void
}

export interface SpeakOptions {
  text: string
  voiceURI: string | null
  rate: number
  pitch: number
}

export function useSpeech(): UseSpeechReturn {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([])
  const [supported, setSupported] = useState(true)
  const [status, setStatus] = useState<SpeechStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)

  const audioUrlRef = useRef<string | null>(null)

  // Load and keep voices in sync.
  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      setSupported(false)
      return
    }
    const load = () => {
      const list = window.speechSynthesis.getVoices()
      if (list.length) setVoices(list)
    }
    load()
    window.speechSynthesis.addEventListener('voiceschanged', load)
    return () => {
      window.speechSynthesis.removeEventListener('voiceschanged', load)
      window.speechSynthesis.cancel()
    }
  }, [])

  const revokeUrl = useCallback(() => {
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current)
      audioUrlRef.current = null
    }
  }, [])

  useEffect(() => () => revokeUrl(), [revokeUrl])

  const buildUtterance = useCallback(
    ({ text, voiceURI, rate, pitch }: SpeakOptions) => {
      const utter = new SpeechSynthesisUtterance(text)
      const voice = voices.find((v) => v.voiceURI === voiceURI)
      if (voice) {
        utter.voice = voice
        utter.lang = voice.lang
      }
      utter.rate = rate
      utter.pitch = pitch
      return utter
    },
    [voices],
  )

  const speak = useCallback(
    (opts: SpeakOptions) => {
      if (!supported) return
      window.speechSynthesis.cancel()
      const utter = buildUtterance(opts)
      utter.onstart = () => setStatus('playing')
      utter.onresume = () => setStatus('playing')
      utter.onpause = () => setStatus('paused')
      utter.onend = () => setStatus('ready')
      utter.onerror = (e) => {
        if (e.error !== 'interrupted' && e.error !== 'canceled') {
          setError('Something went wrong during playback.')
          setStatus('idle')
        }
      }
      window.speechSynthesis.speak(utter)
    },
    [supported, buildUtterance],
  )

  const pause = useCallback(() => {
    if (!supported) return
    window.speechSynthesis.pause()
    setStatus('paused')
  }, [supported])

  const resume = useCallback(() => {
    if (!supported) return
    window.speechSynthesis.resume()
    setStatus('playing')
  }, [supported])

  const stop = useCallback(() => {
    if (!supported) return
    window.speechSynthesis.cancel()
    setStatus((s) => (s === 'idle' ? 'idle' : 'ready'))
  }, [supported])

  const reset = useCallback(() => {
    if (supported) window.speechSynthesis.cancel()
    revokeUrl()
    setAudioUrl(null)
    setStatus('idle')
    setError(null)
  }, [supported, revokeUrl])

  /**
   * Renders speech to an audio blob. The Web Speech API cannot write to a file
   * directly, so we capture the synthesized audio from the tab's output stream
   * with MediaRecorder while the utterance plays.
   */
  const generate = useCallback(
    async ({ text, voiceURI, rate, pitch }: SpeakOptions) => {
      if (!supported) {
        setError('Speech synthesis is not supported in this browser.')
        return
      }

      setError(null)
      setStatus('generating')
      revokeUrl()
      setAudioUrl(null)

      const canCapture =
        typeof navigator !== 'undefined' &&
        !!navigator.mediaDevices &&
        // getDisplayMedia is required to capture tab audio in most browsers.
        typeof navigator.mediaDevices.getDisplayMedia === 'function' &&
        typeof MediaRecorder !== 'undefined'

      if (!canCapture) {
        // Graceful fallback: just play it live, no downloadable file.
        setStatus('ready')
        speak({ text, voiceURI, rate, pitch })
        throw new Error('capture-unsupported')
      }

      let stream: MediaStream | null = null
      try {
        stream = await navigator.mediaDevices.getDisplayMedia({
          video: true,
          audio: true,
        })

        const audioTracks = stream.getAudioTracks()
        if (audioTracks.length === 0) {
          stream.getTracks().forEach((t) => t.stop())
          setStatus('ready')
          speak({ text, voiceURI, rate, pitch })
          throw new Error('no-audio-track')
        }

        const audioStream = new MediaStream(audioTracks)
        const recorder = new MediaRecorder(audioStream)
        const chunks: BlobPart[] = []
        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunks.push(e.data)
        }

        const recorded = new Promise<Blob>((resolve) => {
          recorder.onstop = () => resolve(new Blob(chunks, { type: recorder.mimeType || 'audio/webm' }))
        })

        recorder.start()

        const utter = buildUtterance({ text, voiceURI, rate, pitch })
        await new Promise<void>((resolve) => {
          utter.onend = () => resolve()
          utter.onerror = () => resolve()
          window.speechSynthesis.speak(utter)
        })

        // Small tail so the recorder captures the final syllable.
        await new Promise((r) => setTimeout(r, 250))
        recorder.stop()
        stream.getTracks().forEach((t) => t.stop())

        const blob = await recorded
        const url = URL.createObjectURL(blob)
        audioUrlRef.current = url
        setAudioUrl(url)
        setStatus('ready')
      } catch (err) {
        if (stream) stream.getTracks().forEach((t) => t.stop())
        const message = err instanceof Error ? err.message : ''
        if (message === 'capture-unsupported' || message === 'no-audio-track') {
          throw err
        }
        // User denied the capture prompt — fall back to live playback.
        setStatus('ready')
        speak({ text, voiceURI, rate, pitch })
        throw new Error('capture-denied')
      }
    },
    [supported, revokeUrl, buildUtterance, speak],
  )

  return {
    voices,
    supported,
    status,
    error,
    audioUrl,
    speak,
    pause,
    resume,
    stop,
    generate,
    reset,
    setError,
  }
}
