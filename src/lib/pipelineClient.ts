import type { GameContext } from '../hooks/useGameSimulation';

export type PipelineTriggerReason =
  | 'user_message'
  | 'visual_event'
  | 'score_change'
  | 'idle_break';

export type PipelineStatus = 'idle' | 'capturing' | 'understanding' | 'generating' | 'complete' | 'error';

export type PipelineInputResult = {
  source: 'text' | 'vision' | 'scoreboard' | 'hybrid';
  eventType: string;
  summary: string;
  confidence: number;
  tags: string[];
  signals: string[];
};

export type PipelineOutputResult = {
  text: string;
  model: string;
  shouldSpeak: boolean;
};

export type PipelineResponse = {
  status: 'complete';
  input: PipelineInputResult;
  output: PipelineOutputResult;
};

export type PipelineRequest = {
  triggerReason: PipelineTriggerReason;
  userMessage?: string;
  activeSport: string;
  persona: string;
  gameContext: GameContext;
  chatHistory: Array<{ role: string; content: string }>;
  frames?: string[];
};

export async function requestPipelineReaction(payload: PipelineRequest): Promise<PipelineResponse> {
  const response = await fetch('/api/pipeline/react', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(errorText || `Pipeline request failed with ${response.status}`);
  }

  return response.json();
}
