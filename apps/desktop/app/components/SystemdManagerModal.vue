<template>
  <div
    v-if="isOpen"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 animate-fade-in"
    @click.self="close"
  >
    <div
      class="bg-[#12151e] border border-[#262c3d] rounded-xl shadow-2xl w-full max-w-6xl h-[88vh] flex flex-col overflow-hidden text-slate-200 select-none"
    >
      <!-- Header -->
      <div class="h-14 border-b border-[#23293a] px-5 flex items-center justify-between bg-[#161a26] shrink-0">
        <div class="flex items-center space-x-3">
          <div class="w-8 h-8 rounded-lg bg-violet-500/20 text-violet-400 flex items-center justify-center border border-violet-500/30">
            <Icon icon="lucide:cpu" class="w-5 h-5" />
          </div>
          <div>
            <div class="flex items-center space-x-2">
              <h2 class="font-bold text-sm tracking-wide text-white">Systemd Manager</h2>
              <span class="text-[11px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono border border-slate-700">
                {{ hostTitle }}
              </span>
            </div>
            <p class="text-[11px] text-slate-400">Kelola services, timers, sockets & logs systemd secara real-time di remote server.</p>
          </div>
        </div>

        <!-- Controls: Auto-Refresh, Sudo Toggle, Refresh, Close -->
        <div class="flex items-center space-x-2.5">
          <!-- Auto Refresh Polling Toggle -->
          <button
            @click="isAutoRefresh = !isAutoRefresh"
            :class="[
              'px-2.5 py-1.5 rounded-lg border text-xs font-mono transition flex items-center space-x-1.5',
              isAutoRefresh
                ? 'bg-emerald-950/60 border-emerald-600/50 text-emerald-300'
                : 'bg-[#1e2333] border-[#2e374d] text-slate-400 hover:text-slate-200'
            ]"
            title="Auto refresh data setiap 6 detik"
          >
            <span :class="['w-1.5 h-1.5 rounded-full', isAutoRefresh ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500']"></span>
            <span>Auto {{ isAutoRefresh ? 'ON (6s)' : 'OFF' }}</span>
          </button>

          <!-- Sudo Toggle -->
          <label class="flex items-center space-x-2 text-xs text-slate-300 cursor-pointer bg-[#1e2333] px-2.5 py-1.5 rounded-lg border border-[#2e374d]">
            <input
              type="checkbox"
              v-model="useSudo"
              @change="() => fetchData()"
              class="rounded bg-[#12151e] border-slate-600 text-violet-500 focus:ring-0 focus:ring-offset-0 cursor-pointer"
            />
            <span class="font-mono text-amber-400 font-bold">sudo</span>
          </label>

          <!-- Daemon Reload Button -->
          <button
            @click="runDaemonReload"
            :disabled="isLoading"
            class="px-2.5 py-1.5 bg-[#1e2333] hover:bg-[#282f45] border border-[#2e374d] text-slate-300 rounded-lg transition disabled:opacity-50 flex items-center space-x-1.5"
            title="Reload systemd manager configuration (systemctl daemon-reload)"
          >
            <Icon icon="lucide:refresh-ccw" class="w-3.5 h-3.5" />
            <span class="text-xs font-mono">Daemon-Reload</span>
          </button>

          <!-- Refresh Button -->
          <button
            @click="() => fetchData()"
            :disabled="isLoading"
            class="p-1.5 bg-[#1e2333] hover:bg-[#282f45] border border-[#2e374d] text-slate-300 rounded-lg transition disabled:opacity-50"
            title="Muat Ulang Data Sekarang"
          >
            <Icon icon="lucide:refresh-cw" :class="['w-4 h-4', isLoading ? 'animate-spin text-violet-400' : '']" />
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

      <!-- Navigation Tabs & Search -->
      <div class="h-10 border-b border-[#23293a] bg-[#141722] px-5 flex items-center justify-between shrink-0">
        <div class="flex items-center space-x-2">
          <!-- Tab Services -->
          <button
            @click="activeTab = 'services'"
            :class="[
              'px-3.5 py-1.5 rounded-md text-xs font-medium transition flex items-center space-x-2',
              activeTab === 'services'
                ? 'bg-violet-500/20 text-violet-300 border border-violet-500/40'
                : 'text-slate-400 hover:text-slate-200'
            ]"
          >
            <Icon icon="lucide:cog" class="w-3.5 h-3.5" />
            <span>Services</span>
            <span class="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-800 text-slate-300">{{ units.length }}</span>
          </button>

          <!-- Tab Timers -->
          <button
            @click="activeTab = 'timers'"
            :class="[
              'px-3.5 py-1.5 rounded-md text-xs font-medium transition flex items-center space-x-2',
              activeTab === 'timers'
                ? 'bg-violet-500/20 text-violet-300 border border-violet-500/40'
                : 'text-slate-400 hover:text-slate-200'
            ]"
          >
            <Icon icon="lucide:clock" class="w-3.5 h-3.5" />
            <span>Timers</span>
            <span class="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-800 text-slate-300">{{ timers.length }}</span>
          </button>

          <!-- Tab Sockets -->
          <button
            @click="activeTab = 'sockets'"
            :class="[
              'px-3.5 py-1.5 rounded-md text-xs font-medium transition flex items-center space-x-2',
              activeTab === 'sockets'
                ? 'bg-violet-500/20 text-violet-300 border border-violet-500/40'
                : 'text-slate-400 hover:text-slate-200'
            ]"
          >
            <Icon icon="lucide:network" class="w-3.5 h-3.5" />
            <span>Sockets</span>
            <span class="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-800 text-slate-300">{{ sockets.length }}</span>
          </button>

          <!-- Tab Failed Units -->
          <button
            @click="activeTab = 'failed'"
            :class="[
              'px-3.5 py-1.5 rounded-md text-xs font-medium transition flex items-center space-x-2',
              activeTab === 'failed'
                ? 'bg-rose-500/20 text-rose-300 border border-rose-500/40'
                : 'text-slate-400 hover:text-slate-200'
            ]"
          >
            <Icon icon="lucide:alert-circle" class="w-3.5 h-3.5 text-rose-400" />
            <span>Failed Units</span>
            <span
              :class="[
                'text-[10px] px-1.5 py-0.2 rounded-full',
                failedUnits.length > 0 ? 'bg-rose-500 text-white font-bold' : 'bg-slate-800 text-slate-300'
              ]"
            >
              {{ failedUnits.length }}
            </span>
          </button>
        </div>

        <!-- Filter Search Bar -->
        <div class="relative w-72">
          <Icon icon="lucide:search" class="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Cari service, unit, status..."
            class="w-full pl-8 pr-3 py-1 bg-[#1b202e] border border-[#2a3247] rounded-md text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-violet-500 transition"
          />
        </div>
      </div>

      <!-- Main Body Content -->
      <div class="flex-1 overflow-auto p-4 bg-[#0d1017]">
        <!-- Action Message Flash Notification -->
        <div
          v-if="actionMessage"
          class="mb-3 p-2.5 bg-emerald-950/60 border border-emerald-700/60 text-emerald-200 text-xs rounded-lg flex items-center space-x-2 transition animate-fade-in"
        >
          <Icon icon="lucide:check-circle" class="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{{ actionMessage }}</span>
        </div>

        <!-- Permission Error Banner if detected -->
        <div v-if="permissionError" class="mb-4 p-3 bg-amber-950/40 border border-amber-800/60 rounded-lg flex items-center justify-between text-amber-200 text-xs">
          <div class="flex items-center space-x-2">
            <Icon icon="lucide:alert-triangle" class="w-4 h-4 text-amber-400 shrink-0" />
            <span>{{ permissionError }}</span>
          </div>
          <button
            v-if="!useSudo"
            @click="enableSudoAndRetry"
            class="px-2.5 py-1 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold rounded text-[11px] transition shrink-0 ml-2"
          >
            Aktifkan Sudo
          </button>
        </div>

        <!-- 1. SERVICES TAB -->
        <div v-if="activeTab === 'services'" class="space-y-3">
          <!-- Quick Status Filter Pills -->
          <div class="flex items-center justify-between">
            <div class="flex items-center space-x-2 text-xs">
              <span class="text-slate-500 text-[11px]">Filter:</span>
              <button
                v-for="f in [
                  { id: 'all', label: 'Semua', count: units.length },
                  { id: 'running', label: 'Running', count: countRunning },
                  { id: 'failed', label: 'Failed', count: failedUnits.length },
                  { id: 'inactive', label: 'Inactive / Dead', count: countInactive },
                  { id: 'enabled', label: 'Boot Auto-start', count: countEnabled }
                ]"
                :key="f.id"
                @click="servicesFilter = (f.id as any)"
                :class="[
                  'px-2.5 py-1 rounded text-[11px] font-mono transition flex items-center space-x-1.5',
                  servicesFilter === f.id
                    ? 'bg-violet-950/80 text-violet-300 border border-violet-600/60'
                    : 'bg-[#181d2b] text-slate-400 hover:text-slate-200 border border-[#272f44]'
                ]"
              >
                <span>{{ f.label }}</span>
                <span class="text-[10px] px-1 py-0.2 rounded-full bg-slate-800 text-slate-300">{{ f.count }}</span>
              </button>
            </div>
            <div class="text-[11px] text-slate-500 font-mono">
              Menampilkan {{ filteredUnits.length }} unit
            </div>
          </div>

          <!-- Empty State -->
          <div v-if="!isLoading && filteredUnits.length === 0" class="text-center py-16 text-slate-500">
            <Icon icon="lucide:cog" class="w-10 h-10 mx-auto mb-2 opacity-40" />
            <p class="text-xs">Tidak ada service yang sesuai filter.</p>
          </div>

          <!-- Services Table -->
          <div v-else class="border border-[#222838] rounded-lg bg-[#131620] overflow-x-auto">
            <table class="w-full text-left text-xs border-collapse min-w-[860px]">
              <thead>
                <tr class="bg-[#171c2a] border-b border-[#222838] text-slate-400 text-[11px] font-mono">
                  <th class="py-2.5 px-3 w-32 whitespace-nowrap">STATUS</th>
                  <th class="py-2.5 px-3 min-w-[200px]">SERVICE UNIT</th>
                  <th class="py-2.5 px-3 w-28 whitespace-nowrap">BOOT STARTUP</th>
                  <th class="py-2.5 px-3 min-w-[240px]">DESCRIPTION</th>
                  <th class="py-2.5 px-3 text-right w-56 whitespace-nowrap">ACTIONS</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-[#1e2333] font-mono">
                <tr
                  v-for="u in filteredUnits"
                  :key="u.unit"
                  class="hover:bg-[#181d2c] transition group"
                >
                  <!-- Status Badge -->
                  <td class="py-2.5 px-3 whitespace-nowrap">
                    <span
                      :class="[
                        'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-sans font-medium',
                        u.active === 'active' && u.sub === 'running'
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                          : u.active === 'failed' || u.sub === 'failed'
                          ? 'bg-rose-500/10 text-rose-400 border border-rose-500/20'
                          : u.active === 'active'
                          ? 'bg-sky-500/10 text-sky-400 border border-sky-500/20'
                          : u.active === 'activating' || u.sub === 'reloading'
                          ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                          : 'bg-slate-800 text-slate-400 border border-slate-700'
                      ]"
                    >
                      <span
                        :class="[
                          'w-1.5 h-1.5 rounded-full mr-1.5 shrink-0',
                          u.active === 'active' && u.sub === 'running'
                            ? 'bg-emerald-400 animate-pulse'
                            : u.active === 'failed' || u.sub === 'failed'
                            ? 'bg-rose-400'
                            : u.active === 'active'
                            ? 'bg-sky-400'
                            : u.active === 'activating'
                            ? 'bg-amber-400'
                            : 'bg-slate-500'
                        ]"
                      ></span>
                      {{ u.sub ? u.sub.toUpperCase() : u.active.toUpperCase() }}
                    </span>
                  </td>

                  <!-- Unit Name -->
                  <td class="py-2.5 px-3 font-semibold text-slate-100">
                    <div class="flex flex-col">
                      <span class="break-all font-mono text-xs">{{ u.unit }}</span>
                      <span class="text-[10px] text-slate-500">{{ u.load }}</span>
                    </div>
                  </td>

                  <!-- Boot Startup State -->
                  <td class="py-2.5 px-3 whitespace-nowrap">
                    <span
                      :class="[
                        'text-[10px] px-2 py-0.5 rounded border font-mono',
                        u.enabled === 'enabled'
                          ? 'bg-emerald-950/60 border-emerald-700/60 text-emerald-300'
                          : u.enabled === 'disabled'
                          ? 'bg-slate-800/80 border-slate-700 text-slate-400'
                          : u.enabled === 'static'
                          ? 'bg-sky-950/40 border-sky-800/50 text-sky-300'
                          : u.enabled === 'masked'
                          ? 'bg-rose-950/40 border-rose-800/50 text-rose-300'
                          : 'bg-slate-800/40 border-slate-700/50 text-slate-500'
                      ]"
                    >
                      {{ u.enabled || 'unknown' }}
                    </span>
                  </td>

                  <!-- Description -->
                  <td class="py-2.5 px-3 text-slate-400 break-words text-[11px] font-sans">
                    {{ u.description || '-' }}
                  </td>

                  <!-- Action Buttons -->
                  <td class="py-2.5 px-3 text-right whitespace-nowrap">
                    <div class="flex items-center justify-end space-x-1">
                      <!-- Start -->
                      <button
                        v-if="u.sub !== 'running'"
                        @click="runServiceAction(u, 'start')"
                        :disabled="actionLoadingId === u.unit"
                        class="p-1.5 bg-emerald-950/60 hover:bg-emerald-900 border border-emerald-800 text-emerald-300 rounded transition shrink-0"
                        title="Start Service"
                      >
                        <Icon icon="lucide:play" class="w-3.5 h-3.5" />
                      </button>

                      <!-- Stop (dengan konfirmasi) -->
                      <button
                        v-if="u.sub === 'running'"
                        @click="confirmStopService(u)"
                        :disabled="actionLoadingId === u.unit"
                        class="p-1.5 bg-amber-950/60 hover:bg-amber-900 border border-amber-800 text-amber-300 rounded transition shrink-0"
                        title="Stop Service"
                      >
                        <Icon icon="lucide:square" class="w-3.5 h-3.5" />
                      </button>

                      <!-- Restart (dengan konfirmasi) -->
                      <button
                        @click="confirmRestartService(u)"
                        :disabled="actionLoadingId === u.unit"
                        class="p-1.5 bg-[#202637] hover:bg-[#2b344b] border border-[#303a52] text-slate-300 rounded transition shrink-0"
                        title="Restart Service"
                      >
                        <Icon icon="lucide:rotate-cw" :class="['w-3.5 h-3.5', actionLoadingId === u.unit ? 'animate-spin' : '']" />
                      </button>

                      <!-- Reload (dengan konfirmasi) -->
                      <button
                        v-if="u.sub === 'running'"
                        @click="confirmReloadService(u)"
                        :disabled="actionLoadingId === u.unit"
                        class="p-1.5 bg-sky-950/60 hover:bg-sky-900 border border-sky-800 text-sky-300 rounded transition shrink-0"
                        title="Reload Service"
                      >
                        <Icon icon="lucide:refresh-cw" :class="['w-3.5 h-3.5', actionLoadingId === u.unit ? 'animate-spin' : '']" />
                      </button>

                      <!-- Toggle Enable/Disable Boot -->
                      <button
                        @click="toggleEnableService(u)"
                        :disabled="actionLoadingId === u.unit"
                        :class="[
                          'p-1.5 border rounded transition shrink-0',
                          u.enabled === 'enabled'
                            ? 'bg-teal-950/60 hover:bg-teal-900 border-teal-800 text-teal-300'
                            : 'bg-[#202637] hover:bg-[#2b344b] border-[#303a52] text-slate-400'
                        ]"
                        :title="u.enabled === 'enabled' ? 'Nonaktifkan Boot Autostart (Disable)' : 'Aktifkan Boot Autostart (Enable)'"
                      >
                        <Icon icon="lucide:power" class="w-3.5 h-3.5" />
                      </button>

                      <!-- View Unit Definition -->
                      <button
                        @click="openUnitCat(u)"
                        class="p-1.5 bg-[#202637] hover:bg-[#2b344b] border border-[#303a52] text-slate-300 rounded transition shrink-0"
                        title="Lihat Definisi Unit (systemctl cat)"
                      >
                        <Icon icon="lucide:file-code" class="w-3.5 h-3.5" />
                      </button>

                      <!-- View Journalctl Logs -->
                      <button
                        @click="openLogs(u)"
                        class="p-1.5 bg-sky-950/60 hover:bg-sky-900 border border-sky-800 text-sky-300 rounded transition shrink-0"
                        title="Lihat Log Journalctl"
                      >
                        <Icon icon="lucide:file-text" class="w-3.5 h-3.5" />
                      </button>

                      <!-- Live Tail Terminal -->
                      <button
                        @click="openLiveTailTerminal(u)"
                        class="p-1.5 bg-emerald-950/60 hover:bg-emerald-900 border border-emerald-800 text-emerald-300 rounded transition shrink-0"
                        title="Live Tail di Terminal (journalctl -fu)"
                      >
                        <Icon icon="lucide:terminal" class="w-3.5 h-3.5" />
                      </button>

                      <!-- View Systemctl Status -->
                      <button
                        @click="openStatus(u)"
                        class="p-1.5 bg-violet-950/60 hover:bg-violet-900 border border-violet-800 text-violet-300 rounded transition shrink-0"
                        title="Detail Status (systemctl status)"
                      >
                        <Icon icon="lucide:info" class="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- 2. TIMERS TAB -->
        <div v-if="activeTab === 'timers'" class="space-y-3">
          <!-- Edu Info Banner -->
          <div class="p-2.5 bg-[#161c2b]/70 border border-violet-900/40 rounded-lg flex items-start space-x-2.5 text-[11px] text-slate-300">
            <Icon icon="lucide:info" class="w-4 h-4 text-violet-400 shrink-0 mt-0.5" />
            <div class="leading-relaxed">
              <span class="font-semibold text-violet-300">Apa itu Systemd Timer?</span>
              Timer adalah mekanisme penjadwalan tugas berkala bawaan systemd (pengganti modern cron). Timer mengaktifkan service unit pendamping pada interval waktu tertentu (misalnya pembersihan log, pembaruan sertifikat SSL, atau backup otomatis).
            </div>
          </div>

          <div v-if="!isLoading && filteredTimers.length === 0" class="text-center py-16 text-slate-500">
            <Icon icon="lucide:clock" class="w-10 h-10 mx-auto mb-2 opacity-40" />
            <p class="text-xs">Tidak ada timer yang ditemukan.</p>
          </div>

          <div v-else class="border border-[#222838] rounded-lg bg-[#131620] overflow-x-auto">
            <table class="w-full text-left text-xs border-collapse min-w-[700px]">
              <thead>
                <tr class="bg-[#171c2a] border-b border-[#222838] text-slate-400 text-[11px] font-mono">
                  <th class="py-2.5 px-3 min-w-[200px]">TIMER UNIT</th>
                  <th class="py-2.5 px-3 min-w-[180px]">MENGAKTIFKAN SERVICE</th>
                  <th class="py-2.5 px-3 min-w-[180px]">JADWAL BERIKUTNYA</th>
                  <th class="py-2.5 px-3 min-w-[180px]">EKSEKUSI TERAKHIR</th>
                  <th class="py-2.5 px-3 text-right">ACTION</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-[#1e2333] font-mono">
                <tr
                  v-for="t in filteredTimers"
                  :key="t.unit"
                  class="hover:bg-[#181d2c] transition"
                >
                  <td class="py-2.5 px-3 font-semibold text-slate-100">
                    {{ t.unit }}
                  </td>
                  <td class="py-2.5 px-3 text-violet-300 font-medium">
                    {{ t.activates }}
                  </td>
                  <td class="py-2.5 px-3 text-emerald-400">
                    {{ t.next }}
                  </td>
                  <td class="py-2.5 px-3 text-slate-400">
                    {{ t.last }}
                  </td>
                  <td class="py-2.5 px-3 text-right">
                    <div class="flex items-center justify-end space-x-1">
                      <button
                        @click="runTimerAction(t, 'restart')"
                        :disabled="actionLoadingId === t.unit"
                        class="p-1.5 bg-[#202637] hover:bg-[#2b344b] border border-[#303a52] text-slate-300 rounded transition"
                        title="Restart Timer"
                      >
                        <Icon icon="lucide:rotate-cw" class="w-3.5 h-3.5" />
                      </button>
                      <button
                        @click="openTimerLogs(t)"
                        class="p-1.5 bg-sky-950/60 hover:bg-sky-900 border border-sky-800 text-sky-300 rounded transition"
                        title="Lihat Log Service Timer"
                      >
                        <Icon icon="lucide:file-text" class="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- 3. SOCKETS TAB -->
        <div v-if="activeTab === 'sockets'" class="space-y-3">
          <!-- Edu Info Banner -->
          <div class="p-2.5 bg-[#161c2b]/70 border border-violet-900/40 rounded-lg flex items-start space-x-2.5 text-[11px] text-slate-300">
            <Icon icon="lucide:info" class="w-4 h-4 text-violet-400 shrink-0 mt-0.5" />
            <div class="leading-relaxed">
              <span class="font-semibold text-violet-300">Apa itu Systemd Socket?</span>
              Socket unit memungkinkan aktivasi layanan berdasarkan kebutuhan jaringan atau IPC (*socket-based activation*). Sistem operasi mendengarkan port/socket terlebih dahulu, dan service baru dinyalakan ketika ada koneksi pertama yang masuk.
            </div>
          </div>

          <div v-if="!isLoading && filteredSockets.length === 0" class="text-center py-16 text-slate-500">
            <Icon icon="lucide:network" class="w-10 h-10 mx-auto mb-2 opacity-40" />
            <p class="text-xs">Tidak ada socket yang ditemukan.</p>
          </div>

          <div v-else class="border border-[#222838] rounded-lg bg-[#131620] overflow-x-auto">
            <table class="w-full text-left text-xs border-collapse min-w-[600px]">
              <thead>
                <tr class="bg-[#171c2a] border-b border-[#222838] text-slate-400 text-[11px] font-mono">
                  <th class="py-2.5 px-3 min-w-[200px]">LISTEN / ADDRESS</th>
                  <th class="py-2.5 px-3 min-w-[200px]">SOCKET UNIT</th>
                  <th class="py-2.5 px-3 min-w-[200px]">MENGAKTIFKAN SERVICE</th>
                  <th class="py-2.5 px-3 text-right">ACTION</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-[#1e2333] font-mono">
                <tr
                  v-for="s in filteredSockets"
                  :key="s.unit"
                  class="hover:bg-[#181d2c] transition"
                >
                  <td class="py-2.5 px-3 font-semibold text-amber-300">
                    {{ s.listen }}
                  </td>
                  <td class="py-2.5 px-3 text-slate-200">
                    {{ s.unit }}
                  </td>
                  <td class="py-2.5 px-3 text-slate-400">
                    {{ s.activates }}
                  </td>
                  <td class="py-2.5 px-3 text-right">
                    <div class="flex items-center justify-end space-x-1">
                      <button
                        @click="runSocketAction(s, 'restart')"
                        :disabled="actionLoadingId === s.unit"
                        class="p-1.5 bg-[#202637] hover:bg-[#2b344b] border border-[#303a52] text-slate-300 rounded transition"
                        title="Restart Socket"
                      >
                        <Icon icon="lucide:rotate-cw" class="w-3.5 h-3.5" />
                      </button>
                      <button
                        @click="openSocketLogs(s)"
                        class="p-1.5 bg-sky-950/60 hover:bg-sky-900 border border-sky-800 text-sky-300 rounded transition"
                        title="Lihat Log Socket"
                      >
                        <Icon icon="lucide:file-text" class="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- 4. FAILED UNITS TAB -->
        <div v-if="activeTab === 'failed'" class="space-y-3">
          <div class="p-3 bg-rose-950/30 border border-rose-800/40 rounded-lg flex items-start space-x-2.5 text-xs text-rose-200">
            <Icon icon="lucide:alert-octagon" class="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
            <div>
              <span class="font-bold text-rose-300">Unit Bermasalah Terdeteksi (Failed State)</span>
              <p class="text-[11px] text-rose-300/80 mt-0.5">
                Daftar service di bawah mengalami crash atau kegagalan saat startup. Periksa log Journalctl untuk mengidentifikasi penyebab error, atau gunakan AI Copilot untuk mendiagnosis masalah.
              </p>
            </div>
          </div>

          <div v-if="!isLoading && failedUnits.length === 0" class="text-center py-16 text-slate-500">
            <Icon icon="lucide:check-circle" class="w-12 h-12 mx-auto mb-2 text-emerald-500/50" />
            <p class="text-sm font-semibold text-emerald-400">Semua Unit Sehat!</p>
            <p class="text-xs text-slate-500 mt-1">Tidak ada systemd service yang dalam kondisi failed di server ini.</p>
          </div>

          <div v-else class="border border-rose-900/40 rounded-lg bg-[#15121a] overflow-x-auto">
            <table class="w-full text-left text-xs border-collapse min-w-[800px]">
              <thead>
                <tr class="bg-[#1c1420] border-b border-rose-900/30 text-rose-300 text-[11px] font-mono">
                  <th class="py-2.5 px-3 w-28 whitespace-nowrap">STATUS</th>
                  <th class="py-2.5 px-3 min-w-[200px]">SERVICE UNIT</th>
                  <th class="py-2.5 px-3 min-w-[240px]">DESCRIPTION</th>
                  <th class="py-2.5 px-3 text-right w-64 whitespace-nowrap">ACTIONS</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-rose-950/40 font-mono">
                <tr
                  v-for="u in failedUnits"
                  :key="u.unit"
                  class="hover:bg-rose-950/20 transition"
                >
                  <td class="py-2.5 px-3 whitespace-nowrap">
                    <span class="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-sans font-semibold bg-rose-500/20 text-rose-400 border border-rose-500/30">
                      <span class="w-1.5 h-1.5 rounded-full mr-1.5 bg-rose-400"></span>
                      FAILED
                    </span>
                  </td>
                  <td class="py-2.5 px-3 font-semibold text-rose-200">
                    {{ u.unit }}
                  </td>
                  <td class="py-2.5 px-3 text-slate-400 font-sans text-[11px]">
                    {{ u.description || '-' }}
                  </td>
                  <td class="py-2.5 px-3 text-right whitespace-nowrap">
                    <div class="flex items-center justify-end space-x-1.5">
                      <!-- Restart / Try Start -->
                      <button
                        @click="runServiceAction(u, 'restart')"
                        :disabled="actionLoadingId === u.unit"
                        class="px-2 py-1 bg-emerald-950/60 hover:bg-emerald-900 border border-emerald-800 text-emerald-300 rounded text-xs transition flex items-center space-x-1"
                        title="Restart Service"
                      >
                        <Icon icon="lucide:rotate-cw" class="w-3.5 h-3.5" />
                        <span>Restart</span>
                      </button>

                      <!-- Reset Failed -->
                      <button
                        @click="resetFailedService(u)"
                        :disabled="actionLoadingId === u.unit"
                        class="px-2 py-1 bg-[#202637] hover:bg-[#2b344b] border border-[#303a52] text-slate-300 rounded text-xs transition"
                        title="Hapus status failed (systemctl reset-failed)"
                      >
                        <span>Reset</span>
                      </button>

                      <!-- View Logs -->
                      <button
                        @click="openLogs(u)"
                        class="p-1.5 bg-sky-950/60 hover:bg-sky-900 border border-sky-800 text-sky-300 rounded transition"
                        title="Buka Log Error Journalctl"
                      >
                        <Icon icon="lucide:file-text" class="w-3.5 h-3.5" />
                      </button>

                      <!-- Status Info -->
                      <button
                        @click="openStatus(u)"
                        class="p-1.5 bg-violet-950/60 hover:bg-violet-900 border border-violet-800 text-violet-300 rounded transition"
                        title="Detail Status Crash"
                      >
                        <Icon icon="lucide:info" class="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- SUB-VIEW: Journalctl Log Viewer Overlay -->
      <div
        v-if="selectedUnitForLogs"
        class="h-72 border-t border-[#23293a] bg-[#0c0e15] flex flex-col shrink-0 animate-slide-up"
      >
        <!-- Log Header Bar -->
        <div class="h-10 border-b border-[#1f2537] bg-[#141724] px-4 flex items-center justify-between shrink-0">
          <div class="flex items-center space-x-2">
            <Icon icon="lucide:file-text" class="w-4 h-4 text-violet-400" />
            <span class="font-bold text-xs text-white">Journalctl:</span>
            <span class="font-mono text-xs text-violet-300 font-semibold">{{ selectedUnitForLogs.unit }}</span>
          </div>

          <div class="flex items-center space-x-2">
            <!-- Line Tail Select -->
            <div class="flex items-center space-x-1 text-xs">
              <span class="text-slate-500 text-[10px]">Tail:</span>
              <button
                v-for="lines in [50, 100, 200, 500]"
                :key="lines"
                @click="logTailLines = lines; fetchLogs(selectedUnitForLogs)"
                :class="[
                  'px-1.5 py-0.5 rounded text-[10px] font-mono transition',
                  logTailLines === lines
                    ? 'bg-violet-600 text-white font-semibold'
                    : 'bg-[#1b202e] text-slate-400 hover:text-slate-200'
                ]"
              >
                {{ lines }}
              </button>
            </div>

            <!-- Auto-scroll to bottom toggle -->
            <button
              @click="isLogAutoScroll = !isLogAutoScroll"
              :class="[
                'px-2 py-1 rounded text-xs font-mono transition border',
                isLogAutoScroll
                  ? 'bg-violet-950/60 border-violet-600/50 text-violet-300'
                  : 'bg-[#1e2333] border-[#2e374d] text-slate-400'
              ]"
              title="Auto scroll ke bawah saat log diperbarui"
            >
              Scroll ↓
            </button>

            <!-- Ask AI Copilot Button -->
            <button
              @click="analyzeLogsWithAI"
              class="px-2.5 py-1 bg-purple-950/60 hover:bg-purple-900 border border-purple-700/60 text-purple-300 rounded text-xs font-medium transition flex items-center space-x-1.5 shadow-sm"
              title="Kirim potongan log error ke Copilot AI"
            >
              <Icon icon="lucide:sparkles" class="w-3.5 h-3.5 text-purple-400" />
              <span>Copilot</span>
            </button>

            <!-- Copy Button -->
            <button
              @click="copyLogs"
              class="px-2.5 py-1 bg-[#202638] hover:bg-[#2c344c] border border-[#303a52] text-slate-300 rounded text-xs transition flex items-center space-x-1"
            >
              <Icon icon="lucide:copy" class="w-3.5 h-3.5" />
              <span>Copy</span>
            </button>

            <!-- Refresh Logs -->
            <button
              @click="fetchLogs(selectedUnitForLogs)"
              class="p-1 bg-[#202638] hover:bg-[#2c344c] border border-[#303a52] text-slate-300 rounded transition"
              title="Refresh Logs"
            >
              <Icon icon="lucide:refresh-cw" :class="['w-3.5 h-3.5', isLogsLoading ? 'animate-spin' : '']" />
            </button>

            <!-- Close Logs -->
            <button
              @click="selectedUnitForLogs = null"
              class="w-6 h-6 flex items-center justify-center rounded text-slate-400 hover:text-white"
            >
              <Icon icon="lucide:x" class="w-4 h-4" />
            </button>
          </div>
        </div>

        <!-- Log Filter Input -->
        <div class="h-8 border-b border-[#1f2537] bg-[#121520] px-3 flex items-center">
          <Icon icon="lucide:filter" class="w-3 h-3 text-slate-500 mr-2" />
          <input
            v-model="logFilter"
            type="text"
            placeholder="Filter log output..."
            class="bg-transparent border-none text-xs text-slate-200 placeholder-slate-600 focus:outline-none w-full font-mono"
          />
        </div>

        <!-- Log Content View -->
        <div
          ref="logContainerRef"
          class="flex-1 bg-[#090b10] p-3 overflow-auto font-mono text-[11px] leading-relaxed select-text space-y-0.5"
        >
          <div v-if="isLogsLoading" class="text-slate-500 italic">Memuat log systemd journal...</div>
          <div v-else-if="!logContent" class="text-slate-600 italic">Tidak ada log output.</div>
          <template v-else>
            <div
              v-for="(line, idx) in filteredLogLines"
              :key="idx"
              :class="[
                'whitespace-pre-wrap break-all',
                line.toLowerCase().includes('error') || line.toLowerCase().includes('failed') || line.toLowerCase().includes('fatal') || line.toLowerCase().includes('crit')
                  ? 'text-rose-400 font-semibold'
                  : line.toLowerCase().includes('warn')
                  ? 'text-amber-300'
                  : 'text-slate-300'
              ]"
            >
              {{ line }}
            </div>
          </template>
        </div>
      </div>

      <!-- SUB-VIEW: Status Inspector Overlay -->
      <div
        v-if="selectedUnitForStatus"
        class="h-72 border-t border-[#23293a] bg-[#0c0e15] flex flex-col shrink-0 animate-slide-up"
      >
        <div class="h-10 border-b border-[#1f2537] bg-[#141724] px-4 flex items-center justify-between shrink-0">
          <div class="flex items-center space-x-2">
            <Icon icon="lucide:info" class="w-4 h-4 text-violet-400" />
            <span class="font-bold text-xs text-white">Status Inspector:</span>
            <span class="font-mono text-xs text-violet-300 font-semibold">{{ selectedUnitForStatus.unit }}</span>
          </div>

          <div class="flex items-center space-x-2">
            <!-- Ask AI Copilot Button -->
            <button
              @click="analyzeStatusWithAI"
              class="px-2.5 py-1 bg-purple-950/60 hover:bg-purple-900 border border-purple-700/60 text-purple-300 rounded text-xs font-medium transition flex items-center space-x-1.5 shadow-sm"
              title="Analisa status unit dengan Copilot AI"
            >
              <Icon icon="lucide:sparkles" class="w-3.5 h-3.5 text-purple-400" />
              <span>Copilot</span>
            </button>

            <!-- Copy Button -->
            <button
              @click="copyStatus"
              class="px-2.5 py-1 bg-[#202638] hover:bg-[#2c344c] border border-[#303a52] text-slate-300 rounded text-xs transition flex items-center space-x-1"
            >
              <Icon icon="lucide:copy" class="w-3.5 h-3.5" />
              <span>Copy</span>
            </button>

            <!-- Refresh Status -->
            <button
              @click="fetchStatus(selectedUnitForStatus)"
              class="p-1 bg-[#202638] hover:bg-[#2c344c] border border-[#303a52] text-slate-300 rounded transition"
              title="Refresh Status"
            >
              <Icon icon="lucide:refresh-cw" :class="['w-3.5 h-3.5', isStatusLoading ? 'animate-spin' : '']" />
            </button>

            <!-- Close Status -->
            <button
              @click="selectedUnitForStatus = null"
              class="w-6 h-6 flex items-center justify-center rounded text-slate-400 hover:text-white"
            >
              <Icon icon="lucide:x" class="w-4 h-4" />
            </button>
          </div>
        </div>

        <div class="flex-1 bg-[#090b10] p-3 overflow-auto font-mono text-[11px] leading-relaxed select-text whitespace-pre-wrap text-slate-300">
          <div v-if="isStatusLoading" class="text-slate-500 italic">Memeriksa status unit...</div>
          <div v-else-if="!statusContent" class="text-slate-600 italic">Tidak ada output status.</div>
          <div v-else>{{ statusContent }}</div>
        </div>
      </div>

      <!-- SUB-VIEW: Unit Definition Inspector Overlay -->
      <div
        v-if="selectedUnitForCat"
        class="h-72 border-t border-[#23293a] bg-[#0c0e15] flex flex-col shrink-0 animate-slide-up"
      >
        <div class="h-10 border-b border-[#1f2537] bg-[#141724] px-4 flex items-center justify-between shrink-0">
          <div class="flex items-center space-x-2">
            <Icon icon="lucide:file-code" class="w-4 h-4 text-violet-400" />
            <span class="font-bold text-xs text-white">Unit Definition:</span>
            <span class="font-mono text-xs text-violet-300 font-semibold">{{ selectedUnitForCat.unit }}</span>
          </div>

          <div class="flex items-center space-x-2">
            <!-- Ask AI Copilot Button -->
            <button
              @click="analyzeCatWithAI"
              class="px-2.5 py-1 bg-purple-950/60 hover:bg-purple-900 border border-purple-700/60 text-purple-300 rounded text-xs font-medium transition flex items-center space-x-1.5 shadow-sm"
              title="Konsultasi konfigurasi unit file dengan Copilot AI"
            >
              <Icon icon="lucide:sparkles" class="w-3.5 h-3.5 text-purple-400" />
              <span>Copilot</span>
            </button>

            <!-- Copy Button -->
            <button
              @click="copyCat"
              class="px-2.5 py-1 bg-[#202638] hover:bg-[#2c344c] border border-[#303a52] text-slate-300 rounded text-xs transition flex items-center space-x-1"
            >
              <Icon icon="lucide:copy" class="w-3.5 h-3.5" />
              <span>Copy</span>
            </button>

            <!-- Refresh Cat -->
            <button
              @click="fetchCat(selectedUnitForCat)"
              class="p-1 bg-[#202638] hover:bg-[#2c344c] border border-[#303a52] text-slate-300 rounded transition"
              title="Refresh Unit Definition"
            >
              <Icon icon="lucide:refresh-cw" :class="['w-3.5 h-3.5', isCatLoading ? 'animate-spin' : '']" />
            </button>

            <!-- Close Cat -->
            <button
              @click="selectedUnitForCat = null"
              class="w-6 h-6 flex items-center justify-center rounded text-slate-400 hover:text-white"
            >
              <Icon icon="lucide:x" class="w-4 h-4" />
            </button>
          </div>
        </div>

        <div class="flex-1 bg-[#090b10] p-3 overflow-auto font-mono text-[11px] leading-relaxed select-text whitespace-pre-wrap text-slate-300">
          <div v-if="isCatLoading" class="text-slate-500 italic">Membaca definisi unit...</div>
          <div v-else-if="!catContent" class="text-slate-600 italic">Tidak ada definisi unit.</div>
          <div v-else>{{ catContent }}</div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick, onMounted, onUnmounted, watch } from 'vue';
import { Icon } from '@iconify/vue';
import { tauriBridge } from '../services/tauriBridge';
import { useDialogStore } from '../stores/dialogStore';
import { useAiAgentStore } from '../stores/aiAgentStore';
import {
  parseCombinedSystemdOutput,
  buildSystemdCommand,
  safeUnitName,
  type SystemdUnit,
  type SystemdTimer,
  type SystemdSocket
} from '../utils/systemdParser';

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
const aiAgentStore = useAiAgentStore();

const activeTab = ref<'services' | 'timers' | 'sockets' | 'failed'>('services');
const servicesFilter = ref<'all' | 'running' | 'failed' | 'inactive' | 'enabled'>('all');
const searchQuery = ref('');
const useSudo = ref(props.initialUseSudo ?? false);
const isLoading = ref(false);
const isAutoRefresh = ref(false);
const permissionError = ref<string | null>(null);
const actionLoadingId = ref<string | null>(null);
const actionMessage = ref<string | null>(null);

const units = ref<SystemdUnit[]>([]);
const timers = ref<SystemdTimer[]>([]);
const sockets = ref<SystemdSocket[]>([]);

let pollingTimer: any = null;

// Logs state
const selectedUnitForLogs = ref<SystemdUnit | null>(null);
const logContent = ref('');
const logFilter = ref('');
const logTailLines = ref(100);
const isLogAutoScroll = ref(true);
const isLogsLoading = ref(false);
const logContainerRef = ref<HTMLDivElement | null>(null);

// Status state
const selectedUnitForStatus = ref<SystemdUnit | null>(null);
const statusContent = ref('');
const isStatusLoading = ref(false);

const failedUnits = computed(() => {
  return units.value.filter((u) => u.active === 'failed' || u.sub === 'failed');
});

const countRunning = computed(() => {
  return units.value.filter((u) => u.active === 'active' && u.sub === 'running').length;
});

const countInactive = computed(() => {
  return units.value.filter((u) => u.active === 'inactive' || u.sub === 'dead').length;
});

const countEnabled = computed(() => {
  return units.value.filter((u) => u.enabled === 'enabled').length;
});

const filteredUnits = computed(() => {
  let list = units.value;

  if (servicesFilter.value === 'running') {
    list = list.filter((u) => u.active === 'active' && u.sub === 'running');
  } else if (servicesFilter.value === 'failed') {
    list = list.filter((u) => u.active === 'failed' || u.sub === 'failed');
  } else if (servicesFilter.value === 'inactive') {
    list = list.filter((u) => u.active === 'inactive' || u.sub === 'dead');
  } else if (servicesFilter.value === 'enabled') {
    list = list.filter((u) => u.enabled === 'enabled');
  }

  if (!searchQuery.value.trim()) return list;
  const q = searchQuery.value.toLowerCase();
  return list.filter(
    (u) =>
      u.unit.toLowerCase().includes(q) ||
      u.name.toLowerCase().includes(q) ||
      u.description.toLowerCase().includes(q) ||
      u.sub.toLowerCase().includes(q) ||
      u.active.toLowerCase().includes(q)
  );
});

const filteredTimers = computed(() => {
  if (!searchQuery.value.trim()) return timers.value;
  const q = searchQuery.value.toLowerCase();
  return timers.value.filter(
    (t) =>
      t.unit.toLowerCase().includes(q) ||
      t.activates.toLowerCase().includes(q) ||
      t.next.toLowerCase().includes(q) ||
      t.last.toLowerCase().includes(q)
  );
});

const filteredSockets = computed(() => {
  if (!searchQuery.value.trim()) return sockets.value;
  const q = searchQuery.value.toLowerCase();
  return sockets.value.filter(
    (s) =>
      s.unit.toLowerCase().includes(q) ||
      s.listen.toLowerCase().includes(q) ||
      s.activates.toLowerCase().includes(q)
  );
});

const filteredLogLines = computed(() => {
  if (!logContent.value) return [];
  const lines = logContent.value.split(/\r?\n/);
  if (!logFilter.value.trim()) return lines;
  const q = logFilter.value.toLowerCase();
  return lines.filter((l) => l.toLowerCase().includes(q));
});

function setFlashMessage(msg: string) {
  actionMessage.value = msg;
  setTimeout(() => {
    if (actionMessage.value === msg) actionMessage.value = null;
  }, 4000);
}

function enableSudoAndRetry() {
  useSudo.value = true;
  permissionError.value = null;
  fetchData();
}

async function runDaemonReload() {
  actionLoadingId.value = 'daemon-reload';
  try {
    const cmd = buildSystemdCommand('systemctl daemon-reload', useSudo.value);
    await tauriBridge.sshExecCommand(props.sessionId, cmd);
    setFlashMessage('Daemon-reload berhasil dijalankan');
    await fetchData(true);
  } catch (err: any) {
    dialogStore.showToast(`Gagal daemon-reload: ${err.message || err}`, 'error');
  } finally {
    actionLoadingId.value = null;
  }
}

async function fetchData(silent: boolean = false) {
  if (!props.sessionId) return;
  if (!silent) isLoading.value = true;
  permissionError.value = null;

  try {
    const combinedScript = `
echo "---UNITS---"
systemctl list-units --type=service --all --no-legend --no-pager --plain 2>/dev/null
echo "---UNITFILES---"
systemctl list-unit-files --type=service --no-legend --no-pager 2>/dev/null
echo "---TIMERS---"
systemctl list-timers --all --no-legend --no-pager 2>/dev/null
echo "---SOCKETS---"
systemctl list-sockets --all --no-legend --no-pager 2>/dev/null
echo "---END---"
`;
    const cmd = buildSystemdCommand(combinedScript.trim(), useSudo.value);
    const rawOut = await tauriBridge.sshExecCommand(props.sessionId, cmd);

    if (rawOut.toLowerCase().includes('permission denied') || rawOut.toLowerCase().includes('interactive authentication required')) {
      permissionError.value = 'Akses ditolak (Permission Denied). Aktifkan Sudo Mode untuk mengakses systemd.';
      isLoading.value = false;
      return;
    }

    const data = parseCombinedSystemdOutput(rawOut);
    units.value = data.units;
    timers.value = data.timers;
    sockets.value = data.sockets;
  } catch (err: any) {
    permissionError.value = `Gagal memuat data systemd: ${err.message || err}`;
  } finally {
    if (!silent) isLoading.value = false;
  }
}

async function runServiceAction(u: SystemdUnit, action: 'start' | 'stop' | 'restart' | 'reload') {
  const safe = safeUnitName(u.unit);
  if (!safe) return;
  actionLoadingId.value = u.unit;
  try {
    const cmd = buildSystemdCommand(`systemctl ${action} '${safe}'`, useSudo.value);
    await tauriBridge.sshExecCommand(props.sessionId, cmd);
    setFlashMessage(`Service "${u.unit}" berhasil di-${action}`);
    await fetchData(true);
  } catch (err: any) {
    dialogStore.showToast(`Gagal ${action} service: ${err.message || err}`, 'error');
  } finally {
    actionLoadingId.value = null;
  }
}

async function confirmStopService(u: SystemdUnit) {
  const ok = await dialogStore.confirm({
    title: 'Hentikan Service (Stop)',
    description: `Apakah Anda yakin ingin menghentikan service "${u.unit}"?\n• Deskripsi: ${u.description || '-'}\n• Status Saat Ini: ${u.active} (${u.sub})\n\nLayanan ini tidak akan berjalan hingga dijalankan kembali.`,
    confirmText: 'Stop Service',
    isDestructive: true
  });
  if (!ok) return;
  await runServiceAction(u, 'stop');
}

async function confirmRestartService(u: SystemdUnit) {
  const ok = await dialogStore.confirm({
    title: 'Restart Service',
    description: `Apakah Anda yakin ingin me-restart service "${u.unit}"?\n• Deskripsi: ${u.description || '-'}\n\nKoneksi aktif ke layanan ini mungkin terputus sesaat saat proses restart.`,
    confirmText: 'Restart Service',
    isDestructive: false
  });
  if (!ok) return;
  await runServiceAction(u, 'restart');
}

async function confirmReloadService(u: SystemdUnit) {
  const ok = await dialogStore.confirm({
    title: 'Reload Service',
    description: `Apakah Anda yakin ingin me-reload konfigurasi service "${u.unit}"?\n• Deskripsi: ${u.description || '-'}\n\nLayanan akan memuat ulang konfigurasinya tanpa terputus.`,
    confirmText: 'Reload Service',
    isDestructive: false
  });
  if (!ok) return;
  await runServiceAction(u, 'reload');
}

async function toggleEnableService(u: SystemdUnit) {
  const safe = safeUnitName(u.unit);
  if (!safe) return;
  const isCurrentlyEnabled = u.enabled === 'enabled';
  const nextAction = isCurrentlyEnabled ? 'disable' : 'enable';

  actionLoadingId.value = u.unit;
  try {
    const cmd = buildSystemdCommand(`systemctl ${nextAction} '${safe}'`, useSudo.value);
    await tauriBridge.sshExecCommand(props.sessionId, cmd);
    setFlashMessage(`Service "${u.unit}" berhasil di-${nextAction}`);
    await fetchData(true);
  } catch (err: any) {
    dialogStore.showToast(`Gagal ${nextAction} service: ${err.message || err}`, 'error');
  } finally {
    actionLoadingId.value = null;
  }
}

async function resetFailedService(u: SystemdUnit) {
  const safe = safeUnitName(u.unit);
  if (!safe) return;
  actionLoadingId.value = u.unit;
  try {
    const cmd = buildSystemdCommand(`systemctl reset-failed '${safe}'`, useSudo.value);
    await tauriBridge.sshExecCommand(props.sessionId, cmd);
    setFlashMessage(`Status failed pada "${u.unit}" berhasil di-reset`);
    await fetchData(true);
  } catch (err: any) {
    dialogStore.showToast(`Gagal reset-failed: ${err.message || err}`, 'error');
  } finally {
    actionLoadingId.value = null;
  }
}

async function runTimerAction(t: SystemdTimer, action: 'start' | 'stop' | 'restart') {
  const safe = safeUnitName(t.unit);
  if (!safe) return;
  actionLoadingId.value = t.unit;
  try {
    const cmd = buildSystemdCommand(`systemctl ${action} '${safe}'`, useSudo.value);
    await tauriBridge.sshExecCommand(props.sessionId, cmd);
    setFlashMessage(`Timer "${t.unit}" berhasil di-${action}`);
    await fetchData(true);
  } catch (err: any) {
    dialogStore.showToast(`Gagal ${action} timer: ${err.message || err}`, 'error');
  } finally {
    actionLoadingId.value = null;
  }
}

async function runSocketAction(s: SystemdSocket, action: 'start' | 'stop' | 'restart') {
  const safe = safeUnitName(s.unit);
  if (!safe) return;
  actionLoadingId.value = s.unit;
  try {
    const cmd = buildSystemdCommand(`systemctl ${action} '${safe}'`, useSudo.value);
    await tauriBridge.sshExecCommand(props.sessionId, cmd);
    setFlashMessage(`Socket "${s.unit}" berhasil di-${action}`);
    await fetchData(true);
  } catch (err: any) {
    dialogStore.showToast(`Gagal ${action} socket: ${err.message || err}`, 'error');
  } finally {
    actionLoadingId.value = null;
  }
}

// LOGS VIEWER
async function openLogs(u: SystemdUnit) {
  selectedUnitForStatus.value = null;
  selectedUnitForCat.value = null;
  selectedUnitForLogs.value = u;
  logContent.value = '';
  logFilter.value = '';
  await fetchLogs(u);
}

async function openTimerLogs(t: SystemdTimer) {
  const targetUnit = t.activates || t.unit;
  const dummyUnit: SystemdUnit = {
    unit: targetUnit,
    name: targetUnit.replace(/\.[^.]+$/, ''),
    load: 'loaded',
    active: 'active',
    sub: 'running',
    description: `Timer: ${t.unit}`
  };
  await openLogs(dummyUnit);
}

async function openSocketLogs(s: SystemdSocket) {
  const targetUnit = s.activates || s.unit;
  const dummyUnit: SystemdUnit = {
    unit: targetUnit,
    name: targetUnit.replace(/\.[^.]+$/, ''),
    load: 'loaded',
    active: 'active',
    sub: 'running',
    description: `Socket: ${s.unit}`
  };
  await openLogs(dummyUnit);
}

async function fetchLogs(u: SystemdUnit | null) {
  if (!u || !props.sessionId) return;
  isLogsLoading.value = true;
  try {
    const safe = safeUnitName(u.unit);
    const cmd = buildSystemdCommand(`journalctl -u '${safe}' -n ${logTailLines.value} --no-pager`, useSudo.value);
    const out = await tauriBridge.sshExecCommand(props.sessionId, cmd);
    logContent.value = out || 'Log kosong.';
    if (isLogAutoScroll.value) {
      await nextTick();
      if (logContainerRef.value) {
        logContainerRef.value.scrollTop = logContainerRef.value.scrollHeight;
      }
    }
  } catch (err: any) {
    logContent.value = `Gagal memuat log journalctl: ${err.message || err}`;
  } finally {
    isLogsLoading.value = false;
  }
}

function copyLogs() {
  if (!logContent.value) return;
  navigator.clipboard.writeText(logContent.value);
  dialogStore.showToast('Log journalctl berhasil disalin ke clipboard', 'success');
}

function analyzeLogsWithAI() {
  if (!selectedUnitForLogs.value || !logContent.value) return;
  const recentLogs = logContent.value.split('\n').slice(-40).join('\n');
  const prompt = `Tolong analisa log systemd service berikut:\nUnit: ${selectedUnitForLogs.value.unit} (${selectedUnitForLogs.value.description || ''})\n\nLog:\n\`\`\`\n${recentLogs}\n\`\`\`\nJelaskan masalahnya dan berikan langkah perbaikannya secara ringkas.`;
  aiAgentStore.sendPromptWithContext(prompt, props.sessionId);
}

// STATUS INSPECTOR
async function openStatus(u: SystemdUnit) {
  selectedUnitForLogs.value = null;
  selectedUnitForCat.value = null;
  selectedUnitForStatus.value = u;
  statusContent.value = '';
  await fetchStatus(u);
}

async function fetchStatus(u: SystemdUnit | null) {
  if (!u || !props.sessionId) return;
  isStatusLoading.value = true;
  try {
    const safe = safeUnitName(u.unit);
    const cmd = buildSystemdCommand(`systemctl status '${safe}' -l --no-pager`, useSudo.value);
    const out = await tauriBridge.sshExecCommand(props.sessionId, cmd);
    statusContent.value = out || 'Tidak ada output status.';
  } catch (err: any) {
    statusContent.value = `Gagal memuat status: ${err.message || err}`;
  } finally {
    isStatusLoading.value = false;
  }
}

function copyStatus() {
  if (!statusContent.value) return;
  navigator.clipboard.writeText(statusContent.value);
  dialogStore.showToast('Output status berhasil disalin ke clipboard', 'success');
}

function analyzeStatusWithAI() {
  if (!selectedUnitForStatus.value || !statusContent.value) return;
  const prompt = `Tolong analisa status systemd service berikut:\nUnit: ${selectedUnitForStatus.value.unit}\n\nStatus:\n\`\`\`\n${statusContent.value}\n\`\`\`\nJelaskan statusnya, apakah ada error, dan berikan solusinya jika perlu.`;
  aiAgentStore.sendPromptWithContext(prompt, props.sessionId);
}

// CAT INSPECTOR
const selectedUnitForCat = ref<SystemdUnit | null>(null);
const catContent = ref('');
const isCatLoading = ref(false);

async function openUnitCat(u: SystemdUnit) {
  selectedUnitForLogs.value = null;
  selectedUnitForStatus.value = null;
  selectedUnitForCat.value = u;
  catContent.value = '';
  await fetchCat(u);
}

async function fetchCat(u: SystemdUnit | null) {
  if (!u || !props.sessionId) return;
  isCatLoading.value = true;
  try {
    const safe = safeUnitName(u.unit);
    const cmd = buildSystemdCommand(`systemctl cat '${safe}'`, useSudo.value);
    const out = await tauriBridge.sshExecCommand(props.sessionId, cmd);
    catContent.value = out || 'Tidak ada definisi unit.';
  } catch (err: any) {
    catContent.value = `Gagal memuat definisi unit: ${err.message || err}`;
  } finally {
    isCatLoading.value = false;
  }
}

function copyCat() {
  if (!catContent.value) return;
  navigator.clipboard.writeText(catContent.value);
  dialogStore.showToast('Definisi unit berhasil disalin ke clipboard', 'success');
}

function analyzeCatWithAI() {
  if (!selectedUnitForCat.value || !catContent.value) return;
  const prompt = `Tolong bantu saya review dan konsultasi konfigurasi systemd unit file berikut:\nUnit: ${selectedUnitForCat.value.unit}\n\nUnit File:\n\`\`\`\n${catContent.value}\n\`\`\`\nJelaskan fungsinya dan beri saran jika ada konfigurasi yang kurang tepat atau bisa dioptimalkan.`;
  aiAgentStore.sendPromptWithContext(prompt, props.sessionId);
}

// LIVE TAIL TERMINAL
async function openLiveTailTerminal(u: SystemdUnit) {
  const safe = safeUnitName(u.unit);
  if (!safe) return;
  const cmd = buildSystemdCommand(`journalctl -fu '${safe}'`, useSudo.value);
  await tauriBridge.sshWrite(props.sessionId, `${cmd}\n`);
  emit('close');
}

function close() {
  emit('close');
}

watch(isAutoRefresh, (val) => {
  if (val) {
    pollingTimer = setInterval(() => {
      fetchData(true);
    }, 6000);
  } else {
    if (pollingTimer) {
      clearInterval(pollingTimer);
      pollingTimer = null;
    }
  }
});

onMounted(() => {
  fetchData();
});

onUnmounted(() => {
  if (pollingTimer) {
    clearInterval(pollingTimer);
    pollingTimer = null;
  }
});
</script>

<style scoped>
.animate-fade-in {
  animation: fadeIn 0.15s ease-out;
}
.animate-slide-up {
  animation: slideUp 0.15s ease-out;
}
@keyframes fadeIn {
  from { opacity: 0; transform: scale(0.98); }
  to { opacity: 1; transform: scale(1); }
}
@keyframes slideUp {
  from { opacity: 0; transform: translateY(10px); }
  to { opacity: 1; transform: translateY(0); }
}
</style>
