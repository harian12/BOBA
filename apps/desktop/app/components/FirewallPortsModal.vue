<template>
  <div v-if="isOpen" class="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 animate-fade-in bg-black/60 backdrop-blur-sm">
    <div class="bg-[#12151e] w-full max-w-5xl h-[85vh] rounded-xl border border-[#262c3d] shadow-2xl flex flex-col overflow-hidden relative shadow-black/50">
      
      <!-- Header -->
      <div class="h-14 border-b border-[#262c3d] bg-[#161a26] flex items-center justify-between px-4 shrink-0">
        <div class="flex items-center space-x-3">
          <div class="w-8 h-8 rounded bg-teal-950/50 flex items-center justify-center border border-teal-900/50">
            <Icon icon="lucide:shield-check" class="w-5 h-5 text-teal-400" />
          </div>
          <div>
            <h2 class="text-sm font-semibold text-slate-200">Firewall & Ports</h2>
            <p class="text-[10px] text-slate-500 font-mono">{{ hostTitle }}</p>
          </div>
        </div>
        <div class="flex items-center space-x-4">
          <!-- Sudo Toggle -->
          <label class="flex items-center space-x-1.5 cursor-pointer text-xs group">
            <div class="relative flex items-center">
              <input type="checkbox" v-model="useSudo" class="sr-only" @change="fetchData" />
              <div class="w-7 h-4 bg-[#1e2333] rounded-full border border-[#2e374d] transition-colors group-hover:border-slate-500" :class="useSudo ? 'bg-teal-900/40 border-teal-700' : ''"></div>
              <div class="absolute w-2.5 h-2.5 bg-slate-400 rounded-full left-1 transition-transform" :class="useSudo ? 'translate-x-3 bg-teal-400' : ''"></div>
            </div>
            <span class="text-slate-400 group-hover:text-slate-300 font-mono">Use Sudo</span>
          </label>

          <!-- Auto Refresh -->
          <label class="flex items-center space-x-1.5 cursor-pointer text-xs group">
            <div class="relative flex items-center">
              <input type="checkbox" v-model="isAutoRefresh" class="sr-only" />
              <div class="w-7 h-4 bg-[#1e2333] rounded-full border border-[#2e374d] transition-colors group-hover:border-slate-500" :class="isAutoRefresh ? 'bg-violet-900/40 border-violet-700' : ''"></div>
              <div class="absolute w-2.5 h-2.5 bg-slate-400 rounded-full left-1 transition-transform" :class="isAutoRefresh ? 'translate-x-3 bg-violet-400' : ''"></div>
            </div>
            <span class="text-slate-400 group-hover:text-slate-300">Auto Refresh</span>
          </label>

          <!-- Refresh Button -->
          <button @click="fetchData" :disabled="isLoading" class="p-1.5 text-slate-400 hover:text-white rounded hover:bg-[#202638] transition">
            <Icon icon="lucide:refresh-cw" :class="['w-4 h-4', isLoading ? 'animate-spin' : '']" />
          </button>
          <div class="w-px h-5 bg-[#262c3d]"></div>
          <button @click="close" class="p-1.5 text-slate-400 hover:text-white hover:bg-rose-500/20 hover:text-rose-400 rounded transition">
            <Icon icon="lucide:x" class="w-5 h-5" />
          </button>
        </div>
      </div>

      <!-- Action Feedback / Flash Message -->
      <div v-if="actionMessage" class="absolute top-16 left-1/2 -translate-x-1/2 z-10 px-4 py-2 bg-emerald-950/90 border border-emerald-800 text-emerald-300 text-xs font-semibold rounded shadow-lg backdrop-blur animate-fade-in flex items-center space-x-2">
        <Icon icon="lucide:check-circle" class="w-4 h-4" />
        <span>{{ actionMessage }}</span>
      </div>

      <!-- Main Layout: Sidebar & Content -->
      <div class="flex flex-1 overflow-hidden">
        <!-- Tabs Sidebar -->
        <div class="w-48 border-r border-[#262c3d] bg-[#141724] flex flex-col p-2 shrink-0">
          <button
            @click="activeTab = 'ports'"
            :class="[
              'flex items-center justify-between px-3 py-2 rounded mb-1 transition text-left',
              activeTab === 'ports' ? 'bg-[#1d2235] text-teal-300 font-semibold' : 'text-slate-400 hover:bg-[#181d2c] hover:text-slate-200'
            ]"
          >
            <div class="flex items-center space-x-2">
              <Icon icon="lucide:network" class="w-4 h-4" />
              <span class="text-xs">Listening Ports</span>
            </div>
            <span class="text-[10px] bg-[#1e2333] px-1.5 py-0.5 rounded-full" v-if="ports.length > 0">{{ ports.length }}</span>
          </button>

          <button
            @click="activeTab = 'rules'"
            :class="[
              'flex items-center justify-between px-3 py-2 rounded transition text-left',
              activeTab === 'rules' ? 'bg-[#1d2235] text-teal-300 font-semibold' : 'text-slate-400 hover:bg-[#181d2c] hover:text-slate-200'
            ]"
          >
            <div class="flex items-center space-x-2">
              <Icon icon="lucide:shield" class="w-4 h-4" />
              <span class="text-xs">Firewall Rules</span>
            </div>
            <div class="flex items-center space-x-1" v-if="firewall.type !== 'none'">
              <span v-if="firewall.active" class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
              <span v-else class="w-2 h-2 rounded-full bg-slate-500"></span>
              <span class="text-[10px] bg-[#1e2333] px-1.5 py-0.5 rounded-full" v-if="firewall.rules.length > 0">{{ firewall.rules.length }}</span>
            </div>
          </button>
        </div>

        <!-- Content Area -->
        <div class="flex-1 overflow-y-auto bg-[#0d0f16] p-4 relative">
          
          <!-- Permissions Error -->
          <div v-if="permissionError" class="mb-4 p-3 bg-rose-950/30 border border-rose-800/40 rounded flex items-start space-x-3 text-sm text-rose-200">
            <Icon icon="lucide:alert-triangle" class="w-5 h-5 text-rose-400 shrink-0" />
            <div class="flex-1">
              <p>{{ permissionError }}</p>
              <button v-if="!useSudo" @click="useSudo = true; fetchData()" class="mt-2 px-3 py-1 bg-rose-900/40 hover:bg-rose-800 text-rose-200 text-xs rounded transition">Aktifkan Sudo Mode & Coba Lagi</button>
            </div>
          </div>

          <!-- TAB: PORTS -->
          <div v-if="activeTab === 'ports'" class="space-y-4">
            <div class="flex items-center justify-between">
              <!-- Search Input -->
              <div class="relative w-64">
                <Icon icon="lucide:search" class="absolute left-2.5 top-2 w-4 h-4 text-slate-500" />
                <input
                  v-model="portsSearch"
                  type="text"
                  placeholder="Cari port atau proses..."
                  class="w-full bg-[#121520] border border-[#2e374d] text-slate-200 text-xs rounded pl-8 pr-3 py-1.5 focus:outline-none focus:border-teal-500/50 transition font-mono placeholder-slate-600"
                />
                <button v-if="portsSearch" @click="portsSearch = ''" class="absolute right-2 top-2 text-slate-500 hover:text-slate-300">
                  <Icon icon="lucide:x" class="w-3.5 h-3.5" />
                </button>
              </div>

              <!-- Protocol Filters -->
              <div class="flex items-center space-x-1.5">
                <button
                  v-for="proto in ['ALL', 'TCP', 'UDP']"
                  :key="proto"
                  @click="portsProtoFilter = proto as 'ALL' | 'TCP' | 'UDP'"
                  :class="[
                    'px-2.5 py-1 rounded text-[11px] font-mono transition',
                    portsProtoFilter === proto ? 'bg-teal-950/60 text-teal-300 border border-teal-800/60' : 'bg-[#181d2c] text-slate-400 border border-[#272f44] hover:text-slate-200'
                  ]"
                >
                  {{ proto }}
                </button>
              </div>
            </div>

            <!-- Empty State -->
            <div v-if="!isLoading && filteredPorts.length === 0" class="text-center py-12">
              <Icon icon="lucide:network" class="w-10 h-10 mx-auto text-slate-600 mb-2" />
              <p class="text-xs text-slate-500">Tidak ada port yang cocok.</p>
            </div>

            <!-- Ports Table -->
            <div v-else class="border border-[#222838] rounded-lg bg-[#131620] overflow-x-auto">
              <table class="w-full text-left text-xs border-collapse">
                <thead>
                  <tr class="bg-[#171c2a] border-b border-[#222838] text-slate-400 text-[10px] font-mono uppercase tracking-wider">
                    <th class="py-2.5 px-3 w-16">PROTO</th>
                    <th class="py-2.5 px-3">LOCAL ADDRESS:PORT</th>
                    <th class="py-2.5 px-3">SCOPE</th>
                    <th class="py-2.5 px-3">PROCESS / PID</th>
                    <th class="py-2.5 px-3 w-20">STATE</th>
                    <th class="py-2.5 px-3 text-right w-44">ACTIONS</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-[#1e2333] font-mono text-[11px]">
                  <tr v-for="(p, i) in filteredPorts" :key="i" class="hover:bg-[#181d2c] transition group">
                    <!-- Protocol -->
                    <td class="py-2 px-3">
                      <span :class="[
                        'px-1.5 py-0.5 rounded uppercase font-bold text-[9px]',
                        p.protocol.startsWith('tcp') ? 'bg-sky-950/40 text-sky-400 border border-sky-900/30' : 'bg-fuchsia-950/40 text-fuchsia-400 border border-fuchsia-900/30'
                      ]">
                        {{ p.protocol }}
                      </span>
                    </td>
                    <!-- Address:Port -->
                    <td class="py-2 px-3 text-slate-200 font-semibold flex items-center space-x-1.5">
                      <span class="text-slate-500">{{ p.localAddress }}</span>
                      <span class="text-slate-500">:</span>
                      <span class="text-amber-300">{{ p.localPort || '*' }}</span>
                    </td>
                    <!-- Scope -->
                    <td class="py-2 px-3">
                      <span v-if="p.localAddress === '127.0.0.1' || p.localAddress === '::1'" class="text-emerald-400 flex items-center space-x-1">
                        <Icon icon="lucide:home" class="w-3 h-3" /> <span>Local</span>
                      </span>
                      <span v-else class="text-amber-400 flex items-center space-x-1">
                        <Icon icon="lucide:globe" class="w-3 h-3" /> <span>Public</span>
                      </span>
                    </td>
                    <!-- Process/PID -->
                    <td class="py-2 px-3 text-slate-300">
                      <div class="flex items-center space-x-2">
                        <span v-if="p.processName" class="font-semibold text-slate-200">{{ p.processName }}</span>
                        <span v-if="p.pid" class="text-slate-500 text-[10px] bg-[#1e2333] px-1 rounded">{{ p.pid }}</span>
                        <span v-if="!p.processName && !p.pid" class="text-slate-600">-</span>
                      </div>
                    </td>
                    <!-- State -->
                    <td class="py-2 px-3 text-slate-500">{{ p.state }}</td>
                    <!-- Actions -->
                    <td class="py-2 px-3 text-right">
                      <div class="flex items-center justify-end space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button @click="copyText(p.localPort?.toString() || '')" class="p-1.5 bg-[#202638] hover:bg-[#2c344c] border border-[#303a52] text-slate-300 rounded" title="Copy Port">
                          <Icon icon="lucide:copy" class="w-3.5 h-3.5" />
                        </button>
                        <button v-if="p.localPort" @click="openQuickAllow(p)" class="px-2 py-1 bg-teal-950/60 hover:bg-teal-900 border border-teal-800 text-teal-300 rounded flex items-center space-x-1" title="Allow in Firewall">
                          <Icon icon="lucide:shield-plus" class="w-3.5 h-3.5" />
                          <span>Allow</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          <!-- TAB: FIREWALL RULES -->
          <div v-if="activeTab === 'rules'" class="space-y-4">
            
            <div v-if="firewall.type === 'none'" class="text-center py-12 space-y-3">
              <Icon icon="lucide:shield-alert" class="w-12 h-12 mx-auto text-amber-500/50" />
              <h3 class="text-amber-400 font-semibold">UFW tidak terdeteksi</h3>
              <p class="text-xs text-slate-400 max-w-sm mx-auto">Server ini tidak menggunakan Uncomplicated Firewall (UFW). Pastikan Anda menggunakan firewall lain (seperti iptables atau firewalld) atau install ufw.</p>
            </div>
            
            <div v-else>
              <!-- UFW Top Bar -->
              <div class="flex items-center justify-between mb-4 bg-[#141823] p-3 rounded-lg border border-[#222838]">
                <div class="flex items-center space-x-4">
                  <div class="flex items-center space-x-2">
                    <span v-if="firewall.active" class="relative flex h-3 w-3">
                      <span class="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                      <span class="relative inline-flex rounded-full h-3 w-3 bg-emerald-500"></span>
                    </span>
                    <span v-else class="w-3 h-3 rounded-full bg-rose-500"></span>
                    <span class="text-xs font-semibold" :class="firewall.active ? 'text-emerald-400' : 'text-rose-400'">
                      UFW {{ firewall.active ? 'Active' : 'Inactive' }}
                    </span>
                  </div>
                  
                  <div class="w-px h-4 bg-[#2e374d]"></div>
                  
                  <button @click="toggleUfw" :disabled="isActionLoading" class="px-3 py-1 rounded text-xs transition border flex items-center space-x-1.5"
                    :class="firewall.active ? 'bg-rose-950/40 border-rose-900/50 text-rose-300 hover:bg-rose-900/60' : 'bg-emerald-950/40 border-emerald-900/50 text-emerald-300 hover:bg-emerald-900/60'">
                    <Icon :icon="firewall.active ? 'lucide:power-off' : 'lucide:power'" class="w-3.5 h-3.5" />
                    <span>{{ firewall.active ? 'Disable UFW' : 'Enable UFW' }}</span>
                  </button>

                  <button @click="reloadUfw" :disabled="isActionLoading || !firewall.active" class="px-3 py-1 rounded text-xs transition border bg-[#1e2436] border-[#2e374d] text-slate-300 hover:bg-[#252c41] flex items-center space-x-1.5 disabled:opacity-50 disabled:cursor-not-allowed">
                    <Icon icon="lucide:refresh-cw" :class="['w-3.5 h-3.5', isActionLoading ? 'animate-spin' : '']" />
                    <span>Reload</span>
                  </button>
                </div>

                <button @click="showAddRule = true" :disabled="!firewall.active" class="px-3 py-1.5 bg-teal-600 hover:bg-teal-500 text-white rounded text-xs font-semibold transition flex items-center space-x-1.5 disabled:opacity-50 disabled:cursor-not-allowed">
                  <Icon icon="lucide:plus" class="w-3.5 h-3.5" />
                  <span>Tambah Rule</span>
                </button>
              </div>

              <!-- Rules Table -->
              <div v-if="!firewall.active" class="text-center py-10">
                <p class="text-xs text-slate-500">Aktifkan UFW untuk melihat dan mengelola aturan (rules).</p>
              </div>
              <div v-else-if="firewall.rules.length === 0" class="text-center py-10">
                <p class="text-xs text-slate-500">Belum ada aturan (rules) yang dikonfigurasi.</p>
              </div>
              <div v-else class="border border-[#222838] rounded-lg bg-[#131620] overflow-x-auto">
                <table class="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr class="bg-[#171c2a] border-b border-[#222838] text-slate-400 text-[10px] font-mono uppercase tracking-wider">
                      <th class="py-2.5 px-3 w-12 text-center">ID</th>
                      <th class="py-2.5 px-3">TO (PORT)</th>
                      <th class="py-2.5 px-3 w-28">ACTION</th>
                      <th class="py-2.5 px-3 w-20">DIR</th>
                      <th class="py-2.5 px-3">FROM (IP)</th>
                      <th class="py-2.5 px-3 text-right w-20">ACTIONS</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-[#1e2333] font-mono text-[11px]">
                    <tr v-for="r in firewall.rules" :key="r.index || r.raw" class="hover:bg-[#181d2c] transition group">
                      <td class="py-2 px-3 text-center text-slate-500">[{{ r.index || '-' }}]</td>
                      <td class="py-2 px-3 text-slate-200 font-semibold">{{ r.to }}</td>
                      <td class="py-2 px-3">
                        <span :class="[
                          'px-2 py-0.5 rounded text-[10px] font-bold',
                          r.action === 'ALLOW' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'
                        ]">
                          {{ r.action }}
                        </span>
                      </td>
                      <td class="py-2 px-3 text-slate-400">{{ r.direction }}</td>
                      <td class="py-2 px-3 text-slate-400">{{ r.from }} <span v-if="r.comment" class="text-slate-600 italic"># {{ r.comment }}</span></td>
                      <td class="py-2 px-3 text-right">
                        <button v-if="r.index" @click="deleteRule(r.index)" :disabled="isActionLoading" class="p-1.5 text-slate-500 hover:bg-rose-500/20 hover:text-rose-400 rounded transition opacity-0 group-hover:opacity-100" title="Delete Rule">
                          <Icon icon="lucide:trash-2" class="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- ADD RULE MODAL / OVERLAY -->
      <div v-if="showAddRule" class="absolute inset-0 z-20 bg-black/50 backdrop-blur flex items-center justify-center p-4">
        <div class="bg-[#141823] w-full max-w-md rounded-lg border border-[#2e374d] shadow-xl overflow-hidden flex flex-col">
          <div class="px-4 py-3 border-b border-[#2e374d] flex items-center justify-between bg-[#1a1e2d]">
            <h3 class="text-sm font-semibold text-white">Tambah Firewall Rule (UFW)</h3>
            <button @click="showAddRule = false" class="text-slate-400 hover:text-white"><Icon icon="lucide:x" class="w-4 h-4" /></button>
          </div>
          <div class="p-4 space-y-4">
            <div>
              <label class="block text-xs text-slate-400 mb-1.5">Port atau Service (cth: 80, 443, 22, mysql)</label>
              <input v-model="newRule.port" type="text" class="w-full bg-[#0d0f16] border border-[#2e374d] text-slate-200 text-xs rounded px-3 py-2 focus:outline-none focus:border-teal-500 transition font-mono placeholder-slate-600" placeholder="Misal: 8080" />
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label class="block text-xs text-slate-400 mb-1.5">Protocol</label>
                <select v-model="newRule.protocol" class="w-full bg-[#0d0f16] border border-[#2e374d] text-slate-200 text-xs rounded px-3 py-2 focus:outline-none focus:border-teal-500 transition font-mono appearance-none">
                  <option value="">Any</option>
                  <option value="tcp">TCP</option>
                  <option value="udp">UDP</option>
                </select>
              </div>
              <div>
                <label class="block text-xs text-slate-400 mb-1.5">Action</label>
                <select v-model="newRule.action" class="w-full bg-[#0d0f16] border border-[#2e374d] text-slate-200 text-xs rounded px-3 py-2 focus:outline-none focus:border-teal-500 transition font-mono appearance-none">
                  <option value="allow">ALLOW</option>
                  <option value="deny">DENY</option>
                  <option value="reject">REJECT</option>
                </select>
              </div>
            </div>
            <div>
              <label class="block text-xs text-slate-400 mb-1.5">From IP / Subnet (Kosong = Anywhere)</label>
              <input v-model="newRule.from" type="text" class="w-full bg-[#0d0f16] border border-[#2e374d] text-slate-200 text-xs rounded px-3 py-2 focus:outline-none focus:border-teal-500 transition font-mono placeholder-slate-600" placeholder="Misal: 192.168.1.0/24" />
            </div>
          </div>
          <div class="px-4 py-3 border-t border-[#2e374d] bg-[#1a1e2d] flex justify-end space-x-2">
            <button @click="showAddRule = false" class="px-3 py-1.5 text-xs text-slate-300 hover:bg-[#202638] rounded transition">Batal</button>
            <button @click="submitAddRule" :disabled="!newRule.port || isActionLoading" class="px-4 py-1.5 bg-teal-600 hover:bg-teal-500 text-white text-xs font-semibold rounded transition flex items-center space-x-1 disabled:opacity-50">
              <Icon v-if="isActionLoading" icon="lucide:loader-2" class="w-3.5 h-3.5 animate-spin" />
              <span>Simpan Rule</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue';
import { Icon } from '@iconify/vue';
import { tauriBridge } from '../services/tauriBridge';
import { useDialogStore } from '../stores/dialogStore';
import { parseListeningPorts, parseUfwStatus, buildUfwCommand, buildSsCommand, type ListeningPortItem, type FirewallStatus } from '../utils/firewallParser.js';

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

const activeTab = ref<'ports' | 'rules'>('ports');
const isLoading = ref(false);
const isActionLoading = ref(false);
const isAutoRefresh = ref(false);
const useSudo = ref(props.initialUseSudo ?? true);
const permissionError = ref<string | null>(null);
const actionMessage = ref<string | null>(null);

const portsSearch = ref('');
const portsProtoFilter = ref<'ALL' | 'TCP' | 'UDP'>('ALL');
const ports = ref<ListeningPortItem[]>([]);
const firewall = ref<FirewallStatus>({ active: false, type: 'none', rawOutput: '', rules: [] });

const showAddRule = ref(false);
const newRule = ref({
  port: '',
  protocol: '',
  action: 'allow',
  from: ''
});

let pollingTimer: any = null;

const filteredPorts = computed(() => {
  let list = ports.value;
  if (portsProtoFilter.value !== 'ALL') {
    list = list.filter(p => p.protocol.toUpperCase().includes(portsProtoFilter.value));
  }
  if (portsSearch.value.trim()) {
    const q = portsSearch.value.toLowerCase();
    list = list.filter(p => 
      p.localPort?.toString().includes(q) || 
      p.processName.toLowerCase().includes(q) ||
      p.localAddress.toLowerCase().includes(q)
    );
  }
  return list;
});

function setFlashMessage(msg: string) {
  actionMessage.value = msg;
  setTimeout(() => {
    if (actionMessage.value === msg) actionMessage.value = null;
  }, 3000);
}

async function fetchData() {
  if (!props.sessionId || !props.isOpen) return;
  isLoading.value = true;
  permissionError.value = null;

  try {
    const ssCmd = buildSsCommand(useSudo.value);
    const ufwCmd = buildUfwCommand('status', 'numbered', useSudo.value);

    // Run both commands. If one fails (e.g. UFW not installed), catch it individually.
    const [ssOut, ufwOut] = await Promise.all([
      tauriBridge.sshExecCommand(props.sessionId, ssCmd).catch((e: any) => {
        if (e?.message?.toLowerCase().includes('permission denied')) throw e;
        return '';
      }),
      tauriBridge.sshExecCommand(props.sessionId, ufwCmd).catch((e: any) => {
        if (e?.message?.toLowerCase().includes('permission denied')) throw e;
        return '';
      })
    ]);

    ports.value = parseListeningPorts(ssOut);
    firewall.value = parseUfwStatus(ufwOut);

  } catch (err: any) {
    const msg = err.message || err;
    if (msg.toLowerCase().includes('permission denied') || msg.toLowerCase().includes('interactive authentication required')) {
      permissionError.value = 'Akses ditolak. Aktifkan Sudo Mode untuk melihat PID proses dan aturan firewall UFW.';
    } else {
      permissionError.value = `Gagal memuat data: ${msg}`;
    }
  } finally {
    isLoading.value = false;
  }
}

async function execUfwAction(cmdAction: 'enable' | 'disable' | 'reload') {
  isActionLoading.value = true;
  try {
    const cmd = buildUfwCommand(cmdAction, '', useSudo.value);
    // Add force for enable/disable to avoid prompts
    const finalCmd = cmdAction === 'enable' ? `${cmd} --force` : cmd;
    await tauriBridge.sshExecCommand(props.sessionId, finalCmd);
    setFlashMessage(`UFW berhasil di-${cmdAction}`);
    await fetchData();
  } catch (err: any) {
    dialogStore.showToast(`Gagal ${cmdAction} UFW: ${err.message || err}`, 'error');
  } finally {
    isActionLoading.value = false;
  }
}

async function toggleUfw() {
  const next = firewall.value.active ? 'disable' : 'enable';
  const ok = await dialogStore.confirm({
    title: `${next === 'enable' ? 'Aktifkan' : 'Nonaktifkan'} UFW`,
    description: `Apakah Anda yakin ingin men-${next} UFW firewall?`,
    confirmText: 'Ya, Lanjutkan',
    isDestructive: next === 'disable'
  });
  if (!ok) return;
  await execUfwAction(next);
}

async function reloadUfw() {
  await execUfwAction('reload');
}

async function deleteRule(index: number) {
  const ok = await dialogStore.confirm({
    title: 'Hapus Aturan (Rule)',
    description: `Apakah Anda yakin ingin menghapus rule ID [${index}]?`,
    confirmText: 'Hapus',
    isDestructive: true
  });
  if (!ok) return;

  isActionLoading.value = true;
  try {
    const cmd = buildUfwCommand('delete', index.toString(), useSudo.value);
    await tauriBridge.sshExecCommand(props.sessionId, `${cmd} --force`);
    setFlashMessage(`Rule [${index}] berhasil dihapus`);
    await fetchData();
  } catch (err: any) {
    dialogStore.showToast(`Gagal hapus rule: ${err.message || err}`, 'error');
  } finally {
    isActionLoading.value = false;
  }
}

async function submitAddRule() {
  if (!newRule.value.port) return;
  isActionLoading.value = true;
  try {
    // Build rule string: allow|deny|reject [from <ip>] to any port <port> [proto <proto>]
    let ruleStr = `${newRule.value.action}`;
    if (newRule.value.from && newRule.value.from.trim() !== '') {
      ruleStr += ` from ${newRule.value.from.trim()}`;
    }
    
    // Add port and protocol
    if (newRule.value.port.includes('/')) {
      ruleStr += ` to any port ${newRule.value.port}`; // user typed 80/tcp manually
    } else {
      ruleStr += ` to any port ${newRule.value.port}`;
      if (newRule.value.protocol) {
        ruleStr += ` proto ${newRule.value.protocol}`;
      }
    }

    const base = useSudo.value ? 'sudo ufw' : 'ufw';
    await tauriBridge.sshExecCommand(props.sessionId, `${base} ${ruleStr}`);
    
    setFlashMessage('Aturan berhasil ditambahkan');
    showAddRule.value = false;
    newRule.value = { port: '', protocol: '', action: 'allow', from: '' };
    await fetchData();
  } catch (err: any) {
    dialogStore.showToast(`Gagal menambah aturan: ${err.message || err}`, 'error');
  } finally {
    isActionLoading.value = false;
  }
}

function openQuickAllow(p: ListeningPortItem) {
  newRule.value = {
    port: p.localPort?.toString() || '',
    protocol: p.protocol.replace('6', '').toLowerCase() || '',
    action: 'allow',
    from: ''
  };
  activeTab.value = 'rules';
  showAddRule.value = true;
}

function copyText(text: string) {
  navigator.clipboard.writeText(text);
  dialogStore.showToast(`Copied: ${text}`, 'success');
}

function close() {
  emit('close');
}

watch(isAutoRefresh, (val) => {
  if (val) {
    pollingTimer = setInterval(() => {
      fetchData();
    }, 5000);
  } else {
    if (pollingTimer) {
      clearInterval(pollingTimer);
      pollingTimer = null;
    }
  }
});

watch(() => props.isOpen, (val) => {
  if (val) fetchData();
});

onMounted(() => {
  if (props.isOpen) fetchData();
});

onUnmounted(() => {
  if (pollingTimer) clearInterval(pollingTimer);
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
