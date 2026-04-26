import React, { useRef, useState } from 'react';
import { Send, Volume2, VolumeX, Mic, MicOff } from 'lucide-react';
import { cn } from '../lib/utils';
import type { ChatMessage, PersonaType, PipelineUiState } from '../hooks/useAICompanion';
import { AIAvatarOrb, AvatarVariant } from './AIAvatarOrb';

interface PetChatPanelProps {
  messages: ChatMessage[];
  isTyping: boolean;
  isSpeaking: boolean;
  isVoiceEnabled: boolean;
  setIsVoiceEnabled: (v: boolean) => void;
  stopSpeaking: () => void;
  persona: PersonaType;
  setPersona: (p: PersonaType) => void;
  inputValue: string;
  onInputChange: (v: string) => void;
  onSend: (text: string) => void;
  /** Live audio analyser for lip-sync. */
  analyser: AnalyserNode | null;
  /** 0..1 game excitement, drives the avatar's expression intensity. */
  excitement?: number;
  /** '2d' (default), '3d' (premium VRM), or 'image' (legacy). */
  avatarVariant?: AvatarVariant;
  pipelineState?: PipelineUiState;
}

export function PetChatPanel({
  messages, isTyping, isSpeaking,
  isVoiceEnabled, setIsVoiceEnabled, stopSpeaking,
  persona, setPersona,
  inputValue, onInputChange, onSend,
  analyser,
  excitement = 0,
  avatarVariant = '2d',
  pipelineState,
}: PetChatPanelProps) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);
  const [isListening, setIsListening] = useState(false);
  const [hasSpeechAPI] = useState(() =>
    typeof window !== 'undefined' && ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window)
  );

  const toggleMic = () => {
    if (isListening) {
      recognitionRef.current?.stop();
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SR = ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition) as any;
    const recognition = new SR();
    recognition.lang = 'zh-CN';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => setIsListening(true);

    recognition.onresult = (event) => {
      const transcript = event.results[0][0].transcript;
      onSend(transcript);
    };

    recognition.onerror = () => setIsListening(false);
    recognition.onend = () => setIsListening(false);

    recognitionRef.current = recognition;
    recognition.start();
  };

  const lastAiMessage = [...messages].reverse().find(m => m.role === 'ai');
  const bubbleText = isListening
    ? '在听... 🎤'
    : isTyping
    ? 'Thinking...'
    : lastAiMessage?.content ?? 'Hey! Ready to watch? Ask me anything!';
  const pipelineLabel = pipelineState ? {
    idle: 'Standing by',
    capturing: 'Capturing input',
    understanding: 'Input adapter',
    generating: 'Output model',
    complete: 'Ready',
    error: 'Needs retry',
  }[pipelineState.status] : 'Standing by';

  return (
    <div className="w-full md:w-1/3 flex flex-col bg-black/20">
      {/* Header */}
      <div className="p-4 border-b border-white/5 flex items-center justify-between">
        <h4 className="text-xs font-bold uppercase tracking-widest text-white/60">Companion</h4>
        <div className="flex gap-2">
          {isSpeaking && (
            <button
              onClick={stopSpeaking}
              className="p-2 rounded-lg bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors flex items-center gap-1 animate-pulse"
            >
              <VolumeX className="w-4 h-4" />
              <span className="text-[10px] font-bold uppercase">Stop</span>
            </button>
          )}
          <button
            onClick={() => setIsVoiceEnabled(!isVoiceEnabled)}
            title={isVoiceEnabled ? 'Disable TTS' : 'Enable TTS'}
            className={cn(
              "p-2 rounded-lg transition-colors",
              isVoiceEnabled ? "bg-brand-purple/20 text-brand-purple" : "bg-white/5 text-white/40"
            )}
          >
            {isVoiceEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Pipeline status */}
      {pipelineState && (
        <div className="px-4 py-3 border-b border-white/5 bg-black/30">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[10px] font-bold uppercase tracking-widest text-white/40">Model Pipeline</span>
            <span className={cn(
              "text-[10px] font-bold uppercase tracking-widest",
              pipelineState.status === 'error' ? "text-red-400" :
              pipelineState.status === 'complete' ? "text-emerald-400" :
              pipelineState.status === 'idle' ? "text-white/30" :
              "text-brand-purple"
            )}>
              {pipelineLabel}
            </span>
          </div>
          <p className="line-clamp-2 text-[11px] leading-relaxed text-white/55">
            {pipelineState.input?.summary || 'Waiting for video, chat, or game-state input.'}
          </p>
        </div>
      )}

      {/* Persona selector */}
      <div className="flex bg-black/40 border-b border-white/5 px-2 py-1.5 gap-1">
        <button
          onClick={() => setPersona('analyst')}
          className={cn("px-3 py-1 rounded-lg text-[10px] font-bold transition-colors flex-1 text-center",
            persona === 'analyst' ? "bg-brand-purple/20 text-brand-purple border border-brand-purple/30" : "text-white/40 hover:bg-white/5")}
        >🧠 Analyst</button>
        <button
          onClick={() => setPersona('trash_talker')}
          className={cn("px-3 py-1 rounded-lg text-[10px] font-bold transition-colors flex-1 text-center",
            persona === 'trash_talker' ? "bg-red-500/20 text-red-400 border border-red-500/30" : "text-white/40 hover:bg-white/5")}
        >🎤 Trash</button>
        <button
          onClick={() => setPersona('emotional')}
          className={cn("px-3 py-1 rounded-lg text-[10px] font-bold transition-colors flex-1 text-center",
            persona === 'emotional' ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" : "text-white/40 hover:bg-white/5")}
        >😤 Fan</button>
      </div>

      {/* Avatar + speech bubble */}
      <div className="flex-1 flex flex-col items-center justify-center gap-5 p-6 bg-gradient-to-b from-black/40 to-transparent">
        <div className="max-w-[260px] min-h-12 bg-white/90 backdrop-blur-md rounded-2xl px-4 py-3
                        text-sm text-gray-800 leading-relaxed text-center
                        shadow-[0_4px_20px_rgba(0,0,0,0.2)] border border-white/30">
          {bubbleText}
        </div>

        {/* NBA chibi-lightbulb mascot. Audio-driven mouth, blink, mouse-tracking
            gaze, and excitement-reactive expression all live inside AIAvatarOrb. */}
        <AIAvatarOrb
          isSpeaking={isSpeaking}
          analyser={analyser}
          excitement={excitement}
          persona={persona}
          variant={avatarVariant}
          className="scale-[1.6]"
        />
      </div>

      {/* Input + mic */}
      <div className="p-4 border-t border-white/5">
        <div className="flex gap-2">
          {hasSpeechAPI && (
            <button
              onClick={toggleMic}
              title={isListening ? 'Stop recording' : 'Voice input'}
              className={cn(
                "p-3 rounded-full transition-all",
                isListening
                  ? "bg-red-500 text-white animate-pulse shadow-[0_0_0_4px_rgba(239,68,68,0.3)]"
                  : "bg-white/10 text-white/60 hover:bg-white/20"
              )}
            >
              {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
            </button>
          )}
          <input
            type="text"
            placeholder="Talk to your companion..."
            value={inputValue}
            onChange={(e) => onInputChange(e.target.value)}
            className="flex-1 bg-white/5 border border-white/10 rounded-full py-3 px-4 text-xs
                       focus:outline-none focus:border-brand-purple transition-colors"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && inputValue.trim() && !e.nativeEvent.isComposing) {
                e.preventDefault();
                onSend(inputValue.trim());
              }
            }}
          />
          <button
            disabled={!inputValue.trim()}
            onClick={() => { if (inputValue.trim()) onSend(inputValue.trim()); }}
            type="button"
            className="p-3 rounded-full bg-brand-purple text-white hover:scale-105 transition-transform disabled:opacity-50 disabled:scale-100"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
