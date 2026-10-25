<template>
  <div
    v-if="isOpen || isStandaloneWindow"
    :class="[
      isStandaloneWindow
        ? 'h-screen w-screen flex flex-col bg-[#12151e] text-slate-200 overflow-hidden select-none box-border'
        : 'fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-2 sm:p-4 animate-fade-in'
    ]"
    @click.self="!isStandaloneWindow && $emit('close')"
  >
    <!-- Standalone Window Title Bar (Matches BOBA Main Window Bar exactly) -->
    <header
      v-if="isStandaloneWindow"
      data-tauri-drag-region="deep"
      class="h-9 bg-boba-950 border-b border-boba-800 flex items-center justify-between pl-3 pr-0 text-xs shrink-0 select-none cursor-default"
    >
      <div class="flex items-center space-x-2 flex-1 h-full cursor-default" data-tauri-drag-region>
        <img src="/logo-mark.svg" alt="BOBA" class="w-4 h-4 object-contain pointer-events-none" />
        <span class="font-bold text-slate-300 pointer-events-none">BOBA</span>
        <span class="text-slate-600 pointer-events-none">|</span>
        <div class="flex items-center space-x-1.5 pointer-events-none">
          <Icon icon="lucide:package-plus" class="w-3.5 h-3.5 text-emerald-400" />
          <span class="text-slate-200 font-semibold">Server Setup & App Installer</span>
        </div>
        <span class="text-slate-600 pointer-events-none">·</span>
        <span class="text-[11px] px-2 py-0.2 rounded-full bg-slate-800 text-slate-300 font-mono border border-slate-700 pointer-events-none">
          {{ hostTitle }}
        </span>
        <span
          v-if="osInfo.name"
          class="text-[11px] px-2 py-0.2 rounded-full bg-emerald-950/70 text-emerald-300 font-mono border border-emerald-700/50 pointer-events-none"
        >
          {{ osInfo.name }}
        </span>
      </div>

      <div data-tauri-drag-region="false" class="flex items-center space-x-2 h-full">
        <!-- Guide Toggle -->
        <button
          @click="showGuide = !showGuide"
          :class="[
            'px-2 py-0.5 rounded border text-[11px] transition flex items-center space-x-1',
            showGuide ? 'bg-emerald-950/60 border-emerald-500 text-emerald-300' : 'bg-[#1e2333] border-[#2e374d] text-slate-300 hover:text-white'
          ]"
          title="Buka panduan penggunaan"
        >
          <Icon icon="lucide:help-circle" class="w-3 h-3 text-emerald-400" />
          <span class="hidden sm:inline">Panduan</span>
        </button>

        <!-- Rescan All Button -->
        <button
          @click="detectEnvironment"
          :disabled="isDetecting"
          class="px-2 py-0.5 bg-[#1e2333] hover:bg-[#282f45] border border-[#2e374d] text-slate-300 rounded text-[11px] transition flex items-center space-x-1 disabled:opacity-50"
          title="Pindai ulang seluruh software"
        >
          <Icon icon="lucide:refresh-cw" :class="['w-3 h-3', isDetecting ? 'animate-spin text-emerald-400' : '']" />
          <span>Pindai Semua</span>
        </button>

        <!-- System Packages Upgrade Button -->
        <button
          @click="updateSystemPackages"
          :disabled="isDetecting || isInstallRunning"
          class="px-2 py-0.5 bg-[#1e2333] hover:bg-[#282f45] border border-[#2e374d] text-amber-300 rounded text-[11px] transition flex items-center space-x-1 disabled:opacity-40 disabled:cursor-not-allowed"
          title="Update repositori dan upgrade seluruh paket sistem (apt/dnf upgrade)"
        >
          <Icon icon="lucide:arrow-up-circle" class="w-3 h-3 text-amber-400" />
          <span class="hidden sm:inline">Update Sistem</span>
        </button>

        <span class="text-slate-700 h-4 w-px bg-boba-800 my-auto"></span>

        <!-- Window Controls matching main window -->
        <WindowControls />
      </div>
    </header>

    <!-- Running Lock Notification Banner -->
    <div
      v-if="isInstallRunning"
      class="bg-amber-950/80 border-b border-amber-500/50 px-4 py-2 flex flex-wrap items-center justify-between gap-2.5 text-xs text-amber-200 shrink-0 select-none animate-fade-in"
    >
      <div class="flex items-center space-x-2 min-w-0">
        <Icon icon="lucide:alert-circle" class="w-4 h-4 text-amber-400 shrink-0 animate-pulse" />
        <span class="font-bold text-amber-300">
          Proses Instalasi Sedang Berjalan ({{ runningProcessInfo.reason === 'system' ? 'Sistem APT/DPKG Sedang Digunakan' : `PID: ${runningProcessInfo.pid || 'Aktif'}` }})
        </span>
        <span class="text-amber-200/80 text-[11px] hidden md:inline">
          — Tombol instalasi & update dikunci sementara untuk mencegah konflik file lock di server.
        </span>
      </div>

      <div class="flex items-center space-x-2 shrink-0">
        <button
          @click="tailBackgroundLog"
          class="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-[11px] font-semibold transition flex items-center space-x-1 shadow-sm"
          title="Pantau log /tmp/boba-setup.log di terminal aktif"
        >
          <Icon icon="lucide:terminal" class="w-3.5 h-3.5" />
          <span>Pantau Log</span>
        </button>

        <button
          @click="checkRunningStatus(true)"
          class="px-2.5 py-1 bg-[#1e2536] hover:bg-[#283248] border border-[#2e374d] text-slate-300 rounded text-[11px] transition flex items-center space-x-1"
          title="Periksa apakah instalasi telah selesai"
        >
          <Icon icon="lucide:refresh-cw" class="w-3 h-3 text-slate-300" />
          <span>Cek Status</span>
        </button>

        <button
          @click="stopRunningInstall"
          class="px-2.5 py-1 bg-rose-950/80 hover:bg-rose-900 border border-rose-700/60 text-rose-200 rounded text-[11px] transition flex items-center space-x-1"
          title="Hentikan paksa proses instalasi di server jika macet"
        >
          <Icon icon="lucide:octagon-alert" class="w-3.5 h-3.5 text-rose-400" />
          <span>Hentikan Proses</span>
        </button>

        <button
          @click="forceUnlock"
          class="px-2 py-1 bg-[#1e2536] hover:bg-[#283248] border border-[#2e374d] text-amber-300 hover:text-amber-200 rounded text-[11px] transition flex items-center space-x-1"
          title="Buka paksa kunci jika proses sudah selesai atau mati di server"
        >
          <Icon icon="lucide:unlock" class="w-3.5 h-3.5" />
          <span>Buka Kunci</span>
        </button>
      </div>
    </div>

    <div
      :class="[
        isStandaloneWindow
          ? 'flex-1 flex flex-col overflow-hidden text-slate-200'
          : 'bg-[#12151e] border border-[#262c3d] rounded-xl shadow-2xl w-full max-w-6xl h-[94vh] sm:h-[88vh] flex flex-col overflow-hidden text-slate-200'
      ]"
      @click.stop
    >
      <!-- Modal Header (only shown if in modal mode) -->
      <div
        v-if="!isStandaloneWindow"
        class="min-h-[3.5rem] py-2 border-b border-[#23293a] px-4 sm:px-5 flex items-center justify-between bg-[#161a26] shrink-0 gap-3 select-none cursor-default"
      >
        <div class="flex items-center space-x-3 min-w-0">
          <div class="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/30 shrink-0">
            <Icon icon="lucide:package-plus" class="w-5 h-5" />
          </div>
          <div class="min-w-0">
            <div class="flex items-center space-x-2">
              <h2 class="font-bold text-sm tracking-wide text-white truncate">Server Setup & App Installer</h2>
              <span class="text-[11px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono border border-slate-700 truncate max-w-[170px]">
                {{ hostTitle }}
              </span>
              <span
                v-if="osInfo.name"
                class="text-[11px] px-2 py-0.5 rounded-full bg-emerald-950/70 text-emerald-300 font-mono border border-emerald-700/50 flex items-center space-x-1"
                :title="`Family: ${osInfo.family}`"
              >
                <Icon icon="lucide:cpu" class="w-3 h-3 text-emerald-400" />
                <span>{{ osInfo.name }}</span>
              </span>
            </div>
            <p class="text-[11px] text-slate-400 truncate hidden sm:block">
              Bootstrapper paket awal, stack runtime, database, web server, dan cheatsheet konfigurasi otomatis.
            </p>
          </div>
        </div>

        <!-- Header Actions (Modal Mode) -->
        <div class="flex items-center space-x-2 shrink-0">
          <!-- Guide Toggle -->
          <button
            @click="showGuide = !showGuide"
            :class="[
              'px-2.5 py-1.5 rounded-lg border text-xs transition flex items-center space-x-1.5',
              showGuide ? 'bg-emerald-950/60 border-emerald-500 text-emerald-300' : 'bg-[#1e2333] border-[#2e374d] text-slate-300 hover:text-white'
            ]"
            title="Buka panduan penggunaan"
          >
            <Icon icon="lucide:help-circle" class="w-4 h-4 text-emerald-400" />
            <span class="hidden sm:inline font-medium">Panduan</span>
          </button>

          <!-- Rescan All Button -->
          <button
            @click="detectEnvironment"
            :disabled="isDetecting"
            class="px-2.5 py-1.5 bg-[#1e2333] hover:bg-[#282f45] border border-[#2e374d] text-slate-300 rounded-lg text-xs transition flex items-center space-x-1.5 disabled:opacity-50"
            title="Pindai ulang seluruh software"
          >
            <Icon icon="lucide:refresh-cw" :class="['w-3.5 h-3.5', isDetecting ? 'animate-spin text-emerald-400' : '']" />
            <span class="hidden sm:inline">Pindai Semua</span>
          </button>

          <!-- System Packages Upgrade Button -->
          <button
            @click="updateSystemPackages"
            :disabled="isDetecting || isInstallRunning"
            class="px-2.5 py-1.5 bg-[#1e2333] hover:bg-[#282f45] border border-[#2e374d] text-amber-300 rounded-lg text-xs transition flex items-center space-x-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
            title="Update repositori dan upgrade seluruh paket sistem (apt/dnf upgrade)"
          >
            <Icon icon="lucide:arrow-up-circle" class="w-3.5 h-3.5 text-amber-400" />
            <span class="hidden sm:inline">Update Sistem</span>
          </button>

          <button
            @click="$emit('close')"
            class="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-100 hover:bg-[#23293a] transition"
          >
            <Icon icon="lucide:x" class="w-4 h-4" />
          </button>
        </div>
      </div>

      <!-- Running Lock Notification Banner (Modal Mode) -->
      <div
        v-if="!isStandaloneWindow && isInstallRunning"
        class="bg-amber-950/80 border-b border-amber-500/50 px-4 py-2 flex flex-wrap items-center justify-between gap-2.5 text-xs text-amber-200 shrink-0 select-none animate-fade-in"
      >
        <div class="flex items-center space-x-2 min-w-0">
          <Icon icon="lucide:alert-circle" class="w-4 h-4 text-amber-400 shrink-0 animate-pulse" />
          <span class="font-bold text-amber-300">
            Proses Instalasi Sedang Berjalan ({{ runningProcessInfo.reason === 'system' ? 'Sistem APT/DPKG Sedang Digunakan' : `PID: ${runningProcessInfo.pid || 'Aktif'}` }})
          </span>
          <span class="text-amber-200/80 text-[11px] hidden md:inline">
            — Tombol instalasi & update dikunci sementara.
          </span>
        </div>

        <div class="flex items-center space-x-2 shrink-0">
          <button
            @click="tailBackgroundLog"
            class="px-2 py-0.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-[11px] font-semibold transition flex items-center space-x-1"
          >
            <Icon icon="lucide:terminal" class="w-3.5 h-3.5" />
            <span>Pantau Log</span>
          </button>
          <button
            @click="checkRunningStatus(true)"
            class="px-2 py-0.5 bg-[#1e2333] hover:bg-[#283248] border border-[#2e374d] text-slate-300 rounded text-[11px] transition"
          >
            Cek Status
          </button>
          <button
            @click="stopRunningInstall"
            class="px-2 py-0.5 bg-rose-950/80 hover:bg-rose-900 border border-rose-700/60 text-rose-200 rounded text-[11px] transition"
          >
            <Icon icon="lucide:octagon-alert" class="w-3.5 h-3.5 text-rose-400" />
            <span>Hentikan Proses</span>
          </button>
          <button
            @click="forceUnlock"
            class="px-2 py-0.5 bg-[#1e2333] hover:bg-[#283248] border border-[#2e374d] text-amber-300 rounded text-[11px] transition flex items-center space-x-1"
            title="Buka paksa kunci jika proses sudah selesai atau mati di server"
          >
            <Icon icon="lucide:unlock" class="w-3.5 h-3.5" />
            <span>Buka Kunci</span>
          </button>
        </div>
      </div>

      <!-- Collapsible Guide Banner -->
      <div v-if="showGuide" class="p-3.5 bg-emerald-950/30 border-b border-emerald-900/50 text-xs text-slate-300 space-y-1.5 shrink-0">
        <div class="font-semibold text-emerald-400 flex items-center space-x-1.5">
          <Icon icon="lucide:sparkles" class="w-4 h-4" />
          <span>Cara Menggunakan Server Setup & App Installer:</span>
        </div>
        <ul class="list-disc list-inside space-y-1 text-slate-400 pl-1">
          <li>Pilih software yang ingin diinstall sesuai kebutuhan atau cari melalui kolom pencarian.</li>
          <li>Aplikasi mendeteksi distro Linux target (Ubuntu/Debian, CentOS/RHEL, Alpine, Arch) secara otomatis.</li>
          <li>Proses instalasi berjalan sekuensial satu-per-satu di terminal aktif agar CPU & memory server tidak terbebani.</li>
          <li>Lihat tab <b>Configs & Cheatsheet</b> untuk melihat lokasi file konfigurasi penting, template reverse proxy, dan perintah umum tanpa perlu browsing internet.</li>
        </ul>
      </div>

      <!-- Tabs Navigation Bar -->
      <div class="bg-[#141824] border-b border-[#23293a] px-4 py-2 flex items-center justify-between gap-2 shrink-0">
        <div class="flex items-center space-x-2 text-xs text-slate-400">
          <Icon icon="lucide:layers" class="w-4 h-4 text-emerald-400" />
          <span class="font-medium text-slate-300">Pilih Software & Tooling:</span>
        </div>

        <!-- View Navigation Tabs -->
        <div class="flex items-center space-x-1 bg-[#0e111a] p-1 rounded-lg border border-[#23293a]">
          <button
            @click="activeTab = 'catalog'"
            :class="[
              'px-3 py-1 rounded-md text-xs font-medium transition flex items-center space-x-1.5',
              activeTab === 'catalog' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
            ]"
          >
            <Icon icon="lucide:layout-grid" class="w-3.5 h-3.5" />
            <span>Pilih Paket ({{ selectedPackageIds.length }})</span>
          </button>
          <button
            @click="activeTab = 'cheatsheet'"
            :class="[
              'px-3 py-1 rounded-md text-xs font-medium transition flex items-center space-x-1.5',
              activeTab === 'cheatsheet' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
            ]"
          >
            <Icon icon="lucide:book-open" class="w-3.5 h-3.5" />
            <span>Configs & Cheatsheet</span>
          </button>
          <button
            @click="activeTab = 'script'"
            :class="[
              'px-3 py-1 rounded-md text-xs font-medium transition flex items-center space-x-1.5',
              activeTab === 'script' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-400 hover:text-slate-200'
            ]"
          >
            <Icon icon="lucide:file-code-2" class="w-3.5 h-3.5" />
            <span>Preview Script</span>
          </button>
        </div>
      </div>

      <!-- Main Body Content Area -->
      <div class="flex-1 overflow-hidden flex flex-col">
        <!-- ==================== TAB 1: SOFTWARE CATALOG ==================== -->
        <div v-if="activeTab === 'catalog'" class="flex-1 flex flex-col overflow-hidden">
          <!-- Filters & Search Toolbar -->
          <div class="px-4 py-2 border-b border-[#23293a] bg-[#161a26]/70 flex flex-wrap items-center justify-between gap-2 shrink-0">
            <!-- Category Pills -->
            <div class="flex items-center space-x-1 overflow-x-auto no-scrollbar py-0.5">
              <button
                v-for="cat in CATEGORIES"
                :key="cat.id"
                @click="activeCategory = cat.id"
                :class="[
                  'px-2.5 py-1 rounded-md text-xs transition shrink-0',
                  activeCategory === cat.id ? 'bg-[#252f44] text-emerald-400 font-semibold border border-emerald-600/40' : 'text-slate-400 hover:text-slate-200'
                ]"
              >
                {{ cat.label }}
              </button>
            </div>

            <!-- Search and Select/Clear Actions -->
            <div class="flex items-center space-x-2">
              <!-- Status Filter Pills -->
              <div class="flex items-center bg-[#10141f] p-0.5 rounded-md border border-[#23293a] text-[11px]">
                <button
                  @click="statusFilter = 'all'"
                  :class="[
                    'px-2 py-0.5 rounded transition',
                    statusFilter === 'all' ? 'bg-[#1f2738] text-white font-medium' : 'text-slate-400 hover:text-slate-200'
                  ]"
                >
                  Semua
                </button>
                <button
                  @click="statusFilter = 'uninstalled'"
                  :class="[
                    'px-2 py-0.5 rounded transition',
                    statusFilter === 'uninstalled' ? 'bg-[#1f2738] text-amber-400 font-medium' : 'text-slate-400 hover:text-slate-200'
                  ]"
                >
                  Belum Ada
                </button>
                <button
                  @click="statusFilter = 'installed'"
                  :class="[
                    'px-2 py-0.5 rounded transition',
                    statusFilter === 'installed' ? 'bg-[#1f2738] text-emerald-400 font-medium' : 'text-slate-400 hover:text-slate-200'
                  ]"
                >
                  Terpasang
                </button>
              </div>

              <div class="relative">
                <Icon icon="lucide:search" class="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  v-model="searchQuery"
                  type="text"
                  placeholder="Cari software..."
                  class="w-36 sm:w-44 bg-[#10141f] border border-[#2a3248] rounded-md pl-8 pr-2.5 py-1 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <button
                @click="selectOnlyMissing"
                :disabled="isDetecting || isInstallRunning"
                class="px-2 py-1 bg-[#1a2030] hover:bg-[#252f44] text-[11px] font-medium text-emerald-400 rounded border border-[#283248] transition disabled:opacity-40 disabled:cursor-not-allowed"
                title="Pilih seluruh paket yang saat ini belum terinstall"
              >
                Pilih Belum Ada
              </button>
              <button
                @click="selectAllFiltered"
                :disabled="isDetecting || isInstallRunning"
                class="px-2 py-1 bg-[#1a2030] hover:bg-[#252f44] text-[11px] font-medium text-slate-300 rounded border border-[#283248] transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Pilih Semua
              </button>
              <button
                @click="clearAllSelected"
                :disabled="isDetecting || isInstallRunning"
                class="px-2 py-1 bg-[#1a2030] hover:bg-[#252f44] text-[11px] font-medium text-slate-400 hover:text-rose-300 rounded border border-[#283248] transition disabled:opacity-40 disabled:cursor-not-allowed"
              >
                Reset
              </button>
            </div>
          </div>

          <!-- Software Cards Grid -->
          <div class="flex-1 overflow-y-auto p-4 space-y-4">
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              <div
                v-for="item in filteredSoftwareList"
                :key="item.id"
                @click="togglePackage(item.id)"
                :class="[
                  'p-3.5 rounded-xl border transition flex flex-col justify-between relative group select-none',
                  isDetecting || isInstallRunning ? 'cursor-not-allowed opacity-80' : 'cursor-pointer',
                  selectedPackageIds.includes(item.id)
                    ? 'bg-emerald-950/20 border-emerald-600/70 shadow-lg shadow-emerald-950/30'
                    : 'bg-[#151925] border-[#242b3d] hover:border-[#38435f] hover:bg-[#181d2c]'
                ]"
              >
                <div>
                  <div class="flex items-start justify-between gap-2 mb-2">
                    <div class="flex items-center space-x-2.5 min-w-0">
                      <div
                        :class="[
                          'w-8 h-8 rounded-lg flex items-center justify-center shrink-0 border',
                          selectedPackageIds.includes(item.id)
                            ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                            : 'bg-[#1e2436] text-slate-300 border-[#2b334a]'
                        ]"
                      >
                        <Icon :icon="item.icon" class="w-4 h-4" />
                      </div>
                      <div class="min-w-0">
                        <div class="font-semibold text-xs text-white truncate flex items-center space-x-1.5">
                          <span>{{ item.name }}</span>
                          <span
                            v-if="detectionResults[item.id]?.installed"
                            class="text-[9px] px-1.5 py-0.2 rounded bg-emerald-950 text-emerald-300 border border-emerald-600/50 font-mono shrink-0"
                          >
                            {{ formatBadgeVersion(detectionResults[item.id]?.version) }}
                          </span>
                        </div>
                        <span class="text-[10px] text-slate-500 font-mono uppercase">{{ item.category }}</span>
                      </div>
                    </div>

                    <!-- Custom Checkbox Indicator -->
                    <div
                      :class="[
                        'w-4 h-4 rounded flex items-center justify-center border transition shrink-0',
                        selectedPackageIds.includes(item.id)
                          ? 'bg-emerald-600 border-emerald-500 text-white'
                          : 'border-slate-600 group-hover:border-slate-500 bg-[#0e121a]'
                      ]"
                    >
                      <Icon v-if="selectedPackageIds.includes(item.id)" icon="lucide:check" class="w-3 h-3 stroke-[3]" />
                    </div>
                  </div>

                  <p class="text-[11px] text-slate-400 leading-relaxed line-clamp-2 mb-3">
                    {{ item.description }}
                  </p>
                </div>

                <!-- Footer: Status badge & Actions -->
                <div class="pt-2 border-t border-[#202636] flex items-center justify-between text-[11px]">
                  <!-- Installation status -->
                  <div class="flex items-center space-x-1.5 min-w-0">
                    <template v-if="isDetecting || checkingToolId === item.id">
                      <Icon icon="lucide:loader-2" class="w-3 h-3 animate-spin text-slate-500" />
                      <span class="text-slate-500 text-[10px]">Memeriksa...</span>
                    </template>
                    <template v-else-if="detectionResults[item.id]?.installed">
                      <span class="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0"></span>
                      <span class="text-emerald-400 font-mono text-[10px] truncate max-w-[110px]" :title="detectionResults[item.id]?.version">
                        {{ formatBadgeVersion(detectionResults[item.id]?.version) }}
                      </span>
                    </template>
                    <template v-else>
                      <span class="w-1.5 h-1.5 rounded-full bg-slate-600 shrink-0"></span>
                      <span class="text-slate-500 text-[10px]">Belum Ada</span>
                    </template>

                    <!-- Per-tool recheck button -->
                    <button
                      @click.stop="recheckSingleTool(item)"
                      :disabled="checkingToolId === item.id || isDetecting"
                      class="p-0.5 text-slate-400 hover:text-emerald-400 rounded hover:bg-[#1e2536] transition disabled:opacity-30"
                      title="Periksa ulang status tool ini saja"
                    >
                      <Icon
                        icon="lucide:refresh-cw"
                        :class="['w-3 h-3', checkingToolId === item.id ? 'animate-spin text-emerald-400' : '']"
                      />
                    </button>
                  </div>

                  <!-- Quick actions -->
                  <div class="flex items-center space-x-1 shrink-0">
                    <!-- Update button if already installed -->
                    <button
                      v-if="detectionResults[item.id]?.installed"
                      @click.stop="updateSinglePackage(item)"
                      :disabled="isDetecting || isInstallRunning"
                      class="text-[10px] text-amber-400 hover:text-amber-300 font-medium flex items-center space-x-1 px-1.5 py-0.5 rounded hover:bg-[#1e2536] transition disabled:opacity-40 disabled:cursor-not-allowed"
                      title="Update versi terbaru paket ini di server"
                    >
                      <Icon icon="lucide:arrow-up-circle" class="w-3 h-3 text-amber-400" />
                      <span>Update</span>
                    </button>

                    <!-- Uninstall button if already installed -->
                    <button
                      v-if="detectionResults[item.id]?.installed"
                      @click.stop="uninstallSinglePackage(item)"
                      :disabled="isDetecting || isInstallRunning"
                      class="text-[10px] text-rose-400 hover:text-rose-300 font-medium flex items-center space-x-1 px-1.5 py-0.5 rounded hover:bg-[#1e2536] transition disabled:opacity-40 disabled:cursor-not-allowed"
                      title="Hapus / Uninstall software ini dari server"
                    >
                      <Icon icon="lucide:trash-2" class="w-3 h-3 text-rose-400" />
                      <span>Hapus</span>
                    </button>

                    <!-- Quick config preview button -->
                    <button
                      @click.stop="openCheatsheetFor(item.id)"
                      class="text-[10px] text-slate-400 hover:text-emerald-300 font-medium flex items-center space-x-1 px-1.5 py-0.5 rounded hover:bg-[#1e2536] transition"
                      title="Lihat konfigurasi & panduan"
                    >
                      <Icon icon="lucide:file-text" class="w-3 h-3" />
                      <span>Config</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <div v-if="filteredSoftwareList.length === 0" class="text-center py-16 text-slate-500 text-xs">
              <Icon icon="lucide:search-x" class="w-8 h-8 mx-auto mb-2 opacity-50" />
              <span>Tidak ada software yang cocok dengan pencarian "{{ searchQuery }}".</span>
            </div>
          </div>
        </div>

        <!-- ==================== TAB 2: CONFIGS & CHEATSHEET ==================== -->
        <div v-else-if="activeTab === 'cheatsheet'" class="flex-1 flex overflow-hidden">
          <!-- Software list sidebar -->
          <div class="w-56 sm:w-64 border-r border-[#23293a] bg-[#11141e] flex flex-col shrink-0">
            <div class="p-2 border-b border-[#23293a]">
              <span class="text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-2">Daftar Software</span>
            </div>
            <div class="flex-1 overflow-y-auto p-1.5 space-y-0.5">
              <button
                v-for="sw in SOFTWARE_LIST"
                :key="sw.id"
                @click="activeCheatsheetId = sw.id"
                :class="[
                  'w-full px-2.5 py-1.5 rounded-lg text-left text-xs transition flex items-center justify-between',
                  activeCheatsheetId === sw.id ? 'bg-emerald-950/60 border border-emerald-600/50 text-emerald-300 font-semibold' : 'text-slate-400 hover:text-slate-200 hover:bg-[#1a2030]'
                ]"
              >
                <div class="flex items-center space-x-2 truncate">
                  <Icon :icon="sw.icon" class="w-3.5 h-3.5 shrink-0" />
                  <span class="truncate">{{ sw.name }}</span>
                </div>
                <span v-if="detectionResults[sw.id]?.installed" class="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" title="Terpasang"></span>
              </button>
            </div>
          </div>

          <!-- Active Cheatsheet Details Panel -->
          <div class="flex-1 overflow-y-auto p-5 space-y-5 bg-[#141824]" v-if="currentCheatsheetItem">
            <!-- Header of active item -->
            <div class="flex items-start justify-between pb-4 border-b border-[#242b3d]">
              <div class="flex items-center space-x-3">
                <div class="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center border border-emerald-500/30">
                  <Icon :icon="currentCheatsheetItem.icon" class="w-5 h-5" />
                </div>
                <div>
                  <h3 class="font-bold text-base text-white flex items-center space-x-2">
                    <span>{{ currentCheatsheetItem.name }}</span>
                    <span v-if="currentCheatsheetItem.defaultPort" class="text-xs px-2 py-0.5 bg-[#1e2538] border border-[#2d3752] text-amber-400 font-mono rounded">
                      Port: {{ currentCheatsheetItem.defaultPort }}
                    </span>
                  </h3>
                  <p class="text-xs text-slate-400 mt-0.5">{{ currentCheatsheetItem.description }}</p>
                </div>
              </div>

              <!-- Actions -->
              <div class="flex items-center space-x-2">
                <button
                  v-if="detectionResults[currentCheatsheetItem.id]?.installed"
                  @click="updateSinglePackage(currentCheatsheetItem)"
                  :disabled="isDetecting || isInstallRunning"
                  class="px-3 py-1.5 rounded-lg text-xs font-medium bg-[#1e2538] hover:bg-[#28324a] text-amber-300 border border-amber-600/40 transition flex items-center space-x-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
                  title="Jalankan update versi terbaru untuk paket ini di terminal"
                >
                  <Icon icon="lucide:arrow-up-circle" class="w-3.5 h-3.5 text-amber-400" />
                  <span>Update Versi Terbaru</span>
                </button>

                <!-- Uninstall tool in cheatsheet view -->
                <button
                  v-if="detectionResults[currentCheatsheetItem.id]?.installed"
                  @click="uninstallSinglePackage(currentCheatsheetItem)"
                  :disabled="isDetecting || isInstallRunning"
                  class="px-3 py-1.5 rounded-lg text-xs font-medium bg-rose-950/40 hover:bg-rose-900/50 text-rose-300 border border-rose-600/40 transition flex items-center space-x-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
                  title="Hapus / Uninstall software ini dari server"
                >
                  <Icon icon="lucide:trash-2" class="w-3.5 h-3.5 text-rose-400" />
                  <span>Hapus Tool</span>
                </button>

                <!-- Recheck Single Tool -->
                <button
                  @click="recheckSingleTool(currentCheatsheetItem)"
                  :disabled="checkingToolId === currentCheatsheetItem.id || isDetecting || isInstallRunning"
                  class="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-[#1e2538] hover:bg-[#28324a] text-slate-300 hover:text-emerald-300 border border-[#2d3752] transition flex items-center space-x-1.5 disabled:opacity-40"
                  title="Periksa ulang status tool ini"
                >
                  <Icon icon="lucide:refresh-cw" :class="['w-3.5 h-3.5', checkingToolId === currentCheatsheetItem.id ? 'animate-spin text-emerald-400' : '']" />
                  <span>Cek Ulang</span>
                </button>

                <!-- Action to add to install queue -->
                <button
                  @click="togglePackage(currentCheatsheetItem.id)"
                  :disabled="isDetecting || isInstallRunning"
                  :class="[
                    'px-3 py-1.5 rounded-lg text-xs font-medium transition flex items-center space-x-1.5 border disabled:opacity-40 disabled:cursor-not-allowed',
                    selectedPackageIds.includes(currentCheatsheetItem.id)
                      ? 'bg-rose-950/60 border-rose-600/50 text-rose-300 hover:bg-rose-900/60'
                      : 'bg-emerald-600 hover:bg-emerald-500 text-white border-transparent'
                  ]"
                >
                  <Icon :icon="selectedPackageIds.includes(currentCheatsheetItem.id) ? 'lucide:trash-2' : 'lucide:plus'" class="w-3.5 h-3.5" />
                  <span>{{ selectedPackageIds.includes(currentCheatsheetItem.id) ? 'Batalkan Pilihan' : 'Pilih untuk Install' }}</span>
                </button>
              </div>
            </div>

            <!-- Architecture Notes -->
            <div class="p-3 bg-[#181e2d] border border-[#263148] rounded-xl text-xs text-slate-300 leading-relaxed">
              <span class="font-semibold text-emerald-400 block mb-1">Catatan Arsitektur & Setup:</span>
              {{ currentCheatsheetItem.cheatsheet.summary }}
            </div>

            <!-- Config File Locations -->
            <div v-if="currentCheatsheetItem.cheatsheet.configFiles.length > 0" class="space-y-2">
              <h4 class="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center space-x-1.5">
                <Icon icon="lucide:folder-cog" class="w-3.5 h-3.5 text-emerald-400" />
                <span>Lokasi File Konfigurasi</span>
              </h4>
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div
                  v-for="(cfg, idx) in currentCheatsheetItem.cheatsheet.configFiles"
                  :key="idx"
                  class="p-2.5 bg-[#121622] border border-[#202738] rounded-lg flex items-center justify-between group"
                >
                  <div class="min-w-0 pr-2">
                    <span class="text-[10px] text-slate-500 uppercase block font-semibold">{{ cfg.label }}</span>
                    <span class="text-xs font-mono text-slate-300 truncate block">{{ cfg.path }}</span>
                  </div>
                  <button
                    @click="copyText(cfg.path, `Path ${cfg.label} disalin`)"
                    class="p-1 text-slate-400 hover:text-emerald-400 rounded hover:bg-[#1c2333] transition shrink-0"
                    title="Salin Path"
                  >
                    <Icon icon="lucide:copy" class="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>

            <!-- Common Terminal Commands -->
            <div v-if="currentCheatsheetItem.cheatsheet.commonCommands.length > 0" class="space-y-2">
              <h4 class="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center space-x-1.5">
                <Icon icon="lucide:terminal" class="w-3.5 h-3.5 text-emerald-400" />
                <span>Perintah Umum & Maintenance</span>
              </h4>
              <div class="space-y-1.5">
                <div
                  v-for="(cmd, idx) in currentCheatsheetItem.cheatsheet.commonCommands"
                  :key="idx"
                  class="p-2 bg-[#10131c] border border-[#1e2436] rounded-lg flex items-center justify-between gap-3 text-xs"
                >
                  <div class="min-w-0 flex items-center space-x-2">
                    <span class="text-slate-400 text-[11px] shrink-0 font-medium w-28">{{ cmd.label }}:</span>
                    <code class="text-emerald-300 font-mono text-xs truncate bg-[#171d2b] px-2 py-0.5 rounded border border-[#222a3d]">
                      {{ cmd.cmd }}
                    </code>
                  </div>
                  <div class="flex items-center space-x-1 shrink-0">
                    <button
                      @click="copyText(cmd.cmd, 'Command disalin')"
                      class="px-2 py-1 bg-[#181f30] hover:bg-[#222b42] text-slate-300 rounded text-[11px] font-medium transition flex items-center space-x-1"
                    >
                      <Icon icon="lucide:copy" class="w-3 h-3" />
                      <span>Salin</span>
                    </button>
                    <button
                      @click="sendSingleCommandToTerminal(cmd.cmd)"
                      class="px-2 py-1 bg-emerald-950/80 hover:bg-emerald-900 border border-emerald-700/60 text-emerald-300 rounded text-[11px] font-medium transition flex items-center space-x-1"
                      title="Kirim dan jalankan langsung di tab terminal aktif"
                    >
                      <Icon icon="lucide:play" class="w-3 h-3" />
                      <span>Jalankan</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>

            <!-- Sample Config Code Block -->
            <div v-if="currentCheatsheetItem.cheatsheet.sampleConfig" class="space-y-2">
              <div class="flex items-center justify-between">
                <h4 class="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center space-x-1.5">
                  <Icon icon="lucide:code" class="w-3.5 h-3.5 text-emerald-400" />
                  <span>{{ currentCheatsheetItem.cheatsheet.sampleConfig.title }}</span>
                </h4>
                <button
                  @click="copyText(currentCheatsheetItem.cheatsheet.sampleConfig.code, 'Template config disalin')"
                  class="text-[11px] text-emerald-400 hover:text-emerald-300 flex items-center space-x-1"
                >
                  <Icon icon="lucide:copy" class="w-3 h-3" />
                  <span>Salin Konfigurasi</span>
                </button>
              </div>
              <div class="relative bg-[#0d1017] border border-[#22293a] rounded-xl p-3 font-mono text-xs text-slate-200 overflow-x-auto">
                <div class="text-[10px] text-slate-500 pb-2 mb-2 border-b border-[#1c2230]">
                  {{ currentCheatsheetItem.cheatsheet.sampleConfig.filename }}
                </div>
                <pre class="leading-relaxed">{{ currentCheatsheetItem.cheatsheet.sampleConfig.code }}</pre>
              </div>
            </div>
          </div>
        </div>

        <!-- ==================== TAB 3: SCRIPT PREVIEW ==================== -->
        <div v-else-if="activeTab === 'script'" class="flex-1 flex flex-col overflow-hidden p-4 bg-[#11141e]">
          <div class="flex items-center justify-between pb-3 border-b border-[#23293a] mb-3">
            <div>
              <h3 class="font-bold text-xs text-white">Pratinjau Bash Script Instalasi</h3>
              <p class="text-[11px] text-slate-400">
                Script ini akan dieksekusi langkah-demi-langkah dengan status penanda progress live.
              </p>
            </div>
            <button
              @click="copyText(generatedBashScript, 'Script instalasi disalin')"
              class="px-3 py-1.5 bg-[#1e2538] hover:bg-[#28324a] text-slate-200 border border-[#2b354e] rounded-lg text-xs font-medium transition flex items-center space-x-1.5"
            >
              <Icon icon="lucide:copy" class="w-3.5 h-3.5 text-emerald-400" />
              <span>Salin Seluruh Script</span>
            </button>
          </div>

          <div class="flex-1 bg-[#0a0d14] border border-[#1e2538] rounded-xl p-3 overflow-y-auto font-mono text-xs text-slate-300">
            <pre class="leading-relaxed">{{ generatedBashScript }}</pre>
          </div>
        </div>
      </div>

      <!-- Footer Bar with Execute Button -->
      <div class="min-h-[3.75rem] py-2 border-t border-[#23293a] px-4 sm:px-5 bg-[#161a26] flex flex-wrap items-center justify-between gap-3 shrink-0">
        <!-- Status & Update Repo Checkbox & Background Mode Checkbox -->
        <div class="flex items-center space-x-3.5 flex-wrap gap-y-1">
          <div class="flex items-center space-x-1.5">
            <span class="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
            <span class="text-xs font-semibold text-white">
              {{ selectedPackageIds.length }} Paket Dipilih
            </span>
          </div>

          <label
            v-if="!isSelectedUserSpaceOnly"
            class="flex items-center space-x-1.5 text-xs text-slate-300 cursor-pointer select-none"
          >
            <input
              type="checkbox"
              v-model="updateRepoBeforeInstall"
              :disabled="isInstallRunning"
              class="rounded bg-[#12151e] border-slate-600 text-emerald-500 focus:ring-0 cursor-pointer disabled:opacity-40"
            />
            <span>Update Repo (apt update)</span>
          </label>
          <span
            v-else-if="selectedPackageIds.length > 0"
            class="text-[11px] text-emerald-400 bg-emerald-950/60 border border-emerald-800/50 px-2 py-0.5 rounded flex items-center space-x-1"
            title="Paket ini dipasang di direktori home user (~/.deno, ~/.bun, ~/.local) dan tidak membutuhkan akses root atau sudo"
          >
            <Icon icon="lucide:shield-check" class="w-3.5 h-3.5 text-emerald-400" />
            <span>Tanpa Akses Root (User-space)</span>
          </span>

          <label class="flex items-center space-x-1.5 text-xs text-slate-300 cursor-pointer select-none" title="Menggunakan nohup di server agar instalasi tetap berjalan sampai selesai meskipun tab SSH atau window ditutup">
            <input
              type="checkbox"
              v-model="runInBackground"
              :disabled="isInstallRunning"
              class="rounded bg-[#12151e] border-slate-600 text-emerald-500 focus:ring-0 cursor-pointer disabled:opacity-40"
            />
            <span :class="runInBackground ? 'text-emerald-400 font-medium' : 'text-slate-400'">
              Background Mode (Anti-Putus jika SSH ditutup)
            </span>
          </label>
        </div>

        <!-- Action Buttons -->
        <div class="flex items-center space-x-2">
          <!-- Scanning or Running notice -->
          <span v-if="isDetecting" class="text-xs text-amber-400 flex items-center space-x-1.5 font-medium mr-2">
            <Icon icon="lucide:loader-2" class="w-3.5 h-3.5 animate-spin text-amber-400" />
            <span>Memeriksa server...</span>
          </span>
          <span v-else-if="isInstallRunning" class="text-xs text-amber-400 flex items-center space-x-1.5 font-medium mr-2">
            <Icon icon="lucide:loader-2" class="w-3.5 h-3.5 animate-spin text-amber-400" />
            <span>Instalasi aktif...</span>
          </span>

          <!-- Quick Execution Terminal or Tail Log Button -->
          <button
            v-if="executionStreamId || isInstallRunning"
            @click="openActiveExecutionModal"
            class="px-2.5 py-1.5 bg-amber-950/60 hover:bg-amber-900/60 border border-amber-600/50 text-amber-300 rounded-lg text-xs font-medium transition flex items-center space-x-1.5"
            title="Buka kembali tampilan proses terminal langsung"
          >
            <Icon icon="lucide:terminal" class="w-3.5 h-3.5 text-amber-400" />
            <span>Lihat Proses Aktif</span>
          </button>
          <button
            v-else
            @click="tailBackgroundLog"
            class="px-2.5 py-1.5 bg-[#1a2030] hover:bg-[#252f44] border border-[#283248] text-slate-300 hover:text-emerald-300 rounded-lg text-xs font-medium transition flex items-center space-x-1"
            title="Pantau file log /tmp/boba-setup.log di terminal SSH aktif"
          >
            <Icon icon="lucide:terminal" class="w-3.5 h-3.5 text-emerald-400" />
            <span>Pantau Log</span>
          </button>

          <button
            @click="copyText(generatedBashScript, 'Script disalin ke clipboard')"
            :disabled="isDetecting || isInstallRunning || selectedPackageIds.length === 0"
            class="px-3.5 py-1.5 bg-[#1e2436] hover:bg-[#29324a] border border-[#2e374d] text-slate-300 rounded-lg text-xs font-medium transition disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Salin Script
          </button>

          <button
            @click="executeInstallation"
            :disabled="isDetecting || isInstallRunning || selectedPackageIds.length === 0"
            class="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold transition flex items-center space-x-2 shadow-lg shadow-emerald-950/50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <Icon v-if="isInstallRunning" icon="lucide:loader-2" class="w-3.5 h-3.5 animate-spin" />
            <Icon v-else icon="lucide:play" class="w-3.5 h-3.5 fill-current" />
            <span>{{ isInstallRunning ? 'Proses Sedang Berjalan...' : `Mulai Instalasi (${selectedPackageIds.length})` }}</span>
          </button>
        </div>
      </div>
    </div>

    <!-- ==================== DEDICATED EXECUTION MODAL (ISOLATED TERMINAL) ==================== -->
    <div
      v-if="isExecutionModalOpen"
      class="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/85 backdrop-blur-md"
    >
      <div
        class="w-full max-w-4xl h-[82vh] flex flex-col bg-[#0b0e17] border border-[#232a3d] rounded-2xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150"
      >
        <!-- Header -->
        <div class="px-5 py-3.5 bg-[#121624] border-b border-[#1f2638] flex items-center justify-between shrink-0">
          <div class="flex items-center space-x-3">
            <div
              class="w-8 h-8 rounded-lg flex items-center justify-center"
              :class="
                executionStatus === 'running'
                  ? 'bg-amber-950/60 text-amber-400 border border-amber-600/40'
                  : executionStatus === 'success'
                  ? 'bg-emerald-950/60 text-emerald-400 border border-emerald-600/40'
                  : 'bg-rose-950/60 text-rose-400 border border-rose-600/40'
              "
            >
              <Icon
                v-if="executionStatus === 'running'"
                icon="lucide:loader-2"
                class="w-4 h-4 animate-spin"
              />
              <Icon
                v-else-if="executionStatus === 'success'"
                icon="lucide:check-circle-2"
                class="w-4 h-4"
              />
              <Icon
                v-else
                icon="lucide:alert-circle"
                class="w-4 h-4"
              />
            </div>
            <div>
              <h3 class="text-sm font-semibold text-white flex items-center space-x-2">
                <span>{{ executionTitle }}</span>
              </h3>
              <p class="text-[11px] text-slate-400 flex items-center space-x-1.5 mt-0.5">
                <span class="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                <span>Server: {{ hostTitle }}</span>
                <span>•</span>
                <span class="text-emerald-400">Terisolasi (Terminal Utama BOBA Tetap Bersih)</span>
              </p>
            </div>
          </div>

          <!-- Header Right Controls -->
          <div class="flex items-center space-x-2">
            <!-- Copy log button -->
            <button
              @click="copyExecutionLogs"
              class="px-2.5 py-1 rounded-lg text-[11px] font-medium bg-[#1e2538] hover:bg-[#28324a] text-slate-300 hover:text-emerald-300 border border-[#2b354e] transition flex items-center space-x-1.5"
              title="Salin seluruh isi log terminal ke clipboard"
            >
              <Icon icon="lucide:copy" class="w-3.5 h-3.5 text-emerald-400" />
              <span>Salin Log</span>
            </button>

            <span
              class="px-2.5 py-1 rounded-full text-[11px] font-medium flex items-center space-x-1.5 border"
              :class="
                executionStatus === 'running'
                  ? 'bg-amber-950/60 border-amber-600/50 text-amber-300'
                  : executionStatus === 'success'
                  ? 'bg-emerald-950/60 border-emerald-600/50 text-emerald-300'
                  : 'bg-rose-950/60 border-rose-600/50 text-rose-300'
              "
            >
              <span
                class="w-1.5 h-1.5 rounded-full"
                :class="
                  executionStatus === 'running'
                    ? 'bg-amber-400 animate-ping'
                    : executionStatus === 'success'
                    ? 'bg-emerald-400'
                    : 'bg-rose-400'
                "
              ></span>
              <span>{{ executionStatus === 'running' ? 'Sedang Berjalan...' : executionStatus === 'success' ? 'Selesai' : 'Gagal' }}</span>
            </span>

            <button
              @click="closeExecutionModal"
              :disabled="executionStatus === 'running'"
              class="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-100 hover:bg-[#20273a] transition disabled:opacity-30 disabled:cursor-not-allowed"
              title="Tutup dialog (hanya setelah proses selesai)"
            >
              <Icon icon="lucide:x" class="w-4 h-4" />
            </button>
          </div>
        </div>

        <!-- Terminal Container Body -->
        <div class="flex-1 w-full bg-[#080a10] p-3 overflow-hidden relative flex flex-col">
          <div
            ref="executionTermContainer"
            class="w-full h-full flex-1"
          ></div>
        </div>

        <!-- Footer -->
        <div class="px-5 py-3 bg-[#101420] border-t border-[#1f2638] flex items-center justify-between shrink-0">
          <div class="text-[11px] text-slate-400 flex items-center space-x-2">
            <Icon icon="lucide:terminal" class="w-3.5 h-3.5 text-slate-500" />
            <span v-if="executionStatus === 'running'">Output dialirkan live langsung dari server...</span>
            <span v-else-if="executionStatus === 'success'" class="text-emerald-400 font-medium">Proses selesai dengan sukses. Status software telah diperbarui.</span>
            <span v-else class="text-rose-400 font-medium">Proses berhenti atau terjadi kesalahan pada eksekusi.</span>
          </div>

          <div class="flex items-center space-x-2.5">
            <button
              @click="copyExecutionLogs"
              class="px-3 py-1.5 rounded-lg text-xs font-medium bg-[#1e2538] hover:bg-[#28324a] text-slate-300 hover:text-emerald-300 border border-[#2b354e] transition flex items-center space-x-1.5"
              title="Salin log terminal ke clipboard"
            >
              <Icon icon="lucide:copy" class="w-3.5 h-3.5 text-emerald-400" />
              <span>Salin Log</span>
            </button>
            <button
              v-if="executionStatus === 'running'"
              @click="stopExecutionModalProcess"
              class="px-3.5 py-1.5 rounded-lg text-xs font-medium bg-rose-950/60 hover:bg-rose-900/70 border border-rose-600/50 text-rose-300 transition flex items-center space-x-1.5"
            >
              <Icon icon="lucide:square" class="w-3.5 h-3.5 text-rose-400 fill-current" />
              <span>Hentikan Proses</span>
            </button>

            <button
              v-if="executionStatus === 'running'"
              @click="minimizeExecutionModal"
              class="px-3.5 py-1.5 rounded-lg text-xs font-medium bg-[#1e2538] hover:bg-[#28324a] text-slate-300 border border-[#2b354e] transition flex items-center space-x-1.5"
              title="Biarkan tetap berjalan di background dan tutup tampilan ini"
            >
              <Icon icon="lucide:minimize-2" class="w-3.5 h-3.5 text-slate-400" />
              <span>Minimalkan</span>
            </button>

            <button
              v-if="executionStatus !== 'running'"
              @click="closeExecutionModal"
              class="px-4 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition flex items-center space-x-1.5 shadow-lg shadow-emerald-950/50"
            >
              <Icon icon="lucide:check" class="w-3.5 h-3.5" />
              <span>Tutup & Selesai</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, nextTick } from 'vue';
import { Icon } from '@iconify/vue';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import WindowControls from './WindowControls.vue';
import {
  SOFTWARE_LIST,
  parseOsRelease,
  buildDetectionCommand,
  parseDetectionOutput,
  generateInstallScript,
  getPackageUpdateCommand,
  getPackageUninstallCommand,
  buildSingleActionScript,
  buildRunningCheckCommand,
  parseRunningStatus,
  buildKillSetupCommand,
  USER_SPACE_TOOL_IDS,
  type OsInfo,
  type DetectionResult,
  type SoftwareDefinition
} from '../utils/installerDefinitions.js';
import { tauriBridge } from '../services/tauriBridge.js';
import { useDialogStore } from '../stores/dialogStore.js';

const props = withDefaults(
  defineProps<{
    isOpen?: boolean;
    sessionId: string;
    hostTitle: string;
    isStandaloneWindow?: boolean;
  }>(),
  {
    isOpen: true,
    isStandaloneWindow: false
  }
);

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const dialogStore = useDialogStore();

// UI State
const activeTab = ref<'catalog' | 'cheatsheet' | 'script'>('catalog');
const activeCategory = ref<string>('all');
const statusFilter = ref<'all' | 'uninstalled' | 'installed'>('all');
const searchQuery = ref<string>('');
const showGuide = ref<boolean>(false);
const updateRepoBeforeInstall = ref<boolean>(true);
const runInBackground = ref<boolean>(true);
const activeCheatsheetId = ref<string>('nginx');

// Detection State
const isDetecting = ref<boolean>(false);
const isInstallRunning = ref<boolean>(false);
const runningProcessInfo = ref<{ pid?: string; reason?: 'boba' | 'system' }>({});
let runningCheckTimer: any = null;
let ignoreRunningUntil = 0;

const osInfo = ref<OsInfo>({
  id: '',
  name: '',
  version: '',
  family: 'debian'
});
const detectionResults = ref<Record<string, DetectionResult>>({});
const selectedPackageIds = ref<string[]>([]);
const checkingToolId = ref<string | null>(null);
const pendingCheckIds = ref<string[]>([]);

// Dedicated Execution Modal & Live Terminal Stream State
const isExecutionModalOpen = ref<boolean>(false);
const executionTitle = ref<string>('');
const executionStatus = ref<'running' | 'success' | 'error'>('running');
const executionStreamId = ref<string | null>(null);
const executionLogs = ref<string[]>([]);
const executionTermContainer = ref<HTMLElement | null>(null);
let executionTerm: Terminal | null = null;
let executionFitAddon: FitAddon | null = null;
let executionUnlistenChunk: (() => void) | null = null;
let executionUnlistenEnded: (() => void) | null = null;

const CATEGORIES: { id: string; label: string }[] = [
  { id: 'all', label: 'Semua Kategori' },
  { id: 'web', label: 'Web Server' },
  { id: 'database', label: 'Database' },
  { id: 'runtime', label: 'Runtime & Bahasa' },
  { id: 'tools', label: 'Tools & Build' },
  { id: 'containers', label: 'Container & Process' },
  { id: 'security', label: 'Security & SSL' }
];

const filteredSoftwareList = computed(() => {
  return SOFTWARE_LIST.filter((item) => {
    const matchCategory = activeCategory.value === 'all' || item.category === activeCategory.value;
    const q = searchQuery.value.toLowerCase().trim();
    const matchSearch =
      !q ||
      item.name.toLowerCase().includes(q) ||
      item.description.toLowerCase().includes(q) ||
      item.id.toLowerCase().includes(q);

    let matchStatus = true;
    if (statusFilter.value === 'uninstalled') {
      matchStatus = !detectionResults.value[item.id]?.installed;
    } else if (statusFilter.value === 'installed') {
      matchStatus = !!detectionResults.value[item.id]?.installed;
    }

    return matchCategory && matchSearch && matchStatus;
  });
});

const currentCheatsheetItem = computed(() => {
  return SOFTWARE_LIST.find((s) => s.id === activeCheatsheetId.value) || SOFTWARE_LIST[0];
});

const isSelectedUserSpaceOnly = computed(() => {
  return (
    selectedPackageIds.value.length > 0 &&
    selectedPackageIds.value.every((id) => USER_SPACE_TOOL_IDS.has(id))
  );
});

const generatedBashScript = computed(() => {
  return generateInstallScript(selectedPackageIds.value, osInfo.value, {
    updateRepo: updateRepoBeforeInstall.value,
    runInBackground: runInBackground.value
  });
});

async function tailBackgroundLog() {
  try {
    tauriBridge.sshWrite(props.sessionId, 'tail -f "/tmp/boba-setup-$(id -u).log" 2>/dev/null || tail -f /tmp/boba-setup.log\n');
    dialogStore.showToast('Memantau log background di terminal aktif', 'info', 2000);
  } catch (err: any) {
    dialogStore.showToast(`Gagal mengirim perintah: ${err?.message || err}`, 'error', 3000);
  }
}

async function checkRunningStatus(showToastOnCheck = false) {
  if (!props.sessionId) return;
  if (Date.now() < ignoreRunningUntil) return;
  try {
    const cmd = buildRunningCheckCommand();
    const out = await tauriBridge.sshExecCommand(props.sessionId, cmd);
    const status = parseRunningStatus(out || '');

    const wasRunning = isInstallRunning.value;
    isInstallRunning.value = status.isRunning;
    runningProcessInfo.value = { pid: status.pid, reason: status.reason };

    if (wasRunning && !status.isRunning) {
      dialogStore.showToast('Proses instalasi server selesai! Memperbarui status software...', 'success', 3500);
      if (pendingCheckIds.value.length > 0) {
        const ids = [...pendingCheckIds.value];
        pendingCheckIds.value = [];
        detectEnvironment(ids);
      } else {
        detectEnvironment();
      }
    } else if (showToastOnCheck) {
      if (status.isRunning) {
        dialogStore.showToast(
          `Proses instalasi sedang aktif (${status.reason === 'system' ? 'Sistem APT/DPKG' : `PID: ${status.pid || 'Aktif'}`})`,
          'info',
          2500
        );
      } else {
        dialogStore.showToast('Tidak ada proses instalasi yang sedang berjalan di server.', 'success', 2000);
      }
    }
  } catch (err) {
    console.debug('Failed to check running status:', err);
  }
}

async function forceUnlock() {
  ignoreRunningUntil = Date.now() + 6000;
  isInstallRunning.value = false;
  runningProcessInfo.value = {};
  try {
    tauriBridge.sshWrite(
      props.sessionId,
      '\x03\x03\npkill -9 -f boba-setup 2>/dev/null; sudo pkill -9 -f boba-setup 2>/dev/null; sudo killall -9 needrestart whiptail 2>/dev/null; sudo rm -f /tmp/boba-setup.lock /tmp/boba-setup.sh; rm -f /tmp/boba-setup.lock /tmp/boba-setup.sh\n'
    );
    await tauriBridge
      .sshExecCommand(
        props.sessionId,
        'pkill -9 -f boba-setup 2>/dev/null; sudo -n pkill -9 -f boba-setup 2>/dev/null; rm -f /tmp/boba-setup.lock /tmp/boba-setup.sh 2>/dev/null; sudo -n killall -9 needrestart whiptail 2>/dev/null; sudo -n rm -f /tmp/boba-setup.lock 2>/dev/null || true'
      )
      .catch(() => {});
    dialogStore.showToast('Kunci status instalasi berhasil dilepas.', 'success', 2500);
  } catch (err: any) {
    dialogStore.showToast('Kunci dilepas.', 'info', 2000);
  }
}

async function stopRunningInstall() {
  const confirmed = await dialogStore.confirm({
    title: 'Hentikan Paksa Proses & Buka Kunci?',
    description:
      'Akan menghentikan proses instalasi di server (kill -9), mematikan dialog macet (whiptail/needrestart), dan membersihkan file lock agar Anda bisa menjalankan instalasi kembali.',
    confirmText: 'Ya, Hentikan & Buka Kunci',
    cancelText: 'Batal',
    isDestructive: true
  });
  if (!confirmed) return;

  ignoreRunningUntil = Date.now() + 6000;
  isInstallRunning.value = false;
  runningProcessInfo.value = {};

  try {
    // 1. Send Ctrl+C twice to terminal to abort any running tail -f, then kill processes and remove lock
    tauriBridge.sshWrite(
      props.sessionId,
      '\x03\x03\nsudo killall -9 needrestart whiptail 2>/dev/null; kill -9 $(cat /tmp/boba-setup.lock 2>/dev/null) 2>/dev/null; pkill -9 -f boba-setup 2>/dev/null; sudo pkill -9 -f boba-setup 2>/dev/null; sudo rm -f /tmp/boba-setup.lock /tmp/boba-setup.sh 2>/dev/null; rm -f /tmp/boba-setup.lock /tmp/boba-setup.sh 2>/dev/null\n'
    );

    // 2. Also run non-interactive kill via background exec channel
    const cmd = buildKillSetupCommand();
    tauriBridge.sshExecCommand(props.sessionId, cmd).catch(() => {});

    dialogStore.showToast('Proses instalasi dihentikan dan kunci dilepas.', 'success', 3000);
  } catch (err: any) {
    dialogStore.showToast(`Proses dihentikan: ${err?.message || err}`, 'info', 3000);
  }
}

function togglePackage(id: string) {
  if (isDetecting.value) {
    dialogStore.showToast('Harap tunggu pemeriksaan awal selesai sebelum memilih paket.', 'info', 2000);
    return;
  }
  if (isInstallRunning.value) {
    dialogStore.showToast('Proses instalasi sedang berjalan. Pemilihan paket dikunci.', 'warning', 2000);
    return;
  }
  const idx = selectedPackageIds.value.indexOf(id);
  if (idx !== -1) {
    selectedPackageIds.value.splice(idx, 1);
  } else {
    selectedPackageIds.value.push(id);
  }
}

function selectAllFiltered() {
  if (isDetecting.value || isInstallRunning.value) return;
  const currentFilteredIds = filteredSoftwareList.value.map((s) => s.id);
  const combined = new Set([...selectedPackageIds.value, ...currentFilteredIds]);
  selectedPackageIds.value = Array.from(combined);
}

function selectOnlyMissing() {
  if (isDetecting.value || isInstallRunning.value) return;
  const missingIds = filteredSoftwareList.value
    .filter((s) => !detectionResults.value[s.id]?.installed)
    .map((s) => s.id);
  const combined = new Set([...selectedPackageIds.value, ...missingIds]);
  selectedPackageIds.value = Array.from(combined);
  dialogStore.showToast(`${missingIds.length} paket belum terinstall dipilih`, 'info', 2000);
}

function clearAllSelected() {
  if (isDetecting.value || isInstallRunning.value) return;
  selectedPackageIds.value = [];
}

async function recheckSingleTool(item: SoftwareDefinition) {
  if (!props.sessionId || checkingToolId.value || isDetecting.value || isInstallRunning.value) return;
  checkingToolId.value = item.id;

  try {
    const cmd = buildDetectionCommand([item]);
    const out = await tauriBridge.sshExecCommand(props.sessionId, cmd);
    if (out) {
      const res = parseDetectionOutput(out);
      const single = res[item.id];
      if (single) {
        detectionResults.value[item.id] = single;
        const statusText = single.installed
          ? `Terpasang (v${single.version || 'OK'})`
          : 'Belum Terpasang';
        dialogStore.showToast(`${item.name}: ${statusText}`, single.installed ? 'success' : 'info', 2000);
      }
    }
  } catch (err: any) {
    dialogStore.showToast(`Gagal cek ulang ${item.name}: ${err?.message || err}`, 'error', 3000);
  } finally {
    checkingToolId.value = null;
  }
}

function formatBadgeVersion(ver?: string): string {
  if (!ver || ver === 'Terpasang' || ver === 'OK') return 'Terpasang';
  if (/^[0-9]/.test(ver)) return `v${ver}`;
  return ver;
}

function openCheatsheetFor(id: string) {
  activeCheatsheetId.value = id;
  activeTab.value = 'cheatsheet';
}

async function copyText(text: string, toastMessage = 'Berhasil disalin') {
  try {
    await navigator.clipboard.writeText(text);
    dialogStore.showToast(toastMessage, 'success', 2000);
  } catch (err) {
    dialogStore.showToast('Gagal menyalin teks ke clipboard', 'error', 3000);
  }
}

function initExecutionTerminal() {
  if (!executionTermContainer.value) return;
  if (executionTerm) {
    executionTerm.dispose();
    executionTerm = null;
  }

  executionTerm = new Terminal({
    theme: {
      background: '#080a10',
      foreground: '#e2e8f0',
      cursor: '#34d399',
      selectionBackground: '#1e293b',
      black: '#0f172a',
      red: '#ef4444',
      green: '#10b981',
      yellow: '#f59e0b',
      blue: '#38bdf8',
      magenta: '#d946ef',
      cyan: '#06b6d4',
      white: '#f8fafc'
    },
    fontFamily: 'JetBrains Mono, Menlo, Monaco, Consolas, monospace',
    fontSize: 12,
    lineHeight: 1.35,
    cursorBlink: false,
    disableStdin: true,
    convertEol: true
  });

  executionFitAddon = new FitAddon();
  executionTerm.loadAddon(executionFitAddon);
  executionTerm.open(executionTermContainer.value);
  try {
    executionFitAddon.fit();
  } catch {}
}

function handleResize() {
  if (isExecutionModalOpen.value && executionFitAddon) {
    try {
      executionFitAddon.fit();
    } catch {}
  }
}

async function runActionInIsolatedStream(
  title: string,
  rawScript: string,
  pendingIds: string[]
) {
  if (isInstallRunning.value) {
    dialogStore.showToast('Proses lain sedang berlangsung. Harap tunggu hingga selesai.', 'warning', 3000);
    return;
  }

  // Cleanup old listeners if any
  if (executionUnlistenChunk) {
    executionUnlistenChunk();
    executionUnlistenChunk = null;
  }
  if (executionUnlistenEnded) {
    executionUnlistenEnded();
    executionUnlistenEnded = null;
  }

  executionTitle.value = title;
  executionStatus.value = 'running';
  pendingCheckIds.value = pendingIds;
  isInstallRunning.value = true;
  isExecutionModalOpen.value = true;
  executionLogs.value = [];

  await nextTick();
  initExecutionTerminal();

  const startMsg = `[BOBA] Membuka channel SSH terisolasi untuk: ${title}...\n\n`;
  executionLogs.value.push(startMsg);
  executionTerm?.writeln(`\x1b[36m[BOBA] Membuka channel SSH terisolasi untuk: ${title}...\x1b[0m\r\n`);

  try {
    // Proactively clean up any stale log streams on the backend
    try {
      const activeStreams = await tauriBridge.sshListActiveLogStreams(props.sessionId);
      for (const stId of activeStreams) {
        await tauriBridge.sshStopLogStream(stId).catch(() => {});
      }
    } catch {}

    // Base64 encode script to avoid quoting issues
    const bytes = new TextEncoder().encode(rawScript);
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
      const b = bytes[i];
      if (b !== undefined) {
        binary += String.fromCharCode(b);
      }
    }
    const b64 = btoa(binary);

    const runnerCmd = `LOG="/tmp/boba-setup-$(id -u).log"; rm -f /tmp/boba-setup.sh /tmp/boba-setup.lock "$LOG" 2>/dev/null; echo "${b64}" | base64 -d > /tmp/boba-setup.sh && chmod +x /tmp/boba-setup.sh && (/tmp/boba-setup.sh 2>&1 | tee "$LOG")`;

    const streamId = await tauriBridge.sshStartLogStream(props.sessionId, runnerCmd, title);
    executionStreamId.value = streamId;

    executionUnlistenChunk = await tauriBridge.onLogStreamChunk(streamId, (chunk: string) => {
      executionLogs.value.push(chunk);
      executionTerm?.write(chunk);
    });

    executionUnlistenEnded = await tauriBridge.onLogStreamEnded(streamId, () => {
      executionStatus.value = 'success';
      isInstallRunning.value = false;
      tauriBridge.sshStopLogStream(streamId).catch(() => {});
      executionStreamId.value = null;
      const doneMsg = '\n✔ [BOBA] Selesai: Seluruh proses telah berhasil dijalankan.\n';
      executionLogs.value.push(doneMsg);
      executionTerm?.writeln('\r\n\x1b[32m✔ [BOBA] Selesai: Seluruh proses telah berhasil dijalankan.\x1b[0m\r\n');
      dialogStore.showToast(`Proses ${title} selesai!`, 'success', 3000);
      detectEnvironment(pendingCheckIds.value);
    });
  } catch (err: any) {
    executionStatus.value = 'error';
    isInstallRunning.value = false;
    const errMsg = `\n✘ [BOBA Gagal] ${err?.message || err}\n`;
    executionLogs.value.push(errMsg);
    executionTerm?.writeln(`\r\n\x1b[31m✘ [BOBA Gagal] ${err?.message || err}\x1b[0m\r\n`);
    dialogStore.showToast(`Gagal memulai proses: ${err?.message || err}`, 'error', 4000);
  }
}

function copyExecutionLogs() {
  const text = executionLogs.value.join('');
  const clean = text.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, '');
  copyText(clean.trim() || 'Tidak ada isi log', 'Log terminal berhasil disalin ke clipboard');
}

async function stopExecutionModalProcess() {
  const confirmed = await dialogStore.confirm({
    title: 'Hentikan Proses yang Sedang Berjalan?',
    description: 'Akan menghentikan stream dan mematikan proses di server (kill -9).',
    confirmText: 'Ya, Hentikan',
    cancelText: 'Batal',
    isDestructive: true
  });
  if (!confirmed) return;

  try {
    if (executionStreamId.value) {
      await tauriBridge.sshStopLogStream(executionStreamId.value).catch(() => {});
      executionStreamId.value = null;
    }
    const killCmd = buildKillSetupCommand();
    await tauriBridge.sshExecCommand(props.sessionId, killCmd).catch(() => {});

    executionStatus.value = 'error';
    isInstallRunning.value = false;
    executionTerm?.writeln('\r\n\x1b[31m[Proses dihentikan oleh pengguna]\x1b[0m\r\n');
    dialogStore.showToast('Proses telah dihentikan.', 'info', 2500);
  } catch (err: any) {
    dialogStore.showToast(`Gagal menghentikan: ${err?.message || err}`, 'error', 3000);
  }
}

function minimizeExecutionModal() {
  isExecutionModalOpen.value = false;
  dialogStore.showToast('Proses tetap berjalan di background. Anda dapat membukanya kembali lewat tombol Pantau.', 'info', 3000);
}

function closeExecutionModal() {
  isExecutionModalOpen.value = false;
  if (executionFitAddon) {
    executionFitAddon = null;
  }
  if (executionTerm) {
    executionTerm.dispose();
    executionTerm = null;
  }
  if (pendingCheckIds.value.length > 0) {
    const ids = [...pendingCheckIds.value];
    pendingCheckIds.value = [];
    detectEnvironment(ids);
  }
}

function openActiveExecutionModal() {
  isExecutionModalOpen.value = true;
  nextTick(() => {
    initExecutionTerminal();
  });
}

async function updateSinglePackage(item: SoftwareDefinition) {
  if (isInstallRunning.value) {
    dialogStore.showToast('Proses instalasi/tindakan lain sedang berlangsung. Harap tunggu.', 'warning', 3000);
    return;
  }

  await checkRunningStatus();
  if (isInstallRunning.value) {
    dialogStore.showToast('Proses lain sedang berlangsung di server. Harap tunggu.', 'warning', 3000);
    return;
  }

  const cmd = getPackageUpdateCommand(item, osInfo.value);
  const confirmed = await dialogStore.confirm({
    title: `Update ${item.name}?`,
    description: `Akan menjalankan perintah update untuk ${item.name} di terminal terisolasi (${props.hostTitle}):\n\n${cmd}`,
    confirmText: 'Jalankan Update',
    cancelText: 'Batal'
  });
  if (!confirmed) return;

  const script = buildSingleActionScript(`Update ${item.name}`, cmd, { wrapNohup: false });
  runActionInIsolatedStream(`Update ${item.name}`, script, [item.id]);
}

async function uninstallSinglePackage(item: SoftwareDefinition) {
  if (isInstallRunning.value) {
    dialogStore.showToast('Proses instalasi/tindakan lain sedang berlangsung. Harap tunggu.', 'warning', 3000);
    return;
  }

  await checkRunningStatus();
  if (isInstallRunning.value) {
    dialogStore.showToast('Proses lain sedang berlangsung di server. Harap tunggu.', 'warning', 3000);
    return;
  }

  const cmd = getPackageUninstallCommand(item, osInfo.value);
  const confirmed = await dialogStore.confirm({
    title: `Hapus / Uninstall ${item.name}?`,
    description: `Akan menjalankan perintah uninstall untuk ${item.name} di terminal terisolasi (${props.hostTitle}):\n\n${cmd}\n\nApakah Anda yakin ingin menghapus tool ini dari server?`,
    confirmText: 'Ya, Hapus Tool',
    cancelText: 'Batal',
    isDestructive: true
  });
  if (!confirmed) return;

  const script = buildSingleActionScript(`Uninstall ${item.name}`, cmd, { wrapNohup: false });
  runActionInIsolatedStream(`Uninstall ${item.name}`, script, [item.id]);
}

async function updateSystemPackages() {
  if (isInstallRunning.value) {
    dialogStore.showToast('Proses lain sedang berlangsung di server. Harap tunggu.', 'warning', 3000);
    return;
  }

  await checkRunningStatus();
  if (isInstallRunning.value) {
    dialogStore.showToast('Proses lain sedang berlangsung di server. Harap tunggu.', 'warning', 3000);
    return;
  }

  let cmd =
    'sudo -E env DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=a NEEDRESTART_SUSPEND=1 apt-get update && sudo -E env DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=a NEEDRESTART_SUSPEND=1 apt-get -y -o Dpkg::Options::="--force-confdef" -o Dpkg::Options::="--force-confold" upgrade';
  if (osInfo.value.family === 'rhel') {
    cmd = 'sudo dnf upgrade -y';
  } else if (osInfo.value.family === 'alpine') {
    cmd = 'sudo apk update && sudo apk upgrade';
  } else if (osInfo.value.family === 'arch') {
    cmd = 'sudo pacman -Syu --noconfirm';
  }

  const confirmed = await dialogStore.confirm({
    title: 'Update & Upgrade Seluruh Paket Sistem?',
    description: `Akan memperbarui repositori dan mengupgrade paket sistem OS (${osInfo.value.name || 'Linux'}) di terminal terisolasi:\n\n${cmd}`,
    confirmText: 'Jalankan Update Sistem',
    cancelText: 'Batal'
  });
  if (!confirmed) return;

  const script = buildSingleActionScript('Update & Upgrade Seluruh Paket Sistem', cmd, { wrapNohup: false });
  runActionInIsolatedStream('Update & Upgrade Seluruh Paket Sistem', script, []);
}

async function executeInstallation() {
  if (selectedPackageIds.value.length === 0) {
    dialogStore.showToast('Pilih setidaknya 1 paket software terlebih dahulu.', 'warning', 3000);
    return;
  }

  if (isInstallRunning.value) {
    dialogStore.showToast('Proses instalasi lain masih berjalan di server. Harap tunggu hingga selesai.', 'warning', 3500);
    return;
  }

  await checkRunningStatus();
  if (isInstallRunning.value) {
    dialogStore.showToast('Server sedang menjalankan proses instalasi lain. Perintah dibatalkan.', 'warning', 3500);
    return;
  }

  const confirmed = await dialogStore.confirm({
    title: 'Jalankan Instalasi Server?',
    description: `Akan menginstall ${selectedPackageIds.value.length} paket secara terisolasi (${props.hostTitle}). Terminal utama BOBA tidak akan terganggu.`,
    confirmText: 'Mulai Instalasi',
    cancelText: 'Batal'
  });

  if (!confirmed) return;

  const script = generateInstallScript(selectedPackageIds.value, osInfo.value, {
    updateRepo: updateRepoBeforeInstall.value,
    runInBackground: false
  });

  runActionInIsolatedStream(
    `Instalasi Software (${selectedPackageIds.value.length} Paket)`,
    script,
    [...selectedPackageIds.value]
  );
}

async function sendSingleCommandToTerminal(cmd: string) {
  try {
    tauriBridge.sshWrite(props.sessionId, `${cmd}\n`);
    dialogStore.showToast('Perintah dikirim ke terminal aktif', 'info', 2000);
  } catch (err: any) {
    dialogStore.showToast(`Gagal mengirim perintah: ${err?.message || err}`, 'error', 3000);
  }
}

async function detectEnvironment(targetIds?: string[] | Event) {
  if (!props.sessionId) return;
  const specificIds = Array.isArray(targetIds) ? targetIds : undefined;
  isDetecting.value = true;

  try {
    // 1. Detect OS (hanya jika belum ada info OS atau full refresh)
    if (!osInfo.value.id || !specificIds) {
      const osOut = await tauriBridge.sshExecCommand(
        props.sessionId,
        'cat /etc/os-release 2>/dev/null || cat /usr/lib/os-release 2>/dev/null'
      );
      if (osOut) {
        osInfo.value = parseOsRelease(osOut);
      }
    }

    // 2. Detect Software (filter target jika specificIds diberikan)
    const targets = specificIds && specificIds.length > 0
      ? SOFTWARE_LIST.filter(s => specificIds.includes(s.id))
      : SOFTWARE_LIST;

    if (targets.length > 0) {
      const detectCmd = buildDetectionCommand(targets);
      const detectOut = await tauriBridge.sshExecCommand(props.sessionId, detectCmd);
      if (detectOut) {
        const partial = parseDetectionOutput(detectOut);
        detectionResults.value = { ...detectionResults.value, ...partial };
      }
    }
  } catch (err: any) {
    console.error('Detection error:', err);
    dialogStore.showToast('Pemeriksaan lingkungan server gagal atau sebagian respons tidak terbaca', 'warning', 3000);
  } finally {
    isDetecting.value = false;
  }
}

watch(
  () => props.isOpen,
  (val) => {
    if (val) {
      detectEnvironment();
      checkRunningStatus();
    }
  }
);

onMounted(() => {
  if (props.isOpen) {
    detectEnvironment();
    checkRunningStatus();
  }
  window.addEventListener('resize', handleResize);
  runningCheckTimer = setInterval(() => {
    checkRunningStatus();
  }, 3500);
});

onUnmounted(() => {
  window.removeEventListener('resize', handleResize);
  if (runningCheckTimer) {
    clearInterval(runningCheckTimer);
    runningCheckTimer = null;
  }
  if (executionUnlistenChunk) {
    executionUnlistenChunk();
    executionUnlistenChunk = null;
  }
  if (executionUnlistenEnded) {
    executionUnlistenEnded();
    executionUnlistenEnded = null;
  }
  if (executionTerm) {
    executionTerm.dispose();
    executionTerm = null;
  }
});
</script>

<style scoped>
.animate-fade-in {
  animation: fadeIn 0.15s ease-out;
}
@keyframes fadeIn {
  from {
    opacity: 0;
    transform: scale(0.98);
  }
  to {
    opacity: 1;
    transform: scale(1);
  }
}
</style>
