// Display-time cleanup for model-generated text (timeline labels, approval
// hints, final summaries). The static UI copy carries no em dashes by design;
// Gemini's streamed prose does. Normalize them at render so the console keeps
// the house style. Never apply this to DQL/query text - queries must render
// exactly as executed.

const SPACED_DASH = /\s+[—–]\s+/g; // " — " / " – " between clauses
const BARE_DASH = /[—–]/g; //          "5—10", "now—verify"

export function cleanAgentText(text: string): string {
  return text.replace(SPACED_DASH, ", ").replace(BARE_DASH, "-");
}
