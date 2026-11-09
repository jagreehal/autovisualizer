// The File System Access API is Chromium-only and not in TypeScript's DOM lib yet.
interface SaveFilePickerOptions {
  readonly suggestedName?: string
  readonly types?: ReadonlyArray<{ readonly description: string; readonly accept: Record<string, Array<string>> }>
}

interface Window {
  showSaveFilePicker?: (options: SaveFilePickerOptions) => Promise<FileSystemFileHandle>
}
