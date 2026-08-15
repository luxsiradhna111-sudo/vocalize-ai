'use client'

import { ChevronDown } from 'lucide-react'
import { useMemo } from 'react'

interface VoiceSelectProps {
  voices: SpeechSynthesisVoice[]
  value: string | null
  onChange: (voiceURI: string) => void
  disabled?: boolean
}

// Best-effort language label from a BCP-47 tag.
const languageName = (lang: string) => {
  try {
    const dn = new Intl.DisplayNames(['en'], { type: 'language' })
    const region = lang.split('-')[1]
    const base = dn.of(lang.split('-')[0]) ?? lang
    return region ? `${base} (${region})` : base
  } catch {
    return lang
  }
}

export function VoiceSelect({ voices, value, onChange, disabled }: VoiceSelectProps) {
  // Group voices by language for a tidy dropdown.
  const groups = useMemo(() => {
    const map = new Map<string, SpeechSynthesisVoice[]>()
    for (const v of voices) {
      const key = languageName(v.lang)
      const arr = map.get(key)
      if (arr) arr.push(v)
      else map.set(key, [v])
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]))
  }, [voices])

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor="voice-select" className="text-xs font-medium text-muted-foreground">
        Voice
      </label>
      <div className="relative">
        <select
          id="voice-select"
          value={value ?? ''}
          disabled={disabled || voices.length === 0}
          onChange={(e) => onChange(e.target.value)}
          className="h-11 w-full appearance-none rounded-xl border border-border bg-background pr-10 pl-4 text-sm outline-none transition-colors focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
        >
          {voices.length === 0 && <option value="">Loading voices…</option>}
          {groups.map(([lang, list]) => (
            <optgroup key={lang} label={lang}>
              {list.map((v) => (
                <option key={v.voiceURI} value={v.voiceURI}>
                  {v.name}
                  {v.localService ? '' : ' (online)'}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      </div>
    </div>
  )
}
