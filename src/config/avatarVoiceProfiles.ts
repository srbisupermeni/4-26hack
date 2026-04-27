/**
 * Single source of truth: SpatialReal avatar id → voice persona (for TTS / LLM alignment).
 * Actual OpenAI voice selection stays server-side; frontend uses this map for UI + TODO hooks.
 */

export const DEFAULT_SPATIALREAL_AVATAR_ID = '2fc89f70-5060-4963-a2d7-4da4cab73c54';

export type AvatarVoiceProfile = {
  label: string;
  /** Stable token for future TTS / prompt routing (not sent to SDK send()). */
  style: 'british_male' | 'female_soft' | 'child_energetic';
};

/** Keys must match `avatarId` from SpatialReal / selector. */
export const AVATAR_VOICE_MAP: Record<string, AvatarVoiceProfile> = {
  [DEFAULT_SPATIALREAL_AVATAR_ID]: {
    label: 'British Male · mature · calm',
    style: 'british_male',
  },
  'ca9c5c22-6dba-4b59-ae3b-d26066f8c017': {
    label: 'Female Assistant · soft',
    style: 'female_soft',
  },
  '067bf019-4234-479d-9b6a-2021e462bcc2': {
    label: 'Child Voice · energetic',
    style: 'child_energetic',
  },
};

export const AVATAR_SELECTOR_OPTIONS = [
  { id: DEFAULT_SPATIALREAL_AVATAR_ID, label: 'Shakespeare' },
  { id: 'ca9c5c22-6dba-4b59-ae3b-d26066f8c017', label: 'Mia' },
  { id: '067bf019-4234-479d-9b6a-2021e462bcc2', label: 'Little Tommy' },
] as const;

export function getVoiceProfileForAvatarId(avatarId: string): AvatarVoiceProfile {
  return AVATAR_VOICE_MAP[avatarId] ?? AVATAR_VOICE_MAP[DEFAULT_SPATIALREAL_AVATAR_ID];
}
