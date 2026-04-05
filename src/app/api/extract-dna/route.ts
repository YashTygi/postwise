import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { styleReferences } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { VertexAI } from '@google-cloud/vertexai'

// Initialize Vertex AI with your project details
const vertexAI = new VertexAI({
  project: process.env.GOOGLE_CLOUD_PROJECT_ID,
  location: process.env.GOOGLE_CLOUD_LOCATION,
})

// Instantiate the Gemini model
const generativeModel = vertexAI.getGenerativeModel({
  model: 'gemini-1.5-pro',
})

export async function POST(req: Request) {
  const { userId } = await req.json()
  if (!userId) return NextResponse.json({ error: 'missing userId' }, { status: 400 })

  // Find all pending style references for this user
  const pending = await db.query.styleReferences.findMany({
    where: (s, { eq, and }) => and(eq(s.userId, userId), eq(s.dnaStatus, 'pending')),
  })

  for (const ref of pending) {
    try {
      // Mark as processing
      await db
        .update(styleReferences)
        .set({ dnaStatus: 'processing' })
        .where(eq(styleReferences.id, ref.id))

      const posts = ref.pastedPosts as string[]
      const postsText = posts
        .map((p, i) => `Post ${i + 1}:\n${p}`)
        .join('\n\n---\n\n')

      const prompt = `Analyze these LinkedIn posts and extract a precise writing style profile.
Return ONLY valid JSON — no markdown, no backticks, no preamble.

{
  "tone": "describe the overall tone in 5-8 words",
  "sentenceLength": "short | medium | long | mixed",
  "hookPattern": "how posts typically open: bold claim | question | story | data point | observation",
  "structurePattern": "describe their post structure in 1 sentence",
  "vocabularyLevel": "simple | technical | mixed",
  "personalDisclosure": "high | medium | low",
  "usesLists": true,
  "usesEmojis": false,
  "ctaStyle": "how they end posts in 5 words",
  "avgWordCount": 180,
  "signaturePhrases": ["phrases or patterns they reuse"],
  "thingsToAvoid": ["things this writer never does"],
  "exampleHook": "one example opening line in their exact style",
  "styleSummary": "2 sentence description of their writing identity"
}

Posts to analyze:
${postsText}`

      // Generate content using the Vertex AI SDK
      const result = await generativeModel.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
      })

      const response = await result.response
      const rawText = response.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
      
      // Clean and parse JSON response
      const clean = rawText.replace(/```json|```/g, '').trim()
      const styleDna = JSON.parse(clean)

      await db
        .update(styleReferences)
        .set({ styleDna, dnaStatus: 'done', updatedAt: new Date() })
        .where(eq(styleReferences.id, ref.id))

    } catch (err) {
      console.error(`DNA extraction failed for ref ${ref.id}:`, err)
      await db
        .update(styleReferences)
        .set({ dnaStatus: 'failed', updatedAt: new Date() })
        .where(eq(styleReferences.id, ref.id))
    }
  }

  return NextResponse.json({ ok: true })
}