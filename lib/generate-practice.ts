import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic()

export interface PracticeCard {
  type: 'example-sentence' | 'fill-blank' | 'transformation'
  front: string
  back: string
  notes?: string
}

export async function generatePractice(
  cards: { front: string; back: string; type: string }[]
): Promise<PracticeCard[]> {
  const message = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    system: 'You are a Korean language tutor creating practice exercises.',
    messages: [
      {
        role: 'user',
        content: `Here are Korean study cards the student is reviewing today:
${JSON.stringify(cards, null, 2)}

Generate additional practice material:
1. 2-3 example sentences using the vocabulary in natural Korean contexts (with English translations)
2. 1-2 fill-in-the-blank sentences where the student must supply the Korean word
3. If grammar patterns are included, 1-2 transformation exercises (e.g., "Convert to past tense: ...")

Return a JSON array where each object has:
- "type": "example-sentence" | "fill-blank" | "transformation"
- "front": the question/prompt (Korean or instruction)
- "back": the answer (Korean + English)
- "notes": brief explanation of why this is good practice

Return ONLY the JSON array. No markdown fences, no explanation.`,
      },
    ],
  })

  const content = message.content[0]
  if (content.type !== 'text') throw new Error('Unexpected response type from Claude')

  const text = content.text.trim()
  const jsonMatch = text.match(/\[[\s\S]*\]/)
  if (!jsonMatch) throw new Error('No JSON array found in response')
  return JSON.parse(jsonMatch[0]) as PracticeCard[]
}
