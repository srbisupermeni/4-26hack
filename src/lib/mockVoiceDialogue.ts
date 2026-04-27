/**
 * Mock STT → agent → reply for the SpatialReal voice button.
 * Replace `resolveMockVoiceReply` with a real model call when ready.
 */

export type VoiceDialogue = {
  /** Phrases to match against the transcript. */
  triggers: string[];
  reply: string;
};

export const MOCK_VOICE_DIALOGUES: VoiceDialogue[] = [
  {
    triggers: ['see that shot', 'did you see that basket', 'that bucket', 'that play'],
    reply: 'I did—that was a highlight-reel moment.',
  },
  {
    triggers: ["who's ahead", "who's leading", 'what is the score', 'score'],
    reply: 'The home side has a slight edge, but plenty of game left.',
  },
  {
    triggers: ['who will win', 'pick a winner', 'your prediction'],
    reply: 'I lean toward whoever has the hotter hand—games turn fast.',
  },
  {
    triggers: ['foul', 'traveling', 'was that a foul'],
    reply: 'From that angle it looked borderline—the officials make the call.',
  },
  {
    triggers: ['three pointer', 'from downtown', 'three point', 'from three'],
    reply: 'The arc is falling—keep stretching the floor like that.',
  },
  {
    triggers: ['defense', 'defensive stop', 'get a stop'],
    reply: 'They need one more rotation and a clean contest next trip.',
  },
  {
    triggers: ['timeout', 'take a timeout', 'call timeout'],
    reply: 'If the run keeps going, I would not be shocked to see a timeout.',
  },
  {
    triggers: ['overtime', 'go to ot', 'extra period'],
    reply: 'This tight? Overtime is absolutely in play.',
  },
  {
    triggers: ['MVP', 'player of the game', 'best player'],
    reply: 'That star is carrying both ends—clear MVP energy tonight.',
  },
  {
    triggers: ['what a game', 'great game', 'incredible game', 'crazy game'],
    reply: 'Exactly—this is the kind of intensity you live for.',
  },
];

function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Map recognized speech to a canned reply. Falls back to a short neutral line.
 */
export function resolveMockVoiceReply(transcript: string): string {
  const t = normalize(transcript);
  if (!t) {
    return MOCK_VOICE_DIALOGUES[0].reply;
  }

  for (const d of MOCK_VOICE_DIALOGUES) {
    for (const phrase of d.triggers) {
      const p = normalize(phrase);
      if (!p) continue;
      if (t.includes(p) || p.includes(t)) {
        return d.reply;
      }
    }
  }

  return "I hear you—let's keep riding this game together.";
}
