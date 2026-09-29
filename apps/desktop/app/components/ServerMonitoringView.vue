<template>
  <div class="h-screen w-screen bg-[#07090e] text-slate-100 font-sans flex flex-col select-none overflow-hidden box-border">
    <!-- Tab Bar -->
    <div class="flex items-center gap-1 px-2.5 pt-2 pb-1.5 shrink-0 border-b border-[#1a2130]">
      <button
        @click="activeTab = 'metrics'"
        :class="[
          'px-3 py-1 rounded-t-md text-[11px] font-semibold transition flex items-center gap-1.5',
          activeTab === 'metrics'
            ? 'bg-[#0e111a] text-sky-300 border border-[#1a2130] border-b-transparent'
            : 'text-slate-500 hover:text-slate-300'
        ]"
      >
        <Icon icon="lucide:gauge" class="w-3.5 h-3.5" />
        Server Metrics
      </button>
      <button
        @click="activeTab = 'apps'"
        :class="[
          'px-3 py-1 rounded-t-md text-[11px] font-semibold transition flex items-center gap-1.5',
          activeTab === 'apps'
            ? 'bg-[#0e111a] text-sky-300 border border-[#1a2130] border-b-transparent'
            : 'text-slate-500 hover:text-slate-300'
        ]"
      >
        <Icon icon="lucide:boxes" class="w-3.5 h-3.5" />
        Apps & Logs
      </button>
    </div>

    <!-- Apps & Logs Tab: row layout (app list on the left, log viewer on the right) -->
    <div v-if="activeTab === 'apps'" class="flex-1 min-h-0 flex flex-col">
      <AppLogViewer
        :session-id="props.sessionId"
        :host-title="props.hostTitle"
        class="flex-1 min-h-0"
      />
    </div>

    <!-- Server Metrics Tab: scrolls when the window is too short to fit everything -->
    <div v-else class="flex-1 min-h-0 overflow-y-auto overflow-x-hidden">
      <div class="min-h-full flex flex-col gap-3 p-3">
        <!-- Top Compact Header HUD -->
        <div class="bg-[#0e111a] border border-[#1a2130] rounded-lg px-3 py-1.5 flex flex-wrap items-center justify-between gap-2 shadow-md shrink-0">
      <div class="flex items-center space-x-2.5">
        <div class="w-6 h-6 rounded-md bg-emerald-500/10 text-emerald-400 flex items-center justify-center border border-emerald-500/25">
          <Icon icon="lucide:activity" class="w-3.5 h-3.5 animate-pulse" />
        </div>
        <div>
          <div class="flex items-center space-x-2">
            <h1 class="font-bold text-xs tracking-wide text-white">{{ hostTitle }}</h1>
            <span :class="['w-2 h-2 rounded-full', isLive ? 'bg-emerald-400 shadow-[0_0_6px_#34d399]' : 'bg-red-500']"></span>
            <span class="text-[9px] text-slate-400 font-mono">{{ isLive ? 'Live Stream' : 'Connecting' }}</span>
          </div>
          <div class="flex items-center space-x-2 text-[9px] text-slate-400 font-mono">
            <span>Uptime: <strong class="text-slate-200 font-normal">{{ metrics?.uptime || '...' }}</strong></span>
            <span>•</span>
            <span>Load: <strong class="text-slate-200 font-normal">{{ metrics?.load_avg || '...' }}</strong></span>
          </div>
        </div>
      </div>

      <!-- Controls: Refresh Rates & Copilot AI -->
      <div class="flex items-center space-x-1.5">
        <div class="flex items-center bg-[#131722] border border-[#1e2738] rounded-md p-0.5 space-x-0.5 text-[9px] font-mono">
          <button
            v-for="rate in [1000, 2000, 5000, 0]"
            :key="rate"
            @click="setRefreshRate(rate)"
            :class="[
              'px-1.5 py-0.5 rounded transition',
              pollingInterval === rate
                ? 'bg-emerald-500 text-slate-950 font-bold shadow'
                : 'text-slate-400 hover:text-slate-200 hover:bg-[#1b2230]'
            ]"
          >
            {{ rate === 0 ? 'Pause' : `${rate / 1000}s` }}
          </button>
        </div>

        <button
          @click="diagnoseWithAI"
          :disabled="!metrics || aiThinking || !aiAgentStore.activeProvider"
          class="px-2 py-0.5 bg-purple-950/70 hover:bg-purple-900 border border-purple-700/60 text-purple-300 rounded-md text-[10px] font-medium transition flex items-center space-x-1 shadow-sm disabled:opacity-40"
          :title="!aiAgentStore.activeProvider
            ? 'AI Provider belum dipilih — atur di window utama BOBA'
            : 'Analisis kesehatan server dengan AI Copilot'"
        >
          <Icon
            :icon="aiThinking ? 'lucide:loader-2' : 'lucide:sparkles'"
            :class="['w-3 h-3', aiThinking ? 'animate-spin' : 'text-purple-400']"
          />
          <span>{{ aiThinking ? 'Menganalisa...' : 'Diagnosa AI' }}</span>
        </button>
      </div>
    </div>

    <!-- Inline AI health review: the AI drawer is not rendered in this window -->
    <div
      v-if="aiPanelOpen"
      class="bg-[#0c0a16] border border-purple-900/50 rounded-lg shrink-0 flex flex-col"
    >
      <div class="flex items-center justify-between px-3 py-1.5 border-b border-purple-900/40 shrink-0">
        <span class="flex items-center gap-1.5 text-[10px] font-bold text-purple-300 uppercase tracking-wider">
          <Icon :icon="aiThinking ? 'lucide:loader-2' : 'lucide:sparkles'" :class="['w-3 h-3', aiThinking ? 'animate-spin' : '']" />
          {{ aiThinking ? 'AI sedang menganalisa kesehatan server...' : 'Hasil Diagnosa AI' }}
        </span>
        <button
          @click="aiPanelOpen = false"
          class="text-slate-500 hover:text-slate-200 transition"
          title="Tutup panel"
        >
          <Icon icon="lucide:x" class="w-3 h-3" />
        </button>
      </div>
      <div class="overflow-y-auto p-3 text-[10px] leading-relaxed max-h-52">
        <div v-if="aiError" class="text-red-400 font-mono">{{ aiError }}</div>
        <div v-else class="text-slate-300 font-sans whitespace-pre-wrap">{{ aiAnswer }}</div>
      </div>
    </div>

    <!-- Error Alert Banner -->
    <div v-if="errorMsg" class="bg-red-950/80 border border-red-800 text-red-300 text-[10px] px-2.5 py-1 rounded-md flex items-center justify-between shrink-0">
      <span>{{ errorMsg }}</span>
      <button @click="fetchMetrics" class="underline font-mono">Coba Lagi</button>
    </div>

    <!-- Top KPI Cards: 1 / 2 / 4 columns depending on width -->
    <div class="grid grid-cols-2 xl:grid-cols-4 gap-3 shrink-0">
      <MetricKpiCard
        label="CPU Usage"
        icon="lucide:cpu"
        accent="sky"
        :level="levelOf('cpu')"
        :value="`${metrics?.cpu_usage || 0}%`"
        :sub="`Avg ${avgCpu}% / Peak ${maxCpu}%`"
      />
      <MetricKpiCard
        label="RAM Used"
        icon="lucide:hard-drive"
        accent="purple"
        :level="levelOf('ram')"
        :value="`${metrics?.ram_percent || 0}%`"
        :sub="`${metrics?.ram_used_mb || 0} / ${metrics?.ram_total_mb || 0} MB`"
      />
      <MetricKpiCard
        label="Swap Memory"
        icon="lucide:layers"
        accent="amber"
        :level="levelOf('swap')"
        :value="`${metrics?.swap_percent || 0}%`"
        :sub="`${metrics?.swap_used_mb || 0} / ${metrics?.swap_total_mb || 0} MB`"
      />
      <MetricKpiCard
        label="Root Disk ( / )"
        icon="lucide:disc"
        accent="emerald"
        :level="levelOf('disk')"
        :value="`${metrics?.disk_percent || 0}%`"
        :sub="`${metrics?.disk_used || '0'} / ${metrics?.disk_total || '0'}`"
      />
    </div>

    <!-- Resource warnings: a saturated disk or RAM must not read as a calm green card -->
    <div
      v-if="breached.length"
      :class="['flex flex-wrap items-center gap-x-3 gap-y-1 px-2.5 py-1.5 rounded-md border text-[10px] shrink-0', bannerClass]"
    >
      <span :class="['flex items-center gap-1.5 font-bold', bannerText]">
        <Icon :icon="bannerIcon" class="w-3.5 h-3.5" />
        {{ bannerTitle }}
      </span>
      <span
        v-for="r in breached"
        :key="r.key"
        :class="['font-mono px-1.5 py-0.5 rounded border', levelChip(r.level)]"
        :title="r.message"
      >
        {{ r.label }} {{ r.percent }}%
      </span>
    </div>

    <!-- Escalation history: notifications fire on band changes, this keeps the record -->
    <details
      v-if="alertLog.length"
      class="bg-[#0e111a] border border-[#1a2130] rounded-lg px-2.5 py-1.5 shrink-0"
    >
      <summary class="text-[9px] font-bold text-slate-400 uppercase tracking-wider cursor-pointer flex items-center gap-1.5 select-none">
        <Icon icon="lucide:bell-ring" class="w-3 h-3" />
        Riwayat Peringatan ({{ alertLog.length }})
      </summary>
      <ul class="mt-1.5 space-y-0.5 max-h-24 overflow-y-auto">
        <li
          v-for="(a, i) in alertLog"
          :key="i"
          class="text-[9px] font-mono flex items-start gap-1.5"
        >
          <span class="text-slate-600 shrink-0">{{ a.at }}</span>
          <span :class="['shrink-0', levelChip(a.level)]">{{ a.level.toUpperCase() }}</span>
          <span class="text-slate-400 truncate" :title="a.text">{{ a.text }}</span>
        </li>
      </ul>
    </details>

    <!-- Charts Section: responsive columns -->
    <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 shrink-0 xl:flex-1 xl:min-h-[190px]">
      <!-- CPU Chart Card -->
      <MetricChartCard
        title="CPU Utilization"
        dot-color="bg-sky-400"
        :badges="[{ text: `${metrics?.cpu_usage || 0}%`, className: 'bg-sky-950/70 text-sky-400 border-sky-800/40' }]"
        :stats="[
          { label: 'Peak', value: `${maxCpu}%`, className: 'text-sky-300' },
          { label: 'Avg', value: `${avgCpu}%`, className: 'text-slate-300' }
        ]"
        :series="cpuSeries"
        :y-ticks="['100%', '75%', '50%', '25%', '0%']"
        :x-labels="timeLabels"
        :hover-point="hoveredCpu ? cpuHoverPoint : null"
        @hover="handleCpuHoverAt"
      />

      <!-- RAM & Swap Chart Card -->
      <MetricChartCard
        title="RAM & Swap"
        dot-color="bg-purple-400"
        :badges="[
          { text: `RAM ${metrics?.ram_percent || 0}%`, className: 'bg-purple-950/70 text-purple-300 border-purple-800/40' },
          { text: `Swap ${metrics?.swap_percent || 0}%`, className: 'bg-amber-950/70 text-amber-300 border-amber-800/40' }
        ]"
        :stats="[{ label: 'RAM Peak', value: `${maxRam}%`, className: 'text-purple-300' }]"
        :series="ramSeries"
        :y-ticks="['100%', '75%', '50%', '25%', '0%']"
        :x-labels="timeLabels"
        :hover-point="hoveredRam ? ramHoverPoint : null"
        @hover="handleRamHoverAt"
      />

      <!-- Load Average Chart Card (3rd Column) -->
      <MetricChartCard
        title="Load Average"
        dot-color="bg-emerald-400"
        :stats="[{ label: 'cores', value: String(metrics?.cpu_cores || 1), className: 'text-slate-400' }]"
        :series="loadSeries"
        :y-ticks="[String(loadAxisMax), (loadAxisMax / 2).toFixed(1), '0']"
        :x-labels="timeLabels"
        :hover-point="hoveredLoad ? loadHoverPoint : null"
        @hover="handleLoadHoverAt"
      >
        <template #note>
          <p
            class="text-[9px] font-medium px-1.5 py-1 rounded flex items-center gap-1.5"
            :class="loadStatus.bg"
          >
            <Icon :icon="loadStatus.icon" class="w-3 h-3 shrink-0" />
            <span class="truncate" :title="loadStatus.text">{{ loadStatus.text }}</span>
          </p>
        </template>
      </MetricChartCard>
    </div>

    <!-- Top 10 Heavy Processes Table (Bottom) -->
    <div class="bg-[#0e111a] border border-[#1a2130] rounded-lg p-2.5 shadow-sm shrink-0">
      <div class="flex items-center justify-between mb-1 shrink-0">
        <div class="flex items-center gap-1.5">
          <Icon icon="lucide:server" class="w-3.5 h-3.5 text-sky-400" />
          <span class="font-bold text-[11px] text-slate-200 uppercase tracking-wider">Top 10 Proses Terberat</span>
        </div>
        <div class="flex items-center gap-1 text-[9px] font-mono text-slate-500">
          <span class="hidden sm:inline">Urutkan:</span>
          <button
            v-for="opt in (['cpu', 'mem'] as const)"
            :key="opt"
            @click="processSortBy = opt"
            :class="[
              'px-1.5 py-0.5 rounded transition',
              processSortBy === opt
                ? (opt === 'cpu' ? 'bg-sky-600 text-white font-bold' : 'bg-purple-600 text-white font-bold')
                : 'text-slate-400 hover:text-slate-200'
            ]"
            :title="`Urutkan berdasarkan ${opt === 'cpu' ? 'CPU' : 'MEM'}`"
          >
            {{ opt === 'cpu' ? '% CPU' : '% MEM' }}
          </button>
        </div>
      </div>

      <div class="overflow-x-auto">
        <table class="w-full text-left text-[11px] font-mono min-w-[520px]">
          <thead>
            <tr class="border-b border-[#1a2130] text-slate-400 text-[9px] uppercase bg-[#111624]">
              <th class="py-1 px-2.5">PID</th>
              <th class="py-1 px-2.5">User</th>
              <th class="py-1 px-2.5 text-right">CPU %</th>
              <th class="py-1 px-2.5 text-right">MEM %</th>
              <th class="py-1 px-2.5">Command / Process</th>
            </tr>
          </thead>
          <tbody>
            <tr
              v-for="proc in sortedProcesses"
              :key="proc.pid"
              class="border-b border-[#141824] hover:bg-[#151c2c] transition"
            >
              <td class="py-0.5 px-2.5 text-slate-400">{{ proc.pid }}</td>
              <td class="py-0.5 px-2.5 text-slate-300 max-w-[120px] truncate" :title="proc.user">{{ proc.user }}</td>
              <td class="py-0.5 px-2.5 text-right font-bold" :class="proc.cpu > 50 ? 'text-red-400' : 'text-sky-400'">
                {{ proc.cpu }}%
              </td>
              <td class="py-0.5 px-2.5 text-right text-purple-300 font-medium">{{ proc.mem }}%</td>
              <td class="py-0.5 px-2.5 text-slate-200 truncate max-w-[320px]" :title="proc.command">
                {{ proc.command }}
              </td>
            </tr>
            <tr v-if="!metrics?.top_processes?.length">
              <td colspan="5" class="py-2 text-center text-slate-500 italic text-[10px]">Memuat data proses...</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
    </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { Icon } from '@iconify/vue';
import { tauriBridge } from '../services/tauriBridge';
import { useAiAgentStore } from '../stores/aiAgentStore';
import AppLogViewer from './AppLogViewer.vue';
import MetricKpiCard from './MetricKpiCard.vue';
import MetricChartCard, { type ChartSeries, type ChartHoverPoint } from './MetricChartCard.vue';
import type { ServerMetricsFull } from '../utils/monitoringParser';
import {
  assessThresholds,
  breachedThresholds,
  worstLevel,
  LEVEL_CLASS,
  LEVEL_ICON,
  type ThresholdLevel
} from '../utils/monitoringThresholds';
import { describeAiFailure } from '../utils/aiFailure';
import { AlertTracker, type AlertEvent } from '../utils/serverAlert';

const activeTab = ref<'metrics' | 'apps'>('metrics');

// ---------------------------------------------------------------
// Resource thresholds (CPU / RAM / Swap / Disk / Load)
// ---------------------------------------------------------------
const thresholds = computed(() => assessThresholds(metrics.value));
const breached = computed(() => breachedThresholds(thresholds.value));
const worst = computed(() => worstLevel(thresholds.value));

const levelOf = (key: string): ThresholdLevel =>
  thresholds.value.find((t) => t.key === key)?.level ?? 'ok';

const levelChip = (level: ThresholdLevel) => LEVEL_CLASS[level].chip;
const bannerClass = computed(() => {
  if (worst.value === 'critical') return 'bg-red-950/40 border-red-800/60';
  if (worst.value === 'high') return 'bg-orange-950/30 border-orange-800/50';
  return 'bg-amber-950/25 border-amber-800/50';
});
const bannerText = computed(() => LEVEL_CLASS[worst.value].text);
const bannerIcon = computed(() => LEVEL_ICON[worst.value]);
const bannerTitle = computed(() => {
  const count = breached.value.length;
  if (worst.value === 'critical') return `${count} sumber daya kritis`;
  if (worst.value === 'high') return `${count} sumber daya tinggi`;
  return `${count} sumber daya perlu perhatian`;
});

// ---------------------------------------------------------------
// Escalation alerts (desktop notification + in-window log)
// ---------------------------------------------------------------
const alertLog = ref<{ at: string; text: string; level: ThresholdLevel }[]>([]);
const alertTracker = new AlertTracker();
let notificationsReady = false;

async function ensureNotifications() {
  if (notificationsReady) return true;
  try {
    const { isPermissionGranted, requestPermission } = await import('@tauri-apps/plugin-notification');
    let granted = await isPermissionGranted();
    if (!granted) granted = (await requestPermission()) === 'granted';
    notificationsReady = granted;
  } catch {
    // Plugin missing from the running binary (older build): fall back to the
    // in-window alert log only.
    notificationsReady = false;
  }
  return notificationsReady;
}

async function pushAlertEvents(events: AlertEvent[]) {
  if (!events.length) return;
  const now = new Date();
  for (const e of events) {
    alertLog.value.unshift({
      at: `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`,
      text: `${e.title} — ${e.body}`,
      level: e.to,
    });
  }
  if (alertLog.value.length > 30) alertLog.value.length = 30;

  if (await ensureNotifications()) {
    try {
      const { sendNotification } = await import('@tauri-apps/plugin-notification');
      for (const e of events) {
        sendNotification({ title: `${props.hostTitle} — ${e.title}`, body: e.body });
      }
    } catch {
      /* in-window log already records it */
    }
  }
}

/** Inline AI health review, shown here because the AI drawer is not in this window. */
const aiPanelOpen = ref(false);
const aiThinking = ref(false);
const aiAnswer = ref('');
const aiError = ref<string | null>(null);

const props = defineProps<{
  sessionId: string;
  hostTitle: string;
}>();

const aiAgentStore = useAiAgentStore();

const metrics = ref<ServerMetricsFull | null>(null);
const isLive = ref(false);
const errorMsg = ref<string | null>(null);
const pollingInterval = ref<number>(2000);
const hoverCpuIndex = ref<number | null>(null);
const hoverRamIndex = ref<number | null>(null);
const hoverLoadIndex = ref<number | null>(null);

interface HistoryItem {
  cpu: number;
  ram: number;
  swap: number;
  time: string;
  load1: number;
  load5: number;
  load15: number;
}

const MAX_POINTS = 60;
const history = ref<HistoryItem[]>([]);
let timer: any = null;

// Newest sample is pinned to the right edge; the chart fills leftward as data arrives.
const xFor = (idx: number) => ((MAX_POINTS - history.value.length + idx) / (MAX_POINTS - 1)) * 100;

const hoveredCpu = computed(() =>
  hoverCpuIndex.value === null ? null : history.value[hoverCpuIndex.value] ?? null
);
const hoveredRam = computed(() =>
  hoverRamIndex.value === null ? null : history.value[hoverRamIndex.value] ?? null
);
const hoveredLoad = computed(() =>
  hoverLoadIndex.value === null ? null : history.value[hoverLoadIndex.value] ?? null
);

const avgCpu = computed(() => {
  if (!history.value.length) return 0;
  const sum = history.value.reduce((acc, cur) => acc + cur.cpu, 0);
  return Math.round((sum / history.value.length) * 10) / 10;
});

const maxCpu = computed(() => {
  if (!history.value.length) return 0;
  return Math.max(...history.value.map(h => h.cpu));
});

const maxRam = computed(() => {
  if (!history.value.length) return 0;
  return Math.max(...history.value.map(h => h.ram));
});

/** Which resource the process table is ordered by. */
const processSortBy = ref<'cpu' | 'mem'>('cpu');

// The backend returns the ten heaviest by CPU. Re-ordering client-side is free
// and lets a memory-hungry server be spotted without another round trip.
const sortedProcesses = computed(() => {
  const list = [...(metrics.value?.top_processes ?? [])];
  const key = processSortBy.value;
  return list.sort((a, b) => b[key] - a[key]);
});

const timeLabels = computed(() => {
  if (!history.value.length) return { start: '--:--', mid: '--:--', end: 'Live' };
  const start = history.value[0]?.time ?? '--:--';
  const end = history.value[history.value.length - 1]?.time ?? 'Live';
  const mid = history.value[Math.floor(history.value.length / 2)]?.time ?? '--:--';
  return { start, mid, end };
});

function generateSmoothSvgPath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0]?.x} ${points[0]?.y}`;

  let d = `M ${points[0]?.x.toFixed(1)} ${points[0]?.y.toFixed(1)}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i === 0 ? 0 : i - 1]!;
    const p1 = points[i]!;
    const p2 = points[i + 1]!;
    const p3 = points[i + 2 < points.length ? i + 2 : i + 1]!;

    const cp1x = p1.x + (p2.x - p0.x) / 5;
    const cp1y = p1.y + (p2.y - p0.y) / 5;
    const cp2x = p2.x - (p3.x - p1.x) / 5;
    const cp2y = p2.y - (p3.y - p1.y) / 5;

    d += ` C ${cp1x.toFixed(1)} ${cp1y.toFixed(1)}, ${cp2x.toFixed(1)} ${cp2y.toFixed(1)}, ${p2.x.toFixed(1)} ${p2.y.toFixed(1)}`;
  }
  return d;
}

// Inset the plot band so a stroke centred on 0% or 100% is not clipped by the
// SVG viewport edge. Without this, peaks touching the ceiling lose half their line.
const Y_PAD = 2.5;
const PLOT_TOP = Y_PAD;
const PLOT_BOTTOM = 100 - Y_PAD;
const PLOT_SPAN = PLOT_BOTTOM - PLOT_TOP;

function pctY(percent: number) {
  const v = Math.min(100, Math.max(0, percent));
  return PLOT_BOTTOM - (v / 100) * PLOT_SPAN;
}

const cpuSmoothPath = computed(() => {
  if (history.value.length < 2) return '';
  const pts = history.value.map((item, idx) => ({
    x: xFor(idx),
    y: pctY(item.cpu)
  }));
  return generateSmoothSvgPath(pts);
});

const cpuSmoothArea = computed(() => {
  if (!cpuSmoothPath.value) return '';
  const firstX = xFor(0);
  return `${cpuSmoothPath.value} L 100 ${PLOT_BOTTOM} L ${firstX.toFixed(1)} ${PLOT_BOTTOM} Z`;
});

const ramSmoothPath = computed(() => {
  if (history.value.length < 2) return '';
  const pts = history.value.map((item, idx) => ({
    x: xFor(idx),
    y: pctY(item.ram)
  }));
  return generateSmoothSvgPath(pts);
});

const ramSmoothArea = computed(() => {
  if (!ramSmoothPath.value) return '';
  const firstX = xFor(0);
  return `${ramSmoothPath.value} L 100 ${PLOT_BOTTOM} L ${firstX.toFixed(1)} ${PLOT_BOTTOM} Z`;
});

const swapSmoothPath = computed(() => {
  if (history.value.length < 2) return '';
  const pts = history.value.map((item, idx) => ({
    x: xFor(idx),
    y: pctY(item.swap)
  }));
  return generateSmoothSvgPath(pts);
});

/** The chart card reports a percentage; map it back onto a sample index. */
function indexFromPercent(percent: number | null): number | null {
  if (percent === null || !history.value.length) return null;
  const offset = Math.round((percent / 100) * (MAX_POINTS - 1)) - (MAX_POINTS - history.value.length);
  return Math.max(0, Math.min(history.value.length - 1, offset));
}

function handleCpuHoverAt(percent: number | null) {
  hoverCpuIndex.value = indexFromPercent(percent);
}

function handleRamHoverAt(percent: number | null) {
  hoverRamIndex.value = indexFromPercent(percent);
}

function handleLoadHoverAt(percent: number | null) {
  hoverLoadIndex.value = indexFromPercent(percent);
}

function parseLoadAvg(raw: string): [number, number, number] {
  const parts = (raw || '').split(',').map(p => parseFloat(p.trim())).filter(n => !isNaN(n));
  return [parts[0] ?? 0, parts[1] ?? 0, parts[2] ?? 0];
}

// Load average is only meaningful relative to core count, so scale against it.
const loadAxisMax = computed(() => {
  const cores = Math.max(1, metrics.value?.cpu_cores ?? 1);
  const peak = history.value.length
    ? Math.max(...history.value.map(h => Math.max(h.load1, h.load5, h.load15)))
    : 1;
  return Math.max(cores, Math.ceil(peak * 1.15 * 10) / 10);
});

function loadY(v: number) {
  const max = loadAxisMax.value || 1;
  return PLOT_BOTTOM - (Math.min(1, Math.max(0, v / max))) * PLOT_SPAN;
}

const load1mPath = computed(() => {
  if (history.value.length < 2) return '';
  return generateSmoothSvgPath(history.value.map((h, idx) => ({ x: xFor(idx), y: loadY(h.load1) })));
});

const load5mPath = computed(() => {
  if (history.value.length < 2) return '';
  return generateSmoothSvgPath(history.value.map((h, idx) => ({ x: xFor(idx), y: loadY(h.load5) })));
});

const load15mPath = computed(() => {
  if (history.value.length < 2) return '';
  return generateSmoothSvgPath(history.value.map((h, idx) => ({ x: xFor(idx), y: loadY(h.load15) })));
});

// Series + hover payloads handed to the shared chart card.
const cpuSeries = computed<ChartSeries[]>(() => [
  { key: 'cpu', points: cpuSmoothPath.value, area: cpuSmoothArea.value, color: '#0ea5e9', width: 2 }
]);

const ramSeries = computed<ChartSeries[]>(() => [
  { key: 'ram', points: ramSmoothPath.value, area: ramSmoothArea.value, color: '#c084fc', width: 2 },
  { key: 'swap', points: swapSmoothPath.value, color: '#fbbf24', width: 1.5, dashed: true }
]);

const loadSeries = computed<ChartSeries[]>(() => [
  { key: 'l1', points: load1mPath.value, color: '#34d399', width: 2 },
  { key: 'l5', points: load5mPath.value, color: '#38bdf8', width: 1.5 },
  { key: 'l15', points: load15mPath.value, color: '#a78bfa', width: 1.5, dashed: true }
]);

const cpuHoverPoint = computed<ChartHoverPoint | null>(() => {
  const h = hoveredCpu.value;
  if (!h) return null;
  return {
    x: xFor(hoverCpuIndex.value ?? 0),
    title: h.time,
    borderClass: 'border-sky-400',
    dots: [{ key: 'cpu', y: pctY(h.cpu), className: 'bg-sky-400 shadow-[0_0_6px_#0284c7]' }],
    rows: [
      { label: 'CPU', value: `${h.cpu}%`, dot: 'bg-sky-500', valueClass: 'text-sky-600' }
    ]
  };
});

const ramHoverPoint = computed<ChartHoverPoint | null>(() => {
  const h = hoveredRam.value;
  if (!h) return null;
  return {
    x: xFor(hoverRamIndex.value ?? 0),
    title: h.time,
    borderClass: 'border-purple-400',
    dots: [{ key: 'ram', y: pctY(h.ram), className: 'bg-purple-500 shadow-[0_0_6px_#9333ea]' }],
    rows: [
      { label: 'RAM', value: `${h.ram}%`, dot: 'bg-purple-500', valueClass: 'text-purple-600' },
      { label: 'Swap', value: `${h.swap}%`, dot: 'bg-amber-500', valueClass: 'text-amber-600' }
    ]
  };
});

const loadHoverPoint = computed<ChartHoverPoint | null>(() => {
  const h = hoveredLoad.value;
  if (!h) return null;
  return {
    x: xFor(hoverLoadIndex.value ?? 0),
    title: h.time,
    borderClass: 'border-emerald-400',
    dots: [{ key: 'l1', y: loadY(h.load1), className: 'bg-emerald-400 shadow-[0_0_6px_#059669]' }],
    rows: [
      { label: '1m', value: String(h.load1), dot: 'bg-emerald-500', valueClass: 'text-emerald-600' },
      { label: '5m', value: String(h.load5), dot: 'bg-sky-500', valueClass: 'text-sky-600' },
      { label: '15m', value: String(h.load15), dot: 'bg-violet-500', valueClass: 'text-violet-600' }
    ]
  };
});

// Plain-language read of the current load, so the numbers mean something.
const loadStatus = computed(() => {
  const cores = Math.max(1, metrics.value?.cpu_cores ?? 1);
  const [l1, , l15] = parseLoadAvg(metrics.value?.load_avg ?? '');

  if (!l1) {
    return { text: 'Menunggu data load...', bg: 'bg-slate-800/40 text-slate-400', icon: 'lucide:loader' };
  }

  const ratio = l1 / cores;
  const climbing = l1 > l15 * 1.15;
  const falling = l1 < l15 * 0.85;

  // Tuned against real queues rather than arbitrary round numbers:
  //  - <= 1x  every process gets a core immediately, nothing is waiting
  //  - ~1.5x  roughly half the processes wait for their turn; still healthy
  //  - ~2x    twice the work as cores, so each process waits about one turn
  //  - >= 3x  the queue is several deep and user-visible latency is real
  // Flagging 1.5x as "critical" would leave a busy server permanently red, which
  // trains the user to ignore the one moment that actually matters.
  if (ratio >= 3) {
    return {
      text: `Kritis — ${l1.toFixed(2)} antre di ${cores} core. Antrean dalam, respons melambat.`,
      bg: 'bg-red-950/60 text-red-300 border border-red-800/40',
      icon: 'lucide:alert-octagon'
    };
  }
  if (ratio >= 1.5) {
    return {
      text: `Bebani — ${l1.toFixed(2)} antre di ${cores} core. Semua core bekerja, masih wajar.`,
      bg: 'bg-amber-950/60 text-amber-300 border border-amber-800/40',
      icon: 'lucide:alert-triangle'
    };
  }
  if (ratio >= 1.0) {
    return {
      text: `Mulai penuh — ${l1.toFixed(2)} antre di ${cores} core. Semua core dipakai.`,
      bg: 'bg-amber-950/40 text-amber-200/90 border border-amber-800/30',
      icon: 'lucide:gauge'
    };
  }
  if (climbing) {
    return {
      text: `Naik — ${l1.toFixed(2)} naik dari ${l15.toFixed(2)} (15m). Beban sedang meningkat.`,
      bg: 'bg-sky-950/50 text-sky-300 border border-sky-800/40',
      icon: 'lucide:trending-up'
    };
  }
  if (falling) {
    return {
      text: `Mereda — ${l1.toFixed(2)} turun dari ${l15.toFixed(2)} (15m). Beban sedang berkurang.`,
      bg: 'bg-emerald-950/50 text-emerald-300 border border-emerald-800/40',
      icon: 'lucide:trending-down'
    };
  }
  return {
    text: `Normal — ${l1.toFixed(2)} antre di ${cores} core. Server santai, masih banyak core kosong.`,
    bg: 'bg-emerald-950/50 text-emerald-300 border border-emerald-800/40',
    icon: 'lucide:check-circle'
  };
});

async function fetchMetrics() {
  if (!props.sessionId) return;
  try {
    const data = await tauriBridge.sshGetServerMetricsFull(props.sessionId);
    metrics.value = data;
    isLive.value = true;
    errorMsg.value = null;

    const now = new Date();
    const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}:${now.getSeconds().toString().padStart(2, '0')}`;

    const [load1, load5, load15] = parseLoadAvg(data.load_avg);

    history.value.push({
      cpu: data.cpu_usage,
      ram: data.ram_percent,
      swap: data.swap_percent,
      time: timeStr,
      load1,
      load5,
      load15
    });
    if (history.value.length > MAX_POINTS) {
      history.value.shift();
      if (hoverCpuIndex.value !== null) hoverCpuIndex.value = Math.max(0, hoverCpuIndex.value - 1);
      if (hoverRamIndex.value !== null) hoverRamIndex.value = Math.max(0, hoverRamIndex.value - 1);
      if (hoverLoadIndex.value !== null) hoverLoadIndex.value = Math.max(0, hoverLoadIndex.value - 1);
    }
    void pushAlertEvents(alertTracker.update(thresholds.value));
  } catch (err: any) {
    isLive.value = false;
    errorMsg.value = `Gagal mengambil metrik server: ${err.message || err}`;
  }
}

function setRefreshRate(rate: number) {
  pollingInterval.value = rate;
  startPolling();
}

function startPolling() {
  if (timer) clearInterval(timer);
  timer = null;
  // No need to hammer the server with metrics while the user reads app logs.
  if (pollingInterval.value > 0 && activeTab.value === 'metrics') {
    fetchMetrics();
    timer = setInterval(fetchMetrics, pollingInterval.value);
  }
}

/**
 * Ask the AI to review the current server health.
 *
 * Routed through `runEphemeralAnalysis` rather than `sendPromptWithContext`:
 * this window has no AI drawer, so the drawer-routed answer would land nowhere
 * visible, the bail-out guards would fire UI that does not exist here, and the
 * prompt would be written into the user's real chat history.
 */
async function diagnoseWithAI() {
  if (!metrics.value || aiThinking.value) return;

  aiPanelOpen.value = true;
  aiThinking.value = true;
  aiError.value = null;
  aiAnswer.value = '';

  const m = metrics.value;
  const cores = Math.max(1, m.cpu_cores || 1);
  const [l1 = 0, l5 = 0, l15 = 0] = (m.load_avg || '').split(',').map((v) => parseFloat(v.trim()) || 0);
  const all = sortedProcesses.value;

  const prompt = [
    `Analisis status kesehatan server "${props.hostTitle}".`,
    '',
    `- CPU: ${m.cpu_usage}% (rata-rata ${avgCpu.value}%, puncak ${maxCpu.value}%)`,
    `- RAM: ${m.ram_used_mb}MB / ${m.ram_total_mb}MB (${m.ram_percent}%)`,
    `- Swap: ${m.swap_used_mb}MB / ${m.swap_total_mb}MB (${m.swap_percent}%)`,
    `- Disk ( / ): ${m.disk_used} / ${m.disk_total} (${m.disk_percent}%)`,
    `- Uptime: ${m.uptime}`,
    `- Load Average: ${l1} / ${l5} / ${l15} pada ${cores} core`,
    `- Status saat ini: ${loadStatus.value.text}`,
    `- Ambang dilampaui: ${thresholds.value.filter((t) => t.level !== 'ok').map((t) => t.label).join(', ') || 'tidak ada'}`,
    '',
    `Semua proses yang tercatat, diurutkan ${processSortBy.value === 'cpu' ? 'CPU' : 'MEM'} (${all.length} proses):`,
    '```',
    all.map((p) => `PID ${p.pid} (${p.user}): CPU ${p.cpu}%, MEM ${p.mem}% -> ${p.command}`).join('\n'),
    '```',
    '',
    'Nilaikan kesehatan server ini dan bila ada masalah, jelaskan penyebab serta langkah perbaikannya.'
  ].join('\n');

  try {
    aiAnswer.value = await aiAgentStore.runEphemeralAnalysis(prompt, props.sessionId);
  } catch (err: any) {
    aiError.value = describeAiFailure(err);
  } finally {
    aiThinking.value = false;
  }
}

watch(activeTab, () => {
  startPolling();
});

onMounted(() => {
  startPolling();
});

onUnmounted(() => {
  if (timer) clearInterval(timer);
});
</script>
