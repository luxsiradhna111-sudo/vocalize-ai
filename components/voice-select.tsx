'use client'

import { ChevronDown } from 'lucide-react'
import { useMemo } from 'react'
import type { EdgeVoice } from '@/hooks/use-tts'

interface VoiceSelectProps {
  voices: EdgeVoice[]
  value: string | null
  onChange: (shortName: string) => void
  loading?: boolean
  disabled?: boolean
}

// Best-effort language label from a BCP-47 locale, e.g. "en-IN" -> "English (India)".
function localeLabel(locale: string): string {
  try {
    const [lang, region] = locale.split('-')
    const langDn = new Intl.DisplayNames(['en'], { type: 'language' })
    const base = langDn.of(lang) ?? lang
    if (region) {
      const regionDn = new Intl.DisplayNames(['en'], { type: 'region' })
      const reg = regionDn.of(region.toUpperCase()) ?? region
      return `${base} (${reg})`
    }
    return base
  } catch {
    return locale
  }
}

export function VoiceSelect({ voices, value, onChange, loading, disabled }: VoiceSelectProps) {
  // Group voices by locale, each with a friendly label, sorted alphabetically.
  const groups = useMemo(() => {
    const map = new Map<string, EdgeVoice[]>()
    for (const v of voices) {
      const arr = map.get(v.locale)
      if (arr) arr.push(v)
      else map.set(v.locale, [v])
    }
    return [...map.entries()]
      .map(([locale, list]) => ({
        locale,
        label: localeLabel(locale),
        voices: list.sort((a, b) => a.displayName.localeCompare(b.displayName)),
      }))
      .sort((a, b) => a.label.localeCompare(b.label))
  }, [voices])

  const selectedVoice = voices.find((v) => v.shortName === value) ?? null
  const selectedLocale = selectedVoice?.locale ?? ''
  const voicesForLocale = groups.find((g) => g.locale === selectedLocale)?.voices ?? []

  const handleLocaleChange = (locale: string) => {
    const group = groups.find((g) => g.locale === locale)
    if (group && group.voices.length) {
      // Prefer a female voice as the default within a language, else the first.
      const preferred = group.voices.find((v) => v.gender === 'Female') ?? group.voices[0]
      onChange(preferred.shortName)
    }
  }

  const isDisabled = disabled || loading || voices.length === 0

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <div className="flex flex-col gap-1.5">
        <label htmlFor="language-select" className="text-xs font-medium text-muted-foreground">
          Language / accent
        </label>
        <div className="relative">
          <select
            id="language-select"
            value={selectedLocale}
            disabled={isDisabled}
            onChange={(e) => handleLocaleChange(e.target.value)}
            className="h-11 w-full appearance-none rounded-xl border border-border bg-background pr-10 pl-4 text-sm outline-none transition-colors focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          >
            {loading && <option value="">Loading languages…</option>}
            {!loading && voices.length === 0 && <option value="">Unavailable</option>}
            {groups.map((g) => (
              <option key={g.locale} value={g.locale}>
                {g.label} ({g.voices.length})
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="voice-select" className="text-xs font-medium text-muted-foreground">
          Voice
        </label>
        <div className="relative">
          <select
            id="voice-select"
            value={value ?? ''}
            disabled={isDisabled}
            onChange={(e) => onChange(e.target.value)}
            className="h-11 w-full appearance-none rounded-xl border border-border bg-background pr-10 pl-4 text-sm outline-none transition-colors focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
          >
            {loading && <option value="">Loading voices…</option>}
            {!loading && voices.length === 0 && <option value="">Unavailable</option>}
            {voicesForLocale.map((v) => (
              <option key={v.shortName} value={v.shortName}>
                {v.displayName} · {v.gender}
                {v.personalities.length ? ` · ${v.personalities.slice(0, 2).join(', ')}` : ''}
              </option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        </div>
      </div>
    </div>
  )
}
