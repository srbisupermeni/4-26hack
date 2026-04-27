export type CompanionMode = 'sports' | 'british_drama';

export const MODE_STORAGE_KEY = 'vstandby.mode.v1';

export const MODE_LIST: { id: CompanionMode; label: string; subtitle: string }[] = [
  { id: 'sports', label: '体育模式', subtitle: 'Sports' },
  { id: 'british_drama', label: '英国戏剧模式', subtitle: 'British Drama' },
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
  theme: ModeTheme;
};

export const MODE_CONFIG: Record<CompanionMode, ModeConfig> = {
  sports: {
    id: 'sports',
    name: '体育模式',
    caption: '深色 / 紫色 UI，AI 形象后续接入',
    avatarEnabled: false,
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
      videoLabel: '用户看到的比赛',
      videoCardSubtitle: 'YouTube Live DVR 延迟播放',
      videoEmptyHint: '粘贴 YouTube Live 链接后开始播放',
      avatarLabel: '数字人陪伴',
      avatarCardSubtitle: '体育模式 · 形象待接入',
      avatarPlaceholderHeading: '数字人形象待接入',
      avatarPlaceholderBody: '体育模式默认不加载数字人。后续接入运动员/解说员形象后会在这里出现。',
      liveBadgeLabel: '模型端：同源 live edge',
      delayBadgeLabel: '用户端：同源延迟',
      inputPlaceholder: '粘贴 YouTube Live 链接，例如 https://www.youtube.com/watch?v=...',
      connectButtonLabel: '接入直播',
    },
  },
  british_drama: {
    id: 'british_drama',
    name: '英国戏剧模式',
    caption: '羊皮纸 / 暗红 UI，数字人是莎士比亚',
    avatarEnabled: true,
    avatarId: '2fc89f70-5060-4963-a2d7-4da4cab73c54',
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
      videoLabel: '舞台上的赛事',
      videoCardSubtitle: '同一直播延迟播放，台下吟者已先观之',
      videoEmptyHint: '请将直播链接置入上方，方可于此舞台开演',
      avatarLabel: '吟游诗人',
      avatarCardSubtitle: 'William Shakespeare',
      avatarPlaceholderHeading: '诗人正在登台',
      avatarPlaceholderBody: '请稍候，待吾等莎士比亚自帷幕之后入场。',
      liveBadgeLabel: '幕后吟者：直播实时之源',
      delayBadgeLabel: '台前观众：延迟之像',
      inputPlaceholder: '请输入 YouTube Live 链接，譬如 https://www.youtube.com/watch?v=...',
      connectButtonLabel: '开演',
    },
  },
};

export function loadStoredMode(): CompanionMode {
  if (typeof window === 'undefined') return 'sports';
  const stored = window.localStorage.getItem(MODE_STORAGE_KEY);
  if (stored === 'sports' || stored === 'british_drama') return stored;
  return 'sports';
}

export function persistMode(mode: CompanionMode): void {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(MODE_STORAGE_KEY, mode);
}
