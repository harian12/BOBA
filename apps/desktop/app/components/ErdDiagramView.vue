<template>
  <div class="h-full w-full flex flex-col bg-[#080b11] text-slate-100 font-sans overflow-hidden select-none">
    <!-- ERD Toolbar -->
    <div class="h-9 px-3 bg-[#0f1420] border-b border-boba-800 flex items-center justify-between text-xs shrink-0 font-mono">
      <div class="flex items-center space-x-2">
        <span class="text-sm">📊</span>
        <span class="font-bold text-slate-200">Entity Relationship Diagram (ERD)</span>
        <span class="text-[11px] text-slate-500">({{ tables.length }} Tabel, {{ foreignKeys.length }} Relasi)</span>
      </div>

      <div class="flex items-center space-x-2">
        <button
          @click="loadForeignKeys"
          :disabled="loading"
          class="px-2.5 py-1 bg-boba-800 hover:bg-boba-700 text-slate-200 rounded text-xs transition flex items-center space-x-1"
        >
          <span :class="[loading ? 'animate-spin inline-block' : '']">🔄</span>
          <span>Refresh Diagram</span>
        </button>
      </div>
    </div>

    <!-- Interactive Canvas Area -->
    <div class="flex-1 overflow-auto p-6 bg-[radial-gradient(#1e293b_1px,transparent_1px)] [background-size:16px_16px] relative">
      <div v-if="loading" class="py-20 text-center text-slate-500 text-xs font-mono">
        Memuat metadata relasi & foreign keys...
      </div>

      <div v-else-if="tables.length === 0" class="py-20 text-center text-slate-500 text-xs font-mono">
        Tidak ada tabel untuk ditampilkan di diagram.
      </div>

      <!-- Entity Table Cards Grid -->
      <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        <div
          v-for="tbl in tables"
          :key="tbl.name"
          class="bg-[#111726] border border-boba-700 hover:border-sky-500/80 rounded-xl shadow-xl overflow-hidden flex flex-col transition-all hover:shadow-sky-500/10"
        >
          <!-- Table Header -->
          <div class="px-3 py-2 bg-gradient-to-r from-sky-950 to-indigo-950/80 border-b border-boba-700 flex items-center justify-between">
            <div class="flex items-center space-x-1.5 truncate">
              <span class="text-xs">📋</span>
              <span class="font-bold text-xs text-sky-200 font-mono truncate">{{ tbl.name }}</span>
            </div>
            <span class="text-[9px] px-1.5 py-0.2 bg-boba-950/80 text-slate-400 rounded font-mono">
              {{ tbl.columns.length }} cols
            </span>
          </div>

          <!-- Table Columns List -->
          <div class="divide-y divide-boba-850 p-1 max-h-64 overflow-y-auto font-mono text-[11px]">
            <div
              v-for="c in tbl.columns"
              :key="c.name"
              class="px-2.5 py-1 flex items-center justify-between hover:bg-boba-800/40 rounded transition group"
            >
              <div class="flex items-center space-x-1.5 truncate mr-2">
                <span v-if="c.is_primary_key" class="text-amber-400 text-xs" title="Primary Key">🔑</span>
                <span v-else-if="isFkColumn(tbl.name, c.name)" class="text-sky-400 text-xs" title="Foreign Key">🔗</span>
                <span v-else class="text-slate-600 text-xs">•</span>
                <span :class="['truncate', c.is_primary_key ? 'font-bold text-amber-200' : (isFkColumn(tbl.name, c.name) ? 'font-semibold text-sky-300' : 'text-slate-300')]">
                  {{ c.name }}
                </span>
              </div>

              <span class="text-[10px] text-slate-500 truncate shrink-0">
                {{ c.data_type }}
              </span>
            </div>
          </div>

          <!-- Outgoing Relations Footer Badge -->
          <div v-if="getTableRelations(tbl.name).length > 0" class="p-2 bg-boba-950/60 border-t border-boba-800 space-y-1">
            <div class="text-[9px] uppercase font-bold text-slate-500 font-mono">Relasi Foreign Key:</div>
            <div
              v-for="rel in getTableRelations(tbl.name)"
              :key="`${rel.from_column}_${rel.to_table}`"
              class="text-[10px] text-sky-300 font-mono flex items-center space-x-1 truncate bg-sky-950/40 px-1.5 py-0.5 rounded border border-sky-900/40"
            >
              <span class="text-slate-400 font-bold">{{ rel.from_column }}</span>
              <span class="text-slate-600">➔</span>
              <span class="text-emerald-300 font-semibold">{{ rel.to_table }}.{{ rel.to_column }}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { tauriBridge } from '../services/tauriBridge.js';
import type { DbConnectionConfig, DbTableMeta, DbForeignKeyRelation } from '../types/index.js';

const props = defineProps<{
  dbConfig?: DbConnectionConfig | null;
  activeDb?: string;
  tables: DbTableMeta[];
}>();

const loading = ref(false);
const foreignKeys = ref<DbForeignKeyRelation[]>([]);

async function loadForeignKeys() {
  if (!props.dbConfig) return;
  loading.value = true;

  try {
    const list = await tauriBridge.dbmsGetForeignKeys(props.dbConfig, props.activeDb);
    foreignKeys.value = list;
  } catch (err: any) {
    console.error('Failed to load foreign keys:', err);
  } finally {
    loading.value = false;
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

onMounted(() => {
  loadForeignKeys();
});
</script>
