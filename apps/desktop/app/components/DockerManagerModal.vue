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
          <div class="w-8 h-8 rounded-lg bg-sky-500/20 text-sky-400 flex items-center justify-center border border-sky-500/30">
            <Icon icon="lucide:container" class="w-5 h-5" />
          </div>
          <div>
            <div class="flex items-center space-x-2">
              <h2 class="font-bold text-sm tracking-wide text-white">Docker Manager</h2>
              <span class="text-[11px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono border border-slate-700">
                {{ hostTitle }}
              </span>
            </div>
            <p class="text-[11px] text-slate-400">Kelola container, image, volume, network & resource secara real-time di server.</p>
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
              class="rounded bg-[#12151e] border-slate-600 text-sky-500 focus:ring-0 focus:ring-offset-0 cursor-pointer"
            />
            <span class="font-mono text-amber-400 font-bold">sudo</span>
          </label>

          <!-- Refresh Button -->
          <button
            @click="() => fetchData()"
            :disabled="isLoading"
            class="p-1.5 bg-[#1e2333] hover:bg-[#282f45] border border-[#2e374d] text-slate-300 rounded-lg transition disabled:opacity-50"
            title="Muat Ulang Data Sekarang"
          >
            <Icon icon="lucide:refresh-cw" :class="['w-4 h-4', isLoading ? 'animate-spin text-sky-400' : '']" />
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
          <!-- Tab Containers -->
          <button
            @click="activeTab = 'containers'"
            :class="[
              'px-3.5 py-1.5 rounded-md text-xs font-medium transition flex items-center space-x-2',
              activeTab === 'containers'
                ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                : 'text-slate-400 hover:text-slate-200'
            ]"
          >
            <Icon icon="lucide:box" class="w-3.5 h-3.5" />
            <span>Containers</span>
            <span class="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-800 text-slate-300">{{ containers.length }}</span>
          </button>

          <!-- Tab Images -->
          <button
            @click="activeTab = 'images'"
            :class="[
              'px-3.5 py-1.5 rounded-md text-xs font-medium transition flex items-center space-x-2',
              activeTab === 'images'
                ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                : 'text-slate-400 hover:text-slate-200'
            ]"
          >
            <Icon icon="lucide:layers" class="w-3.5 h-3.5" />
            <span>Images</span>
            <span class="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-800 text-slate-300">{{ images.length }}</span>
          </button>

          <!-- Tab Volumes -->
          <button
            @click="activeTab = 'volumes'"
            :class="[
              'px-3.5 py-1.5 rounded-md text-xs font-medium transition flex items-center space-x-2',
              activeTab === 'volumes'
                ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                : 'text-slate-400 hover:text-slate-200'
            ]"
          >
            <Icon icon="lucide:hard-drive" class="w-3.5 h-3.5" />
            <span>Volumes</span>
            <span class="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-800 text-slate-300">{{ volumes.length }}</span>
          </button>

          <!-- Tab Networks -->
          <button
            @click="activeTab = 'networks'"
            :class="[
              'px-3.5 py-1.5 rounded-md text-xs font-medium transition flex items-center space-x-2',
              activeTab === 'networks'
                ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                : 'text-slate-400 hover:text-slate-200'
            ]"
          >
            <Icon icon="lucide:network" class="w-3.5 h-3.5" />
            <span>Networks</span>
            <span class="text-[10px] px-1.5 py-0.2 rounded-full bg-slate-800 text-slate-300">{{ networks.length }}</span>
          </button>
        </div>

        <!-- Filter Search Bar -->
        <div class="relative w-64">
          <Icon icon="lucide:search" class="w-3.5 h-3.5 text-slate-500 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Cari nama, image, network..."
            class="w-full pl-8 pr-3 py-1 bg-[#1b202e] border border-[#2a3247] rounded-md text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-sky-500 transition"
          />
        </div>
      </div>

      <!-- Main Body Content -->
      <div class="flex-1 overflow-auto p-4 bg-[#0d1017]">
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

        <!-- 1. CONTAINERS TAB -->
        <div v-if="activeTab === 'containers'" class="space-y-3">
          <!-- Edu Info Banner for Beginners -->
          <div class="p-2.5 bg-[#161c2b]/70 border border-sky-900/40 rounded-lg flex items-start space-x-2.5 text-[11px] text-slate-300">
            <Icon icon="lucide:info" class="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
            <div class="leading-relaxed">
              <span class="font-semibold text-sky-300">Apa itu Container?</span>
              Container adalah instance aplikasi yang sedang berjalan terisolasi dari sistem utama. Anda dapat mengontrol siklus hidupnya (Start, Stop, Restart), melihat log output real-time, atau langsung masuk ke terminal container dengan tombol terminal.
            </div>
          </div>
          <div v-if="!isLoading && filteredContainers.length === 0" class="text-center py-16 text-slate-500">
            <Icon icon="lucide:box" class="w-10 h-10 mx-auto mb-2 opacity-40" />
            <p class="text-xs">Tidak ada container yang ditemukan.</p>
          </div>

          <div v-else class="border border-[#222838] rounded-lg bg-[#131620] overflow-x-auto">
            <table class="w-full text-left text-xs border-collapse min-w-[820px]">
              <thead>
                <tr class="bg-[#171c2a] border-b border-[#222838] text-slate-400 text-[11px] font-mono">
                  <th class="py-2.5 px-3 w-28 whitespace-nowrap">STATUS</th>
                  <th class="py-2.5 px-3 min-w-[150px]">NAME</th>
                  <th class="py-2.5 px-3 min-w-[150px]">IMAGE</th>
                  <th class="py-2.5 px-3 w-24 whitespace-nowrap">CPU / RAM</th>
                  <th class="py-2.5 px-3 min-w-[130px]">PORTS</th>
                  <th class="py-2.5 px-3 min-w-[120px]">UPTIME</th>
                  <th class="py-2.5 px-3 text-right w-48 whitespace-nowrap">ACTIONS</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-[#1e2333] font-mono">
                <tr
                  v-for="c in filteredContainers"
                  :key="c.id"
                  class="hover:bg-[#181d2c] transition group"
                >
                  <!-- State Badge -->
                  <td class="py-2.5 px-3 whitespace-nowrap">
                    <span
                      :class="[
                        'inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-sans font-medium',
                        c.state === 'running' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' :
                        c.state === 'exited' ? 'bg-slate-800 text-slate-400 border border-slate-700' :
                        'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                      ]"
                    >
                      <span
                        :class="[
                          'w-1.5 h-1.5 rounded-full mr-1.5 shrink-0',
                          c.state === 'running' ? 'bg-emerald-400' :
                          c.state === 'exited' ? 'bg-slate-500' :
                          'bg-amber-400'
                        ]"
                      ></span>
                      {{ c.state.toUpperCase() }}
                    </span>
                  </td>

                  <!-- Container Name -->
                  <td class="py-2.5 px-3 font-semibold text-slate-100">
                    <div class="flex flex-col">
                      <span class="break-all">{{ c.names }}</span>
                      <span class="text-[10px] text-slate-500 font-mono">{{ c.id.substring(0, 12) }}</span>
                    </div>
                  </td>

                  <!-- Image Name -->
                  <td class="py-2.5 px-3 text-slate-300 break-all max-w-[180px]" :title="c.image">
                    {{ c.image }}
                  </td>

                  <!-- CPU & RAM Stats -->
                  <td class="py-2.5 px-3 whitespace-nowrap text-[10px]">
                    <div v-if="c.cpuPercent" class="flex flex-col space-y-0.5">
                      <span class="text-sky-300">⚡ {{ c.cpuPercent }}</span>
                      <span class="text-slate-400 truncate max-w-[110px]" :title="c.memUsage">📦 {{ c.memUsage }}</span>
                    </div>
                    <span v-else class="text-slate-600">-</span>
                  </td>

                  <!-- Ports -->
                  <td class="py-2.5 px-3 text-slate-400 break-all max-w-[160px]" :title="c.ports">
                    {{ c.ports || '-' }}
                  </td>

                  <!-- Status / Uptime -->
                  <td class="py-2.5 px-3 text-slate-400 whitespace-normal text-[11px]">
                    {{ c.status }}
                  </td>

                  <!-- Action Buttons -->
                  <td class="py-2.5 px-3 text-right whitespace-nowrap">
                    <div class="flex items-center justify-end space-x-1">
                      <!-- Exec Shell (Langsung masuk terminal container) -->
                      <button
                        v-if="c.state === 'running'"
                        @click="execContainerShell(c)"
                        class="p-1.5 bg-indigo-950/60 hover:bg-indigo-900 border border-indigo-700/60 text-indigo-300 rounded transition shrink-0"
                        title="Exec Shell (Masuk ke Terminal Container)"
                      >
                        <Icon icon="lucide:terminal" class="w-3.5 h-3.5 text-indigo-400" />
                      </button>

                      <!-- Start -->
                      <button
                        v-if="c.state !== 'running'"
                        @click="runContainerAction(c, 'start')"
                        :disabled="actionLoadingId === c.id"
                        class="p-1.5 bg-emerald-950/60 hover:bg-emerald-900 border border-emerald-800 text-emerald-300 rounded transition shrink-0"
                        title="Start Container"
                      >
                        <Icon icon="lucide:play" class="w-3.5 h-3.5" />
                      </button>

                      <!-- Stop (dengan konfirmasi) -->
                      <button
                        v-if="c.state === 'running'"
                        @click="confirmStopContainer(c)"
                        :disabled="actionLoadingId === c.id"
                        class="p-1.5 bg-amber-950/60 hover:bg-amber-900 border border-amber-800 text-amber-300 rounded transition shrink-0"
                        title="Stop Container"
                      >
                        <Icon icon="lucide:square" class="w-3.5 h-3.5" />
                      </button>

                      <!-- Restart (dengan konfirmasi) -->
                      <button
                        @click="confirmRestartContainer(c)"
                        :disabled="actionLoadingId === c.id"
                        class="p-1.5 bg-[#202637] hover:bg-[#2b344b] border border-[#303a52] text-slate-300 rounded transition shrink-0"
                        title="Restart Container"
                      >
                        <Icon icon="lucide:rotate-cw" class="w-3.5 h-3.5" />
                      </button>

                      <!-- View Logs -->
                      <button
                        @click="openLogs(c)"
                        class="p-1.5 bg-sky-950/60 hover:bg-sky-900 border border-sky-800 text-sky-300 rounded transition shrink-0"
                        title="View Container Logs"
                      >
                        <Icon icon="lucide:file-text" class="w-3.5 h-3.5" />
                      </button>

                      <!-- Delete (dengan konfirmasi) -->
                      <button
                        @click="confirmDeleteContainer(c)"
                        :disabled="actionLoadingId === c.id"
                        class="p-1.5 bg-rose-950/60 hover:bg-rose-900 border border-rose-800 text-rose-300 rounded transition shrink-0"
                        title="Delete Container (rm -f)"
                      >
                        <Icon icon="lucide:trash-2" class="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- 2. IMAGES TAB -->
        <div v-if="activeTab === 'images'" class="space-y-3">
          <!-- Edu Info Banner for Beginners -->
          <div class="p-2.5 bg-[#161c2b]/70 border border-sky-900/40 rounded-lg flex items-start space-x-2.5 text-[11px] text-slate-300">
            <Icon icon="lucide:info" class="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
            <div class="leading-relaxed">
              <span class="font-semibold text-sky-300">Apa itu Docker Image?</span>
              Image adalah cetak biru (*blueprint* / template read-only) yang berisi sistem operasi, dependensi, dan kode aplikasi untuk membuat container. Menghapus image yang tidak lagi digunakan membantu menghemat kapasitas disk server Anda.
            </div>
          </div>
          <div v-if="!isLoading && filteredImages.length === 0" class="text-center py-16 text-slate-500">
            <Icon icon="lucide:layers" class="w-10 h-10 mx-auto mb-2 opacity-40" />
            <p class="text-xs">Tidak ada image yang ditemukan.</p>
          </div>

          <div v-else class="border border-[#222838] rounded-lg bg-[#131620] overflow-x-auto">
            <table class="w-full text-left text-xs border-collapse min-w-[700px]">
              <thead>
                <tr class="bg-[#171c2a] border-b border-[#222838] text-slate-400 text-[11px] font-mono">
                  <th class="py-2.5 px-3">REPOSITORY</th>
                  <th class="py-2.5 px-3">TAG</th>
                  <th class="py-2.5 px-3">IMAGE ID</th>
                  <th class="py-2.5 px-3">SIZE</th>
                  <th class="py-2.5 px-3">CREATED</th>
                  <th class="py-2.5 px-3 text-right">ACTION</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-[#1e2333] font-mono">
                <tr
                  v-for="img in filteredImages"
                  :key="img.id"
                  class="hover:bg-[#181d2c] transition"
                >
                  <td class="py-2.5 px-3 font-semibold text-slate-100">
                    {{ img.repository }}
                  </td>
                  <td class="py-2.5 px-3 text-sky-400 font-medium">
                    {{ img.tag }}
                  </td>
                  <td class="py-2.5 px-3 text-slate-400">
                    {{ img.id.replace('sha256:', '').substring(0, 12) }}
                  </td>
                  <td class="py-2.5 px-3 text-slate-300">
                    {{ img.size }}
                  </td>
                  <td class="py-2.5 px-3 text-slate-400">
                    {{ img.created }}
                  </td>
                  <td class="py-2.5 px-3 text-right">
                    <button
                      @click="confirmDeleteImage(img)"
                      :disabled="actionLoadingId === img.id"
                      class="p-1.5 bg-rose-950/60 hover:bg-rose-900 border border-rose-800 text-rose-300 rounded transition"
                      title="Delete Image (rmi)"
                    >
                      <Icon icon="lucide:trash-2" class="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- 3. VOLUMES TAB -->
        <div v-if="activeTab === 'volumes'" class="space-y-3">
          <!-- Edu Info Banner for Beginners -->
          <div class="p-2.5 bg-[#161c2b]/70 border border-sky-900/40 rounded-lg flex items-start space-x-2.5 text-[11px] text-slate-300">
            <Icon icon="lucide:info" class="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
            <div class="leading-relaxed">
              <span class="font-semibold text-sky-300">Apa itu Volume?</span>
              Volume adalah media penyimpanan data permanen di host server. Data database atau file upload yang disimpan di dalam volume akan tetap aman dan tidak akan hilang meskipun container dihapus atau diperbarui.
            </div>
          </div>
          <div v-if="!isLoading && filteredVolumes.length === 0" class="text-center py-16 text-slate-500">
            <Icon icon="lucide:hard-drive" class="w-10 h-10 mx-auto mb-2 opacity-40" />
            <p class="text-xs">Tidak ada volume yang ditemukan.</p>
          </div>

          <div v-else class="border border-[#222838] rounded-lg bg-[#131620] overflow-x-auto">
            <table class="w-full text-left text-xs border-collapse min-w-[600px]">
              <thead>
                <tr class="bg-[#171c2a] border-b border-[#222838] text-slate-400 text-[11px] font-mono">
                  <th class="py-2.5 px-3">VOLUME NAME</th>
                  <th class="py-2.5 px-3">DRIVER</th>
                  <th class="py-2.5 px-3">SCOPE</th>
                  <th class="py-2.5 px-3 text-right">ACTION</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-[#1e2333] font-mono">
                <tr
                  v-for="v in filteredVolumes"
                  :key="v.name"
                  class="hover:bg-[#181d2c] transition"
                >
                  <td class="py-2.5 px-3 font-semibold text-slate-100 font-mono">
                    {{ v.name }}
                  </td>
                  <td class="py-2.5 px-3 text-slate-400">
                    {{ v.driver }}
                  </td>
                  <td class="py-2.5 px-3 text-slate-400">
                    {{ v.scope }}
                  </td>
                  <td class="py-2.5 px-3 text-right">
                    <button
                      @click="confirmDeleteVolume(v)"
                      :disabled="actionLoadingId === v.name"
                      class="p-1.5 bg-rose-950/60 hover:bg-rose-900 border border-rose-800 text-rose-300 rounded transition"
                      title="Delete Volume (volume rm)"
                    >
                      <Icon icon="lucide:trash-2" class="w-3.5 h-3.5" />
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- 4. NETWORKS TAB -->
        <div v-if="activeTab === 'networks'" class="space-y-3">
          <!-- Edu Info Banner for Beginners -->
          <div class="p-2.5 bg-[#161c2b]/70 border border-sky-900/40 rounded-lg flex items-start space-x-2.5 text-[11px] text-slate-300">
            <Icon icon="lucide:info" class="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
            <div class="leading-relaxed">
              <span class="font-semibold text-sky-300">Apa itu Docker Network?</span>
              Network memungkinkan container saling berkomunikasi secara aman (misalnya backend berkomunikasi dengan database melalui nama host/container tanpa membuka port ke publik). Driver bawaan seperti <code class="text-sky-300">bridge</code> tidak dapat dihapus.
            </div>
          </div>
          <div v-if="!isLoading && filteredNetworks.length === 0" class="text-center py-16 text-slate-500">
            <Icon icon="lucide:network" class="w-10 h-10 mx-auto mb-2 opacity-40" />
            <p class="text-xs">Tidak ada network yang ditemukan.</p>
          </div>

          <div v-else class="border border-[#222838] rounded-lg bg-[#131620] overflow-x-auto">
            <table class="w-full text-left text-xs border-collapse min-w-[600px]">
              <thead>
                <tr class="bg-[#171c2a] border-b border-[#222838] text-slate-400 text-[11px] font-mono">
                  <th class="py-2.5 px-3">NETWORK ID</th>
                  <th class="py-2.5 px-3">NAME</th>
                  <th class="py-2.5 px-3">DRIVER</th>
                  <th class="py-2.5 px-3">SCOPE</th>
                  <th class="py-2.5 px-3 text-right">ACTION</th>
                </tr>
              </thead>
              <tbody class="divide-y divide-[#1e2333] font-mono">
                <tr
                  v-for="net in filteredNetworks"
                  :key="net.id"
                  class="hover:bg-[#181d2c] transition"
                >
                  <td class="py-2.5 px-3 text-slate-400 font-mono">
                    {{ net.id.substring(0, 12) }}
                  </td>
                  <td class="py-2.5 px-3 font-semibold text-slate-100 font-mono">
                    {{ net.name }}
                  </td>
                  <td class="py-2.5 px-3 text-sky-400">
                    {{ net.driver }}
                  </td>
                  <td class="py-2.5 px-3 text-slate-400">
                    {{ net.scope }}
                  </td>
                  <td class="py-2.5 px-3 text-right">
                    <button
                      v-if="!['bridge', 'host', 'none'].includes(net.name)"
                      @click="confirmDeleteNetwork(net)"
                      :disabled="actionLoadingId === net.id"
                      class="p-1.5 bg-rose-950/60 hover:bg-rose-900 border border-rose-800 text-rose-300 rounded transition"
                      title="Delete Network (network rm)"
                    >
                      <Icon icon="lucide:trash-2" class="w-3.5 h-3.5" />
                    </button>
                    <span v-else class="text-[10px] text-slate-600 italic px-2">system</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- Footer Info Bar -->
      <div class="h-8 border-t border-[#23293a] bg-[#141722] px-4 flex items-center justify-between text-[11px] text-slate-500 shrink-0 font-mono">
        <div>Total: {{ containers.length }} Container(s), {{ images.length }} Image(s), {{ volumes.length }} Volume(s), {{ networks.length }} Network(s)</div>
        <div v-if="actionMessage" class="text-sky-400 animate-fade-in">{{ actionMessage }}</div>
      </div>
    </div>

    <!-- SUB-MODAL / PANEL: LOG VIEWER -->
    <div
      v-if="selectedContainerForLogs"
      class="fixed inset-0 z-60 flex items-center justify-center bg-black/80 backdrop-blur-sm p-6"
    >
      <!-- Backdrop click handler -->
      <div class="absolute inset-0" @click="selectedContainerForLogs = null"></div>

      <div class="relative z-10 bg-[#0f1118] border border-[#272e42] rounded-xl shadow-2xl w-full max-w-4xl h-[78vh] flex flex-col overflow-hidden text-slate-200">
        <!-- Log Header -->
        <div class="h-12 border-b border-[#23293a] px-4 flex items-center justify-between bg-[#151926] shrink-0">
          <div class="flex items-center space-x-2 truncate">
            <Icon icon="lucide:terminal" class="w-4 h-4 text-sky-400 shrink-0" />
            <span class="font-mono text-xs font-semibold text-slate-100 truncate">
              Logs: {{ selectedContainerForLogs.names }} ({{ selectedContainerForLogs.id.substring(0, 8) }})
            </span>
          </div>

          <div class="flex items-center space-x-2">
            <!-- Tail Lines Selector Buttons (Custom Pill UI - No native select bug) -->
            <div class="flex items-center bg-[#1b202e] border border-[#2d364a] rounded-lg p-0.5 space-x-0.5 text-[11px] font-mono">
              <button
                v-for="lines in [100, 250, 500, 1000]"
                :key="lines"
                @click="changeLogTail(lines)"
                :class="[
                  'px-2 py-0.5 rounded transition',
                  logTailLines === lines
                    ? 'bg-sky-500 text-slate-950 font-bold shadow-sm'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-[#252b3d]'
                ]"
              >
                {{ lines }}L
              </button>
            </div>

            <!-- Auto-scroll to bottom toggle -->
            <button
              @click="isLogAutoScroll = !isLogAutoScroll"
              :class="[
                'px-2 py-1 rounded text-xs font-mono transition border',
                isLogAutoScroll
                  ? 'bg-sky-950/60 border-sky-600/50 text-sky-300'
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
              @click="fetchLogs(selectedContainerForLogs)"
              class="p-1 bg-[#202638] hover:bg-[#2c344c] border border-[#303a52] text-slate-300 rounded transition"
              title="Refresh Logs"
            >
              <Icon icon="lucide:refresh-cw" :class="['w-3.5 h-3.5', isLogsLoading ? 'animate-spin' : '']" />
            </button>

            <!-- Close Logs -->
            <button
              @click="selectedContainerForLogs = null"
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
          <div v-if="isLogsLoading" class="text-slate-500 italic">Memuat log container...</div>
          <div v-else-if="!logContent" class="text-slate-600 italic">Tidak ada log output.</div>
          <template v-else>
            <div
              v-for="(line, idx) in filteredLogLines"
              :key="idx"
              :class="[
                'whitespace-pre-wrap break-all',
                line.toLowerCase().includes('error') || line.toLowerCase().includes('fatal') || line.toLowerCase().includes('exception')
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
  parseDockerContainers,
  parseDockerImages,
  parseDockerVolumes,
  parseDockerNetworks,
  parseDockerStats,
  buildDockerCommand,
  type DockerContainer,
  type DockerImage,
  type DockerVolume,
  type DockerNetwork
} from '../utils/dockerParser';

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

const activeTab = ref<'containers' | 'images' | 'volumes' | 'networks'>('containers');
const searchQuery = ref('');
const useSudo = ref(props.initialUseSudo ?? false);
const isLoading = ref(false);
const isAutoRefresh = ref(false);
const permissionError = ref<string | null>(null);
const actionLoadingId = ref<string | null>(null);
const actionMessage = ref<string | null>(null);

const containers = ref<DockerContainer[]>([]);
const images = ref<DockerImage[]>([]);
const volumes = ref<DockerVolume[]>([]);
const networks = ref<DockerNetwork[]>([]);

let pollingTimer: any = null;

// Logs Viewer state
const selectedContainerForLogs = ref<DockerContainer | null>(null);
const logContent = ref('');
const logFilter = ref('');
const logTailLines = ref(100);
const isLogAutoScroll = ref(true);
const isLogsLoading = ref(false);
const logContainerRef = ref<HTMLDivElement | null>(null);

const filteredContainers = computed(() => {
  if (!searchQuery.value.trim()) return containers.value;
  const q = searchQuery.value.toLowerCase();
  return containers.value.filter(
    (c) =>
      c.names.toLowerCase().includes(q) ||
      c.image.toLowerCase().includes(q) ||
      c.id.toLowerCase().includes(q) ||
      c.ports.toLowerCase().includes(q)
  );
});

const filteredImages = computed(() => {
  if (!searchQuery.value.trim()) return images.value;
  const q = searchQuery.value.toLowerCase();
  return images.value.filter(
    (img) =>
      img.repository.toLowerCase().includes(q) ||
      img.tag.toLowerCase().includes(q) ||
      img.id.toLowerCase().includes(q)
  );
});

const filteredVolumes = computed(() => {
  if (!searchQuery.value.trim()) return volumes.value;
  const q = searchQuery.value.toLowerCase();
  return volumes.value.filter(
    (v) =>
      v.name.toLowerCase().includes(q) ||
      v.driver.toLowerCase().includes(q)
  );
});

const filteredNetworks = computed(() => {
  if (!searchQuery.value.trim()) return networks.value;
  const q = searchQuery.value.toLowerCase();
  return networks.value.filter(
    (n) =>
      n.name.toLowerCase().includes(q) ||
      n.driver.toLowerCase().includes(q) ||
      n.id.toLowerCase().includes(q)
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

async function fetchData(silent: boolean = false) {
  if (!props.sessionId) return;
  if (!silent) isLoading.value = true;
  permissionError.value = null;

  try {
    // 1. Fetch Containers
    const psCmd = buildDockerCommand(
      `docker ps -a --format '{"id":"{{.ID}}","names":"{{.Names}}","image":"{{.Image}}","status":"{{.Status}}","state":"{{.State}}","ports":"{{.Ports}}","created":"{{.CreatedAt}}"}'`,
      useSudo.value
    );
    const psOut = await tauriBridge.sshExecCommand(props.sessionId, psCmd);

    if (psOut.toLowerCase().includes('permission denied')) {
      permissionError.value = 'Akses ditolak (Permission Denied). Aktifkan Sudo Mode untuk mengakses docker daemon.';
      isLoading.value = false;
      return;
    }

    const parsedContainers = parseDockerContainers(psOut);

    // 2. Fetch Stats for running containers
    try {
      const statsCmd = buildDockerCommand(
        `docker stats --no-stream --format '{"id":"{{.ID}}","cpu":"{{.CPUPerc}}","mem":"{{.MemUsage}}"}'`,
        useSudo.value
      );
      const statsOut = await tauriBridge.sshExecCommand(props.sessionId, statsCmd);
      const statsMap = parseDockerStats(statsOut);
      for (const c of parsedContainers) {
        const sid = c.id.substring(0, 12).toLowerCase();
        if (statsMap[sid]) {
          c.cpuPercent = statsMap[sid].cpu;
          c.memUsage = statsMap[sid].mem;
        }
      }
    } catch {
      // stats optional
    }
    containers.value = parsedContainers;

    // 3. Fetch Images
    const imgCmd = buildDockerCommand(
      `docker images --format '{"id":"{{.ID}}","repository":"{{.Repository}}","tag":"{{.Tag}}","size":"{{.Size}}","created":"{{.CreatedAt}}"}'`,
      useSudo.value
    );
    const imgOut = await tauriBridge.sshExecCommand(props.sessionId, imgCmd);
    if (!imgOut.toLowerCase().includes('permission denied')) {
      images.value = parseDockerImages(imgOut);
    }

    // 4. Fetch Volumes
    const volCmd = buildDockerCommand(
      `docker volume ls --format '{"name":"{{.Name}}","driver":"{{.Driver}}","scope":"{{.Scope}}"}'`,
      useSudo.value
    );
    const volOut = await tauriBridge.sshExecCommand(props.sessionId, volCmd);
    if (!volOut.toLowerCase().includes('permission denied')) {
      volumes.value = parseDockerVolumes(volOut);
    }

    // 5. Fetch Networks
    const netCmd = buildDockerCommand(
      `docker network ls --format '{"id":"{{.ID}}","name":"{{.Name}}","driver":"{{.Driver}}","scope":"{{.Scope}}"}'`,
      useSudo.value
    );
    const netOut = await tauriBridge.sshExecCommand(props.sessionId, netCmd);
    if (!netOut.toLowerCase().includes('permission denied')) {
      networks.value = parseDockerNetworks(netOut);
    }
  } catch (err: any) {
    permissionError.value = `Gagal menjalankan Docker: ${err.message || err}`;
  } finally {
    if (!silent) isLoading.value = false;
  }
}

function execContainerShell(c: DockerContainer) {
  const cmd = buildDockerCommand(`docker exec -it ${c.names} sh`, useSudo.value);
  tauriBridge.sshWrite(props.sessionId, `${cmd}\n`);
  emit('close');
}

async function runContainerAction(c: DockerContainer, action: 'start' | 'stop' | 'restart') {
  actionLoadingId.value = c.id;
  try {
    const cmd = buildDockerCommand(`docker ${action} ${c.id}`, useSudo.value);
    await tauriBridge.sshExecCommand(props.sessionId, cmd);
    setFlashMessage(`Container ${c.names} berhasil di-${action}`);
    await fetchData(true);
  } catch (err: any) {
    dialogStore.showToast(`Gagal ${action} container: ${err.message || err}`, 'error');
  } finally {
    actionLoadingId.value = null;
  }
}

async function confirmStopContainer(c: DockerContainer) {
  const ok = await dialogStore.confirm({
    title: 'Hentikan Container (Stop)',
    description: `Apakah Anda yakin ingin menghentikan container "${c.names}"?\n• Image: ${c.image}\n• ID: ${c.id.substring(0, 12)}\n• Port: ${c.ports || '-'}\n\nLayanan di dalam container ini tidak akan dapat diakses hingga dijalankan kembali.`,
    confirmText: 'Stop Container',
    isDestructive: true
  });
  if (!ok) return;
  await runContainerAction(c, 'stop');
}

async function confirmRestartContainer(c: DockerContainer) {
  const ok = await dialogStore.confirm({
    title: 'Restart Container',
    description: `Apakah Anda yakin ingin me-restart container "${c.names}"?\n• Image: ${c.image}\n• ID: ${c.id.substring(0, 12)}\n• Uptime Saat Ini: ${c.status}\n\nKoneksi aktif ke container ini akan terputus sesaat saat proses restart.`,
    confirmText: 'Restart Container',
    isDestructive: false
  });
  if (!ok) return;
  await runContainerAction(c, 'restart');
}

async function confirmDeleteContainer(c: DockerContainer) {
  const ok = await dialogStore.confirm({
    title: 'Hapus Container Docker (Permanen)',
    description: `Apakah Anda yakin ingin menghapus container "${c.names}" secara permanen?\n• Image: ${c.image}\n• ID: ${c.id.substring(0, 12)}\n• Status: ${c.status}\n\nPERINGATAN: Perintah "docker rm -f" akan dipanggil. Semua data di dalam layer container yang tidak disimpan di volume akan terhapus dan tidak bisa dikembalikan.`,
    confirmText: 'Hapus Container',
    isDestructive: true
  });
  if (!ok) return;

  actionLoadingId.value = c.id;
  try {
    const cmd = buildDockerCommand(`docker rm -f ${c.id}`, useSudo.value);
    await tauriBridge.sshExecCommand(props.sessionId, cmd);
    setFlashMessage(`Container ${c.names} berhasil dihapus`);
    await fetchData(true);
  } catch (err: any) {
    dialogStore.showToast(`Gagal menghapus container: ${err.message || err}`, 'error');
  } finally {
    actionLoadingId.value = null;
  }
}

async function confirmDeleteImage(img: DockerImage) {
  const imgLabel = `${img.repository}:${img.tag}`;
  const ok = await dialogStore.confirm({
    title: 'Hapus Docker Image',
    description: `Apakah Anda yakin ingin menghapus image "${imgLabel}"?\n• Image ID: ${img.id.replace('sha256:', '').substring(0, 12)}\n• Ukuran: ${img.size}\n• Dibuat: ${img.created}\n\nImage ini akan dihapus dari penyimpanan server ("docker rmi").`,
    confirmText: 'Hapus Image',
    isDestructive: true
  });
  if (!ok) return;

  actionLoadingId.value = img.id;
  try {
    const cmd = buildDockerCommand(`docker rmi ${img.id}`, useSudo.value);
    await tauriBridge.sshExecCommand(props.sessionId, cmd);
    setFlashMessage(`Image ${imgLabel} berhasil dihapus`);
    await fetchData(true);
  } catch (err: any) {
    dialogStore.showToast(`Gagal menghapus image: ${err.message || err}`, 'error');
  } finally {
    actionLoadingId.value = null;
  }
}

async function confirmDeleteVolume(v: DockerVolume) {
  const ok = await dialogStore.confirm({
    title: 'Hapus Docker Volume',
    description: `Apakah Anda yakin ingin menghapus volume "${v.name}"?\n• Driver: ${v.driver}\n• Scope: ${v.scope}\n\nPERINGATAN: Data persisten di dalam volume ini akan hilang secara permanen.`,
    confirmText: 'Hapus Volume',
    isDestructive: true
  });
  if (!ok) return;

  actionLoadingId.value = v.name;
  try {
    const cmd = buildDockerCommand(`docker volume rm ${v.name}`, useSudo.value);
    await tauriBridge.sshExecCommand(props.sessionId, cmd);
    setFlashMessage(`Volume ${v.name} berhasil dihapus`);
    await fetchData(true);
  } catch (err: any) {
    dialogStore.showToast(`Gagal menghapus volume: ${err.message || err}`, 'error');
  } finally {
    actionLoadingId.value = null;
  }
}

async function confirmDeleteNetwork(net: DockerNetwork) {
  const ok = await dialogStore.confirm({
    title: 'Hapus Docker Network',
    description: `Apakah Anda yakin ingin menghapus network "${net.name}" (${net.id.substring(0, 12)})?\n• Driver: ${net.driver}\n• Scope: ${net.scope}`,
    confirmText: 'Hapus Network',
    isDestructive: true
  });
  if (!ok) return;

  actionLoadingId.value = net.id;
  try {
    const cmd = buildDockerCommand(`docker network rm ${net.id}`, useSudo.value);
    await tauriBridge.sshExecCommand(props.sessionId, cmd);
    setFlashMessage(`Network ${net.name} berhasil dihapus`);
    await fetchData(true);
  } catch (err: any) {
    dialogStore.showToast(`Gagal menghapus network: ${err.message || err}`, 'error');
  } finally {
    actionLoadingId.value = null;
  }
}

function changeLogTail(lines: number) {
  logTailLines.value = lines;
  if (selectedContainerForLogs.value) {
    fetchLogs(selectedContainerForLogs.value);
  }
}

async function openLogs(c: DockerContainer) {
  selectedContainerForLogs.value = c;
  await fetchLogs(c);
}

async function fetchLogs(c: DockerContainer) {
  if (!c) return;
  isLogsLoading.value = true;
  try {
    const cmd = buildDockerCommand(`docker logs --tail ${logTailLines.value} ${c.id}`, useSudo.value);
    const out = await tauriBridge.sshExecCommand(props.sessionId, cmd);
    logContent.value = out;

    await nextTick();
    if (logContainerRef.value) {
      logContainerRef.value.scrollTop = logContainerRef.value.scrollHeight;
    }
    setTimeout(() => {
      if (logContainerRef.value) {
        logContainerRef.value.scrollTop = logContainerRef.value.scrollHeight;
      }
    }, 50);
  } catch (err: any) {
    logContent.value = `Gagal mengambil log: ${err.message || err}`;
  } finally {
    isLogsLoading.value = false;
  }
}

function copyLogs() {
  if (!logContent.value) return;
  navigator.clipboard.writeText(logContent.value);
  setFlashMessage('Log berhasil disalin ke clipboard');
}

function analyzeLogsWithAI() {
  if (!selectedContainerForLogs.value || !logContent.value) return;
  const recentLogs = logContent.value.split('\n').slice(-60).join('\n');
  const prompt = `Tolong analisa log container Docker berikut:\nContainer: ${selectedContainerForLogs.value.names} (Image: ${selectedContainerForLogs.value.image})\n\nLog:\n\`\`\`\n${recentLogs}\n\`\`\`\nJelaskan masalahnya dan berikan langkah perbaikannya secara ringkas.`;
  
  aiAgentStore.sendPromptWithContext(prompt, props.sessionId);
  selectedContainerForLogs.value = null;
  emit('close');
}

function close() {
  emit('close');
}

watch(isAutoRefresh, (val) => {
  if (pollingTimer) clearInterval(pollingTimer);
  if (val) {
    pollingTimer = setInterval(() => {
      if (props.isOpen && !selectedContainerForLogs.value) {
        fetchData(true);
      }
    }, 6000);
  }
});

onMounted(() => {
  if (props.isOpen) {
    fetchData();
  }
});

onUnmounted(() => {
  if (pollingTimer) clearInterval(pollingTimer);
});
</script>
