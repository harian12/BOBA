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
          <div class="w-8 h-8 rounded-lg bg-red-500/20 text-red-400 flex items-center justify-center border border-red-500/30 shrink-0">
            <Icon icon="lucide:shield" class="w-5 h-5" />
          </div>
          <div class="min-w-0">
            <div class="flex items-center space-x-2">
              <h2 class="font-bold text-sm tracking-wide text-white truncate">WireGuard Mesh VPN Manager</h2>
              <span class="text-[11px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono border border-slate-700 truncate max-w-[200px]">
                {{ hostTitle }}
              </span>
            </div>
            <p class="text-[11px] text-slate-400 truncate">Virtual LAN privat: server (10.99.0.1) & laptop (10.99.0.2) langsung terhubung seperti 1 jaringan lokal.</p>
          </div>
        </div>

        <div class="flex items-center space-x-2 shrink-0">
          <!-- Refresh Status -->
          <button
            @click="refreshAll"
            :disabled="isChecking"
            class="px-2.5 py-1.5 bg-[#1e2333] hover:bg-[#282f45] border border-[#2e374d] text-slate-300 rounded-lg transition disabled:opacity-50 flex items-center space-x-1.5 text-xs"
            title="Muat Ulang Status WireGuard"
          >
            <Icon icon="lucide:refresh-cw" :class="['w-3.5 h-3.5', isChecking ? 'animate-spin text-red-400' : '']" />
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

      <!-- Mesh Topology Visual Banner -->
      <div class="px-4 py-2.5 bg-[#0e111a] border-b border-[#23293a] flex items-center justify-between text-xs shrink-0 overflow-x-auto gap-3">
        <div class="flex items-center space-x-2 text-slate-400 font-mono text-[11px] whitespace-nowrap">
          <span class="px-2.5 py-1 rounded bg-slate-800 text-slate-200 border border-slate-700 flex items-center space-x-1.5">
            <Icon icon="lucide:laptop" class="w-3.5 h-3.5 text-sky-400" />
            <span class="font-bold text-sky-300">Laptop: {{ configForm.clientAddress.split('/')[0] }}</span>
          </span>
          <Icon icon="lucide:arrow-left-right" class="w-3.5 h-3.5 text-red-400 animate-pulse" />
          <span class="px-2.5 py-1 rounded bg-red-950/40 text-red-300 border border-red-800/60 flex items-center space-x-1.5">
            <Icon icon="lucide:lock" class="w-3.5 h-3.5 text-red-400" />
            <span>WireGuard UDP (:{{ configForm.listenPort }})</span>
          </span>
          <Icon icon="lucide:arrow-left-right" class="w-3.5 h-3.5 text-red-400 animate-pulse" />
          <span class="px-2.5 py-1 rounded bg-slate-800 text-slate-200 border border-slate-700 flex items-center space-x-1.5">
            <Icon icon="lucide:server" class="w-3.5 h-3.5 text-emerald-400" />
            <span class="font-bold text-emerald-300">Server: {{ configForm.serverAddress.split('/')[0] }}</span>
          </span>
        </div>

        <div class="flex items-center space-x-2 shrink-0">
          <span
            :class="[
              'px-2.5 py-0.5 text-[11px] rounded-full font-mono border font-medium flex items-center space-x-1',
              status.isActive
                ? 'bg-emerald-950/60 text-emerald-400 border-emerald-800/60'
                : status.isInstalled
                  ? 'bg-amber-950/60 text-amber-400 border-amber-800/60'
                  : 'bg-slate-800 text-slate-400 border-slate-700'
            ]"
          >
            <span class="w-1.5 h-1.5 rounded-full" :class="status.isActive ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500'"></span>
            <span>{{ status.isActive ? 'WireGuard Aktif (wg0)' : status.isInstalled ? 'Terpasang (Off)' : 'Belum Terpasang' }}</span>
          </span>
        </div>
      </div>

      <!-- Body / Navigation -->
      <div class="flex-1 flex flex-col md:flex-row overflow-hidden">
        <!-- Left Panel: Quick SSH Session & VPN Client Controls -->
        <div class="w-full md:w-[360px] border-b md:border-b-0 md:border-r border-[#262c3d] bg-[#161a26]/40 p-4 sm:p-5 overflow-y-auto space-y-4 shrink-0">
          <!-- 1-Click Save SSH Session to 10.99.0.1 -->
          <div class="bg-[#12151e] border border-red-800/40 rounded-lg p-3.5 space-y-3">
            <div class="flex items-center justify-between">
              <div class="flex items-center space-x-1.5 text-xs font-semibold text-red-300">
                <Icon icon="lucide:bookmark-plus" class="w-4 h-4 text-red-400" />
                <span>Sesi SSH Virtual LAN (10.99.0.1)</span>
              </div>
              <span
                v-if="existingWgSessionInVault"
                class="text-[10px] px-2 py-0.5 rounded-full bg-emerald-950/80 border border-emerald-800 text-emerald-300 font-mono"
              >
                ✓ Tersedia
              </span>
            </div>

            <p class="text-[11px] text-slate-400 leading-relaxed">
              Simpan sesi SSH dengan Host <code class="text-emerald-300 font-mono">10.99.0.1:22</code> ke sidebar Boba agar bisa diklik langsung kapan saja:
            </p>

            <div v-if="existingWgSessionInVault" class="space-y-2 pt-1">
              <div class="p-2.5 rounded bg-[#0d1017] border border-slate-800 text-[11px] space-y-1">
                <div class="font-semibold text-slate-200 truncate">{{ existingWgSessionInVault.name }}</div>
                <div class="text-slate-400 font-mono">Host: 10.99.0.1:22 ({{ existingWgSessionInVault.username }})</div>
              </div>
              <button
                @click="openExistingWgSession"
                class="w-full py-1.5 bg-emerald-600 hover:bg-emerald-500 rounded text-xs font-semibold text-white transition flex items-center justify-center space-x-1.5 shadow"
              >
                <Icon icon="lucide:external-link" class="w-3.5 h-3.5" />
                <span>Buka Tab Sesi 10.99.0.1 Sekarang</span>
              </button>
            </div>

            <div v-else class="space-y-2">
              <div>
                <label class="block text-[10px] text-slate-400 mb-1">Nama Sesi Baru di Boba:</label>
                <input
                  v-model="newSessionName"
                  type="text"
                  class="w-full px-2.5 py-1 bg-[#1a1f2e] border border-[#2d354b] rounded text-xs text-slate-200 focus:border-red-500 focus:outline-none"
                  placeholder="[WireGuard] Server"
                />
              </div>

              <button
                @click="saveWgSessionToVault"
                class="w-full py-1.5 bg-red-600 hover:bg-red-500 rounded text-xs font-semibold text-white transition flex items-center justify-center space-x-1.5 shadow"
              >
                <Icon icon="lucide:plus-circle" class="w-3.5 h-3.5" />
                <span>Simpan Sesi (10.99.0.1) ke Boba</span>
              </button>
            </div>
          </div>

          <!-- Client Config Export (.conf) -->
          <div class="bg-[#12151e] border border-[#262c3d] rounded-lg p-3.5 space-y-2.5">
            <div class="flex items-center justify-between">
              <div class="flex items-center space-x-1.5 text-xs font-semibold text-slate-200">
                <Icon icon="lucide:file-down" class="w-4 h-4 text-sky-400" />
                <span>File Konfigurasi Client</span>
              </div>
              <span class="text-[10px] font-mono text-slate-400">boba-wg0.conf</span>
            </div>

            <p class="text-[11px] text-slate-400 leading-relaxed">
              Gunakan config ini di WireGuard client laptopmu (Windows/Mac/Linux):
            </p>

            <div class="flex space-x-2 pt-1">
              <button
                @click="copyClientConfig"
                class="flex-1 py-1.5 bg-[#1e2333] hover:bg-[#282f45] border border-[#2e374d] rounded text-xs text-slate-200 transition flex items-center justify-center space-x-1.5"
              >
                <Icon icon="lucide:copy" class="w-3.5 h-3.5 text-teal-400" />
                <span>{{ copied ? 'Tersalin!' : 'Copy Config' }}</span>
              </button>
              <button
                @click="downloadClientConfig"
                class="flex-1 py-1.5 bg-[#1e2333] hover:bg-[#282f45] border border-[#2e374d] rounded text-xs text-slate-200 transition flex items-center justify-center space-x-1.5"
              >
                <Icon icon="lucide:download" class="w-3.5 h-3.5 text-sky-400" />
                <span>Download</span>
              </button>
            </div>
          </div>

          <!-- Live Peer Handshake / Transfer -->
          <div v-if="status.peers.length > 0" class="bg-[#12151e] border border-[#262c3d] rounded-lg p-3.5 space-y-2">
            <div class="flex items-center justify-between text-xs font-semibold text-slate-200">
              <div class="flex items-center space-x-1.5">
                <Icon icon="lucide:activity" class="w-4 h-4 text-emerald-400" />
                <span>Status Peer / Handshake</span>
              </div>
              <span class="text-[10px] text-emerald-400 font-mono">Aktif</span>
            </div>

            <div v-for="peer in status.peers" :key="peer.publicKey" class="text-[11px] font-mono space-y-1 text-slate-400 border-t border-[#23293a] pt-2">
              <div class="flex justify-between">
                <span>Handshake:</span>
                <span class="text-emerald-300">{{ peer.latestHandshake || 'Menunggu handshake' }}</span>
              </div>
              <div class="flex justify-between" v-if="peer.transferRx || peer.transferTx">
                <span>Transfer:</span>
                <span class="text-slate-300">{{ peer.transferRx }} / {{ peer.transferTx }}</span>
              </div>
              <div class="flex justify-between" v-if="peer.endpoint">
                <span>Endpoint:</span>
                <span class="text-slate-300 truncate max-w-[160px]">{{ peer.endpoint }}</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Right Panel: Setup, Config Preview & Deployment -->
        <div class="flex-1 flex flex-col overflow-hidden">
          <!-- Tab Switcher -->
          <div class="border-b border-[#23293a] bg-[#141824] px-4 flex items-center justify-between shrink-0">
            <div class="flex space-x-2 text-xs">
              <button
                @click="activeTab = 'setup'"
                :class="[
                  'py-2.5 px-3 border-b-2 font-medium transition flex items-center space-x-1.5',
                  activeTab === 'setup'
                    ? 'border-red-400 text-red-300'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                ]"
              >
                <Icon icon="lucide:settings-2" class="w-3.5 h-3.5" />
                <span>Setup & Deployment Server</span>
              </button>
              <button
                @click="activeTab = 'client-preview'"
                :class="[
                  'py-2.5 px-3 border-b-2 font-medium transition flex items-center space-x-1.5',
                  activeTab === 'client-preview'
                    ? 'border-red-400 text-red-300'
                    : 'border-transparent text-slate-400 hover:text-slate-200'
                ]"
              >
                <Icon icon="lucide:code" class="w-3.5 h-3.5" />
                <span>Lihat Config Client (.conf)</span>
              </button>
            </div>

            <label class="flex items-center space-x-2 text-xs text-slate-300 cursor-pointer">
              <input type="checkbox" v-model="useSudo" class="rounded bg-[#1a1f2e] border-slate-700 text-red-500 focus:ring-0" />
              <span>Gunakan sudo</span>
            </label>
          </div>

          <!-- Tab 1: Setup Server -->
          <div v-if="activeTab === 'setup'" class="flex-1 p-4 sm:p-5 overflow-y-auto space-y-4">
            <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
              <div>
                <label class="block text-slate-400 mb-1">Server Listen Port (UDP)</label>
                <input
                  v-model.number="configForm.listenPort"
                  type="number"
                  class="w-full px-3 py-1.5 bg-[#1a1f2e] border border-[#2d354b] rounded text-slate-200 font-mono focus:border-red-500 focus:outline-none"
                  placeholder="51820"
                />
              </div>
              <div>
                <label class="block text-slate-400 mb-1">IP Server (WireGuard)</label>
                <input
                  v-model="configForm.serverAddress"
                  type="text"
                  class="w-full px-3 py-1.5 bg-[#1a1f2e] border border-[#2d354b] rounded text-slate-200 font-mono focus:border-red-500 focus:outline-none"
                  placeholder="10.99.0.1/24"
                />
              </div>
              <div>
                <label class="block text-slate-400 mb-1">IP Laptop (Client)</label>
                <input
                  v-model="configForm.clientAddress"
                  type="text"
                  class="w-full px-3 py-1.5 bg-[#1a1f2e] border border-[#2d354b] rounded text-slate-200 font-mono focus:border-red-500 focus:outline-none"
                  placeholder="10.99.0.2/32"
                />
              </div>
            </div>

            <!-- Keys Section -->
            <div class="bg-[#0d1017] border border-[#262c3d] rounded-lg p-3.5 space-y-3 text-xs">
              <div class="flex items-center justify-between">
                <span class="font-semibold text-slate-200 flex items-center space-x-1.5">
                  <Icon icon="lucide:key" class="w-4 h-4 text-amber-400" />
                  <span>WireGuard Key Pairs (Curve25519)</span>
                </span>
                <button
                  @click="generateRandomKeys"
                  class="text-[11px] text-red-400 hover:text-red-300 transition flex items-center space-x-1"
                >
                  <Icon icon="lucide:sparkles" class="w-3 h-3" />
                  <span>Generate Key Baru</span>
                </button>
              </div>

              <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 font-mono text-[11px]">
                <div class="space-y-1">
                  <label class="text-slate-400">Server Public Key</label>
                  <input
                    v-model="configForm.serverPublicKey"
                    type="text"
                    class="w-full px-2.5 py-1 bg-[#161a26] border border-[#283045] rounded text-slate-200 focus:outline-none"
                  />
                </div>
                <div class="space-y-1">
                  <label class="text-slate-400">Client Public Key</label>
                  <input
                    v-model="configForm.clientPublicKey"
                    type="text"
                    class="w-full px-2.5 py-1 bg-[#161a26] border border-[#283045] rounded text-slate-200 focus:outline-none"
                  />
                </div>
              </div>
            </div>

            <!-- SSH Key & Self-Healing Section -->
            <div class="bg-[#0d1017] border border-[#262c3d] rounded-lg p-3.5 space-y-3 text-xs">
              <div class="flex items-center justify-between">
                <span class="font-semibold text-slate-200 flex items-center space-x-1.5">
                  <Icon icon="lucide:shield-check" class="w-4 h-4 text-emerald-400" />
                  <span>Proteksi Kunci SSH (Self-Healing ke 10.99.0.1)</span>
                </span>
                <div class="flex items-center space-x-2">
                  <button
                    @click="generateAndSaveKeyPair"
                    :disabled="isGeneratingKey"
                    class="text-[11px] text-emerald-400 hover:text-emerald-300 transition flex items-center space-x-1 font-semibold disabled:opacity-50"
                    title="Buat sepasang kunci baru: Private Key disimpan di laptopmu, Public Key dipasang di server"
                  >
                    <Icon icon="lucide:sparkles" class="w-3.5 h-3.5" :class="isGeneratingKey ? 'animate-spin' : ''" />
                    <span>{{ isGeneratingKey ? 'Membuat...' : 'Buat Pasangan Kunci (Auto-Save ke Laptop)' }}</span>
                  </button>
                  <span class="text-slate-600">|</span>
                  <button
                    @click="autoGenerateOrFetchKey"
                    class="text-[11px] text-slate-400 hover:text-slate-200 transition"
                    title="Gunakan kunci yang sudah ada di server"
                  >
                    Ambil dari Server
                  </button>
                </div>
              </div>

              <!-- Vault Key Selector & Target User -->
              <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label class="block text-slate-400 mb-1">Target SSH User</label>
                  <input
                    v-model="configForm.sshUser"
                    type="text"
                    class="w-full px-2.5 py-1.5 bg-[#161a26] border border-[#283045] rounded text-slate-200 font-mono text-[11px] focus:outline-none"
                    placeholder="root"
                  />
                </div>
                <div>
                  <label class="block text-slate-400 mb-1">Private Key di Boba Laptop</label>
                  <select
                    v-model="selectedKeyId"
                    class="w-full px-2 py-1.5 bg-[#161a26] border border-[#283045] rounded text-slate-200 text-[11px] focus:outline-none cursor-pointer"
                  >
                    <option value="">-- Kunci Baru (Auto-Attach) --</option>
                    <option v-for="k in vaultStore.vault.keys" :key="k.id" :value="k.id">
                      {{ k.name }}
                    </option>
                  </select>
                </div>
                <div>
                  <label class="block text-slate-400 mb-1">Public Key di Server</label>
                  <input
                    v-model="configForm.authorizedKey"
                    type="text"
                    class="w-full px-2.5 py-1.5 bg-[#161a26] border border-[#283045] rounded text-slate-200 font-mono text-[11px] focus:outline-none truncate"
                    placeholder="ssh-ed25519 AAAAC3... atau ssh-rsa..."
                  />
                </div>
              </div>

              <div class="flex items-center justify-between pt-1">
                <span class="text-[11px] text-slate-500">
                  Private Key tersimpan aman di Boba, dan Public Key otomatis dipulihkan ke <code>authorized_keys</code> server.
                </span>
                <button
                  @click="triggerHealCheck"
                  :disabled="isHealing || !configForm.authorizedKey"
                  class="px-2.5 py-1 bg-[#1e2333] hover:bg-[#282f45] border border-[#2e374d] rounded text-[11px] text-slate-200 transition flex items-center space-x-1 shrink-0 disabled:opacity-50"
                >
                  <Icon icon="lucide:check-circle" :class="['w-3 h-3 text-emerald-400', isHealing ? 'animate-spin' : '']" />
                  <span>{{ isHealing ? 'Memeriksa...' : 'Verifikasi Key Sekarang' }}</span>
                </button>
              </div>
              <div v-if="healStatus" class="p-2.5 rounded-lg border text-xs flex items-start space-x-2.5 animate-fade-in"
                   :class="healStatus.type === 'error' ? 'bg-rose-950/40 border-rose-800/60 text-rose-300' : 'bg-emerald-950/40 border-emerald-800/60 text-emerald-300'">
                <Icon :icon="healStatus.type === 'error' ? 'lucide:alert-circle' : 'lucide:check-circle-2'" class="w-4 h-4 shrink-0 mt-0.5" />
                <div class="space-y-0.5">
                  <div class="font-bold">{{ healStatus.title }}</div>
                  <div class="text-[11px] opacity-90 leading-relaxed">{{ healStatus.detail }}</div>
                </div>
              </div>
            </div>

            <!-- Action Buttons -->
            <div class="pt-3 border-t border-[#23293a] flex flex-wrap items-center justify-between gap-3">
              <div class="flex space-x-2">
                <button
                  v-if="status.isActive"
                  @click="stopWireguard"
                  :disabled="isDeploying"
                  class="px-3 py-2 bg-amber-950/40 hover:bg-amber-900/60 border border-amber-800/60 rounded text-xs text-amber-300 transition flex items-center space-x-1.5"
                >
                  <Icon icon="lucide:square" class="w-4 h-4" />
                  <span>Hentikan wg0</span>
                </button>
                <button
                  v-if="status.isInstalled"
                  @click="uninstallWireguard"
                  :disabled="isDeploying"
                  class="px-3 py-2 bg-rose-950/40 hover:bg-rose-900/60 border border-rose-800/60 rounded text-xs text-rose-300 transition flex items-center space-x-1.5"
                >
                  <Icon icon="lucide:trash-2" class="w-4 h-4" />
                  <span>Uninstall WireGuard</span>
                </button>
              </div>

              <button
                @click="deployWireguard"
                :disabled="isDeploying"
                class="px-4 py-2 bg-red-600 hover:bg-red-500 rounded text-xs font-semibold text-white transition flex items-center space-x-2 shadow-lg disabled:opacity-50 cursor-pointer"
              >
                <Icon icon="lucide:download-cloud" :class="['w-4 h-4', isDeploying ? 'animate-bounce' : '']" />
                <span>{{ isDeploying ? 'Memasang WireGuard...' : status.isInstalled ? 'Perbarui Konfigurasi WireGuard' : 'Pasang & Jalankan WireGuard di Server' }}</span>
              </button>
            </div>

            <!-- Console / Execution Logs -->
            <div v-if="deployLogs" class="space-y-1">
              <span class="text-[11px] text-slate-400 font-semibold">Log Eksekusi:</span>
              <pre class="p-2.5 bg-[#0d1017] border border-[#23293a] rounded font-mono text-[11px] text-slate-300 max-h-40 overflow-y-auto whitespace-pre-wrap">{{ deployLogs }}</pre>
            </div>
          </div>

          <!-- Tab 2: Client Config Preview -->
          <div v-else class="flex-1 p-4 sm:p-5 overflow-y-auto flex flex-col space-y-3">
            <div class="flex items-center justify-between text-xs text-slate-400">
              <span>Isi Konfigurasi Client WireGuard (<code>boba-wg0.conf</code>):</span>
              <button
                @click="copyClientConfig"
                class="text-red-400 hover:text-red-300 flex items-center space-x-1"
              >
                <Icon icon="lucide:copy" class="w-3.5 h-3.5" />
                <span>{{ copied ? 'Tersalin ke Clipboard!' : 'Salin Semua' }}</span>
              </button>
            </div>
            <pre class="flex-1 p-3.5 bg-[#0d1017] border border-[#23293a] rounded font-mono text-xs text-emerald-300 overflow-y-auto select-all leading-relaxed whitespace-pre-wrap">{{ clientConfigText }}</pre>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, onMounted, watch } from 'vue';
import { Icon } from '@iconify/vue';
import { tauriBridge } from '../services/tauriBridge';
import { useVaultStore } from '../stores/vaultStore';
import { useSessionStore } from '../stores/sessionStore';
import type { SshSessionConfig } from '../types';
import {
  generateWireguardInstallScript,
  buildWireguardStatusCheckCommand,
  parseWireguardStatus,
  generateClientWgConfig,
  buildWireguardHealKeyCommand,
  buildWireguardUninstallCommand,
  type WireguardServerConfig,
  type WireguardStatus,
} from '../utils/wireguardManager';

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
const isGeneratingKey = ref(false);
const selectedKeyId = ref(props.sessionConfig?.key_id || '');
const copied = ref(false);
const deployLogs = ref('');
const activeTab = ref<'setup' | 'client-preview'>('setup');

interface HealStatus {
  type: 'success' | 'healed' | 'error';
  title: string;
  detail: string;
}
const healStatus = ref<HealStatus | null>(null);

// Server Public IP extract
const serverPublicIp = props.sessionConfig?.host || (props.hostTitle.includes('@') ? props.hostTitle.split('@')[1]! : '127.0.0.1');
const defaultUser = props.sessionConfig?.username || (props.hostTitle.includes('@') ? props.hostTitle.split('@')[0]! : 'root');
const sessionBaseName = props.sessionConfig?.name || props.hostTitle;
const newSessionName = ref(`[WireGuard] ${sessionBaseName}`);

function randomBase64(length = 32): string {
  const bytes = new Uint8Array(length);
  for (let i = 0; i < length; i++) {
    bytes[i] = Math.floor(Math.random() * 256);
  }
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]!);
  }
  return btoa(binary);
}

const configForm = reactive<WireguardServerConfig>({
  serverAddress: '10.99.0.1/24',
  listenPort: 51820,
  serverPrivateKey: randomBase64(32),
  serverPublicKey: randomBase64(32),
  clientAddress: '10.99.0.2/32',
  clientPrivateKey: randomBase64(32),
  clientPublicKey: randomBase64(32),
  serverPublicIp,
  authorizedKey: '',
  sshUser: defaultUser,
});

const status = reactive<WireguardStatus>({
  isInstalled: false,
  isActive: false,
  peers: [],
});

const clientConfigText = computed(() => {
  return generateClientWgConfig(configForm);
});

// Check if a WireGuard session pointing to 10.99.0.1 already exists in Boba vault
const existingWgSessionInVault = computed(() => {
  return vaultStore.vault.sessions.find(
    s => s.host === '10.99.0.1' && s.username === (props.sessionConfig?.username || 'root')
  );
});

function close() {
  emit('close');
}

function generateRandomKeys() {
  configForm.serverPrivateKey = randomBase64(32);
  configForm.serverPublicKey = randomBase64(32);
  configForm.clientPrivateKey = randomBase64(32);
  configForm.clientPublicKey = randomBase64(32);
}

async function refreshAll() {
  isChecking.value = true;
  try {
    const cmd = buildWireguardStatusCheckCommand(useSudo.value);
    const out = await tauriBridge.sshExecCommand(props.sessionId, cmd);
    const parsed = parseWireguardStatus(out);
    status.isInstalled = parsed.isInstalled;
    status.isActive = parsed.isActive;
    status.interfaceName = parsed.interfaceName;
    status.serverPublicKey = parsed.serverPublicKey;
    status.listenPort = parsed.listenPort;
    status.peers = parsed.peers;

    if (parsed.listenPort) {
      configForm.listenPort = parsed.listenPort;
    }
    if (parsed.serverPublicKey) {
      configForm.serverPublicKey = parsed.serverPublicKey;
    }
  } catch (err: any) {
    status.isInstalled = false;
    status.isActive = false;
  } finally {
    isChecking.value = false;
  }
}

async function deployWireguard() {
  isDeploying.value = true;
  deployLogs.value = 'Memulai instalasi & konfigurasi WireGuard di server...\\n';
  try {
    const script = generateWireguardInstallScript(
      configForm,
      useSudo.value,
      props.sessionConfig?.password
    );
    const out = await tauriBridge.sshExecCommand(props.sessionId, script);
    deployLogs.value += out;
    await refreshAll();
  } catch (err: any) {
    deployLogs.value += `Error: ${err?.message || err}`;
  } finally {
    isDeploying.value = false;
  }
}

async function stopWireguard() {
  const sudo = useSudo.value ? 'sudo ' : '';
  try {
    await tauriBridge.sshExecCommand(props.sessionId, `${sudo}systemctl stop wg-quick@wg0 || ${sudo}wg-quick down wg0 2>/dev/null || true`);
    await refreshAll();
  } catch (err: any) {
    alert(`Gagal menghentikan: ${err?.message || err}`);
  }
}

async function copyClientConfig() {
  try {
    await navigator.clipboard.writeText(clientConfigText.value);
    copied.value = true;
    setTimeout(() => { copied.value = false; }, 2500);
  } catch {}
}

function downloadClientConfig() {
  const blob = new Blob([clientConfigText.value], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `boba-${sessionBaseName}-wg0.conf`;
  a.click();
  URL.revokeObjectURL(url);
}

async function saveWgSessionToVault() {
  const targetId = existingWgSessionInVault.value?.id || `wg-${Date.now()}`;

  // Pastikan kunci SSH disesuaikan dengan pasangan kunci yang dijaga oleh Self-Healing
  let attachedKeyId = props.sessionConfig?.key_id;
  if (!attachedKeyId && vaultStore.vault.keys.length > 0) {
    attachedKeyId = vaultStore.vault.keys[0]?.id;
  }

  const newSession: SshSessionConfig = {
    id: targetId,
    folder_id: props.sessionConfig?.folder_id || null,
    name: newSessionName.value || `[WireGuard] ${sessionBaseName}`,
    host: '10.99.0.1',
    port: 22,
    username: configForm.sshUser || props.sessionConfig?.username || 'root',
    auth_type: attachedKeyId ? 'key' : (props.sessionConfig?.auth_type || 'key'),
    key_id: attachedKeyId,
    password: props.sessionConfig?.password,
    sftp_auto_open: false,
    wireguard_enabled: true,
  };

  await vaultStore.saveSession(newSession);
}

function openExistingWgSession() {
  if (existingWgSessionInVault.value) {
    sessionStore.openSession(existingWgSessionInVault.value, true);
    close();
  }
}

async function generateAndSaveKeyPair() {
  isGeneratingKey.value = true;
  healStatus.value = null;
  try {
    const cmd = `PRIV_F=$(mktemp) && ssh-keygen -t ed25519 -N "" -f "$PRIV_F" -C "boba-wireguard" -q && cat "\${PRIV_F}.pub" && echo "---KEY_DELIMITER---" && cat "$PRIV_F" && rm -f "$PRIV_F" "\${PRIV_F}.pub"`;
    const res = await tauriBridge.sshExecCommand(props.sessionId, cmd);

    if (res && res.includes('---KEY_DELIMITER---')) {
      const [pubPart, privPart] = res.split('---KEY_DELIMITER---');
      const pubKey = pubPart?.trim() || '';
      const privKey = privPart?.trim() || '';

      if (pubKey.startsWith('ssh-') && privKey.includes('PRIVATE KEY')) {
        const newKeyId = `key_wg_${Date.now()}`;
        const keyName = `[WireGuard] ${sessionBaseName}`;

        await vaultStore.saveKey({
          id: newKeyId,
          name: keyName,
          private_key: privKey,
        });

        configForm.authorizedKey = pubKey;
        selectedKeyId.value = newKeyId;

        healStatus.value = {
          type: 'success',
          title: 'Pasangan Kunci Berhasil Dibuat & Disimpan!',
          detail: `Private Key telah tersimpan di Boba Vault ("${keyName}"). Public Key siap diinjeksi ke server.`
        };
        return;
      }
    }
    throw new Error('Server tidak mengembalikan pasangan kunci yang valid.');
  } catch (err: any) {
    healStatus.value = {
      type: 'error',
      title: 'Gagal Membuat Kunci',
      detail: String(err?.message || err)
    };
  } finally {
    isGeneratingKey.value = false;
  }
}

async function autoGenerateOrFetchKey() {
  try {
    let cmd = `cat ~/.ssh/authorized_keys 2>/dev/null | grep -E '^ssh-(ed25519|rsa)' | head -n 1`;
    let res = await tauriBridge.sshExecCommand(props.sessionId, cmd);

    if (!res || !res.trim().startsWith('ssh-')) {
      cmd = `cat ~/.ssh/id_ed25519.pub 2>/dev/null || cat ~/.ssh/id_rsa.pub 2>/dev/null || true`;
      res = await tauriBridge.sshExecCommand(props.sessionId, cmd);
    }

    if (!res || !res.trim().startsWith('ssh-')) {
      cmd = `mkdir -p ~/.ssh && chmod 700 ~/.ssh && (test -f ~/.ssh/id_ed25519.pub || ssh-keygen -t ed25519 -N "" -f ~/.ssh/id_ed25519 -C "boba-wireguard" -q) && cat ~/.ssh/id_ed25519.pub`;
      res = await tauriBridge.sshExecCommand(props.sessionId, cmd);
    }

    if (res && res.trim().startsWith('ssh-')) {
      configForm.authorizedKey = res.trim();
    }
  } catch (err: any) {
    console.error('Error fetching/generating key:', err);
  }
}

async function triggerHealCheck() {
  if (!configForm.authorizedKey) return;
  isHealing.value = true;
  healStatus.value = null;
  try {
    const cmd = buildWireguardHealKeyCommand(
      configForm.sshUser || 'root',
      configForm.authorizedKey,
      useSudo.value
    );
    const res = (await tauriBridge.sshExecCommand(props.sessionId, cmd)).trim();
    if (res.includes('KEY_PRESENT')) {
      healStatus.value = {
        type: 'success',
        title: 'Kunci SSH Terverifikasi & Aktif',
        detail: `Kunci publik Boba aktif di ~/.ssh/authorized_keys (${configForm.sshUser || 'root'}). Sesi SSH ke 10.99.0.1:22 siap digunakan langsung tanpa password.`
      };
    } else if (res.includes('KEY_HEALED')) {
      healStatus.value = {
        type: 'healed',
        title: 'Kunci SSH Berhasil Dipulihkan (Self-Healed)',
        detail: 'Kunci sebelumnya hilang atau terhapus, sistem telah otomatis menyuntikkannya kembali ke ~/.ssh/authorized_keys server.'
      };
    } else {
      healStatus.value = {
        type: 'error',
        title: 'Respons Server',
        detail: res
      };
    }
  } catch (err: any) {
    healStatus.value = {
      type: 'error',
      title: 'Gagal Memverifikasi Kunci',
      detail: String(err?.message || err)
    };
  } finally {
    isHealing.value = false;
  }
}

async function uninstallWireguard() {
  if (!confirm('Yakin ingin meng-uninstall WireGuard dan menghapus /etc/wireguard/wg0.conf dari server?')) return;
  isDeploying.value = true;
  try {
    const cmd = buildWireguardUninstallCommand(useSudo.value);
    const res = await tauriBridge.sshExecCommand(props.sessionId, cmd);
    deployLogs.value = `Uninstall selesai:\n${res}`;
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

watch(selectedKeyId, async (newId) => {
  if (!newId) return;
  const keyItem = vaultStore.vault.keys.find(k => k.id === newId);
  if (keyItem) {
    try {
      const escaped = keyItem.private_key.replace(/'/g, "'\\''");
      const cmd = `echo '${escaped}' | ssh-keygen -y -f /dev/stdin 2>/dev/null || true`;
      const pub = await tauriBridge.sshExecCommand(props.sessionId, cmd);
      if (pub && pub.trim().startsWith('ssh-')) {
        configForm.authorizedKey = pub.trim();
        healStatus.value = {
          type: 'success',
          title: 'Kunci Terpilih dari Vault',
          detail: `Menggunakan "${keyItem.name}". Public key berhasil diekstrak dan siap diinjeksi ke server.`
        };
      }
    } catch {}
  }
});
</script>
