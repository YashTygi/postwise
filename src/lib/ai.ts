// Gemini via plain REST. No SDK, no service-account JSON file — the AI Studio
// key is a single env var, which is the only shape Vercel can actually hold.
const BASE = 'https://generativelanguage.googleapis.com/v1beta/models'

type Part = { text: string } | { inlineData: { mimeType: string; data: string } }

async function call(parts: Part[], model: string, json: boolean): Promise<string> {
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
  if (!res.ok) throw new Error(`gemini ${res.status}: ${(await res.text()).slice(0, 300)}`)
  const data = await res.json()
  return data.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
}

/** Free-text generation. */
export function ask(prompt: string, model = 'gemini-2.5-flash') {
  return call([{ text: prompt }], model, false)
}

/** Structured generation. responseMimeType does the JSON enforcement, so no fence-stripping. */
export async function askJson<T>(prompt: string, model = 'gemini-2.5-flash'): Promise<T> {
  return JSON.parse(await call([{ text: prompt }], model, true)) as T
}

/** Voice notes → text. You capture ~3x more when you can just talk for 40 seconds. */
export function transcribe(audio: Buffer, mimeType = 'audio/ogg') {
  return call(
    [
      { text: 'Transcribe this voice note verbatim. Output only the transcript, nothing else.' },
      { inlineData: { mimeType, data: audio.toString('base64') } },
    ],
    'gemini-2.5-flash',
    false,
  )
}
