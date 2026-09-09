import { db } from '@/lib/db'
import { styleReferences } from '@/lib/db/schema'
import { and, eq } from 'drizzle-orm'
import { askJson } from '@/lib/ai'

// Two independent things, extracted separately because they do different jobs.
//
//   POSITIONING — what subjects these people cover, at what depth, what they
//                 deliberately ignore. Shapes which topic gets picked.
//   CRAFT       — hooks, length, rhythm, how they close. Shapes execution.
//
// A rubric transfers style far more reliably than dumping 20 example posts into
// context, and it is inspectable: when a draft sounds off you can go look at
// which rule is wrong.

const CRAFT_PROMPT = `Analyse these posts and extract a precise WRITING CRAFT rubric.
Describe only HOW they write, not what they write about.

Return JSON exactly:
{
  "tone": "5-8 words",
  "avgWordCount": 180,
  "hookType": "concrete_problem_statement | bold_claim | question | story | data_point | observation",
  "exampleHook": "one opening line in their exact voice",
  "sentenceLength": "short | medium | long | mixed",
  "structurePattern": "one sentence describing how a post is laid out",
  "usesLists": "never | rarely | often",
  "usesEmojis": false,
  "opensWithQuestion": false,
  "personalDisclosure": "high | medium | low",
  "technicalDepth": "code-level | conceptual | surface",
  "endsWith": "how they close, max 8 words",
  "signaturePhrases": ["patterns they reuse"],
  "forbidden": ["cliches and moves this writer never makes"],
  "styleSummary": "2 sentences on their writing identity"
}`

const POSITIONING_PROMPT = `Analyse these posts and extract a POSITIONING rubric.
Describe only WHAT they choose to talk about and how they are perceived — ignore writing mechanics.

Return JSON exactly:
{
  "coreSubjects": ["the 3-6 subjects they own"],
  "depth": "beginner | practitioner | expert | researcher",
  "perspective": "one sentence on the angle they take on their field",
  "deliberatelyIgnores": ["topics conspicuously absent"],
  "credibilitySignals": ["how they demonstrate they know things"],
  "audience": "who they are clearly writing for",
  "postureSummary": "2 sentences on the professional identity these posts build"
}`

/** Extract the rubric for every pending reference belonging to a user. */
export async function extractPendingDna(userId: string) {
  const pending = await db
    .select()
    .from(styleReferences)
    .where(and(eq(styleReferences.userId, userId), eq(styleReferences.dnaStatus, 'pending')))

  for (const ref of pending) {
    try {
      await db.update(styleReferences).set({ dnaStatus: 'processing' })
        .where(eq(styleReferences.id, ref.id))

      const posts = (ref.pastedPosts as string[]) ?? []
      const body = posts.map((p, i) => `Post ${i + 1}:\n${p}`).join('\n\n---\n\n')
      const instruction = ref.kind === 'positioning' ? POSITIONING_PROMPT : CRAFT_PROMPT

      const styleDna = await askJson(`${instruction}\n\nPosts to analyse:\n${body}`)

      await db.update(styleReferences)
        .set({ styleDna, dnaStatus: 'done', updatedAt: new Date() })
        .where(eq(styleReferences.id, ref.id))
    } catch (err) {
      console.error(`DNA extraction failed for ${ref.id}:`, err)
      await db.update(styleReferences)
        .set({ dnaStatus: 'failed', updatedAt: new Date() })
        .where(eq(styleReferences.id, ref.id))
    }
  }
  return pending.length
}

/** Collapse every finished rubric into one prompt block for generation. */
export async function styleBrief(userId: string) {
  const refs = await db
    .select()
    .from(styleReferences)
    .where(and(eq(styleReferences.userId, userId), eq(styleReferences.dnaStatus, 'done')))

  const craft = refs.filter(r => r.kind !== 'positioning')
  const positioning = refs.filter(r => r.kind === 'positioning')
  const render = (rs: typeof refs) =>
    rs.map(r => `${r.sourceLabel}: ${JSON.stringify(r.styleDna)}`).join('\n')

  return {
    hasStyle: craft.length > 0,
    text: [
      craft.length ? `WRITING CRAFT RULES (obey these):\n${render(craft)}` : '',
      positioning.length ? `POSITIONING (what a person like this talks about):\n${render(positioning)}` : '',
    ].filter(Boolean).join('\n\n'),
  }
}
