<template>
  <div v-if="isOpen" class="fixed inset-0 bg-boba-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 select-none animate-in fade-in duration-150">
    <div class="bg-boba-900 border border-boba-700 rounded-xl max-w-2xl w-full p-6 shadow-2xl space-y-4 max-h-[88vh] overflow-y-auto font-sans">
      <!-- Header -->
      <div class="flex items-center justify-between border-b border-boba-800 pb-3">
        <div class="flex items-center space-x-2.5">
          <div class="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
            <Icon icon="lucide:users" class="w-4 h-4" />
          </div>
          <div>
            <h3 class="text-base font-bold text-slate-100">Database User & Privileges Manager</h3>
            <p class="text-[11px] text-slate-400">Kelola akun pengguna database dan hak akses izin (Privileges)</p>
          </div>
        </div>
        <div class="flex items-center space-x-2">
          <button
            @click="loadUsers"
            :disabled="loading"
            class="px-3 py-1 bg-boba-800 hover:bg-boba-700 text-slate-200 rounded-lg text-xs transition flex items-center space-x-1.5"
          >
            <Icon icon="lucide:refresh-cw" :class="['w-3.5 h-3.5', loading ? 'animate-spin' : '']" />
            <span>Refresh</span>
          </button>
          <button
            @click="$emit('close')"
            class="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-100 hover:bg-boba-800 transition text-sm"
          >
            ✕
          </button>
        </div>
      </div>

      <!-- Create New User Quick Bar -->
      <div class="p-3 bg-boba-950/80 border border-boba-800 rounded-xl space-y-2">
        <div class="text-xs font-semibold text-emerald-400">Tambah Akun User Baru:</div>
        <div class="grid grid-cols-3 gap-2">
          <input
            v-model="newUser.username"
            placeholder="Username (misal: app_user)"
            class="bg-boba-900 border border-boba-700 rounded px-2.5 py-1 text-xs text-slate-100 font-mono focus:outline-none"
          />
          <input
            v-model="newUser.host"
            placeholder="Host (% atau localhost)"
            class="bg-boba-900 border border-boba-700 rounded px-2.5 py-1 text-xs text-slate-100 font-mono focus:outline-none"
          />
          <input
            v-model="newUser.password"
            type="password"
            placeholder="Password..."
            class="bg-boba-900 border border-boba-700 rounded px-2.5 py-1 text-xs text-slate-100 font-mono focus:outline-none"
          />
        </div>
        <div class="flex justify-end">
          <button
            @click="handleCreateUser"
            :disabled="!newUser.username.trim()"
            class="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded text-xs font-semibold transition"
          >
            + Buat User
          </button>
        </div>
      </div>

      <!-- Users List Table -->
      <div class="border border-boba-800 rounded-xl overflow-hidden bg-boba-950/80 font-mono text-xs">
        <div v-if="loading" class="py-12 text-center text-slate-500 text-xs">
          Memuat daftar user database...
        </div>

        <div v-else-if="users.length === 0" class="py-12 text-center text-slate-500 text-xs">
          Tidak ada data user.
        </div>

        <div v-else class="overflow-x-auto max-h-[45vh]">
          <table class="w-full text-left border-collapse">
            <thead class="bg-[#141a29] sticky top-0 border-b border-boba-800 text-slate-300">
              <tr>
                <th class="px-3 py-2 border-r border-boba-800">User</th>
                <th class="px-3 py-2 border-r border-boba-800">Host</th>
                <th class="px-3 py-2 border-r border-boba-800">Role / Privileges</th>
                <th class="px-3 py-2 text-center w-20">Aksi</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-boba-850">
              <tr v-for="u in users" :key="`${u.username}_${u.host}`" class="hover:bg-boba-800/40 transition group">
                <td class="px-3 py-1.5 font-bold text-sky-300 border-r border-boba-850">{{ u.username }}</td>
                <td class="px-3 py-1.5 text-slate-400 border-r border-boba-850">{{ u.host }}</td>
                <td class="px-3 py-1.5 border-r border-boba-850">
                  <span
                    v-for="p in u.privileges"
                    :key="p"
                    class="px-1.5 py-0.2 mr-1 rounded text-[10px]"
                    :class="u.is_superuser ? 'bg-amber-950 text-amber-300 border border-amber-800' : 'bg-boba-900 text-slate-300'"
                  >
                    {{ p }}
                  </span>
                </td>
                <td class="px-2 py-1.5 text-center">
                  <button
                    @click="handleDropUser(u)"
                    class="px-2 py-0.5 bg-rose-950/80 hover:bg-rose-700 text-rose-300 hover:text-white rounded border border-rose-800 text-[11px] transition"
                    title="Hapus akun user ini"
                  >
                    Hapus
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- Footer -->
      <div class="border-t border-boba-800 pt-3 flex items-center justify-between text-xs text-slate-400">
        <div>Total: <strong class="text-slate-200">{{ users.length }}</strong> user terdaftar</div>
        <button
          @click="$emit('close')"
          class="px-4 py-1.5 bg-boba-800 hover:bg-boba-700 text-slate-200 rounded-lg text-xs"
        >
          Tutup
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from 'vue';
import { Icon } from '@iconify/vue';
import { useDialogStore } from '../stores/dialogStore.js';
import { tauriBridge } from '../services/tauriBridge.js';
import type { DbConnectionConfig, DbUserItem } from '../types/index.js';

const props = defineProps<{
  isOpen: boolean;
  dbConfig?: DbConnectionConfig | null;
}>();

defineEmits(['close']);

const dialogStore = useDialogStore();

const loading = ref(false);
const users = ref<DbUserItem[]>([]);
const newUser = ref({
  username: '',
  host: '%',
  password: '',
});

watch(
  () => props.isOpen,
  (open) => {
    if (open) {
      loadUsers();
    }
  }
);

async function loadUsers() {
  if (!props.dbConfig) return;
  loading.value = true;

  try {
    const list = await tauriBridge.dbmsGetDatabaseUsers(props.dbConfig);
    users.value = list;
  } catch (err: any) {
    console.error('Failed to load users:', err);
  } finally {
    loading.value = false;
  }
}

async function handleCreateUser() {
  if (!props.dbConfig || !newUser.value.username.trim()) return;
  const { username, host, password } = newUser.value;
  const engine = props.dbConfig.engine.toLowerCase();

  let sql = '';
  if (engine.includes('postgres')) {
    sql = `CREATE USER "${username}" WITH PASSWORD '${password.replace(/'/g, "''")}';`;
  } else {
    sql = `CREATE USER '${username}'@'${host}' IDENTIFIED BY '${password.replace(/'/g, "''")}';`;
  }

  try {
    await tauriBridge.dbmsExecuteQuery(props.dbConfig, undefined, sql);
    dialogStore.showToast(`User ${username} berhasil dibuat!`, 'success', 2500);
    newUser.value = { username: '', host: '%', password: '' };
    loadUsers();
  } catch (err: any) {
    await dialogStore.alert({
      title: 'Gagal Membuat User',
      description: String(err?.message || err),
      variant: 'error',
    });
  }
}

async function handleDropUser(u: DbUserItem) {
  if (!props.dbConfig) return;
  const confirm = await dialogStore.confirm({
    title: `Hapus User ${u.username}?`,
    description: 'User ini akan dihapus dari database server.',
    confirmText: 'Hapus User',
    isDestructive: true,
  });

  if (confirm) {
    const engine = props.dbConfig.engine.toLowerCase();
    const sql = engine.includes('postgres')
      ? `DROP USER "${u.username}";`
      : `DROP USER '${u.username}'@'${u.host}';`;

    try {
      await tauriBridge.dbmsExecuteQuery(props.dbConfig, undefined, sql);
      dialogStore.showToast(`User ${u.username} berhasil dihapus!`, 'success', 2000);
      loadUsers();
    } catch (err: any) {
      await dialogStore.alert({
        title: 'Gagal Menghapus User',
        description: String(err?.message || err),
        variant: 'error',
      });
    }
  }
}
</script>
