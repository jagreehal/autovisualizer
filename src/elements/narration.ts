/**
 * Walkthrough narration: each step's note read aloud, from a voice model through `narrate`, a recorded clip through
 * `audio-src`, or the browser's own voice through `speak`. Each resolves when the step's audio ends, so autoplay can
 * wait for it. Aborting stops the audio and resolves at once.
 */
import type { Narrate, NarrationStep } from "./Statechart"

export interface NarrationOptions {
  readonly narrate?: Narrate | undefined
  /** A clip per step, `{step}` standing for its index: `audio/{step}.mp3`. */
  readonly audioSrc?: string | undefined
  readonly speak: boolean
  /** A fragment of a browser voice's name, matched case-insensitively. */
  readonly voice?: string | undefined
  readonly rate?: number | undefined
}

export const narrationStep = (index: number, event: string, note: string | undefined): NarrationStep => ({
  index,
  event,
  note: note ?? "",
  text: note || event
})

export const clipUrl = (template: string, index: number) => template.replaceAll("{step}", String(index))

/** Runs `start` until it reports whether the audio played through, or `signal` aborts it. */
const settled = (signal: AbortSignal, start: (done: (played: boolean) => void) => () => void) =>
  new Promise<boolean>((resolve) => {
    if (signal.aborted) return resolve(false)
    let stop = () => {}
    let finished = false
    const finish = (played: boolean) => {
      if (finished) return
      finished = true
      signal.removeEventListener("abort", abort)
      stop()
      resolve(played)
    }
    const abort = () => finish(false)
    signal.addEventListener("abort", abort)
    stop = start(finish)
  })

/** Plays a clip to its end. False when it can't play (missing, or blocked until the reader interacts). */
function play(source: string | Blob, signal: AbortSignal) {
  const url = source instanceof Blob ? URL.createObjectURL(source) : source
  return settled(signal, (done) => {
    const audio = new Audio(url)
    audio.addEventListener("ended", () => done(true))
    audio.addEventListener("error", () => done(false))
    audio.play().catch(() => done(false))
    return () => {
      audio.pause()
      if (source instanceof Blob) URL.revokeObjectURL(url)
    }
  })
}

/** Says `text` with the browser's voice, to the end of the sentence. */
function say(text: string, options: NarrationOptions, signal: AbortSignal) {
  return settled(signal, (done) => {
    const utterance = new SpeechSynthesisUtterance(text)
    const wanted = options.voice?.toLowerCase()
    const voice = wanted ? speechSynthesis.getVoices().find((v) => v.name.toLowerCase().includes(wanted)) : undefined
    if (voice !== undefined) utterance.voice = voice
    if (options.rate !== undefined) utterance.rate = options.rate
    utterance.addEventListener("end", () => done(true))
    utterance.addEventListener("error", () => done(false))
    speechSynthesis.cancel()
    speechSynthesis.speak(utterance)
    return () => speechSynthesis.cancel()
  })
}

/** Narrates `step`: the `narrate` hook's audio, else its `audio-src` clip, else the browser's voice. */
export async function narrateStep(step: NarrationStep, options: NarrationOptions, signal: AbortSignal) {
  // Called inside then(): a narrator that throws, synchronously or not, falls back like one that returns nothing.
  const fromModel = await Promise.resolve()
    .then(() => options.narrate?.(step))
    .catch(() => undefined)
  if (signal.aborted) return
  if (fromModel !== undefined && (await play(fromModel, signal))) return
  if (signal.aborted) return
  if (options.audioSrc !== undefined && (await play(clipUrl(options.audioSrc, step.index), signal))) return
  if (signal.aborted || !options.speak) return
  await say(step.text, options, signal)
}
