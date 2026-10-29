<template>
  <div
    v-if="isOpen"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-2 sm:p-4 animate-fade-in"
    @click.self="close"
    @click.stop
  >
    <div
      class="bg-[#12151e] border border-[#262c3d] rounded-xl shadow-2xl w-full max-w-5xl h-[92vh] sm:h-[86vh] flex flex-col overflow-hidden text-slate-200"
      @click.stop
    >
      <!-- Header -->
      <div class="min-h-[3.5rem] py-2 border-b border-[#23293a] px-4 sm:px-5 flex items-center justify-between bg-[#161a26] shrink-0 gap-3">
        <div class="flex items-center space-x-3 min-w-0">
          <div class="w-8 h-8 rounded-lg bg-teal-500/20 text-teal-400 flex items-center justify-center border border-teal-500/30 shrink-0">
            <Icon icon="lucide:shield-check" class="w-5 h-5" />
          </div>
          <div class="min-w-0">
            <div class="flex items-center space-x-2">
              <h2 class="font-bold text-sm tracking-wide text-white truncate">system-tund (Auto-Connect & SSH Self-Healing)</h2>
              <span class="text-[11px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono border border-slate-700 truncate max-w-[200px]">
                {{ hostTitle }}
              </span>
            </div>
            <p class="text-[11px] text-slate-400 truncate">Daemon remote server: auto-konek seperti SSH local & auto-restore public key jika terhapus.</p>
          </div>
        </div>

        <div class="flex items-center space-x-2 shrink-0">
          <!-- Refresh Status -->
          <button
            @click="refreshAll"
            :disabled="isChecking"
            class="px-2.5 py-1.5 bg-[#1e2333] hover:bg-[#282f45] border border-[#2e374d] text-slate-300 rounded-lg transition disabled:opacity-50 flex items-center space-x-1.5 text-xs"
            title="Muat Ulang Status system-tund"
          >
            <Icon icon="lucide:refresh-cw" :class="['w-3.5 h-3.5', isChecking ? 'animate-spin text-teal-400' : '']" />
            <span class="hidden sm:inline">Refresh</span>
          </button>

          <!-- Close Button -->
          <button
            @click="close"
            class="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-100 hover:bg-[#23293a] transition"
          >
            <Icon icon="lucide:x" class="w-4 h-4" />
          </button>
        </div>
      </div>

      <!-- Topology / Architecture Flow Banner -->
      <div class="px-4 py-2 bg-[#0e111a] border-b border-[#23293a] flex items-center justify-between text-xs shrink-0 overflow-x-auto gap-3">
        <div class="flex items-center space-x-2 text-slate-400 font-mono text-[11px] whitespace-nowrap">
          <span class="px-2 py-0.5 rounded bg-slate-800 text-slate-200 border border-slate-700 flex items-center space-x-1">
            <Icon icon="lucide:laptop" class="w-3 h-3 text-sky-400" />
            <span>Laptop (127.0.0.1:{{ localBridgePort }})</span>
          </span>
          <Icon icon="lucide:arrow-right" class="w-3 h-3 text-teal-500" />
          <span class="px-2 py-0.5 rounded bg-teal-950/50 text-teal-300 border border-teal-800/60 flex items-center space-x-1">
            <Icon icon="lucide:shield-check" class="w-3 h-3 text-teal-400" />
            <span>system-tund Daemon (:{{ status.port || configForm.port }})</span>
          </span>
          <Icon icon="lucide:arrow-right" class="w-3 h-3 text-teal-500" />
          <span class="px-2 py-0.5 rounded bg-slate-800 text-slate-200 border border-slate-700 flex items-center space-x-1">
            <Icon icon="lucide:server" class="w-3 h-3 text-emerald-400" />
            <span>Target SSH (127.0.0.1:22)</span>
          </span>
        </div>

        <div class="flex items-center space-x-2 shrink-0">
          <span
            :class="[
              'px-2 py-0.5 text-[10px] rounded-full font-mono border font-medium flex items-center space-x-1',
              status.isActive
                ? 'bg-emerald-950/60 text-emerald-400 border-emerald-800/60'
                : status.isInstalled
                  ? 'bg-amber-950/60 text-amber-400 border-amber-800/60'
                  : 'bg-slate-800 text-slate-400 border-slate-700'
            ]"
          >
            <span class="w-1.5 h-1.5 rounded-full" :class="status.isActive ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'"></span>
            <span>{{ status.isActive ? 'Active & Protected' : status.isInstalled ? 'Stopped' : 'Belum Terpasang' }}</span>
          </span>
        </div>
      </div>

      <!-- Main Body -->
      <div class="flex-1 flex flex-col md:flex-row overflow-hidden">
        <!-- Left Panel: Status, Local Bridge & Add to SSH List -->
        <div class="w-full md:w-[380px] border-b md:border-b-0 md:border-r border-[#262c3d] bg-[#161a26]/40 p-4 sm:p-5 overflow-y-auto space-y-4 shrink-0">
          <!-- Daemon Status Card -->
          <div class="bg-[#12151e] border border-[#262c3d] rounded-lg p-3.5 space-y-2.5">
            <div class="flex items-center justify-between">
              <span class="text-xs font-semibold text-slate-300">Status Layanan Daemon</span>
              <span class="text-[11px] font-mono text-slate-400">systemd</span>
            </div>

            <div class="text-[11px] space-y-1.5 text-slate-400 border-t border-[#23293a] pt-2 font-mono">
              <div class="flex justify-between">
                <span>Unit Name:</span>
                <span class="text-slate-200">system-tund.service</span>
              </div>
              <div class="flex justify-between" v-if="status.pid">
                <span>Main PID:</span>
                <span class="text-emerald-400 font-bold">{{ status.pid }}</span>
              </div>
              <div class="flex justify-between" v-if="status.subState">
                <span>SubState:</span>
                <span class="text-slate-200">{{ status.subState }}</span>
              </div>
              <div class="flex justify-between" v-if="status.port">
                <span>Tunnel Port:</span>
                <span class="text-teal-300">{{ status.port }}</span>
              </div>
              <div class="flex justify-between" v-if="status.uptime">
                <span>Aktif Sejak:</span>
                <span class="text-slate-300 truncate max-w-[170px]" :title="status.uptime">{{ status.uptime }}</span>
              </div>
            </div>
          </div>

          <!-- Akses SSH Lokal (WireGuard Style) -->
          <div class="bg-[#12151e] border border-[#262c3d] rounded-lg p-3.5 space-y-3">
            <div class="flex items-center justify-between">
              <div class="flex items-center space-x-1.5 text-xs font-semibold text-slate-200">
                <Icon icon="lucide:terminal" class="w-4 h-4 text-teal-400" />
                <span>Akses SSH Lokal</span>
              </div>
              <span
                v-if="isTunnelActive"
                class="text-[10px] px-2 py-0.5 rounded-full bg-emerald-950/70 border border-emerald-800 text-emerald-300 font-mono flex items-center space-x-1"
              >
                <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping"></span>
                <span>Aktif</span>
              </span>
            </div>

            <p class="text-[11px] text-slate-400 leading-relaxed">
              Buka port lokal di laptopmu agar bisa SSH langsung ke remote server tanpa repot credential:
            </p>

            <div v-if="isTunnelActive" class="space-y-2">
              <div class="p-2 bg-[#0d1017] rounded border border-teal-800/50 font-mono text-xs text-teal-300 flex items-center justify-between">
                <span class="truncate">ssh {{ configForm.sshUser }}@127.0.0.1 -p {{ localBridgePort }}</span>
                <button
                  @click="copyCommand(`ssh ${configForm.sshUser}@127.0.0.1 -p ${localBridgePort}`)"
                  class="p-1 hover:text-white text-slate-400 transition"
                  title="Copy command"
                >
                  <Icon icon="lucide:copy" class="w-3.5 h-3.5" />
                </button>
              </div>

              <button
                @click="stopLocalBridge"
                class="w-full py-1.5 bg-rose-950/50 hover:bg-rose-900/60 border border-rose-800/60 rounded text-xs text-rose-300 transition flex items-center justify-center space-x-1.5"
              >
                <Icon icon="lucide:square" class="w-3.5 h-3.5" />
                <span>Hentikan Akses Lokal</span>
              </button>
            </div>

            <div v-else class="space-y-2">
              <div class="flex items-center space-x-2">
                <label class="text-[11px] text-slate-400 whitespace-nowrap">Local Port:</label>
                <input
                  v-model.number="localBridgePort"
                  type="number"
                  class="w-24 px-2 py-1 bg-[#1a1f2e] border border-[#2d354b] rounded text-xs text-slate-200 font-mono focus:border-teal-500 focus:outline-none"
                />
              </div>

              <button
                @click="startLocalBridge"
                class="w-full py-1.5 bg-teal-600 hover:bg-teal-500 rounded text-xs font-semibold text-white transition flex items-center justify-center space-x-1.5 shadow"
              >
                <Icon icon="lucide:play" class="w-3.5 h-3.5" />
                <span>Aktifkan Akses Lokal</span>
              </button>
            </div>
          </div>

          <!-- FITUR: Masukkan ke List Sesi SSH Boba -->
          <div class="bg-[#12151e] border border-teal-800/40 rounded-lg p-3.5 space-y-3">
            <div class="flex items-center justify-between">
              <div class="flex items-center space-x-1.5 text-xs font-semibold text-teal-300">
                <Icon icon="lucide:bookmark-plus" class="w-4 h-4 text-teal-400" />
                <span>Daftar Sesi SSH Boba</span>
              </div>
              <span
                v-if="existingSessionInVault"
                class="text-[10px] px-2 py-0.5 rounded-full bg-emerald-950/80 border border-emerald-800 text-emerald-300 font-mono"
              >
                ✓ Sudah Ada di List
              </span>
            </div>

            <p class="text-[11px] text-slate-400 leading-relaxed">
              Simpan koneksi local-bridge ini langsung ke sidebar Boba agar bisa diklik kapan saja layaknya SSH biasa:
            </p>

            <div v-if="existingSessionInVault" class="space-y-2 pt-1">
              <div class="p-2 rounded bg-[#0d1017] border border-slate-800 text-[11px] space-y-1">
                <div class="font-semibold text-slate-200 truncate">{{ existingSessionInVault.name }}</div>
                <div class="text-slate-400 font-mono">127.0.0.1:{{ existingSessionInVault.port }} ({{ existingSessionInVault.username }})</div>
              </div>
              <button
                @click="openExistingSession"
                class="w-full py-1.5 bg-emerald-600 hover:bg-emerald-500 rounded text-xs font-semibold text-white transition flex items-center justify-center space-x-1.5 shadow"
              >
                <Icon icon="lucide:external-link" class="w-3.5 h-3.5" />
                <span>Buka Tab Sesi Ini Sekarang</span>
              </button>
            </div>

            <div v-else class="space-y-2">
              <div>
                <label class="block text-[10px] text-slate-400 mb-1">Nama Sesi Baru di Boba:</label>
                <input
                  v-model="newSessionName"
                  type="text"
                  class="w-full px-2.5 py-1 bg-[#1a1f2e] border border-[#2d354b] rounded text-xs text-slate-200 focus:border-teal-500 focus:outline-none"
                  placeholder="[system-tund] Server Name"
                />
              </div>

              <button
                @click="saveToSessionList"
                class="w-full py-1.5 bg-teal-600 hover:bg-teal-500 rounded text-xs font-semibold text-white transition flex items-center justify-center space-x-1.5 shadow"
              >
                <Icon icon="lucide:plus-circle" class="w-3.5 h-3.5" />
                <span>Simpan ke List Sesi Boba</span>
              </button>
            </div>
          </div>

          <!-- Self-Healing Test & Verification -->
          <div class="bg-[#12151e] border border-[#262c3d] rounded-lg p-3.5 space-y-2.5">
            <div class="flex items-center space-x-1.5 text-xs font-semibold text-slate-200">
              <Icon icon="lucide:activity" class="w-4 h-4 text-amber-400" />
              <span>Verifikasi Self-Healing</span>
            </div>
            <p class="text-[11px] text-slate-400 leading-relaxed">
              Jika public key terhapus dari server, klik di bawah untuk memicu pemulihan otomatis:
            </p>
            <button
              @click="triggerHealCheck"
              :disabled="isHealing || !configForm.authorizedKey"
              class="w-full py-1.5 bg-[#1e2333] hover:bg-[#282f45] border border-[#2e374d] rounded text-xs text-slate-200 transition flex items-center justify-center space-x-1.5 disabled:opacity-50"
            >
              <Icon icon="lucide:check-circle" :class="['w-3.5 h-3.5 text-emerald-400', isHealing ? 'animate-spin' : '']" />
              <span>{{ isHealing ? 'Memverifikasi...' : 'Verifikasi / Heal Key Sekarang' }}</span>
            </button>
            <div v-if="healMessage" class="p-2 rounded bg-slate-900 border border-slate-800 text-[11px] font-mono" :class="healMessage.includes('HEALED') || healMessage.includes('PRESENT') ? 'text-emerald-400' : 'text-amber-400'">
              {{ healMessage }}
            </div>
          </div>
        </div>

        <!-- Right Panel: Tabs for Config & Deployment or Journalctl Logs -->
        <div class="flex-1 flex flex-col overflow-hidden">
          <!-- Right Panel Tab Switcher -->
          <div class="border-b border-[#23293a] bg-[#141824] px-4 flex items-center justify-between shrink-0">
            <div class="flex space-x-2 text-xs">
              <button
                @click="activeRightTab = 'config'"
                :class="[
                  'py-2.5 px-3 border-b-2 font-medium transition flex items-center space-x-1.5',
                  activeRightTab === 'config'
                    ? 'border-teal-400 text-teal-300'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                ]"
              >
                <Icon icon="lucide:settings-2" class="w-3.5 h-3.5" />
                <span>Konfigurasi & Deployment</span>
              </button>
              <button
                @click="activeRightTab = 'logs'"
                :class="[
                  'py-2.5 px-3 border-b-2 font-medium transition flex items-center space-x-1.5',
                  activeRightTab === 'logs'
                    ? 'border-teal-400 text-teal-300'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                ]"
              >
                <Icon icon="lucide:file-text" class="w-3.5 h-3.5" />
                <span>Live Logs (journalctl)</span>
                <span v-if="status.logs?.length" class="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-800 text-slate-300">
                  {{ status.logs.length }}
                </span>
              </button>
            </div>

            <label class="flex items-center space-x-2 text-xs text-slate-300 cursor-pointer">
              <input type="checkbox" v-model="useSudo" class="rounded bg-[#1a1f2e] border-slate-700 text-teal-500 focus:ring-0" />
              <span>Gunakan sudo</span>
            </label>
          </div>

          <!-- Tab Content: Config -->
          <div v-if="activeRightTab === 'config'" class="flex-1 p-4 sm:p-5 overflow-y-auto space-y-4">
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div>
                <label class="block text-slate-400 mb-1">Tunnel Port (Server)</label>
                <input
                  v-model.number="configForm.port"
                  type="number"
                  class="w-full px-3 py-1.5 bg-[#1a1f2e] border border-[#2d354b] rounded text-slate-200 font-mono focus:border-teal-500 focus:outline-none"
                  placeholder="8443"
                />
              </div>
              <div>
                <label class="block text-slate-400 mb-1">Target SSH User</label>
                <input
                  v-model="configForm.sshUser"
                  type="text"
                  class="w-full px-3 py-1.5 bg-[#1a1f2e] border border-[#2d354b] rounded text-slate-200 font-mono focus:border-teal-500 focus:outline-none"
                  placeholder="root"
                />
              </div>
            </div>

            <div class="text-xs space-y-1">
              <div class="flex items-center justify-between">
                <label class="text-slate-400">Secret Token (Machine Auth)</label>
                <button
                  @click="configForm.secretToken = generateRandomSecretToken()"
                  class="text-[11px] text-teal-400 hover:text-teal-300 transition"
                >
                  Acak Ulang
                </button>
              </div>
              <input
                v-model="configForm.secretToken"
                type="text"
                class="w-full px-3 py-1.5 bg-[#1a1f2e] border border-[#2d354b] rounded text-slate-200 font-mono text-[11px] focus:border-teal-500 focus:outline-none"
              />
            </div>

            <div class="text-xs space-y-1">
              <div class="flex items-center justify-between">
                <label class="text-slate-400 font-semibold flex items-center space-x-1">
                  <span>Boba SSH Public Key (Yang Dijamin oleh Self-Healing)</span>
                  <span v-if="configForm.authorizedKey" class="text-emerald-400 text-[10px]">✓ Siap</span>
                </label>
                <div class="flex items-center space-x-2">
                  <button
                    @click="autoGenerateOrFetchKey"
                    class="text-[11px] text-emerald-400 hover:text-emerald-300 transition flex items-center space-x-1 font-medium"
                    title="Generate key baru atau ambil yang ada di server"
                  >
                    <Icon icon="lucide:sparkles" class="w-3 h-3" />
                    <span>Generate / Ambil Otomatis</span>
                  </button>
                </div>
              </div>
              <textarea
                v-model="configForm.authorizedKey"
                rows="3"
                class="w-full px-3 py-2 bg-[#1a1f2e] border border-[#2d354b] rounded text-slate-200 font-mono text-[11px] focus:border-teal-500 focus:outline-none resize-none"
                placeholder="Tempel SSH public key (ssh-ed25519 / ssh-rsa), atau klik 'Generate / Ambil Otomatis'..."
              ></textarea>
              <div v-if="!configForm.authorizedKey" class="p-2 rounded bg-amber-950/40 border border-amber-800/50 text-[11px] text-amber-300 flex items-center space-x-1.5">
                <Icon icon="lucide:info" class="w-3.5 h-3.5 shrink-0 text-amber-400" />
                <span>Kunci belum terisi. Klik <strong>"Generate / Ambil Otomatis"</strong> atau langsung klik tombol Pasang di bawah.</span>
              </div>
              <p v-else class="text-[11px] text-slate-500">
                Kunci ini akan otomatis diinjeksi ke <code>~/.ssh/authorized_keys</code> oleh <code>system-tund</code> setiap kali hilang atau dihapus.
              </p>
            </div>

            <!-- Action Buttons -->
            <div class="pt-3 border-t border-[#23293a] flex flex-wrap items-center justify-between gap-3">
              <button
                v-if="status.isInstalled"
                @click="uninstallDaemon"
                :disabled="isDeploying"
                class="px-3 py-2 bg-rose-950/40 hover:bg-rose-900/60 border border-rose-800/60 rounded text-xs text-rose-300 transition flex items-center space-x-1.5"
              >
                <Icon icon="lucide:trash-2" class="w-4 h-4" />
                <span>Uninstall system-tund</span>
              </button>
              <div v-else></div>

              <button
                @click="deployDaemon"
                :disabled="isDeploying"
                class="px-4 py-2 bg-teal-600 hover:bg-teal-500 rounded text-xs font-semibold text-white transition flex items-center space-x-2 shadow-lg disabled:opacity-50 cursor-pointer"
              >
                <Icon icon="lucide:download-cloud" :class="['w-4 h-4', isDeploying ? 'animate-bounce' : '']" />
                <span>{{ isDeploying ? 'Memasang Service...' : status.isInstalled ? 'Perbarui & Restart system-tund' : 'Pasang & Aktifkan system-tund' }}</span>
              </button>
            </div>

            <!-- Console / Deployment Logs Output -->
            <div v-if="deployLogs" class="space-y-1">
              <span class="text-[11px] text-slate-400 font-semibold">Log Eksekusi:</span>
              <pre class="p-2.5 bg-[#0d1017] border border-[#23293a] rounded font-mono text-[11px] text-slate-300 max-h-36 overflow-y-auto whitespace-pre-wrap">{{ deployLogs }}</pre>
            </div>
          </div>

          <!-- Tab Content: Live Logs -->
          <div v-else class="flex-1 p-4 sm:p-5 overflow-y-auto flex flex-col space-y-2">
            <div class="flex items-center justify-between text-xs text-slate-400">
              <span>Log systemd (<code>journalctl -u system-tund</code>):</span>
              <button
                @click="refreshAll"
                :disabled="isChecking"
                class="text-teal-400 hover:text-teal-300 flex items-center space-x-1"
              >
                <Icon icon="lucide:refresh-cw" class="w-3 h-3" :class="isChecking ? 'animate-spin' : ''" />
                <span>Muat Ulang Log</span>
              </button>
            </div>
            <div class="flex-1 bg-[#0d1017] border border-[#23293a] rounded p-3 font-mono text-xs text-slate-300 overflow-y-auto space-y-1">
              <div v-if="!status.logs || status.logs.length === 0" class="text-slate-500 italic py-4 text-center">
                Belum ada catatan log terbaru atau service belum aktif.
              </div>
              <div v-for="(logLine, idx) in status.logs" :key="idx" class="whitespace-pre-wrap leading-relaxed">
                {{ logLine }}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted } from 'vue';
import { Icon } from '@iconify/vue';
import { tauriBridge } from '../services/tauriBridge';
import { useVaultStore } from '../stores/vaultStore';
import { useSessionStore } from '../stores/sessionStore';
import type { SshSessionConfig } from '../types';
import {
  generateDeployScript,
  buildStatusCheckCommand,
  buildUninstallCommand,
  buildHealTriggerCommand,
  parseSystemTundStatus,
  generateRandomSecretToken,
  type SystemTundStatus,
} from '../utils/systemTund';

const props = defineProps<{
  isOpen: boolean;
  sessionId: string;
  hostTitle: string;
  sessionConfig?: SshSessionConfig;
  initialUseSudo?: boolean;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const vaultStore = useVaultStore();
const sessionStore = useSessionStore();

const useSudo = ref(props.initialUseSudo ?? true);
const isChecking = ref(false);
const isDeploying = ref(false);
const isHealing = ref(false);
const healMessage = ref('');
const deployLogs = ref('');
const activeRightTab = ref<'config' | 'logs'>('config');

function getRecommendedLocalPort(): number {
  if (props.sessionConfig?.system_tund_local_port) {
    return props.sessionConfig.system_tund_local_port;
  }
  const usedPorts = new Set(
    vaultStore.vault.sessions
      .filter(s => s.id !== props.sessionConfig?.id)
      .map(s => s.system_tund_local_port)
      .filter((p): p is number => typeof p === 'number')
  );
  let p = 2222;
  while (usedPorts.has(p)) {
    p++;
  }
  return p;
}

const localBridgePort = ref(getRecommendedLocalPort());
const isTunnelActive = ref(false);

const status = reactive<SystemTundStatus>({
  isInstalled: false,
  isActive: false,
  serviceStatus: 'unknown',
});

// Extract username and hostname
const defaultUser = props.sessionConfig?.username || (props.hostTitle.includes('@') ? props.hostTitle.split('@')[0]! : 'root');
const sessionBaseName = props.sessionConfig?.name || props.hostTitle;
const newSessionName = ref(`[system-tund] ${sessionBaseName}`);

const configForm = reactive({
  port: 8443,
  secretToken: generateRandomSecretToken(),
  targetPort: 22,
  authorizedKey: '',
  sshUser: defaultUser,
});

// Check if this tunnel is already saved in Boba's vault sessions
const existingSessionInVault = computed(() => {
  return vaultStore.vault.sessions.find(
    s => (s.host === '127.0.0.1' && s.port === localBridgePort.value) ||
         (s.system_tund_enabled && s.name === (newSessionName.value || `[system-tund] ${sessionBaseName}`))
  );
});

function close() {
  emit('close');
}

async function copyCommand(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {}
}

async function refreshAll() {
  isChecking.value = true;
  try {
    const cmd = buildStatusCheckCommand(useSudo.value);
    const output = await tauriBridge.sshExecCommand(props.sessionId, cmd);
    const parsed = parseSystemTundStatus(output);
    status.isInstalled = parsed.isInstalled;
    status.isActive = parsed.isActive;
    status.serviceStatus = parsed.serviceStatus;
    status.subState = parsed.subState;
    status.pid = parsed.pid;
    status.uptime = parsed.uptime;
    status.logs = parsed.logs;
    if (parsed.port) {
      status.port = parsed.port;
      configForm.port = parsed.port;
    }
    if (parsed.secretToken) {
      configForm.secretToken = parsed.secretToken;
    }
    if (parsed.authorizedKey) {
      configForm.authorizedKey = parsed.authorizedKey;
    }
    if (parsed.sshUser) {
      configForm.sshUser = parsed.sshUser;
    }
  } catch (err: any) {
    status.isInstalled = false;
    status.isActive = false;
    status.serviceStatus = 'error';
  } finally {
    isChecking.value = false;
  }
}

async function autoGenerateOrFetchKey() {
  try {
    // 1. Check existing authorized_keys
    let cmd = `cat ~/.ssh/authorized_keys 2>/dev/null | grep -E '^ssh-(ed25519|rsa)' | head -n 1`;
    let res = await tauriBridge.sshExecCommand(props.sessionId, cmd);

    // 2. If empty, check id_ed25519.pub or id_rsa.pub
    if (!res || !res.trim().startsWith('ssh-')) {
      cmd = `cat ~/.ssh/id_ed25519.pub 2>/dev/null || cat ~/.ssh/id_rsa.pub 2>/dev/null || true`;
      res = await tauriBridge.sshExecCommand(props.sessionId, cmd);
    }

    // 3. If still empty, auto-generate Ed25519 key pair on server
    if (!res || !res.trim().startsWith('ssh-')) {
      cmd = `mkdir -p ~/.ssh && chmod 700 ~/.ssh && (test -f ~/.ssh/id_ed25519.pub || ssh-keygen -t ed25519 -N "" -f ~/.ssh/id_ed25519 -C "boba-system-tund" -q) && cat ~/.ssh/id_ed25519.pub`;
      res = await tauriBridge.sshExecCommand(props.sessionId, cmd);
    }

    if (res && res.trim().startsWith('ssh-')) {
      configForm.authorizedKey = res.trim();
    }
  } catch (err: any) {
    console.error('Error fetching/generating key:', err);
  }
}

async function deployDaemon() {
  if (!configForm.authorizedKey.trim()) {
    deployLogs.value = 'Mempersiapkan SSH key otomatis di server...\\n';
    await autoGenerateOrFetchKey();
  }
  if (!configForm.authorizedKey.trim()) {
    alert('Kunci SSH tidak boleh kosong. Silakan klik tombol "Generate / Ambil Otomatis".');
    return;
  }

  isDeploying.value = true;
  deployLogs.value = 'Memulai deployment system-tund...\\n';
  try {
    const script = generateDeployScript(
      {
        port: configForm.port,
        secretToken: configForm.secretToken,
        targetPort: configForm.targetPort,
        authorizedKey: configForm.authorizedKey,
        sshUser: configForm.sshUser,
      },
      useSudo.value,
      props.sessionConfig?.password
    );
    const output = await tauriBridge.sshExecCommand(props.sessionId, script);
    deployLogs.value += output;
    await refreshAll();
  } catch (err: any) {
    deployLogs.value += `Error: ${err?.message || err}`;
  } finally {
    isDeploying.value = false;
  }
}

async function triggerHealCheck() {
  isHealing.value = true;
  healMessage.value = '';
  try {
    const cmd = buildHealTriggerCommand(
      {
        sshUser: configForm.sshUser,
        authorizedKey: configForm.authorizedKey,
      },
      useSudo.value
    );
    const res = await tauriBridge.sshExecCommand(props.sessionId, cmd);
    healMessage.value = res.trim();
  } catch (err: any) {
    healMessage.value = `Gagal: ${err?.message || err}`;
  } finally {
    isHealing.value = false;
  }
}

async function startLocalBridge() {
  try {
    await tauriBridge.sshStartTunnel(
      props.sessionId,
      'system-tund-bridge',
      'system-tund Local Bridge',
      '127.0.0.1',
      localBridgePort.value,
      '127.0.0.1',
      22
    );
    isTunnelActive.value = true;
  } catch (err: any) {
    alert(`Gagal membuka port lokal: ${err?.message || err}`);
  }
}

async function stopLocalBridge() {
  try {
    await tauriBridge.sshStopTunnel('system-tund-bridge');
    isTunnelActive.value = false;
  } catch {}
}

async function saveToSessionList() {
  if (!isTunnelActive.value) {
    await startLocalBridge();
  }

  const existing = vaultStore.vault.sessions.find(
    s => s.name === (newSessionName.value || `[system-tund] ${sessionBaseName}`) ||
         (s.host === '127.0.0.1' && s.port === localBridgePort.value)
  );

  const targetId = existing?.id || `system-tund-${Date.now()}`;
  const newSession: SshSessionConfig = {
    id: targetId,
    folder_id: props.sessionConfig?.folder_id || null,
    name: newSessionName.value || `[system-tund] ${sessionBaseName}`,
    host: '127.0.0.1',
    port: localBridgePort.value,
    username: configForm.sshUser,
    auth_type: props.sessionConfig?.auth_type || 'key',
    key_id: props.sessionConfig?.key_id,
    password: props.sessionConfig?.password,
    sftp_auto_open: false,
    system_tund_enabled: true,
    system_tund_port: configForm.port,
    system_tund_secret: configForm.secretToken,
    system_tund_local_port: localBridgePort.value,
  };

  await vaultStore.saveSession(newSession);
}

function openExistingSession() {
  if (existingSessionInVault.value) {
    sessionStore.openSession(existingSessionInVault.value, true);
    close();
  }
}

async function uninstallDaemon() {
  if (!confirm('Yakin ingin menghapus service system-tund dari server?')) return;
  isDeploying.value = true;
  try {
    const cmd = buildUninstallCommand(useSudo.value);
    const res = await tauriBridge.sshExecCommand(props.sessionId, cmd);
    deployLogs.value = `Uninstall selesai:\\n${res}`;
    await refreshAll();
  } catch (err: any) {
    deployLogs.value = `Gagal uninstall: ${err?.message || err}`;
  } finally {
    isDeploying.value = false;
  }
}

onMounted(async () => {
  await refreshAll();
  if (!configForm.authorizedKey) {
    await autoGenerateOrFetchKey();
  }
});
</script>
