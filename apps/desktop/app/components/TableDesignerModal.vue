<template>
  <div v-if="isOpen" class="fixed inset-0 bg-boba-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 select-none animate-in fade-in duration-150">
    <div class="bg-boba-900 border border-boba-700 rounded-xl max-w-3xl w-full p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto font-sans">
      <!-- Header -->
      <div class="flex items-center justify-between border-b border-boba-800 pb-3">
        <div class="flex items-center space-x-2.5">
          <div class="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/30 flex items-center justify-center text-indigo-400">
            <Icon icon="lucide:table-properties" class="w-4 h-4" />
          </div>
          <div>
            <h3 class="text-base font-bold text-slate-100">
              {{ tableToEdit ? `Modifikasi Struktur Tabel: ${tableToEdit.name}` : 'Desain Tabel Baru (GUI)' }}
            </h3>
            <p class="text-[11px] text-slate-400">Atur kolom, tipe data, primary key, dan constraint secara visual</p>
          </div>
        </div>
        <button
          @click="$emit('close')"
          class="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-100 hover:bg-boba-800 transition text-sm"
        >
          ✕
        </button>
      </div>

      <!-- Table Name Input (if new) -->
      <div class="space-y-1" v-if="!tableToEdit">
        <label class="block text-xs font-semibold text-slate-300">Nama Tabel Baru *</label>
        <input
          v-model="tableName"
          type="text"
          placeholder="Contoh: users, orders, product_items"
          class="w-full bg-boba-950 border border-boba-700 focus:border-boba-accent rounded-lg px-3 py-1.5 text-xs text-slate-100 font-mono focus:outline-none"
        />
      </div>

      <!-- Columns Designer Table -->
      <div class="space-y-2">
        <div class="flex items-center justify-between">
          <span class="text-xs font-semibold uppercase tracking-wider text-slate-400">Daftar Kolom ({{ columns.length }})</span>
          <button
            type="button"
            @click="addColumn"
            class="px-2.5 py-1 bg-indigo-900/60 hover:bg-indigo-700 text-indigo-200 rounded text-xs font-medium border border-indigo-700/50 transition flex items-center space-x-1.5"
          >
            <Icon icon="lucide:plus" class="w-3.5 h-3.5" />
            <span>Tambah Kolom</span>
          </button>
        </div>

        <div class="border border-boba-800 rounded-xl overflow-hidden bg-boba-950 text-xs font-mono">
          <table class="w-full text-left border-collapse">
            <thead class="bg-[#141a29] border-b border-boba-800 text-slate-300">
              <tr>
                <th class="px-3 py-2 border-r border-boba-800">Nama Kolom</th>
                <th class="px-3 py-2 border-r border-boba-800">Tipe Data</th>
                <th class="px-3 py-2 border-r border-boba-800 text-center w-16">PK</th>
                <th class="px-3 py-2 border-r border-boba-800 text-center w-20">Nullable</th>
                <th class="px-3 py-2 border-r border-boba-800">Default Value</th>
                <th class="px-2 py-2 text-center w-12">Hapus</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-boba-850">
              <tr v-for="(col, idx) in columns" :key="idx" class="hover:bg-boba-800/40">
                <td class="p-1 border-r border-boba-850">
                  <input
                    v-model="col.name"
                    placeholder="nama_kolom"
                    class="w-full bg-boba-900 border border-boba-700 rounded px-2 py-1 text-xs text-sky-300 focus:outline-none"
                  />
                </td>
                <td class="p-1 border-r border-boba-850">
                  <select
                    v-model="col.data_type"
                    class="w-full bg-boba-900 border border-boba-700 rounded px-2 py-1 text-xs text-amber-300 focus:outline-none font-mono"
                  >
                    <option value="INT">INT</option>
                    <option value="BIGINT">BIGINT</option>
                    <option value="VARCHAR(255)">VARCHAR(255)</option>
                    <option value="VARCHAR(100)">VARCHAR(100)</option>
                    <option value="TEXT">TEXT</option>
                    <option value="BOOLEAN">BOOLEAN</option>
                    <option value="DATETIME">DATETIME</option>
                    <option value="TIMESTAMP">TIMESTAMP</option>
                    <option value="DECIMAL(10,2)">DECIMAL(10,2)</option>
                    <option value="JSON">JSON</option>
                  </select>
                </td>
                <td class="p-1 text-center border-r border-boba-850">
                  <input
                    v-model="col.is_primary_key"
                    type="checkbox"
                    class="rounded border-boba-700 bg-boba-900 text-amber-500 focus:ring-0 cursor-pointer"
                  />
                </td>
                <td class="p-1 text-center border-r border-boba-850">
                  <input
                    v-model="col.is_nullable"
                    type="checkbox"
                    class="rounded border-boba-700 bg-boba-900 text-sky-500 focus:ring-0 cursor-pointer"
                  />
                </td>
                <td class="p-1 border-r border-boba-850">
                  <input
                    v-model="col.default_value"
                    placeholder="NULL / CURRENT_TIMESTAMP"
                    class="w-full bg-boba-900 border border-boba-700 rounded px-2 py-1 text-xs text-slate-300 focus:outline-none"
                  />
                </td>
                <td class="p-1 text-center">
                  <button
                    v-if="columns.length > 1"
                    @click="removeColumn(idx)"
                    class="p-1 hover:bg-rose-950 text-slate-500 hover:text-rose-400 rounded transition"
                  >
                    ✕
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- DDL Preview -->
      <div class="space-y-1">
        <div class="text-[11px] font-semibold text-slate-400 uppercase">Preview DDL Script:</div>
        <pre class="bg-black/60 border border-boba-800 rounded-lg p-3 text-xs font-mono text-emerald-300 max-h-32 overflow-auto whitespace-pre-wrap">{{ generatedDdl }}</pre>
      </div>

      <!-- Actions -->
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
          @click="handleExecuteDdl"
          :disabled="executing || (!tableToEdit && !tableName.trim())"
          class="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg text-xs font-semibold shadow-md transition flex items-center space-x-1.5"
        >
          <span v-if="executing" class="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin"></span>
          <span>{{ executing ? 'Mengeksekusi...' : (tableToEdit ? 'Eksekusi Perubahan' : 'Buat Tabel (CREATE)') }}</span>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { Icon } from '@iconify/vue';
import { useDialogStore } from '../stores/dialogStore.js';
import type { DbConnectionConfig, DbTableMeta, DbColumnMeta } from '../types/index.js';

const props = defineProps<{
  isOpen: boolean;
  dbConfig?: DbConnectionConfig | null;
  activeDb?: string;
  tableToEdit?: DbTableMeta | null;
}>();

const emit = defineEmits(['close', 'saved']);

const dialogStore = useDialogStore();

const tableName = ref('');
const columns = ref<DbColumnMeta[]>([]);
const executing = ref(false);

watch(
  () => props.isOpen,
  (open) => {
    if (open) {
      if (props.tableToEdit) {
        tableName.value = props.tableToEdit.name;
        columns.value = JSON.parse(JSON.stringify(props.tableToEdit.columns));
      } else {
        tableName.value = '';
        columns.value = [
          { name: 'id', data_type: 'BIGINT', is_nullable: false, is_primary_key: true, default_value: null },
          { name: 'created_at', data_type: 'DATETIME', is_nullable: true, is_primary_key: false, default_value: 'CURRENT_TIMESTAMP' },
          { name: 'updated_at', data_type: 'DATETIME', is_nullable: true, is_primary_key: false, default_value: 'CURRENT_TIMESTAMP' },
        ];
      }
    }
  }
);

function addColumn() {
  columns.value.push({
    name: `col_${columns.value.length + 1}`,
    data_type: 'VARCHAR(255)',
    is_nullable: true,
    is_primary_key: false,
    default_value: null,
  });
}

function removeColumn(idx: number) {
  columns.value.splice(idx, 1);
}

const generatedDdl = computed(() => {
  const name = tableName.value.trim() || 'nama_tabel';
  const colDefs = columns.value.map(c => {
    let def = `  \`${c.name}\` ${c.data_type}`;
    if (!c.is_nullable) def += ' NOT NULL';
    if (c.default_value) def += ` DEFAULT ${c.default_value}`;
    if (c.is_primary_key) def += ' PRIMARY KEY';
    return def;
  }).join(',\n');

  return `CREATE TABLE \`${name}\` (\n${colDefs}\n);`;
});

async function handleExecuteDdl() {
  if (!props.dbConfig) return;
  executing.value = true;

  try {
    await tauriBridge.dbmsExecuteQuery(props.dbConfig, props.activeDb, generatedDdl.value);
    dialogStore.showToast(`Tabel ${tableName.value} berhasil diproses!`, 'success', 2500);
    emit('saved');
    emit('close');
  } catch (err: any) {
    await dialogStore.alert({
      title: 'Gagal Mengeksekusi DDL',
      description: String(err?.message || err),
      variant: 'error',
    });
  } finally {
    executing.value = false;
  }
}
</script>
