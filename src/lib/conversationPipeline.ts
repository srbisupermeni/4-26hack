export type ConversationTurn = {
  role: 'user' | 'assistant';
  text: string;
  timestamp: number;
};

export type LLMAvatarContext = {
  avatarId?: string;
  voiceStyle?: string;
};

/**
 * Future: replace mock pipeline with LLM + RAG.
 * TODO: CONNECT TO LLM HERE (OpenAI / Claude / etc.)
 *
 * Expected input: full conversation array (chronological).
 * Expected output: assistant reply string.
 *
 * TODO: Inject persona into LLM prompt (use `avatarContext` from AVATAR_VOICE_MAP / selector):
 * - Shakespeare (british_male): Shakespearean English, formal, calm stage diction.
 * - Mia (female_soft): friendly assistant, concise, warm professional tone.
 * - Little Tommy (child_energetic): playful, simple vocabulary, short sentences.
 */
export async function generateAIResponse(
  conversation: ConversationTurn[],
  _avatarContext?: LLMAvatarContext,
): Promise<string> {
  void conversation;
  void _avatarContext;
  return 'The Lakers are gaining momentum...';
}
