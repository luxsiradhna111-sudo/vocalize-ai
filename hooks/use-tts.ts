'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import useSWR from 'swr'

export interface EdgeVoice {
  shortName: string
  locale: string
  gender: string
  friendlyName: string
  displayName: string
  categories: string[]
  personalities: string[]
}

export type TtsStatus = 'idle' | 'generating' | 'ready'

interface GenerateOptions {
  text: string
  voice: string
  rate: number
  pitch: number
}

const fetcher = async (url: string): Promise<EdgeVoice[]> => {
  const res = await fetch(url)
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null
    throw new Error(body?.error ?? 'Failed to load voices.')
  }
  const data = (await res.json()) as { voices: EdgeVoice[] }
  return data.voices
}

export interface UseTtsReturn {
  voices: EdgeVoice[]
  voicesLoading: boolean
  voicesError: string | null
  status: TtsStatus
  error: string | null
  audioUrl: string | null
  generate: (opts: GenerateOptions) => Promise<void>
  reset: () => void
  setError: (msg: string | null) => void
}

export function useTts(): UseTtsReturn {
  const {
    data: voices,
    error: swrError,
    isLoading: voicesLoading,
  } = useSWR<EdgeVoice[]>('/api/voices', fetcher, {
    revalidateOnFocus: false,
    dedupingInterval: 1000 * 60 * 60,
  })

  const [status, setStatus] = useState<TtsStatus>('idle')
  const [error, setError] = useState<string | null>(null)
  const [audioUrl, setAudioUrl] = useState<string | null>(null)
  const audioUrlRef = useRef<string | null>(null)

  const revokeUrl = useCallback(() => {
    if (audioUrlRef.current) {
      URL.revokeObjectURL(audioUrlRef.current)
      audioUrlRef.current = null
    }
  }, [])

  useEffect(() => () => revokeUrl(), [revokeUrl])

  const reset = useCallback(() => {
    revokeUrl()
    setAudioUrl(null)
    setStatus('idle')
    setError(null)
  }, [revokeUrl])

  const generate = useCallback(
    async ({ text, voice, rate, pitch }: GenerateOptions) => {
      setError(null)
      setStatus('generating')
      revokeUrl()
      setAudioUrl(null)

      try {
        const res = await fetch('/api/tts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text, voice, rate, pitch }),
        })

        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null
          throw new Error(body?.error ?? 'Speech generation failed. Please try again.')
        }

        const blob = await res.blob()
        if (blob.size === 0) {
          throw new Error('The TTS service returned empty audio. Please try again.')
        }
        const url = URL.createObjectURL(blob)
        audioUrlRef.current = url
        setAudioUrl(url)
        setStatus('ready')
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Speech generation failed.'
        setError(message)
        setStatus('idle')
      }
    },
    [revokeUrl],
  )

  return {
    voices: voices ?? [],
    voicesLoading,
    voicesError: swrError ? (swrError as Error).message : null,
    status,
    error,
    audioUrl,
    generate,
    reset,
    setError,
  }
}
