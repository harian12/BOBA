<template>
  <div
    v-if="isOpen"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-2 sm:p-4 animate-fade-in"
    @click.self="$emit('close')"
    @click.stop
  >
    <div
      class="bg-[#12151e] border border-[#262c3d] rounded-xl shadow-2xl w-full max-w-5xl h-[92vh] sm:h-[86vh] flex flex-col overflow-hidden text-slate-200"
      @click.stop
    >
      <!-- Header -->
      <div class="min-h-[3.5rem] py-2 border-b border-[#23293a] px-4 sm:px-5 flex items-center justify-between bg-[#161a26] shrink-0 gap-3">
        <div class="flex items-center space-x-3 min-w-0">
          <div class="w-8 h-8 rounded-lg bg-rose-500/20 text-rose-400 flex items-center justify-center border border-rose-500/30 shrink-0">
            <Icon icon="lucide:shield-alert" class="w-5 h-5" />
          </div>
          <div class="min-w-0">
            <div class="flex items-center space-x-2">
              <h2 class="font-bold text-sm tracking-wide text-white truncate">Security & Hardening Auditor</h2>
              <span class="text-[11px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono border border-slate-700 truncate max-w-[180px]">
                {{ hostTitle }}
              </span>
            </div>
            <p class="text-[11px] text-slate-400 truncate">Audit postur keamanan server Linux & rekomendasi hardening instan.</p>
          </div>
        </div>

        <div class="flex items-center space-x-2 shrink-0">
          <!-- Guide Toggle -->
          <button
            @click="showGuide = !showGuide"
            :class="[
              'px-2.5 py-1.5 rounded-lg border text-xs transition flex items-center space-x-1.5 cursor-pointer',
              showGuide ? 'bg-rose-950/60 border-rose-500 text-rose-300' : 'bg-[#1e2333] border-[#2e374d] text-slate-300 hover:text-white'
            ]"
            title="Buka panduan audit keamanan"
          >
            <Icon icon="lucide:help-circle" class="w-4 h-4 text-rose-400" />
            <span class="hidden sm:inline font-medium">Panduan</span>
          </button>

          <!-- Sudo Toggle -->
          <label class="flex items-center space-x-1.5 cursor-pointer text-xs bg-[#1e2333] px-2.5 py-1.5 rounded-lg border border-[#2e374d]">
            <input
              type="checkbox"
              v-model="useSudo"
              @change="runAudit"
              class="rounded bg-[#12151e] border-slate-600 text-rose-500 focus:ring-0 cursor-pointer"
            />
            <span class="font-mono text-rose-400 font-bold text-[11px]">sudo</span>
          </label>

          <!-- Export Report -->
          <button
            v-if="report"
            @click="exportReportMarkdown"
            class="px-2.5 py-1.5 bg-[#1e2333] hover:bg-[#282f45] border border-[#2e374d] text-slate-300 hover:text-white rounded-lg text-xs transition flex items-center space-x-1.5 cursor-pointer"
            title="Ekspor laporan audit ke format Markdown"
          >
            <Icon icon="lucide:file-down" class="w-4 h-4 text-emerald-400" />
            <span class="hidden sm:inline">Export</span>
          </button>

          <!-- Run / Refresh Scan -->
          <button
            @click="runAudit"
            :disabled="isLoading"
            class="px-3 py-1.5 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white rounded-lg text-xs font-medium transition flex items-center space-x-1.5 cursor-pointer"
          >
            <Icon icon="lucide:refresh-cw" :class="['w-4 h-4', isLoading ? 'animate-spin' : '']" />
            <span>{{ isLoading ? 'Memindai...' : 'Mulai Audit' }}</span>
          </button>

          <!-- Close -->
          <button
            @click="$emit('close')"
            class="p-1.5 text-slate-400 hover:text-white hover:bg-rose-500/20 hover:text-rose-400 rounded-lg transition cursor-pointer"
            title="Tutup"
          >
            <Icon icon="lucide:x" class="w-5 h-5" />
          </button>
        </div>
      </div>

      <!-- Collapsible Guide Banner -->
      <div v-if="showGuide" class="p-3.5 bg-rose-950/25 border-b border-rose-900/40 text-xs text-slate-300 space-y-2 shrink-0">
        <div class="flex items-start justify-between">
          <div class="flex items-center space-x-2 font-semibold text-rose-300 text-xs">
            <Icon icon="lucide:book-open" class="w-4 h-4 text-rose-400" />
            <span>Panduan: Audit Hardening Server Linux</span>
          </div>
          <button @click="showGuide = false" class="text-slate-400 hover:text-slate-200 text-xs cursor-pointer">Tutup ✕</button>
        </div>
        <p class="leading-relaxed text-[11px] text-slate-300">
          Auditor ini mengevaluasi konfigurasi server terhadap standar praktik keamanan (CIS Benchmark light). Pemeriksaan bersifat <em>read-only</em> dan tidak mengubah berkas apapun di server sebelum Anda menekan tombol perbaikan.
        </p>
        <div class="grid grid-cols-1 sm:grid-cols-4 gap-2 pt-1 text-[11px]">
          <div class="bg-[#121622] p-2 rounded border border-rose-900/40">
            <div class="font-bold text-rose-400 mb-0.5">1. SSH Hardening</div>
            <p class="text-slate-400">Pastikan login root dimatikan dan login diwajibkan menggunakan SSH Key.</p>
          </div>
          <div class="bg-[#121622] p-2 rounded border border-rose-900/40">
            <div class="font-bold text-rose-400 mb-0.5">2. Port Database</div>
            <p class="text-slate-400">Cek apakah MySQL/Redis/Mongo terbuka ke 0.0.0.0 tanpa pembatasan firewall.</p>
          </div>
          <div class="bg-[#121622] p-2 rounded border border-rose-900/40">
            <div class="font-bold text-rose-400 mb-0.5">3. Akun & Password</div>
            <p class="text-slate-400">Deteksi akun backdoor dengan UID 0 atau akun tanpa kata sandi di /etc/shadow.</p>
          </div>
          <div class="bg-[#121622] p-2 rounded border border-rose-900/40">
            <div class="font-bold text-rose-400 mb-0.5">4. Auto Updates & Kernel</div>
            <p class="text-slate-400">Verifikasi pembaruan patch otomatis dan antrean reboot kernel sistem.</p>
          </div>
        </div>
      </div>

      <!-- Main Body -->
      <div class="flex-1 bg-[#12151e] overflow-y-auto p-4 flex flex-col space-y-4">
        
        <!-- Empty / Initial State -->
        <div v-if="!report && !isLoading" class="border border-dashed border-[#262c3d] rounded-xl p-12 text-center text-slate-500 my-auto">
          <Icon icon="lucide:shield-check" class="w-12 h-12 mx-auto mb-3 text-slate-600" />
          <h3 class="text-base font-semibold text-slate-300">Belum Ada Hasil Audit Keamanan</h3>
          <p class="text-xs text-slate-400 mt-1 max-w-md mx-auto">
            Jalankan pemindaian untuk menganalisis konfigurasi SSH, isolasi port database, status firewall, dan celah otentikasi di server.
          </p>
          <button
            @click="runAudit"
            class="mt-4 px-5 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-semibold transition cursor-pointer shadow-lg shadow-rose-900/20 inline-flex items-center space-x-2"
          >
            <Icon icon="lucide:play" class="w-4 h-4" />
            <span>Mulai Audit Sekarang</span>
          </button>
        </div>

        <!-- Loading State -->
        <div v-else-if="isLoading && !report" class="flex flex-col items-center justify-center p-16 my-auto space-y-3">
          <Icon icon="lucide:loader-2" class="w-10 h-10 animate-spin text-rose-500" />
          <div class="text-sm font-semibold text-slate-300">Memindai Postur Keamanan Server...</div>
          <div class="text-xs text-slate-500">Menganalisis sshd_config, iptables, listening sockets, dan user shadow...</div>
        </div>

        <!-- Audit Report Dashboard -->
        <div v-else-if="report" class="space-y-4">
          <!-- Summary Header Score Card -->
          <div class="bg-[#181c28] border border-[#262c3d] rounded-xl p-4 sm:p-5 flex flex-col md:flex-row items-center justify-between gap-4">
            <!-- Score & Grade -->
            <div class="flex items-center space-x-4">
              <div
                :class="[
                  'w-16 h-16 rounded-2xl flex flex-col items-center justify-center border font-bold shadow-lg shrink-0',
                  report.grade === 'A' ? 'bg-emerald-950/60 border-emerald-500 text-emerald-400 shadow-emerald-950/50' :
                  report.grade === 'B' ? 'bg-cyan-950/60 border-cyan-500 text-cyan-400 shadow-cyan-950/50' :
                  report.grade === 'C' ? 'bg-amber-950/60 border-amber-500 text-amber-400 shadow-amber-950/50' :
                  'bg-rose-950/60 border-rose-500 text-rose-400 shadow-rose-950/50'
                ]"
              >
                <span class="text-2xl leading-none">{{ report.grade }}</span>
                <span class="text-[10px] mt-0.5">{{ report.score }}/100</span>
              </div>
              <div>
                <div class="flex items-center space-x-2">
                  <h3 class="text-base font-bold text-white">{{ report.gradeLabel }}</h3>
                  <span class="text-[10px] font-mono text-slate-500">Pukul {{ report.timestamp }}</span>
                </div>
                <p class="text-xs text-slate-400 mt-0.5">
                  {{ report.summary.fail }} kerentanan kritis, {{ report.summary.warn }} peringatan, {{ report.summary.pass }} pemeriksaan lolos.
                </p>
              </div>
            </div>

            <!-- KPI Badges -->
            <div class="flex items-center space-x-2 sm:space-x-3 w-full md:w-auto justify-end">
              <div class="bg-[#12151e] px-3 py-2 rounded-lg border border-[#232938] text-center min-w-[70px]">
                <span class="text-[10px] text-slate-500 block">Lolos</span>
                <span class="font-bold text-emerald-400 text-sm">{{ report.summary.pass }}</span>
              </div>
              <div class="bg-[#12151e] px-3 py-2 rounded-lg border border-[#232938] text-center min-w-[70px]">
                <span class="text-[10px] text-slate-500 block">Peringatan</span>
                <span class="font-bold text-amber-400 text-sm">{{ report.summary.warn }}</span>
              </div>
              <div class="bg-[#12151e] px-3 py-2 rounded-lg border border-[#232938] text-center min-w-[70px]">
                <span class="text-[10px] text-slate-500 block">Gagal</span>
                <span class="font-bold text-rose-400 text-sm">{{ report.summary.fail }}</span>
              </div>
            </div>
          </div>

          <!-- Filter Bar -->
          <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 border-b border-[#232938] pb-3">
            <!-- Category Chips -->
            <div class="flex items-center space-x-1.5 overflow-x-auto no-scrollbar text-xs">
              <button
                @click="selectedCategory = 'all'"
                :class="[
                  'px-2.5 py-1 rounded-lg transition cursor-pointer font-medium',
                  selectedCategory === 'all' ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40' : 'text-slate-400 hover:text-white bg-[#181c28]'
                ]"
              >
                Semua ({{ report.items.length }})
              </button>
              <button
                @click="selectedCategory = 'ssh'"
                :class="[
                  'px-2.5 py-1 rounded-lg transition cursor-pointer font-medium',
                  selectedCategory === 'ssh' ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40' : 'text-slate-400 hover:text-white bg-[#181c28]'
                ]"
              >
                SSH
              </button>
              <button
                @click="selectedCategory = 'network'"
                :class="[
                  'px-2.5 py-1 rounded-lg transition cursor-pointer font-medium',
                  selectedCategory === 'network' ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40' : 'text-slate-400 hover:text-white bg-[#181c28]'
                ]"
              >
                Jaringan & Firewall
              </button>
              <button
                @click="selectedCategory = 'auth'"
                :class="[
                  'px-2.5 py-1 rounded-lg transition cursor-pointer font-medium',
                  selectedCategory === 'auth' ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40' : 'text-slate-400 hover:text-white bg-[#181c28]'
                ]"
              >
                Otentikasi & Akun
              </button>
              <button
                @click="selectedCategory = 'system'"
                :class="[
                  'px-2.5 py-1 rounded-lg transition cursor-pointer font-medium',
                  selectedCategory === 'system' ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40' : 'text-slate-400 hover:text-white bg-[#181c28]'
                ]"
              >
                Sistem & Kernel
              </button>
            </div>

            <!-- Issues Only Toggle -->
            <label class="flex items-center space-x-2 text-xs text-slate-400 cursor-pointer shrink-0">
              <input type="checkbox" v-model="onlyIssues" class="rounded bg-[#12151e] border-slate-600 text-rose-500 focus:ring-0 cursor-pointer" />
              <span>Hanya tampilkan masalah</span>
            </label>
          </div>

          <!-- Items Grid / List -->
          <div class="space-y-3">
            <div
              v-for="item in filteredItems"
              :key="item.id"
              class="bg-[#181c28] border border-[#262c3d] rounded-xl p-4 flex flex-col justify-between hover:border-slate-600 transition"
            >
              <div>
                <div class="flex items-start justify-between gap-3">
                  <div class="flex items-start space-x-3 min-w-0">
                    <!-- Status Icon -->
                    <div class="mt-0.5 shrink-0">
                      <Icon
                        v-if="item.status === 'pass'"
                        icon="lucide:check-circle"
                        class="w-5 h-5 text-emerald-400"
                      />
                      <Icon
                        v-else-if="item.status === 'warn'"
                        icon="lucide:alert-triangle"
                        class="w-5 h-5 text-amber-400"
                      />
                      <Icon
                        v-else-if="item.status === 'fail'"
                        icon="lucide:x-circle"
                        class="w-5 h-5 text-rose-400"
                      />
                      <Icon
                        v-else
                        icon="lucide:info"
                        class="w-5 h-5 text-sky-400"
                      />
                    </div>

                    <div class="min-w-0">
                      <div class="flex items-center space-x-2 flex-wrap gap-y-1">
                        <h4 class="font-bold text-sm text-white">{{ item.title }}</h4>
                        <!-- Category Badge -->
                        <span class="px-1.5 py-0.2 rounded text-[10px] uppercase font-mono bg-[#232938] text-slate-400 border border-[#2d3548]">
                          {{ item.category }}
                        </span>
                        <!-- Severity Badge -->
                        <span
                          v-if="item.status !== 'pass'"
                          :class="[
                            'px-1.5 py-0.2 rounded text-[10px] uppercase font-mono font-bold border',
                            item.severity === 'critical' ? 'bg-rose-950 text-rose-300 border-rose-800' :
                            item.severity === 'high' ? 'bg-amber-950 text-amber-300 border-amber-800' :
                            'bg-slate-800 text-slate-400 border-slate-700'
                          ]"
                        >
                          {{ item.severity }}
                        </span>
                      </div>
                      <p class="text-xs text-slate-300 mt-1 leading-relaxed">{{ item.description }}</p>
                    </div>
                  </div>

                  <!-- Observed Value Chip -->
                  <div class="shrink-0 text-right">
                    <span class="text-[10px] text-slate-500 block">Nilai Terdeteksi:</span>
                    <span class="font-mono text-xs text-slate-200 bg-[#12151e] px-2 py-0.5 rounded border border-[#232938]">
                      {{ item.observedValue }}
                    </span>
                  </div>
                </div>

                <!-- Remediation Block -->
                <div v-if="item.remediationCmd" class="mt-3 bg-[#11141f] rounded-lg p-3 border border-[#262c3d] space-y-2 text-xs">
                  <div class="flex items-center justify-between text-[11px] text-rose-300 font-semibold gap-2">
                    <div class="flex items-center space-x-1.5 shrink-0">
                      <Icon icon="lucide:wrench" class="w-3.5 h-3.5 text-rose-400" />
                      <span>Rekomendasi Perbaikan:</span>
                    </div>
                    <div class="flex items-center space-x-2 shrink-0">
                      <button
                        @click="copyText(item.remediationCmd)"
                        class="text-slate-400 hover:text-white text-[10px] flex items-center space-x-1 cursor-pointer"
                      >
                        <Icon icon="lucide:copy" class="w-3 h-3" />
                        <span>Salin Command</span>
                      </button>
                      <button
                        @click="applyFix(item)"
                        :disabled="applyingFixId === item.id"
                        class="px-2 py-0.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded text-[10px] font-medium flex items-center space-x-1 cursor-pointer transition shadow"
                        title="Eksekusi perintah perbaikan otomatis ke server via SSH"
                      >
                        <Icon icon="lucide:zap" :class="['w-3 h-3', applyingFixId === item.id ? 'animate-spin' : '']" />
                        <span>{{ applyingFixId === item.id ? 'Menerapkan...' : 'Perbaiki Otomatis' }}</span>
                      </button>
                    </div>
                  </div>
                  <p v-if="item.remediationDesc" class="text-slate-400 text-[11px]">{{ item.remediationDesc }}</p>
                  <div class="bg-[#0b0d13] p-2 rounded font-mono text-[11px] text-amber-300 overflow-x-auto select-all border border-[#1b2130]">
                    {{ item.remediationCmd }}
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Raw Console Output Collapsible -->
          <div class="border border-[#262c3d] rounded-xl overflow-hidden bg-[#181c28]">
            <button
              @click="showRawOutput = !showRawOutput"
              class="w-full px-4 py-2.5 text-xs text-slate-400 hover:text-white flex items-center justify-between bg-[#141724] cursor-pointer"
            >
              <div class="flex items-center space-x-2">
                <Icon icon="lucide:terminal" class="w-4 h-4 text-slate-500" />
                <span>Log Output Console Mentah</span>
              </div>
              <Icon :icon="showRawOutput ? 'lucide:chevron-up' : 'lucide:chevron-down'" class="w-4 h-4" />
            </button>
            <div v-if="showRawOutput" class="p-3 bg-[#0d1017] font-mono text-xs text-slate-300 overflow-x-auto max-h-[220px]">
              <pre class="whitespace-pre-wrap">{{ report.rawOutput }}</pre>
            </div>
          </div>
        </div>

      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { Icon } from '@iconify/vue';
import { tauriBridge } from '../services/tauriBridge.js';
import { useDialogStore } from '../stores/dialogStore.js';
import {
  buildSecurityAuditScript,
  parseSecurityAuditOutput,
  type SecurityAuditReport
} from '../utils/securityAuditor.js';

const props = defineProps<{
  isOpen: boolean;
  sessionId: string;
  hostTitle: string;
}>();

defineEmits<{
  (e: 'close'): void;
}>();

const dialogStore = useDialogStore();
const isLoading = ref(false);
const useSudo = ref(true);
const showGuide = ref(false);
const showRawOutput = ref(false);
const selectedCategory = ref<string>('all');
const onlyIssues = ref(false);

const report = ref<SecurityAuditReport | null>(null);
const applyingFixId = ref<string | null>(null);

const filteredItems = computed(() => {
  if (!report.value) return [];
  return report.value.items.filter((item) => {
    if (selectedCategory.value !== 'all' && item.category !== selectedCategory.value) {
      return false;
    }
    if (onlyIssues.value && item.status === 'pass') {
      return false;
    }
    return true;
  });
});

async function runAudit() {
  if (isLoading.value) return;
  isLoading.value = true;
  dialogStore.showToast('Menjalankan audit keamanan server...', 'info');

  try {
    const script = buildSecurityAuditScript(useSudo.value);
    const rawOutput = await tauriBridge.sshExecCommand(props.sessionId, script);
    report.value = parseSecurityAuditOutput(rawOutput);
    dialogStore.showToast(`Audit selesai: Skor ${report.value.score}/100 (${report.value.grade})`, 'success');
  } catch (err: any) {
    dialogStore.showToast(`Audit gagal: ${err.message || err}`, 'error');
  } finally {
    isLoading.value = false;
  }
}

function copyText(text: string) {
  navigator.clipboard.writeText(text);
  dialogStore.showToast('Perintah disalin ke clipboard', 'success');
}

async function applyFix(item: any) {
  if (!item.remediationCmd || applyingFixId.value) return;
  applyingFixId.value = item.id;
  dialogStore.showToast(`Menerapkan perbaikan untuk ${item.title}...`, 'info');

  try {
    await tauriBridge.sshExecCommand(props.sessionId, item.remediationCmd);
    dialogStore.showToast(`Perbaikan untuk ${item.title} berhasil diterapkan! Memindai ulang...`, 'success');
    await runAudit();
  } catch (err: any) {
    dialogStore.showToast(`Gagal menerapkan perbaikan: ${err.message || err}`, 'error');
  } finally {
    applyingFixId.value = null;
  }
}

function exportReportMarkdown() {
  if (!report.value) return;
  const r = report.value;
  let md = `# Server Security Audit Report: ${props.hostTitle}\n\n`;
  md += `- **Date/Time:** ${new Date().toLocaleString()}\n`;
  md += `- **Security Score:** ${r.score} / 100 (Grade ${r.grade})\n`;
  md += `- **Summary:** ${r.summary.pass} Passed, ${r.summary.warn} Warnings, ${r.summary.fail} Critical Issues\n\n`;
  md += `## Findings & Recommendations\n\n`;

  for (const item of r.items) {
    const statusMark = item.status === 'pass' ? '[PASS]' : item.status === 'warn' ? '[WARN]' : '[FAIL]';
    md += `### ${statusMark} ${item.title}\n`;
    md += `- **Category:** ${item.category}\n`;
    md += `- **Severity:** ${item.severity}\n`;
    md += `- **Observed Value:** ${item.observedValue}\n`;
    md += `- **Description:** ${item.description}\n`;
    if (item.remediationCmd) {
      md += `- **Remediation Command:** \`${item.remediationCmd}\`\n`;
    }
    md += `\n`;
  }

  const blob = new Blob([md], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `security-audit-${props.hostTitle.replace(/[^a-zA-Z0-9]/g, '_')}.md`;
  a.click();
  URL.revokeObjectURL(url);
  dialogStore.showToast('Laporan audit berhasil diekspor!', 'success');
}

watch(
  () => props.isOpen,
  (val) => {
    if (val && !report.value && !isLoading.value) {
      runAudit();
    }
  }
);

onMounted(() => {
  if (props.isOpen && !report.value) {
    runAudit();
  }
});
</script>

<style scoped>
.animate-fade-in {
  animation: fadeIn 0.15s ease-out;
}
@keyframes fadeIn {
  from { opacity: 0; transform: scale(0.98); }
  to { opacity: 1; transform: scale(1); }
}
</style>
