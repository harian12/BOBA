<template>
  <div v-if="isOpen" class="fixed inset-0 bg-boba-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 select-none animate-in fade-in duration-150">
    <div class="bg-boba-900 border border-boba-700 rounded-xl max-w-xl w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto font-sans">
      <!-- Header -->
      <div class="flex items-center justify-between border-b border-boba-800 pb-3">
        <div class="flex items-center space-x-2.5">
          <div class="w-8 h-8 rounded-lg bg-sky-500/10 border border-sky-500/30 flex items-center justify-center text-sky-400">
            <Icon icon="lucide:file-up" class="w-4 h-4" />
          </div>
          <div>
            <h3 class="text-base font-bold text-slate-100">Data & Script Importer Wizard</h3>
            <p class="text-[11px] text-slate-400">Import file SQL Script (.sql) atau File Data CSV (.csv)</p>
          </div>
        </div>
        <button
          @click="$emit('close')"
          class="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-100 hover:bg-boba-800 transition text-sm"
        >
          ✕
        </button>
      </div>

      <!-- Mode Selector -->
      <div class="grid grid-cols-2 gap-2 p-1 bg-boba-950 border border-boba-800 rounded-lg">
        <button
          type="button"
          @click="importMode = 'sql'"
          :class="[
            'py-2 rounded-md text-xs font-semibold transition flex items-center justify-center space-x-2',
            importMode === 'sql'
              ? 'bg-sky-600 text-white shadow-md'
              : 'text-slate-400 hover:text-slate-200 hover:bg-boba-900'
          ]"
        >
          <Icon icon="lucide:file-code" class="w-4 h-4" />
          <span>Import File SQL (.sql)</span>
        </button>
        <button
          type="button"
          @click="importMode = 'csv'"
          :class="[
            'py-2 rounded-md text-xs font-semibold transition flex items-center justify-center space-x-2',
            importMode === 'csv'
              ? 'bg-sky-600 text-white shadow-md'
              : 'text-slate-400 hover:text-slate-200 hover:bg-boba-900'
          ]"
        >
          <Icon icon="lucide:file-spreadsheet" class="w-4 h-4" />
          <span>Import File CSV (.csv)</span>
        </button>
      </div>

      <!-- MODE 1: SQL Script Importer -->
      <div v-if="importMode === 'sql'" class="space-y-3">
        <div class="space-y-1">
          <label class="block text-xs font-semibold text-slate-300">Pilih File Script SQL:</label>
          <div class="flex space-x-2">
            <input
              v-model="sqlFilePath"
              type="text"
              placeholder="Pilih file .sql..."
              readonly
              class="flex-1 bg-boba-950 border border-boba-700 rounded-lg px-3 py-1.5 text-xs text-slate-100 font-mono"
            />
            <button
              type="button"
              @click="browseSqlFile"
              class="px-3 py-1.5 bg-boba-800 hover:bg-boba-700 text-slate-200 rounded-lg text-xs font-medium transition flex items-center space-x-1.5"
            >
              <Icon icon="lucide:folder-open" class="w-3.5 h-3.5 text-sky-400" />
              <span>Browse</span>
            </button>
          </div>
        </div>

        <div v-if="sqlScriptPreview" class="space-y-1">
          <label class="block text-[11px] text-slate-400 uppercase font-semibold">Preview Script SQL:</label>
          <pre class="bg-black/60 border border-boba-800 rounded-lg p-3 text-xs font-mono text-emerald-300 max-h-48 overflow-auto whitespace-pre-wrap leading-relaxed">{{ sqlScriptPreview }}</pre>
        </div>
      </div>

      <!-- MODE 2: CSV Data Importer -->
      <div v-else-if="importMode === 'csv'" class="space-y-3">
        <div class="space-y-1">
          <label class="block text-xs font-semibold text-slate-300">Pilih File CSV:</label>
          <div class="flex space-x-2">
            <input
              v-model="csvFilePath"
              type="text"
              placeholder="Pilih file .csv..."
              readonly
              class="flex-1 bg-boba-950 border border-boba-700 rounded-lg px-3 py-1.5 text-xs text-slate-100 font-mono"
            />
            <button
              type="button"
              @click="browseCsvFile"
              class="px-3 py-1.5 bg-boba-800 hover:bg-boba-700 text-slate-200 rounded-lg text-xs font-medium transition flex items-center space-x-1.5"
            >
              <Icon icon="lucide:folder-open" class="w-3.5 h-3.5 text-sky-400" />
              <span>Browse</span>
            </button>
          </div>
        </div>

        <div v-if="csvHeaders.length > 0" class="space-y-2 bg-boba-950/70 p-3 rounded-xl border border-boba-800">
          <div class="flex items-center justify-between text-xs">
            <span class="font-semibold text-slate-300">Tabel Tujuan:</span>
            <select
              v-model="targetTableName"
              class="bg-boba-900 border border-boba-700 rounded px-2.5 py-1 text-xs text-sky-300 font-mono focus:outline-none"
            >
              <option value="">-- Pilih Tabel Tujuan --</option>
              <option v-for="tbl in tables" :key="tbl.name" :value="tbl.name">
                {{ tbl.name }}
              </option>
            </select>
          </div>

          <div class="text-[11px] text-slate-400">
            Ditemukan <strong class="text-emerald-400">{{ csvHeaders.length }} kolom</strong> dan <strong class="text-sky-400">{{ csvParsedRows.length }} baris data</strong>.
          </div>
        </div>
      </div>

      <!-- Progress / Status Result -->
      <div v-if="importStatus" class="p-3 rounded-lg text-xs font-mono" :class="importStatus.success ? 'bg-emerald-950/60 border border-emerald-800 text-emerald-300' : 'bg-rose-950/60 border border-rose-800 text-rose-300'">
        <div class="flex items-center space-x-2">
          <span>{{ importStatus.success ? '✅' : '⚠️' }}</span>
          <span>{{ importStatus.message }}</span>
        </div>
      </div>

      <!-- Actions Footer -->
      <div class="border-t border-boba-800 pt-3 flex items-center justify-end space-x-2">
        <button
          type="button"
          @click="$emit('close')"
          class="px-3 py-1.5 bg-boba-800 hover:bg-boba-700 text-slate-300 rounded-lg text-xs transition"
        >
          Batal
        </button>
        <button
          type="button"
          @click="handleExecuteImport"
          :disabled="importing || (importMode === 'sql' && !sqlScriptContent) || (importMode === 'csv' && (!targetTableName || csvParsedRows.length === 0))"
          class="px-4 py-1.5 bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold shadow-md transition flex items-center space-x-1.5"
        >
          <span v-if="importing" class="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin"></span>
          <span>{{ importing ? 'Mengimpor...' : 'Mulai Import' }}</span>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue';
import { Icon } from '@iconify/vue';
import { useDialogStore } from '../stores/dialogStore.js';
import type { DbConnectionConfig, DbTableMeta } from '../types/index.js';

const props = defineProps<{
  isOpen: boolean;
  dbConfig?: DbConnectionConfig | null;
  activeDb?: string;
  tables: DbTableMeta[];
  defaultTable?: string;
}>();

const emit = defineEmits(['close', 'imported']);

const dialogStore = useDialogStore();

const importMode = ref<'sql' | 'csv'>('sql');
const sqlFilePath = ref('');
const sqlScriptContent = ref('');
const sqlScriptPreview = ref('');

const csvFilePath = ref('');
const csvHeaders = ref<string[]>([]);
const csvParsedRows = ref<string[][]>([]);
const targetTableName = ref('');

const importing = ref(false);
const importStatus = ref<{ success: boolean; message: string } | null>(null);

watch(
  () => props.isOpen,
  (open) => {
    if (open) {
      importStatus.value = null;
      targetTableName.value = props.defaultTable || (props.tables[0]?.name ?? '');
    }
  }
);

async function browseSqlFile() {
  try {
    const { open } = await import('@tauri-apps/plugin-dialog');
    const selected = await open({
      multiple: false,
      directory: false,
      filters: [{ name: 'SQL Script', extensions: ['sql'] }, { name: 'All Files', extensions: ['*'] }],
    });

    if (selected && typeof selected === 'string') {
      sqlFilePath.value = selected;
      const content = await tauriBridge.fsReadTextFile(selected);
      sqlScriptContent.value = content;
      sqlScriptPreview.value = content.slice(0, 1500) + (content.length > 1500 ? '\n... (konten dipotong untuk preview)' : '');
    }
  } catch (err) {
    console.error('File picker error:', err);
  }
}

async function browseCsvFile() {
  try {
    const { open } = await import('@tauri-apps/plugin-dialog');
    const selected = await open({
      multiple: false,
      directory: false,
      filters: [{ name: 'CSV File', extensions: ['csv'] }, { name: 'All Files', extensions: ['*'] }],
    });

    if (selected && typeof selected === 'string') {
      csvFilePath.value = selected;
      const content = await tauriBridge.fsReadTextFile(selected);
      parseCsv(content);
    }
  } catch (err) {
    console.error('File picker error:', err);
  }
}

function parseCsv(text: string) {
  const lines = text.split(/\r?\n/).filter(l => l.trim() !== '');
  if (lines.length === 0) return;

  // Simple CSV parser
  const headerLine = lines[0];
  csvHeaders.value = headerLine.split(',').map(h => h.trim().replace(/^["']|["']$/g, ''));

  const rows: string[][] = [];
  for (let i = 1; i < lines.length; i++) {
    const row = lines[i].split(',').map(cell => cell.trim().replace(/^["']|["']$/g, ''));
    rows.push(row);
  }
  csvParsedRows.value = rows;
}

async function handleExecuteImport() {
  if (!props.dbConfig) return;
  importing.value = true;
  importStatus.value = null;

  try {
    if (importMode.value === 'sql') {
      await tauriBridge.dbmsExecuteQuery(props.dbConfig, props.activeDb, sqlScriptContent.value);
      importStatus.value = { success: true, message: 'Script SQL berhasil dieksekusi seluruhnya ke database!' };
      dialogStore.showToast('Import SQL berhasil!', 'success', 2500);
      emit('imported');
    } else if (importMode.value === 'csv') {
      if (!targetTableName.value) throw new Error('Tabel tujuan belum dipilih');

      // Generate Batch INSERT statements
      const cols = csvHeaders.value.map(c => `\`${c}\``).join(', ');
      let insertCount = 0;

      // Group into chunks of 100
      for (let i = 0; i < csvParsedRows.value.length; i += 100) {
        const chunk = csvParsedRows.value.slice(i, i + 100);
        const valueTuples = chunk.map(r => {
          const vals = r.map(v => {
            if (v === '' || v.toUpperCase() === 'NULL') return 'NULL';
            if (!isNaN(Number(v))) return v;
            return `'${v.replace(/'/g, "''")}'`;
          });
          return `(${vals.join(', ')})`;
        });

        const sql = `INSERT INTO \`${targetTableName.value}\` (${cols}) VALUES ${valueTuples.join(', ')};`;
        await tauriBridge.dbmsExecuteQuery(props.dbConfig, props.activeDb, sql);
        insertCount += chunk.length;
      }

      importStatus.value = { success: true, message: `Berhasil mengimpor ${insertCount} baris data ke tabel ${targetTableName.value}!` };
      dialogStore.showToast(`Import ${insertCount} baris selesai!`, 'success', 2500);
      emit('imported');
    }
  } catch (err: any) {
    importStatus.value = { success: false, message: String(err?.message || err) };
  } finally {
    importing.value = false;
  }
}
</script>
