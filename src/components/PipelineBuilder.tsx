import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Brain, Check, Copy, Cpu, MessageSquare, Save, UserRound, Video } from 'lucide-react';
import { cn } from '../lib/utils';

export const PIPELINE_BUILDER_STORAGE_KEY = 'vstandby.pipeline.builder.symmetric-left.v2';

type PipelineNodeKind = 'source' | 'input' | 'context' | 'output' | 'avatar' | 'preview';

export type PipelineBuilderNode = {
  id: string;
  kind: PipelineNodeKind;
  title: string;
  subtitle: string;
  endpoint: string;
  description: string;
  x: number;
  y: number;
};

type PipelineEdge = {
  from: string;
  to: string;
  label: string;
};

const DEFAULT_NODES: PipelineBuilderNode[] = [
  {
    id: 'model-live-feed',
    kind: 'source',
    title: 'Model live edge',
    subtitle: 'Latest point on the same live source',
    endpoint: 'LIVE_SOURCE_URL @ live edge',
    description:
      'After the user supplies a stream URL or search, the model watches the live edge of that source to detect slow-motion and prepare responses early.',
    x: 190,
    y: 85,
  },
  {
    id: 'user-delay-feed',
    kind: 'source',
    title: 'User delayed feed',
    subtitle: 'Same source, N seconds behind',
    endpoint: 'LIVE_SOURCE_URL @ live edge - N',
    description:
      'The viewer plays the same DVR-capable stream a few seconds behind; if DVR is unavailable, a backend ring buffer simulates delay.',
    x: 600,
    y: 85,
  },
  {
    id: 'subtitle-extract',
    kind: 'input',
    title: 'Subtitle / commentary extract',
    subtitle: 'Text from video first',
    endpoint: 'SUBTITLE_OR_ASR_ENDPOINT',
    description:
      'For file-based input, extract subtitles, commentary, or ASR as text context for the output LLM.',
    x: 300,
    y: 225,
  },
  {
    id: 'slowmo-detector',
    kind: 'input',
    title: 'OpenCV slow-motion detection',
    subtitle: 'Find replay segments on the live feed',
    endpoint: 'OPENCV_SLOWMO_DETECTOR',
    description:
      'On live input, monitor slow-motion replays, cuts, and scoreboard changes as trigger signals.',
    x: 80,
    y: 225,
  },
  {
    id: 'frame-sampler',
    kind: 'context',
    title: '5 fps frame grab',
    subtitle: 'Primary slow-motion input path',
    endpoint: '5 images / second',
    description:
      'After slow-motion starts, sample five images per second. No full video recording—send text + images to the multimodal LLM.',
    x: 80,
    y: 365,
  },
  {
    id: 'multimodal-llm',
    kind: 'output',
    title: 'Output multimodal LLM',
    subtitle: 'Reads text + images',
    endpoint: 'OUTPUT_MULTIMODAL_LLM_URL',
    description: 'The output model reads commentary text and key frames to generate candidate lines for the avatar.',
    x: 190,
    y: 485,
  },
  {
    id: 'prepared-response',
    kind: 'context',
    title: 'Prepared response pool',
    subtitle: 'Speak or stay quiet by preference',
    endpoint: '/api/pipeline/react prepared_response',
    description:
      'Pre-generate lines per slow-motion moment, then choose to speak or stay silent based on user preferences and verbosity.',
    x: 190,
    y: 605,
  },
  {
    id: 'user-voice',
    kind: 'source',
    title: 'User voice input',
    subtitle: 'User talks to the avatar',
    endpoint: 'MIC_INPUT',
    description: 'On speech, run fast STT and decide if the question relates to the current slow-motion window.',
    x: 600,
    y: 205,
  },
  {
    id: 'stt-router',
    kind: 'input',
    title: 'STT + binary router',
    subtitle: 'On-topic fast path, else general LLM',
    endpoint: 'FAST_STT_AND_ROUTER',
    description:
      'Transcribe speech, then route: if on-topic and a prepared line exists, send it to the avatar; otherwise forward to a general model.',
    x: 600,
    y: 325,
  },
  {
    id: 'general-llm',
    kind: 'output',
    title: 'General chat LLM',
    subtitle: 'Off-segment Q&A',
    endpoint: 'GENERAL_CHAT_LLM_URL',
    description: 'Handle questions that are not about the current slow-motion clip with normal companion dialogue.',
    x: 600,
    y: 445,
  },
  {
    id: 'digital-human',
    kind: 'avatar',
    title: 'Digital human output',
    subtitle: 'Voice, face, and timing',
    endpoint: 'DIGITAL_HUMAN_URL',
    description: 'The avatar renders prepared or general LLM text into speech, expression, and on-screen behavior.',
    x: 355,
    y: 665,
  },
];

const EDGES: PipelineEdge[] = [
  { from: 'model-live-feed', to: 'subtitle-extract', label: 'Subtitles' },
  { from: 'model-live-feed', to: 'slowmo-detector', label: 'Vision' },
  { from: 'slowmo-detector', to: 'frame-sampler', label: 'Slow-mo' },
  { from: 'frame-sampler', to: 'multimodal-llm', label: 'Frames' },
  { from: 'subtitle-extract', to: 'multimodal-llm', label: 'Text' },
  { from: 'multimodal-llm', to: 'prepared-response', label: 'Generate' },
  { from: 'prepared-response', to: 'digital-human', label: 'To avatar' },
  { from: 'user-delay-feed', to: 'user-voice', label: 'Viewing' },
  { from: 'user-voice', to: 'stt-router', label: 'Speech' },
  { from: 'stt-router', to: 'prepared-response', label: 'On-topic' },
  { from: 'stt-router', to: 'general-llm', label: 'Off-topic' },
  { from: 'general-llm', to: 'digital-human', label: 'Chat' },
];

const NODE_ICON = {
  source: Video,
  input: Cpu,
  context: Check,
  output: Brain,
  avatar: UserRound,
  preview: MessageSquare,
};

function getNodeCenter(node: PipelineBuilderNode) {
  return {
    x: node.x + 95,
    y: node.y + 56,
  };
}

function loadSavedNodes() {
  if (typeof window === 'undefined') return DEFAULT_NODES;

  try {
    const raw = window.localStorage.getItem(PIPELINE_BUILDER_STORAGE_KEY);
    if (!raw) return DEFAULT_NODES;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.nodes)) return DEFAULT_NODES;
    return DEFAULT_NODES.map(defaultNode => ({
      ...defaultNode,
      ...parsed.nodes.find((node: PipelineBuilderNode) => node.id === defaultNode.id),
    }));
  } catch {
    return DEFAULT_NODES;
  }
}

export function PipelineBuilder() {
  const [nodes, setNodes] = useState<PipelineBuilderNode[]>(loadSavedNodes);
  const [selectedId, setSelectedId] = useState('slowmo-detector');
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const canvasRef = useRef<HTMLDivElement>(null);

  const selectedNode = nodes.find(node => node.id === selectedId) ?? nodes[0];
  const nodeMap = useMemo(() => new Map(nodes.map(node => [node.id, node])), [nodes]);

  useEffect(() => {
    window.localStorage.setItem(PIPELINE_BUILDER_STORAGE_KEY, JSON.stringify({ nodes }));
  }, [nodes]);

  const updateSelectedNode = (patch: Partial<PipelineBuilderNode>) => {
    setNodes(prev => prev.map(node => node.id === selectedId ? { ...node, ...patch } : node));
  };

  const copyConfig = async () => {
    const config = JSON.stringify({ nodes }, null, 2);
    await navigator.clipboard?.writeText(config);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingId || !canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const scaleX = 1000 / rect.width;
    const scaleY = 820 / rect.height;
    const nextX = (event.clientX - rect.left) * scaleX - 95;
    const nextY = (event.clientY - rect.top) * scaleY - 56;

    setNodes(prev => prev.map(node => {
      if (node.id !== draggingId) return node;
      return {
        ...node,
        x: Math.min(790, Math.max(20, nextX)),
        y: Math.min(690, Math.max(20, nextY)),
      };
    }));
  };

  return (
    <div className="glass-dark rounded-[2.5rem] border border-white/10 overflow-hidden shadow-2xl">
      <div className="p-5 border-b border-white/10 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-widest text-brand-purple">Editable flow</p>
          <h3 className="text-2xl font-bold tracking-tight">Pipeline workbench</h3>
          <p className="mt-1 text-sm text-white/45">
            Drag nodes, select cards, and fill placeholder endpoints for input, output, and the digital human before services go live.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={copyConfig}
            className="glass px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-white/10 transition-colors flex items-center gap-2"
          >
            <Copy className="w-4 h-4" />
            {copied ? 'Copied' : 'Copy JSON'}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] min-h-[880px]">
        <div
          ref={canvasRef}
          onPointerMove={onPointerMove}
          onPointerUp={() => setDraggingId(null)}
          onPointerLeave={() => setDraggingId(null)}
          className="relative min-h-[820px] bg-[radial-gradient(circle_at_1px_1px,rgba(255,255,255,0.12)_1px,transparent_0)] [background-size:28px_28px] overflow-hidden"
        >
          <div className="absolute left-[4%] top-5 right-[52%] glass rounded-2xl px-4 py-3 pointer-events-none">
            <p className="text-[10px] font-bold uppercase tracking-widest text-brand-purple">Left: near–zero-latency prep</p>
            <p className="mt-1 text-xs text-white/45">
              Watch the feed ahead of the user, detect slow-motion, sample frames, and pre-generate lines.
            </p>
          </div>
          <div className="absolute left-[52%] top-5 right-[4%] glass rounded-2xl px-4 py-3 pointer-events-none">
            <p className="text-[10px] font-bold uppercase tracking-widest text-brand-purple">Right: live interaction</p>
            <p className="mt-1 text-xs text-white/45">
              The user watches a delayed stream; speech is routed to prepared lines or the general model.
            </p>
          </div>

          <svg className="absolute inset-0 w-full h-full pointer-events-none" viewBox="0 0 1000 820" preserveAspectRatio="none">
            <defs>
              <marker id="pipeline-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M 0 0 L 10 5 L 0 10 z" fill="rgba(124,58,237,0.75)" />
              </marker>
            </defs>
            {EDGES.map(edge => {
              const from = nodeMap.get(edge.from);
              const to = nodeMap.get(edge.to);
              if (!from || !to) return null;
              const start = getNodeCenter(from);
              const end = getNodeCenter(to);
              const midX = (start.x + end.x) / 2;
              const midY = (start.y + end.y) / 2;
              return (
                <g key={`${edge.from}-${edge.to}`}>
                  <path
                    d={`M ${start.x} ${start.y} C ${midX} ${start.y}, ${midX} ${end.y}, ${end.x} ${end.y}`}
                    stroke="rgba(124,58,237,0.65)"
                    strokeWidth="2"
                    fill="none"
                    markerEnd="url(#pipeline-arrow)"
                  />
                  <text x={midX} y={midY - 8} textAnchor="middle" fill="rgba(255,255,255,0.38)" fontSize="12" fontWeight="700">
                    {edge.label}
                  </text>
                </g>
              );
            })}
          </svg>

          {nodes.map(node => {
            const Icon = NODE_ICON[node.kind];
            const isSelected = node.id === selectedId;
            return (
              <button
                key={node.id}
                type="button"
                onPointerDown={(event) => {
                  event.currentTarget.setPointerCapture(event.pointerId);
                  setDraggingId(node.id);
                  setSelectedId(node.id);
                }}
                onClick={() => setSelectedId(node.id)}
                className={cn(
                  "absolute w-[190px] text-left rounded-2xl p-4 cursor-grab active:cursor-grabbing transition-all border shadow-2xl",
                  isSelected
                    ? "bg-brand-purple/20 border-brand-purple shadow-brand-purple/20"
                    : "bg-black/70 border-white/10 hover:border-white/25"
                )}
                style={{
                  left: `${node.x / 10}%`,
                  top: `${node.y / 8.2}%`,
                }}
              >
                <div className="flex items-center gap-3 mb-3">
                  <div className={cn(
                    "w-9 h-9 rounded-xl flex items-center justify-center",
                    isSelected ? "bg-brand-purple text-white" : "bg-white/10 text-brand-purple"
                  )}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-bold text-sm truncate">{node.title}</p>
                    <p className="text-[10px] text-white/35 truncate">{node.subtitle}</p>
                  </div>
                </div>
                <div className="rounded-xl bg-black/30 border border-white/5 px-3 py-2">
                  <p className="text-[10px] font-mono text-white/45 truncate">{node.endpoint}</p>
                </div>
              </button>
            );
          })}
        </div>

        <aside className="border-t lg:border-t-0 lg:border-l border-white/10 p-5 bg-black/35">
          <div className="flex items-center gap-2 mb-5">
            <Save className="w-4 h-4 text-brand-purple" />
            <span className="text-[10px] font-bold uppercase tracking-widest text-white/45">Selected node</span>
          </div>

          <div className="space-y-4">
            <label className="block">
              <span className="text-xs font-bold text-white/45 uppercase tracking-widest">Title</span>
              <input
                value={selectedNode.title}
                onChange={(event) => updateSelectedNode({ title: event.target.value })}
                className="mt-2 w-full rounded-xl bg-white/5 border border-white/10 px-4 py-3 text-sm focus:outline-none focus:border-brand-purple"
              />
            </label>

            <label className="block">
              <span className="text-xs font-bold text-white/45 uppercase tracking-widest">Endpoint / URL</span>
              <input
                value={selectedNode.endpoint}
                onChange={(event) => updateSelectedNode({ endpoint: event.target.value })}
                placeholder="https://model-service.example/run"
                className="mt-2 w-full rounded-xl bg-white/5 border border-white/10 px-4 py-3 text-sm focus:outline-none focus:border-brand-purple"
              />
            </label>

            <label className="block">
              <span className="text-xs font-bold text-white/45 uppercase tracking-widest">Subtitle</span>
              <input
                value={selectedNode.subtitle}
                onChange={(event) => updateSelectedNode({ subtitle: event.target.value })}
                className="mt-2 w-full rounded-xl bg-white/5 border border-white/10 px-4 py-3 text-sm focus:outline-none focus:border-brand-purple"
              />
            </label>

            <label className="block">
              <span className="text-xs font-bold text-white/45 uppercase tracking-widest">Description</span>
              <textarea
                value={selectedNode.description}
                onChange={(event) => updateSelectedNode({ description: event.target.value })}
                rows={5}
                className="mt-2 w-full rounded-xl bg-white/5 border border-white/10 px-4 py-3 text-sm leading-relaxed focus:outline-none focus:border-brand-purple resize-none"
              />
            </label>
          </div>

          <div className="mt-6 rounded-2xl border border-brand-purple/20 bg-brand-purple/10 p-4">
            <p className="text-xs font-bold uppercase tracking-widest text-brand-purple mb-2">Where this plugs in</p>
            <p className="text-sm text-white/65 leading-relaxed">
              Values you enter are saved in the browser for planning. Production traffic still uses{' '}
              <span className="font-mono text-white">/api/pipeline/react</span> with keys and private services on the backend.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
