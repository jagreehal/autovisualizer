import MonacoEditor from "@monaco-editor/react"
import { useRef } from "react"

import type { Theme } from "./theme"
import type { BeforeMount, OnMount } from "@monaco-editor/react"

export interface EditorProps {
  readonly code: string
  readonly theme: Theme
  readonly onChange: (code: string) => void
  readonly onRun: () => void
}

/** Editor themes that sit flush with the app chrome. */
const defineThemes: BeforeMount = (monaco) => {
  monaco.editor.defineTheme("viz-dark", {
    base: "vs-dark",
    inherit: true,
    rules: [],
    colors: {
      "editor.background": "#000000",
      "editorGutter.background": "#000000",
      "editor.lineHighlightBackground": "#16161699",
      "editorLineNumber.foreground": "#4d4d4d",
      "editorLineNumber.activeForeground": "#a1a1a1"
    }
  })
  monaco.editor.defineTheme("viz-light", {
    base: "vs",
    inherit: true,
    rules: [],
    colors: {
      "editor.background": "#fcfcfc",
      "editor.lineHighlightBackground": "#f2f2f2",
      "editorLineNumber.foreground": "#a8a8a8"
    }
  })
  // Imports resolve in the worker, not in Monaco, so only report syntax errors.
  monaco.typescript.typescriptDefaults.setDiagnosticsOptions({ noSemanticValidation: true })
}

export function Editor({ code, theme, onChange, onRun }: EditorProps) {
  // Monaco registers the command once; read the latest handler through a ref.
  const run = useRef(onRun)
  run.current = onRun
  const onMount: OnMount = (editor, monaco) => {
    editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.Enter, () => run.current())
  }
  return (
    <MonacoEditor
      language="typescript"
      path="file:///machine.ts"
      theme={theme === "dark" ? "viz-dark" : "viz-light"}
      value={code}
      onChange={(value) => onChange(value ?? "")}
      beforeMount={defineThemes}
      onMount={onMount}
      options={{
        minimap: { enabled: false },
        fontSize: 13,
        fontFamily: "'Geist Mono Variable', ui-monospace, monospace",
        fontLigatures: true,
        lineHeight: 20,
        padding: { top: 12 },
        scrollBeyondLastLine: false,
        tabSize: 2,
        renderLineHighlight: "line",
        overviewRulerBorder: false,
        hideCursorInOverviewRuler: true,
        scrollbar: { verticalScrollbarSize: 8, horizontalScrollbarSize: 8 }
      }}
    />
  )
}
