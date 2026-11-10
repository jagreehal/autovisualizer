/**
 * Where the code lives: the URL hash (share links), localStorage (autosave) and
 * files on disk. There is no server yet; remote saves for accounts belong here.
 */
import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from "lz-string"

const AUTOSAVE_KEY = "autovisualizer:code"
const HASH_PREFIX = "#code="

export interface InitialCode {
  readonly code: string
  /** True when the code came from a share link: someone else wrote it, so it waits for the user. */
  readonly fromLink: boolean
}

/** Code from a share link first, then the last autosave, then `fallback`. */
export function initialCode(fallback: string): InitialCode {
  const shared = location.hash.startsWith(HASH_PREFIX)
    ? decompressFromEncodedURIComponent(location.hash.slice(HASH_PREFIX.length))
    : null
  if (shared) return { code: shared, fromLink: true }
  return { code: localStorage.getItem(AUTOSAVE_KEY) || fallback, fromLink: false }
}

export function autosave(code: string) {
  localStorage.setItem(AUTOSAVE_KEY, code)
}

/** Put the code in the URL hash and return the share link. */
export function shareLink(code: string): string {
  const url = new URL(location.href)
  url.hash = `${HASH_PREFIX}${compressToEncodedURIComponent(code)}`
  history.replaceState(null, "", url)
  return url.toString()
}

const FILE_TYPES = {
  ts: { mime: "text/typescript", description: "TypeScript", extension: ".ts" },
  json: { mime: "application/json", description: "XState MachineJSON", extension: ".json" },
  svg: { mime: "image/svg+xml", description: "SVG image", extension: ".svg" }
} as const

/** Save with the File System Access API where the browser has it, otherwise download. */
export async function saveFile(text: string, name: string, kind: keyof typeof FILE_TYPES) {
  const type = FILE_TYPES[kind]
  const blob = new Blob([text], { type: type.mime })
  if (window.showSaveFilePicker) {
    const handle = await window.showSaveFilePicker({
      suggestedName: name,
      types: [{ description: type.description, accept: { [type.mime]: [type.extension] } }]
    })
    const writable = await handle.createWritable()
    await writable.write(blob)
    await writable.close()
    return
  }
  const link = document.createElement("a")
  link.href = URL.createObjectURL(blob)
  link.download = name
  link.click()
  URL.revokeObjectURL(link.href)
}
