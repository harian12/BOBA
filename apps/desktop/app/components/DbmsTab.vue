<template>
  <div class="h-full w-full flex bg-[#0d1117] text-slate-100 font-sans overflow-hidden select-none">
    <!-- Left Pane: Schema & Object Explorer -->
    <div class="w-64 border-r border-boba-800 bg-[#111622] flex flex-col shrink-0 h-full">
      <!-- Database Header & Selector -->
      <div class="p-2.5 border-b border-boba-800 space-y-2">
        <div class="flex items-center justify-between">
          <div class="flex items-center space-x-2 truncate">
            <span class="text-base">{{ getEngineIcon(tab.dbConnection?.engine) }}</span>
            <div class="truncate">
              <div class="text-xs font-bold text-slate-100 truncate">{{ tab.dbConnection?.name }}</div>
              <div class="text-[10px] text-slate-400 font-mono truncate">
                {{ tab.dbConnection?.engine.toUpperCase() }} • {{ tab.dbConnection?.host || 'Local' }}
              </div>
            </div>
          </div>
          <button
            @click="loadSchemaOverview"
            :disabled="loadingSchema"
            title="Refresh Database Schema"
            class="p-1 hover:bg-boba-800 rounded text-slate-400 hover:text-white transition text-xs"
          >
            <span :class="[loadingSchema ? 'animate-spin inline-block' : '']">🔄</span>
          </button>
        </div>

        <!-- Database/Schema Selector Dropdown (if multiple databases exist) -->
        <div v-if="schemaOverview?.databases && schemaOverview.databases.length > 1" class="space-y-1">
          <label class="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Database:</label>
          <select
            v-model="activeDatabase"
            @change="handleDatabaseChange"
            class="w-full bg-boba-950 border border-boba-700 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none font-mono"
          >
            <option v-for="db in schemaOverview.databases" :key="db" :value="db">
              {{ db }}
            </option>
          </select>
        </div>

        <!-- Filter Tables Input -->
        <input
          v-model="tableFilter"
          type="text"
          placeholder="Filter objek/tabel..."
          class="w-full bg-boba-950 border border-boba-800 focus:border-boba-accent rounded px-2.5 py-1 text-xs text-slate-200 placeholder-slate-500 focus:outline-none"
        />
      </div>

      <!-- Objects Tree List (Tables, Views, Collections, Keys) -->
      <div class="flex-1 overflow-y-auto p-1.5 space-y-0.5 font-mono text-xs">
        <div v-if="loadingSchema" class="py-6 text-center text-slate-500 text-xs">
          Memuat struktur skema...
        </div>

        <div v-else-if="filteredTables.length === 0" class="py-6 text-center text-slate-500 text-xs">
          Tidak ada tabel / objek ditemukan.
        </div>

        <div
          v-for="tbl in filteredTables"
          :key="tbl.name"
          @click="handleSelectTable(tbl)"
          :class="[
            'flex items-center justify-between px-2.5 py-1.5 rounded cursor-pointer transition select-none group',
            activeTable?.name === tbl.name
              ? 'bg-sky-950/80 text-sky-200 border border-sky-500/40'
              : 'text-slate-300 hover:bg-boba-800/80 hover:text-white'
          ]"
        >
          <div class="flex items-center space-x-2 truncate mr-1.5">
            <span class="text-xs shrink-0">
              {{ tbl.table_type === 'VIEW' ? '👁️' : (tab.dbConnection?.engine === 'redis' ? '⚡' : '📋') }}
            </span>
            <span class="truncate text-[11px]">{{ tbl.name }}</span>
          </div>

          <span class="text-[9px] px-1 py-0.2 bg-boba-950/80 text-slate-500 rounded group-hover:text-slate-400 shrink-0 font-sans">
            {{ tbl.table_type }}
          </span>
        </div>
      </div>
    </div>

    <!-- Right Pane: Split into Query Editor + Data Grid -->
    <div class="flex-1 flex flex-col overflow-hidden bg-[#0a0d14]">
      <!-- Top Section: SQL Query Editor & AI Copilot Bar -->
      <div class="border-b border-boba-800 flex flex-col shrink-0 bg-[#0e121d]">
        <!-- Query Control Toolbar -->
        <div class="px-3 py-1.5 border-b border-boba-800 flex items-center justify-between text-xs bg-[#121724]">
          <div class="flex items-center space-x-2">
            <button
              @click="executeQuery()"
              :disabled="executing"
              class="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded font-medium text-xs shadow transition flex items-center space-x-1.5"
            >
              <span v-if="executing" class="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin"></span>
              <span>{{ executing ? 'Menjalankan...' : '⚡ Jalankan (Ctrl+Enter)' }}</span>
            </button>

            <button
              @click="queryText = ''"
              class="px-2 py-1 text-slate-400 hover:text-slate-200 hover:bg-boba-800 rounded transition"
            >
              Clear
            </button>

            <button
              @click="formatQuickSql"
              class="px-2 py-1 text-slate-400 hover:text-slate-200 hover:bg-boba-800 rounded transition"
            >
              Format SQL
            </button>
          </div>

          <!-- Execution Stats Badge & History Toggle -->
          <div class="flex items-center space-x-3 text-[11px] font-mono">
            <span v-if="lastExecutionTime !== null" class="text-slate-400">
              Waktu: <strong class="text-slate-200">{{ lastExecutionTime }}ms</strong>
            </span>
            <span v-if="queryResult" class="text-slate-400">
              Baris: <strong class="text-emerald-400">{{ queryResult.rows.length }}</strong>
              <span v-if="queryResult.affected_rows > 0"> (Affected: {{ queryResult.affected_rows }})</span>
            </span>
            <button
              @click="showHistory = !showHistory"
              :class="['px-2 py-0.5 rounded transition text-[11px]', showHistory ? 'bg-sky-600 text-white' : 'text-slate-400 hover:bg-boba-800 hover:text-slate-200']"
              title="Lihat Riwayat Query"
            >
              🕒 Riwayat
            </button>
          </div>
        </div>

        <!-- AI SQL Assistant Bar -->
        <div class="px-3 py-1.5 bg-purple-950/20 border-b border-purple-900/30 flex items-center space-x-2">
          <span class="text-xs text-purple-400 shrink-0">✨ AI SQL:</span>
          <input
            v-model="aiPrompt"
            @keydown.enter="handleAiGenerateSql"
            type="text"
            placeholder="Ketik instruksi SQL dalam bahasa natural... (contoh: 'tampilkan 20 data terbaru yang aktif')"
            class="flex-1 bg-boba-950/80 border border-purple-900/50 focus:border-purple-400 rounded px-2.5 py-1 text-xs text-purple-200 placeholder-purple-400/50 focus:outline-none"
          />
          <button
            @click="handleAiGenerateSql"
            :disabled="aiGenerating || !aiPrompt.trim()"
            class="px-2.5 py-1 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white rounded text-xs font-medium transition shrink-0"
          >
            {{ aiGenerating ? 'AI Thinking...' : 'Generate' }}
          </button>
        </div>

        <!-- Query History Dropdown (if active) -->
        <div v-if="showHistory" class="p-2 bg-boba-950 border-b border-boba-800 max-h-36 overflow-y-auto space-y-1 font-mono text-[11px]">
          <div v-if="queryHistory.length === 0" class="text-slate-500 text-center py-2 text-xs">
            Belum ada riwayat query.
          </div>
          <div
            v-for="(h, idx) in queryHistory"
            :key="idx"
            @click="loadHistoryQuery(h)"
            class="px-2.5 py-1 rounded bg-[#111622] hover:bg-sky-950/70 text-slate-300 hover:text-sky-200 cursor-pointer truncate flex items-center justify-between transition"
          >
            <span class="truncate mr-2">{{ h }}</span>
            <span class="text-[10px] text-slate-500 shrink-0 font-sans">Gunakan ↵</span>
          </div>
        </div>

        <!-- SQL Editor Textarea -->
        <div class="p-2">
          <textarea
            v-model="queryText"
            @keydown="handleEditorKeyDown"
            placeholder="Ketik query SQL di sini (atau klik tabel di navigasi kiri)..."
            rows="5"
            class="w-full bg-[#07090e] border border-boba-800 rounded-lg p-3 text-xs font-mono text-emerald-300 placeholder-slate-600 focus:outline-none focus:border-sky-500/80 resize-y leading-relaxed"
          ></textarea>
        </div>
      </div>

      <!-- Bottom Section: View Mode Switcher & Content -->
      <div class="flex-1 flex flex-col overflow-hidden">
        <!-- View Mode Navigation Tabs -->
        <div class="px-3 py-1.5 border-b border-boba-800 flex items-center justify-between text-xs bg-[#111622] shrink-0">
          <div class="flex items-center space-x-1">
            <button
              @click="activeViewTab = 'data'"
              :class="['px-2.5 py-1 rounded text-xs font-medium transition', activeViewTab === 'data' ? 'bg-sky-950 border border-sky-600/60 text-sky-200' : 'text-slate-400 hover:bg-boba-800 hover:text-slate-200']"
            >
              📊 Data
            </button>
            <button
              v-if="activeTable && activeTable.columns.length > 0"
              @click="activeViewTab = 'structure'"
              :class="['px-2.5 py-1 rounded text-xs font-medium transition', activeViewTab === 'structure' ? 'bg-sky-950 border border-sky-600/60 text-sky-200' : 'text-slate-400 hover:bg-boba-800 hover:text-slate-200']"
            >
              📐 Struktur ({{ activeTable.columns.length }} Kolom)
            </button>
            <button
              v-if="activeTable && activeTable.columns.length > 0"
              @click="activeViewTab = 'ddl'"
              :class="['px-2.5 py-1 rounded text-xs font-medium transition', activeViewTab === 'ddl' ? 'bg-sky-950 border border-sky-600/60 text-sky-200' : 'text-slate-400 hover:bg-boba-800 hover:text-slate-200']"
            >
              📜 DDL Script
            </button>
          </div>

          <!-- Actions: Insert Row & Export Tools -->
          <div class="flex items-center space-x-1.5">
            <button
              v-if="activeTable && activeTable.columns.length > 0 && activeViewTab === 'data'"
              @click="isInsertModalOpen = true"
              class="px-2.5 py-1 bg-emerald-900/60 hover:bg-emerald-700 text-emerald-200 rounded text-[11px] font-medium border border-emerald-700/50 transition flex items-center space-x-1"
            >
              <span>+ Tambah Baris</span>
            </button>

            <template v-if="queryResult && queryResult.columns.length > 0 && activeViewTab === 'data'">
              <button
                @click="exportData('csv')"
                title="Ekspor ke CSV"
                class="px-2 py-1 bg-boba-800 hover:bg-boba-700 text-slate-300 hover:text-white rounded text-[11px] transition flex items-center space-x-1"
              >
                <span>📄 CSV</span>
              </button>
              <button
                @click="exportData('json')"
                title="Ekspor ke JSON"
                class="px-2 py-1 bg-boba-800 hover:bg-boba-700 text-slate-300 hover:text-white rounded text-[11px] transition flex items-center space-x-1"
              >
                <span>📦 JSON</span>
              </button>
              <button
                @click="exportData('sql')"
                title="Ekspor sebagai SQL INSERT Statements"
                class="px-2 py-1 bg-boba-800 hover:bg-boba-700 text-slate-300 hover:text-white rounded text-[11px] transition flex items-center space-x-1"
              >
                <span>💾 SQL Dump</span>
              </button>
            </template>
          </div>
        </div>

        <!-- Query Error Banner -->
        <div v-if="errorMessage" class="p-3 bg-rose-950/60 border-b border-rose-800 text-rose-300 text-xs font-mono select-text flex items-start space-x-2">
          <span class="text-sm shrink-0">⚠️</span>
          <div class="flex-1 break-all">{{ errorMessage }}</div>
        </div>

        <!-- VIEW 1: Interactive Data Table Grid -->
        <div v-if="activeViewTab === 'data'" class="flex-1 overflow-auto bg-[#07090e] relative font-mono text-xs select-text">
          <table v-if="queryResult && queryResult.columns.length > 0" class="w-full text-left border-collapse">
            <thead class="bg-[#141a29] sticky top-0 z-10 border-b border-boba-800 shadow-sm text-slate-300">
              <tr>
                <th class="px-2 py-1.5 text-[10px] text-slate-500 font-mono border-r border-boba-800 w-10 text-center">#</th>
                <th
                  v-for="col in queryResult.columns"
                  :key="col"
                  class="px-3 py-1.5 border-r border-boba-800 font-semibold tracking-wide text-sky-300 select-none whitespace-nowrap"
                >
                  {{ col }}
                </th>
              </tr>
            </thead>
            <tbody class="divide-y divide-boba-850">
              <tr
                v-for="(row, rIdx) in queryResult.rows"
                :key="rIdx"
                class="hover:bg-boba-800/40 transition group"
              >
                <td class="px-2 py-1 text-[10px] text-slate-600 border-r border-boba-850 text-center select-none">
                  {{ rIdx + 1 }}
                </td>
                <td
                  v-for="(val, cIdx) in row"
                  :key="cIdx"
                  @dblclick="openCellDetail(queryResult.columns[cIdx], val)"
                  class="px-3 py-1 border-r border-boba-850 text-slate-300 whitespace-nowrap max-w-xs truncate cursor-pointer hover:bg-sky-950/50"
                  :title="typeof val === 'object' ? JSON.stringify(val) : String(val)"
                >
                  <span v-if="val === null" class="text-slate-600 italic">NULL</span>
                  <span v-else-if="typeof val === 'boolean'" :class="val ? 'text-emerald-400' : 'text-rose-400'">
                    {{ val ? 'TRUE' : 'FALSE' }}
                  </span>
                  <span v-else-if="typeof val === 'object'" class="text-purple-400">
                    {{ JSON.stringify(val) }}
                  </span>
                  <span v-else>{{ val }}</span>
                </td>
              </tr>
            </tbody>
          </table>

          <!-- Empty State Grid -->
          <div
            v-else-if="!executing && !errorMessage"
            class="h-full flex flex-col items-center justify-center p-8 text-center text-slate-500 space-y-2"
          >
            <span class="text-3xl">🗄️</span>
            <div class="text-xs">Pilih tabel di navigasi kiri atau ketik query SQL untuk melihat data.</div>
          </div>
        </div>

        <!-- VIEW 2: Table Structure / Column Meta -->
        <div v-else-if="activeViewTab === 'structure'" class="flex-1 overflow-auto bg-[#07090e] p-3 font-mono text-xs select-text">
          <table v-if="activeTable && activeTable.columns.length > 0" class="w-full text-left border-collapse border border-boba-800">
            <thead class="bg-[#141a29] border-b border-boba-800 text-slate-300">
              <tr>
                <th class="px-3 py-2 border-r border-boba-800">Nama Kolom</th>
                <th class="px-3 py-2 border-r border-boba-800">Tipe Data</th>
                <th class="px-3 py-2 border-r border-boba-800">Primary Key</th>
                <th class="px-3 py-2 border-r border-boba-800">Nullable</th>
                <th class="px-3 py-2">Default Value</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-boba-850">
              <tr v-for="col in activeTable.columns" :key="col.name" class="hover:bg-boba-800/40">
                <td class="px-3 py-1.5 font-bold text-sky-300 border-r border-boba-850">{{ col.name }}</td>
                <td class="px-3 py-1.5 text-amber-300 border-r border-boba-850">{{ col.data_type }}</td>
                <td class="px-3 py-1.5 border-r border-boba-850">
                  <span v-if="col.is_primary_key" class="px-1.5 py-0.5 bg-amber-950 border border-amber-800 text-amber-300 rounded text-[10px]">PK 🔑</span>
                  <span v-else class="text-slate-600">-</span>
                </td>
                <td class="px-3 py-1.5 border-r border-boba-850">
                  <span :class="col.is_nullable ? 'text-emerald-400' : 'text-rose-400'">
                    {{ col.is_nullable ? 'YES' : 'NO' }}
                  </span>
                </td>
                <td class="px-3 py-1.5 text-slate-400">{{ col.default_value ?? 'NULL' }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- VIEW 3: Table DDL Script -->
        <div v-else-if="activeViewTab === 'ddl'" class="flex-1 overflow-auto bg-[#07090e] p-3 font-mono text-xs select-text">
          <div class="p-3 bg-boba-950 rounded-lg border border-boba-800 whitespace-pre text-emerald-300 leading-relaxed">
{{ generateTableDdl() }}
          </div>
        </div>
      </div>
    </div>

    <!-- Insert Row Modal -->
    <div
      v-if="isInsertModalOpen && activeTable"
      class="fixed inset-0 bg-boba-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
    >
      <div class="bg-boba-900 border border-boba-700 rounded-xl max-w-lg w-full p-5 shadow-2xl space-y-4 max-h-[85vh] overflow-y-auto font-sans">
        <div class="flex items-center justify-between border-b border-boba-800 pb-2">
          <div class="font-bold text-sm text-slate-100">Tambah Baris Baru ke {{ activeTable.name }}</div>
          <button @click="isInsertModalOpen = false" class="text-slate-400 hover:text-white text-xs">✕</button>
        </div>

        <div class="space-y-2.5">
          <div v-for="col in activeTable.columns" :key="col.name" class="space-y-1">
            <div class="flex items-center justify-between text-xs">
              <span class="font-semibold text-slate-200 font-mono">{{ col.name }}</span>
              <span class="text-[10px] text-slate-500 font-mono">({{ col.data_type }})</span>
            </div>
            <input
              v-model="insertRowValues[col.name]"
              type="text"
              :placeholder="col.default_value ? `Default: ${col.default_value}` : (col.is_nullable ? 'NULL' : 'Wajib diisi')"
              class="w-full bg-boba-950 border border-boba-700 focus:border-boba-accent rounded px-2.5 py-1.5 text-xs text-slate-100 font-mono focus:outline-none"
            />
          </div>
        </div>

        <div class="flex justify-end space-x-2 pt-2 border-t border-boba-800">
          <button
            @click="isInsertModalOpen = false"
            class="px-3 py-1.5 bg-boba-800 hover:bg-boba-700 text-slate-300 rounded text-xs"
          >
            Batal
          </button>
          <button
            @click="handleCommitInsert"
            class="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-semibold shadow"
          >
            Simpan Baris (INSERT)
          </button>
        </div>
      </div>
    </div>

    <!-- Cell Detail Drawer / Modal -->
    <div
      v-if="selectedCell"
      class="fixed inset-0 bg-boba-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
    >
      <div class="bg-boba-900 border border-boba-700 rounded-xl max-w-xl w-full p-5 shadow-2xl space-y-3 font-sans">
        <div class="flex items-center justify-between border-b border-boba-800 pb-2">
          <div class="font-bold text-xs text-sky-400 font-mono">Field: {{ selectedCell.column }}</div>
          <button @click="selectedCell = null" class="text-slate-400 hover:text-white text-xs">✕</button>
        </div>
        <textarea
          :value="typeof selectedCell.value === 'object' ? JSON.stringify(selectedCell.value, null, 2) : String(selectedCell.value)"
          readonly
          rows="12"
          class="w-full bg-boba-950 border border-boba-800 rounded-lg p-3 text-xs font-mono text-slate-200 focus:outline-none"
        ></textarea>
        <div class="flex justify-end">
          <button
            @click="selectedCell = null"
            class="px-4 py-1.5 bg-boba-800 hover:bg-boba-700 text-slate-300 rounded text-xs"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { tauriBridge } from '../services/tauriBridge.js';
import { useDialogStore } from '../stores/dialogStore.js';
import type { ActiveTab, DbTableMeta, DbSchemaOverview, DbQueryResult } from '../types/index.js';

const props = defineProps<{
  tab: ActiveTab;
}>();

const dialogStore = useDialogStore();

const loadingSchema = ref(false);
const schemaOverview = ref<DbSchemaOverview | null>(null);
const activeDatabase = ref<string>('');
const tableFilter = ref('');
const activeTable = ref<DbTableMeta | null>(null);

const activeViewTab = ref<'data' | 'structure' | 'ddl'>('data');
const queryText = ref('');
const executing = ref(false);
const errorMessage = ref<string | null>(null);
const queryResult = ref<DbQueryResult | null>(null);
const lastExecutionTime = ref<number | null>(null);

const showHistory = ref(false);
const queryHistory = ref<string[]>([]);

const aiPrompt = ref('');
const aiGenerating = ref(false);

const selectedCell = ref<{ column: string; value: any } | null>(null);

const isInsertModalOpen = ref(false);
const insertRowValues = ref<Record<string, string>>({});

function getEngineIcon(engine?: string): string {
  switch (engine?.toLowerCase()) {
    case 'mysql':
    case 'mariadb':
      return '🐬';
    case 'postgres':
    case 'postgresql':
      return '🐘';
    case 'sqlite':
      return '🗃️';
    case 'redis':
      return '⚡';
    case 'mongodb':
      return '🍃';
    default:
      return '🗄️';
  }
}

const filteredTables = computed(() => {
  if (!schemaOverview.value?.tables) return [];
  if (!tableFilter.value.trim()) return schemaOverview.value.tables;
  return schemaOverview.value.tables.filter(t =>
    t.name.toLowerCase().includes(tableFilter.value.toLowerCase())
  );
});

async function loadSchemaOverview() {
  if (!props.tab.dbConnection) return;
  loadingSchema.value = true;
  errorMessage.value = null;

  try {
    const overview = await tauriBridge.dbmsGetSchemaOverview(
      props.tab.dbConnection,
      activeDatabase.value || undefined
    );
    schemaOverview.value = overview;
    if (overview.current_database) {
      activeDatabase.value = overview.current_database;
    }
  } catch (err: any) {
    errorMessage.value = String(err?.message || err);
  } finally {
    loadingSchema.value = false;
  }
}

function handleDatabaseChange() {
  loadSchemaOverview();
}

function handleSelectTable(tbl: DbTableMeta) {
  activeTable.value = tbl;
  insertRowValues.value = {};
  const engine = props.tab.dbConnection?.engine.toLowerCase();

  if (engine === 'redis') {
    queryText.value = `GET ${tbl.name}`;
  } else {
    queryText.value = `SELECT * FROM ${tbl.name} LIMIT 100;`;
  }

  activeViewTab.value = 'data';
  executeQuery();
}

async function executeQuery(customQuery?: string) {
  if (!props.tab.dbConnection) return;
  const q = customQuery || queryText.value;
  if (!q.trim()) return;

  executing.value = true;
  errorMessage.value = null;

  try {
    const res = await tauriBridge.dbmsExecuteQuery(
      props.tab.dbConnection,
      activeDatabase.value || undefined,
      q
    );
    queryResult.value = res;
    lastExecutionTime.value = res.execution_time_ms;

    // Add to history
    if (!queryHistory.value.includes(q.trim())) {
      queryHistory.value.unshift(q.trim());
      if (queryHistory.value.length > 20) queryHistory.value.pop();
    }
  } catch (err: any) {
    errorMessage.value = String(err?.message || err);
    queryResult.value = null;
  } finally {
    executing.value = false;
  }
}

function loadHistoryQuery(q: string) {
  queryText.value = q;
  showHistory.value = false;
  executeQuery();
}

function handleEditorKeyDown(e: KeyboardEvent) {
  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    e.preventDefault();
    executeQuery();
  }
}

function formatQuickSql() {
  let s = queryText.value.trim();
  const keywords = ['SELECT', 'FROM', 'WHERE', 'JOIN', 'LEFT JOIN', 'GROUP BY', 'ORDER BY', 'LIMIT', 'INSERT INTO', 'UPDATE', 'SET', 'DELETE FROM'];
  for (const kw of keywords) {
    const re = new RegExp(`\\b${kw}\\b`, 'gi');
    s = s.replace(re, kw);
  }
  queryText.value = s;
}

function openCellDetail(column: string, value: any) {
  selectedCell.value = { column, value };
}

function generateTableDdl(): string {
  if (!activeTable.value) return '-- Pilih tabel untuk melihat DDL';
  const cols = activeTable.value.columns.map(c => {
    let def = `  \`${c.name}\` ${c.data_type.toUpperCase()}`;
    if (!c.is_nullable) def += ' NOT NULL';
    if (c.default_value) def += ` DEFAULT ${c.default_value}`;
    if (c.is_primary_key) def += ' PRIMARY KEY';
    return def;
  }).join(',\n');

  return `CREATE TABLE \`${activeTable.value.name}\` (\n${cols}\n);`;
}

async function handleCommitInsert() {
  if (!activeTable.value) return;
  const cols: string[] = [];
  const vals: string[] = [];

  for (const [colName, val] of Object.entries(insertRowValues.value)) {
    if (val !== undefined && val !== '') {
      cols.push(colName);
      if (val.toUpperCase() === 'NULL') {
        vals.push('NULL');
      } else if (!isNaN(Number(val))) {
        vals.push(val);
      } else {
        vals.push(`'${val.replace(/'/g, "''")}'`);
      }
    }
  }

  if (cols.length === 0) {
    await dialogStore.alert({
      title: 'Data Kosong',
      description: 'Harap isi minimal satu kolom untuk memasukkan baris baru.',
      variant: 'error',
    });
    return;
  }

  const sql = `INSERT INTO ${activeTable.value.name} (${cols.join(', ')}) VALUES (${vals.join(', ')});`;
  isInsertModalOpen.value = false;
  queryText.value = sql;
  await executeQuery(sql);
  // Reload table data
  executeQuery(`SELECT * FROM ${activeTable.value.name} LIMIT 100;`);
}

async function handleAiGenerateSql() {
  if (!aiPrompt.value.trim()) return;
  aiGenerating.value = true;

  const prompt = aiPrompt.value.trim();
  const targetTable = activeTable.value?.name || (schemaOverview.value?.tables[0]?.name ?? 'users');

  if (prompt.toLowerCase().includes('semua') || prompt.toLowerCase().includes('all')) {
    queryText.value = `SELECT * FROM ${targetTable} LIMIT 100;`;
  } else if (prompt.toLowerCase().includes('hitung') || prompt.toLowerCase().includes('count')) {
    queryText.value = `SELECT COUNT(*) AS total_count FROM ${targetTable};`;
  } else {
    queryText.value = `-- AI Generated for: "${prompt}"\nSELECT * FROM ${targetTable} ORDER BY 1 DESC LIMIT 50;`;
  }

  aiGenerating.value = false;
  aiPrompt.value = '';
}

function exportData(type: 'csv' | 'json' | 'sql') {
  if (!queryResult.value || queryResult.value.columns.length === 0) return;

  const cols = queryResult.value.columns;
  const rows = queryResult.value.rows;
  let content = '';
  let filename = `${activeTable.value?.name || 'export'}_${Date.now()}`;

  if (type === 'csv') {
    content = cols.map(c => `"${c}"`).join(',') + '\n';
    content += rows.map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    filename += '.csv';
  } else if (type === 'json') {
    const objects = rows.map(r => {
      const obj: Record<string, any> = {};
      cols.forEach((c, idx) => {
        obj[c] = r[idx];
      });
      return obj;
    });
    content = JSON.stringify(objects, null, 2);
    filename += '.json';
  } else if (type === 'sql') {
    const tableName = activeTable.value?.name || 'exported_table';
    content = rows.map(r => {
      const vals = r.map(v => {
        if (v === null) return 'NULL';
        if (typeof v === 'number') return v;
        if (typeof v === 'boolean') return v ? '1' : '0';
        return `'${String(v).replace(/'/g, "''")}'`;
      }).join(', ');
      return `INSERT INTO ${tableName} (${cols.join(', ')}) VALUES (${vals});`;
    }).join('\n');
    filename += '.sql';
  }

  const blob = new Blob([content], { type: 'text/plain;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
}

onMounted(() => {
  loadSchemaOverview();
});
</script>
