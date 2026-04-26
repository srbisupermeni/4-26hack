import React from 'react';

export default function VideoPlayer() {
  return (
    <div className="w-full h-full glass-dark rounded-3xl p-4 flex flex-col gap-4 relative overflow-hidden border border-white/10 shadow-2xl">
      <div className="flex items-center justify-between px-2">
        <div className="flex items-center gap-3">
          <div className="w-3 h-3 rounded-full bg-red-500 animate-pulse shadow-[0_0_10px_rgba(239,68,68,0.8)]" />
          <span className="text-sm font-bold tracking-widest uppercase text-white/90">Live Game</span>
        </div>
      </div>
      <div className="flex-1 w-full rounded-2xl overflow-hidden relative group">
        <div className="absolute inset-0 bg-brand-purple/5 opacity-0 group-hover:opacity-100 transition-opacity z-10 pointer-events-none" />
        <iframe
          width="100%"
          height="100%"
          src="https://www.youtube.com/embed/dQw4w9WgXcQ?autoplay=1&mute=1"
          title="Live Game"
          allow="autoplay; encrypted-media"
          allowFullScreen
        />
      </div>
    </div>
  );
}
