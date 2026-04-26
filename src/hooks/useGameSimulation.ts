import { useState, useEffect, useRef } from 'react';

export type GameContext = {
  teams: string;
  score: string;
  clock: string;
  lastPlay: string;
  excitement: number;
  isReplay?: boolean;
  videoUrl?: string;
};

export type PlayByPlayEvent = {
  clock: string;
  quarter: string;
  score: string;
  desc: string;
  isHighlight: boolean;
};

export function useGameSimulation(activeSport: string = 'NBA') {
  const [mode, setMode] = useState<'live' | 'historical'>('live');
  const [historicalGameMeta, setHistoricalGameMeta] = useState<any>(null);
  
  const [gameContext, setGameContext] = useState<GameContext>({
    teams: "Connecting...",
    score: "0 - 0",
    clock: "00:00",
    lastPlay: "Establishing connection...",
    excitement: 0.5,
    isReplay: false,
  });

  // Historical state
  const [timeline, setTimeline] = useState<PlayByPlayEvent[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1); // 1x, 2x, 5x
  
  const timelineRef = useRef(timeline);
  const indexRef = useRef(currentIndex);
  timelineRef.current = timeline;
  indexRef.current = currentIndex;

  const loadHistoricalGame = async (gameId: string, meta: any) => {
    try {
      const res = await fetch(`/api/games/historical/${gameId}/playbyplay`);
      if (!res.ok) throw new Error("Failed to load timeline");
      const data = await res.json();
      if (data.plays && data.plays.length > 0) {
        setTimeline(data.plays);
        setHistoricalGameMeta(meta);
        setCurrentIndex(0);
        setMode('historical');
        setIsPlaying(true);
        
        const firstPlay = data.plays[0];
        setGameContext({
          teams: meta.title.split(":")[1]?.trim() || meta.title,
          score: firstPlay.score,
          clock: `${firstPlay.clock} ${firstPlay.quarter}`,
          lastPlay: firstPlay.desc,
          excitement: firstPlay.isHighlight ? 0.9 : 0.4,
          isReplay: true
        });
      }
    } catch (e) {
      console.error(e);
    }
  };

  const loadLiveGame = () => {
    setMode('live');
    setIsPlaying(false);
    setGameContext(prev => ({ ...prev, isReplay: false, lastPlay: "Connecting to Live Server..." }));
  };

  const updateFromTimelineEntry = (index: number) => {
    const play = timelineRef.current[index];
    if (!play) return;
    setGameContext({
      teams: historicalGameMeta?.title.split(":")[1]?.trim() || "Historical Game",
      score: play.score,
      clock: `${play.clock} ${play.quarter}`,
      lastPlay: play.desc,
      excitement: play.isHighlight ? 0.9 : 0.4,
      isReplay: true
    });
    setCurrentIndex(index);
  };

  const scrubTo = (index: number) => {
    const safeIndex = Math.max(0, Math.min(index, timelineRef.current.length - 1));
    updateFromTimelineEntry(safeIndex);
  };

  // Historical mode playback tick loop
  useEffect(() => {
    if (mode !== 'historical' || !isPlaying || timeline.length === 0) return;
    
    // 6 seconds per event at 1x — with ~90 events per game that's ~9 minutes. Higher speeds scale down.
    const tickMs = 6000 / playbackSpeed;
    
    const intervalId = setInterval(() => {
      const nextIndex = indexRef.current + 1;
      if (nextIndex >= timelineRef.current.length) {
        setIsPlaying(false); // Paused at end
      } else {
        updateFromTimelineEntry(nextIndex);
      }
    }, tickMs);
    
    return () => clearInterval(intervalId);
  }, [mode, isPlaying, playbackSpeed, timeline.length]);

  // Live WebSocket mode
  useEffect(() => {
    if (mode !== 'live') return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/api/ws/${activeSport.toLowerCase()}`;
    
    let ws: WebSocket;
    let reconnectTimeout: ReturnType<typeof setTimeout>;

    const connectWebSocket = () => {
      ws = new WebSocket(wsUrl);

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          setGameContext(data);
        } catch (e) {
          console.error("Ws parse err:", e);
        }
      };

      ws.onclose = () => {
        reconnectTimeout = setTimeout(connectWebSocket, 3000);
      };
      
      ws.onerror = (err) => {
        ws.close();
      };
    };

    connectWebSocket();

    return () => {
      clearTimeout(reconnectTimeout);
      if (ws) {
        ws.onclose = null;
        ws.close();
      }
    };
  }, [mode, activeSport]);

  return {
    gameContext,
    mode,
    loadHistoricalGame,
    loadLiveGame,
    playback: {
      isPlaying,
      setIsPlaying,
      playbackSpeed,
      setPlaybackSpeed,
      currentIndex,
      scrubTo,
      timeline,
      meta: historicalGameMeta
    }
  };
}
