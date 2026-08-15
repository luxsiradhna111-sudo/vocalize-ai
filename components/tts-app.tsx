'use client'

import { CircleAlert, Download, LoaderCircle, Smartphone, Sparkles, Volume2 } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { ThemeToggle } from '@/components/theme-toggle'
import { VoiceSelect } from '@/components/voice-select'
import { Button } from '@/components/ui/button'
import { useTts } from '@/hooks/use-tts'

const MAX_CHARS = 5000

export function TtsApp() {
  const {
    voices,
    voicesLoading,
    voicesError,
    status,
    error,
    audioUrl,
    generate,
    reset,
    setError,
  } = useTts()

  const [text, setText] = useState('')
  const [voice, setVoice] = useState<string | null>(null)
  const [rate, setRate] = useState(1)
  const [pitch, setPitch] = useState(1)

  // Pick a sensible default voice (English US female) once voices load.
  useEffect(() => {
    if (!voice && voices.length) {
      const preferred =
        voices.find((v) => v.shortName === 'en-US-AriaNeural') ||
        voices.find((v) => v.locale === 'en-US' && v.gender === 'Female') ||
        voices.find((v) => v.locale.startsWith('en')) ||
        voices[0]
      setVoice(preferred?.shortName ?? null)
    }
  }, [voices, voice])

  const charCount = text.length
  const overLimit = charCount > MAX_CHARS
  const isEmpty = text.trim().length === 0
  const isBusy = status === 'generating'

  const selectedVoice = useMemo(
    () => voices.find((v) => v.shortName === voice) ?? null,
    [voices, voice],
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
    if (!voice) {
      setError('Please choose a voice first.')
      return false
    }
    return true
  }

  const handleGenerate = () => {
    if (!validate()) return
    void generate({ text: text.trim(), voice: voice as string, rate, pitch })
  }

  const handleDownload = () => {
    if (!audioUrl) return
    const a = document.createElement('a')
    a.href = audioUrl
    const namePart = selectedVoice?.displayName?.replace(/\s+/g, '-').toLowerCase() ?? 'speech'
    a.download = `vocalize-${namePart}-${Date.now()}.mp3`
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
            <p className="text-xs text-muted-foreground">Natural cloud voices, instantly</p>
          </div>
        </div>
        <ThemeToggle />
      </header>

      <main className="flex flex-col gap-5">
        <section className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-card p-5 text-center shadow-sm sm:p-6">
          <a
            href="https://github.com/luxsiradhna111-sudo/vocalize-ai/releases/download/v1.0/build_85d5a3d1-5109-41bb-8bad-ad6ef091edfe.apk"
            download
            className="inline-flex h-11 w-full max-w-sm items-center justify-center gap-2 rounded-xl bg-brand-gradient px-6 text-sm font-medium text-white shadow-md transition-opacity hover:opacity-90"
          >
            <Smartphone className="h-4 w-4" /> Download Android App
          </a>
          <p className="text-xs text-muted-foreground">Install the Android app for offline access</p>
        </section>

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

          <div className="mt-4 flex flex-col gap-4">
            <VoiceSelect
              voices={voices}
              value={voice}
              onChange={setVoice}
              loading={voicesLoading}
              disabled={isBusy}
            />

            <div className="grid gap-4 sm:grid-cols-3">
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

        {voicesError && !error && (
          <div
            role="alert"
            className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-600 dark:text-amber-400"
          >
            <CircleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <p>{voicesError}</p>
          </div>
        )}

        <Button
          type="button"
          size="lg"
          onClick={handleGenerate}
          disabled={isBusy || voicesLoading}
          className="w-full bg-brand-gradient text-white shadow-md transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {isBusy ? (
            <>
              <LoaderCircle className="h-4 w-4 animate-spin" /> Generating speech…
            </>
          ) : (
            <>
              <Volume2 className="h-4 w-4" /> Generate Speech
            </>
          )}
        </Button>

        {audioUrl && (
          <section className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-medium">
                Generated audio
                {selectedVoice ? (
                  <span className="ml-2 font-normal text-muted-foreground">
                    {selectedVoice.displayName} · {selectedVoice.gender}
                  </span>
                ) : null}
              </h2>
              <button
                type="button"
                onClick={reset}
                className="text-xs text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
              >
                Clear
              </button>
            </div>
            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
            <audio src={audioUrl} controls autoPlay className="w-full" />
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
        Powered by Microsoft Edge&apos;s online neural voices — 300+ natural voices, no API key.
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
