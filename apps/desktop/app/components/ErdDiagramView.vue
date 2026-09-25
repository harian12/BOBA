<template>
  <div class="h-full w-full flex flex-col bg-[#080b11] text-slate-100 font-sans overflow-hidden select-none">
    <!-- ERD Toolbar -->
    <div class="h-9 px-3 bg-[#0f1420] border-b border-boba-800 flex items-center justify-between text-xs shrink-0 font-mono">
      <div class="flex items-center space-x-2">
        <Icon icon="lucide:network" class="w-4 h-4 text-sky-400" />
        <span class="font-bold text-slate-200">Interactive ERD Diagram</span>
        <span class="text-[11px] text-slate-500">({{ filteredTables.length }} Tabel, {{ computedLines.length }}<template v-if="lineResult.unresolved.length > 0">/{{ foreignKeys.length }}</template> Relasi FK)</span>
      </div>

      <div class="flex items-center space-x-2">
        <!-- Zoom Controls & Ctrl+Scroll Indicator -->
        <div class="flex items-center bg-boba-950 border border-boba-750 rounded p-0.5 space-x-0.5">
          <button
            @click="zoomOut"
            :disabled="zoom <= 0.3"
            title="Zoom Out (Ctrl + Scroll Down)"
            class="p-1 hover:bg-boba-800 disabled:opacity-30 rounded text-slate-300 hover:text-white transition"
          >
            <Icon icon="lucide:zoom-out" class="w-3.5 h-3.5" />
          </button>
          <button
            @click="resetZoom"
            title="Reset Zoom 100% (Klik untuk reset)"
            class="px-1.5 py-0.5 hover:bg-boba-800 text-[10px] text-sky-300 font-bold rounded transition font-mono min-w-[42px] text-center"
          >
            {{ Math.round(zoom * 100) }}%
          </button>
          <button
            @click="zoomIn"
            :disabled="zoom >= 2.0"
            title="Zoom In (Ctrl + Scroll Up)"
            class="p-1 hover:bg-boba-800 disabled:opacity-30 rounded text-slate-300 hover:text-white transition"
          >
            <Icon icon="lucide:zoom-in" class="w-3.5 h-3.5" />
          </button>
        </div>

        <!-- Fit to Screen Button -->
        <button
          @click="fitToScreen"
          title="Paskan Seluruh Diagram ke Layar (Fit to Screen)"
          class="px-2.5 py-1 bg-boba-800 hover:bg-boba-700 text-sky-300 hover:text-white rounded text-xs transition flex items-center space-x-1.5"
        >
          <Icon icon="lucide:minimize-2" class="w-3.5 h-3.5" />
          <span>Fit Screen</span>
        </button>

        <!-- Reorganize / Reset Layout -->
        <button
          @click="resetGridLayout"
          title="Tata Ulang Posisi Tabel ke Grid Rapi"
          class="px-2.5 py-1 bg-boba-800 hover:bg-boba-700 text-slate-300 rounded text-xs transition flex items-center space-x-1.5"
        >
          <Icon icon="lucide:layout-grid" class="w-3.5 h-3.5" />
          <span>Reset Grid</span>
        </button>

        <!-- Toggle Relation Lines Button -->
        <button
          @click="showLines = !showLines"
          :class="[
            'px-2.5 py-1 rounded text-xs transition flex items-center space-x-1.5 border',
            showLines ? 'bg-sky-950 border-sky-600/70 text-sky-300 font-bold' : 'bg-boba-950 border-boba-700 text-slate-400 hover:text-slate-200'
          ]"
          title="Tampilkan / Sembunyikan Garis Konektor Relasi SVG"
        >
          <Icon icon="lucide:link" class="w-3.5 h-3.5" />
          <span>Garis: {{ showLines ? 'ON' : 'OFF' }}</span>
        </button>

        <!-- Export Diagram Button -->
        <button
          @click="exportDiagramAsSvg"
          title="Export ERD Diagram ke Gambar Vektor SVG"
          class="px-2.5 py-1 bg-emerald-950/80 hover:bg-emerald-800 text-emerald-300 hover:text-white rounded text-xs transition flex items-center space-x-1.5 border border-emerald-700/60"
        >
          <Icon icon="lucide:download" class="w-3.5 h-3.5 text-emerald-400" />
          <span>Export SVG</span>
        </button>

        <!-- Search with Quick Jump / Auto-Focus -->
        <div class="relative flex items-center">
          <input
            v-model="searchQuery"
            @keydown.enter="handleSearchEnter"
            list="erd-tables-datalist"
            type="text"
            placeholder="Cari & Lompat ke tabel..."
            class="bg-boba-950 border border-boba-700 focus:border-sky-500 rounded px-2.5 py-1 text-xs text-slate-200 placeholder-slate-500 focus:outline-none w-48 font-mono"
          />
          <datalist id="erd-tables-datalist">
            <option v-for="t in tables" :key="t.name" :value="t.name" />
          </datalist>
        </div>

        <button
          @click="loadForeignKeys"
          :disabled="loading"
          class="px-2.5 py-1 bg-boba-800 hover:bg-boba-700 text-slate-200 rounded text-xs transition flex items-center space-x-1.5"
        >
          <Icon icon="lucide:refresh-cw" :class="['w-3.5 h-3.5', loading ? 'animate-spin' : '']" />
          <span>Refresh</span>
        </button>
      </div>
    </div>

    <!-- Free-Floating Draggable & Pannable Canvas Area (Left Click Canvas to Pan, Ctrl+Scroll to Zoom) -->
    <div
      ref="canvasRef"
      @mousedown="handleCanvasMouseDown"
      @wheel="handleCanvasWheel"
      :class="[
        'flex-1 overflow-auto bg-[radial-gradient(#1e293b_1.2px,transparent_1.2px)] [background-size:20px_20px] relative select-none',
        isPanning ? 'cursor-grabbing' : 'cursor-grab'
      ]"
      title="Klik kiri & geser di area kosong untuk menggeser canvas (Pan). Ctrl+Scroll untuk Zoom."
    >
      <!-- Scaled Virtual Canvas Container -->
      <div
        class="relative origin-top-left"
        :style="{
          minWidth: canvasSize.minWidth,
          minHeight: canvasSize.minHeight,
          transform: `scale(${zoom})`,
          transformOrigin: '0 0'
        }"
      >
        <!-- SVG Overlay for Dynamic Relation Connector Lines -->
        <svg
          v-if="showLines && computedLines.length > 0"
          class="absolute inset-0 pointer-events-none z-10 w-full h-full overflow-visible"
        >
          <defs>
            <marker
              :id="`${uid}-arrow`"
              viewBox="0 0 10 10"
              refX="6"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 10 5 L 0 9 z" fill="#38bdf8" />
            </marker>
            <marker
              :id="`${uid}-arrow-active`"
              viewBox="0 0 10 10"
              refX="6"
              refY="5"
              markerWidth="8"
              markerHeight="8"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 10 5 L 0 9 z" fill="#34d399" />
            </marker>
          </defs>

          <path
            v-for="line in computedLines"
            :key="line.id"
            :d="line.d"
            fill="none"
            :stroke="activeRelationId === line.id ? '#34d399' : '#0284c7'"
            :stroke-width="activeRelationId === line.id ? 3.5 : 1.8"
            :stroke-dasharray="activeRelationId === line.id ? 'none' : '5,4'"
            :marker-end="activeRelationId === line.id ? `url(#${uid}-arrow-active)` : `url(#${uid}-arrow)`"
            class="transition-all duration-100"
          />
        </svg>

        <div
          v-if="loadError"
          class="absolute top-4 left-1/2 -translate-x-1/2 z-30 px-4 py-2 rounded-lg bg-boba-950/95 border border-amber-700/60 text-amber-300 text-xs font-mono"
        >
          Gagal memuat foreign key: {{ loadError }}
        </div>

        <div
          v-if="loading"
          class="absolute top-4 left-1/2 -translate-x-1/2 z-30 px-4 py-2 rounded-lg bg-boba-950/95 border border-boba-700 text-slate-400 text-xs font-mono"
        >
          Memuat metadata relasi &amp; foreign keys...
        </div>

        <div
          v-else-if="filteredTables.length === 0"
          class="absolute top-24 left-0 right-0 text-center text-slate-500 text-xs font-mono"
        >
          Tidak ada tabel untuk ditampilkan di diagram.
        </div>

        <div
          v-else-if="foreignKeys.length === 0"
          class="absolute top-12 left-0 right-0 px-8 text-center text-slate-500 text-xs font-mono"
        >
          Tidak ada relasi foreign key pada database {{ activeDb || '(default)' }} — relasi akan
          muncul otomatis begitu skema selesai dimuat.
        </div>

        <!-- Draggable Floating Entity Table Cards -->
        <template v-if="filteredTables.length > 0">
          <div
            v-for="tbl in filteredTables"
            :key="tableKey(tbl)"
            :data-erd-table="tbl.name"
            :style="{
              position: 'absolute',
              left: `${getTablePos(tbl).x}px`,
              top: `${getTablePos(tbl).y}px`,
              width: '320px',
              zIndex: draggingTableKey === tableKey(tbl) ? 50 : (isTableHighlighted(tbl.name) ? 40 : 20)
            }"
            :class="[
              'bg-[#111726] border rounded-xl shadow-2xl overflow-hidden flex flex-col select-none transition-shadow cursor-default',
              draggingTableKey === tableKey(tbl) ? 'ring-2 ring-sky-400 shadow-sky-500/30' : '',
              isTableHighlighted(tbl.name)
                ? 'border-emerald-400 ring-2 ring-emerald-500/60 shadow-emerald-500/20'
                : 'border-boba-700 hover:border-sky-500/80 hover:shadow-sky-500/10'
            ]"
          >
            <!-- Draggable Table Header -->
            <div
              @mousedown.stop="startDragTable(tbl, $event)"
              class="px-3 py-2 bg-[#141b2d] border-b border-boba-700 flex items-center justify-between cursor-grab active:cursor-grabbing hover:bg-sky-950/60 transition"
              title="Tahan dan geser (Drag) untuk memindahkan posisi tabel ini"
            >
              <div class="flex items-center space-x-2 truncate mr-2 pointer-events-none">
                <Icon icon="lucide:table" class="w-3.5 h-3.5 text-sky-400 shrink-0" />
                <span class="font-bold text-xs text-sky-200 font-mono truncate">{{ tbl.name }}</span>
                <span v-if="tbl.schema" class="text-[9px] text-slate-600 font-mono shrink-0">{{ tbl.schema }}</span>
              </div>
              <span class="text-[9px] px-1.5 py-0.5 bg-boba-950 text-slate-400 rounded font-mono shrink-0 pointer-events-none border border-boba-800">
                {{ tbl.columns.length }} cols
              </span>
            </div>

            <!-- Table Columns List -->
            <div class="divide-y divide-boba-850 p-1 max-h-72 overflow-y-auto font-mono text-[11px] bg-[#0c101c]">
              <div
                v-for="c in tbl.columns"
                :key="c.name"
                class="px-2.5 py-1.5 flex items-center justify-between hover:bg-boba-800/40 rounded transition group"
              >
                <!-- Column Name & Key Marker -->
                <div class="flex items-center space-x-1.5 truncate min-w-0 flex-1 mr-2">
                  <Icon v-if="c.is_primary_key" icon="lucide:key" class="w-3 h-3 text-amber-400 shrink-0" title="Primary Key" />
                  <Icon v-else-if="isFkColumnOf(tbl, c.name)" icon="lucide:link" class="w-3 h-3 text-sky-400 shrink-0" title="Foreign Key" />
                  <span v-else class="text-slate-600 text-xs shrink-0">•</span>
                  <span
                    :class="[
                      'truncate text-xs',
                      c.is_primary_key ? 'font-bold text-amber-200' : (isFkColumnOf(tbl, c.name) ? 'font-semibold text-sky-300' : 'text-slate-300')
                    ]"
                    :title="c.name"
                  >
                    {{ c.name }}
                  </span>
                </div>

                <!-- Compact Clean Data Type Badge -->
                <span
                  class="text-[10px] px-1.5 py-0.5 bg-boba-950/80 text-slate-400 rounded shrink-0 max-w-[130px] truncate border border-boba-800/50"
                  :title="c.data_type"
                >
                  {{ formatDataType(c.data_type) }}
                </span>
              </div>
            </div>

            <!-- Outgoing Relations Footer Badge -->
            <div v-if="getTableRelations(tbl).length > 0" class="p-2.5 bg-boba-950/90 border-t border-boba-800 space-y-1.5">
              <div class="text-[9px] uppercase font-bold text-slate-500 font-mono flex items-center space-x-1">
                <Icon icon="lucide:git-fork" class="w-3 h-3 text-slate-500" />
                <span>Relasi Foreign Key:</span>
              </div>
              <div
                v-for="rel in getTableRelations(tbl)"
                :key="resolveLineId(rel)"
                @mouseenter="highlightRelation(rel)"
                @mouseleave="clearHighlight"
                @click="focusTable(rel.to_table)"
                class="text-[10px] text-sky-300 font-mono flex items-center space-x-1.5 truncate bg-sky-950/50 hover:bg-sky-900/70 px-2 py-0.5 rounded border border-sky-900/50 cursor-pointer transition"
                :title="`Klik untuk geser & fokus ke ${rel.to_table}.${rel.to_column}`"
              >
                <span class="text-slate-400 font-bold truncate max-w-[90px]">{{ rel.from_column }}</span>
                <span class="text-slate-600 shrink-0">→</span>
                <span class="text-emerald-300 font-semibold truncate max-w-[120px]">{{ rel.to_table }}.{{ rel.to_column }}</span>
              </div>
            </div>
          </div>
        </template>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { Icon } from '@iconify/vue';
import { tauriBridge } from '../services/tauriBridge.js';
import {
  GRID_ORIGIN_X,
  GRID_ORIGIN_Y,
  buildErSvg,
  buildPositions,
  buildRelationLines,
  computeExtent,
  defaultPosition,
  formatDataType,
  isFkColumn,
  relationsOf,
  resolveLineId,
  tableKey,
  type ErdPoint,
} from '../utils/erdLayout.js';
import type { DbConnectionConfig, DbTableMeta, DbForeignKeyRelation } from '../types/index.js';

const uid = `erd${Math.random().toString(36).slice(2, 8)}`;

const props = defineProps<{
  dbConfig?: DbConnectionConfig | null;
  activeDb?: string;
  tables: DbTableMeta[];
}>();

const loading = ref(false);
const loadError = ref<string | null>(null);
const searchQuery = ref('');
const foreignKeys = ref<DbForeignKeyRelation[]>([]);
const showLines = ref(true);

// Zoom Controls
const zoom = ref(1.0);

const canvasRef = ref<HTMLElement | null>(null);

// Panning State (Click & Drag on empty canvas background)
const isPanning = ref(false);
let panStart = { x: 0, y: 0, scrollLeft: 0, scrollTop: 0 };

// User-dragged positions only; every table always resolves to a coordinate
// through `positions`, so relations never disappear because a layout is partial.
const tablePositions = ref<Record<string, ErdPoint>>({});
const draggingTableKey = ref<string | null>(null);
let dragOffset = { x: 0, y: 0 };

const activeRelationId = ref<string | null>(null);
const highlightedTables = ref<string[]>([]);

const positions = computed(() => buildPositions(props.tables, tablePositions.value));

const lineResult = computed(() =>
  buildRelationLines(foreignKeys.value, props.tables, positions.value)
);

const computedLines = computed(() => (showLines.value ? lineResult.value.lines : []));

const extent = computed(() => computeExtent(props.tables, foreignKeys.value, positions.value));

const canvasSize = computed(() => ({
  minWidth: `${Math.max(1200, Math.round(extent.value.maxX + 200))}px`,
  minHeight: `${Math.max(900, Math.round(extent.value.maxY + 200))}px`,
}));

const filteredTables = computed(() => {
  if (!searchQuery.value.trim()) return props.tables;
  const q = searchQuery.value.toLowerCase();
  return props.tables.filter(t => t.name.toLowerCase().includes(q));
});

function handleSearchEnter() {
  const q = searchQuery.value.trim().toLowerCase();
  if (!q) return;
  const match = props.tables.find(t => t.name.toLowerCase() === q) || props.tables.find(t => t.name.toLowerCase().includes(q));
  if (match) {
    focusTable(match.name);
  }
}

function exportDiagramAsSvg() {
  if (props.tables.length === 0) return;
  if (foreignKeys.value.length === 0) {
    console.warn('[ERD] Export tanpa relasi: belum ada foreign key yang dimuat untuk database ini.');
  }

  const svgContent = buildErSvg({
    tables: props.tables,
    relations: foreignKeys.value,
    positions: positions.value,
    idPrefix: uid,
  });

  const blob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `erd_${(props.activeDb || 'diagram').replace(/[^\w.-]+/g, '_')}_${Date.now()}.svg`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

function setZoom(val: number) {
  zoom.value = Math.min(2.0, Math.max(0.3, Math.round(val * 100) / 100));
}

function zoomIn() {
  setZoom(zoom.value + 0.1);
}

function zoomOut() {
  setZoom(zoom.value - 0.1);
}

function resetZoom() {
  setZoom(1.0);
}

function handleCanvasWheel(e: WheelEvent) {
  if (e.ctrlKey || e.metaKey) {
    e.preventDefault();
    const delta = e.deltaY < 0 ? 0.08 : -0.08;
    setZoom(zoom.value + delta);
  }
}

// Canvas Panning Handlers (Left-click & Drag Canvas)
function handleCanvasMouseDown(e: MouseEvent) {
  if (e.button !== 0 && e.button !== 1) return; // Left or middle click
  const target = e.target as HTMLElement | null;
  if (target && (target.closest('[data-erd-table]') || target.closest('button, input, select, textarea'))) {
    return;
  }

  if (!canvasRef.value) return;
  isPanning.value = true;
  panStart = {
    x: e.clientX,
    y: e.clientY,
    scrollLeft: canvasRef.value.scrollLeft,
    scrollTop: canvasRef.value.scrollTop,
  };

  window.addEventListener('mousemove', onCanvasPanMouseMove);
  window.addEventListener('mouseup', onCanvasPanMouseUp);
}

function onCanvasPanMouseMove(e: MouseEvent) {
  if (!isPanning.value || !canvasRef.value) return;
  const dx = e.clientX - panStart.x;
  const dy = e.clientY - panStart.y;
  canvasRef.value.scrollLeft = panStart.scrollLeft - dx;
  canvasRef.value.scrollTop = panStart.scrollTop - dy;
}

function onCanvasPanMouseUp() {
  isPanning.value = false;
  window.removeEventListener('mousemove', onCanvasPanMouseMove);
  window.removeEventListener('mouseup', onCanvasPanMouseUp);
}

const storageKey = computed(() => {
  const dbId = props.dbConfig?.id || 'local';
  const dbName = props.activeDb || 'default';
  return `boba_erd_pos_${dbId}_${dbName}`;
});

function savePositionsToStorage() {
  try {
    localStorage.setItem(storageKey.value, JSON.stringify(tablePositions.value));
  } catch (e) {
    console.debug('Failed to save ERD positions:', e);
  }
}

function loadPositionsFromStorage() {
  try {
    const saved = localStorage.getItem(storageKey.value);
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed && typeof parsed === 'object') {
        tablePositions.value = parsed;
        return;
      }
    }
  } catch (e) {
    console.debug('Failed to load ERD positions:', e);
  }
  tablePositions.value = {};
}

function fitToScreen() {
  if (!canvasRef.value || props.tables.length === 0) return;
  const { minX, minY, width, height } = extent.value;

  const diagramWidth = width + 160;
  const diagramHeight = height + 160;

  const viewWidth = canvasRef.value.clientWidth || 1000;
  const viewHeight = canvasRef.value.clientHeight || 700;

  const scaleX = viewWidth / diagramWidth;
  const scaleY = viewHeight / diagramHeight;
  const optimalZoom = Math.min(scaleX, scaleY);

  setZoom(Math.max(0.3, Math.min(1.2, optimalZoom)));
  canvasRef.value.scrollTo({
    left: Math.max(0, (minX - 40) * zoom.value),
    top: Math.max(0, (minY - 40) * zoom.value),
    behavior: 'smooth'
  });
}

function getTablePos(table: DbTableMeta): ErdPoint {
  return positions.value[tableKey(table)] || { x: GRID_ORIGIN_X, y: GRID_ORIGIN_Y };
}

function resetGridLayout() {
  const newPositions: Record<string, ErdPoint> = {};
  props.tables.forEach((tbl, idx) => {
    newPositions[tableKey(tbl)] = defaultPosition(idx);
  });
  tablePositions.value = newPositions;
  savePositionsToStorage();
}

// Drag Handlers with Zoom Compensation
function startDragTable(table: DbTableMeta, e: MouseEvent) {
  if (e.button !== 0) return; // Only left mouse button
  const key = tableKey(table);
  draggingTableKey.value = key;
  const pos = getTablePos(table);
  dragOffset = {
    x: e.clientX - pos.x * zoom.value,
    y: e.clientY - pos.y * zoom.value,
  };

  window.addEventListener('mousemove', onDragMouseMove);
  window.addEventListener('mouseup', onDragMouseUp);
}

function onDragMouseMove(e: MouseEvent) {
  const key = draggingTableKey.value;
  if (!key) return;
  const newX = Math.max(20, (e.clientX - dragOffset.x) / zoom.value);
  const newY = Math.max(20, (e.clientY - dragOffset.y) / zoom.value);

  tablePositions.value[key] = { x: newX, y: newY };
}

function onDragMouseUp() {
  draggingTableKey.value = null;
  window.removeEventListener('mousemove', onDragMouseMove);
  window.removeEventListener('mouseup', onDragMouseUp);
  savePositionsToStorage();
}

let fkRequestId = 0;

async function loadForeignKeys() {
  const config = props.dbConfig;
  if (!config) {
    foreignKeys.value = [];
    loadError.value = null;
    return;
  }

  const requestId = ++fkRequestId;
  loading.value = true;
  loadError.value = null;

  try {
    const list = await tauriBridge.dbmsGetForeignKeys(config, props.activeDb);
    if (requestId !== fkRequestId) return;
    foreignKeys.value = list;
  } catch (err: any) {
    if (requestId !== fkRequestId) return;
    foreignKeys.value = [];
    loadError.value = String(err?.message || err);
    console.error('Failed to load foreign keys:', err);
  } finally {
    if (requestId === fkRequestId) {
      loading.value = false;
    }
  }
}

function highlightRelation(rel: DbForeignKeyRelation) {
  activeRelationId.value = resolveLineId(rel);
  highlightedTables.value = [rel.from_table, rel.to_table];
}

function clearHighlight() {
  activeRelationId.value = null;
  highlightedTables.value = [];
}

function isTableHighlighted(tableName: string): boolean {
  const lower = tableName.toLowerCase();
  return highlightedTables.value.some(t => t.toLowerCase() === lower);
}

function focusTable(tableName: string) {
  const target = props.tables.find(t => t.name.toLowerCase() === tableName.toLowerCase());
  if (!target) return;
  const pos = getTablePos(target);
  if (canvasRef.value) {
    canvasRef.value.scrollTo({
      left: Math.max(0, pos.x * zoom.value - 100),
      top: Math.max(0, pos.y * zoom.value - 80),
      behavior: 'smooth',
    });
    highlightedTables.value = [target.name];
    setTimeout(() => {
      highlightedTables.value = [];
    }, 2000);
  }
}

function isFkColumnOf(table: DbTableMeta, columnName: string): boolean {
  return isFkColumn(foreignKeys.value, table, columnName);
}

function getTableRelations(table: DbTableMeta): DbForeignKeyRelation[] {
  return relationsOf(foreignKeys.value, table);
}

const tablesSignature = computed(() =>
  props.tables.map(t => `${tableKey(t)}:${t.columns.length}`).join('|')
);

watch(
  [() => props.dbConfig?.id, () => props.activeDb, tablesSignature],
  () => {
    loadForeignKeys();
  },
);

watch(
  [() => props.dbConfig?.id, () => props.activeDb],
  () => {
    loadPositionsFromStorage();
  },
);

onMounted(() => {
  loadPositionsFromStorage();
  if (Object.keys(tablePositions.value).length === 0) {
    resetGridLayout();
  }
  loadForeignKeys();
});

onUnmounted(() => {
  window.removeEventListener('mousemove', onDragMouseMove);
  window.removeEventListener('mouseup', onDragMouseUp);
  window.removeEventListener('mousemove', onCanvasPanMouseMove);
  window.removeEventListener('mouseup', onCanvasPanMouseUp);
});
</script>
