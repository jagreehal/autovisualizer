/**
 * Mermaid `stateDiagram` → XState v6 source: parse the lines into a state tree, then print it as a
 * `createMachine` module the editor and embed already run.
 * Hand-written because Mermaid's own parser needs a DOM and ships megabytes.
 * Drawing-only syntax (notes, direction, styling, accessibility text) is skipped; choice, fork and join
 * become plain states, since a diagram doesn't say what their guards are.
 * Edge cases are checked against Mermaid's own state-diagram parser specs.
 */

/** A state, by its Mermaid name. */
interface State {
  readonly name: string
  description?: string
  /** The region it is drawn in; only the diagram itself has none. */
  parent?: Region
  /** Its body: one region makes a compound state, several (split by `--`) a parallel one. */
  readonly regions: Array<Region>
}

/** One concurrent part of a state's body. A body without `--` is a single region. */
interface Region {
  readonly owner: State
  readonly states: Array<State>
  initial?: State
}

interface Arrow {
  readonly source: State
  /** `end` for `X --> [*]`: the end of the region the arrow is written in. */
  readonly target: State | "end"
  readonly event: string | undefined
  readonly region: Region
}

/** The slice of XState's state config a diagram can describe. */
export interface StateConfig {
  id?: string
  description?: string
  type?: "parallel" | "final"
  initial?: string
  states?: { [key: string]: StateConfig }
  on?: { [event: string]: { readonly target: string } }
  onDone?: { readonly target: string }
}

const START_OR_END = "[*]"

/** Strips a `%%` comment, `:::class` styling and surrounding space. */
const clean = (line: string) =>
  line
    .replace(/%%.*$/, "")
    .replace(/:::[\w-]+/g, "")
    .trim()

/** Labels may break lines with `\n` or `<br>`; an event or description reads them as spaces. */
const text = (label: string | undefined) =>
  label
    ?.replace(/\\n|<br\s*\/?>/gi, " ")
    .replace(/\s+/g, " ")
    .trim() || undefined

const unique = (name: string, taken: ReadonlySet<string>) => {
  let candidate = name
  for (let i = 2; taken.has(candidate); i++) candidate = `${name}${i}`
  return candidate
}

function parse(source: string) {
  const frontMatter = /^\s*---[\s\S]*?\n---\s*\n/.exec(source)?.[0] ?? ""
  const rawTitle = /^title:[ \t]*(.+)$/m.exec(frontMatter)?.[1] ?? ""
  // A quoted title keeps a `#`; an unquoted one ends at a YAML comment.
  const title = (/^(["'])(.*?)\1/.exec(rawTitle)?.[2] ?? rawTitle.replace(/(^|\s)#.*$/, "")).trim()
  const lines = source
    // Blanked rather than removed, so errors give the line numbers of the file.
    .replace(frontMatter, frontMatter.replace(/[^\n]/g, ""))
    .split(/\r?\n/)
    .map(clean)
  const header = lines.findIndex((line) => line !== "")
  if (!/^stateDiagram(-v2)?$/.test(lines[header] ?? ""))
    throw new Error("Not a Mermaid state diagram: the first line should be stateDiagram-v2")

  const root: State = { name: "", regions: [] }
  const states = new Map<string, State>()
  const arrows: Array<Arrow> = []
  /** Opens another region in a state's body. */
  const open = (owner: State): Region => {
    const made: Region = { owner, states: [] }
    owner.regions.push(made)
    return made
  }
  let region = open(root)
  /** What ends a block being skipped: a note or accessibility description over several lines. */
  let skipUntil: RegExp | undefined

  const within = (inner: Region | undefined, outer: Region): boolean =>
    inner !== undefined && (inner === outer || within(inner.owner.parent, outer))
  /** The state with this name, made in the current region when first named. */
  const state = (name: string) => {
    let found = states.get(name)
    if (found === undefined) {
      found = { name, parent: region, regions: [] }
      states.set(name, found)
      region.states.push(found)
    }
    return found
  }
  /**
   * A state lives where it is first named, and an arrow from elsewhere doesn't move it. `[*] --> X`, `X --> [*]`
   * and `state X` do: written in a region that encloses X's, they claim X for it.
   */
  const claim = (name: string) => {
    const found = state(name)
    const from = found.parent
    if (from !== undefined && from !== region && within(from, region)) {
      from.states.splice(from.states.indexOf(found), 1)
      found.parent = region
      region.states.push(found)
    }
    return found
  }
  // Mermaid keeps every description a state is given, one per line.
  const describe = (found: State, description: string | undefined) => {
    if (description) found.description = found.description ? `${found.description}\n${description}` : description
  }

  const read = (line: string, number: number): void => {
    if (skipUntil !== undefined) {
      if (skipUntil.test(line)) skipUntil = undefined
      return
    }
    if (/^note\b/.test(line)) {
      // Only `note left of X` without `: text` opens a block; `note right of A:hello` and floating notes are one line.
      if (/^note\s+(left|right)\s+of\s+[^\s:]+$/.test(line)) skipUntil = /^end note$/
      return
    }
    if (/^acc(Title|Descr)\s*\{[^}]*$/.test(line)) {
      // The block may close on its last line of text: `Description }`.
      skipUntil = /\}$/
      return
    }
    if (/^(direction|classDef|class|accTitle|accDescr|style|hide|scale)\b/.test(line)) return
    if (line === "}") {
      if (region.owner.parent === undefined) throw new Error(`Line ${number}: "}" closes no state`)
      region = region.owner.parent
      return
    }
    if (line === "--") {
      region = open(region.owner)
      return
    }
    // A block on one line: `state Parent { Child }`, or an empty `state Parent {}`.
    const oneLine = /^(state\s+.+?)\s*\{\s*(.*?)\s*\}$/.exec(line)
    if (oneLine) {
      for (const part of [`${oneLine[1]!} {`, oneLine[2]!, "}"]) if (part !== "") read(part, number)
      return
    }
    const arrow = /^(\S+?)\s*-->\s*(\S+?)\s*(?::\s*(.*))?$/.exec(line)
    if (arrow) {
      const [, from = "", to = "", label] = arrow
      if (from === START_OR_END) region.initial = claim(to)
      else if (to === START_OR_END) arrows.push({ source: claim(from), target: "end", event: text(label), region })
      else arrows.push({ source: state(from), target: state(to), event: text(label), region })
      return
    }
    const declared = /^state\s+(?:"([^"]*)"\s+as\s+)?(\S+?)(?:\s+<<\w+>>)?\s*(\{)?$/.exec(line)
    if (declared) {
      const [, description, name = "", block] = declared
      const found = claim(name)
      describe(found, text(description))
      if (block) region = found.regions.at(-1) ?? open(found)
      return
    }
    // `Id : description` or a bare `Id`.
    const described = /^([^\s:]+)\s*(?::\s*(.*))?$/.exec(line)
    if (described) {
      describe(state(described[1]!), text(described[2]))
      return
    }
    throw new Error(`Line ${number}: can't read "${line}"`)
  }
  for (const [index, line] of lines.entries()) {
    if (index > header && line !== "") read(line, index + 1)
  }
  if (skipUntil !== undefined) throw new Error("A note or accessibility description is never closed")
  if (region.owner !== root) throw new Error(`"state ${region.owner.name} {" is never closed with "}"`)
  return { title, root, arrows }
}

/** The XState config object for a Mermaid state diagram. */
export function mermaidToConfig(source: string) {
  const { title, root, arrows } = parse(source)
  const outgoing = new Map<State, Array<Arrow>>()
  for (const arrow of arrows) outgoing.set(arrow.source, [...(outgoing.get(arrow.source) ?? []), arrow])
  // An empty block, `state X {}`, is no body: X stays a leaf.
  const body = (s: State) => s.regions.filter((r) => r.states.length > 0)
  const everyState = (s: State): Array<State> => [s, ...s.regions.flatMap((r) => r.states.flatMap(everyState))]

  // Names nothing new may take, in any scope: a state reached from elsewhere goes by id, and ids are global.
  const taken = new Set(everyState(root).map((s) => s.name))
  // XState reads a dot in a key or target as a path, so `v1.2` becomes `v1_2`.
  const keys = new Map<State, string>()
  for (const s of everyState(root)) {
    if (!s.name.includes(".")) continue
    keys.set(s, unique(s.name.replaceAll(".", "_"), taken))
    taken.add(keys.get(s)!)
  }
  const key = (s: State) => keys.get(s) ?? s.name

  // `X --> [*]` alone makes a leaf X final; otherwise X leaves to a final state added where the arrow was written.
  const finals = new Set<State>()
  const ends = new Map<Region, State>()
  for (const arrow of arrows) {
    if (arrow.target !== "end") continue
    const { source, region } = arrow
    const alone = body(source).length === 0 && outgoing.get(source)!.length === 1
    if (arrow.event === undefined && alone && source.parent === region) finals.add(source)
    else if (!ends.has(region)) {
      const done: State = { name: unique("done", taken), parent: region, regions: [] }
      taken.add(done.name)
      region.states.push(done)
      ends.set(region, done)
      finals.add(done)
    }
  }
  const targetOf = (arrow: Arrow) => (arrow.target === "end" ? ends.get(arrow.region)! : arrow.target)
  // A final state's own `--> [*]` is said by `type: "final"`, not a transition.
  const isTransition = (arrow: Arrow) => !(arrow.target === "end" && finals.has(arrow.source))
  // Mermaid names are global; XState keys are per parent, so a target in another region is reached by id.
  const byId = new Set(
    arrows.filter(isTransition).flatMap((arrow) => {
      const to = targetOf(arrow)
      return to.parent === arrow.source.parent ? [] : [to]
    })
  )
  // Nor may the machine's id be a state's: XState refuses two of one id.
  const id = unique(title.replace(/\W+(\w)/g, (_, c: string) => c.toUpperCase()).replace(/\W/g, "") || "machine", taken)

  const compound = (region: Region): StateConfig => ({
    // XState needs an initial state: when another block has since claimed X of `[*] --> X`, the first state is it.
    initial: key(region.initial?.parent === region ? region.initial : region.states[0]!),
    states: Object.fromEntries(region.states.map((s) => [key(s), config(s)]))
  })
  const config = (s: State): StateConfig => {
    const out: StateConfig = {}
    if (byId.has(s)) out.id = key(s)
    if (s.description) out.description = s.description
    const regions = body(s)
    if (regions.length === 1) Object.assign(out, compound(regions[0]!))
    if (regions.length > 1) {
      out.type = "parallel"
      out.states = Object.fromEntries(regions.map((r, i) => [i === 0 ? "region" : `region${i + 1}`, compound(r)]))
    }
    if (finals.has(s)) out.type = "final"
    // No prototype, so an event named `constructor` or `toString` is a key like any other.
    const on: NonNullable<StateConfig["on"]> = Object.create(null)
    for (const arrow of (outgoing.get(s) ?? []).filter(isTransition)) {
      const to = targetOf(arrow)
      const transition = { target: byId.has(to) ? `#${key(to)}` : key(to) }
      // An arrow labelled onDone leaves a compound state once it reaches a final state.
      if (arrow.event === "onDone" && regions.length > 0) out.onDone ??= transition
      // An event on two arrows keeps the first: a diagram has no guards to choose between them.
      else {
        const event = arrow.event ?? `${s.name}--${to.name}`
        if (!Object.hasOwn(on, event)) on[event] = transition
      }
    }
    if (Object.keys(on).length > 0) out.on = on
    return out
  }
  return { id, ...config(root) }
}

const IDENTIFIER = /^[A-Za-z_$][\w$]*$/

/** Mermaid state diagram → a TypeScript module exporting the machine, ready for the editor. */
export function machineFromMermaid(source: string) {
  const config = mermaidToConfig(source)
  // JSON, with quotes dropped from keys that are plain identifiers. A `__proto__` key in an object literal would
  // set the prototype instead, so it is written computed.
  const body = JSON.stringify(config, null, 2).replace(/^(\s*)"([^"]+)":/gm, (all, space: string, key: string) =>
    key === "__proto__" ? `${space}["__proto__"]:` : IDENTIFIER.test(key) ? `${space}${key}:` : all
  )
  return `import { createMachine } from "xstate"\n\n// Converted from a Mermaid state diagram.\nexport const machine = createMachine(${body})\n`
}
