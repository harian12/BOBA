<template>
  <div class="h-full w-full flex flex-col bg-[#080b11] text-slate-100 font-sans overflow-hidden select-none">
    <!-- ERD Toolbar -->
    <div class="h-9 px-3 bg-[#0f1420] border-b border-boba-800 flex items-center justify-between text-xs shrink-0 font-mono">
      <div class="flex items-center space-x-2">
        <span class="text-sm">📊</span>
        <span class="font-bold text-slate-200">Entity Relationship Diagram (ERD)</span>
        <span class="text-[11px] text-slate-500">({{ filteredTables.length }} Tabel, {{ foreignKeys.length }} Relasi FK)</span>
      </div>

      <div class="flex items-center space-x-2">
        <!-- Toggle Relation Lines Button -->
        <button
          @click="showLines = !showLines"
          :class="[
            'px-2.5 py-1 rounded text-xs transition flex items-center space-x-1 border',
            showLines ? 'bg-sky-950 border-sky-600/70 text-sky-300 font-bold' : 'bg-boba-950 border-boba-700 text-slate-400 hover:text-slate-200'
          ]"
          title="Tampilkan / Sembunyikan Garis Konektor Relasi SVG"
        >
          <span>🔗 Garis Relasi: {{ showLines ? 'ON' : 'OFF' }}</span>
        </button>

        <input
          v-model="searchQuery"
          type="text"
          placeholder="Cari tabel di ERD..."
          class="bg-boba-950 border border-boba-700 rounded px-2.5 py-0.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none w-44 font-mono"
        />

        <button
          @click="loadForeignKeys"
          :disabled="loading"
          class="px-2.5 py-1 bg-boba-800 hover:bg-boba-700 text-slate-200 rounded text-xs transition flex items-center space-x-1"
        >
          <span :class="[loading ? 'animate-spin inline-block' : '']">🔄</span>
          <span>Refresh</span>
        </button>
      </div>
    </div>

    <!-- Interactive Canvas Area with SVG Line Connectors -->
    <div
      ref="canvasRef"
      @scroll="updateRelationLines"
      class="flex-1 overflow-auto p-8 bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:16px_16px] relative"
    >
      <!-- SVG Overlay for Relation Lines -->
      <svg
        v-if="showLines && computedLines.length > 0"
        class="absolute inset-0 pointer-events-none z-10"
        :style="{ width: `${canvasScrollWidth}px`, height: `${canvasScrollHeight}px` }"
      >
        <defs>
          <marker
            id="erd-arrow"
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
            id="erd-arrow-active"
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
          :stroke-width="activeRelationId === line.id ? 3 : 1.5"
          :stroke-dasharray="activeRelationId === line.id ? 'none' : '4,3'"
          :marker-end="activeRelationId === line.id ? 'url(#erd-arrow-active)' : 'url(#erd-arrow)'"
          class="transition-all duration-150"
        />
      </svg>

      <div v-if="loading" class="py-20 text-center text-slate-500 text-xs font-mono">
        Memuat metadata relasi & foreign keys...
      </div>

      <div v-else-if="filteredTables.length === 0" class="py-20 text-center text-slate-500 text-xs font-mono">
        Tidak ada tabel untuk ditampilkan di diagram.
      </div>

      <!-- Entity Table Cards Grid (Auto-Fill Responsive Grid) -->
      <div v-else class="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-8 items-start relative z-20">
        <div
          v-for="tbl in filteredTables"
          :key="tbl.name"
          :data-erd-table="tbl.name"
          :class="[
            'bg-[#111726] border rounded-xl shadow-xl overflow-hidden flex flex-col transition-all',
            isTableHighlighted(tbl.name)
              ? 'border-emerald-400 ring-2 ring-emerald-500/50 shadow-emerald-500/20'
              : 'border-boba-700 hover:border-sky-500/80 hover:shadow-sky-500/10'
          ]"
        >
          <!-- Table Header -->
          <div class="px-3 py-2 bg-gradient-to-r from-sky-950 to-indigo-950/80 border-b border-boba-700 flex items-center justify-between">
            <div class="flex items-center space-x-1.5 truncate mr-2">
              <span class="text-xs shrink-0">📋</span>
              <span class="font-bold text-xs text-sky-200 font-mono truncate" :title="tbl.name">{{ tbl.name }}</span>
            </div>
            <span class="text-[9px] px-1.5 py-0.5 bg-boba-950/80 text-slate-400 rounded font-mono shrink-0">
              {{ tbl.columns.length }} cols
            </span>
          </div>

          <!-- Table Columns List -->
          <div class="divide-y divide-boba-850 p-1 max-h-72 overflow-y-auto font-mono text-[11px]">
            <div
              v-for="c in tbl.columns"
              :key="c.name"
              class="px-2.5 py-1.5 flex items-center justify-between hover:bg-boba-800/40 rounded transition group"
            >
              <!-- Column Name & Icon -->
              <div class="flex items-center space-x-1.5 truncate min-w-0 flex-1 mr-2">
                <span v-if="c.is_primary_key" class="text-amber-400 text-xs shrink-0" title="Primary Key">🔑</span>
                <span v-else-if="isFkColumn(tbl.name, c.name)" class="text-sky-400 text-xs shrink-0" title="Foreign Key">🔗</span>
                <span v-else class="text-slate-600 text-xs shrink-0">•</span>
                <span
                  :class="[
                    'truncate text-xs',
                    c.is_primary_key ? 'font-bold text-amber-200' : (isFkColumn(tbl.name, c.name) ? 'font-semibold text-sky-300' : 'text-slate-300')
                  ]"
                  :title="c.name"
                >
                  {{ c.name }}
                </span>
              </div>

              <!-- Compact Clean Data Type Badge with Tooltip -->
              <span
                class="text-[10px] px-1.5 py-0.5 bg-boba-950/80 text-slate-400 rounded shrink-0 max-w-[130px] truncate border border-boba-800/50"
                :title="c.data_type"
              >
                {{ formatDataType(c.data_type) }}
              </span>
            </div>
          </div>

          <!-- Outgoing Relations Footer Badge -->
          <div v-if="getTableRelations(tbl.name).length > 0" class="p-2.5 bg-boba-950/60 border-t border-boba-800 space-y-1">
            <div class="text-[9px] uppercase font-bold text-slate-500 font-mono">Relasi Foreign Key:</div>
            <div
              v-for="rel in getTableRelations(tbl.name)"
              :key="`${rel.from_column}_${rel.to_table}`"
              @mouseenter="highlightRelation(rel)"
              @mouseleave="clearHighlight"
              @click="focusTable(rel.to_table)"
              class="text-[10px] text-sky-300 font-mono flex items-center space-x-1 truncate bg-sky-950/40 hover:bg-sky-900/60 px-2 py-0.5 rounded border border-sky-900/40 cursor-pointer transition"
              :title="`Klik untuk fokus ke ${rel.to_table}.${rel.to_column}`"
            >
              <span class="text-slate-400 font-bold truncate max-w-[90px]">{{ rel.from_column }}</span>
              <span class="text-slate-600 shrink-0">➔</span>
              <span class="text-emerald-300 font-semibold truncate max-w-[120px]">{{ rel.to_table }}.{{ rel.to_column }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue';
import { tauriBridge } from '../services/tauriBridge.js';
import type { DbConnectionConfig, DbTableMeta, DbForeignKeyRelation } from '../types/index.js';

const props = defineProps<{
  dbConfig?: DbConnectionConfig | null;
  activeDb?: string;
  tables: DbTableMeta[];
}>();

const loading = ref(false);
const searchQuery = ref('');
const foreignKeys = ref<DbForeignKeyRelation[]>([]);
const showLines = ref(true);

const canvasRef = ref<HTMLElement | null>(null);
const canvasScrollWidth = ref(1200);
const canvasScrollHeight = ref(800);

const activeRelationId = ref<string | null>(null);
const highlightedTables = ref<string[]>([]);

interface ComputedLine {
  id: string;
  d: string;
  fromTable: string;
  toTable: string;
}

const computedLines = ref<ComputedLine[]>([]);

const filteredTables = computed(() => {
  if (!searchQuery.value.trim()) return props.tables;
  const q = searchQuery.value.toLowerCase();
  return props.tables.filter(t => t.name.toLowerCase().includes(q));
});

function formatDataType(dataType: string): string {
  if (!dataType) return '';
  const trimmed = dataType.trim();
  if (trimmed.toLowerCase().startsWith('enum(')) {
    return 'enum(...)';
  }
  if (trimmed.toLowerCase().startsWith('set(')) {
    return 'set(...)';
  }
  return trimmed;
}

async function loadForeignKeys() {
  if (!props.dbConfig) return;
  loading.value = true;

  try {
    const list = await tauriBridge.dbmsGetForeignKeys(props.dbConfig, props.activeDb);
    foreignKeys.value = list;
    await nextTick();
    updateRelationLines();
  } catch (err: any) {
    console.error('Failed to load foreign keys:', err);
  } finally {
    loading.value = false;
  }
}

function updateRelationLines() {
  if (!canvasRef.value || !showLines.value) {
    computedLines.value = [];
    return;
  }

  const canvas = canvasRef.value;
  canvasScrollWidth.value = Math.max(canvas.scrollWidth, canvas.clientWidth);
  canvasScrollHeight.value = Math.max(canvas.scrollHeight, canvas.clientHeight);

  const canvasRect = canvas.getBoundingClientRect();
  const scrollLeft = canvas.scrollLeft;
  const scrollTop = canvas.scrollTop;

  const lines: ComputedLine[] = [];

  for (const rel of foreignKeys.value) {
    const fromEl = canvas.querySelector(`[data-erd-table="${rel.from_table}"]`) as HTMLElement | null;
    const toEl = canvas.querySelector(`[data-erd-table="${rel.to_table}"]`) as HTMLElement | null;

    if (fromEl && toEl) {
      const fromRect = fromEl.getBoundingClientRect();
      const toRect = toEl.getBoundingClientRect();

      // Coordinates relative to canvas scroll container
      const startX = fromRect.right - canvasRect.left + scrollLeft;
      const startY = fromRect.top - canvasRect.top + scrollTop + 20;

      const endX = toRect.left - canvasRect.left + scrollLeft;
      const endY = toRect.top - canvasRect.top + scrollTop + 20;

      const dx = Math.abs(endX - startX) * 0.5;
      const d = `M ${startX} ${startY} C ${startX + dx} ${startY}, ${endX - dx} ${endY}, ${endX} ${endY}`;

      lines.push({
        id: `${rel.from_table}_${rel.from_column}_${rel.to_table}`,
        d,
        fromTable: rel.from_table,
        toTable: rel.to_table,
      });
    }
  }

  computedLines.value = lines;
}

function highlightRelation(rel: DbForeignKeyRelation) {
  activeRelationId.value = `${rel.from_table}_${rel.from_column}_${rel.to_table}`;
  highlightedTables.value = [rel.from_table, rel.to_table];
}

function clearHighlight() {
  activeRelationId.value = null;
  highlightedTables.value = [];
}

function isTableHighlighted(tableName: string): boolean {
  return highlightedTables.value.includes(tableName);
}

function focusTable(tableName: string) {
  if (!canvasRef.value) return;
  const el = canvasRef.value.querySelector(`[data-erd-table="${tableName}"]`) as HTMLElement | null;
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
    highlightedTables.value = [tableName];
    setTimeout(() => {
      highlightedTables.value = [];
    }, 2000);
  }
}

function isFkColumn(tableName: string, columnName: string): boolean {
  return foreignKeys.value.some(
    fk => fk.from_table.toLowerCase() === tableName.toLowerCase() && fk.from_column.toLowerCase() === columnName.toLowerCase()
  );
}

function getTableRelations(tableName: string): DbForeignKeyRelation[] {
  return foreignKeys.value.filter(
    fk => fk.from_table.toLowerCase() === tableName.toLowerCase()
  );
}

let resizeObserver: ResizeObserver | null = null;

watch([() => props.tables, () => filteredTables.value, showLines], () => {
  nextTick(() => {
    updateRelationLines();
  });
});

onMounted(() => {
  loadForeignKeys();
  if (window.ResizeObserver && canvasRef.value) {
    resizeObserver = new ResizeObserver(() => {
      updateRelationLines();
    });
    resizeObserver.observe(canvasRef.value);
  }
});

onUnmounted(() => {
  if (resizeObserver) {
    resizeObserver.disconnect();
  }
});
</script>
