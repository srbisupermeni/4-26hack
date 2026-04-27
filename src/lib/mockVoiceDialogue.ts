/**
 * Mock STT → agent → reply for the SpatialReal voice button.
 * Replace `resolveMockVoiceReply` with a real model call when ready.
 */

export type VoiceDialogue = {
  /** Phrases to match against the transcript (any language). */
  triggers: string[];
  replyZh: string;
  replyEn: string;
};

export const MOCK_VOICE_DIALOGUES: VoiceDialogue[] = [
  {
    triggers: ['你看到刚才那个进球了吗', '刚才那个进球', '那个进球', 'see that shot', 'did you see that basket', 'that bucket'],
    replyZh: '看到了，真精彩。',
    replyEn: 'I did — that was a highlight reel moment.',
  },
  {
    triggers: ['谁领先', '比分多少', "who's ahead", "who's leading", 'what is the score', 'score'],
    replyZh: '主队稍占上风，不过比赛还长。',
    replyEn: 'The home side has a slight edge, but plenty of game left.',
  },
  {
    triggers: ['你觉得谁会赢', '预测一下', 'who will win', 'pick a winner', 'your prediction'],
    replyZh: '我看好状态更好的那一边，但球场瞬息万变。',
    replyEn: 'I lean toward whoever has the hotter hand — games turn fast.',
  },
  {
    triggers: ['刚才那是犯规吗', '是不是走步了', 'foul', 'traveling', 'was that a foul'],
    replyZh: '回放角度看有点争议，裁判的哨子说了算。',
    replyEn: 'From that angle it looked borderline — the officials make the call.',
  },
  {
    triggers: ['三分球', '三分命中率', 'three pointer', 'from downtown', 'three point'],
    replyZh: '外线手感不错，继续这么投对手会很难受。',
    replyEn: 'The arc is falling — keep stretching the floor like that.',
  },
  {
    triggers: ['防守', '漏人', 'defense', 'defensive stop', 'get a stop'],
    replyZh: '这回合防守轮转再紧一点就好了。',
    replyEn: 'They need one more rotation and a clean contest next trip.',
  },
  {
    triggers: ['暂停', '教练会叫暂停吗', 'timeout', 'take a timeout'],
    replyZh: '势头不对的话，叫个暂停稳一稳很正常。',
    replyEn: 'If the run keeps going, I would not be shocked to see a timeout.',
  },
  {
    triggers: ['加时', '会打加时吗', 'overtime', 'go to ot'],
    replyZh: '分差这么近，加时完全有可能。',
    replyEn: 'This tight? Overtime is absolutely in play.',
  },
  {
    triggers: ['MVP', '最佳球员', 'player of the game'],
    replyZh: '今天这位核心攻防一体，配得上全场焦点。',
    replyEn: 'That star is carrying both ends — clear MVP energy tonight.',
  },
  {
    triggers: ['好累', '精彩的比赛', 'what a game', 'great game', 'incredible game'],
    replyZh: '是啊，这种强度才配得上季后赛气氛。',
    replyEn: 'Exactly — this is the kind of intensity you live for.',
  },
];

const CJK = /[\u4e00-\u9fff]/;

function normalize(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ');
}

function replyForLang(transcript: string, d: VoiceDialogue): string {
  return CJK.test(transcript) ? d.replyZh : d.replyEn;
}

/**
 * Map recognized speech to a canned reply. Falls back to a short neutral line.
 */
export function resolveMockVoiceReply(transcript: string): string {
  const t = normalize(transcript);
  if (!t) {
    const d = MOCK_VOICE_DIALOGUES[0];
    return d.replyZh;
  }

  for (const d of MOCK_VOICE_DIALOGUES) {
    for (const phrase of d.triggers) {
      const p = normalize(phrase);
      if (!p) continue;
      if (t.includes(p) || p.includes(t)) {
        return replyForLang(transcript, d);
      }
    }
  }

  return CJK.test(transcript)
    ? '我听见了，我们接着聊球吧。'
    : "I hear you — let's keep riding this game together.";
}
