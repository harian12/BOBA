<template>
  <div
    :class="[
      'bg-[#0e111a] rounded-lg p-2 flex items-center justify-between gap-2 shadow-sm transition-colors',
      level && level !== 'ok' ? alertCard[level] : 'border border-[#1a2130]'
    ]"
  >
    <div class="min-w-0">
      <div class="text-[8px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
        <span :class="['w-1.5 h-1.5 rounded-full shrink-0', tones.dot, level && level !== 'ok' ? 'animate-pulse' : '']"></span>
        <span class="truncate">{{ label }}</span>
      </div>
      <div :class="['text-base font-bold font-mono mt-0.5 leading-tight', tones.value]">{{ value }}</div>
      <div class="text-[8px] text-slate-500 font-mono truncate" :title="sub">{{ sub }}</div>
    </div>
    <div :class="['w-7 h-7 rounded-md border flex items-center justify-center shrink-0', tones.chip]">
      <Icon :icon="level && level !== 'ok' ? levelIcon : icon" class="w-3.5 h-3.5" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue';
import { Icon } from '@iconify/vue';
import { LEVEL_ICON, type ThresholdLevel } from '../utils/monitoringThresholds';

const props = withDefaults(
  defineProps<{
    label: string;
    value: string;
    sub?: string;
    icon: string;
    /** Accent key; keeps the colour scheme in one place instead of per call site. */
    accent?: 'sky' | 'purple' | 'amber' | 'emerald';
    /**
     * When the reading is over a limit this takes precedence over `accent`, so a
     * saturated disk cannot look as healthy as an idle one.
     */
    level?: ThresholdLevel;
  }>(),
  { sub: '', accent: 'sky', level: undefined }
);

const TONES = {
  sky: { dot: 'bg-sky-400', value: 'text-sky-400', chip: 'bg-sky-950/40 border-sky-600/30 text-sky-400' },
  purple: { dot: 'bg-purple-400', value: 'text-purple-400', chip: 'bg-purple-950/40 border-purple-600/30 text-purple-400' },
  amber: { dot: 'bg-amber-400', value: 'text-amber-400', chip: 'bg-amber-950/40 border-amber-600/30 text-amber-400' },
  emerald: { dot: 'bg-emerald-400', value: 'text-emerald-400', chip: 'bg-emerald-950/40 border-emerald-600/30 text-emerald-400' }
} as const;

const ALERT_TONES = {
  warn: { dot: 'bg-amber-400', value: 'text-amber-300', chip: 'bg-amber-950/50 border-amber-600/40 text-amber-400' },
  high: { dot: 'bg-orange-400', value: 'text-orange-400', chip: 'bg-orange-950/50 border-orange-600/40 text-orange-400' },
  critical: { dot: 'bg-red-500', value: 'text-red-400', chip: 'bg-red-950/60 border-red-700/50 text-red-400' }
} as const;

const alertCard = {
  warn: 'border border-amber-700/50 bg-amber-950/10',
  high: 'border border-orange-700/50 bg-orange-950/10',
  critical: 'border border-red-700/60 bg-red-950/15'
} as const;

const alerting = computed(() => props.level && props.level !== 'ok');
const tones = computed(() =>
  alerting.value ? ALERT_TONES[props.level as 'warn' | 'high' | 'critical'] : TONES[props.accent]
);
const levelIcon = computed(() => LEVEL_ICON[props.level as ThresholdLevel]);
</script>
