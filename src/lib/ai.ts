// Gemini via plain REST. No SDK, no service-account JSON file — the AI Studio
// key is a single env var, which is the only shape Vercel can actually hold.
const BASE = 'https://generativelanguage.googleapis.com/v1beta/models'

/** Everyday model. The only one with meaningful free-tier quota. */
export const FAST = process.env.GEMINI_MODEL || 'gemini-2.5-flash'

/**
 * Model for long-form drafting.
 *
 * Defaults to FAST on purpose: Google retired gemini-2.5-pro for new keys, and
 * its replacement (gemini-3.1-pro-preview) has zero free-tier quota — it answers
 * 429 until billing is enabled. Set GEMINI_PRO_MODEL once you have a billing
 * account and drafts get noticeably better; until then flash is what works.
 */
export const QUALITY = process.env.GEMINI_PRO_MODEL || FAST

type Part = { text: string } | { inlineData: { mimeType: string; data: string } }

async function once(parts: Part[], model: string, json: boolean) {
  const res = await fetch(`${BASE}/${model}:generateContent`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-goog-api-key': process.env.GEMINI_API_KEY!,
    },
    body: JSON.stringify({
      contents: [{ role: 'user', parts }],
      generationConfig: json ? { responseMimeType: 'application/json' } : {},
    }),
  })
  return { res, body: await res.json() }
}

async function call(parts: Part[], model: string, json: boolean): Promise<string> {
  let { res, body } = await once(parts, model, json)

  // 404 = model retired for this key, 429 = no quota on this tier. Both mean
  // "this model is not available to you", and both are survivable: finishing the
  // job on flash beats failing the whole cron run.
  if ((res.status === 404 || res.status === 429) && model !== FAST) {
    console.warn(`gemini ${res.status} on ${model}; falling back to ${FAST}`)
    ;({ res, body } = await once(parts, FAST, json))
  }

  if (!res.ok) {
    throw new Error(`gemini ${res.status} on ${model}: ${body?.error?.message ?? ''}`.slice(0, 300))
  }
  return body.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
}

/** Free-text generation. */
export function ask(prompt: string, model = FAST) {
  return call([{ text: prompt }], model, false)
}

/** Structured generation. responseMimeType does the JSON enforcement, so no fence-stripping. */
export async function askJson<T>(prompt: string, model = FAST): Promise<T> {
  return JSON.parse(await call([{ text: prompt }], model, true)) as T
}

/** Voice notes → text. You capture ~3x more when you can just talk for 40 seconds. */
export function transcribe(audio: Buffer, mimeType = 'audio/ogg') {
  return call(
    [
      { text: 'Transcribe this voice note verbatim. Output only the transcript, nothing else.' },
      { inlineData: { mimeType, data: audio.toString('base64') } },
    ],
    FAST,
    false,
  )
}
