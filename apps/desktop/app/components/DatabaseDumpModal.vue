<template>
  <div
    v-if="isOpen"
    class="fixed inset-0 bg-boba-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 select-none animate-in fade-in duration-150"
    @click.self="!isDumping && $emit('close')"
  >
    <div class="bg-boba-900 border border-boba-700 rounded-xl max-w-xl w-full p-6 shadow-2xl space-y-4 max-h-[90vh] flex flex-col font-sans">
      <!-- Header -->
      <div class="flex items-center justify-between border-b border-boba-800 pb-3 shrink-0">
        <div class="flex items-center space-x-2.5">
          <div class="w-8 h-8 rounded-lg bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-400">
            <Icon icon="lucide:database-backup" class="w-4 h-4" />
          </div>
          <div>
            <h3 class="text-base font-bold text-slate-100">Database Dump Wizard</h3>
            <p class="text-[11px] text-slate-400">Ekspor skrip SQL lengkap (struktur & data) ke file .sql</p>
          </div>
        </div>
        <button
          @click="!isDumping && $emit('close')"
          :disabled="isDumping"
          class="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-100 hover:bg-boba-800 transition text-sm disabled:opacity-40"
        >
          ✕
        </button>
      </div>

      <!-- Target Database Summary -->
      <div class="p-2.5 bg-boba-950/70 border border-boba-800 rounded-lg flex items-center justify-between text-xs font-mono shrink-0">
        <div class="flex items-center space-x-2">
          <span class="px-1.5 py-0.5 rounded bg-sky-950 border border-sky-700/60 text-sky-300 text-[10px] uppercase font-bold">
            {{ dbConfig?.engine || 'SQL' }}
          </span>
          <span class="text-slate-300 font-bold">
            {{ activeDb || dbConfig?.database || 'Default Database' }}
          </span>
        </div>
        <span class="text-slate-400 text-[11px]">
          {{ tables.length }} tabel tersedia
        </span>
      </div>

      <!-- Body Section (Scrollable) -->
      <div class="space-y-4 overflow-y-auto flex-1 pr-1 text-xs">
        <!-- Opsi Format Pembagian File -->
        <div class="space-y-1.5">
          <label class="block text-xs font-semibold text-slate-300">Format Pembagian File:</label>
          <div class="grid grid-cols-2 gap-2 p-1 bg-boba-950 border border-boba-800 rounded-lg">
            <button
              type="button"
              @click="fileSplitMode = 'single'"
              :class="[
                'py-1.5 px-2 rounded-md text-[11px] font-medium transition flex items-center justify-center space-x-1.5',
                fileSplitMode === 'single'
                  ? 'bg-sky-600 text-white font-semibold shadow'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-boba-900'
              ]"
            >
              <Icon icon="lucide:file-text" class="w-3.5 h-3.5" />
              <span>1 File SQL Gabungan</span>
            </button>
            <button
              type="button"
              @click="fileSplitMode = 'per_table'"
              :class="[
                'py-1.5 px-2 rounded-md text-[11px] font-medium transition flex items-center justify-center space-x-1.5',
                fileSplitMode === 'per_table'
                  ? 'bg-sky-600 text-white font-semibold shadow'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-boba-900'
              ]"
            >
              <Icon icon="lucide:folder-down" class="w-3.5 h-3.5" />
              <span>1 File Per Tabel (Cepat / DB Besar)</span>
            </button>
          </div>
          <div class="text-[10px] text-slate-400 px-1">
            <span v-if="fileSplitMode === 'single'">Semua tabel terpilih digabung menjadi 1 file SQL tunggal.</span>
            <span v-else class="text-sky-300 font-medium">Tiap tabel disimpan ke file terpisah (<code class="text-sky-200 font-mono">&lt;dbname&gt;_&lt;nama_tabel&gt;.sql</code>). Sangat cepat dan hemat memori untuk database besar.</span>
          </div>
        </div>

        <!-- Opsi Konten Dump -->
        <div class="space-y-1.5">
          <label class="block text-xs font-semibold text-slate-300">Pilihan Konten Ekspor:</label>
          <div class="grid grid-cols-3 gap-2 p-1 bg-boba-950 border border-boba-800 rounded-lg">
            <button
              type="button"
              @click="dumpScope = 'both'"
              :class="[
                'py-1.5 px-2 rounded-md text-[11px] font-medium transition flex items-center justify-center space-x-1.5',
                dumpScope === 'both'
                  ? 'bg-sky-600 text-white font-semibold shadow'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-boba-900'
              ]"
            >
              <Icon icon="lucide:layers" class="w-3.5 h-3.5" />
              <span>Struktur & Data</span>
            </button>
            <button
              type="button"
              @click="dumpScope = 'structure'"
              :class="[
                'py-1.5 px-2 rounded-md text-[11px] font-medium transition flex items-center justify-center space-x-1.5',
                dumpScope === 'structure'
                  ? 'bg-sky-600 text-white font-semibold shadow'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-boba-900'
              ]"
            >
              <Icon icon="lucide:table" class="w-3.5 h-3.5" />
              <span>Hanya Struktur</span>
            </button>
            <button
              type="button"
              @click="dumpScope = 'data'"
              :class="[
                'py-1.5 px-2 rounded-md text-[11px] font-medium transition flex items-center justify-center space-x-1.5',
                dumpScope === 'data'
                  ? 'bg-sky-600 text-white font-semibold shadow'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-boba-900'
              ]"
            >
              <Icon icon="lucide:database" class="w-3.5 h-3.5" />
              <span>Hanya Data</span>
            </button>
          </div>
        </div>

        <!-- Opsi Ekstra SQL -->
        <div class="grid grid-cols-2 gap-2 text-[11px] text-slate-300">
          <label class="flex items-center space-x-2 bg-boba-950/60 p-2 rounded-lg border border-boba-800/80 cursor-pointer hover:bg-boba-950 transition">
            <input
              v-model="dropTableIfExists"
              type="checkbox"
              class="rounded border-boba-700 bg-boba-900 text-sky-500 focus:ring-0 focus:ring-offset-0"
            />
            <span>Sertakan <code class="text-sky-300">DROP TABLE IF EXISTS</code></span>
          </label>
          <label class="flex items-center space-x-2 bg-boba-950/60 p-2 rounded-lg border border-boba-800/80 cursor-pointer hover:bg-boba-950 transition">
            <input
              v-model="disableFkChecks"
              type="checkbox"
              class="rounded border-boba-700 bg-boba-900 text-sky-500 focus:ring-0 focus:ring-offset-0"
            />
            <span>Matikan Foreign Key Checks</span>
          </label>
        </div>

        <!-- Pemilihan Tabel (Filter & Checklist) -->
        <div class="space-y-2">
          <div class="flex items-center justify-between">
            <label class="block text-xs font-semibold text-slate-300">
              Pilih Tabel yang Mau Diambil:
            </label>
            <div class="flex items-center space-x-2 text-[11px]">
              <button
                type="button"
                @click="selectAllTables"
                class="text-sky-400 hover:text-sky-300 font-medium transition"
              >
                Pilih Semua
              </button>
              <span class="text-slate-600">•</span>
              <button
                type="button"
                @click="deselectAllTables"
                class="text-slate-400 hover:text-slate-200 transition"
              >
                Batal Pilih
              </button>
              <span
                class="px-2 py-0.5 bg-boba-800 rounded font-mono text-[10px]"
                :class="selectedTableNames.length > 0 ? 'text-sky-300 font-bold' : 'text-slate-400'"
              >
                {{ selectedTableNames.length }}/{{ tables.length }} tabel
              </span>
            </div>
          </div>

          <!-- Input Filter Pencarian Tabel -->
          <div class="relative">
            <Icon icon="lucide:search" class="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-2.5 pointer-events-none" />
            <input
              v-model="tableFilter"
              type="text"
              placeholder="Cari nama tabel..."
              class="w-full bg-boba-950 border border-boba-800 focus:border-sky-500 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none transition font-mono"
            />
          </div>

          <!-- Daftar Tabel Ber-checkbox -->
          <div class="max-h-48 overflow-y-auto bg-boba-950 border border-boba-800 rounded-lg divide-y divide-boba-850 p-1 font-mono text-xs">
            <label
              v-for="tbl in filteredTables"
              :key="tbl.name"
              class="flex items-center justify-between px-2.5 py-1.5 hover:bg-boba-900 rounded cursor-pointer transition select-none group"
            >
              <div class="flex items-center space-x-2.5 truncate">
                <input
                  type="checkbox"
                  :value="tbl.name"
                  v-model="selectedTableNames"
                  class="rounded border-boba-700 bg-boba-900 text-sky-500 focus:ring-0 focus:ring-offset-0"
                />
                <Icon icon="lucide:table" class="w-3.5 h-3.5 text-slate-400 group-hover:text-sky-400 shrink-0" />
                <span class="truncate text-slate-200 group-hover:text-white font-medium">{{ tbl.name }}</span>
              </div>
              <span class="text-[10px] text-slate-500 font-sans shrink-0 ml-2">
                {{ tbl.row_count !== undefined && tbl.row_count !== null ? `~${tbl.row_count} baris` : `${tbl.columns?.length || 0} kolom` }}
              </span>
            </label>
            <div v-if="filteredTables.length === 0" class="text-center py-4 text-slate-500 text-xs font-sans">
              Tidak ada tabel yang cocok dengan pencarian.
            </div>
          </div>
        </div>

        <!-- Progress Indicator saat Dump Berjalan -->
        <div v-if="isDumping" class="p-3 bg-sky-950/60 border border-sky-600/40 rounded-lg space-y-2 animate-pulse">
          <div class="flex items-center justify-between text-xs">
            <span class="text-sky-300 font-medium flex items-center space-x-1.5">
              <Icon icon="lucide:loader-2" class="w-3.5 h-3.5 animate-spin text-sky-400" />
              <span>{{ progressMessage }}</span>
            </span>
            <span class="font-mono font-bold text-sky-200">{{ progressPercent }}%</span>
          </div>
          <div class="w-full bg-boba-950 rounded-full h-1.5 overflow-hidden">
            <div
              class="bg-sky-500 h-1.5 transition-all duration-150"
              :style="{ width: `${progressPercent}%` }"
            ></div>
          </div>
        </div>
      </div>

      <!-- Footer Actions -->
      <div class="flex items-center justify-between border-t border-boba-800 pt-3 shrink-0">
        <button
          type="button"
          @click="$emit('close')"
          :disabled="isDumping"
          class="px-4 py-1.5 bg-boba-800 hover:bg-boba-700 text-slate-300 hover:text-white rounded-lg text-xs transition disabled:opacity-40"
        >
          Tutup
        </button>

        <div class="flex items-center space-x-2">
          <button
            v-if="fileSplitMode === 'single'"
            type="button"
            @click="copyDumpToClipboard"
            :disabled="isDumping || selectedTableNames.length === 0"
            class="px-3 py-1.5 bg-boba-800 hover:bg-boba-700 text-slate-200 hover:text-sky-300 rounded-lg text-xs font-medium transition flex items-center space-x-1.5 border border-boba-700/60 disabled:opacity-40"
            title="Salin script SQL ke clipboard"
          >
            <Icon icon="lucide:clipboard-copy" class="w-3.5 h-3.5 text-sky-400" />
            <span>Salin SQL</span>
          </button>
          <button
            type="button"
            @click="executeExportDump"
            :disabled="isDumping || selectedTableNames.length === 0"
            class="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-medium transition flex items-center space-x-1.5 shadow-md hover:shadow-emerald-600/30 disabled:opacity-40 disabled:hover:shadow-none"
          >
            <Icon :icon="fileSplitMode === 'single' ? 'lucide:download' : 'lucide:folder-down'" class="w-3.5 h-3.5" />
            <span>{{ fileSplitMode === 'single' ? 'Ekspor 1 File (.sql)' : 'Pilih Folder & Ekspor' }}</span>
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue';
import { Icon } from '@iconify/vue';
import { useDialogStore } from '../stores/dialogStore.js';
import { tauriBridge } from '../services/tauriBridge.js';
import { quoteIdent, sqlLiteral } from '../utils/dbmsSql.js';
import type { DbConnectionConfig, DbTableMeta } from '../types/index.js';

const props = defineProps<{
  isOpen: boolean;
  dbConfig?: DbConnectionConfig | null;
  activeDb?: string;
  tables: DbTableMeta[];
  initialSelectedTable?: string;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const dialogStore = useDialogStore();

const fileSplitMode = ref<'single' | 'per_table'>('single');
const dumpScope = ref<'both' | 'structure' | 'data'>('both');
const dropTableIfExists = ref(true);
const disableFkChecks = ref(true);
const selectedTableNames = ref<string[]>([]);
const tableFilter = ref('');

const isDumping = ref(false);
const progressPercent = ref(0);
const progressMessage = ref('');

const filteredTables = computed(() => {
  const q = tableFilter.value.trim().toLowerCase();
  if (!q) return props.tables;
  return props.tables.filter(t => t.name.toLowerCase().includes(q));
});

watch(
  () => props.isOpen,
  (open) => {
    if (open) {
      tableFilter.value = '';
      isDumping.value = false;
      progressPercent.value = 0;
      progressMessage.value = '';

      if (props.initialSelectedTable) {
        selectedTableNames.value = [props.initialSelectedTable];
      } else {
        selectedTableNames.value = props.tables.map(t => t.name);
      }
    }
  }
);

function selectAllTables() {
  selectedTableNames.value = props.tables.map(t => t.name);
}

function deselectAllTables() {
  selectedTableNames.value = [];
}

async function dumpSingleTableSql(
  tableName: string,
  engine: string,
  includeStructure: boolean,
  includeData: boolean
): Promise<{ sql: string; rowCount: number }> {
  const tableMeta = props.tables.find(t => t.name === tableName);
  const chunks: string[] = [];
  let rowCount = 0;

  chunks.push(`-- -------------------------------------------------------------`);
  chunks.push(`-- Table: ${quoteIdent(engine, tableName)}`);
  chunks.push(`-- -------------------------------------------------------------\n`);

  if (dropTableIfExists.value && includeStructure) {
    chunks.push(`DROP TABLE IF EXISTS ${quoteIdent(engine, tableName)};\n`);
  }

  // 1. Structure
  if (includeStructure) {
    let ddlGenerated = false;

    if (engine === 'mysql' || engine === 'mariadb') {
      try {
        const showCreate = await tauriBridge.dbmsExecuteQuery(
          props.dbConfig!,
          props.activeDb,
          `SHOW CREATE TABLE ${quoteIdent(engine, tableName)};`
        );
        if (showCreate?.[0]?.rows?.[0]?.[1]) {
          chunks.push(`${showCreate[0].rows[0][1]};\n`);
          ddlGenerated = true;
        }
      } catch {
        // Fallback
      }
    } else if (engine === 'sqlite') {
      try {
        const sqliteMaster = await tauriBridge.dbmsExecuteQuery(
          props.dbConfig!,
          props.activeDb,
          `SELECT sql FROM sqlite_master WHERE type='table' AND name='${tableName}';`
        );
        if (sqliteMaster?.[0]?.rows?.[0]?.[0]) {
          chunks.push(`${sqliteMaster[0].rows[0][0]};\n`);
          ddlGenerated = true;
        }
      } catch {
        // Fallback
      }
    }

    if (!ddlGenerated && tableMeta?.columns && tableMeta.columns.length > 0) {
      const colDefs = tableMeta.columns.map(c => {
        let def = `  ${quoteIdent(engine, c.name)} ${c.data_type.toUpperCase()}`;
        if (!c.is_nullable) def += ' NOT NULL';
        if (c.default_value) def += ` DEFAULT ${c.default_value}`;
        if (c.is_primary_key) def += ' PRIMARY KEY';
        return def;
      }).join(',\n');
      chunks.push(`CREATE TABLE ${quoteIdent(engine, tableName)} (\n${colDefs}\n);\n`);
    }
  }

  // 2. Data
  if (includeData) {
    try {
      const dataRes = await tauriBridge.dbmsExecuteQuery(
        props.dbConfig!,
        props.activeDb,
        `SELECT * FROM ${quoteIdent(engine, tableName)};`
      );
      const qRes = dataRes?.[0];
      if (qRes && qRes.rows && qRes.rows.length > 0) {
        rowCount = qRes.rows.length;
        const cols = qRes.columns;

        if (engine === 'mysql' || engine === 'mariadb') {
          chunks.push(`/*!40000 ALTER TABLE ${quoteIdent(engine, tableName)} DISABLE KEYS */;`);
        }

        const BATCH_SIZE = 100;
        for (let b = 0; b < qRes.rows.length; b += BATCH_SIZE) {
          const batch = qRes.rows.slice(b, b + BATCH_SIZE);
          const colList = cols.map(c => quoteIdent(engine, c)).join(', ');
          const valList = batch.map(r => `  (${r.map(v => sqlLiteral(engine, v)).join(', ')})`).join(',\n');
          chunks.push(`INSERT INTO ${quoteIdent(engine, tableName)} (${colList}) VALUES\n${valList};\n`);
        }

        if (engine === 'mysql' || engine === 'mariadb') {
          chunks.push(`/*!40000 ALTER TABLE ${quoteIdent(engine, tableName)} ENABLE KEYS */;\n`);
        }
      }
    } catch (dataErr: any) {
      chunks.push(`-- [Peringatan] Gagal mengekspor data ${tableName}: ${dataErr?.message || dataErr}\n`);
    }
  }

  return { sql: chunks.join('\n'), rowCount };
}

function getPreamble(engine: string, dbName: string, tableLabel: string): string {
  const lines: string[] = [];
  lines.push(`-- =============================================================`);
  lines.push(`-- BOBA Database Dump`);
  lines.push(`-- Database : ${dbName}`);
  lines.push(`-- Engine   : ${engine.toUpperCase()}`);
  lines.push(`-- Tanggal  : ${new Date().toLocaleString()}`);
  lines.push(`-- Target   : ${tableLabel}`);
  lines.push(`-- =============================================================\n`);

  if (disableFkChecks.value) {
    if (engine === 'mysql' || engine === 'mariadb') {
      lines.push(`/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;`);
      lines.push(`/*!40101 SET NAMES utf8mb4 */;`);
      lines.push(`/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;`);
      lines.push(`/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;\n`);
    } else if (engine === 'sqlite') {
      lines.push(`PRAGMA foreign_keys = OFF;`);
      lines.push(`BEGIN TRANSACTION;\n`);
    } else if (engine === 'postgres' || engine === 'postgresql') {
      lines.push(`SET statement_timeout = 0;`);
      lines.push(`SET client_encoding = 'UTF8';`);
      lines.push(`SET standard_conforming_strings = on;\n`);
    }
  }
  return lines.join('\n');
}

function getPostamble(engine: string): string {
  const lines: string[] = [];
  if (disableFkChecks.value) {
    if (engine === 'mysql' || engine === 'mariadb') {
      lines.push(`\n/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;`);
      lines.push(`/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;`);
      lines.push(`/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;`);
    } else if (engine === 'sqlite') {
      lines.push(`\nCOMMIT;`);
      lines.push(`PRAGMA foreign_keys = ON;`);
    }
  }
  lines.push(`\n-- Dump selesai diekspor pada: ${new Date().toLocaleString()}`);
  return lines.join('\n');
}

async function executeExportDump() {
  if (selectedTableNames.value.length === 0) {
    dialogStore.showToast('Pilih minimal satu tabel untuk di-dump', 'warning', 2500);
    return;
  }
  if (!props.dbConfig) return;

  const engine = (props.dbConfig.engine || 'mysql').toLowerCase();
  const dbName = props.activeDb || props.dbConfig.database || 'database';
  const includeStructure = dumpScope.value === 'both' || dumpScope.value === 'structure';
  const includeData = dumpScope.value === 'both' || dumpScope.value === 'data';
  const totalTables = selectedTableNames.value.length;

  if (fileSplitMode.value === 'per_table') {
    // Mode Per-Tabel (1 File per Tabel)
    let selectedFolder = '';
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const res = await open({
        directory: true,
        multiple: false,
        title: 'Pilih Folder Tujuan untuk Menyimpan File SQL Per Tabel',
      });
      if (typeof res === 'string') {
        selectedFolder = res;
      } else {
        return; // User cancelled
      }
    } catch {
      selectedFolder = '';
    }

    isDumping.value = true;
    progressPercent.value = 0;
    progressMessage.value = 'Mempersiapkan ekspor per tabel...';

    let totalRowsDumped = 0;
    const sep = selectedFolder.includes('\\') ? '\\' : '/';

    for (let idx = 0; idx < totalTables; idx++) {
      const tableName = selectedTableNames.value[idx];
      if (!tableName) continue;
      progressMessage.value = `Mengekspor tabel "${tableName}" (${idx + 1}/${totalTables})...`;
      progressPercent.value = Math.round(((idx) / totalTables) * 100);

      const tableData = await dumpSingleTableSql(tableName, engine, includeStructure, includeData);
      totalRowsDumped += tableData.rowCount;

      const fileContent = [
        getPreamble(engine, dbName, `Tabel ${tableName}`),
        tableData.sql,
        getPostamble(engine),
      ].join('\n');

      const tableFileName = `${dbName}_${tableName}.sql`;

      if (selectedFolder) {
        const filePath = `${selectedFolder}${sep}${tableFileName}`;
        await tauriBridge.fsWriteTextFile(filePath, fileContent);
      } else {
        // Browser download fallback
        const blob = new Blob([fileContent], { type: 'application/sql;charset=utf-8;' });
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = tableFileName;
        link.click();
        URL.revokeObjectURL(link.href);
        // Small delay between downloads in browser
        await new Promise(r => setTimeout(r, 150));
      }
    }

    progressPercent.value = 100;
    progressMessage.value = 'Selesai!';
    isDumping.value = false;

    if (selectedFolder) {
      dialogStore.showToast(
        `Berhasil mengekspor ${totalTables} file tabel ke folder: ${selectedFolder} (${totalRowsDumped} total baris)`,
        'success',
        4000
      );
    } else {
      dialogStore.showToast(
        `Berhasil mengunduh ${totalTables} file tabel .sql (${totalRowsDumped} total baris)`,
        'success',
        4000
      );
    }
    emit('close');
  } else {
    // Mode Single File (1 File Gabungan)
    isDumping.value = true;
    progressPercent.value = 0;
    progressMessage.value = 'Mempersiapkan dump gabungan...';

    const dumpChunks: string[] = [];
    dumpChunks.push(getPreamble(engine, dbName, `${totalTables} tabel (${selectedTableNames.value.join(', ')})`));

    let totalRowsDumped = 0;

    for (let idx = 0; idx < totalTables; idx++) {
      const tableName = selectedTableNames.value[idx];
      if (!tableName) continue;
      progressMessage.value = `Memproses tabel "${tableName}" (${idx + 1}/${totalTables})...`;
      progressPercent.value = Math.round((idx / totalTables) * 90);

      const tableData = await dumpSingleTableSql(tableName, engine, includeStructure, includeData);
      totalRowsDumped += tableData.rowCount;
      dumpChunks.push(tableData.sql);
    }

    dumpChunks.push(getPostamble(engine));
    progressPercent.value = 100;
    progressMessage.value = 'Menyiapkan file download...';

    const fullSql = dumpChunks.join('\n');
    const filename = `${dbName}_dump_${Date.now()}.sql`;

    try {
      const blob = new Blob([fullSql], { type: 'application/sql;charset=utf-8;' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = filename;
      link.click();
      URL.revokeObjectURL(link.href);

      dialogStore.showToast(
        `Dump database berhasil diekspor ke ${filename} (${totalTables} tabel, ${totalRowsDumped} baris)`,
        'success',
        4000
      );
      emit('close');
    } catch (err: any) {
      dialogStore.showToast(`Gagal mengunduh file dump: ${err?.message || err}`, 'error', 3000);
    } finally {
      isDumping.value = false;
    }
  }
}

async function copyDumpToClipboard() {
  if (selectedTableNames.value.length === 0) {
    dialogStore.showToast('Pilih minimal satu tabel untuk di-dump', 'warning', 2500);
    return;
  }
  if (!props.dbConfig) return;

  const engine = (props.dbConfig.engine || 'mysql').toLowerCase();
  const dbName = props.activeDb || props.dbConfig.database || 'database';
  const includeStructure = dumpScope.value === 'both' || dumpScope.value === 'structure';
  const includeData = dumpScope.value === 'both' || dumpScope.value === 'data';
  const totalTables = selectedTableNames.value.length;

  isDumping.value = true;
  progressPercent.value = 0;
  progressMessage.value = 'Mempersiapkan script SQL...';

  const dumpChunks: string[] = [];
  dumpChunks.push(getPreamble(engine, dbName, `${totalTables} tabel (${selectedTableNames.value.join(', ')})`));

  let totalRowsDumped = 0;

  for (let idx = 0; idx < totalTables; idx++) {
    const tableName = selectedTableNames.value[idx];
    if (!tableName) continue;
    progressMessage.value = `Memproses tabel "${tableName}" (${idx + 1}/${totalTables})...`;
    progressPercent.value = Math.round((idx / totalTables) * 90);

    const tableData = await dumpSingleTableSql(tableName, engine, includeStructure, includeData);
    totalRowsDumped += tableData.rowCount;
    dumpChunks.push(tableData.sql);
  }

  dumpChunks.push(getPostamble(engine));
  const fullSql = dumpChunks.join('\n');
  isDumping.value = false;

  try {
    await navigator.clipboard.writeText(fullSql);
    dialogStore.showToast(
      `Script dump database disalin ke clipboard (${totalTables} tabel, ${totalRowsDumped} baris)`,
      'success',
      3000
    );
  } catch (err: any) {
    dialogStore.showToast(`Gagal menyalin ke clipboard: ${err?.message || err}`, 'error', 3000);
  }
}
</script>
