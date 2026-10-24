<template>
  <div
    v-if="aiStore.isProviderModalOpen"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-in fade-in duration-100"
    @click.self="aiStore.closeProviderModal"
  >
    <div class="bg-boba-950 border border-boba-800 shadow-2xl rounded-xl w-full max-w-4xl text-[12px] text-slate-200 overflow-hidden flex flex-col font-sans max-h-[90vh]">
      <!-- Modal Header -->
      <div class="px-5 py-3 bg-boba-900 border-b border-boba-800 flex items-center justify-between">
        <div class="flex items-center space-x-2">
          <Icon icon="lucide:settings-2" class="w-4 h-4 text-purple-400" />
          <span class="font-bold text-slate-100 text-sm">Pengaturan Provider & AI Copilot</span>
        </div>
        <button
          @click="aiStore.closeProviderModal"
          class="text-slate-400 hover:text-white text-base px-2 py-0.5 rounded transition hover:bg-boba-800"
          title="Tutup (Esc)"
        >
          ✕
        </button>
      </div>

      <!-- Modal Body (2 Columns) -->
      <div class="flex-1 flex overflow-hidden">
        <!-- Left Column: Providers List & Navigation -->
        <div class="w-64 border-r border-boba-800 bg-boba-900/60 p-3 flex flex-col space-y-2 overflow-y-auto no-scrollbar">
          <div class="flex items-center justify-between pb-1 gap-1">
            <span class="text-[11px] font-semibold text-slate-400 uppercase tracking-wider truncate">Provider</span>
            <div class="flex items-center space-x-1 shrink-0">
              <button
                type="button"
                @click="handleScanLocal"
                :disabled="isScanning"
                class="px-2 py-0.5 bg-purple-900/50 hover:bg-purple-800 text-purple-200 border border-purple-700/60 rounded text-[10px] font-medium transition flex items-center space-x-1 shadow disabled:opacity-50"
                title="Pindai AI dari OpenCode, Codex CLI, Claude CLI, Ollama, & Environment PC"
              >
                <Icon icon="lucide:scan" :class="['w-3 h-3', isScanning ? 'animate-spin' : '']" />
                <span>{{ isScanning ? 'Scan...' : 'Auto-Scan' }}</span>
              </button>
              <button
                type="button"
                @click="handleNewProvider"
                class="px-2 py-0.5 bg-boba-accent hover:bg-boba-accent-hover text-white rounded text-[10px] font-medium transition flex items-center space-x-1 shadow"
                title="Tambah manual"
              >
                <span>+ Tambah</span>
              </button>
            </div>
          </div>

          <!-- Provider Items -->
          <div class="space-y-1.5 flex-1">
            <div
              v-for="p in aiStore.providers"
              :key="p.id"
              @click="selectProvider(p)"
              :class="[
                'p-2.5 rounded-lg border cursor-pointer transition flex flex-col space-y-1 select-none',
                !isGuideActive && !isScanResultActive && selectedId === p.id
                  ? 'bg-boba-accent/15 border-boba-accent text-sky-100 shadow-sm'
                  : 'bg-boba-900 border-boba-800 text-slate-300 hover:border-boba-700 hover:bg-boba-850'
              ]"
            >
              <div class="flex items-center justify-between">
                <span class="font-semibold truncate text-[11px]">{{ p.name }}</span>
                <span
                  v-if="aiStore.activeProviderId === p.id"
                  class="px-1.5 py-0.2 bg-emerald-950 text-emerald-300 border border-emerald-800 rounded text-[9px] font-mono shrink-0"
                >
                  Aktif
                </span>
              </div>
              <div class="flex items-center justify-between text-[10px] text-slate-400 font-mono">
                <span class="capitalize">{{ p.type }}</span>
                <span class="truncate max-w-[110px]" :title="p.model">{{ p.model || 'No model' }}</span>
              </div>
              <div v-if="p.source" class="text-[9px] text-purple-300/80 truncate">
                <span>📍 {{ p.source }}</span>
              </div>
            </div>

            <!-- Empty State / Scan Prompt -->
            <div v-if="aiStore.providers.length === 0" class="text-center py-6 px-2 text-slate-400 text-[11px] space-y-2.5">
              <p>Belum ada provider tersimpan.</p>
              <button
                type="button"
                @click="handleScanLocal"
                class="w-full py-1.5 px-2 bg-purple-900/40 hover:bg-purple-800/60 border border-purple-700/60 text-purple-200 rounded text-[11px] font-medium transition flex items-center justify-center space-x-1.5"
              >
                <Icon icon="lucide:scan" class="w-3.5 h-3.5" />
                <span>Auto-Scan AI di PC</span>
              </button>
            </div>
          </div>

          <!-- AI Language Preference in Sidebar -->
          <div class="p-2.5 rounded-lg bg-boba-900/90 border border-boba-800 space-y-1.5 select-none mt-auto">
            <div class="flex items-center justify-between text-[11px] font-semibold text-slate-300">
              <span class="flex items-center space-x-1.5">
                <Icon icon="lucide:languages" class="w-3.5 h-3.5 text-sky-400" />
                <span>Bahasa Respon AI</span>
              </span>
            </div>
            <select
              :value="aiStore.aiLanguage || 'en'"
              @change="handleLanguageChange(($event.target as HTMLSelectElement).value)"
              class="w-full bg-boba-950 border border-boba-800 text-sky-300 rounded px-2 py-1 text-[11px] focus:outline-none focus:border-boba-accent font-sans cursor-pointer transition"
            >
              <option value="en">English (Default)</option>
              <option value="id">Bahasa Indonesia</option>
              <option value="es">Español</option>
              <option value="zh">中文 (Chinese)</option>
              <option value="ja">日本語 (Japanese)</option>
            </select>
            <div class="text-[9.5px] text-slate-400 leading-tight">
              Bahasa yang digunakan AI saat menganalisis & membuat kesimpulan.
            </div>
          </div>

          <!-- Bottom: Panduan Penggunaan Button -->
          <div class="pt-2 border-t border-boba-800">
            <button
              @click="openGuide"
              :class="[
                'w-full p-2.5 rounded-lg border text-left transition flex items-center space-x-2.5 select-none',
                isGuideActive
                  ? 'bg-boba-accent/20 border-boba-accent text-sky-200 shadow-sm'
                  : 'bg-boba-900 border-boba-800 text-slate-300 hover:border-boba-700 hover:bg-boba-850'
              ]"
            >
              <span class="text-base shrink-0">📖</span>
              <div class="flex-1 min-w-0">
                <div class="font-semibold text-[11px] leading-tight text-white">Panduan Penggunaan</div>
                <div class="text-[9.5px] text-slate-400 truncate">Cara setting, tools, & tips</div>
              </div>
            </button>
          </div>
        </div>

        <!-- Right Column: Content Area (Guide or Provider Form) -->
        <div class="flex-1 p-5 overflow-y-auto no-scrollbar space-y-4 bg-boba-950">
          <!-- 1. USER GUIDE VIEW -->
          <div v-if="isGuideActive" class="space-y-4 animate-in fade-in duration-150">
            <div class="border-b border-boba-800 pb-3">
              <h3 class="text-sm font-bold text-slate-100 flex items-center space-x-2">
                <span>📖</span>
                <span>Panduan Lengkap AI Server Copilot</span>
              </h3>
              <p class="text-[11px] text-slate-400 mt-0.5 leading-relaxed">
                Panduan praktis untuk konfigurasi provider AI, pemahaman mode kerja agent server, dan penggunaan fitur secara optimal.
              </p>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-3.5">
              <!-- Card 1: Konfigurasi Provider -->
              <div class="bg-boba-900 border border-boba-800 rounded-xl p-3.5 space-y-2">
                <div class="flex items-center space-x-2 text-sky-300 font-semibold text-xs border-b border-boba-800 pb-1.5">
                  <span>🔌</span>
                  <span>1. Cara Setting Provider & Tarik Model</span>
                </div>
                <ul class="text-[11px] text-slate-300 space-y-1.5 leading-relaxed list-disc list-inside">
                  <li>
                    <strong class="text-slate-100">Base URL:</strong> Masukkan URL endpoint API Anda. Mendukung OpenAI, Claude, Gemini, Ollama lokal (<code class="bg-boba-950 px-1 py-0.5 rounded text-sky-300 font-mono">http://localhost:11434</code>), dan router OpenAI-compatible.
                  </li>
                  <li>
                    <strong class="text-slate-100">Tarik Daftar Model:</strong> Klik tombol <span class="bg-boba-800 px-1.5 py-0.5 rounded text-sky-300">🔄 Tarik Daftar Model</span> untuk otomatis mendeteksi semua model yang aktif di server provider tanpa perlu ketik manual.
                  </li>
                  <li>
                    <strong class="text-slate-100">Jadikan Default:</strong> Tekan tombol <em>Jadikan Default</em> agar model dipilih saat Anda membuka chat AI.
                  </li>
                </ul>
              </div>

              <!-- Card 2: Mode Kerja & Eksekusi Agent -->
              <div class="bg-boba-900 border border-boba-800 rounded-xl p-3.5 space-y-2">
                <div class="flex items-center space-x-2 text-amber-300 font-semibold text-xs border-b border-boba-800 pb-1.5">
                  <span>🛡️</span>
                  <span>2. Mode Kerja (Plan/Build) & Eksekusi</span>
                </div>
                <ul class="text-[11px] text-slate-300 space-y-1.5 leading-relaxed list-disc list-inside">
                  <li>
                    <strong class="text-purple-300">📋 Mode Plan:</strong> Diagnostik murni (Read-Only). AI hanya membaca file log/status dan menyusun rencana perbaikan tanpa memodifikasi sistem server.
                  </li>
                  <li>
                    <strong class="text-emerald-300">🔨 Mode Build:</strong> Mode eksekusi penuh untuk memperbaiki server, mengedit konfigurasi, dan menjalankan perintah perbaikan.
                  </li>
                  <li>
                    <strong class="text-sky-300">🛡️ Confirm vs ⚡ Auto:</strong> Pilih apakah setiap perintah memerlukan persetujuan manual Anda atau dieksekusi otomatis oleh AI.
                  </li>
                </ul>
              </div>

              <!-- Card 3: Kemampuan Tool Server -->
              <div class="bg-boba-900 border border-boba-800 rounded-xl p-3.5 space-y-2">
                <div class="flex items-center space-x-2 text-emerald-300 font-semibold text-xs border-b border-boba-800 pb-1.5">
                  <span>🛠️</span>
                  <span>3. Kemampuan Tool Server Remote</span>
                </div>
                <div class="space-y-1.5 text-[11px] text-slate-300 leading-relaxed font-sans">
                  <div class="bg-boba-950 p-2 rounded border border-boba-800/80 space-y-1">
                    <div class="font-mono text-sky-300 font-semibold text-[10.5px]">exec_command</div>
                    <p class="text-slate-400 text-[10.5px]">Menjalankan perintah bash di server remote via SSH (status service, port, tail log, diagnosa).</p>
                  </div>
                  <div class="bg-boba-950 p-2 rounded border border-boba-800/80 space-y-1">
                    <div class="font-mono text-sky-300 font-semibold text-[10.5px]">read_file & write_file</div>
                    <p class="text-slate-400 text-[10.5px]">Membaca & mengubah file server secara langsung. Setiap penulisan otomatis membuat cadangan <code class="text-amber-300 font-mono">&lt;file&gt;.boba.bak</code> sebelum ditimpa.</p>
                  </div>
                  <div class="bg-boba-950 p-2 rounded border border-boba-800/80 space-y-1">
                    <div class="font-mono text-sky-300 font-semibold text-[10.5px]">get_system_metrics</div>
                    <p class="text-slate-400 text-[10.5px]">Mengambil metrik real-time penggunaan CPU, RAM, Disk, dan Uptime server.</p>
                  </div>
                </div>
              </div>

              <!-- Card 4: Pintasan & Tips Penggunaan -->
              <div class="bg-boba-900 border border-boba-800 rounded-xl p-3.5 space-y-2">
                <div class="flex items-center space-x-2 text-purple-300 font-semibold text-xs border-b border-boba-800 pb-1.5">
                  <span>✨</span>
                  <span>4. Pintasan Konteks & Tips Cepat</span>
                </div>
                <ul class="text-[11px] text-slate-300 space-y-1.5 leading-relaxed list-disc list-inside">
                  <li>
                    <strong class="text-slate-100">Shortcut Global:</strong> Tekan <kbd class="bg-boba-950 border border-boba-700 px-1.5 py-0.5 rounded text-sky-300 font-mono text-[10px]">Ctrl + Shift + A</kbd> kapan saja untuk membuka/menutup panel AI Copilot.
                  </li>
                  <li>
                    <strong class="text-slate-100">Analisis Error Terminal:</strong> Blok teks log error di terminal SSH ➔ Klik kanan ➔ <span class="text-sky-300">✨ Analisis Error dengan AI</span>.
                  </li>
                  <li>
                    <strong class="text-slate-100">Analisis File SFTP:</strong> Klik kanan file log atau file config di SFTP Manager ➔ <span class="text-sky-300">✨ Analisis File dengan AI Copilot</span>.
                  </li>
                  <li>
                    <strong class="text-slate-100">Ubah Ukuran Chat:</strong> Tarik border kiri panel chat untuk memperlebar atau tekan tombol <kbd class="bg-boba-950 px-1 rounded font-mono">⤢</kbd> di header.
                  </li>
                </ul>
              </div>
            </div>

            <div class="pt-2 flex justify-end">
              <button
                type="button"
                @click="handleNewProvider"
                class="px-4 py-2 bg-boba-accent hover:bg-boba-accent-hover text-white rounded-lg text-xs font-semibold transition shadow"
              >
                + Konfigurasi Provider Baru Sekarang
              </button>
            </div>
          </div>

          <!-- 2. SCAN RESULT VIEW -->
          <div v-else-if="isScanResultActive" class="space-y-4 animate-in fade-in duration-150">
            <div class="border-b border-boba-800 pb-3 flex items-center justify-between">
              <div>
                <h3 class="text-sm font-bold text-slate-100 flex items-center space-x-2">
                  <Icon icon="lucide:scan" class="w-4 h-4 text-purple-400" />
                  <span>Provider AI Terdeteksi di PC</span>
                </h3>
                <p class="text-[11px] text-slate-400 mt-0.5">
                  Ditemukan {{ detectedList.length }} provider dari OpenCode, Codex CLI, Claude CLI, Ollama, dan Environment OS.
                </p>
              </div>
              <div class="flex items-center space-x-2">
                <button
                  type="button"
                  @click="handleScanLocal"
                  :disabled="isScanning"
                  class="px-2.5 py-1 bg-boba-850 hover:bg-boba-800 border border-boba-700 text-slate-200 rounded text-[11px] transition flex items-center space-x-1 disabled:opacity-50"
                >
                  <Icon icon="lucide:refresh-cw" :class="['w-3 h-3', isScanning ? 'animate-spin' : '']" />
                  <span>Scan Ulang</span>
                </button>
              </div>
            </div>

            <div v-if="detectedList.length === 0" class="py-12 text-center text-slate-400 space-y-2">
              <Icon icon="lucide:search-x" class="w-8 h-8 mx-auto text-slate-500" />
              <p class="text-xs">Tidak ditemukan provider AI aktif di PC.</p>
              <p class="text-[10px] text-slate-500">
                Pastikan OpenCode, Codex CLI, Claude CLI, atau Ollama sudah terpasang.
              </p>
            </div>

            <div v-else class="space-y-2.5 max-h-[50vh] overflow-y-auto no-scrollbar pr-1">
              <div
                v-for="d in detectedList"
                :key="d.id"
                @click="toggleDetectedSelect(d.id)"
                :class="[
                  'p-3 rounded-xl border transition cursor-pointer flex items-start space-x-3',
                  selectedDetectedIds.includes(d.id)
                    ? 'bg-purple-950/20 border-purple-600/70 shadow-sm'
                    : 'bg-boba-900 border-boba-800 opacity-60 hover:opacity-100'
                ]"
              >
                <input
                  type="checkbox"
                  :checked="selectedDetectedIds.includes(d.id)"
                  class="mt-1 rounded border-boba-700 text-boba-accent focus:ring-0 cursor-pointer pointer-events-none"
                />
                <div class="flex-1 min-w-0 space-y-1">
                  <div class="flex items-center justify-between">
                    <span class="font-bold text-xs text-slate-100 truncate">{{ d.name }}</span>
                    <span class="text-[9.5px] px-2 py-0.5 rounded-full bg-purple-900/60 text-purple-200 border border-purple-700/60 font-medium">
                      {{ d.source }}
                    </span>
                  </div>
                  <div class="text-[10.5px] text-slate-400 font-mono truncate">
                    <span>Endpoint: {{ d.baseUrl || '(Default)' }}</span>
                  </div>
                  <div class="flex items-center space-x-3 text-[10px] text-slate-300">
                    <span class="capitalize text-sky-400 font-mono">Tipe: {{ d.type }}</span>
                    <span v-if="d.availableModels && d.availableModels.length > 0" class="text-emerald-400 font-mono">
                      ✓ {{ d.availableModels.length }} model terdeteksi
                    </span>
                    <span v-if="d.model" class="text-slate-400 font-mono truncate max-w-[200px]" :title="d.model">
                      Default: {{ d.model }}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <!-- Import Action Bar -->
            <div v-if="detectedList.length > 0" class="pt-3 border-t border-boba-800 flex items-center justify-between">
              <div class="text-[11px] text-slate-400">
                <span class="font-semibold text-slate-200">{{ selectedDetectedIds.length }}</span> dari {{ detectedList.length }} dipilih
              </div>
              <div class="flex items-center space-x-2">
                <button
                  type="button"
                  @click="selectAllDetected"
                  class="px-3 py-1.5 bg-boba-850 hover:bg-boba-800 border border-boba-700 text-slate-300 rounded-lg text-xs transition"
                >
                  {{ selectedDetectedIds.length === detectedList.length ? 'Lepas Semua' : 'Pilih Semua' }}
                </button>
                <button
                  type="button"
                  @click="handleImportDetected"
                  :disabled="selectedDetectedIds.length === 0 || isImporting"
                  class="px-4 py-1.5 bg-boba-accent hover:bg-boba-accent-hover disabled:opacity-50 text-white font-semibold rounded-lg text-xs transition shadow-md flex items-center space-x-1.5"
                >
                  <Icon icon="lucide:download" class="w-3.5 h-3.5" />
                  <span>Impor ke BOBA ({{ selectedDetectedIds.length }})</span>
                </button>
              </div>
            </div>
          </div>

          <!-- 3. PROVIDER FORM VIEW -->
          <div v-else-if="form" class="space-y-3.5 animate-in fade-in duration-150">
            <!-- Helper Banner with Link to Guide -->
            <div class="p-2.5 rounded-lg bg-boba-900 border border-boba-800 flex items-center justify-between text-[11px]">
              <div class="flex items-center space-x-2 text-slate-300">
                <span>💡</span>
                <span>Butuh bantuan setting provider atau penjelasan mode eksekusi?</span>
              </div>
              <button
                type="button"
                @click="openGuide"
                class="text-boba-accent hover:underline font-semibold flex items-center space-x-1"
              >
                <span>Baca Panduan</span>
                <span>➔</span>
              </button>
            </div>

            <!-- Provider Type -->
            <div>
              <label class="block text-[11px] font-semibold text-slate-300 mb-1">Tipe Provider</label>
              <div class="grid grid-cols-3 sm:grid-cols-5 gap-2">
                <button
                  v-for="t in providerTypes"
                  :key="t.value"
                  type="button"
                  @click="changeType(t.value as any)"
                  :class="[
                    'py-1.5 px-2 rounded border text-[11px] font-medium transition text-center',
                    form.type === t.value
                      ? 'bg-boba-accent text-white border-boba-accent shadow'
                      : 'bg-boba-900 border-boba-800 text-slate-300 hover:bg-boba-850 hover:border-boba-700'
                  ]"
                >
                  {{ t.label }}
                </button>
              </div>
            </div>

            <!-- Profile Name -->
            <div>
              <div class="flex items-center justify-between mb-1">
                <label class="block text-[11px] font-semibold text-slate-300">Nama Profil</label>
                <span v-if="form.source" class="text-[9.5px] px-2 py-0.5 rounded-full bg-purple-950 text-purple-300 border border-purple-800/80 font-mono">
                  📍 {{ form.source }}
                </span>
              </div>
              <input
                v-model="form.name"
                type="text"
                placeholder="Misal: OpenAI GPT-4o, DeepSeek Prod, Ollama Lokal"
                class="w-full bg-boba-900 border border-boba-800 rounded-lg px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-boba-accent focus:ring-1 focus:ring-boba-accent/30 font-sans transition"
              />
            </div>

            <!-- Base URL -->
            <div>
              <div class="flex items-center justify-between mb-1">
                <label class="text-[11px] font-semibold text-slate-300">Base URL Endpoint</label>
                <span class="text-[10px] text-slate-500 font-mono">Contoh: https://router.hariansaku.id/v1</span>
              </div>
              <input
                v-model="form.baseUrl"
                type="text"
                :placeholder="form.type === 'opencode' ? 'http://127.0.0.1:28894' : 'https://api.openai.com/v1'"
                class="w-full bg-boba-900 border border-boba-800 rounded-lg px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-boba-accent focus:ring-1 focus:ring-boba-accent/30 font-mono transition"
              />
            </div>

            <!-- API Key -->
            <div>
              <div class="flex items-center justify-between mb-1">
                <label class="text-[11px] font-semibold text-slate-300">API Key</label>
                <button
                  type="button"
                  @click="showKey = !showKey"
                  class="text-[10px] text-sky-400 hover:text-sky-300 transition"
                >
                  {{ showKey ? 'Sembunyikan' : 'Perlihatkan' }}
                </button>
              </div>
              <input
                v-model="form.apiKey"
                :type="showKey ? 'text' : 'password'"
                :placeholder="form.type === 'ollama' ? 'Opsional untuk Ollama' : (form.type === 'opencode' ? 'Password dari service.json (otomatis terisi saat Auto-Scan)' : 'sk-...')"
                class="w-full bg-boba-900 border border-boba-800 rounded-lg px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-boba-accent focus:ring-1 focus:ring-boba-accent/30 font-mono transition"
              />
            </div>

            <!-- Model Name with Dynamic Fetch Button -->
            <div>
              <div class="flex items-center justify-between mb-1">
                <label class="text-[11px] font-semibold text-slate-300">Nama Model (Model ID)</label>
                <!-- Tombol Tarik Model Dinamis -->
                <button
                  type="button"
                  @click="handleFetchModels"
                  :disabled="isFetchingModels"
                  class="text-[10px] px-2.5 py-1 rounded bg-boba-850 border border-boba-700 text-sky-300 hover:text-white hover:border-boba-accent hover:bg-boba-800 transition flex items-center space-x-1.5 disabled:opacity-50 shadow-sm"
                  title="Ambil daftar model yang tersedia langsung dari Base URL provider"
                >
                  <Icon icon="lucide:refresh-cw" :class="['w-3 h-3', isFetchingModels ? 'animate-spin' : '']" />
                  <span>{{ isFetchingModels ? 'Menarik Model...' : 'Tarik Daftar Model' }}</span>
                </button>
              </div>

              <!-- Dropdown jika model sudah ditarik -->
              <div v-if="availableModels.length > 0" class="mb-2">
                <select
                  v-model="form.model"
                  class="w-full bg-boba-900 border border-boba-700 text-sky-300 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:border-boba-accent focus:ring-1 focus:ring-boba-accent/30 font-mono cursor-pointer transition"
                >
                  <option v-for="m in availableModels" :key="m" :value="m">{{ m }}</option>
                </select>
              </div>

              <!-- Input text biasa untuk custom model -->
              <input
                v-model="form.model"
                type="text"
                placeholder="gpt-4o, claude-3-7-sonnet-20250219, ag/gemini-3.8-flash..."
                class="w-full bg-boba-900 border border-boba-800 rounded-lg px-3 py-1.5 text-xs text-slate-100 focus:outline-none focus:border-boba-accent focus:ring-1 focus:ring-boba-accent/30 font-mono transition"
              />
            </div>

            <!-- Action Buttons -->
            <div class="pt-4 border-t border-boba-800 flex items-center justify-between">
              <button
                v-if="form.id && aiStore.providers.some(p => p.id === form.id)"
                type="button"
                @click="handleDelete"
                class="px-3 py-1.5 bg-rose-950/60 hover:bg-rose-900/80 border border-rose-800/80 text-rose-300 hover:text-rose-100 rounded-lg text-xs transition"
              >
                Hapus Provider
              </button>
              <div v-else></div>

              <div class="flex items-center space-x-2">
                <button
                  type="button"
                  @click="handleSetDefault"
                  class="px-3.5 py-1.5 bg-boba-800 hover:bg-boba-700 text-slate-200 rounded-lg text-xs transition font-medium"
                >
                  Jadikan Default
                </button>
                <button
                  type="button"
                  @click="handleSave"
                  class="px-4 py-1.5 bg-boba-accent hover:bg-boba-accent-hover text-white font-semibold rounded-lg text-xs transition shadow-md"
                >
                  Simpan
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch, onMounted, onUnmounted } from 'vue';
import { Icon } from '@iconify/vue';
import type { AiProviderConfig, AiProviderType } from '../types/index.js';
import { useAiAgentStore } from '../stores/aiAgentStore.js';
import { useDialogStore } from '../stores/dialogStore.js';
import { fetchAvailableModels } from '../services/aiAdapters.js';
import { tauriBridge } from '../services/tauriBridge.js';

const aiStore = useAiAgentStore();
const dialogStore = useDialogStore();

const providerTypes = [
  { value: 'opencode', label: 'OpenCode Free' },
  { value: 'openai', label: 'OpenAI' },
  { value: 'anthropic', label: 'Claude' },
  { value: 'gemini', label: 'Gemini' },
  { value: 'ollama', label: 'Ollama' },
  { value: 'custom', label: 'Custom / OpenRouter' },
];

const selectedId = ref<string>('');
const isGuideActive = ref(false);
const showKey = ref(false);
const isFetchingModels = ref(false);
const availableModels = ref<string[]>([]);

// Local AI auto-detection states
const isScanning = ref(false);
const isScanResultActive = ref(false);
const detectedList = ref<AiProviderConfig[]>([]);
const selectedDetectedIds = ref<string[]>([]);
const isImporting = ref(false);

const form = ref<AiProviderConfig>({
  id: '',
  name: '',
  type: 'openai',
  baseUrl: 'https://api.openai.com/v1',
  apiKey: '',
  model: 'gpt-4o',
  availableModels: [],
});

function openGuide() {
  isGuideActive.value = true;
  isScanResultActive.value = false;
  selectedId.value = '';
}

function handleLanguageChange(lang: string) {
  aiStore.setAiLanguage(lang);
  dialogStore.showToast(
    lang === 'id' ? 'Bahasa Respon AI diubah ke Bahasa Indonesia' : `AI Response Language set to ${lang.toUpperCase()}`,
    'info',
    2000
  );
}

async function handleScanLocal() {
  isScanning.value = true;
  isGuideActive.value = false;
  try {
    const list = await tauriBridge.detectLocalAiProviders();
    detectedList.value = list || [];
    selectedDetectedIds.value = (list || []).map(d => d.id);
    isScanResultActive.value = true;
    selectedId.value = '';
    if (!list || list.length === 0) {
      dialogStore.showToast('Tidak ditemukan provider AI di PC lokal', 'info', 2500);
    } else {
      dialogStore.showToast(`Ditemukan ${list.length} provider AI di PC!`, 'success', 2500);
    }
  } catch (err: any) {
    dialogStore.alert({
      title: 'Gagal Scan AI Lokal',
      description: `Terjadi kesalahan saat memindai PC: ${err.message || String(err)}`,
      variant: 'error',
    });
  } finally {
    isScanning.value = false;
  }
}

function toggleDetectedSelect(id: string) {
  if (selectedDetectedIds.value.includes(id)) {
    selectedDetectedIds.value = selectedDetectedIds.value.filter(i => i !== id);
  } else {
    selectedDetectedIds.value.push(id);
  }
}

function selectAllDetected() {
  if (selectedDetectedIds.value.length === detectedList.value.length) {
    selectedDetectedIds.value = [];
  } else {
    selectedDetectedIds.value = detectedList.value.map(d => d.id);
  }
}

async function handleImportDetected() {
  const toImport = detectedList.value.filter(d => selectedDetectedIds.value.includes(d.id));
  if (toImport.length === 0) return;

  isImporting.value = true;
  try {
    for (const item of toImport) {
      await aiStore.saveProvider(item);
    }
    dialogStore.showToast(`Berhasil mengimpor ${toImport.length} provider ke BOBA!`, 'success', 2500);
    isScanResultActive.value = false;
    const [first] = toImport;
    if (first) {
      selectProvider(first);
    }
  } catch (err: any) {
    dialogStore.alert({
      title: 'Gagal Impor Provider',
      description: err.message || String(err),
      variant: 'error',
    });
  } finally {
    isImporting.value = false;
  }
}

function changeType(type: AiProviderType) {
  form.value.type = type;
  availableModels.value = [];
  if (type === 'opencode') {
    form.value.baseUrl = 'http://127.0.0.1:28894';
    form.value.model = '';
    void handleFetchModels();
  } else if (type === 'openai') {
    form.value.baseUrl = 'https://api.openai.com/v1';
    form.value.model = 'gpt-4o';
  } else if (type === 'anthropic') {
    form.value.baseUrl = 'https://api.anthropic.com';
    form.value.model = 'claude-3-7-sonnet-20250219';
  } else if (type === 'gemini') {
    form.value.baseUrl = 'https://generativelanguage.googleapis.com';
    form.value.model = 'gemini-2.5-flash';
  } else if (type === 'ollama') {
    form.value.baseUrl = 'http://localhost:11434';
    form.value.model = 'qwen2.5-coder:7b';
  } else {
    form.value.baseUrl = 'https://api.deepseek.com/v1';
    form.value.model = 'deepseek-chat';
  }
}

async function selectProvider(p: AiProviderConfig) {
  isGuideActive.value = false;
  isScanResultActive.value = false;
  selectedId.value = p.id;
  form.value = { ...p };
  availableModels.value = p.availableModels || [];
  if (!p.apiKey && p.type !== 'ollama') {
    const enriched = await aiStore.getProviderWithSecret(p);
    if (enriched?.apiKey && selectedId.value === p.id) {
      form.value.apiKey = enriched.apiKey;
    }
  }
}

function handleNewProvider() {
  isGuideActive.value = false;
  isScanResultActive.value = false;
  const id = `provider_${Date.now()}`;
  selectedId.value = id;
  form.value = {
    id,
    name: 'Provider Baru',
    type: 'custom',
    baseUrl: 'https://api.deepseek.com/v1',
    apiKey: '',
    model: 'deepseek-chat',
    availableModels: [],
  };
  availableModels.value = [];
}

async function handleFetchModels() {
  isFetchingModels.value = true;
  try {
    const list = await fetchAvailableModels(form.value);
    if (list && list.length > 0) {
      availableModels.value = list;
      form.value.availableModels = list;
      if (!list.includes(form.value.model)) {
        const [firstModel] = list;
        if (firstModel) {
          form.value.model = firstModel;
        }
      }
      dialogStore.showToast(`Berhasil menemukan ${list.length} model!`, 'success', 2500);
    } else {
      dialogStore.showToast('Tidak ada model yang ditemukan pada endpoint tersebut', 'info', 2500);
    }
  } catch (err: any) {
    dialogStore.alert({
      title: 'Gagal Menarik Model',
      description: `Pastikan Base URL dan API Key benar.\nDetail: ${err.message || String(err)}`,
      variant: 'error',
    });
  } finally {
    isFetchingModels.value = false;
  }
}

async function handleSave() {
  if (!form.value.name.trim()) {
    form.value.name = `${form.value.type} profile`;
  }
  form.value.availableModels = availableModels.value;
  await aiStore.saveProvider(form.value);
  dialogStore.showToast('Provider AI berhasil disimpan', 'success', 1500);
}

async function handleSetDefault() {
  await handleSave();
  aiStore.setActiveProvider(form.value.id);
  dialogStore.showToast(`Provider aktif: ${form.value.name}`, 'success', 1500);
}

async function handleDelete() {
  const isConfirmed = await dialogStore.confirm({
    title: 'Hapus Provider AI',
    description: `Apakah Anda yakin ingin menghapus provider "${form.value.name}"?`,
    confirmText: 'Hapus',
    cancelText: 'Batal',
    isDestructive: true,
  });
  if (isConfirmed) {
    aiStore.deleteProvider(form.value.id);
    const [firstProvider] = aiStore.providers;
    if (firstProvider) {
      selectProvider(firstProvider);
    } else {
      handleNewProvider();
    }
  }
}

watch(
  () => aiStore.isProviderModalOpen,
  isOpen => {
    if (isOpen) {
      isGuideActive.value = false;
      isScanResultActive.value = false;
      const active = aiStore.activeProvider;
      if (active) {
        selectProvider(active);
      } else {
        const [firstProvider] = aiStore.providers;
        if (firstProvider) {
          selectProvider(firstProvider);
        } else {
          handleNewProvider();
        }
      }
    }
  }
);

function handleKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && aiStore.isProviderModalOpen) {
    aiStore.closeProviderModal();
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeydown);
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeydown);
});
</script>
