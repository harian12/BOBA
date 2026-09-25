<template>
  <div class="h-full w-full flex flex-col bg-[#080b11] text-slate-100 font-sans overflow-hidden select-none">
    <!-- ERD Toolbar -->
    <div class="h-9 px-3 bg-[#0f1420] border-b border-boba-800 flex items-center justify-between text-xs shrink-0 font-mono">
      <div class="flex items-center space-x-2">
        <Icon icon="lucide:network" class="w-4 h-4 text-sky-400" />
        <span class="font-bold text-slate-200">Interactive ERD Diagram</span>
        <span class="text-[11px] text-slate-500">({{ filteredTables.length }} Tabel, {{ foreignKeys.length }} Relasi FK)</span>
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
          <span>Garis Relasi: {{ showLines ? 'ON' : 'OFF' }}</span>
        </button>

        <!-- Search input -->
        <input
          v-model="searchQuery"
          type="text"
          placeholder="Cari tabel di ERD..."
          class="bg-boba-950 border border-boba-700 rounded px-2.5 py-0.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none w-44 font-mono"
        />

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

    <!-- Free-Floating Draggable Canvas Area (Supports Zoom & Ctrl+Scroll) -->
    <div
      ref="canvasRef"
      @wheel="handleCanvasWheel"
      @scroll="updateRelationLines"
      class="flex-1 overflow-auto bg-[radial-gradient(#1e293b_1.2px,transparent_1.2px)] [background-size:20px_20px] relative cursor-default"
    >
      <!-- Scaled Virtual Canvas Container -->
      <div
        class="relative min-w-[3200px] min-h-[2400px] origin-top-left"
        :style="{
          transform: `scale(${zoom})`,
          transformOrigin: '0 0'
        }"
      >
        <!-- SVG Overlay for Dynamic Relation Connector Lines -->
        <svg
          v-if="showLines && computedLines.length > 0"
          class="absolute inset-0 pointer-events-none z-10 w-full h-full"
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
            :stroke-width="activeRelationId === line.id ? 3.5 : 1.8"
            :stroke-dasharray="activeRelationId === line.id ? 'none' : '5,4'"
            :marker-end="activeRelationId === line.id ? 'url(#erd-arrow-active)' : 'url(#erd-arrow)'"
            class="transition-all duration-100"
          />
        </svg>

        <div v-if="loading" class="pt-32 text-center text-slate-500 text-xs font-mono">
          Memuat metadata relasi & foreign keys...
        </div>

        <div v-else-if="filteredTables.length === 0" class="pt-32 text-center text-slate-500 text-xs font-mono">
          Tidak ada tabel untuk ditampilkan di diagram.
        </div>

        <!-- Draggable Floating Entity Table Cards -->
        <template v-else>
          <div
            v-for="tbl in filteredTables"
            :key="tbl.name"
            :data-erd-table="tbl.name"
            :style="{
              position: 'absolute',
              left: `${getTablePos(tbl.name).x}px`,
              top: `${getTablePos(tbl.name).y}px`,
              width: '320px',
              zIndex: draggingTableName === tbl.name ? 50 : (isTableHighlighted(tbl.name) ? 40 : 20)
            }"
            :class="[
              'bg-[#111726] border rounded-xl shadow-2xl overflow-hidden flex flex-col select-none transition-shadow',
              draggingTableName === tbl.name ? 'ring-2 ring-sky-400 shadow-sky-500/30' : '',
              isTableHighlighted(tbl.name)
                ? 'border-emerald-400 ring-2 ring-emerald-500/60 shadow-emerald-500/20'
                : 'border-boba-700 hover:border-sky-500/80 hover:shadow-sky-500/10'
            ]"
          >
            <!-- Draggable Table Header -->
            <div
              @mousedown="startDragTable(tbl.name, $event)"
              class="px-3 py-2 bg-[#141b2d] border-b border-boba-700 flex items-center justify-between cursor-grab active:cursor-grabbing hover:bg-sky-950/60 transition"
              title="Tahan dan geser (Drag) untuk memindahkan posisi tabel"
            >
              <div class="flex items-center space-x-2 truncate mr-2 pointer-events-none">
                <Icon icon="lucide:table" class="w-3.5 h-3.5 text-sky-400 shrink-0" />
                <span class="font-bold text-xs text-sky-200 font-mono truncate">{{ tbl.name }}</span>
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
                  <Icon v-else-if="isFkColumn(tbl.name, c.name)" icon="lucide:link" class="w-3 h-3 text-sky-400 shrink-0" title="Foreign Key" />
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
            <div v-if="getTableRelations(tbl.name).length > 0" class="p-2.5 bg-boba-950/90 border-t border-boba-800 space-y-1.5">
              <div class="text-[9px] uppercase font-bold text-slate-500 font-mono flex items-center space-x-1">
                <Icon icon="lucide:git-fork" class="w-3 h-3 text-slate-500" />
                <span>Relasi Foreign Key:</span>
              </div>
              <div
                v-for="rel in getTableRelations(tbl.name)"
                :key="`${rel.from_column}_${rel.to_table}`"
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
import { ref, computed, onMounted, onUnmounted, nextTick, watch } from 'vue';
import { Icon } from '@iconify/vue';
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

// Zoom Controls
const zoom = ref(1.0);

const canvasRef = ref<HTMLElement | null>(null);

// Position map: { tableName: { x, y } }
const tablePositions = ref<Record<string, { x: number; y: number }>>({});
const draggingTableName = ref<string | null>(null);
let dragOffset = { x: 0, y: 0 };

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

function setZoom(val: number) {
  zoom.value = Math.min(2.0, Math.max(0.3, Math.round(val * 100) / 100));
  nextTick(() => {
    updateRelationLines();
  });
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

function getTablePos(tableName: string): { x: number; y: number } {
  if (!tablePositions.value[tableName]) {
    // Default grid coordinate calculation
    const index = props.tables.findIndex(t => t.name === tableName);
    const validIdx = index >= 0 ? index : 0;
    const cols = 4;
    const col = validIdx % cols;
    const row = Math.floor(validIdx / cols);
    tablePositions.value[tableName] = {
      x: 50 + col * 360,
      y: 50 + row * 400,
    };
  }
  return tablePositions.value[tableName];
}

function resetGridLayout() {
  const newPositions: Record<string, { x: number; y: number }> = {};
  const cols = 4;
  props.tables.forEach((tbl, idx) => {
    const col = idx % cols;
    const row = Math.floor(idx / cols);
    newPositions[tbl.name] = {
      x: 50 + col * 360,
      y: 50 + row * 400,
    };
  });
  tablePositions.value = newPositions;
  nextTick(() => {
    updateRelationLines();
  });
}

// Drag Handlers with Zoom Compensation
function startDragTable(tableName: string, e: MouseEvent) {
  if (e.button !== 0) return; // Only left mouse button
  draggingTableName.value = tableName;
  const pos = getTablePos(tableName);
  dragOffset = {
    x: e.clientX - pos.x * zoom.value,
    y: e.clientY - pos.y * zoom.value,
  };

  window.addEventListener('mousemove', onDragMouseMove);
  window.addEventListener('mouseup', onDragMouseUp);
}

function onDragMouseMove(e: MouseEvent) {
  if (!draggingTableName.value) return;
  const name = draggingTableName.value;
  const newX = Math.max(20, (e.clientX - dragOffset.x) / zoom.value);
  const newY = Math.max(20, (e.clientY - dragOffset.y) / zoom.value);

  tablePositions.value[name] = { x: newX, y: newY };
  requestAnimationFrame(updateRelationLines);
}

function onDragMouseUp() {
  draggingTableName.value = null;
  window.removeEventListener('mousemove', onDragMouseMove);
  window.removeEventListener('mouseup', onDragMouseUp);
  updateRelationLines();
}

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
  if (!showLines.value) {
    computedLines.value = [];
    return;
  }

  const lines: ComputedLine[] = [];

  for (const rel of foreignKeys.value) {
    const fromPos = tablePositions.value[rel.from_table];
    const toPos = tablePositions.value[rel.to_table];

    if (fromPos && toPos) {
      const cardWidth = 320;
      let startX: number, startY: number, endX: number, endY: number;

      // Determine cleanest side to connect (left or right)
      if (fromPos.x + cardWidth < toPos.x) {
        // from is to the left of to
        startX = fromPos.x + cardWidth;
        startY = fromPos.y + 40;
        endX = toPos.x;
        endY = toPos.y + 40;
      } else if (toPos.x + cardWidth < fromPos.x) {
        // from is to the right of to
        startX = fromPos.x;
        startY = fromPos.y + 40;
        endX = toPos.x + cardWidth;
        endY = toPos.y + 40;
      } else {
        // stacked vertically
        startX = fromPos.x + cardWidth / 2;
        startY = fromPos.y + 50;
        endX = toPos.x + cardWidth / 2;
        endY = toPos.y + 50;
      }

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
  const pos = getTablePos(tableName);
  if (canvasRef.value) {
    canvasRef.value.scrollTo({
      left: Math.max(0, pos.x * zoom.value - 100),
      top: Math.max(0, pos.y * zoom.value - 80),
      behavior: 'smooth',
    });
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

watch([() => props.tables, () => filteredTables.value, showLines, zoom], () => {
  nextTick(() => {
    updateRelationLines();
  });
});

onMounted(() => {
  resetGridLayout();
  loadForeignKeys();
});

onUnmounted(() => {
  window.removeEventListener('mousemove', onDragMouseMove);
  window.removeEventListener('mouseup', onDragMouseUp);
});
</script>
