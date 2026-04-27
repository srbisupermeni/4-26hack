import {
  AVATAR_VOICE_MAP,
  DEFAULT_SPATIALREAL_AVATAR_ID,
  getVoiceProfileForAvatarId,
  type AvatarVoiceProfile,
} from '../config/avatarVoiceProfiles';

export type CompanionMode = 'sports' | 'british_drama' | 'kids';

export type CompanionPersona = 'analyst' | 'trash_talker' | 'emotional';

export const MODE_STORAGE_KEY = 'vstandby.mode.v2';

export const MODE_LIST: { id: CompanionMode; label: string; subtitle: string }[] = [
  { id: 'sports', label: 'Sports', subtitle: 'Mia' },
  { id: 'british_drama', label: 'Drama', subtitle: 'Shakespeare' },
  { id: 'kids', label: 'Kids', subtitle: 'Little Tommy' },
];

export type ModeTheme = {
  pageBg: string;
  pageOverlay?: string;
  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  accent: string;
  accentText: string;
  surface: string;
  surfaceMuted: string;
  borderColor: string;
  cardClass: string;
  inputClass: string;
  primaryButtonClass: string;
  toggleActiveClass: string;
  toggleIdleClass: string;
  pillClass: string;
  pillActiveClass: string;
  videoLabel: string;
  videoCardSubtitle: string;
  videoEmptyHint: string;
  avatarLabel: string;
  avatarCardSubtitle: string;
  avatarPlaceholderHeading: string;
  avatarPlaceholderBody: string;
  liveBadgeLabel: string;
  delayBadgeLabel: string;
  inputPlaceholder: string;
  connectButtonLabel: string;
};

export type ModeConfig = {
  id: CompanionMode;
  name: string;
  caption: string;
  avatarEnabled: boolean;
  avatarId?: string;
  /** Voice persona pinned to the channel; falls back to avatar map if missing. */
  voiceProfile?: AvatarVoiceProfile;
  /** LLM persona used by /api/subtitles/start, /api/highlights and /api/pipeline/react. */
  persona: CompanionPersona;
  /** Sport label forwarded to backend workers. */
  sport: string;
  theme: ModeTheme;
};

const MIA_AVATAR_ID = 'ca9c5c22-6dba-4b59-ae3b-d26066f8c017';
const TOMMY_AVATAR_ID = '067bf019-4234-479d-9b6a-2021e462bcc2';

export const MODE_CONFIG: Record<CompanionMode, ModeConfig> = {
  sports: {
    id: 'sports',
    name: 'Sports',
    caption: 'Dark / purple UI with Mia as your co-viewing host',
    avatarEnabled: true,
    avatarId: MIA_AVATAR_ID,
    voiceProfile: AVATAR_VOICE_MAP[MIA_AVATAR_ID] ?? getVoiceProfileForAvatarId(MIA_AVATAR_ID),
    persona: 'analyst',
    sport: 'NBA',
    theme: {
      pageBg: 'bg-black',
      pageOverlay: 'before:absolute before:inset-0 before:bg-[radial-gradient(circle_at_50%_-10%,rgba(124,58,237,0.18),transparent_60%)] before:pointer-events-none before:-z-10',
      textPrimary: 'text-white',
      textSecondary: 'text-white/70',
      textMuted: 'text-white/40',
      accent: 'text-brand-purple',
      accentText: 'text-white',
      surface: 'bg-black/60 border-white/10 backdrop-blur-2xl',
      surfaceMuted: 'bg-white/5 border-white/10',
      borderColor: 'border-white/10',
      cardClass: 'bg-black/60 border border-white/10 backdrop-blur-2xl',
      inputClass: 'bg-white/5 border-white/10 text-white placeholder:text-white/35 focus:border-brand-purple',
      primaryButtonClass: 'bg-brand-purple text-white hover:scale-[1.02] active:scale-[0.98]',
      toggleActiveClass: 'bg-brand-purple text-white border-brand-purple shadow-lg shadow-brand-purple/30',
      toggleIdleClass: 'bg-white/5 text-white/60 border-white/10 hover:text-white',
      pillClass: 'bg-white/5 border border-white/10 text-white/70',
      pillActiveClass: 'bg-brand-purple/20 border border-brand-purple/40 text-white',
      videoLabel: 'Your live stream',
      videoCardSubtitle: 'YouTube Live with DVR delay',
      videoEmptyHint: 'Paste a YouTube Live URL to start playback',
      avatarLabel: 'Mia · Sports co-host',
      avatarCardSubtitle: 'Warm female voice · Assistant',
      avatarPlaceholderHeading: 'Mia is loading',
      avatarPlaceholderBody: 'Mia will join you with a warm voice as soon as her avatar finishes loading.',
      liveBadgeLabel: 'Model feed: same-source live edge',
      delayBadgeLabel: 'Your feed: same source, delayed',
      inputPlaceholder: 'Paste a YouTube Live URL, e.g. https://www.youtube.com/watch?v=...',
      connectButtonLabel: 'Connect',
    },
  },
  british_drama: {
    id: 'british_drama',
    name: 'Drama',
    caption: 'Parchment / dark red UI with Shakespeare',
    avatarEnabled: true,
    avatarId: DEFAULT_SPATIALREAL_AVATAR_ID,
    voiceProfile:
      AVATAR_VOICE_MAP[DEFAULT_SPATIALREAL_AVATAR_ID] ??
      getVoiceProfileForAvatarId(DEFAULT_SPATIALREAL_AVATAR_ID),
    persona: 'analyst',
    sport: 'NBA',
    theme: {
      pageBg: 'bg-[#f6efe1]',
      pageOverlay: 'before:absolute before:inset-0 before:bg-[radial-gradient(circle_at_50%_-10%,rgba(120,30,30,0.12),transparent_60%)] before:pointer-events-none before:-z-10',
      textPrimary: 'text-[#2f180c]',
      textSecondary: 'text-[#3f2418]',
      textMuted: 'text-[#7a5a44]',
      accent: 'text-[#7a1f1f]',
      accentText: 'text-[#fdf6e3]',
      surface: 'bg-[#fdf6e3] border border-[#caa86c]',
      surfaceMuted: 'bg-[#f1e4c4] border border-[#caa86c]/60',
      borderColor: 'border-[#caa86c]',
      cardClass: 'bg-[#fdf6e3] border border-[#caa86c] shadow-[0_8px_24px_rgba(120,80,30,0.12)]',
      inputClass: 'bg-white border-[#caa86c] text-[#2f180c] placeholder:text-[#9c7e5b] focus:border-[#7a1f1f]',
      primaryButtonClass: 'bg-[#7a1f1f] text-[#fdf6e3] hover:scale-[1.02] active:scale-[0.98]',
      toggleActiveClass: 'bg-[#7a1f1f] text-[#fdf6e3] border-[#7a1f1f] shadow-md shadow-[#7a1f1f]/30',
      toggleIdleClass: 'bg-[#fdf6e3] text-[#7a5a44] border-[#caa86c] hover:text-[#2f180c]',
      pillClass: 'bg-[#f1e4c4] border border-[#caa86c]/60 text-[#3f2418]',
      pillActiveClass: 'bg-[#7a1f1f]/15 border border-[#7a1f1f]/40 text-[#2f180c]',
      videoLabel: 'The match on stage',
      videoCardSubtitle: 'Same live stream, delayed for the audience',
      videoEmptyHint: 'Place a live URL above to open the stage',
      avatarLabel: 'The Bard',
      avatarCardSubtitle: 'William Shakespeare',
      avatarPlaceholderHeading: 'Taking the stage',
      avatarPlaceholderBody: 'Please wait—Shakespeare will step through the curtain shortly.',
      liveBadgeLabel: 'Narrator feed: live edge',
      delayBadgeLabel: 'Audience feed: delayed picture',
      inputPlaceholder: 'Enter a YouTube Live URL, e.g. https://www.youtube.com/watch?v=...',
      connectButtonLabel: 'Begin',
    },
  },
  kids: {
    id: 'kids',
    name: 'Kids',
    caption: 'Bright / sunny UI with Little Tommy',
    avatarEnabled: true,
    avatarId: TOMMY_AVATAR_ID,
    voiceProfile:
      AVATAR_VOICE_MAP[TOMMY_AVATAR_ID] ?? getVoiceProfileForAvatarId(TOMMY_AVATAR_ID),
    persona: 'emotional',
    sport: 'NBA',
    theme: {
      pageBg: 'bg-[#fff7e6]',
      pageOverlay:
        'before:absolute before:inset-0 before:bg-[radial-gradient(circle_at_50%_-10%,rgba(56,189,248,0.22),transparent_60%)] before:pointer-events-none before:-z-10',
      textPrimary: 'text-[#0f172a]',
      textSecondary: 'text-[#1e293b]',
      textMuted: 'text-[#64748b]',
      accent: 'text-[#f97316]',
      accentText: 'text-white',
      surface: 'bg-white border border-[#fcd34d]',
      surfaceMuted: 'bg-[#fef3c7] border border-[#fcd34d]/60',
      borderColor: 'border-[#fcd34d]',
      cardClass: 'bg-white border border-[#fcd34d] shadow-[0_8px_24px_rgba(249,115,22,0.12)]',
      inputClass:
        'bg-white border-[#fcd34d] text-[#0f172a] placeholder:text-[#94a3b8] focus:border-[#f97316]',
      primaryButtonClass: 'bg-[#f97316] text-white hover:scale-[1.02] active:scale-[0.98]',
      toggleActiveClass:
        'bg-[#f97316] text-white border-[#f97316] shadow-md shadow-[#f97316]/30',
      toggleIdleClass: 'bg-white text-[#64748b] border-[#fcd34d] hover:text-[#0f172a]',
      pillClass: 'bg-[#fef3c7] border border-[#fcd34d]/60 text-[#1e293b]',
      pillActiveClass: 'bg-[#f97316]/15 border border-[#f97316]/40 text-[#0f172a]',
      videoLabel: 'Game for kids',
      videoCardSubtitle: 'Delayed live · watch together',
      videoEmptyHint: 'Paste a live link here so Tommy can cheer with you!',
      avatarLabel: 'Little Tommy',
      avatarCardSubtitle: 'Little Tommy · energetic fan',
      avatarPlaceholderHeading: 'Tommy is ready!',
      avatarPlaceholderBody: 'Hang tight—Tommy is running over to watch with you.',
      liveBadgeLabel: 'Tommy sees: live arena',
      delayBadgeLabel: 'Your screen: slightly behind',
      inputPlaceholder: 'Paste the game URL here, e.g. https://www.youtube.com/watch?v=...',
      connectButtonLabel: 'Watch together',
    },
  },
};

export function loadStoredMode(): CompanionMode {
  if (typeof window === 'undefined') return 'sports';
  const stored = window.localStorage.getItem(MODE_STORAGE_KEY);
  if (stored === 'sports' || stored === 'british_drama' || stored === 'kids') return stored;
  return 'sports';
}

export function persistMode(mode: CompanionMode): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(MODE_STORAGE_KEY, mode);
}
