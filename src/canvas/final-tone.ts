/** Finals tagged `error` or `failure` draw red; other finals draw green. */
export type FinalTone = "final" | "errorFinal"

export function finalTone(tags: ReadonlyArray<string>): FinalTone {
  return tags.includes("error") || tags.includes("failure") ? "errorFinal" : "final"
}
