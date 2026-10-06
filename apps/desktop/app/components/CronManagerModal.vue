<template>
  <div
    v-if="isOpen"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fade-in"
    @click.self="$emit('close')"
  >
    <div
      class="bg-[#12151e] border border-[#262c3d] rounded-xl shadow-2xl w-full max-w-5xl h-[85vh] flex flex-col overflow-hidden text-slate-200 select-none"
    >
      <!-- Header -->
      <div class="h-14 border-b border-[#23293a] px-5 flex items-center justify-between bg-[#161a26] shrink-0">
        <div class="flex items-center space-x-3">
          <div class="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center border border-amber-500/30">
            <Icon icon="lucide:calendar-clock" class="w-5 h-5" />
          </div>
          <div>
            <div class="flex items-center space-x-2">
              <h2 class="font-bold text-sm tracking-wide text-white">Cron Manager</h2>
              <span class="text-[11px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono border border-slate-700">
                {{ hostTitle }}
              </span>
            </div>
            <p class="text-[11px] text-slate-400">Kelola jadwal cron jobs di remote server.</p>
          </div>
        </div>

        <div class="flex items-center space-x-2.5">
          <label class="flex items-center space-x-2 text-xs text-slate-300 cursor-pointer bg-[#1e2333] px-2.5 py-1.5 rounded-lg border border-[#2e374d]">
            <input
              type="checkbox"
              v-model="useSudo"
              @change="fetchData"
              class="rounded bg-[#12151e] border-slate-600 text-amber-500 focus:ring-0 cursor-pointer"
            />
            <span class="font-mono text-amber-400 font-bold">sudo</span>
          </label>
          <button
            @click="fetchData"
            :disabled="isLoading"
            class="p-1.5 bg-[#1e2333] hover:bg-[#282f45] border border-[#2e374d] text-slate-300 rounded-lg transition disabled:opacity-50"
            title="Muat Ulang Data"
          >
            <Icon icon="lucide:refresh-cw" :class="['w-4 h-4', isLoading ? 'animate-spin text-amber-400' : '']" />
          </button>
          <button
            @click="$emit('close')"
            class="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-100 hover:bg-[#23293a] transition"
          >
            <Icon icon="lucide:x" class="w-4 h-4" />
          </button>
        </div>
      </div>

      <!-- Tabs & Add Button -->
      <div class="h-10 border-b border-[#23293a] bg-[#141722] px-5 flex items-center justify-between shrink-0">
        <div class="flex items-center space-x-2">
          <button
            @click="activeTab = 'user'"
            :class="[
              'px-3.5 py-1.5 rounded-md text-xs font-medium transition flex items-center space-x-2',
              activeTab === 'user' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' : 'text-slate-400 hover:text-slate-200'
            ]"
          >
            <Icon icon="lucide:user" class="w-3.5 h-3.5" />
            <span>User Crontab</span>
          </button>
          <button
            @click="activeTab = 'system'"
            :class="[
              'px-3.5 py-1.5 rounded-md text-xs font-medium transition flex items-center space-x-2',
              activeTab === 'system' ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40' : 'text-slate-400 hover:text-slate-200'
            ]"
          >
            <Icon icon="lucide:monitor" class="w-3.5 h-3.5" />
            <span>System Crontab</span>
          </button>
        </div>
        <button
          @click="openAddForm"
          class="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white text-xs font-medium rounded border border-amber-500/50 flex items-center space-x-1.5 transition"
        >
          <Icon icon="lucide:plus" class="w-3.5 h-3.5" />
          <span>New Cron Job</span>
        </button>
      </div>

      <!-- Main Content -->
      <div class="flex-1 overflow-y-auto bg-[#12151e] relative">
        <div v-if="isLoading" class="absolute inset-0 flex items-center justify-center bg-[#12151e]/80 z-10">
          <Icon icon="lucide:loader-2" class="w-8 h-8 text-amber-500 animate-spin" />
        </div>

        <div v-if="jobs.length === 0 && !isLoading" class="flex flex-col items-center justify-center h-full text-slate-500">
          <Icon icon="lucide:calendar-x" class="w-12 h-12 mb-3 opacity-50" />
          <p class="text-sm">Tidak ada cron job ditemukan.</p>
        </div>

        <div v-else class="flex flex-col">
          <div
            v-for="job in jobs"
            :key="job.id"
            class="group flex items-start justify-between p-4 border-b border-[#23293a] hover:bg-[#161a26]/50 transition"
          >
            <div class="flex items-start space-x-4">
              <!-- Toggle Enabled/Disabled -->
              <button
                @click="toggleJob(job)"
                :class="[
                  'mt-1 relative inline-flex h-4 w-8 shrink-0 items-center rounded-full transition-colors focus:outline-none',
                  job.enabled ? 'bg-amber-500' : 'bg-slate-600'
                ]"
                title="Toggle Enable/Disable"
              >
                <span
                  :class="[
                    'inline-block h-3 w-3 transform rounded-full bg-white transition-transform',
                    job.enabled ? 'translate-x-4' : 'translate-x-1'
                  ]"
                />
              </button>

              <div class="flex flex-col">
                <div class="flex items-center space-x-3 mb-1.5">
                  <span class="font-mono text-xs bg-[#1e2333] px-2 py-0.5 rounded border border-[#2e374d] text-amber-300 shadow-sm">
                    {{ job.schedule }}
                  </span>
                  <span class="text-xs text-slate-400 font-medium">{{ job.humanDescription }}</span>
                </div>
                <div class="font-mono text-sm text-slate-200 break-all select-text bg-[#0d0f16] px-2 py-1 rounded border border-[#1e2333]">
                  {{ job.command }}
                </div>
                <div v-if="job.comment" class="mt-2 text-xs text-slate-500 italic flex items-center space-x-1">
                  <Icon icon="lucide:message-square" class="w-3.5 h-3.5 shrink-0" />
                  <span>{{ job.comment }}</span>
                </div>
              </div>
            </div>

            <!-- Actions -->
            <div class="flex items-center space-x-1.5 ml-4 opacity-50 group-hover:opacity-100 transition shrink-0">
              <button
                @click="runJob(job)"
                class="p-2 text-slate-400 hover:text-emerald-400 hover:bg-emerald-400/10 rounded-lg transition"
                title="Run Now"
              >
                <Icon icon="lucide:play" class="w-4 h-4" />
              </button>
              <button
                @click="editJob(job)"
                class="p-2 text-slate-400 hover:text-blue-400 hover:bg-blue-400/10 rounded-lg transition"
                title="Edit"
              >
                <Icon icon="lucide:edit-2" class="w-4 h-4" />
              </button>
              <button
                @click="deleteJob(job)"
                class="p-2 text-slate-400 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition"
                title="Delete"
              >
                <Icon icon="lucide:trash-2" class="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Add/Edit Form Modal -->
    <div v-if="showForm" class="fixed inset-0 z-[60] bg-black/60 flex items-center justify-center p-4 backdrop-blur-sm animate-fade-in">
      <div class="bg-[#161a26] border border-[#2e374d] rounded-xl shadow-2xl w-full max-w-xl flex flex-col overflow-hidden">
        <!-- Header -->
        <div class="px-5 py-4 border-b border-[#2e374d] flex justify-between items-center bg-[#1e2333]">
          <h3 class="font-bold text-white text-sm flex items-center space-x-2">
            <Icon icon="lucide:clock" class="w-4 h-4 text-amber-500" />
            <span>{{ editingJob ? 'Edit Cron Job' : 'Add New Cron Job' }}</span>
          </h3>
          <button @click="showForm = false" class="text-slate-400 hover:text-white transition">
            <Icon icon="lucide:x" class="w-5 h-5" />
          </button>
        </div>

        <!-- Body -->
        <div class="p-5 space-y-5 overflow-y-auto max-h-[70vh]">
          <!-- System Crontab Warning -->
          <div
            v-if="activeTab === 'system'"
            class="p-3 bg-blue-500/10 border border-blue-500/20 rounded-lg text-blue-300 text-xs flex items-start space-x-2.5"
          >
            <Icon icon="lucide:info" class="w-5 h-5 mt-0.5 shrink-0" />
            <p class="leading-relaxed">
              Anda mengubah System Crontab (<code>/etc/crontab</code>). Pastikan command dimulai dengan <b>nama user</b>, contoh: <code class="bg-blue-900/50 px-1 py-0.5 rounded text-blue-200">root /path/to/script</code>.
            </p>
          </div>

          <!-- Preset -->
          <div>
            <label class="block text-xs font-medium text-slate-400 mb-1.5">Jadwal Preset</label>
            <select
              v-model="formPreset"
              class="w-full bg-[#12151e] border border-[#2e374d] rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-amber-500/50"
            >
              <option value="* * * * *">Setiap Menit (* * * * *)</option>
              <option value="*/5 * * * *">Setiap 5 Menit (*/5 * * * *)</option>
              <option value="0 * * * *">Setiap Jam (0 * * * *)</option>
              <option value="0 0 * * *">Setiap Hari Jam 00:00 (0 0 * * *)</option>
              <option value="0 2 * * *">Setiap Hari Jam 02:00 (0 2 * * *)</option>
              <option value="0 0 * * 0">Setiap Minggu (0 0 * * 0)</option>
              <option value="0 0 1 * *">Setiap Bulan (0 0 1 * *)</option>
              <option value="@reboot">Saat Boot (@reboot)</option>
              <option value="custom">Kustom</option>
            </select>
          </div>

          <!-- Custom Inputs -->
          <div v-if="formPreset === 'custom' || !formPreset.startsWith('@')" class="grid grid-cols-5 gap-3">
            <div>
              <label class="block text-[11px] text-slate-400 mb-1 text-center">Menit</label>
              <input v-model="formMinute" class="w-full bg-[#12151e] border border-[#2e374d] rounded-lg px-2 py-2 text-sm text-center font-mono focus:outline-none focus:border-amber-500/50 text-slate-200" placeholder="*" />
            </div>
            <div>
              <label class="block text-[11px] text-slate-400 mb-1 text-center">Jam</label>
              <input v-model="formHour" class="w-full bg-[#12151e] border border-[#2e374d] rounded-lg px-2 py-2 text-sm text-center font-mono focus:outline-none focus:border-amber-500/50 text-slate-200" placeholder="*" />
            </div>
            <div>
              <label class="block text-[11px] text-slate-400 mb-1 text-center">Tgl</label>
              <input v-model="formDom" class="w-full bg-[#12151e] border border-[#2e374d] rounded-lg px-2 py-2 text-sm text-center font-mono focus:outline-none focus:border-amber-500/50 text-slate-200" placeholder="*" />
            </div>
            <div>
              <label class="block text-[11px] text-slate-400 mb-1 text-center">Bulan</label>
              <input v-model="formMonth" class="w-full bg-[#12151e] border border-[#2e374d] rounded-lg px-2 py-2 text-sm text-center font-mono focus:outline-none focus:border-amber-500/50 text-slate-200" placeholder="*" />
            </div>
            <div>
              <label class="block text-[11px] text-slate-400 mb-1 text-center">Hari</label>
              <input v-model="formDow" class="w-full bg-[#12151e] border border-[#2e374d] rounded-lg px-2 py-2 text-sm text-center font-mono focus:outline-none focus:border-amber-500/50 text-slate-200" placeholder="*" />
            </div>
          </div>

          <!-- Preview -->
          <div class="bg-amber-500/5 border border-amber-500/20 rounded-xl p-3 text-center shadow-inner">
            <div class="font-mono text-base text-amber-300 font-bold tracking-widest">{{ computedSchedule }}</div>
            <div class="text-xs text-amber-400/80 mt-1 font-medium">{{ humanSchedule }}</div>
          </div>

          <!-- Command -->
          <div>
            <label class="block text-xs font-medium text-slate-400 mb-1.5">Command <span class="text-red-400">*</span></label>
            <textarea
              v-model="formCommand"
              rows="3"
              class="w-full bg-[#12151e] border border-[#2e374d] rounded-lg px-3 py-2 text-sm text-slate-200 font-mono focus:outline-none focus:border-amber-500/50 placeholder-slate-600"
              :placeholder="activeTab === 'system' ? 'root /usr/bin/php /var/www/script.php' : '/usr/bin/php /var/www/script.php'"
            ></textarea>
          </div>

          <!-- Comment -->
          <div>
            <label class="block text-xs font-medium text-slate-400 mb-1.5">Catatan / Komentar (Opsional)</label>
            <input
              v-model="formComment"
              type="text"
              class="w-full bg-[#12151e] border border-[#2e374d] rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-amber-500/50 placeholder-slate-600"
              placeholder="Backup database harian"
            />
          </div>
        </div>

        <!-- Footer -->
        <div class="px-5 py-4 border-t border-[#2e374d] flex justify-end space-x-3 bg-[#1e2333]">
          <button
            @click="showForm = false"
            class="px-4 py-2 text-xs font-medium text-slate-300 hover:text-white hover:bg-[#2e374d] rounded-lg transition"
          >
            Batal
          </button>
          <button
            @click="saveForm"
            class="px-5 py-2 bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold rounded-lg shadow-lg shadow-amber-900/20 transition"
          >
            Simpan
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { Icon } from '@iconify/vue';
import { parseCrontab, serializeCrontab, describeCronSchedule, type CronJobItem } from '../utils/cronParser';
import { tauriBridge } from '../services/tauriBridge';
import { useDialogStore } from '../stores/dialogStore';

const props = defineProps<{
  isOpen: boolean;
  sessionId: string;
  hostTitle: string;
  initialUseSudo?: boolean;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const dialogStore = useDialogStore();

const activeTab = ref<'user' | 'system'>('user');
const useSudo = ref(props.initialUseSudo ?? false);
const isLoading = ref(false);
const jobs = ref<CronJobItem[]>([]);

const showForm = ref(false);
const editingJob = ref<CronJobItem | null>(null);
const formPreset = ref('* * * * *');
const formMinute = ref('*');
const formHour = ref('*');
const formDom = ref('*');
const formMonth = ref('*');
const formDow = ref('*');
const formCommand = ref('');
const formComment = ref('');

const computedSchedule = computed(() => {
  if (formPreset.value && formPreset.value.startsWith('@')) return formPreset.value;
  return `${formMinute.value} ${formHour.value} ${formDom.value} ${formMonth.value} ${formDow.value}`.trim();
});

const humanSchedule = computed(() => describeCronSchedule(computedSchedule.value));

const fetchData = async () => {
  if (!props.isOpen || !props.sessionId) return;
  isLoading.value = true;
  jobs.value = [];

  const cmd = activeTab.value === 'user'
    ? (useSudo.value ? 'sudo crontab -l' : 'crontab -l')
    : (useSudo.value ? 'sudo cat /etc/crontab' : 'cat /etc/crontab');

  try {
    const res = await tauriBridge.sshExecCommand(props.sessionId, cmd);
    jobs.value = parseCrontab(res || '', activeTab.value);
  } catch (e: any) {
    dialogStore.showToast(`Error: ${e.message || e}`, 'error');
  } finally {
    isLoading.value = false;
  }
};

const doSaveJobs = async (newJobsList: CronJobItem[]) => {
  try {
    const serialized = serializeCrontab(newJobsList) + '\n';
    const base64 = btoa(unescape(encodeURIComponent(serialized)));

    let cmd = '';
    if (activeTab.value === 'user') {
      const setCmd = useSudo.value ? 'sudo crontab -' : 'crontab -';
      cmd = `echo "${base64}" | base64 -d | ${setCmd}`;
    } else {
      const setCmd = useSudo.value ? 'sudo tee /etc/crontab > /dev/null' : 'tee /etc/crontab > /dev/null';
      cmd = `echo "${base64}" | base64 -d | ${setCmd}`;
    }

    await tauriBridge.sshExecCommand(props.sessionId, cmd);
    dialogStore.showToast('Crontab berhasil diperbarui', 'success');
    await fetchData();
  } catch (e: any) {
    dialogStore.showToast(`Gagal menyimpan: ${e.message || e}`, 'error');
  }
};

const runJob = async (job: CronJobItem) => {
  try {
    dialogStore.showToast('Menjalankan cron job...', 'info');
    const cmdToRun = useSudo.value ? `sudo ${job.command}` : job.command;
    const output = await tauriBridge.sshExecCommand(props.sessionId, cmdToRun);
    dialogStore.showToast(`Selesai: ${output ? output.slice(0, 100) : 'Tanpa output'}`, 'success');
  } catch (e: any) {
    dialogStore.showToast(`Gagal: ${e.message || e}`, 'error');
  }
};

const deleteJob = async (job: CronJobItem) => {
  const confirmed = await dialogStore.confirm({
    title: 'Hapus Cron Job',
    description: `Yakin ingin menghapus job "${job.command}"?`,
    confirmText: 'Hapus',
    isDestructive: true,
  });
  if (!confirmed) return;
  const newJobs = jobs.value.filter(j => j.id !== job.id);
  await doSaveJobs(newJobs);
};

const toggleJob = (job: CronJobItem) => {
  const newJobs = jobs.value.map(j => {
    if (j.id === job.id) return { ...j, enabled: !j.enabled };
    return j;
  });
  doSaveJobs(newJobs);
};

const openAddForm = () => {
  editingJob.value = null;
  formPreset.value = '* * * * *';
  formMinute.value = '*';
  formHour.value = '*';
  formDom.value = '*';
  formMonth.value = '*';
  formDow.value = '*';
  formCommand.value = '';
  formComment.value = '';
  showForm.value = true;
};

const editJob = (job: CronJobItem) => {
  editingJob.value = job;
  if (job.schedule.startsWith('@')) {
    formPreset.value = job.schedule;
    formMinute.value = job.schedule;
    formHour.value = '';
    formDom.value = '';
    formMonth.value = '';
    formDow.value = '';
  } else {
    formPreset.value = 'custom';
    formMinute.value = job.minute || '*';
    formHour.value = job.hour || '*';
    formDom.value = job.dayOfMonth || '*';
    formMonth.value = job.month || '*';
    formDow.value = job.dayOfWeek || '*';
  }
  formCommand.value = job.command;
  formComment.value = job.comment || '';
  showForm.value = true;
};

const saveForm = async () => {
  if (!formCommand.value.trim()) {
    dialogStore.showToast('Command harus diisi', 'error');
    return;
  }

  const newJob: CronJobItem = {
    id: editingJob.value ? editingJob.value.id : Math.random().toString(36).slice(2, 11),
    raw: '',
    schedule: computedSchedule.value,
    minute: formMinute.value,
    hour: formHour.value,
    dayOfMonth: formDom.value,
    month: formMonth.value,
    dayOfWeek: formDow.value,
    command: formCommand.value.trim(),
    comment: formComment.value.trim() || undefined,
    enabled: editingJob.value ? editingJob.value.enabled : true,
    humanDescription: humanSchedule.value,
    source: activeTab.value
  };

  const newJobsList = [...jobs.value];
  if (editingJob.value) {
    const idx = newJobsList.findIndex(j => j.id === editingJob.value?.id);
    if (idx !== -1) newJobsList[idx] = newJob;
  } else {
    newJobsList.push(newJob);
  }

  await doSaveJobs(newJobsList);
  showForm.value = false;
};

watch(activeTab, () => {
  fetchData();
});

watch(() => props.isOpen, (val) => {
  if (val) {
    fetchData();
  } else {
    jobs.value = [];
    showForm.value = false;
  }
});

watch(formPreset, (val) => {
  if (val && val !== 'custom') {
    if (val.startsWith('@')) {
      formMinute.value = val;
      formHour.value = '';
      formDom.value = '';
      formMonth.value = '';
      formDow.value = '';
    } else {
      const parts = val.split(' ');
      if (parts.length === 5) {
        formMinute.value = parts[0] || '*';
        formHour.value = parts[1] || '*';
        formDom.value = parts[2] || '*';
        formMonth.value = parts[3] || '*';
        formDow.value = parts[4] || '*';
      }
    }
  }
});

onMounted(() => {
  if (props.isOpen) fetchData();
});
</script>