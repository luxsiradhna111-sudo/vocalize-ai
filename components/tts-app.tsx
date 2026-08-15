'use client'

import {
  CircleAlert,
  Download,
  LoaderCircle,
  Pause,
  Play,
  Sparkles,
  Square,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { ThemeToggle } from '@/components/theme-toggle'
import { VoiceSelect } from '@/components/voice-select'
import { Button } from '@/components/ui/button'
import { useSpeech } from '@/hooks/use-speech'

const MAX_CHARS = 5000

export function TtsApp() {
  const {
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
  } = useSpeech()

  const [text, setText] = useState('')
  const [voiceURI, setVoiceURI] = useState<string | null>(null)
  const [rate, setRate] = useState(1)
  const [pitch, setPitch] = useState(1)
  const audioRef = useRef<HTMLAudioElement>(null)

  // Pick a sensible default voice once voices load.
  useEffect(() => {
    if (!voiceURI && voices.length) {
      const preferred =
        voices.find((v) => v.lang.startsWith('en') && v.default) ||
        voices.find((v) => v.lang.startsWith('en')) ||
        voices[0]
      setVoiceURI(preferred?.voiceURI ?? null)
    }
  }, [voices, voiceURI])

  const charCount = text.length
  const overLimit = charCount > MAX_CHARS
  const isEmpty = text.trim().length === 0
  const isBusy = status === 'generating'
  const isSpeaking = status === 'playing' || status === 'paused'

  const opts = useMemo(
    () => ({ text: text.trim(), voiceURI, rate, pitch }),
    [text, voiceURI, rate, pitch],
  )

  const validate = () => {
    if (isEmpty) {
      setError('Please enter some text to convert to speech.')
      return false
    }
    if (overLimit) {
      setError(`Text is too long. Please keep it under ${MAX_CHARS.toLocaleString()} characters.`)
      return false
    }
    return true
  }

  const handlePlay = () => {
    if (status === 'paused') {
      resume()
      return
    }
    if (!validate()) return
    speak(opts)
  }

  const handleGenerate = async () => {
    if (!validate()) return
    try {
      await generate(opts)
    } catch (err) {
      const message = err instanceof Error ? err.message : ''
      if (message === 'capture-denied') {
        setError(
          'Recording was cancelled. The speech played live — allow screen/tab audio sharing to save a file.',
        )
      } else if (message === 'capture-unsupported' || message === 'no-audio-track') {
        setError(
          'Your browser can\u2019t capture audio for download, but live playback works. Try Chrome on desktop and share the tab with audio.',
        )
      }
    }
  }

  const handleDownload = () => {
    if (!audioUrl) return
    const a = document.createElement('a')
    a.href = audioUrl
    a.download = `vocalize-${Date.now()}.webm`
    document.body.appendChild(a)
    a.click()
    a.remove()
  }

  const counterColor = overLimit
    ? 'text-destructive'
    : charCount > MAX_CHARS * 0.9
      ? 'text-amber-500'
      : 'text-muted-foreground'

  return (
    <div className="mx-auto flex min-h-svh w-full max-w-2xl flex-col gap-6 px-4 py-8 sm:py-12">
      <header className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-gradient text-white shadow-md">
            <Sparkles className="h-5 w-5" />
          </span>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">Vocalize</h1>
            <p className="text-xs text-muted-foreground">Text to speech, instantly</p>
          </div>
        </div>
        <ThemeToggle />
      </header>

      <main className="flex flex-col gap-5">
        <section className="rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-6">
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <label htmlFor="tts-input" className="text-sm font-medium">
              Your text
            </label>
            <span className={`font-mono text-xs tabular-nums ${counterColor}`}>
              {charCount.toLocaleString()} / {MAX_CHARS.toLocaleString()}
            </span>
          </div>
          <textarea
            id="tts-input"
            value={text}
            onChange={(e) => {
              setText(e.target.value)
              if (error) setError(null)
            }}
            placeholder="Type or paste anything you'd like to hear read aloud..."
            rows={7}
            aria-invalid={overLimit}
            className="w-full resize-y rounded-xl border border-border bg-background px-4 py-3 text-sm leading-relaxed shadow-inner outline-none transition-colors placeholder:text-muted-foreground focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring aria-invalid:border-destructive"
          />

          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <div className="sm:col-span-3">
              <VoiceSelect
                voices={voices}
                value={voiceURI}
                onChange={setVoiceURI}
                disabled={!supported || isBusy}
              />
            </div>

            <SliderField
              label="Speed"
              value={rate}
              min={0.5}
              max={2}
              step={0.1}
              onChange={setRate}
              disabled={isBusy}
            />
            <SliderField
              label="Pitch"
              value={pitch}
              min={0}
              max={2}
              step={0.1}
              onChange={setPitch}
              disabled={isBusy}
            />
            <div className="flex items-end">
              <button
                type="button"
                onClick={() => {
                  setRate(1)
                  setPitch(1)
                }}
                disabled={isBusy || (rate === 1 && pitch === 1)}
                className="h-9 w-full rounded-lg border border-border bg-background text-xs font-medium text-muted-foreground transition-colors hover:bg-muted disabled:opacity-40"
              >
                Reset
              </button>
            </div>
          </div>
        </section>

        {error && (
          <div
            role="alert"
            className="flex items-start gap-3 rounded-xl border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive"
          >
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <p>{error}</p>
          </div>
        )}

        {!supported && (
          <div
            role="alert"
            className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-600 dark:text-amber-400"
          >
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <p>Your browser doesn&apos;t support the Web Speech API. Try Chrome, Edge, or Safari.</p>
          </div>
        )}

        <div className="flex flex-col gap-3 sm:flex-row">
          {isSpeaking ? (
            <>
              <Button
                type="button"
                size="lg"
                onClick={status === 'playing' ? pause : handlePlay}
                className="flex-1 bg-brand-gradient text-white shadow-md transition-opacity hover:opacity-90"
              >
                {status === 'playing' ? (
                  <>
                    <Pause className="h-4 w-4" /> Pause
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4" /> Resume
                  </>
                )}
              </Button>
              <Button
                type="button"
                size="lg"
                variant="outline"
                onClick={stop}
                className="sm:w-32"
              >
                <Square className="h-4 w-4" /> Stop
              </Button>
            </>
          ) : (
            <>
              <Button
                type="button"
                size="lg"
                onClick={handlePlay}
                disabled={!supported || isBusy}
                className="flex-1 bg-brand-gradient text-white shadow-md transition-opacity hover:opacity-90 disabled:opacity-50"
              >
                <Play className="h-4 w-4" /> Generate Speech
              </Button>
              <Button
                type="button"
                size="lg"
                variant="outline"
                onClick={handleGenerate}
                disabled={!supported || isBusy}
                className="sm:w-44"
              >
                {isBusy ? (
                  <>
                    <LoaderCircle className="h-4 w-4 animate-spin" /> Recording…
                  </>
                ) : (
                  <>
                    <Download className="h-4 w-4" /> Save as audio
                  </>
                )}
              </Button>
            </>
          )}
        </div>

        {audioUrl && (
          <section className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-medium">Generated audio</h2>
              <button
                type="button"
                onClick={reset}
                className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
              >
                Clear
              </button>
            </div>
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <audio ref={audioRef} src={audioUrl} controls className="w-full" />
            <Button
              type="button"
              onClick={handleDownload}
              className="bg-brand-gradient text-white shadow-md transition-opacity hover:opacity-90"
            >
              <Download className="h-4 w-4" /> Download as MP3
            </Button>
          </section>
        )}
      </main>

      <footer className="mt-auto pt-6 text-center text-xs text-muted-foreground">
        Powered by your browser&apos;s Web Speech API — free, private, no limits.
      </footer>
    </div>
  )
}

function SliderField({
  label,
  value,
  min,
  max,
  step,
  onChange,
  disabled,
}: {
  label: string
  value: number
  min: number
  max: number
  step: number
  onChange: (v: number) => void
  disabled?: boolean
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between">
        <label className="text-xs font-medium text-muted-foreground">{label}</label>
        <span className="font-mono text-xs tabular-nums text-foreground">{value.toFixed(1)}x</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        className="h-2 w-full cursor-pointer appearance-none rounded-full bg-muted accent-primary disabled:opacity-50"
      />
    </div>
  )
}
