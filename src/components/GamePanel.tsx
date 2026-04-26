import React from 'react';
import { GameContext } from '../hooks/useGameSimulation';

interface GamePanelProps {
  gameState: GameContext;
}

export default function GamePanel({ gameState }: GamePanelProps) {
  const [homeTeam, awayTeam] = gameState.teams.split(" vs ");
  const [homeScore, awayScore] = gameState.score.split(" - ");
  const [clock, quarter] = gameState.clock.split(" ");

  return (
    <div className="glass p-6 rounded-3xl flex flex-col items-center justify-center relative overflow-hidden h-full">
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-brand-purple via-brand-blue to-brand-purple opacity-50" />
      
      <div className="text-center mb-6">
        <span className="text-xs font-bold uppercase tracking-[0.2em] text-white/50">
          {quarter} • {clock}
        </span>
      </div>

      <div className="flex items-center justify-between w-full px-4 md:px-8">
        <div className="flex flex-col items-center gap-2">
          <div className="text-4xl md:text-5xl font-black tracking-tighter text-white">
            {homeScore}
          </div>
          <span className="text-sm font-bold text-white/70 tracking-widest">{homeTeam?.toUpperCase()}</span>
        </div>

        <div className="text-white/20 text-2xl font-light">vs</div>

        <div className="flex flex-col items-center gap-2">
          <div className="text-4xl md:text-5xl font-black tracking-tighter text-white">
            {awayScore}
          </div>
          <span className="text-sm font-bold text-white/70 tracking-widest">{awayTeam?.toUpperCase()}</span>
        </div>
      </div>
    </div>
  );
}
