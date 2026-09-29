<template>
  <div class="bg-[#0e111a] border border-[#1a2130] rounded-lg p-2.5 flex flex-col justify-between shadow-sm min-h-[168px] xl:min-h-0">
    <!-- Header: title, badge, stats -->
    <div class="flex items-center justify-between gap-2 mb-1 text-[11px] shrink-0">
      <div class="flex items-center gap-1.5 min-w-0">
        <span v-if="dotColor" :class="['w-1.5 h-1.5 rounded-full shrink-0', dotColor]"></span>
        <span class="font-bold text-slate-100 text-xs truncate">{{ title }}</span>
        <span
          v-for="b in badges"
          :key="b.text"
          class="text-[9px] px-1 py-0.2 rounded font-mono border shrink-0"
          :class="b.className"
        >{{ b.text }}</span>
      </div>
      <div class="flex items-center gap-2 text-[9px] font-mono text-slate-400 shrink-0">
        <span v-for="s in stats" :key="s.label">
          {{ s.label }}: <strong :class="s.className">{{ s.value }}</strong>
        </span>
      </div>
    </div>

    <!-- Plot -->
    <div
      class="relative flex-1 min-h-[100px] w-full bg-[#05070a] rounded border border-[#151a24] p-1.5 flex flex-col cursor-crosshair"
      @mousemove="handleMove"
      @mouseleave="emit('hover', null)"
    >
      <div class="relative flex-1 min-h-0 flex">
        <!-- Y axis -->
        <div class="w-9 flex flex-col justify-between text-[8px] font-mono text-slate-500 py-0.5 pr-1 border-r border-[#151a24] shrink-0 text-right select-none">
          <span v-for="t in yTicks" :key="t">{{ t }}</span>
        </div>

        <div class="relative flex-1 min-w-0 ml-1">
          <div class="absolute inset-0 flex flex-col justify-between pointer-events-none opacity-20">
            <div v-for="i in yTicks.length" :key="i" class="border-b border-dashed w-full"
              :class="i === yTicks.length ? 'border-solid border-slate-400' : 'border-slate-400'"></div>
          </div>

          <svg class="absolute inset-0 w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
            <defs>
              <linearGradient v-for="s in series" :id="`grad-${uid}-${s.key}`" :key="s.key" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" :stop-color="s.color" :stop-opacity="s.fillOpacity ?? 0.35" />
                <stop offset="100%" :stop-color="s.color" stop-opacity="0" />
              </linearGradient>
            </defs>

            <g v-if="series.some((s) => s.points)">
              <path
                v-for="s in series.filter((x) => x.area)"
                :key="`fill-${s.key}`"
                :d="s.area"
                :fill="`url(#grad-${uid}-${s.key})`"
              />
              <path
                v-for="s in series"
                :key="`line-${s.key}`"
                :d="s.points"
                fill="none"
                :stroke="s.color"
                :stroke-width="s.width ?? 2"
                :stroke-dasharray="s.dashed ? '4,3' : undefined"
                stroke-linecap="round"
                stroke-linejoin="round"
                vector-effect="non-scaling-stroke"
              />
            </g>
            <text
              v-else
              x="50"
              y="52"
              text-anchor="middle"
              fill="#3f4a63"
              font-size="4"
              font-family="monospace"
            >{{ emptyLabel }}</text>
          </svg>

          <!-- Hover tracker + tooltip -->
          <div
            v-if="hoverPoint"
            class="absolute top-0 bottom-0 pointer-events-none z-30 border-l border-dashed"
            :class="hoverPoint.borderClass"
            :style="{ left: `${hoverPoint.x}%` }"
          >
            <div
              v-for="d in hoverPoint.dots"
              :key="d.key"
              class="absolute w-2 h-2 rounded-full border border-white -translate-x-1/2 -translate-y-1/2"
              :class="d.className"
              :style="{ top: `${d.y}%` }"
            ></div>

            <div
              :class="[
                'absolute bg-white text-slate-800 rounded p-1.5 shadow-2xl border border-slate-200 text-[9px] font-sans mt-1.5 whitespace-nowrap z-40 pointer-events-none transition-transform duration-75',
                hoverPoint.x > 70 ? '-translate-x-[92%]' : hoverPoint.x < 30 ? '-translate-x-[8%]' : '-translate-x-1/2'
              ]"
            >
              <div class="text-[8px] font-bold text-slate-500 uppercase tracking-wider mb-0.5">{{ hoverPoint.title }}</div>
              <div v-for="r in hoverPoint.rows" :key="r.label" class="flex items-center gap-1 text-slate-700">
                <span :class="['w-1.5 h-1.5 rounded-full', r.dot]"></span>
                {{ r.label }}: <strong :class="r.valueClass">{{ r.value }}</strong>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- X axis -->
      <div class="flex justify-between items-center text-[8px] font-mono text-slate-500 pl-10 pt-1 border-t border-[#131720] shrink-0">
        <span>{{ xLabels.start }}</span>
        <span>{{ xLabels.mid }}</span>
        <span>{{ xLabels.end }}</span>
      </div>
    </div>

    <!-- Optional note shown under the plot, e.g. a plain-language status line -->
    <div v-if="$slots.note" class="mt-1 shrink-0">
      <slot name="note" />
    </div>
  </div>
</template>

<script setup lang="ts">
export interface ChartSeries {
  key: string;
  /** Pre-built SVG path for the line, e.g. from a smooth spline. */
  points: string;
  /** Optional closed path drawn under the line with a gradient fill. */
  area?: string;
  color: string;
  width?: number;
  dashed?: boolean;
  fillOpacity?: number;
}

export interface ChartBadge {
  text: string;
  className: string;
}

export interface ChartStat {
  label: string;
  value: string;
  className: string;
}

export interface ChartHoverRow {
  label: string;
  value: string;
  dot: string;
  valueClass: string;
}

export interface ChartHoverPoint {
  x: number;
  title: string;
  borderClass: string;
  dots: { key: string; y: number; className: string }[];
  rows: ChartHoverRow[];
}

const props = withDefaults(
  defineProps<{
    title: string;
    dotColor?: string;
    badges?: ChartBadge[];
    stats?: ChartStat[];
    series: ChartSeries[];
    yTicks: string[];
    xLabels: { start: string; mid: string; end: string };
    /** Hover marker + tooltip, or null when the pointer is away. */
    hoverPoint?: ChartHoverPoint | null;
    emptyLabel?: string;
  }>(),
  {
    dotColor: '',
    badges: () => [],
    stats: () => [],
    hoverPoint: null,
    emptyLabel: 'Menunggu data...'
  }
);

const emit = defineEmits<{ (e: 'hover', x: number | null): void }>();

// Unique per instance so gradient ids never collide when several charts are mounted.
const uid = `m${Math.random().toString(36).slice(2, 8)}`;

function handleMove(e: MouseEvent) {
  const target = e.currentTarget as HTMLElement | null;
  if (!target) return;
  const rect = target.getBoundingClientRect();
  const rel = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
  // The plot area is inset by the y-axis and padding, so remap into plot space.
  emit('hover', rel * 100);
}
</script>
