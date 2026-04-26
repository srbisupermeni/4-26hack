import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Brain, Check, Copy, Cpu, MessageSquare, Save, UserRound, Video } from 'lucide-react';
import { cn } from '../lib/utils';

export const PIPELINE_BUILDER_STORAGE_KEY = 'vstandby.pipeline.builder.zh.symmetric-left.v1';

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
    title: '模型 Live Edge',
    subtitle: '同源直播的最新实时点',
    endpoint: 'LIVE_SOURCE_URL @ live edge',
    description: '用户给直播链接或搜索比赛后，模型端观看同一直播源的最新 live edge，提前检测慢动作和准备回复。',
    x: 190,
    y: 85,
  },
  {
    id: 'user-delay-feed',
    kind: 'source',
    title: '用户延迟流',
    subtitle: '同源直播延迟 N 秒播放',
    endpoint: 'LIVE_SOURCE_URL @ live edge - N',
    description: '用户端播放同一 DVR 直播源延迟几秒后的位置；如果源不支持 DVR，再用后端 ring buffer 制造延迟。',
    x: 600,
    y: 85,
  },
  {
    id: 'subtitle-extract',
    kind: 'input',
    title: '字幕/解说提取',
    subtitle: '视频文件先提取文字信息',
    endpoint: 'SUBTITLE_OR_ASR_ENDPOINT',
    description: '如果输入是普通视频，优先提取字幕、解说或音轨转写，作为给输出端 LLM 的文字上下文。',
    x: 300,
    y: 225,
  },
  {
    id: 'slowmo-detector',
    kind: 'input',
    title: 'OpenCV慢动作检测',
    subtitle: '直播中发现回放片段',
    endpoint: 'OPENCV_SLOWMO_DETECTOR',
    description: '如果输入是直播，OpenCV 持续监测慢动作回放、镜头切换、比分牌变化等触发信号。',
    x: 80,
    y: 225,
  },
  {
    id: 'frame-sampler',
    kind: 'context',
    title: '5fps截图',
    subtitle: '唯一慢动作输入路径',
    endpoint: '5 images / second',
    description: '慢动作开始后每秒截取 5 张图片。我们不录整段视频，直接用字幕/解说文本 + 图片组交给输出端多模态 LLM。',
    x: 80,
    y: 365,
  },
  {
    id: 'multimodal-llm',
    kind: 'output',
    title: '输出端多模态LLM',
    subtitle: '读文字 + 图片',
    endpoint: 'OUTPUT_MULTIMODAL_LLM_URL',
    description: '输出端 LLM 读取字幕/解说文字和关键帧图片，生成数字人可说的候选回复。',
    x: 190,
    y: 485,
  },
  {
    id: 'prepared-response',
    kind: 'context',
    title: '预生成话术池',
    subtitle: '按偏好决定要不要说',
    endpoint: '/api/pipeline/react prepared_response',
    description: '每个慢动作出现时先准备好要说的话，再根据用户偏好、话多话少、球员喜好选择自主输出或保持安静。',
    x: 190,
    y: 605,
  },
  {
    id: 'user-voice',
    kind: 'source',
    title: '用户语音输入',
    subtitle: '用户主动和数字人说话',
    endpoint: 'MIC_INPUT',
    description: '当用户开口时，系统需要快速语音转文字，并判断问题是否和当前慢动作片段相关。',
    x: 600,
    y: 205,
  },
  {
    id: 'stt-router',
    kind: 'input',
    title: 'STT + 二分判断',
    subtitle: '相关就秒回，不相关转大模型',
    endpoint: 'FAST_STT_AND_ROUTER',
    description: '先做语音转文字，再判断：如果和当前慢动作相关且已有预生成回复，直接发给数字人；如果无关，转给通用大模型处理。',
    x: 600,
    y: 325,
  },
  {
    id: 'general-llm',
    kind: 'output',
    title: '通用对话LLM',
    subtitle: '处理非片段相关问题',
    endpoint: 'GENERAL_CHAT_LLM_URL',
    description: '当用户问题和当前慢动作无关时，转入通用大模型，生成普通陪伴对话。',
    x: 600,
    y: 445,
  },
  {
    id: 'digital-human',
    kind: 'avatar',
    title: '数字人输出',
    subtitle: '像真人一样及时回应',
    endpoint: 'DIGITAL_HUMAN_URL',
    description: '数字人拿到预生成回复或通用对话回复后，输出语音、表情、动作和屏幕互动。',
    x: 355,
    y: 665,
  },
];

const EDGES: PipelineEdge[] = [
  { from: 'model-live-feed', to: 'subtitle-extract', label: '字幕/解说' },
  { from: 'model-live-feed', to: 'slowmo-detector', label: '画面检测' },
  { from: 'slowmo-detector', to: 'frame-sampler', label: '慢动作触发' },
  { from: 'frame-sampler', to: 'multimodal-llm', label: '截图组' },
  { from: 'subtitle-extract', to: 'multimodal-llm', label: '文字上下文' },
  { from: 'multimodal-llm', to: 'prepared-response', label: '提前生成' },
  { from: 'prepared-response', to: 'digital-human', label: '输出给数字人' },
  { from: 'user-delay-feed', to: 'user-voice', label: '用户观看' },
  { from: 'user-voice', to: 'stt-router', label: '语音输入' },
  { from: 'stt-router', to: 'prepared-response', label: '相关：取左侧预生成' },
  { from: 'stt-router', to: 'general-llm', label: '不相关：转大模型' },
  { from: 'general-llm', to: 'digital-human', label: '普通对话' },
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
          <p className="text-[10px] font-bold uppercase tracking-widest text-brand-purple">可编辑流程图</p>
          <h3 className="text-2xl font-bold tracking-tight">模型串联工作台</h3>
          <p className="mt-1 text-sm text-white/45">
            拖拽节点、选择卡片，并在真实服务准备好前先填入输入模型、输出模型和数字人接口。
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={copyConfig}
            className="glass px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-widest hover:bg-white/10 transition-colors flex items-center gap-2"
          >
            <Copy className="w-4 h-4" />
            {copied ? '已复制' : '复制 JSON'}
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
            <p className="text-[10px] font-bold uppercase tracking-widest text-brand-purple">左线：伪零延迟准备</p>
            <p className="mt-1 text-xs text-white/45">按时间顺序提前看直播、检测慢动作、截图、生成候选话术。</p>
          </div>
          <div className="absolute left-[52%] top-5 right-[4%] glass rounded-2xl px-4 py-3 pointer-events-none">
            <p className="text-[10px] font-bold uppercase tracking-widest text-brand-purple">右线：用户实时互动</p>
            <p className="mt-1 text-xs text-white/45">用户看延迟直播；开口后先判断是否能走预生成快路径。</p>
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
            <span className="text-[10px] font-bold uppercase tracking-widest text-white/45">当前节点</span>
          </div>

          <div className="space-y-4">
            <label className="block">
              <span className="text-xs font-bold text-white/45 uppercase tracking-widest">节点标题</span>
              <input
                value={selectedNode.title}
                onChange={(event) => updateSelectedNode({ title: event.target.value })}
                className="mt-2 w-full rounded-xl bg-white/5 border border-white/10 px-4 py-3 text-sm focus:outline-none focus:border-brand-purple"
              />
            </label>

            <label className="block">
              <span className="text-xs font-bold text-white/45 uppercase tracking-widest">接口 / 链接</span>
              <input
                value={selectedNode.endpoint}
                onChange={(event) => updateSelectedNode({ endpoint: event.target.value })}
                placeholder="https://model-service.example/run"
                className="mt-2 w-full rounded-xl bg-white/5 border border-white/10 px-4 py-3 text-sm focus:outline-none focus:border-brand-purple"
              />
            </label>

            <label className="block">
              <span className="text-xs font-bold text-white/45 uppercase tracking-widest">短说明</span>
              <input
                value={selectedNode.subtitle}
                onChange={(event) => updateSelectedNode({ subtitle: event.target.value })}
                className="mt-2 w-full rounded-xl bg-white/5 border border-white/10 px-4 py-3 text-sm focus:outline-none focus:border-brand-purple"
              />
            </label>

            <label className="block">
              <span className="text-xs font-bold text-white/45 uppercase tracking-widest">备注</span>
              <textarea
                value={selectedNode.description}
                onChange={(event) => updateSelectedNode({ description: event.target.value })}
                rows={5}
                className="mt-2 w-full rounded-xl bg-white/5 border border-white/10 px-4 py-3 text-sm leading-relaxed focus:outline-none focus:border-brand-purple resize-none"
              />
            </label>
          </div>

          <div className="mt-6 rounded-2xl border border-brand-purple/20 bg-brand-purple/10 p-4">
            <p className="text-xs font-bold uppercase tracking-widest text-brand-purple mb-2">实际接入位置</p>
            <p className="text-sm text-white/65 leading-relaxed">
              这里填写的输入、输出和数字人链接会先保存在本机浏览器，用于团队规划。真正上线时仍然通过
              <span className="font-mono text-white"> /api/pipeline/react</span> 接入，密钥和私有服务放在后端。
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
