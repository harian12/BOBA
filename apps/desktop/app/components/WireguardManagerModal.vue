<template>
  <div
    v-if="isOpen"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-2 sm:p-4 animate-fade-in"
    @click.self="$emit('close')"
  >
    <div
      class="bg-[#12151e] border border-[#262c3d] rounded-xl shadow-2xl w-full max-w-4xl flex flex-col max-h-[92vh] overflow-hidden text-slate-200 select-none"
    >
      <!-- Modal Header -->
      <header
        class="h-14 bg-[#141824] border-b border-[#262c3d] flex items-center justify-between px-4 sm:px-5 shrink-0"
      >
        <div class="flex items-center space-x-3">
          <div class="p-1.5 rounded-lg bg-blue-950/60 border border-blue-600/40 text-blue-400">
            <Icon icon="lucide:shield-check" class="w-5 h-5" />
          </div>
          <div>
            <div class="flex items-center space-x-2">
              <h2 class="text-sm font-bold text-slate-100">WireGuard VPN Manager</h2>
              <!-- Status Badge -->
              <span
                v-if="!serverStatus.isInstalled"
                class="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-rose-950/70 text-rose-300 border border-rose-700/50"
              >
                Belum Terpasang
              </span>
              <span
                v-else-if="serverStatus.isActive"
                class="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-950/70 text-emerald-300 border border-emerald-700/50 flex items-center space-x-1"
              >
                <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                <span>Aktif ({{ serverStatus.interfaceName }})</span>
              </span>
              <span
                v-else
                class="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-950/70 text-amber-300 border border-amber-700/50"
              >
                Berhenti
              </span>
            </div>
            <p class="text-[11px] text-slate-400 font-mono">
              {{ hostTitle }}
            </p>
          </div>
        </div>

        <div class="flex items-center space-x-2">
          <!-- Sudo Controls -->
          <div class="hidden sm:flex items-center space-x-2 bg-[#0d1017] border border-[#262c3d] rounded-lg px-2.5 py-1 text-xs">
            <label class="flex items-center space-x-1.5 text-slate-300 cursor-pointer">
              <input type="checkbox" v-model="useSudo" class="rounded bg-slate-800 border-slate-700 text-blue-500" />
              <span>sudo</span>
            </label>
            <input
              v-if="useSudo"
              v-model="sudoPassword"
              type="password"
              placeholder="Pass sudo (opsional)"
              class="w-32 bg-transparent text-slate-200 border-none focus:outline-none text-[11px] placeholder:text-slate-500"
            />
          </div>

          <!-- Refresh Button -->
          <button
            @click="refreshStatus"
            :disabled="isLoading"
            class="px-2.5 py-1.5 bg-[#1e2333] hover:bg-[#282f45] border border-[#2e374d] text-slate-300 rounded-lg text-xs transition flex items-center space-x-1.5 disabled:opacity-50 cursor-pointer"
            title="Segarkan data"
          >
            <Icon icon="lucide:refresh-cw" :class="['w-3.5 h-3.5', isLoading ? 'animate-spin text-blue-400' : '']" />
            <span class="hidden sm:inline">Refresh</span>
          </button>

          <!-- Close Button -->
          <button
            @click="$emit('close')"
            class="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition"
            title="Tutup (Esc)"
          >
            <Icon icon="lucide:x" class="w-4 h-4" />
          </button>
        </div>
      </header>

      <!-- Modal Body -->
      <div class="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
        <!-- Notification / Alert Banner -->
        <div
          v-if="alertMessage"
          :class="[
            'px-3.5 py-2.5 rounded-lg border text-xs flex items-center justify-between',
            alertMessage.type === 'error' ? 'bg-rose-950/50 border-rose-600/40 text-rose-300' : 'bg-emerald-950/50 border-emerald-600/40 text-emerald-300'
          ]"
        >
          <div class="flex items-center space-x-2">
            <Icon :icon="alertMessage.type === 'error' ? 'lucide:alert-circle' : 'lucide:check-circle'" class="w-4 h-4 shrink-0" />
            <span>{{ alertMessage.text }}</span>
          </div>
          <button @click="alertMessage = null" class="text-slate-400 hover:text-white">✕</button>
        </div>

        <!-- 1. State: WireGuard Belum Terpasang -->
        <div v-if="!serverStatus.isInstalled" class="bg-[#141824] border border-[#262c3d] rounded-xl p-5 space-y-4">
          <div class="flex items-start space-x-3.5">
            <div class="p-2.5 rounded-xl bg-blue-950/60 border border-blue-600/40 text-blue-400 shrink-0">
              <Icon icon="lucide:shield-alert" class="w-6 h-6" />
            </div>
            <div>
              <h3 class="text-sm font-bold text-slate-100">Setup & Instalasi WireGuard</h3>
              <p class="text-xs text-slate-400 mt-1">
                WireGuard belum terpasang atau belum dikonfigurasi di server ini. Boba dapat menginstalnya secara otomatis (paket kernel, IP forwarding, firewall NAT, dan service <code class="text-blue-400 font-mono">wg-quick@wg0</code>).
              </p>
            </div>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-2 text-xs">
            <div>
              <label class="block text-slate-300 font-medium mb-1.5">Alamat IP Server (Gateway Subnet)</label>
              <input
                v-model="installForm.serverAddress"
                type="text"
                class="w-full px-3 py-2 bg-[#0d1017] border border-[#2d354b] rounded-lg text-slate-200 font-mono focus:border-blue-500 focus:outline-none"
                placeholder="10.99.0.1/24"
              />
              <p class="text-[10px] text-slate-500 mt-1">Default subnet VPN lokal: 10.99.0.1/24</p>
            </div>

            <div>
              <label class="block text-slate-300 font-medium mb-1.5">Port Dengar WireGuard (UDP)</label>
              <input
                v-model.number="installForm.listenPort"
                type="number"
                class="w-full px-3 py-2 bg-[#0d1017] border border-[#2d354b] rounded-lg text-slate-200 font-mono focus:border-blue-500 focus:outline-none"
                placeholder="51820"
              />
              <p class="text-[10px] text-slate-500 mt-1">Port standar UDP: 51820</p>
            </div>

            <div>
              <label class="block text-slate-300 font-medium mb-1.5">IP Publik / Domain Server (Endpoint)</label>
              <input
                v-model="installForm.publicIpOrDomain"
                type="text"
                class="w-full px-3 py-2 bg-[#0d1017] border border-[#2d354b] rounded-lg text-slate-200 font-mono focus:border-blue-500 focus:outline-none"
                placeholder="103.150.227.17"
              />
              <p class="text-[10px] text-slate-500 mt-1">Alamat publik agar client laptop/HP dapat terhubung</p>
            </div>

            <div>
              <label class="block text-slate-300 font-medium mb-1.5">DNS Server untuk Client</label>
              <input
                v-model="installForm.dns"
                type="text"
                class="w-full px-3 py-2 bg-[#0d1017] border border-[#2d354b] rounded-lg text-slate-200 font-mono focus:border-blue-500 focus:outline-none"
                placeholder="1.1.1.1, 8.8.8.8"
              />
              <p class="text-[10px] text-slate-500 mt-1">DNS resolver (Cloudflare / Google)</p>
            </div>
          </div>

          <div class="pt-2 flex items-center justify-between">
            <span class="text-[11px] text-slate-400">
              * Memerlukan hak akses <span class="text-amber-400 font-mono">sudo</span> atau akun root.
            </span>
            <button
              @click="installWireguard"
              :disabled="isInstalling"
              class="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold transition flex items-center space-x-2 disabled:opacity-50 cursor-pointer shadow-lg shadow-blue-600/20"
            >
              <Icon :icon="isInstalling ? 'lucide:refresh-cw' : 'lucide:download-cloud'" :class="['w-4 h-4', isInstalling ? 'animate-spin' : '']" />
              <span>{{ isInstalling ? 'Sedang Menginstal...' : 'Pasang & Aktifkan WireGuard' }}</span>
            </button>
          </div>

          <!-- Installation Log Output -->
          <div v-if="installLogs" class="mt-3">
            <div class="flex items-center justify-between mb-1 text-[11px] text-slate-400">
              <span>Log Instalasi:</span>
              <button @click="installLogs = ''" class="hover:text-slate-200">Bersihkan</button>
            </div>
            <pre class="p-3 bg-[#090b10] border border-[#262c3d] rounded-lg text-[10px] font-mono text-slate-300 overflow-x-auto max-h-48 leading-relaxed whitespace-pre-wrap">{{ installLogs }}</pre>
          </div>
        </div>

        <!-- 2. State: WireGuard Sudah Terpasang -->
        <template v-else>
          <!-- Server Overview Card -->
          <div class="bg-[#141824] border border-[#262c3d] rounded-xl p-4 text-xs space-y-3">
            <div class="flex flex-wrap items-center justify-between gap-2 border-b border-[#262c3d] pb-3">
              <div class="flex items-center space-x-4">
                <div>
                  <span class="text-slate-500 block text-[10px]">Endpoint Server</span>
                  <span class="font-mono text-slate-200 font-semibold">{{ currentEndpoint }}</span>
                </div>
                <div>
                  <span class="text-slate-500 block text-[10px]">Subnet Server</span>
                  <span class="font-mono text-slate-200 font-semibold">{{ serverStatus.serverAddress }}</span>
                </div>
                <div>
                  <span class="text-slate-500 block text-[10px]">Port UDP</span>
                  <span class="font-mono text-slate-200 font-semibold">{{ serverStatus.listenPort }}</span>
                </div>
              </div>

              <!-- Service Controls -->
              <div class="flex items-center space-x-2">
                <button
                  v-if="serverStatus.isActive"
                  @click="toggleService('stop')"
                  :disabled="isActionLoading"
                  class="px-2.5 py-1 bg-amber-950/40 hover:bg-amber-900/60 text-amber-300 border border-amber-600/40 rounded text-xs transition flex items-center space-x-1 cursor-pointer disabled:opacity-50"
                  title="Hentikan service WireGuard"
                >
                  <Icon icon="lucide:square" class="w-3 h-3 text-amber-400" />
                  <span>Stop</span>
                </button>
                <button
                  v-else
                  @click="toggleService('start')"
                  :disabled="isActionLoading"
                  class="px-2.5 py-1 bg-emerald-950/40 hover:bg-emerald-900/60 text-emerald-300 border border-emerald-600/40 rounded text-xs transition flex items-center space-x-1 cursor-pointer disabled:opacity-50"
                  title="Jalankan service WireGuard"
                >
                  <Icon icon="lucide:play" class="w-3 h-3 text-emerald-400" />
                  <span>Start</span>
                </button>
                <button
                  @click="toggleService('restart')"
                  :disabled="isActionLoading"
                  class="px-2.5 py-1 bg-[#1e2333] hover:bg-[#282f45] border border-[#2e374d] text-slate-300 rounded text-xs transition flex items-center space-x-1 cursor-pointer disabled:opacity-50"
                  title="Muat ulang service WireGuard"
                >
                  <Icon icon="lucide:rotate-cw" class="w-3 h-3 text-blue-400" />
                  <span>Restart</span>
                </button>
                <button
                  @click="openLogsModal"
                  :disabled="isLoadingLogs"
                  class="px-2.5 py-1 bg-[#1e2333] hover:bg-[#282f45] border border-[#2e374d] text-cyan-300 rounded text-xs transition flex items-center space-x-1 cursor-pointer disabled:opacity-50"
                  title="Lihat log service WireGuard (journalctl, dmesg, wg show)"
                >
                  <Icon icon="lucide:file-text" class="w-3 h-3 text-cyan-400" />
                  <span>Log Service</span>
                </button>
                <button
                  @click="uninstallWireguard"
                  :disabled="isActionLoading"
                  class="px-2 py-1 bg-rose-950/30 hover:bg-rose-900/50 text-rose-400 border border-rose-800/40 rounded text-xs transition cursor-pointer"
                  title="Hapus konfigurasi WireGuard dari server"
                >
                  <Icon icon="lucide:trash-2" class="w-3 h-3" />
                </button>
              </div>
            </div>

            <!-- Server Public Key -->
            <div class="flex items-center justify-between bg-[#0d1017] px-3 py-2 rounded-lg border border-[#262c3d]">
              <div class="flex items-center space-x-2 truncate">
                <Icon icon="lucide:key" class="w-3.5 h-3.5 text-blue-400 shrink-0" />
                <span class="text-slate-400 text-[11px] shrink-0">Server Public Key:</span>
                <span class="font-mono text-slate-200 text-[11px] truncate select-all">
                  {{ serverStatus.serverPublicKey || 'Belum terbaca (wg show)' }}
                </span>
              </div>
              <button
                v-if="serverStatus.serverPublicKey"
                @click="copyText(serverStatus.serverPublicKey, 'Server Public Key disalin')"
                class="text-[11px] text-blue-400 hover:text-blue-300 transition flex items-center space-x-1 shrink-0 ml-2"
              >
                <Icon icon="lucide:copy" class="w-3 h-3" />
                <span>Salin</span>
              </button>
            </div>
          </div>

          <!-- Registered Users (Peers) Section -->
          <div class="space-y-3">
            <div class="flex flex-wrap items-center justify-between gap-2">
              <div class="flex items-center space-x-2">
                <Icon icon="lucide:users" class="w-4 h-4 text-blue-400" />
                <h3 class="text-sm font-bold text-slate-100">Daftar User / Peer Terdaftar</h3>
                <span class="px-2 py-0.2 rounded-full text-[10px] font-mono bg-blue-950/60 text-blue-300 border border-blue-600/40">
                  {{ serverStatus.peers.length }} user
                </span>
              </div>

              <div class="flex items-center space-x-2">
                <!-- Search Filter -->
                <div class="relative">
                  <Icon icon="lucide:search" class="w-3 h-3 text-slate-500 absolute left-2.5 top-2.5" />
                  <input
                    v-model="searchFilter"
                    type="text"
                    placeholder="Cari user atau IP..."
                    class="pl-7 pr-3 py-1 bg-[#141824] border border-[#262c3d] rounded-lg text-slate-200 text-xs w-44 focus:border-blue-500 focus:outline-none"
                  />
                </div>

                <!-- Tambah User Button -->
                <button
                  @click="openAddUserModal"
                  class="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-semibold transition flex items-center space-x-1.5 cursor-pointer shadow-md shadow-blue-600/20"
                >
                  <Icon icon="lucide:user-plus" class="w-3.5 h-3.5" />
                  <span>Tambah User Baru</span>
                </button>
              </div>
            </div>

            <!-- Empty Peers State -->
            <div
              v-if="filteredPeers.length === 0"
              class="bg-[#141824] border border-[#262c3d] border-dashed rounded-xl p-8 text-center space-y-3"
            >
              <div class="w-10 h-10 mx-auto rounded-full bg-slate-800 flex items-center justify-center text-slate-400">
                <Icon icon="lucide:users" class="w-5 h-5" />
              </div>
              <div>
                <p class="text-xs font-semibold text-slate-200">
                  {{ searchFilter ? 'Tidak ada user yang cocok dengan pencarian' : 'Belum Ada User Terdaftar' }}
                </p>
                <p class="text-[11px] text-slate-400 mt-1 max-w-md mx-auto">
                  {{ searchFilter ? 'Coba gunakan kata kunci pencarian yang lain.' : 'Tambahkan user/client pertama Anda untuk mulai menghubungkan perangkat ke VPN WireGuard ini.' }}
                </p>
              </div>
              <button
                v-if="!searchFilter"
                @click="openAddUserModal"
                class="inline-flex items-center space-x-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-medium transition cursor-pointer"
              >
                <Icon icon="lucide:user-plus" class="w-3.5 h-3.5" />
                <span>Tambah User Pertama</span>
              </button>
            </div>

            <!-- Users List Table / Cards -->
            <div v-else class="space-y-2">
              <div
                v-for="peer in filteredPeers"
                :key="peer.publicKey"
                class="bg-[#141824] hover:bg-[#181d2c] border border-[#262c3d] rounded-xl p-3.5 transition flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
              >
                <div class="flex items-center space-x-3 min-w-0">
                  <!-- Connection Status Dot -->
                  <div
                    :class="[
                      'w-2.5 h-2.5 rounded-full shrink-0',
                      peer.isActive ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.8)]' : 'bg-slate-600'
                    ]"
                    :title="peer.isActive ? 'Online / Aktif baru-baru ini' : 'Offline / Idle'"
                  ></div>

                  <div class="min-w-0">
                    <div class="flex items-center space-x-2">
                      <span class="font-bold text-slate-100 text-sm truncate">{{ peer.name }}</span>
                      <span class="px-2 py-0.5 rounded bg-blue-950/70 border border-blue-600/30 text-blue-300 font-mono text-[10px]">
                        {{ peer.allowedIps || 'IP belum diset' }}
                      </span>
                    </div>

                    <div class="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-[11px] text-slate-400">
                      <!-- Public Key -->
                      <span class="font-mono text-slate-500 truncate" :title="peer.publicKey">
                        Key: {{ peer.publicKey.substring(0, 10) }}...{{ peer.publicKey.substring(peer.publicKey.length - 6) }}
                      </span>
                      <!-- Handshake -->
                      <span v-if="peer.latestHandshake" class="flex items-center space-x-1 text-slate-400">
                        <Icon icon="lucide:activity" class="w-3 h-3 text-slate-500" />
                        <span>{{ peer.latestHandshake }}</span>
                      </span>
                      <span v-else class="text-slate-500">Belum pernah konek</span>

                      <!-- Data Transfer -->
                      <span v-if="peer.transferRx || peer.transferTx" class="flex items-center space-x-1 text-slate-400 font-mono text-[10px]">
                        <Icon icon="lucide:arrow-down-up" class="w-3 h-3 text-teal-400" />
                        <span>↓ {{ peer.transferRx || '0 B' }} / ↑ {{ peer.transferTx || '0 B' }}</span>
                      </span>
                    </div>
                  </div>
                </div>

                <!-- Peer Action Buttons -->
                <div class="flex items-center space-x-2 shrink-0 self-end sm:self-center">
                  <button
                    @click="openPeerLogsModal(peer)"
                    class="px-2.5 py-1 bg-[#1e2333] hover:bg-[#282f45] border border-[#2e374d] text-cyan-300 rounded text-xs transition flex items-center space-x-1 cursor-pointer"
                    title="Lihat riwayat handshake, endpoint, dan log aktivitas user ini"
                  >
                    <Icon icon="lucide:activity" class="w-3 h-3 text-cyan-400" />
                    <span>Log User</span>
                  </button>

                  <button
                    @click="viewPeerConfig(peer)"
                    class="px-2.5 py-1 bg-[#1e2333] hover:bg-[#282f45] border border-[#2e374d] text-slate-300 rounded text-xs transition flex items-center space-x-1 cursor-pointer"
                    title="Lihat atau salin file konfigurasi .conf"
                  >
                    <Icon icon="lucide:file-code" class="w-3 h-3 text-blue-400" />
                    <span>Lihat Config</span>
                  </button>

                  <button
                    @click="downloadPeerConfig(peer)"
                    class="px-2.5 py-1 bg-[#1e2333] hover:bg-[#282f45] border border-[#2e374d] text-slate-300 rounded text-xs transition flex items-center space-x-1 cursor-pointer"
                    title="Download file .conf ke komputer"
                  >
                    <Icon icon="lucide:download" class="w-3 h-3 text-emerald-400" />
                    <span>Download</span>
                  </button>

                  <button
                    @click="confirmDeletePeer(peer)"
                    class="p-1.5 bg-rose-950/30 hover:bg-rose-900/50 text-rose-400 border border-rose-800/40 rounded transition cursor-pointer"
                    title="Hapus user ini"
                  >
                    <Icon icon="lucide:trash-2" class="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </template>
      </div>

      <!-- Footer Info -->
      <footer class="h-10 bg-[#0f121a] border-t border-[#262c3d] px-4 sm:px-5 flex items-center justify-between text-[11px] text-slate-500 shrink-0">
        <div class="flex items-center space-x-2">
          <span>WireGuard L3 Kernel Protocol</span>
          <span>·</span>
          <span>Port 51820 UDP</span>
        </div>
        <div class="flex items-center space-x-2">
          <button @click="refreshStatus" class="hover:text-slate-300">Segarkan Ulang</button>
        </div>
      </footer>
    </div>

    <!-- Sub-Modal: Tambah User Baru -->
    <div
      v-if="isAddUserModalOpen"
      class="fixed inset-0 z-60 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in"
      @click.self="isAddUserModalOpen = false"
    >
      <div class="bg-[#141824] border border-[#262c3d] rounded-xl shadow-2xl w-full max-w-md p-5 text-slate-200 text-xs space-y-4">
        <div class="flex items-center justify-between border-b border-[#262c3d] pb-3">
          <div class="flex items-center space-x-2">
            <Icon icon="lucide:user-plus" class="w-4 h-4 text-blue-400" />
            <h3 class="text-sm font-bold text-slate-100">Tambah User / Client Baru</h3>
          </div>
          <button @click="isAddUserModalOpen = false" class="text-slate-400 hover:text-white">✕</button>
        </div>

        <div class="space-y-3.5">
          <div>
            <label class="block text-slate-300 font-medium mb-1">Nama Perangkat / User</label>
            <input
              v-model="newUserForm.name"
              type="text"
              placeholder="Contoh: laptop-kerja, iphone-budi"
              class="w-full px-3 py-2 bg-[#0d1017] border border-[#2d354b] rounded-lg text-slate-200 focus:border-blue-500 focus:outline-none"
              autofocus
            />
          </div>

          <div>
            <label class="block text-slate-300 font-medium mb-1">IP Client (VPN Subnet)</label>
            <input
              v-model="newUserForm.clientIp"
              type="text"
              class="w-full px-3 py-2 bg-[#0d1017] border border-[#2d354b] rounded-lg text-slate-200 font-mono focus:border-blue-500 focus:outline-none"
              placeholder="10.99.0.2/32"
            />
            <p class="text-[10px] text-slate-500 mt-1">Otomatis dipilih dari IP berikutnya yang tersedia</p>
          </div>

          <div>
            <label class="block text-slate-300 font-medium mb-1">Mode Rute (Routing / AllowedIPs)</label>
            <select
              v-model="newUserForm.allowedIpsRouting"
              class="w-full px-3 py-2 bg-[#0d1017] border border-[#2d354b] rounded-lg text-slate-200 focus:border-blue-500 focus:outline-none"
            >
              <option value="split">Akses Jaringan Server Saja (10.99.0.0/24 - Split Tunnel)</option>
              <option value="full">Seluruh Trafik Internet (0.0.0.0/0 - Full Tunnel VPN)</option>
            </select>
          </div>

          <div>
            <label class="block text-slate-300 font-medium mb-1">DNS Server</label>
            <input
              v-model="newUserForm.dns"
              type="text"
              class="w-full px-3 py-2 bg-[#0d1017] border border-[#2d354b] rounded-lg text-slate-200 font-mono focus:border-blue-500 focus:outline-none"
              placeholder="1.1.1.1, 8.8.8.8"
            />
          </div>
        </div>

        <div class="flex items-center justify-end space-x-2 pt-2 border-t border-[#262c3d]">
          <button
            @click="isAddUserModalOpen = false"
            class="px-3 py-1.5 bg-[#1e2333] hover:bg-[#282f45] border border-[#2e374d] text-slate-300 rounded-lg transition cursor-pointer"
          >
            Batal
          </button>
          <button
            @click="submitAddUser"
            :disabled="isSubmittingUser"
            class="px-4 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-semibold transition flex items-center space-x-1.5 disabled:opacity-50 cursor-pointer shadow-md shadow-blue-600/20"
          >
            <Icon :icon="isSubmittingUser ? 'lucide:refresh-cw' : 'lucide:check'" :class="['w-3.5 h-3.5', isSubmittingUser ? 'animate-spin' : '']" />
            <span>{{ isSubmittingUser ? 'Mendaftarkan...' : 'Daftarkan User' }}</span>
          </button>
        </div>
      </div>
    </div>

    <!-- Sub-Modal: Config Viewer / Download Client Config -->
    <div
      v-if="isConfigModalOpen"
      class="fixed inset-0 z-60 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in"
      @click.self="isConfigModalOpen = false"
    >
      <div class="bg-[#141824] border border-[#262c3d] rounded-xl shadow-2xl w-full max-w-lg p-5 text-slate-200 text-xs space-y-4">
        <div class="flex items-center justify-between border-b border-[#262c3d] pb-3">
          <div class="flex items-center space-x-2">
            <Icon icon="lucide:file-text" class="w-4 h-4 text-emerald-400" />
            <h3 class="text-sm font-bold text-slate-100">Konfigurasi WireGuard: {{ activeConfigTitle }}</h3>
          </div>
          <button @click="isConfigModalOpen = false" class="text-slate-400 hover:text-white">✕</button>
        </div>

        <p class="text-[11px] text-slate-400">
          Import file konfigurasi ini ke aplikasi WireGuard di Windows, macOS, Android, atau iOS untuk terhubung ke VPN.
        </p>

        <!-- Monospace Config Display -->
        <pre class="p-3 bg-[#090b10] border border-[#262c3d] rounded-lg text-[11px] font-mono text-emerald-300 overflow-x-auto max-h-60 leading-relaxed whitespace-pre select-all">{{ activeConfigContent }}</pre>

        <div class="flex items-center justify-between pt-2 border-t border-[#262c3d]">
          <button
            @click="copyText(activeConfigContent, 'Konfigurasi berhasil disalin ke clipboard')"
            class="px-3 py-1.5 bg-[#1e2333] hover:bg-[#282f45] border border-[#2e374d] text-slate-200 rounded-lg transition flex items-center space-x-1.5 cursor-pointer"
          >
            <Icon icon="lucide:copy" class="w-3.5 h-3.5 text-blue-400" />
            <span>Salin Konfigurasi</span>
          </button>

          <div class="flex items-center space-x-2">
            <button
              @click="downloadActiveConfig"
              class="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg font-semibold transition flex items-center space-x-1.5 cursor-pointer shadow-md shadow-emerald-600/20"
            >
              <Icon icon="lucide:download" class="w-3.5 h-3.5" />
              <span>Download .conf</span>
            </button>
            <button
              @click="isConfigModalOpen = false"
              class="px-3 py-1.5 bg-[#1e2333] hover:bg-[#282f45] text-slate-300 rounded-lg transition cursor-pointer"
            >
              Tutup
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- Sub-Modal: Log Viewer (journalctl, dmesg, wg show) -->
    <div
      v-if="isLogsModalOpen"
      class="fixed inset-0 z-60 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in"
      @click.self="isLogsModalOpen = false"
    >
      <div class="bg-[#141824] border border-[#262c3d] rounded-xl shadow-2xl w-full max-w-3xl flex flex-col max-h-[85vh] p-5 text-slate-200 text-xs space-y-3">
        <div class="flex items-center justify-between border-b border-[#262c3d] pb-3 shrink-0">
          <div class="flex items-center space-x-2">
            <Icon icon="lucide:terminal" class="w-4 h-4 text-cyan-400" />
            <h3 class="text-sm font-bold text-slate-100">Log Service WireGuard (wg-quick@wg0)</h3>
            <span
              v-if="isServiceStreaming"
              class="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-950/80 text-emerald-300 border border-emerald-500 flex items-center space-x-1"
            >
              <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
              <span>LIVE</span>
            </span>
          </div>
          <div class="flex items-center space-x-2">
            <!-- Live Stream Toggle -->
            <button
              @click="toggleServiceLiveStream"
              :class="[
                'px-2.5 py-1 rounded text-[11px] font-semibold transition flex items-center space-x-1.5 cursor-pointer',
                isServiceStreaming
                  ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.3)]'
                  : 'bg-[#1e2333] hover:bg-[#282f45] border border-[#2e374d] text-cyan-300'
              ]"
              :title="isServiceStreaming ? 'Klik untuk menghentikan live stream' : 'Mulai streaming log secara live realtime'"
            >
              <Icon :icon="isServiceStreaming ? 'lucide:radio' : 'lucide:play'" :class="['w-3.5 h-3.5', isServiceStreaming ? 'text-emerald-400 animate-pulse' : '']" />
              <span>{{ isServiceStreaming ? 'Stop Stream' : 'Live Stream' }}</span>
            </button>

            <!-- Buka di Terminal Tab -->
            <button
              @click="openServiceLogTerminal"
              class="px-2 py-1 bg-[#1e2333] hover:bg-[#282f45] border border-[#2e374d] rounded text-[11px] text-slate-300 transition flex items-center space-x-1 cursor-pointer"
              title="Buka live tail di terminal utama (journalctl -fu)"
            >
              <Icon icon="lucide:external-link" class="w-3 h-3 text-slate-400" />
              <span class="hidden sm:inline">Terminal</span>
            </button>

            <select
              v-if="!isServiceStreaming"
              v-model="logsLines"
              @change="fetchLogs"
              class="px-2 py-0.5 bg-[#0d1017] border border-[#2d354b] rounded text-slate-300 text-[11px] focus:outline-none"
            >
              <option :value="50">50 baris</option>
              <option :value="100">100 baris</option>
              <option :value="250">250 baris</option>
            </select>
            <button
              v-if="!isServiceStreaming"
              @click="fetchLogs"
              :disabled="isLoadingLogs"
              class="px-2 py-1 bg-[#1e2333] hover:bg-[#282f45] border border-[#2e374d] rounded text-[11px] flex items-center space-x-1 disabled:opacity-50 cursor-pointer"
              title="Refresh snapshot log"
            >
              <Icon icon="lucide:refresh-cw" :class="['w-3 h-3', isLoadingLogs ? 'animate-spin text-cyan-400' : '']" />
              <span>Refresh</span>
            </button>
            <button @click="closeLogsModal" class="text-slate-400 hover:text-white p-1">✕</button>
          </div>
        </div>

        <!-- Log Output Terminal Box -->
        <pre ref="serviceLogBoxRef" class="flex-1 p-3.5 bg-[#090b10] border border-[#262c3d] rounded-lg text-[11px] font-mono text-cyan-300/90 overflow-y-auto max-h-[60vh] leading-relaxed whitespace-pre select-all">{{ logsOutput || 'Belum ada log atau sedang memuat...' }}</pre>

        <div class="flex items-center justify-between pt-2 border-t border-[#262c3d] shrink-0">
          <button
            @click="copyText(logsOutput, 'Log berhasil disalin ke clipboard')"
            class="px-3 py-1.5 bg-[#1e2333] hover:bg-[#282f45] border border-[#2e374d] text-slate-200 rounded-lg transition flex items-center space-x-1.5 cursor-pointer"
          >
            <Icon icon="lucide:copy" class="w-3.5 h-3.5 text-blue-400" />
            <span>Salin Log</span>
          </button>
          <button
            @click="isLogsModalOpen = false"
            class="px-3.5 py-1.5 bg-[#1e2333] hover:bg-[#282f45] text-slate-300 rounded-lg transition cursor-pointer"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>

    <!-- Sub-Modal: Log & Aktivitas Per User -->
    <div
      v-if="isPeerLogsModalOpen && activeLogPeer"
      class="fixed inset-0 z-60 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 animate-fade-in"
      @click.self="isPeerLogsModalOpen = false"
    >
      <div class="bg-[#141824] border border-[#262c3d] rounded-xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[85vh] p-5 text-slate-200 text-xs space-y-3">
        <div class="flex items-center justify-between border-b border-[#262c3d] pb-3 shrink-0">
          <div class="flex items-center space-x-2">
            <Icon icon="lucide:activity" class="w-4 h-4 text-cyan-400" />
            <h3 class="text-sm font-bold text-slate-100">Aktivitas & Log User: {{ activeLogPeer.name }}</h3>
            <span
              v-if="isPeerStreaming"
              class="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-950/80 text-emerald-300 border border-emerald-500 flex items-center space-x-1"
            >
              <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
              <span>LIVE</span>
            </span>
          </div>
          <div class="flex items-center space-x-2">
            <!-- Peer Live Stream Toggle -->
            <button
              @click="togglePeerLiveStream"
              :class="[
                'px-2.5 py-1 rounded text-[11px] font-semibold transition flex items-center space-x-1.5 cursor-pointer',
                isPeerStreaming
                  ? 'bg-emerald-950/80 text-emerald-300 border border-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.3)]'
                  : 'bg-[#1e2333] hover:bg-[#282f45] border border-[#2e374d] text-cyan-300'
              ]"
              :title="isPeerStreaming ? 'Klik untuk stop live stream' : 'Streaming live packet event dari kernel dmesg'"
            >
              <Icon :icon="isPeerStreaming ? 'lucide:radio' : 'lucide:play'" :class="['w-3.5 h-3.5', isPeerStreaming ? 'text-emerald-400 animate-pulse' : '']" />
              <span>{{ isPeerStreaming ? 'Stop Stream' : 'Live Stream' }}</span>
            </button>

            <button
              v-if="!isPeerStreaming"
              @click="fetchPeerLogs(activeLogPeer)"
              :disabled="isLoadingPeerLogs"
              class="px-2.5 py-1 bg-[#1e2333] hover:bg-[#282f45] border border-[#2e374d] rounded text-[11px] flex items-center space-x-1 disabled:opacity-50 cursor-pointer"
            >
              <Icon icon="lucide:refresh-cw" :class="['w-3 h-3', isLoadingPeerLogs ? 'animate-spin text-cyan-400' : '']" />
              <span>Refresh</span>
            </button>
            <button @click="closePeerLogsModal" class="text-slate-400 hover:text-white p-1">✕</button>
          </div>
        </div>

        <!-- Realtime Peer Snapshot Grid -->
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-[#0d1017] p-3 rounded-lg border border-[#262c3d] text-[11px] shrink-0">
          <div>
            <span class="text-slate-500 block text-[10px]">IP VPN</span>
            <span class="font-mono text-blue-300 font-semibold">{{ activeLogPeer.allowedIps }}</span>
          </div>
          <div>
            <span class="text-slate-500 block text-[10px]">Endpoint Asal</span>
            <span class="font-mono text-slate-200 truncate block">{{ activeLogPeer.endpoint || 'Belum konek' }}</span>
          </div>
          <div>
            <span class="text-slate-500 block text-[10px]">Handshake Terakhir</span>
            <span class="text-slate-200 truncate block">{{ activeLogPeer.latestHandshake || 'Belum pernah' }}</span>
          </div>
          <div>
            <span class="text-slate-500 block text-[10px]">Data Transfer</span>
            <span class="font-mono text-teal-300 truncate block">↓ {{ activeLogPeer.transferRx || '0 B' }} / ↑ {{ activeLogPeer.transferTx || '0 B' }}</span>
          </div>
        </div>

        <!-- Dynamic Debug Notice -->
        <div class="flex items-center justify-between bg-blue-950/40 border border-blue-800/40 px-3 py-1.5 rounded-lg text-[11px] shrink-0">
          <span class="text-blue-300">Mau log handshake packet mendalam di kernel dmesg?</span>
          <button
            @click="enableDynamicDebug"
            class="text-blue-400 hover:text-blue-300 underline font-medium cursor-pointer"
          >
            Aktifkan Dynamic Debug
          </button>
        </div>

        <!-- Peer Log Terminal Output -->
        <pre ref="peerLogBoxRef" class="flex-1 p-3.5 bg-[#090b10] border border-[#262c3d] rounded-lg text-[11px] font-mono text-cyan-300/90 overflow-y-auto max-h-[50vh] leading-relaxed whitespace-pre select-all">{{ peerLogsOutput || 'Memuat log aktivitas peer...' }}</pre>

        <div class="flex items-center justify-between pt-2 border-t border-[#262c3d] shrink-0">
          <button
            @click="copyText(peerLogsOutput, 'Log aktivitas user berhasil disalin')"
            class="px-3 py-1.5 bg-[#1e2333] hover:bg-[#282f45] border border-[#2e374d] text-slate-200 rounded-lg transition flex items-center space-x-1.5 cursor-pointer"
          >
            <Icon icon="lucide:copy" class="w-3.5 h-3.5 text-blue-400" />
            <span>Salin Log</span>
          </button>
          <button
            @click="isPeerLogsModalOpen = false"
            class="px-3.5 py-1.5 bg-[#1e2333] hover:bg-[#282f45] text-slate-300 rounded-lg transition cursor-pointer"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onUnmounted, nextTick } from 'vue';
import { Icon } from '@iconify/vue';
import { tauriBridge } from '../services/tauriBridge.js';
import { useDialogStore } from '../stores/dialogStore.js';
import type { SshSessionConfig } from '../types/index.js';
import {
  parseWireguardStatus,
  getNextAvailableIp,
  generateClientConfigFile,
  parseAddPeerOutput,
  buildWireguardStatusCheckCommand,
  buildInstallWireguardScript,
  buildAddPeerCommand,
  buildDeletePeerCommand,
  buildServiceControlCommand,
  buildUninstallWireguardScript,
  buildWireguardLogsCommand,
  buildPeerLogsCommand,
  buildEnableDynamicDebugCommand,
  buildWireguardLiveStreamCommand,
  buildPeerLiveStreamCommand,
  type WireguardServerStatus,
  type WireguardPeer,
} from '../utils/wireguardManager.js';

const props = defineProps<{
  isOpen: boolean;
  sessionId: string;
  hostTitle?: string;
  initialUseSudo?: boolean;
  sessionConfig?: SshSessionConfig;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const dialogStore = useDialogStore();

// Sudo state
const useSudo = ref(props.initialUseSudo ?? (props.sessionConfig?.username !== 'root'));
const sudoPassword = ref(props.sessionConfig?.password || '');

// Status & UI State
const isLoading = ref(false);
const isActionLoading = ref(false);
const isInstalling = ref(false);
const installLogs = ref('');
const searchFilter = ref('');
const alertMessage = ref<{ type: 'success' | 'error'; text: string } | null>(null);

const serverStatus = ref<WireguardServerStatus>({
  isInstalled: false,
  isActive: false,
  interfaceName: 'wg0',
  serverAddress: '10.99.0.1/24',
  listenPort: 51820,
  peers: [],
});

// Installation Form
const installForm = ref({
  serverAddress: '10.99.0.1/24',
  listenPort: 51820,
  publicIpOrDomain: props.sessionConfig?.host || '',
  dns: '1.1.1.1, 8.8.8.8',
});

// Add User Modal State
const isAddUserModalOpen = ref(false);
const isSubmittingUser = ref(false);
const newUserForm = ref({
  name: '',
  clientIp: '10.99.0.2/32',
  allowedIpsRouting: 'split' as 'split' | 'full',
  dns: '1.1.1.1, 8.8.8.8',
});

// Config Viewer State
const isConfigModalOpen = ref(false);
const activeConfigTitle = ref('');
const activeConfigContent = ref('');
const activeConfigFilename = ref('');

// Logs Viewer State
const isLogsModalOpen = ref(false);
const isLoadingLogs = ref(false);
const logsOutput = ref('');
const logsLines = ref(100);
const serviceLogBoxRef = ref<HTMLPreElement | null>(null);
const isServiceStreaming = ref(false);
let serviceStreamId: string | null = null;
let unlistenServiceChunk: (() => void) | null = null;
let unlistenServiceEnded: (() => void) | null = null;

// Peer Logs Viewer State
const isPeerLogsModalOpen = ref(false);
const isLoadingPeerLogs = ref(false);
const activeLogPeer = ref<WireguardPeer | null>(null);
const peerLogsOutput = ref('');
const peerLogBoxRef = ref<HTMLPreElement | null>(null);
const isPeerStreaming = ref(false);
let peerStreamId: string | null = null;
let unlistenPeerChunk: (() => void) | null = null;
let unlistenPeerEnded: (() => void) | null = null;

// Computed endpoint
const currentEndpoint = computed(() => {
  const host = installForm.value.publicIpOrDomain || props.sessionConfig?.host || 'SERVER_IP';
  return `${host}:${serverStatus.value.listenPort || 51820}`;
});

// Filtered peers list
const filteredPeers = computed(() => {
  const list = serverStatus.value.peers;
  if (!searchFilter.value.trim()) return list;
  const q = searchFilter.value.toLowerCase();
  return list.filter(p =>
    p.name.toLowerCase().includes(q) ||
    p.allowedIps.toLowerCase().includes(q) ||
    p.publicKey.toLowerCase().includes(q)
  );
});

// Fetch & refresh WireGuard status from server
async function refreshStatus() {
  if (!props.isOpen || !props.sessionId) return;
  isLoading.value = true;
  alertMessage.value = null;

  try {
    const cmd = buildWireguardStatusCheckCommand(useSudo.value, sudoPassword.value);
    const out = await tauriBridge.sshExecCommand(props.sessionId, cmd);
    const parsed = parseWireguardStatus(out);
    serverStatus.value = parsed;

    if (parsed.listenPort) {
      installForm.value.listenPort = parsed.listenPort;
    }
    if (parsed.serverAddress) {
      installForm.value.serverAddress = parsed.serverAddress;
    }
  } catch (err: any) {
    alertMessage.value = {
      type: 'error',
      text: `Gagal membaca status: ${err?.message || err}`,
    };
  } finally {
    isLoading.value = false;
  }
}

// Install WireGuard on server
async function installWireguard() {
  isInstalling.value = true;
  installLogs.value = 'Memulai proses instalasi WireGuard...\n';
  alertMessage.value = null;

  try {
    const script = buildInstallWireguardScript({
      serverAddress: installForm.value.serverAddress,
      listenPort: installForm.value.listenPort,
      publicIpOrDomain: installForm.value.publicIpOrDomain || props.sessionConfig?.host || '127.0.0.1',
      dns: installForm.value.dns,
    }, useSudo.value, sudoPassword.value);

    const out = await tauriBridge.sshExecCommand(props.sessionId, script);
    installLogs.value += out;

    if (out.includes('WG_INSTALL_SUCCESS')) {
      alertMessage.value = {
        type: 'success',
        text: 'WireGuard berhasil dipasang dan diaktifkan!',
      };
      await refreshStatus();
    } else {
      alertMessage.value = {
        type: 'error',
        text: 'Instalasi selesai dengan peringatan, silakan periksa log di bawah.',
      };
      await refreshStatus();
    }
  } catch (err: any) {
    installLogs.value += `\nError: ${err?.message || err}`;
    alertMessage.value = {
      type: 'error',
      text: `Gagal menginstal: ${err?.message || err}`,
    };
  } finally {
    isInstalling.value = false;
  }
}

// Service Controls (Start, Stop, Restart)
async function toggleService(action: 'start' | 'stop' | 'restart') {
  isActionLoading.value = true;
  try {
    const cmd = buildServiceControlCommand(action, useSudo.value, sudoPassword.value);
    await tauriBridge.sshExecCommand(props.sessionId, cmd);
    dialogStore.showToast(`Service WireGuard berhasil di-${action}`, 'success');
    await refreshStatus();
  } catch (err: any) {
    dialogStore.showToast(`Gagal ${action} service: ${err?.message || err}`, 'error');
  } finally {
    isActionLoading.value = false;
  }
}

// Open Add User Modal with auto-calculated next IP
function openAddUserModal() {
  const nextIp = getNextAvailableIp(serverStatus.value.peers);
  newUserForm.value = {
    name: '',
    clientIp: nextIp,
    allowedIpsRouting: 'split',
    dns: installForm.value.dns || '1.1.1.1, 8.8.8.8',
  };
  isAddUserModalOpen.value = true;
}

// Submit Add User
async function submitAddUser() {
  if (!newUserForm.value.name.trim()) {
    alertMessage.value = { type: 'error', text: 'Nama user / perangkat wajib diisi' };
    return;
  }

  isSubmittingUser.value = true;
  try {
    const cmd = buildAddPeerCommand({
      name: newUserForm.value.name.trim(),
      clientIp: newUserForm.value.clientIp.trim(),
      dns: newUserForm.value.dns,
      allowedIpsRouting: newUserForm.value.allowedIpsRouting,
    }, useSudo.value, sudoPassword.value);

    const out = await tauriBridge.sshExecCommand(props.sessionId, cmd);
    const parsed = parseAddPeerOutput(out);

    if (parsed) {
      isAddUserModalOpen.value = false;
      await refreshStatus();

      // Show generated config viewer
      const serverPubKey = serverStatus.value.serverPublicKey || 'SERVER_PUB_KEY';
      const endpoint = currentEndpoint.value;
      const allowedIps = newUserForm.value.allowedIpsRouting === 'full' ? '0.0.0.0/0' : '10.99.0.0/24';

      const configContent = generateClientConfigFile({
        name: parsed.name,
        clientPrivateKey: parsed.clientPrivateKey,
        clientAddress: parsed.clientIp,
        dns: newUserForm.value.dns,
        serverPublicKey: serverPubKey,
        serverEndpoint: endpoint,
        allowedIps,
      });

      activeConfigTitle.value = parsed.name;
      activeConfigFilename.value = `${parsed.name}.conf`;
      activeConfigContent.value = configContent;
      isConfigModalOpen.value = true;

      dialogStore.showToast(`User "${parsed.name}" berhasil didaftarkan!`, 'success');
    } else {
      throw new Error(`Output server tidak sesuai: ${out}`);
    }
  } catch (err: any) {
    dialogStore.showToast(`Gagal menambahkan user: ${err?.message || err}`, 'error');
  } finally {
    isSubmittingUser.value = false;
  }
}

// Resolve complete client config from server if available (e.g. angristan / pivpn / custom), or generate fallback
async function resolvePeerConfigFile(peer: WireguardPeer): Promise<string> {
  const name = peer.name;
  if (name && !name.startsWith('User-')) {
    try {
      const sudo = useSudo.value ? 'sudo ' : '';
      const checkCmd = `${sudo}cat /root/${name}.conf 2>/dev/null || ${sudo}cat /home/*/${name}.conf 2>/dev/null || ${sudo}cat /etc/wireguard/clients/${name}.conf 2>/dev/null || ${sudo}cat /etc/wireguard/${name}.conf 2>/dev/null || echo ""`;
      const out = await tauriBridge.sshExecCommand(props.sessionId, checkCmd);
      if (out && out.includes('[Interface]') && (out.includes('PrivateKey') || out.includes('Address'))) {
        return out.trim() + '\n';
      }
    } catch {}
  }

  // Fallback to template generator
  const serverPubKey = serverStatus.value.serverPublicKey || 'SERVER_PUB_KEY';
  const endpoint = currentEndpoint.value;
  return generateClientConfigFile({
    name: peer.name,
    clientPrivateKey: peer.clientPrivateKey || '<MASUKKAN_PRIVATE_KEY_CLIENT_ANDA>',
    clientAddress: peer.allowedIps,
    dns: '1.1.1.1, 8.8.8.8',
    serverPublicKey: serverPubKey,
    serverEndpoint: endpoint,
    allowedIps: '10.99.0.0/24',
  });
}

// View Peer Config
async function viewPeerConfig(peer: WireguardPeer) {
  const configContent = await resolvePeerConfigFile(peer);

  activeConfigTitle.value = peer.name;
  activeConfigFilename.value = `${peer.name}.conf`;
  activeConfigContent.value = configContent;
  isConfigModalOpen.value = true;
}

// Download Peer Config Directly
async function downloadPeerConfig(peer: WireguardPeer) {
  const configContent = await resolvePeerConfigFile(peer);

  downloadFile(`${peer.name}.conf`, configContent);
  dialogStore.showToast(`File ${peer.name}.conf berhasil didownload`, 'success');
}

// Download Active Config from Modal
function downloadActiveConfig() {
  downloadFile(activeConfigFilename.value || 'wireguard.conf', activeConfigContent.value);
  dialogStore.showToast(`File ${activeConfigFilename.value} berhasil didownload`, 'success');
}

// Delete Peer with confirmation
async function confirmDeletePeer(peer: WireguardPeer) {
  const confirmed = await dialogStore.confirm({
    title: 'Hapus User WireGuard?',
    description: `Apakah Anda yakin ingin menghapus user "${peer.name}" (${peer.allowedIps})? Kunci publik user ini akan dicabut dari server.`,
    confirmText: 'Ya, Hapus',
    cancelText: 'Batal',
    isDestructive: true,
  });

  if (!confirmed) return;

  try {
    const cmd = buildDeletePeerCommand(peer.publicKey, peer.name, useSudo.value, sudoPassword.value);
    await tauriBridge.sshExecCommand(props.sessionId, cmd);
    dialogStore.showToast(`User "${peer.name}" berhasil dihapus`, 'success');
    await refreshStatus();
  } catch (err: any) {
    dialogStore.showToast(`Gagal menghapus user: ${err?.message || err}`, 'error');
  }
}

// Uninstall WireGuard with confirmation
async function uninstallWireguard() {
  const confirmed = await dialogStore.confirm({
    title: 'Hapus WireGuard dari Server?',
    description: 'Ini akan menghentikan interface wg0 dan menghapus konfigurasi /etc/wireguard/wg0.conf. Seluruh user terdaftar akan terputus.',
    confirmText: 'Ya, Hapus WireGuard',
    cancelText: 'Batal',
    isDestructive: true,
  });

  if (!confirmed) return;

  try {
    const cmd = buildUninstallWireguardScript(useSudo.value, sudoPassword.value);
    await tauriBridge.sshExecCommand(props.sessionId, cmd);
    dialogStore.showToast('WireGuard berhasil dinonaktifkan', 'success');
    await refreshStatus();
  } catch (err: any) {
    dialogStore.showToast(`Gagal menghapus: ${err?.message || err}`, 'error');
  }
}

// General WireGuard Service Logs
async function openLogsModal() {
  isLogsModalOpen.value = true;
  await fetchLogs();
}

async function fetchLogs() {
  isLoadingLogs.value = true;
  try {
    const cmd = buildWireguardLogsCommand(logsLines.value, useSudo.value, sudoPassword.value);
    const out = await tauriBridge.sshExecCommand(props.sessionId, cmd);
    logsOutput.value = out || '(Log kosong)';
  } catch (err: any) {
    logsOutput.value = `Gagal membaca log: ${err?.message || err}`;
  } finally {
    isLoadingLogs.value = false;
  }
}

async function toggleServiceLiveStream() {
  if (isServiceStreaming.value) {
    stopServiceLiveStream();
    return;
  }

  logsOutput.value = '=== MEMULAI LIVE STREAM SERVICE (journalctl -fu wg-quick@wg0) ===\n';
  try {
    const cmd = buildWireguardLiveStreamCommand(useSudo.value, sudoPassword.value);
    const streamId = await tauriBridge.sshStartLogStream(props.sessionId, cmd, 'wireguard:service');
    serviceStreamId = streamId;
    isServiceStreaming.value = true;

    unlistenServiceChunk = await tauriBridge.onLogStreamChunk(streamId, (chunk: string) => {
      logsOutput.value += chunk;
      nextTick(() => {
        if (serviceLogBoxRef.value) {
          serviceLogBoxRef.value.scrollTop = serviceLogBoxRef.value.scrollHeight;
        }
      });
    });

    unlistenServiceEnded = await tauriBridge.onLogStreamEnded(streamId, () => {
      stopServiceLiveStream();
    });
  } catch (err: any) {
    dialogStore.showToast(`Gagal memulai live stream: ${err?.message || err}`, 'error');
    stopServiceLiveStream();
  }
}

function stopServiceLiveStream() {
  if (serviceStreamId) {
    tauriBridge.sshStopLogStream(serviceStreamId).catch(() => {});
    serviceStreamId = null;
  }
  if (unlistenServiceChunk) {
    unlistenServiceChunk();
    unlistenServiceChunk = null;
  }
  if (unlistenServiceEnded) {
    unlistenServiceEnded();
    unlistenServiceEnded = null;
  }
  isServiceStreaming.value = false;
}

function closeLogsModal() {
  stopServiceLiveStream();
  isLogsModalOpen.value = false;
}

async function openServiceLogTerminal() {
  const sudo = useSudo.value ? 'sudo ' : '';
  const cmd = `${sudo}journalctl -fu wg-quick@wg0`;
  await tauriBridge.sshWrite(props.sessionId, `${cmd}\n`);
  closeLogsModal();
  emit('close');
}

// Peer-Specific Activity & Kernel Logs
async function openPeerLogsModal(peer: WireguardPeer) {
  activeLogPeer.value = peer;
  isPeerLogsModalOpen.value = true;
  await fetchPeerLogs(peer);
}

async function fetchPeerLogs(peer: WireguardPeer) {
  isLoadingPeerLogs.value = true;
  try {
    const cmd = buildPeerLogsCommand(peer.publicKey, useSudo.value, sudoPassword.value);
    const out = await tauriBridge.sshExecCommand(props.sessionId, cmd);
    peerLogsOutput.value = out || '(Log aktivitas kosong)';
  } catch (err: any) {
    peerLogsOutput.value = `Gagal membaca log: ${err?.message || err}`;
  } finally {
    isLoadingPeerLogs.value = false;
  }
}

async function togglePeerLiveStream() {
  if (!activeLogPeer.value) return;

  if (isPeerStreaming.value) {
    stopPeerLiveStream();
    return;
  }

  peerLogsOutput.value = `=== MEMULAI LIVE STREAM KERNEL PEER: ${activeLogPeer.value.name} ===\n`;
  try {
    const cmd = buildPeerLiveStreamCommand(activeLogPeer.value.publicKey, useSudo.value, sudoPassword.value);
    const streamId = await tauriBridge.sshStartLogStream(props.sessionId, cmd, `wireguard:peer:${activeLogPeer.value.name}`);
    peerStreamId = streamId;
    isPeerStreaming.value = true;

    unlistenPeerChunk = await tauriBridge.onLogStreamChunk(streamId, (chunk: string) => {
      peerLogsOutput.value += chunk;
      nextTick(() => {
        if (peerLogBoxRef.value) {
          peerLogBoxRef.value.scrollTop = peerLogBoxRef.value.scrollHeight;
        }
      });
    });

    unlistenPeerEnded = await tauriBridge.onLogStreamEnded(streamId, () => {
      stopPeerLiveStream();
    });
  } catch (err: any) {
    dialogStore.showToast(`Gagal memulai live stream peer: ${err?.message || err}`, 'error');
    stopPeerLiveStream();
  }
}

function stopPeerLiveStream() {
  if (peerStreamId) {
    tauriBridge.sshStopLogStream(peerStreamId).catch(() => {});
    peerStreamId = null;
  }
  if (unlistenPeerChunk) {
    unlistenPeerChunk();
    unlistenPeerChunk = null;
  }
  if (unlistenPeerEnded) {
    unlistenPeerEnded();
    unlistenPeerEnded = null;
  }
  isPeerStreaming.value = false;
}

function closePeerLogsModal() {
  stopPeerLiveStream();
  isPeerLogsModalOpen.value = false;
}

// Enable Dynamic Debug for In-Depth Kernel WireGuard Logs
async function enableDynamicDebug() {
  try {
    const cmd = buildEnableDynamicDebugCommand(useSudo.value, sudoPassword.value);
    await tauriBridge.sshExecCommand(props.sessionId, cmd);
    dialogStore.showToast('Dynamic debug WireGuard kernel berhasil diaktifkan', 'success');
    if (activeLogPeer.value) {
      await fetchPeerLogs(activeLogPeer.value);
    }
  } catch (err: any) {
    dialogStore.showToast(`Gagal mengaktifkan dynamic debug: ${err?.message || err}`, 'error');
  }
}

// Helper: Download text file
function downloadFile(filename: string, content: string) {
  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// Helper: Copy text to clipboard
async function copyText(text: string, successMsg = 'Berhasil disalin') {
  try {
    await navigator.clipboard.writeText(text);
    dialogStore.showToast(successMsg, 'success');
  } catch {
    dialogStore.showToast('Gagal menyalin ke clipboard', 'error');
  }
}

// Watchers & Lifecycle
watch(
  () => props.isOpen,
  (val) => {
    if (val) {
      if (props.sessionConfig?.host && !installForm.value.publicIpOrDomain) {
        installForm.value.publicIpOrDomain = props.sessionConfig.host;
      }
      refreshStatus();
    } else {
      stopServiceLiveStream();
      stopPeerLiveStream();
    }
  },
  { immediate: true }
);

onUnmounted(() => {
  stopServiceLiveStream();
  stopPeerLiveStream();
});
</script>
