<template>
  <div
    v-if="isOpen"
    class="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-2 sm:p-4 animate-fade-in"
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
          <div class="w-8 h-8 rounded-lg bg-cyan-500/20 text-cyan-400 flex items-center justify-center border border-cyan-500/30 shrink-0">
            <Icon icon="lucide:network" class="w-5 h-5" />
          </div>
          <div class="min-w-0">
            <div class="flex items-center space-x-2">
              <h2 class="font-bold text-sm tracking-wide text-white truncate">Network & SSL Inspector</h2>
              <span class="text-[11px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-300 font-mono border border-slate-700 truncate max-w-[180px]">
                {{ hostTitle }}
              </span>
            </div>
            <p class="text-[11px] text-slate-400 truncate">Diagnosa jaringan remote & pantau masa aktif sertifikat SSL/TLS.</p>
          </div>
        </div>

        <div class="flex items-center space-x-2 shrink-0">
          <!-- Guide Toggle -->
          <button
            @click="showGuide = !showGuide"
            :class="[
              'px-2.5 py-1.5 rounded-lg border text-xs transition flex items-center space-x-1.5 cursor-pointer',
              showGuide ? 'bg-cyan-950/60 border-cyan-500 text-cyan-300' : 'bg-[#1e2333] border-[#2e374d] text-slate-300 hover:text-white'
            ]"
            title="Buka panduan penggunaan"
          >
            <Icon icon="lucide:help-circle" class="w-4 h-4 text-cyan-400" />
            <span class="hidden sm:inline font-medium">Panduan</span>
          </button>

          <!-- Close Button -->
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
      <div v-if="showGuide" class="p-3.5 bg-cyan-950/30 border-b border-cyan-900/50 text-xs text-slate-300 space-y-2 shrink-0">
        <div class="flex items-start justify-between">
          <div class="flex items-center space-x-2 font-semibold text-cyan-300 text-xs">
            <Icon icon="lucide:book-open" class="w-4 h-4 text-cyan-400" />
            <span>Panduan: Diagnostik Jaringan & Monitoring SSL</span>
          </div>
          <button @click="showGuide = false" class="text-slate-400 hover:text-slate-200 text-xs cursor-pointer">Tutup ✕</button>
        </div>
        <p class="leading-relaxed text-[11px] text-slate-300">
          Semua perintah dijalankan langsung dari sisi server remote (bukan mesin lokal Anda), sehingga mencerminkan perspektif rute dan koneksi server tersebut ke internet atau intranet.
        </p>
        <div class="grid grid-cols-1 sm:grid-cols-4 gap-2 pt-1 text-[11px]">
          <div class="bg-[#121622] p-2 rounded border border-cyan-800/40">
            <div class="font-bold text-cyan-400 mb-0.5">1. SSL Tracker</div>
            <p class="text-slate-400">Deteksi masa kedaluwarsa sertifikat HTTPS domain vhost agar tidak terlewat perpanjangan.</p>
          </div>
          <div class="bg-[#121622] p-2 rounded border border-cyan-800/40">
            <div class="font-bold text-cyan-400 mb-0.5">2. Ping & Latency</div>
            <p class="text-slate-400">Uji waktu respons (RTT) dan paket loss ke gateway atau DNS eksternal.</p>
          </div>
          <div class="bg-[#121622] p-2 rounded border border-cyan-800/40">
            <div class="font-bold text-cyan-400 mb-0.5">3. DNS Lookup</div>
            <p class="text-slate-400">Verifikasi propagasi record A, AAAA, MX, CNAME via utilitas dig/nslookup remote.</p>
          </div>
          <div class="bg-[#121622] p-2 rounded border border-cyan-800/40">
            <div class="font-bold text-cyan-400 mb-0.5">4. HTTP & Trace</div>
            <p class="text-slate-400">Periksa header respons, kode HTTP (200/502), dan rantai hop traceroute.</p>
          </div>
        </div>
      </div>

      <!-- Main Layout -->
      <div class="flex flex-1 overflow-hidden">
        <!-- Sidebar Navigation -->
        <div class="w-48 sm:w-52 border-r border-[#262c3d] bg-[#141724] flex flex-col p-2 shrink-0 gap-1 select-none">
          <button
            @click="activeTab = 'ssl'"
            :class="[
              'w-full flex items-center space-x-2.5 px-3 py-2 rounded-lg text-xs font-medium transition cursor-pointer text-left',
              activeTab === 'ssl' ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30' : 'text-slate-400 hover:text-slate-200 hover:bg-[#1b2030]'
            ]"
          >
            <Icon icon="lucide:shield-check" class="w-4 h-4 shrink-0 text-cyan-400" />
            <div class="truncate">
              <div>SSL / TLS Certs</div>
              <div class="text-[10px] text-slate-500">Expiry & SAN</div>
            </div>
          </button>

          <button
            @click="activeTab = 'ping'"
            :class="[
              'w-full flex items-center space-x-2.5 px-3 py-2 rounded-lg text-xs font-medium transition cursor-pointer text-left',
              activeTab === 'ping' ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30' : 'text-slate-400 hover:text-slate-200 hover:bg-[#1b2030]'
            ]"
          >
            <Icon icon="lucide:activity" class="w-4 h-4 shrink-0 text-emerald-400" />
            <div class="truncate">
              <div>Ping & Latency</div>
              <div class="text-[10px] text-slate-500">RTT & Loss</div>
            </div>
          </button>

          <button
            @click="activeTab = 'dns'"
            :class="[
              'w-full flex items-center space-x-2.5 px-3 py-2 rounded-lg text-xs font-medium transition cursor-pointer text-left',
              activeTab === 'dns' ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30' : 'text-slate-400 hover:text-slate-200 hover:bg-[#1b2030]'
            ]"
          >
            <Icon icon="lucide:search" class="w-4 h-4 shrink-0 text-amber-400" />
            <div class="truncate">
              <div>DNS Lookup</div>
              <div class="text-[10px] text-slate-500">Dig / Nslookup</div>
            </div>
          </button>

          <button
            @click="activeTab = 'http'"
            :class="[
              'w-full flex items-center space-x-2.5 px-3 py-2 rounded-lg text-xs font-medium transition cursor-pointer text-left',
              activeTab === 'http' ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30' : 'text-slate-400 hover:text-slate-200 hover:bg-[#1b2030]'
            ]"
          >
            <Icon icon="lucide:globe" class="w-4 h-4 shrink-0 text-sky-400" />
            <div class="truncate">
              <div>HTTP & Headers</div>
              <div class="text-[10px] text-slate-500">Curl Probe</div>
            </div>
          </button>

          <button
            @click="activeTab = 'traceroute'"
            :class="[
              'w-full flex items-center space-x-2.5 px-3 py-2 rounded-lg text-xs font-medium transition cursor-pointer text-left',
              activeTab === 'traceroute' ? 'bg-cyan-500/15 text-cyan-300 border border-cyan-500/30' : 'text-slate-400 hover:text-slate-200 hover:bg-[#1b2030]'
            ]"
          >
            <Icon icon="lucide:route" class="w-4 h-4 shrink-0 text-purple-400" />
            <div class="truncate">
              <div>Traceroute</div>
              <div class="text-[10px] text-slate-500">Hop Discovery</div>
            </div>
          </button>
        </div>

        <!-- Tab Content Area -->
        <div class="flex-1 bg-[#12151e] overflow-y-auto p-4 flex flex-col space-y-4">
          
          <!-- TAB 1: SSL CERTIFICATES -->
          <div v-if="activeTab === 'ssl'" class="space-y-4">
            <!-- Add Domain Bar -->
            <div class="bg-[#181c28] border border-[#262c3d] rounded-xl p-3 sm:p-4 space-y-3">
              <div class="flex flex-col sm:flex-row gap-2">
                <div class="relative flex-1">
                  <input
                    v-model="newSslDomain"
                    @keyup.enter="addAndCheckSslDomain"
                    type="text"
                    placeholder="Contoh: mywebsite.com atau api.domain.com:443"
                    class="w-full bg-[#12151e] border border-[#2d354a] rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 font-mono focus:outline-none focus:border-cyan-500"
                  />
                </div>
                <div class="flex gap-2 shrink-0">
                  <button
                    @click="addAndCheckSslDomain"
                    :disabled="isSslScanning || !newSslDomain.trim()"
                    class="px-3.5 py-2 bg-cyan-600 hover:bg-cyan-500 disabled:opacity-50 text-white rounded-lg text-xs font-medium transition flex items-center space-x-1.5 cursor-pointer"
                  >
                    <Icon icon="lucide:plus" class="w-4 h-4" />
                    <span>Tambah & Cek</span>
                  </button>
                  <button
                    @click="autoScanVhosts"
                    :disabled="isSslScanning"
                    class="px-3 py-2 bg-[#1e2333] hover:bg-[#282f45] border border-[#2e374d] text-slate-300 hover:text-white rounded-lg text-xs transition flex items-center space-x-1.5 cursor-pointer"
                    title="Pindai domain vhost otomatis dari Nginx / Caddy / Apache di server"
                  >
                    <Icon icon="lucide:scan" class="w-4 h-4 text-cyan-400" />
                    <span>Auto-Scan Server</span>
                  </button>
                  <button
                    @click="refreshAllSsl"
                    :disabled="isSslScanning || sslItems.length === 0"
                    class="p-2 bg-[#1e2333] hover:bg-[#282f45] border border-[#2e374d] text-slate-300 rounded-lg transition disabled:opacity-50 cursor-pointer"
                    title="Cek ulang semua sertifikat"
                  >
                    <Icon icon="lucide:refresh-cw" :class="['w-4 h-4', isSslScanning ? 'animate-spin text-cyan-400' : '']" />
                  </button>
                </div>
              </div>

              <!-- Quick Host Domains Suggestion -->
              <div v-if="suggestedDomains.length > 0" class="flex items-center gap-1.5 flex-wrap text-[11px] text-slate-400">
                <span class="text-slate-500">Saran:</span>
                <button
                  v-for="d in suggestedDomains"
                  :key="d"
                  @click="newSslDomain = d; addAndCheckSslDomain()"
                  class="px-2 py-0.5 bg-[#1f2434] hover:bg-[#283045] rounded border border-[#2e374d] text-cyan-300 font-mono text-[10px] cursor-pointer"
                >
                  + {{ d }}
                </button>
              </div>
            </div>

            <!-- SSL Items List -->
            <div v-if="sslItems.length === 0" class="border border-dashed border-[#262c3d] rounded-xl p-8 text-center text-slate-500">
              <Icon icon="lucide:shield-alert" class="w-10 h-10 mx-auto mb-2 text-slate-600" />
              <p class="text-sm font-medium text-slate-400">Belum ada domain yang dipantau</p>
              <p class="text-xs text-slate-500 mt-1">Ketik nama domain di atas atau klik Auto-Scan Server untuk mendeteksi domain lokal secara otomatis.</p>
            </div>

            <div v-else class="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div
                v-for="item in sslItems"
                :key="item.hostPort"
                class="bg-[#181c28] border border-[#262c3d] rounded-xl p-4 flex flex-col justify-between hover:border-slate-600 transition group"
              >
                <div>
                  <div class="flex items-start justify-between gap-2">
                    <div class="min-w-0">
                      <div class="flex items-center space-x-2">
                        <span class="font-mono font-bold text-sm text-white truncate">{{ item.hostPort }}</span>
                        <!-- Status Badge -->
                        <span
                          v-if="item.status === 'valid'"
                          class="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-950/80 text-emerald-300 border border-emerald-800 shrink-0"
                        >
                          VALID ({{ item.daysLeft }} hari)
                        </span>
                        <span
                          v-else-if="item.status === 'warning'"
                          class="px-2 py-0.5 rounded text-[10px] font-bold bg-amber-950/80 text-amber-300 border border-amber-800 shrink-0"
                        >
                          EXPIRING ({{ item.daysLeft }} hari)
                        </span>
                        <span
                          v-else-if="item.status === 'expired'"
                          class="px-2 py-0.5 rounded text-[10px] font-bold bg-rose-950/80 text-rose-300 border border-rose-800 shrink-0"
                        >
                          EXPIRED
                        </span>
                        <span
                          v-else-if="item.status === 'checking'"
                          class="px-2 py-0.5 rounded text-[10px] font-bold bg-cyan-950/80 text-cyan-300 border border-cyan-800 shrink-0 animate-pulse"
                        >
                          CHECKING...
                        </span>
                        <span
                          v-else
                          class="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-800 text-slate-400 border border-slate-700 shrink-0"
                        >
                          ERROR
                        </span>
                      </div>
                      <p class="text-[11px] text-slate-400 truncate mt-0.5">Issuer: {{ item.issuer || 'N/A' }}</p>
                    </div>

                    <div class="flex items-center space-x-1 shrink-0 opacity-80 group-hover:opacity-100">
                      <button
                        @click="checkSingleSsl(item)"
                        :disabled="item.status === 'checking'"
                        class="p-1 hover:bg-[#242b3d] text-slate-400 hover:text-cyan-300 rounded cursor-pointer"
                        title="Periksa ulang"
                      >
                        <Icon icon="lucide:refresh-cw" :class="['w-3.5 h-3.5', item.status === 'checking' ? 'animate-spin' : '']" />
                      </button>
                      <button
                        @click="removeSslDomain(item.hostPort)"
                        class="p-1 hover:bg-rose-500/20 text-slate-400 hover:text-rose-400 rounded cursor-pointer"
                        title="Hapus"
                      >
                        <Icon icon="lucide:trash-2" class="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <!-- Details -->
                  <div class="mt-3 grid grid-cols-2 gap-2 text-[11px] bg-[#12151e] p-2.5 rounded-lg border border-[#232938]">
                    <div>
                      <span class="text-slate-500 block text-[10px]">Kadaluwarsa:</span>
                      <span class="font-mono text-slate-300">{{ item.expiryDate || 'N/A' }}</span>
                    </div>
                    <div>
                      <span class="text-slate-500 block text-[10px]">Subject:</span>
                      <span class="font-mono text-slate-300 truncate block" :title="item.subject">{{ item.subject || 'N/A' }}</span>
                    </div>
                  </div>

                  <!-- SANs -->
                  <div v-if="item.sans && item.sans.length > 0" class="mt-2 flex items-center gap-1 flex-wrap">
                    <span class="text-[10px] text-slate-500">SAN:</span>
                    <span
                      v-for="san in item.sans.slice(0, 3)"
                      :key="san"
                      class="px-1.5 py-0.2 bg-[#202638] rounded text-[10px] text-slate-400 font-mono"
                    >
                      {{ san }}
                    </span>
                    <span v-if="item.sans.length > 3" class="text-[10px] text-slate-500 font-mono">
                      +{{ item.sans.length - 3 }} lainnya
                    </span>
                  </div>

                  <!-- Error message if any -->
                  <div v-if="item.error" class="mt-2 p-2 bg-rose-950/40 border border-rose-900/50 rounded text-[11px] text-rose-300 font-mono">
                    {{ item.error }}
                  </div>
                </div>

                <div class="mt-3 pt-2 border-t border-[#232938] flex items-center justify-between text-[10px] text-slate-500">
                  <span>Terakhir diperiksa: {{ item.lastChecked || 'Belum pernah' }}</span>
                  <a
                    :href="`https://${item.hostPort}`"
                    target="_blank"
                    class="text-cyan-400 hover:underline flex items-center space-x-1"
                  >
                    <span>Buka URL</span>
                    <Icon icon="lucide:external-link" class="w-3 h-3" />
                  </a>
                </div>
              </div>
            </div>
          </div>

          <!-- TAB 2: PING & LATENCY -->
          <div v-if="activeTab === 'ping'" class="space-y-4">
            <div class="bg-[#181c28] border border-[#262c3d] rounded-xl p-4 space-y-3">
              <div class="flex flex-col sm:flex-row gap-2">
                <div class="relative flex-1">
                  <input
                    v-model="pingTarget"
                    @keyup.enter="runPing"
                    type="text"
                    placeholder="Masukkan IP atau Hostname (misal: 1.1.1.1 atau google.com)"
                    class="w-full bg-[#12151e] border border-[#2d354a] rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 font-mono focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div class="flex items-center space-x-2">
                  <select
                    v-model.number="pingCount"
                    class="bg-[#12151e] border border-[#2d354a] rounded-lg px-2.5 py-2 text-xs text-slate-300 font-mono focus:outline-none"
                  >
                    <option :value="3">3 Paket</option>
                    <option :value="5">5 Paket</option>
                    <option :value="10">10 Paket</option>
                  </select>
                  <button
                    @click="runPing"
                    :disabled="isPingRunning || !pingTarget.trim()"
                    class="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg text-xs font-medium transition flex items-center space-x-1.5 cursor-pointer"
                  >
                    <Icon icon="lucide:play" :class="['w-4 h-4', isPingRunning ? 'animate-spin' : '']" />
                    <span>{{ isPingRunning ? 'Memeriksa...' : 'Mulai Ping' }}</span>
                  </button>
                </div>
              </div>

              <!-- Quick Presets -->
              <div class="flex items-center gap-2 flex-wrap text-xs text-slate-400">
                <span class="text-slate-500 text-[11px]">Preset:</span>
                <button
                  @click="pingTarget = '1.1.1.1'; runPing()"
                  class="px-2 py-0.5 bg-[#1f2434] hover:bg-[#283045] rounded border border-[#2e374d] text-emerald-300 font-mono text-[11px] cursor-pointer"
                >
                  1.1.1.1 (Cloudflare)
                </button>
                <button
                  @click="pingTarget = '8.8.8.8'; runPing()"
                  class="px-2 py-0.5 bg-[#1f2434] hover:bg-[#283045] rounded border border-[#2e374d] text-emerald-300 font-mono text-[11px] cursor-pointer"
                >
                  8.8.8.8 (Google)
                </button>
                <button
                  @click="pingTarget = '127.0.0.1'; runPing()"
                  class="px-2 py-0.5 bg-[#1f2434] hover:bg-[#283045] rounded border border-[#2e374d] text-emerald-300 font-mono text-[11px] cursor-pointer"
                >
                  127.0.0.1 (Local)
                </button>
              </div>
            </div>

            <!-- Ping Metrics KPI Cards -->
            <div v-if="pingMetrics" class="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div class="bg-[#181c28] border border-[#262c3d] rounded-xl p-3">
                <span class="text-slate-500 text-[10px] block uppercase font-semibold">Min RTT</span>
                <span class="text-lg font-bold font-mono text-emerald-400">{{ pingMetrics.min }} ms</span>
              </div>
              <div class="bg-[#181c28] border border-[#262c3d] rounded-xl p-3">
                <span class="text-slate-500 text-[10px] block uppercase font-semibold">Avg RTT</span>
                <span class="text-lg font-bold font-mono text-cyan-400">{{ pingMetrics.avg }} ms</span>
              </div>
              <div class="bg-[#181c28] border border-[#262c3d] rounded-xl p-3">
                <span class="text-slate-500 text-[10px] block uppercase font-semibold">Max RTT</span>
                <span class="text-lg font-bold font-mono text-amber-400">{{ pingMetrics.max }} ms</span>
              </div>
              <div class="bg-[#181c28] border border-[#262c3d] rounded-xl p-3">
                <span class="text-slate-500 text-[10px] block uppercase font-semibold">Packet Loss</span>
                <span :class="['text-lg font-bold font-mono', pingMetrics.loss === '0%' ? 'text-emerald-400' : 'text-rose-400']">
                  {{ pingMetrics.loss }}
                </span>
              </div>
            </div>

            <!-- Terminal Output -->
            <div class="bg-[#0e111a] border border-[#232938] rounded-xl p-3 font-mono text-xs overflow-x-auto text-slate-300 min-h-[160px] max-h-[350px]">
              <div class="text-[11px] text-slate-500 mb-2 border-b border-[#1f2433] pb-1 flex justify-between items-center">
                <span>Output Console:</span>
                <button v-if="pingRawOutput" @click="copyText(pingRawOutput)" class="text-cyan-400 hover:underline text-[10px] cursor-pointer">
                  Salin Output
                </button>
              </div>
              <pre class="whitespace-pre-wrap leading-relaxed">{{ pingRawOutput || 'Belum ada pengujian yang dijalankan.' }}</pre>
            </div>
          </div>

          <!-- TAB 3: DNS LOOKUP (DIG / NSLOOKUP) -->
          <div v-if="activeTab === 'dns'" class="space-y-4">
            <div class="bg-[#181c28] border border-[#262c3d] rounded-xl p-4 space-y-3">
              <div class="grid grid-cols-1 sm:grid-cols-12 gap-2">
                <div class="sm:col-span-6">
                  <input
                    v-model="dnsTarget"
                    @keyup.enter="runDnsLookup"
                    type="text"
                    placeholder="Domain (misal: google.com atau cloudflare.com)"
                    class="w-full bg-[#12151e] border border-[#2d354a] rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 font-mono focus:outline-none focus:border-amber-500"
                  />
                </div>
                <div class="sm:col-span-3">
                  <select
                    v-model="dnsType"
                    class="w-full bg-[#12151e] border border-[#2d354a] rounded-lg px-2.5 py-2 text-xs text-slate-300 font-mono focus:outline-none"
                  >
                    <option value="A">Record A (IPv4)</option>
                    <option value="AAAA">Record AAAA (IPv6)</option>
                    <option value="CNAME">Record CNAME (Alias)</option>
                    <option value="MX">Record MX (Mail)</option>
                    <option value="TXT">Record TXT (SPF/DKIM)</option>
                    <option value="NS">Record NS (Nameserver)</option>
                    <option value="ANY">Record ANY</option>
                  </select>
                </div>
                <div class="sm:col-span-3">
                  <button
                    @click="runDnsLookup"
                    :disabled="isDnsRunning || !dnsTarget.trim()"
                    class="w-full py-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white rounded-lg text-xs font-medium transition flex items-center justify-center space-x-1.5 cursor-pointer"
                  >
                    <Icon icon="lucide:search" :class="['w-4 h-4', isDnsRunning ? 'animate-spin' : '']" />
                    <span>{{ isDnsRunning ? 'Mencari...' : 'Lookup DNS' }}</span>
                  </button>
                </div>
              </div>

              <!-- Custom Resolver Input -->
              <div class="flex items-center space-x-2 text-xs">
                <span class="text-slate-500 text-[11px] shrink-0">Nameserver Opsional:</span>
                <input
                  v-model="dnsServer"
                  type="text"
                  placeholder="@1.1.1.1 atau biarkan kosong (default server)"
                  class="bg-[#12151e] border border-[#2d354a] rounded px-2.5 py-1 text-xs text-slate-300 placeholder-slate-600 font-mono w-60 focus:outline-none focus:border-amber-500"
                />
              </div>
            </div>

            <!-- DNS Parsed Records Table -->
            <div v-if="dnsRecords.length > 0" class="bg-[#181c28] border border-[#262c3d] rounded-xl overflow-hidden">
              <div class="px-4 py-2.5 border-b border-[#232938] flex items-center justify-between bg-[#141724]">
                <span class="text-xs font-semibold text-slate-200">Hasil Resolusi DNS:</span>
                <span class="text-[11px] text-amber-400 font-mono font-bold">{{ dnsRecords.length }} record ditemukan</span>
              </div>
              <div class="overflow-x-auto">
                <table class="w-full text-left text-xs text-slate-300">
                  <thead class="bg-[#161a26] text-slate-400 text-[11px] border-b border-[#232938]">
                    <tr>
                      <th class="py-2 px-3 font-semibold">Name</th>
                      <th class="py-2 px-3 font-semibold">TTL</th>
                      <th class="py-2 px-3 font-semibold">Type</th>
                      <th class="py-2 px-3 font-semibold">Data / Value</th>
                      <th class="py-2 px-3 text-right">Aksi</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-[#202534] font-mono text-[11px]">
                    <tr v-for="(rec, idx) in dnsRecords" :key="idx" class="hover:bg-[#1d2232]">
                      <td class="py-2 px-3 text-slate-300 truncate max-w-[160px]">{{ rec.name }}</td>
                      <td class="py-2 px-3 text-slate-500">{{ rec.ttl }}s</td>
                      <td class="py-2 px-3">
                        <span class="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-950/60 text-amber-300 border border-amber-800">
                          {{ rec.type }}
                        </span>
                      </td>
                      <td class="py-2 px-3 text-white truncate max-w-[280px]" :title="rec.data">{{ rec.data }}</td>
                      <td class="py-2 px-3 text-right">
                        <button @click="copyText(rec.data)" class="text-slate-400 hover:text-white cursor-pointer" title="Salin Value">
                          <Icon icon="lucide:copy" class="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <!-- DNS Raw Output -->
            <div class="bg-[#0e111a] border border-[#232938] rounded-xl p-3 font-mono text-xs overflow-x-auto text-slate-300 min-h-[140px] max-h-[300px]">
              <div class="text-[11px] text-slate-500 mb-2 border-b border-[#1f2433] pb-1 flex justify-between items-center">
                <span>Output Raw:</span>
                <button v-if="dnsRawOutput" @click="copyText(dnsRawOutput)" class="text-amber-400 hover:underline text-[10px] cursor-pointer">
                  Salin Raw
                </button>
              </div>
              <pre class="whitespace-pre-wrap leading-relaxed">{{ dnsRawOutput || 'Belum ada query DNS yang dijalankan.' }}</pre>
            </div>
          </div>

          <!-- TAB 4: HTTP & HEADERS PROBE -->
          <div v-if="activeTab === 'http'" class="space-y-4">
            <div class="bg-[#181c28] border border-[#262c3d] rounded-xl p-4 space-y-3">
              <div class="flex flex-col sm:flex-row gap-2">
                <div class="relative flex-1">
                  <input
                    v-model="httpUrl"
                    @keyup.enter="runHttpProbe"
                    type="text"
                    placeholder="Masukkan URL lengkap (misal: https://domain.com atau http://localhost:8080)"
                    class="w-full bg-[#12151e] border border-[#2d354a] rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 font-mono focus:outline-none focus:border-sky-500"
                  />
                </div>
                <div class="flex items-center space-x-2">
                  <label class="flex items-center space-x-1.5 text-xs text-slate-400 cursor-pointer bg-[#12151e] px-2.5 py-2 rounded-lg border border-[#2d354a]">
                    <input type="checkbox" v-model="httpFollowRedirects" class="rounded bg-slate-900 border-slate-700 text-sky-500" />
                    <span>Follow (-L)</span>
                  </label>
                  <button
                    @click="runHttpProbe"
                    :disabled="isHttpRunning || !httpUrl.trim()"
                    class="px-4 py-2 bg-sky-600 hover:bg-sky-500 disabled:opacity-50 text-white rounded-lg text-xs font-medium transition flex items-center space-x-1.5 cursor-pointer"
                  >
                    <Icon icon="lucide:send" :class="['w-4 h-4', isHttpRunning ? 'animate-spin' : '']" />
                    <span>{{ isHttpRunning ? 'Memeriksa...' : 'Probe URL' }}</span>
                  </button>
                </div>
              </div>
            </div>

            <!-- HTTP Status & Timing Waterfall Card -->
            <div v-if="httpMetrics" class="bg-[#181c28] border border-[#262c3d] rounded-xl p-4 space-y-3">
              <div class="flex items-center justify-between border-b border-[#232938] pb-3">
                <div class="flex items-center space-x-2">
                  <span class="text-xs font-semibold text-slate-400">Response Code:</span>
                  <span
                    :class="[
                      'px-2.5 py-1 rounded font-bold font-mono text-xs border',
                      httpMetrics.code.startsWith('2') ? 'bg-emerald-950/80 text-emerald-300 border-emerald-800' :
                      httpMetrics.code.startsWith('3') ? 'bg-cyan-950/80 text-cyan-300 border-cyan-800' :
                      httpMetrics.code.startsWith('4') ? 'bg-amber-950/80 text-amber-300 border-amber-800' :
                      'bg-rose-950/80 text-rose-300 border-rose-800'
                    ]"
                  >
                    HTTP {{ httpMetrics.code }}
                  </span>
                </div>
                <div class="text-xs font-mono text-slate-400">
                  Total Waktu: <strong class="text-white">{{ httpMetrics.totalTime }}s</strong>
                </div>
              </div>

              <!-- Latency Waterfall Breakdown -->
              <div class="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                <div class="bg-[#12151e] p-2 rounded border border-[#232938]">
                  <span class="text-[10px] text-slate-500 block">DNS Lookup</span>
                  <span class="font-mono text-sky-400 font-semibold">{{ httpMetrics.dnsTime }}s</span>
                </div>
                <div class="bg-[#12151e] p-2 rounded border border-[#232938]">
                  <span class="text-[10px] text-slate-500 block">TCP Connect</span>
                  <span class="font-mono text-cyan-400 font-semibold">{{ httpMetrics.connectTime }}s</span>
                </div>
                <div class="bg-[#12151e] p-2 rounded border border-[#232938]">
                  <span class="text-[10px] text-slate-500 block">TLS Handshake</span>
                  <span class="font-mono text-purple-400 font-semibold">{{ httpMetrics.tlsTime }}s</span>
                </div>
                <div class="bg-[#12151e] p-2 rounded border border-[#232938]">
                  <span class="text-[10px] text-slate-500 block">TTFB (First Byte)</span>
                  <span class="font-mono text-emerald-400 font-semibold">{{ httpMetrics.ttfbTime }}s</span>
                </div>
              </div>
            </div>

            <!-- Response Headers Inspector -->
            <div v-if="httpHeaders.length > 0" class="bg-[#181c28] border border-[#262c3d] rounded-xl overflow-hidden">
              <div class="px-4 py-2 border-b border-[#232938] flex items-center justify-between bg-[#141724]">
                <span class="text-xs font-semibold text-slate-200">Response Headers:</span>
                <button @click="copyText(httpRawHeaders)" class="text-sky-400 hover:underline text-[11px] cursor-pointer">
                  Salin Semua Header
                </button>
              </div>
              <div class="max-h-[220px] overflow-y-auto divide-y divide-[#202534] font-mono text-[11px] px-3">
                <div v-for="(h, idx) in httpHeaders" :key="idx" class="py-1.5 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
                  <span class="text-sky-300 font-semibold shrink-0">{{ h.key }}:</span>
                  <span class="text-slate-300 truncate max-w-lg" :title="h.value">{{ h.value }}</span>
                </div>
              </div>
            </div>
          </div>

          <!-- TAB 5: TRACEROUTE -->
          <div v-if="activeTab === 'traceroute'" class="space-y-4">
            <div class="bg-[#181c28] border border-[#262c3d] rounded-xl p-4 space-y-3">
              <div class="flex flex-col sm:flex-row gap-2">
                <div class="relative flex-1">
                  <input
                    v-model="traceTarget"
                    @keyup.enter="runTraceroute"
                    type="text"
                    placeholder="Target traceroute (misal: 1.1.1.1 atau google.com)"
                    class="w-full bg-[#12151e] border border-[#2d354a] rounded-lg px-3 py-2 text-xs text-white placeholder-slate-500 font-mono focus:outline-none focus:border-purple-500"
                  />
                </div>
                <button
                  @click="runTraceroute"
                  :disabled="isTraceRunning || !traceTarget.trim()"
                  class="px-4 py-2 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white rounded-lg text-xs font-medium transition flex items-center space-x-1.5 cursor-pointer"
                >
                  <Icon icon="lucide:play" :class="['w-4 h-4', isTraceRunning ? 'animate-spin' : '']" />
                  <span>{{ isTraceRunning ? 'Melacak...' : 'Jalankan Trace' }}</span>
                </button>
              </div>
            </div>

            <!-- Hop list table if parsed -->
            <div v-if="traceHops.length > 0" class="bg-[#181c28] border border-[#262c3d] rounded-xl overflow-hidden">
              <div class="px-4 py-2 border-b border-[#232938] bg-[#141724] text-xs font-semibold text-slate-200">
                Rantai Hop ({{ traceHops.length }} Hops):
              </div>
              <div class="overflow-x-auto">
                <table class="w-full text-left text-xs text-slate-300 font-mono">
                  <thead class="bg-[#161a26] text-slate-400 text-[11px] border-b border-[#232938]">
                    <tr>
                      <th class="py-2 px-3 w-16">Hop</th>
                      <th class="py-2 px-3">Host / IP</th>
                      <th class="py-2 px-3">RTT</th>
                    </tr>
                  </thead>
                  <tbody class="divide-y divide-[#202534] text-[11px]">
                    <tr v-for="hop in traceHops" :key="hop.hop" class="hover:bg-[#1d2232]">
                      <td class="py-2 px-3 font-bold text-purple-400">#{{ hop.hop }}</td>
                      <td class="py-2 px-3 text-white">{{ hop.host }}</td>
                      <td class="py-2 px-3 text-slate-400">{{ hop.rtt }}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            <!-- Trace Raw Output -->
            <div class="bg-[#0e111a] border border-[#232938] rounded-xl p-3 font-mono text-xs overflow-x-auto text-slate-300 min-h-[160px] max-h-[350px]">
              <div class="text-[11px] text-slate-500 mb-2 border-b border-[#1f2433] pb-1 flex justify-between items-center">
                <span>Output Traceroute:</span>
                <button v-if="traceRawOutput" @click="copyText(traceRawOutput)" class="text-purple-400 hover:underline text-[10px] cursor-pointer">
                  Salin Raw
                </button>
              </div>
              <pre class="whitespace-pre-wrap leading-relaxed">{{ traceRawOutput || 'Belum ada penelusuran rute yang dijalankan.' }}</pre>
            </div>
          </div>

        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { Icon } from '@iconify/vue';
import { tauriBridge } from '../services/tauriBridge.js';
import { useDialogStore } from '../stores/dialogStore.js';

interface SslItem {
  hostPort: string;
  issuer: string;
  subject: string;
  expiryDate: string;
  daysLeft: number | null;
  sans: string[];
  status: 'valid' | 'warning' | 'expired' | 'error' | 'checking';
  error?: string;
  lastChecked?: string;
}

interface DnsRecord {
  name: string;
  ttl: string;
  type: string;
  data: string;
}

interface HttpMetric {
  code: string;
  dnsTime: string;
  connectTime: string;
  tlsTime: string;
  ttfbTime: string;
  totalTime: string;
}

const props = defineProps<{
  isOpen: boolean;
  sessionId: string;
  hostTitle: string;
}>();

const emit = defineEmits<{
  (e: 'close'): void;
}>();

const dialogStore = useDialogStore();
const activeTab = ref<'ssl' | 'ping' | 'dns' | 'http' | 'traceroute'>('ssl');
const showGuide = ref(false);

// SSL State
const sslItems = ref<SslItem[]>([]);
const newSslDomain = ref('');
const isSslScanning = ref(false);
const suggestedDomains = ref<string[]>([]);

// Ping State
const pingTarget = ref('1.1.1.1');
const pingCount = ref(4);
const isPingRunning = ref(false);
const pingRawOutput = ref('');
const pingMetrics = ref<{ min: string; avg: string; max: string; loss: string } | null>(null);

// DNS State
const dnsTarget = ref('');
const dnsType = ref('A');
const dnsServer = ref('');
const isDnsRunning = ref(false);
const dnsRawOutput = ref('');
const dnsRecords = ref<DnsRecord[]>([]);

// HTTP State
const httpUrl = ref('https://');
const httpFollowRedirects = ref(true);
const isHttpRunning = ref(false);
const httpMetrics = ref<HttpMetric | null>(null);
const httpHeaders = ref<{ key: string; value: string }[]>([]);
const httpRawHeaders = ref('');

// Traceroute State
const traceTarget = ref('1.1.1.1');
const isTraceRunning = ref(false);
const traceRawOutput = ref('');
const traceHops = ref<{ hop: number; host: string; rtt: string }[]>([]);

const storageKey = computed(() => `boba_ssl_domains_${props.hostTitle}`);

function loadSavedSslDomains() {
  try {
    const raw = localStorage.getItem(storageKey.value);
    if (raw) {
      sslItems.value = JSON.parse(raw);
    }
  } catch (err) {
    // ignore
  }
}

function saveSslDomains() {
  try {
    localStorage.setItem(storageKey.value, JSON.stringify(sslItems.value));
  } catch (err) {
    // ignore
  }
}

async function addAndCheckSslDomain() {
  const val = newSslDomain.value.trim();
  if (!val) return;

  const hostPort = val.includes(':') ? val : `${val}:443`;
  let existing = sslItems.value.find((i) => i.hostPort === hostPort);

  if (!existing) {
    existing = {
      hostPort,
      issuer: '',
      subject: '',
      expiryDate: '',
      daysLeft: null,
      sans: [],
      status: 'checking'
    };
    sslItems.value.unshift(existing);
    saveSslDomains();
  }

  newSslDomain.value = '';
  await checkSingleSsl(existing);
}

function removeSslDomain(hostPort: string) {
  sslItems.value = sslItems.value.filter((i) => i.hostPort !== hostPort);
  saveSslDomains();
  dialogStore.showToast(`Domain ${hostPort} dihapus dari daftar pantauan`, 'info');
}

async function checkSingleSsl(item: SslItem) {
  item.status = 'checking';
  item.error = undefined;

  const [host, portStr] = item.hostPort.split(':');
  const port = portStr || '443';

  // Remote openssl inspection script
  const cmd = `echo | openssl s_client -servername ${host} -connect ${host}:${port} 2>/dev/null | openssl x509 -noout -dates -subject -issuer -ext subjectAltName 2>/dev/null`;

  try {
    const output = await tauriBridge.sshExecCommand(props.sessionId, cmd);
    if (!output || !output.includes('notAfter=')) {
      item.status = 'error';
      item.error = 'Gagal membaca sertifikat. Pastikan port terbuka dan SSL aktif.';
      return;
    }

    // Parse notAfter
    const notAfterMatch = output.match(/notAfter=(.+)/);
    const issuerMatch = output.match(/issuer=(.+)/);
    const subjectMatch = output.match(/subject=(.+)/);
    const sanMatch = output.match(/X509v3 Subject Alternative Name:\s*([^\n]+)/);

    if (notAfterMatch && notAfterMatch[1]) {
      const expDate = new Date(notAfterMatch[1].trim());
      const now = new Date();
      const diffTime = expDate.getTime() - now.getTime();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

      item.daysLeft = diffDays;
      item.expiryDate = expDate.toISOString().split('T')[0] || '';

      if (diffDays <= 0) {
        item.status = 'expired';
      } else if (diffDays <= 14) {
        item.status = 'warning';
      } else {
        item.status = 'valid';
      }
    }

    if (issuerMatch && issuerMatch[1]) {
      // Shorten issuer (e.g. O = Let's Encrypt, CN = R3)
      const cnMatch = issuerMatch[1].match(/O\s*=\s*([^,]+)/) || issuerMatch[1].match(/CN\s*=\s*([^,]+)/);
      item.issuer = (cnMatch && cnMatch[1] ? cnMatch[1].trim() : issuerMatch[1].trim()) || '';
    }

    if (subjectMatch && subjectMatch[1]) {
      const cnMatch = subjectMatch[1].match(/CN\s*=\s*([^,]+)/);
      item.subject = (cnMatch && cnMatch[1] ? cnMatch[1].trim() : subjectMatch[1].trim()) || '';
    }

    if (sanMatch && sanMatch[1]) {
      item.sans = sanMatch[1]
        .split(',')
        .map((s) => s.replace(/DNS:/g, '').trim())
        .filter(Boolean);
    }

    item.lastChecked = new Date().toLocaleTimeString();
    saveSslDomains();
  } catch (err: any) {
    item.status = 'error';
    item.error = err.message || String(err);
  }
}

async function refreshAllSsl() {
  if (isSslScanning.value) return;
  isSslScanning.value = true;
  try {
    for (const item of sslItems.value) {
      await checkSingleSsl(item);
    }
    dialogStore.showToast('Semua sertifikat SSL berhasil diperbarui', 'success');
  } finally {
    isSslScanning.value = false;
  }
}

async function autoScanVhosts() {
  if (isSslScanning.value) return;
  isSslScanning.value = true;
  dialogStore.showToast('Memindai konfigurasi vhost Nginx/Caddy/Apache...', 'info');

  try {
    // Scan nginx server_name and caddy
    const scanCmd = `grep -hroE 'server_name\\s+[^;]+;' /etc/nginx/sites-enabled/ /etc/nginx/conf.d/ 2>/dev/null | sed -e 's/server_name//' -e 's/;//' | tr ' ' '\\n' | grep -v '^$' | grep -v '_' | sort -u || true`;
    const out = await tauriBridge.sshExecCommand(props.sessionId, scanCmd);
    const domains = out
      .split('\n')
      .map((d) => d.trim())
      .filter((d) => d && !d.startsWith('#') && d.includes('.'));

    let addedCount = 0;
    for (const dom of domains) {
      const hostPort = `${dom}:443`;
      if (!sslItems.value.some((i) => i.hostPort === hostPort)) {
        const item: SslItem = {
          hostPort,
          issuer: '',
          subject: '',
          expiryDate: '',
          daysLeft: null,
          sans: [],
          status: 'checking'
        };
        sslItems.value.push(item);
        checkSingleSsl(item);
        addedCount++;
      }
    }

    if (addedCount > 0) {
      saveSslDomains();
      dialogStore.showToast(`Ditemukan & ditambahkan ${addedCount} domain vhost baru!`, 'success');
    } else {
      dialogStore.showToast('Tidak ada domain baru yang ditemukan dari vhost.', 'info');
    }
  } catch (err: any) {
    dialogStore.showToast(`Scan vhost gagal: ${err.message || err}`, 'error');
  } finally {
    isSslScanning.value = false;
  }
}

// Ping Action
async function runPing() {
  const target = pingTarget.value.trim();
  if (!target || isPingRunning.value) return;

  isPingRunning.value = true;
  pingRawOutput.value = `Menjalankan: ping -c ${pingCount.value} -W 3 ${target} ...\n`;
  pingMetrics.value = null;

  try {
    const cmd = `ping -c ${pingCount.value} -W 3 ${target}`;
    const out = await tauriBridge.sshExecCommand(props.sessionId, cmd);
    pingRawOutput.value = out;

    // Parse packet loss
    const lossMatch = out.match(/(\d+(?:\.\d+)?)%\s+packet loss/);
    const rttMatch = out.match(/(?:rtt|round-trip) min\/avg\/max\/(?:mdev|stddev) = ([^\s]+) ms/);

    if (rttMatch && rttMatch[1]) {
      const [min, avg, max] = rttMatch[1].split('/');
      pingMetrics.value = {
        min: Number(min).toFixed(1),
        avg: Number(avg).toFixed(1),
        max: Number(max).toFixed(1),
        loss: lossMatch ? `${lossMatch[1]}%` : '0%'
      };
    } else if (lossMatch) {
      pingMetrics.value = {
        min: '0',
        avg: '0',
        max: '0',
        loss: `${lossMatch[1]}%`
      };
    }
  } catch (err: any) {
    pingRawOutput.value += `\nError: ${err.message || err}`;
  } finally {
    isPingRunning.value = false;
  }
}

// DNS Action
async function runDnsLookup() {
  const target = dnsTarget.value.trim();
  if (!target || isDnsRunning.value) return;

  isDnsRunning.value = true;
  dnsRawOutput.value = 'Menjalankan query DNS...\n';
  dnsRecords.value = [];

  try {
    const resolver = dnsServer.value.trim() ? (dnsServer.value.startsWith('@') ? dnsServer.value : `@${dnsServer.value}`) : '';
    const cmd = `if command -v dig >/dev/null 2>&1; then dig +noall +answer +comments ${target} ${dnsType.value} ${resolver}; else nslookup -type=${dnsType.value} ${target} ${resolver.replace('@', '')}; fi`;
    
    const out = await tauriBridge.sshExecCommand(props.sessionId, cmd);
    dnsRawOutput.value = out;

    // Parse dig answer lines
    const lines = out.split('\n');
    const records: DnsRecord[] = [];

    for (const l of lines) {
      const trimmed = l.trim();
      if (!trimmed || trimmed.startsWith(';') || trimmed.startsWith('#')) continue;
      const parts = trimmed.split(/\s+/);
      if (parts.length >= 5) {
        records.push({
          name: parts[0] || '',
          ttl: parts[1] || '',
          type: parts[3] || '',
          data: parts.slice(4).join(' ')
        });
      }
    }
    dnsRecords.value = records;
  } catch (err: any) {
    dnsRawOutput.value += `\nError: ${err.message || err}`;
  } finally {
    isDnsRunning.value = false;
  }
}

// HTTP Action
async function runHttpProbe() {
  const url = httpUrl.value.trim();
  if (!url || isHttpRunning.value) return;

  isHttpRunning.value = true;
  httpMetrics.value = null;
  httpHeaders.value = [];
  httpRawHeaders.value = '';

  try {
    const followFlag = httpFollowRedirects.value ? '-L' : '';
    const format = `\\n__METRICS__\\n%{http_code}|%{time_namelookup}|%{time_connect}|%{time_appconnect}|%{time_starttransfer}|%{time_total}`;
    const cmd = `curl -sI ${followFlag} -w "${format}" "${url}"`;

    const out = await tauriBridge.sshExecCommand(props.sessionId, cmd);
    const [rawHeaders, rawMetrics] = out.split('__METRICS__');

    if (rawMetrics) {
      const [code, dnsTime, connectTime, tlsTime, ttfbTime, totalTime] = rawMetrics.trim().split('|');
      httpMetrics.value = {
        code: code || '0',
        dnsTime: Number(dnsTime || 0).toFixed(3),
        connectTime: Number(connectTime || 0).toFixed(3),
        tlsTime: Number(tlsTime || 0).toFixed(3),
        ttfbTime: Number(ttfbTime || 0).toFixed(3),
        totalTime: Number(totalTime || 0).toFixed(3)
      };
    }

    if (rawHeaders) {
      httpRawHeaders.value = rawHeaders.trim();
      const lines = rawHeaders.trim().split('\n');
      const parsed: { key: string; value: string }[] = [];
      for (const line of lines) {
        const colon = line.indexOf(':');
        if (colon > 0) {
          parsed.push({
            key: line.slice(0, colon).trim(),
            value: line.slice(colon + 1).trim()
          });
        }
      }
      httpHeaders.value = parsed;
    }
  } catch (err: any) {
    dialogStore.showToast(`HTTP probe error: ${err.message || err}`, 'error');
  } finally {
    isHttpRunning.value = false;
  }
}

// Traceroute Action
async function runTraceroute() {
  const target = traceTarget.value.trim();
  if (!target || isTraceRunning.value) return;

  isTraceRunning.value = true;
  traceRawOutput.value = `Menelusuri rute hop ke ${target}...\n`;
  traceHops.value = [];

  try {
    const cmd = `if command -v traceroute >/dev/null 2>&1; then traceroute -n -m 15 -w 2 ${target}; else tracepath -n -m 15 ${target}; fi`;
    const out = await tauriBridge.sshExecCommand(props.sessionId, cmd);
    traceRawOutput.value = out;

    const lines = out.split('\n');
    const hops: { hop: number; host: string; rtt: string }[] = [];

    for (const line of lines) {
      const match = line.trim().match(/^(\d+)\s+([0-9a-fA-F.:*]+)\s+([0-9.]+\s*ms|\*)/);
      if (match) {
        hops.push({
          hop: parseInt(match[1] || '0', 10),
          host: match[2] || '',
          rtt: match[3] || ''
        });
      }
    }
    traceHops.value = hops;
  } catch (err: any) {
    traceRawOutput.value += `\nError: ${err.message || err}`;
  } finally {
    isTraceRunning.value = false;
  }
}

function copyText(text: string) {
  navigator.clipboard.writeText(text);
  dialogStore.showToast('Teks disalin ke clipboard', 'success');
}

watch(
  () => props.isOpen,
  (val) => {
    if (val) {
      loadSavedSslDomains();
      if (props.hostTitle && props.hostTitle.includes('.')) {
        const hostOnly = props.hostTitle.split('@')[1] || props.hostTitle;
        if (!suggestedDomains.value.includes(hostOnly)) {
          suggestedDomains.value = [hostOnly];
        }
        if (!dnsTarget.value) dnsTarget.value = hostOnly;
        if (httpUrl.value === 'https://') httpUrl.value = `https://${hostOnly}`;
      }
    }
  }
);

onMounted(() => {
  if (props.isOpen) {
    loadSavedSslDomains();
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
