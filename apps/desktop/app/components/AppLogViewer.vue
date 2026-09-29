<template>
  <div class="flex-1 min-h-0 flex flex-row gap-2 p-2.5">
    <!-- App List -->
    <div class="w-60 shrink-0 bg-[#0e111a] border border-[#1a2130] rounded-lg flex flex-col overflow-hidden">
      <div class="p-2 border-b border-[#1a2130] shrink-0">
        <div class="flex items-center justify-between mb-1.5">
          <span class="text-[10px] font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
            <Icon icon="lucide:boxes" class="w-3.5 h-3.5 text-sky-400" />
            Aplikasi Berjalan
          </span>
          <div class="flex items-center gap-1">
            <button
              @click="toggleAllGroups"
              class="p-1 rounded bg-[#1a2030] hover:bg-[#252d42] text-slate-400 hover:text-sky-300 transition"
              :title="allCollapsed ? 'Buka semua grup' : 'Tutup semua grup'"
            >
              <Icon :icon="allCollapsed ? 'lucide:chevrons-down-up' : 'lucide:chevrons-up-down'" class="w-3 h-3" />
            </button>
            <button
              @click="loadApps"
              :disabled="isLoadingApps"
              class="p-1 rounded bg-[#1a2030] hover:bg-[#252d42] text-slate-400 hover:text-sky-300 transition disabled:opacity-50"
              title="Muat ulang daftar aplikasi"
            >
              <Icon icon="lucide:refresh-cw" :class="['w-3 h-3', isLoadingApps ? 'animate-spin' : '']" />
            </button>
          </div>
        </div>
        <div class="relative">
          <Icon icon="lucide:search" class="w-3 h-3 absolute left-2 top-1/2 -translate-y-1/2 text-slate-500" />
          <input
            v-model="appSearch"
            type="text"
            placeholder="Cari aplikasi..."
            class="w-full bg-[#080b12] border border-[#1e2536] rounded pl-7 pr-2 py-1 text-[10px] text-slate-200 placeholder-slate-600 focus:outline-none focus:border-sky-600 font-mono"
          />
        </div>
      </div>

      <div class="flex-1 overflow-y-auto">
        <div v-if="appsError" class="p-2.5 text-[10px] text-red-400 font-mono">{{ appsError }}</div>

        <div v-for="group in groupedApps" :key="group.kind" class="mb-1">
          <!-- Collapsible group header -->
          <button
            @click="toggleGroup(group.kind)"
            class="w-full px-2 py-1 text-[9px] font-bold text-slate-500 uppercase tracking-wider bg-[#0a0d15] sticky top-0 hover:text-slate-300 transition flex items-center justify-between gap-1"
            :title="collapsedGroups.has(group.kind) ? `Buka ${group.label}` : `Tutup ${group.label}`"
          >
            <span class="flex items-center gap-1.5">
              <Icon
                :icon="collapsedGroups.has(group.kind) ? 'lucide:chevron-right' : 'lucide:chevron-down'"
                class="w-3 h-3 shrink-0"
              />
              <span>{{ group.label }} ({{ group.items.length }})</span>
            </span>
            <Icon
              v-if="isSelectedInside(group.items)"
              icon="lucide:log-open"
              class="w-3 h-3 text-sky-400 shrink-0"
              title="Log sedang dibuka"
            />
          </button>

          <template v-if="!collapsedGroups.has(group.kind)">
            <div
              v-if="group.items.length === 0 && group.emptyHint"
              class="px-2 py-1.5 text-[9px] text-slate-600 font-mono italic"
            >
              {{ group.emptyHint }}
            </div>
          <button
            v-for="app in group.items"
            :key="`${app.kind}-${app.name}`"
            @click="selectApp(app)"
            class="w-full text-left px-2 py-1.5 hover:bg-[#161d2f] transition flex items-center gap-2 border-l-2"
            :class="selected?.name === app.name && selected?.kind === app.kind
              ? 'bg-[#182036] border-sky-500'
              : 'border-transparent'"
          >
            <span :class="['w-1.5 h-1.5 rounded-full shrink-0', statusColor(app.status)]"></span>
            <div class="min-w-0 flex-1">
              <div class="text-[11px] text-slate-200 truncate font-mono">{{ app.name }}</div>
              <div class="text-[9px] text-slate-500 truncate">{{ app.detail || app.status }}</div>
            </div>
          </button>
          </template>
        </div>

        <div v-if="!isLoadingApps && !appsError && apps.length === 0" class="p-3 text-center">
          <div class="text-[10px] text-slate-500 font-mono">Tidak ada aplikasi terdeteksi</div>
          <div class="text-[9px] text-slate-600 mt-1">PM2 / Docker / systemd tidak berjalan di server ini</div>
        </div>
      </div>
    </div>

    <!-- Log Viewer -->
    <div class="flex-1 min-w-0 bg-[#0e111a] border border-[#1a2130] rounded-lg flex flex-col overflow-hidden">
      <!-- Header + Controls -->
      <div class="p-2 border-b border-[#1a2130] flex items-center justify-between gap-2 shrink-0 flex-wrap">
        <div class="flex items-center gap-2 min-w-0">
          <Icon icon="lucide:scroll-text" class="w-3.5 h-3.5 text-purple-400 shrink-0" />
          <span class="text-[11px] font-bold text-slate-200 truncate">
            {{ selected ? `${selected.kind.toUpperCase()} · ${selected.name}` : 'Pilih aplikasi' }}
          </span>
          <span
            v-if="streamStatus !== 'idle'"
            class="flex items-center gap-1 text-[9px] font-mono shrink-0"
            :class="{
              'text-emerald-400': streamStatus === 'live',
              'text-amber-400': streamStatus === 'reconnecting',
              'text-red-400': streamStatus === 'failed'
            }"
            :title="streamStatus === 'live'
              ? 'Log terus mengalir dari server'
              : streamStatus === 'reconnecting'
              ? 'Koneksi terputus, mencoba menyambung ulang...'
              : 'Stream gagal, klik Live untuk mencoba lagi'"
          >
            <span
              :class="[
                'w-1.5 h-1.5 rounded-full',
                streamStatus === 'live' ? 'bg-emerald-400 animate-pulse'
                  : streamStatus === 'reconnecting' ? 'bg-amber-400 animate-pulse'
                  : 'bg-red-400'
              ]"
            ></span>
            {{ streamStatusLabel }}
          </span>

          <!-- PM2 keeps stdout and stderr in separate files; let the user pick.
               Deliberately neutral colours: stderr is a stream name, not a
               verdict — plenty of healthy apps log their successes there. -->
          <div
            v-if="selected?.kind === 'pm2'"
            class="flex items-center bg-[#1a2030] border border-[#2a3348] rounded p-0.5 gap-0.5 shrink-0"
          >
            <button
              v-for="s in (['out', 'error'] as const)"
              :key="s"
              @click="switchPm2Stream(s)"
              :class="[
                'px-1.5 py-0.5 rounded text-[9px] font-mono transition',
                pm2Stream === s
                  ? (s === 'out'
                      ? 'bg-sky-600 text-white font-bold'
                      : 'bg-slate-500 text-white font-bold')
                  : 'text-slate-400 hover:text-slate-200'
              ]"
              :title="s === 'out'
                ? 'stdout — output normal program'
                : 'stderr — jalur untuk pesan error, tapi banyak aplikasi juga menulis log biasa di sini'"
            >
              {{ s === 'out' ? 'STDOUT' : 'STDERR' }}
            </button>
          </div>
        </div>

        <div class="flex items-center gap-1.5 shrink-0">
          <label class="flex items-center gap-1 text-[9px] cursor-pointer select-none"
            :class="useSudo ? 'text-amber-400' : 'text-slate-500'"
            :title="useSudo && sourceAvailable.dockerNeedsSudo
              ? 'Aktif otomatis: container ditemukan lewat sudo'
              : 'Jalankan perintah log dengan sudo'"
          >
            <input
              type="checkbox"
              v-model="useSudo"
              class="w-3 h-3 rounded bg-[#0d0f18] border-slate-600 accent-amber-500 cursor-pointer"
            />
            sudo
            <span v-if="useSudo && sourceAvailable.dockerNeedsSudo" class="text-[8px] text-amber-500/80">(auto)</span>
          </label>

          <button
            @click="loadSnapshot"
            :disabled="!selected || isLoadingLog"
            class="px-2 py-0.5 rounded text-[10px] font-mono bg-[#1a2030] hover:bg-[#252d42] text-slate-300 border border-[#2a3348] transition disabled:opacity-40 flex items-center gap-1"
            :title="`Ambil ${snapshotLines} baris terakhir`"
          >
            <Icon icon="lucide:download" class="w-3 h-3" />
            Snapshot {{ snapshotLines }}
          </button>

          <!-- How many lines a snapshot pulls -->
          <div class="flex items-center bg-[#1a2030] border border-[#2a3348] rounded p-0.5 gap-0.5 text-[9px] font-mono">
            <button
              v-for="opt in SNAPSHOT_OPTIONS"
              :key="opt"
              @click="snapshotLines = opt"
              :class="[
                'px-1.5 py-0.5 rounded transition',
                snapshotLines === opt
                  ? 'bg-sky-600 text-white font-bold'
                  : 'text-slate-400 hover:text-slate-200'
              ]"
              :title="`Snapshot ${opt} baris`"
            >
              {{ opt }}
            </button>
          </div>

          <!-- Log body search -->
          <div class="flex items-center bg-[#1a2030] border border-[#2a3348] rounded p-0.5">
            <Icon icon="lucide:search" class="w-3 h-3 ml-1 text-slate-500 shrink-0" />
            <input
              v-if="isSearchOpen"
              v-model="logSearch"
              type="text"
              placeholder="cari di log..."
              class="w-28 bg-transparent px-1.5 py-0.5 text-[10px] font-mono text-slate-200 placeholder-slate-600 focus:outline-none"
              @keydown.esc="logSearch = ''; isSearchOpen = false"
            />
            <button
              v-else
              @click="isSearchOpen = true"
              class="px-1.5 py-0.5 text-[10px] text-slate-400 hover:text-slate-200 transition"
              title="Cari di dalam log (Ctrl+F)"
            >
              Cari
            </button>
            <button
              v-if="logSearch"
              @click="logSearch = ''"
              class="px-1 py-0.5 text-slate-400 hover:text-rose-300 transition shrink-0"
              title="Bersihkan pencarian"
            >
              <Icon icon="lucide:x" class="w-2.5 h-2.5" />
            </button>
          </div>

          <!-- AI diagnosis -->
          <button
            @click="diagnoseWithAI"
          :disabled="!selected || !logLines.length || aiThinking || !aiAgentStore.activeProvider"
          class="px-2 py-0.5 rounded text-[10px] font-mono bg-purple-950/70 hover:bg-purple-900 border border-purple-700/60 text-purple-300 transition disabled:opacity-40 flex items-center gap-1"
          :title="!aiAgentStore.activeProvider
            ? 'AI Provider belum dipilih — atur di window utama BOBA'
            : 'Minta AI Copilot menganalisis log ini'"
          >
            <Icon :icon="aiThinking ? 'lucide:loader-2' : 'lucide:sparkles'" :class="['w-3 h-3', aiThinking ? 'animate-spin' : '']" />
            Diagnosa AI
          </button>

          <button
            v-if="!isLive"
            @click="startStream"
            :disabled="!selected || isStarting"
            class="px-2 py-0.5 rounded text-[10px] font-mono bg-emerald-950/60 hover:bg-emerald-900 border border-emerald-700/60 text-emerald-300 transition disabled:opacity-40 flex items-center gap-1"
            title="Pantau log secara realtime (tail -f)"
          >
            <Icon icon="lucide:play" class="w-3 h-3" />
            Live
          </button>
          <button
            v-else
            @click="stopStream"
            class="px-2 py-0.5 rounded text-[10px] font-mono bg-red-950/60 hover:bg-red-900 border border-red-700/60 text-red-300 transition flex items-center gap-1"
            title="Hentikan stream (proses tail akan mati di server)"
          >
            <Icon icon="lucide:square" class="w-3 h-3" />
            Stop
          </button>

          <button
            @click="isPaused = !isPaused"
            :disabled="!selected"
            class="px-1.5 py-0.5 rounded text-[10px] font-mono border transition disabled:opacity-40"
            :class="isPaused
              ? 'bg-amber-950/60 border-amber-700/60 text-amber-300'
              : 'bg-[#1a2030] border-[#2a3348] text-slate-400 hover:text-slate-200'"
            :title="isPaused ? 'Lanjutkan (buffer log tetap terkumpul)' : 'Jeda tampilan'"
          >
            <Icon :icon="isPaused ? 'lucide:play' : 'lucide:pause'" class="w-3 h-3" />
          </button>

          <button
            @click="wordWrap = !wordWrap"
            class="px-1.5 py-0.5 rounded text-[10px] font-mono border transition"
            :class="wordWrap
              ? 'bg-sky-950/60 border-sky-700/60 text-sky-300'
              : 'bg-[#1a2030] border-[#2a3348] text-slate-400 hover:text-slate-200'"
            title="Word wrap"
          >
            <Icon icon="lucide:wrap-text" class="w-3 h-3" />
          </button>

          <button
            @click="clearLog"
            :disabled="!logLines.length"
            class="px-1.5 py-0.5 rounded text-[10px] font-mono bg-[#1a2030] border border-[#2a3348] text-slate-400 hover:text-rose-300 transition disabled:opacity-40"
            title="Bersihkan tampilan"
          >
            <Icon icon="lucide:eraser" class="w-3 h-3" />
          </button>

          <button
            @click="copyLog"
            :disabled="!logLines.length"
            class="px-1.5 py-0.5 rounded text-[10px] font-mono bg-[#1a2030] border border-[#2a3348] text-slate-400 hover:text-sky-300 transition disabled:opacity-40"
            title="Salin semua log"
          >
            <Icon icon="lucide:copy" class="w-3 h-3" />
          </button>
        </div>
      </div>

      <!-- Error bar -->
      <div
        v-if="logError"
        class="px-2.5 py-1.5 bg-red-950/60 border-b border-red-900 text-red-300 text-[10px] font-mono flex items-center justify-between shrink-0"
      >
        <span class="truncate">{{ logError }}</span>
        <button
          v-if="logError.toLowerCase().includes('permission') || logError.toLowerCase().includes('denied')"
          @click="useSudo = true; loadSnapshot()"
          class="ml-2 px-1.5 py-0.5 rounded bg-red-900/60 hover:bg-red-800 text-[9px] shrink-0"
        >
          Coba dengan sudo
        </button>
      </div>

      <!-- Log body -->
      <!-- Search result summary -->
      <div
        v-if="logSearch && logLines.length"
        class="px-2.5 py-1 border-b border-[#1a2130] text-[9px] text-sky-400 font-mono flex items-center justify-between shrink-0"
      >
        <span>{{ visibleLines.length }} dari {{ logLines.length }} baris cocok</span>
        <button @click="logSearch = ''" class="text-slate-500 hover:text-rose-300 transition">
          <Icon icon="lucide:x" class="w-2.5 h-2.5" />
        </button>
      </div>

      <div
        ref="logScrollRef"
        class="relative flex-1 min-h-0 overflow-auto bg-[#07090e] select-text"
        @scroll.passive="handleLogScroll"
      >
        <div v-if="!logLines.length" class="h-full flex items-center justify-center">
          <div class="text-center text-[10px] text-slate-600 font-mono">
            <Icon icon="lucide:file-search" class="w-8 h-8 mx-auto mb-2 opacity-30" />
            <div>Pilih aplikasi di kiri, lalu klik Snapshot atau Live</div>
            <div class="mt-1 text-[9px] text-slate-700">
              Snapshot = {{ snapshotLines }} baris terakhir • Live = tail -f realtime
            </div>
          </div>
        </div>
        <div v-else-if="!visibleLines.length" class="h-full flex items-center justify-center">
          <div class="text-center text-[10px] text-slate-500 font-mono">
            <Icon icon="lucide:search-x" class="w-6 h-6 mx-auto mb-2 opacity-30" />
            <div>Tidak ada baris yang cocok</div>
            <div class="mt-1 text-[9px] text-slate-600">Filter: "{{ logSearch }}"</div>
          </div>
        </div>
        <div v-else class="p-1.5 font-mono text-[10px] leading-[1.45]">
          <div
            v-for="(line, i) in visibleLines"
            :key="i"
            :class="['px-1.5 whitespace-pre-wrap break-all', wordWrap ? 'break-all' : 'whitespace-pre']"
            :style="{ color: lineColor(line) }"
          >{{ line || ' ' }}</div>
        </div>

        <!-- Jump to newest, shown only after the user scrolls away from the bottom -->
        <button
          v-if="logLines.length && (!isPinnedToBottom || unseenLines > 0)"
          @click="jumpToLatest"
          class="absolute bottom-3 right-4 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-sky-600 hover:bg-sky-500 text-white text-[10px] font-semibold shadow-lg shadow-black/50 transition animate-fade-in"
          title="Lompat ke baris log terbaru"
        >
          <Icon icon="lucide:arrow-down" class="w-3 h-3" />
          <template v-if="unseenLines > 0">{{ unseenLines }} baris baru</template>
          <template v-else>Log terbaru</template>
        </button>
      </div>

      <!-- Inline AI diagnosis panel: the AI drawer is not rendered in this window -->
      <AiDiagnosisPanel
        v-if="aiPanelOpen"
        :answer="aiAnswer"
        :error="aiError"
        :thinking="aiThinking"
        :thinking-note="`Mengirim ${interestingLines.length} baris terpilih ke AI Copilot...`"
        :max-height-class="aiThinking ? 'max-h-64' : 'max-h-80'"
        @close="aiPanelOpen = false"
      />

      <!-- Footer -->
      <div class="px-2.5 py-1 border-t border-[#1a2130] flex items-center justify-between text-[9px] text-slate-600 font-mono shrink-0">
        <div class="flex items-center gap-2.5">
          <span>{{ visibleLines.length }} baris{{ isPaused ? ' (jeda)' : '' }}</span>
          <span
            v-if="unseenLines > 0"
            class="text-sky-400 flex items-center gap-0.5"
            title="Baris baru yang masuk saat kamu sedang membaca"
          >
            <Icon icon="lucide:plus-circle" class="w-2.5 h-2.5" />
            {{ unseenLines }} baru
          </span>
          <span v-if="logStats.errors" class="text-red-400 flex items-center gap-0.5" title="Baris yang mengandung kata error/failed/denied">
            <Icon icon="lucide:circle-alert" class="w-2.5 h-2.5" />
            {{ logStats.errors }} error
          </span>
          <span v-if="logStats.warnings" class="text-amber-400 flex items-center gap-0.5" title="Baris yang mengandung kata warn/deprecated">
            <Icon icon="lucide:triangle-alert" class="w-2.5 h-2.5" />
            {{ logStats.warnings }} warn
          </span>
          <span
            v-if="logLines.length && !logStats.errors && !logStats.warnings"
            class="text-emerald-500 flex items-center gap-0.5"
            title="Tidak ada baris error atau warning terdeteksi"
          >
            <Icon icon="lucide:circle-check" class="w-2.5 h-2.5" />
            bersih
          </span>
        </div>
        <span v-if="autoScroll" class="text-emerald-500 flex items-center gap-1">
          <Icon icon="lucide:arrow-down" class="w-2.5 h-2.5" />
          mengikuti log terbaru
        </span>
        <span v-else-if="logLines.length" class="text-amber-500 flex items-center gap-1">
          <Icon icon="lucide:history" class="w-2.5 h-2.5" />
          view sedang dibaca
        </span>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue';
import { Icon } from '@iconify/vue';
import { tauriBridge } from '../services/tauriBridge';
import {
  parseRunningApps,
  parseSourceAvailability,
  buildLogCommandWithSudo,
  buildLogExistsCommand,
  resolvePm2LogPath,
  type AppInfo,
  type AppKind,
  type SourceAvailability
} from '../utils/appsParser';
import { useAiAgentStore } from '../stores/aiAgentStore';
import { describeAiFailure } from '../utils/aiFailure';
import AiDiagnosisPanel from './AiDiagnosisPanel.vue';

const aiAgentStore = useAiAgentStore();

const props = defineProps<{ sessionId: string; hostTitle: string }>();

const MAX_LINES = 2000;

const apps = ref<AppInfo[]>([]);
const appsError = ref<string | null>(null);
const isLoadingApps = ref(false);
const appSearch = ref('');

const selected = ref<AppInfo | null>(null);
/** Which PM2 log the user is reading. PM2 keeps stdout and stderr in separate files. */
const pm2Stream = ref<'out' | 'error'>('out');
/** How many lines a snapshot pulls. */
const snapshotLines = ref(200);
const SNAPSHOT_OPTIONS = [100, 200, 500, 1000] as const;

/** Free-text filter applied to the log body. */
const logSearch = ref('');
const isSearchOpen = ref(false);

/** Lines that arrived while the user was paused or scrolled away. */
const unseenLines = ref(0);

type StreamStatus = 'idle' | 'live' | 'reconnecting' | 'failed';
const streamStatus = ref<StreamStatus>('idle');
const reconnectAttempt = ref(0);
let stopRequested = false;
let reconnectTimer: any = null;

/** Inline AI diagnosis, shown in this window because the AI drawer is not rendered here. */
const aiPanelOpen = ref(false);
const aiThinking = ref(false);
const aiAnswer = ref('');
const aiError = ref<string | null>(null);
const logLines = ref<string[]>([]);
const logError = ref<string | null>(null);
const isLoadingLog = ref(false);
const isStarting = ref(false);
const isLive = ref(false);
const isPaused = ref(false);
const wordWrap = ref(true);
const useSudo = ref(false);
const autoScroll = ref(true);
/** False once the user scrolls up, which reveals the "jump to latest" button. */
const isPinnedToBottom = ref(true);

const logScrollRef = ref<HTMLDivElement | null>(null);

/** Which app groups the user has folded away. A Set keeps toggling cheap. */
const collapsedGroups = ref<Set<AppKind>>(new Set());

/** Whether each runtime answered the scan, so empty groups can explain themselves. */
const sourceAvailable = ref<SourceAvailability>({
  pm2: null,
  docker: null,
  systemd: null,
  webroot: null,
  dockerNeedsSudo: false
});

let streamId: string | null = null;
let unlistenChunk: (() => void) | null = null;
let unlistenEnded: (() => void) | null = null;

const groupMeta: Record<AppKind, { label: string; color: string }> = {
  pm2: { label: 'PM2', color: 'text-[#32a852]' },
  docker: { label: 'Docker', color: 'text-[#2496ed]' },
  systemd: { label: 'Systemd', color: 'text-[#9aa4b2]' },
  webroot: { label: 'Web Root', color: 'text-[#d29922]' }
};

const APP_KIND_ORDER: AppKind[] = ['pm2', 'docker', 'systemd', 'webroot'];

const groupedApps = computed(() => {
  const q = appSearch.value.trim().toLowerCase();
  const filtered = q
    ? apps.value.filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          a.detail.toLowerCase().includes(q) ||
          a.kind.includes(q)
      )
    : apps.value;

  return APP_KIND_ORDER.map((kind) => ({
      kind,
      label: groupMeta[kind].label,
      items: filtered.filter((a) => a.kind === kind),
      emptyHint: emptyHintFor(kind)
    }))
    .filter((g) => g.items.length > 0 || (g.emptyHint !== null && !appSearch.value.trim()));
});

/** Why a group is empty, so the user is not left staring at a blank list. */
function emptyHintFor(kind: AppKind): string | null {
  const hints: Record<AppKind, [found: string, missing: string, idle: string]> = {
    pm2: [
      'PM2 terpasang tapi tidak ada aplikasi yang jalan.',
      'pm2 tidak ditemukan di server ini.',
      'Status PM2 tidak dapat dipastikan.'
    ],
    docker: [
      'Docker jalan tapi tidak ada container aktif.',
      'docker tidak ditemukan atau tidak aktif.',
      'Status Docker tidak dapat dipastikan.'
    ],
    systemd: [
      'Tidak ada service systemd yang running.',
      'systemctl tidak tersedia (kemungkinan bukan systemd).',
      'Status systemd tidak dapat dipastikan.'
    ],
    webroot: [
      'Document root kosong — tidak ada aplikasi yang terdeteksi.',
      'Tidak ada document root yang bisa dibaca (/var/www, /srv/http).',
      'Status document root tidak dapat dipastikan.'
    ]
  };

  const avail = sourceAvailable.value[kind];

  // A permission error is not the same as "docker is not running": saying
  // "not found" here would send the user looking in the wrong place.
  if (kind === 'docker' && avail === false && sourceAvailable.value.dockerNeedsSudo) {
    return 'docker butuh sudo — tidak ada container yang terlihat tanpa akses root.';
  }

  // `null` means the backend is older than the availability probe, so claiming
  // "not found" would be a guess. Say so instead.
  if (avail === null) return hints[kind][2];
  return avail ? hints[kind][0] : hints[kind][1];
}

function statusColor(status: string): string {
  const s = status.toLowerCase();
  if (s.includes('error') || s.includes('failed') || s.includes('exited') || s.includes('dead')) {
    return 'bg-red-400';
  }
  if (s.includes('online') || s.includes('running') || s.includes('active') || s.includes('up')) {
    return 'bg-emerald-400';
  }
  return 'bg-slate-500';
}

function toggleGroup(kind: AppKind) {
  // Replace the Set so Vue sees the mutation.
  const next = new Set(collapsedGroups.value);
  if (next.has(kind)) {
    next.delete(kind);
  } else {
    next.add(kind);
  }
  collapsedGroups.value = next;
}

const allCollapsed = computed(
  () => groupedApps.value.length > 0 && groupedApps.value.every((g) => collapsedGroups.value.has(g.kind))
);

function toggleAllGroups() {
  const next = new Set<AppKind>();
  if (!allCollapsed.value) {
    for (const g of groupedApps.value) next.add(g.kind);
  }
  collapsedGroups.value = next;
}

function isSelectedInside(items: AppInfo[]): boolean {
  if (!selected.value) return false;
  return items.some((a) => a.name === selected.value?.name && a.kind === selected.value?.kind);
}

// Severity is judged from the line's own content, never from which stream it
// came out of — a healthy app may log its successes to stderr.
const ERROR_RE = /\b(error|err|fatal|panic|exception|failed|failure|denied|refused|cannot|could not|unable)\b/i;
const WARN_RE = /\b(warn|warning|deprecated)\b/i;
const INFO_RE = /\b(info|notice|debug)\b/i;

function lineColor(line: string): string {
  if (ERROR_RE.test(line)) return '#f87171';
  if (WARN_RE.test(line)) return '#fbbf24';
  if (INFO_RE.test(line)) return '#7dd3fc';
  if (/^\s+at\s|Traceback|^\s*\^+\s*$/.test(line)) return '#94a3b8';
  return '#cbd5e1';
}

/** Live tally of what is actually in the loaded lines, for a quick health read. */
const logStats = computed(() => {
  let errors = 0;
  let warnings = 0;
  for (const line of logLines.value) {
    if (ERROR_RE.test(line)) errors++;
    else if (WARN_RE.test(line)) warnings++;
  }
  return { errors, warnings };
});

/** The lines actually rendered, after the search filter is applied. */
const visibleLines = computed(() => {
  const q = logSearch.value.trim().toLowerCase();
  if (!q) return logLines.value;
  return logLines.value.filter((l) => l.toLowerCase().includes(q));
});

/** Feed the AI only the lines that look wrong; 2000 lines of noise is useless. */
const interestingLines = computed(() => {
  const flagged = visibleLines.value.filter((l) => ERROR_RE.test(l) || WARN_RE.test(l));
  if (flagged.length >= 10) return flagged.slice(-120);
  const tail = visibleLines.value.slice(-60);
  return flagged.length ? [...flagged.slice(-60), '--- context ---', ...tail] : tail;
});

const streamStatusLabel = computed(() => {
  switch (streamStatus.value) {
    case 'live':
      return 'LIVE';
    case 'reconnecting':
      return `RECONNECT ${reconnectAttempt.value}/${MAX_RECONNECT_ATTEMPTS}`;
    case 'failed':
      return 'PUTUS';
    default:
      return 'IDLE';
  }
});

async function loadApps() {
  if (!props.sessionId) return;
  isLoadingApps.value = true;
  appsError.value = null;
  try {
    const raw = await tauriBridge.sshListRunningApps(props.sessionId);
    apps.value = parseRunningApps(raw);
    sourceAvailable.value = parseSourceAvailability(raw);
  } catch (err: any) {
    appsError.value = `Gagal membaca daftar aplikasi: ${err.message || err}`;
    apps.value = [];
  } finally {
    isLoadingApps.value = false;
  }
}

async function switchPm2Stream(stream: 'out' | 'error') {
  if (pm2Stream.value === stream) return;
  if (isLive.value) await stopStream();
  pm2Stream.value = stream;
  logLines.value = [];
  logError.value = null;
  autoScroll.value = true;
  isPinnedToBottom.value = true;
  unseenLines.value = 0;
  await loadSnapshot();
}

async function selectApp(app: AppInfo) {
  if (isLive.value) await stopStream();
  selected.value = app;
  logLines.value = [];
  logError.value = null;
  isPaused.value = false;
  pm2Stream.value = 'out';
  unseenLines.value = 0;
  aiAnswer.value = '';
  aiError.value = null;
  logSearch.value = '';
  // A fresh log should always open on the newest lines, not the top of history.
  autoScroll.value = true;
  isPinnedToBottom.value = true;

  // The container scan may have needed sudo; reading that container's log needs
  // the same escalation, so carry it over instead of making the user discover it.
  if (app.kind === 'docker' && sourceAvailable.value.dockerNeedsSudo) {
    useSudo.value = true;
  }

  await loadSnapshot();
}

/**
 * Ask the AI to read the log.
 *
 * Routed through `runEphemeralAnalysis` rather than `sendPromptWithContext`:
 * this window has no AI drawer, so the drawer-routed answer would land nowhere
 * visible, its bail-out guards would fire UI that does not exist here, and the
 * prompt would be written into the user's real chat history.
 */
async function diagnoseWithAI() {
  if (!selected.value || !props.sessionId || aiThinking.value) return;
  const lines = interestingLines.value;
  if (!lines.length) {
    aiPanelOpen.value = true;
    aiError.value = 'Tidak ada baris log untuk dianalisa.';
    return;
  }

  aiPanelOpen.value = true;
  aiThinking.value = true;
  aiError.value = null;
  aiAnswer.value = '';

  const target = logTargetFor(selected.value);
  const stats = logStats.value;
  const prompt = [
    `Analisis log "${selected.value.name}" (${selected.value.kind}) dari server ${props.hostTitle}.`,
    `Sumber: ${target.name} | ${logLines.value.length} baris terbaca, ${stats.errors} error, ${stats.warnings} warning.`,
    logSearch.value.trim() ? `Filter pencarian aktif: "${logSearch.value.trim()}".` : '',
    '',
    'Baris terkait:',
    '```',
    lines.join('\n'),
    '```',
    '',
    'Jelaskan penyebab utama, dampak, dan langkah perbaikan yang konkret.'
  ].filter(Boolean).join('\n');

  try {
    aiAnswer.value = await aiAgentStore.runEphemeralAnalysis(prompt, props.sessionId);
  } catch (err) {
    aiError.value = describeAiFailure(err);
  } finally {
    aiThinking.value = false;
  }
}

function logTargetFor(app: AppInfo) {
  if (app.kind === 'pm2') {
    // Use the path the PM2 daemon reported; ecosystem files can rename the logs,
    // so the conventional ~/.pm2/logs/<name>-out.log is often the wrong file.
    return {
      kind: 'file' as const,
      name: resolvePm2LogPath(app, pm2Stream.value)
    };
  }
  if (app.kind === 'webroot') {
    // The scan already looked for a framework log on disk, so `logFile` is only
    // set when it really exists. An app with no log must not be tailed blindly.
    return { kind: 'file' as const, name: app.logFile || '' };
  }
  return { kind: app.kind, name: app.name };
}

/** Deployed apps often have no application log at all; say why up front. */
function hasLogTarget(app: AppInfo): boolean {
  const target = logTargetFor(app);
  if (target.kind === 'file') return Boolean(target.name);
  return true;
}

/** Confirm the file is really there so we can explain a missing log. */
async function logFileMissing(): Promise<boolean> {
  const target = logTargetFor(selected.value!);
  if (target.kind !== 'file' || !props.sessionId) return false;
  try {
    const out = await tauriBridge.sshExecCommand(
      props.sessionId,
      buildLogExistsCommand(target.name)
    );
    return out.includes('__BOBA_MISSING__');
  } catch {
    return false;
  }
}

function missingLogMessage(): string {
  const app = selected.value;
  const target = logTargetFor(app!);
  if (app?.kind === 'webroot') {
    return `Aplikasi ${app.name} (${app.detail}) tidak punya file log yang bisa dibaca di ${app.path}. `
      + `Untuk PHP biasanya log-nya ada di log sistem (journalctl / /var/log/nginx/error.log).`;
  }
  return `File log tidak ditemukan: ${target.name}. PM2 mungkin menulis log ke lokasi lain — cek dengan: pm2 describe ${app?.name}`;
}

async function loadSnapshot() {
  if (!selected.value || !props.sessionId) return;
  isLoadingLog.value = true;
  logError.value = null;
  try {
    if (!hasLogTarget(selected.value)) {
      logError.value = missingLogMessage();
      logLines.value = [];
      return;
    }
    if (await logFileMissing()) {
      logError.value = missingLogMessage();
      logLines.value = [];
      return;
    }
    const cmd = buildLogCommandWithSudo(logTargetFor(selected.value), snapshotLines.value, false, useSudo.value);
    const out = await tauriBridge.sshExecCommand(props.sessionId, cmd);
    logLines.value = out.split('\n').slice(-MAX_LINES);
    unseenLines.value = 0;
    await scrollToBottom();
  } catch (err: any) {
    logError.value = err.message || String(err);
    logLines.value = [];
  } finally {
    isLoadingLog.value = false;
  }
}

async function startStream() {
  if (!selected.value || !props.sessionId) return;
  if (isStarting.value) return;
  isStarting.value = true;
  logError.value = null;
  try {
    if (await logFileMissing()) {
      logError.value = missingLogMessage();
      return;
    }
    const target = logTargetFor(selected.value);
    const cmd = buildLogCommandWithSudo(target, snapshotLines.value, true, useSudo.value);
    const label = `${target.kind}:${target.name}`;
    const id = await tauriBridge.sshStartLogStream(props.sessionId, cmd, label);
    streamId = id;

    unlistenChunk = await tauriBridge.onLogStreamChunk(id, (chunk: string) => {
      for (const raw of chunk.split('\n')) {
        if (raw === '' && logLines.value.length === 0) continue;
        logLines.value.push(raw);
      }
      if (logLines.value.length > MAX_LINES) {
        logLines.value.splice(0, logLines.value.length - MAX_LINES);
      }
      // While paused or scrolled away, only count what is arriving so the user
      // knows how much they are missing instead of silently losing track of it.
      if (isPaused.value || !isPinnedToBottom.value) {
        unseenLines.value += 1;
      } else {
        nextTick(() => scrollToBottom());
      }
    });

    unlistenEnded = await tauriBridge.onLogStreamEnded(id, () => {
      isLive.value = false;
      streamId = null;
      unlistenChunk = null;
      unlistenEnded = null;
      // A stream that ends on its own means the connection dropped. Silently
      // going idle would leave the user believing the log is still arriving.
      if (!stopRequested) scheduleReconnect();
    });

    isLive.value = true;
    isPaused.value = false;
    unseenLines.value = 0;
    streamStatus.value = 'live';
    reconnectAttempt.value = 0;
  } catch (err: any) {
    logError.value = err.message || String(err);
    isLive.value = false;
    streamId = null;
    if (!stopRequested) scheduleReconnect();
  } finally {
    isStarting.value = false;
  }
}

const MAX_RECONNECT_ATTEMPTS = 5;

/** Retry a stream that died with the connection, backing off each attempt. */
function scheduleReconnect() {
  if (reconnectTimer) return;
  if (reconnectAttempt.value >= MAX_RECONNECT_ATTEMPTS) {
    streamStatus.value = 'failed';
    logError.value = `Stream terputus ${MAX_RECONNECT_ATTEMPTS}x. Klik Live untuk mencoba lagi.`;
    return;
  }
  reconnectAttempt.value += 1;
  streamStatus.value = 'reconnecting';
  const delay = Math.min(1000 * 2 ** (reconnectAttempt.value - 1), 15000);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    if (stopRequested) return;
    startStream();
  }, delay);
}

function cancelReconnect() {
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  reconnectAttempt.value = 0;
  streamStatus.value = 'idle';
}

async function stopStream() {
  stopRequested = true;
  cancelReconnect();
  if (!streamId) {
    isLive.value = false;
    return;
  }
  const id = streamId;
  try {
    await tauriBridge.sshStopLogStream(id);
  } catch {
    // Stream may already be gone on the server; nothing to clean up.
  }
  if (unlistenChunk) unlistenChunk();
  if (unlistenEnded) unlistenEnded();
  unlistenChunk = null;
  unlistenEnded = null;
  streamId = null;
  isLive.value = false;
  streamStatus.value = 'idle';
}

async function scrollToBottom() {
  // The log rows must exist before we can measure them, otherwise scrollHeight is
  // still the old value and the jump lands in the wrong place.
  await nextTick();
  const el = logScrollRef.value;
  if (!el || !autoScroll.value) return;
  el.scrollTop = el.scrollHeight;
}

/** Jump to the newest line and re-arm auto-follow. */
async function jumpToLatest() {
  autoScroll.value = true;
  isPinnedToBottom.value = true;
  unseenLines.value = 0;
  await nextTick();
  const el = logScrollRef.value;
  if (!el) return;
  el.scrollTop = el.scrollHeight;
}

/**
 * Scrolling up means the user is reading history, so stop yanking the view back
 * to the bottom on every new chunk.
 */
function handleLogScroll() {
  const el = logScrollRef.value;
  if (!el) return;
  const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
  const atBottom = distanceFromBottom < 24;
  autoScroll.value = atBottom;
  isPinnedToBottom.value = atBottom;
  if (atBottom) unseenLines.value = 0;
}

function clearLog() {
  logLines.value = [];
}

async function copyLog() {
  try {
    await navigator.clipboard.writeText(logLines.value.join('\n'));
  } catch {
    // Clipboard may be unavailable; silent.
  }
}

watch(isPaused, (paused) => {
  if (!paused) scrollToBottom();
});

onMounted(() => {
  loadApps();
});

// Critical: never leave a `tail -f` running on the user's server.
onUnmounted(() => {
  stopRequested = true;
  cancelReconnect();
  if (streamId) {
    tauriBridge.sshStopLogStream(streamId).catch(() => {});
    streamId = null;
  }
  if (unlistenChunk) unlistenChunk();
  if (unlistenEnded) unlistenEnded();
});
</script>
