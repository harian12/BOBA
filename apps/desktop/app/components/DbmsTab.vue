<template>
  <div
    class="h-full w-full flex bg-[#0d1117] text-slate-100 font-sans overflow-hidden select-none"
    @click="closeAllContextMenus"
  >
    <!-- Left Pane: Schema & Object Explorer -->
    <div v-show="!isSidebarCollapsed" class="w-64 border-r border-boba-800 bg-[#111622] flex flex-col shrink-0 h-full">
      <!-- Database Header & Selector -->
      <div class="p-2.5 border-b border-boba-800 space-y-2.5">
        <!-- DB Connection Name & Refresh -->
        <div class="flex items-center justify-between">
          <div class="flex items-center space-x-2 truncate">
            <span class="px-1.5 py-0.5 rounded bg-sky-950/80 border border-sky-600/50 text-[10px] font-mono font-bold text-sky-300 shrink-0">
              {{ getEngineBadge(tab.dbConnection?.engine) }}
            </span>
            <div class="truncate">
              <div class="text-xs font-bold text-slate-100 truncate">{{ tab.dbConnection?.name }}</div>
              <div class="text-[10px] text-slate-400 font-mono truncate">
                {{ tab.dbConnection?.engine.toUpperCase() }} • {{ tab.dbConnection?.host || 'Local' }}
              </div>
            </div>
          </div>
          <button
            @click="loadSchemaOverview"
            :disabled="loadingSchema"
            title="Refresh Database Schema"
            class="p-1 hover:bg-boba-800 rounded text-slate-400 hover:text-white transition text-xs shrink-0"
          >
            <span :class="[loadingSchema ? 'animate-spin inline-block' : '']">⟳</span>
          </button>
        </div>

        <!-- Quick Action Buttons Grid (Arranged under Database Name) -->
        <div class="grid grid-cols-5 gap-1 pt-1.5 border-t border-boba-800/80">
          <button
            @click="isTableDesignerOpen = true"
            title="Visual Table Designer (Buat Tabel Baru)"
            class="py-1 flex flex-col items-center justify-center bg-boba-950 hover:bg-boba-800 border border-boba-800 hover:border-indigo-500/60 rounded text-slate-300 hover:text-indigo-300 transition"
          >
            <Icon icon="lucide:table-properties" class="w-3.5 h-3.5 text-indigo-400" />
            <span class="text-[9px] text-slate-400 font-sans mt-0.5">Tabel</span>
          </button>
          <button
            @click="isImporterOpen = true"
            title="Import Data & Script (.sql / .csv)"
            class="py-1 flex flex-col items-center justify-center bg-boba-950 hover:bg-boba-800 border border-boba-800 hover:border-emerald-500/60 rounded text-slate-300 hover:text-emerald-300 transition"
          >
            <Icon icon="lucide:file-up" class="w-3.5 h-3.5 text-emerald-400" />
            <span class="text-[9px] text-slate-400 font-sans mt-0.5">Import</span>
          </button>
          <button
            @click="isProcesslistOpen = true"
            title="Live Processlist & Query Killer"
            class="py-1 flex flex-col items-center justify-center bg-boba-950 hover:bg-boba-800 border border-boba-800 hover:border-rose-500/60 rounded text-slate-300 hover:text-rose-300 transition"
          >
            <Icon icon="lucide:activity" class="w-3.5 h-3.5 text-rose-400" />
            <span class="text-[9px] text-slate-400 font-sans mt-0.5">Process</span>
          </button>
          <button
            @click="isUserManagerOpen = true"
            title="Database User & Privileges Manager"
            class="py-1 flex flex-col items-center justify-center bg-boba-950 hover:bg-boba-800 border border-boba-800 hover:border-amber-500/60 rounded text-slate-300 hover:text-amber-300 transition"
          >
            <Icon icon="lucide:users" class="w-3.5 h-3.5 text-amber-400" />
            <span class="text-[9px] text-slate-400 font-sans mt-0.5">Users</span>
          </button>
          <button
            @click="openHealthMonitor"
            title="Server Health & Performance Metrics"
            class="py-1 flex flex-col items-center justify-center bg-boba-950 hover:bg-boba-800 border border-boba-800 hover:border-sky-500/60 rounded text-slate-300 hover:text-sky-300 transition"
          >
            <Icon icon="lucide:heart-pulse" class="w-3.5 h-3.5 text-sky-400" />
            <span class="text-[9px] text-slate-400 font-sans mt-0.5">Health</span>
          </button>
        </div>

        <!-- Database/Schema Selector Dropdown (if multiple databases exist) -->
        <div v-if="schemaOverview?.databases && schemaOverview.databases.length > 1" class="space-y-1">
          <label class="block text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Database:</label>
          <select
            v-model="activeDatabase"
            @change="handleDatabaseChange"
            class="w-full bg-boba-950 border border-boba-700 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none font-mono"
          >
            <option v-for="db in schemaOverview.databases" :key="db" :value="db">
              {{ db }}
            </option>
          </select>
        </div>

        <!-- Filter Tables Input -->
        <input
          v-model="tableFilter"
          type="text"
          placeholder="Filter objek/tabel..."
          class="w-full bg-boba-950 border border-boba-800 focus:border-boba-accent rounded px-2.5 py-1 text-xs text-slate-200 placeholder-slate-500 focus:outline-none"
        />
      </div>

      <!-- Objects Tree List (Tables, Views, Collections, Keys) -->
      <div class="flex-1 overflow-y-auto p-1.5 space-y-0.5 font-mono text-xs">
        <div v-if="loadingSchema" class="py-6 text-center text-slate-500 text-xs">
          Memuat struktur skema...
        </div>

        <div v-else-if="filteredTables.length === 0" class="py-6 text-center text-slate-500 text-xs">
          Tidak ada tabel / objek ditemukan.
        </div>

        <div
          v-for="tbl in filteredTables"
          :key="tbl.name"
          @click="handleSelectTable(tbl)"
          @contextmenu.prevent.stop="openTableContextMenu($event, tbl)"
          :class="[
            'flex items-center justify-between px-2.5 py-1.5 rounded cursor-pointer transition select-none group',
            activeTable?.name === tbl.name
              ? 'bg-sky-950/80 text-sky-200 border border-sky-500/40'
              : 'text-slate-300 hover:bg-boba-800/80 hover:text-white'
          ]"
        >
          <div class="flex items-center space-x-2 truncate mr-1.5">
            <svg v-if="tbl.table_type === 'VIEW'" class="w-3.5 h-3.5 text-purple-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              <path stroke-linecap="round" stroke-linejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
            </svg>
            <svg v-else class="w-3.5 h-3.5 text-sky-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M3 10h18M3 14h18M9 3v18M3 4a1 1 0 011-1h16a1 1 0 011 1v16a1 1 0 01-1 1H4a1 1 0 01-1-1V4z" />
            </svg>
            <span class="truncate text-[11px]">{{ tbl.name }}</span>
          </div>

          <span class="text-[9px] px-1 py-0.2 bg-boba-950/80 text-slate-500 rounded group-hover:text-slate-400 shrink-0 font-sans">
            {{ tbl.table_type }}
          </span>
        </div>
      </div>
    </div>

    <!-- Right Pane: Split into Multi-Tab Query Editor + Data Grid -->
    <div class="flex-1 flex flex-col overflow-hidden bg-[#0a0d14]">
      <!-- Multi-Tab Query Editor Sub-Tabs Bar (Fitur 6 - Auto Open on Table Click) -->
      <div class="h-8 bg-[#0b0e17] border-b border-boba-800 flex items-center px-1 shrink-0 select-none overflow-x-auto justify-between">
        <div class="flex items-center overflow-x-auto no-scrollbar">
          <!-- Collapse/Expand DB Object Tree Sidebar Button -->
          <button
            @click="isSidebarCollapsed = !isSidebarCollapsed"
            :title="isSidebarCollapsed ? 'Tampilkan Objek & Tabel Database' : 'Sembunyikan Objek & Tabel (Layar Penuh)'"
            class="p-1 hover:bg-boba-800 text-slate-400 hover:text-sky-300 rounded transition mr-1.5 shrink-0"
          >
            <Icon :icon="isSidebarCollapsed ? 'lucide:panel-left-open' : 'lucide:panel-left-close'" class="w-3.5 h-3.5" />
          </button>

          <div
            v-for="(qTab, qIdx) in queryTabs"
            :key="qTab.id"
            @click="selectQueryTab(qTab)"
            @dblclick="startRenameTab(qTab)"
            @mousedown.middle.prevent="closeQueryTab(qTab.id)"
            :class="[
              'group flex items-center space-x-1.5 px-3 py-1 text-xs font-mono rounded-t-md cursor-pointer border-t-2 transition mr-1 max-w-[190px]',
              activeQueryTabId === qTab.id
                ? 'bg-[#121724] text-sky-300 border-t-sky-500 font-bold'
                : 'text-slate-400 hover:bg-boba-850 hover:text-slate-200 border-t-transparent'
            ]"
            title="Klik untuk memilih, Double click untuk ubah nama, Ctrl+W atau Klik Tengah untuk menutup"
          >
            <svg v-if="qTab.tableName" class="w-3 h-3 text-sky-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M3 10h18M3 14h18M9 3v18M3 4a1 1 0 011-1h16a1 1 0 011 1v16a1 1 0 01-1 1H4a1 1 0 01-1-1V4z" />
            </svg>
            <svg v-else class="w-3 h-3 text-emerald-400 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path stroke-linecap="round" stroke-linejoin="round" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>

            <!-- Inline Tab Rename Input -->
            <input
              v-if="editingTabId === qTab.id"
              v-model="editingTabTitle"
              @blur="saveRenameTab(qTab)"
              @keydown.enter="saveRenameTab(qTab)"
              @keydown.esc="editingTabId = null"
              @click.stop
              v-focus
              class="bg-boba-950 border border-sky-500 rounded px-1 py-0.2 text-[11px] text-sky-200 focus:outline-none w-24 font-mono"
            />
            <span v-else class="truncate text-[11px]">{{ qTab.title }}</span>

            <button
              @click.stop="closeQueryTab(qTab.id)"
              title="Tutup tab query ini (Ctrl+W)"
              class="text-[10px] text-slate-500 hover:text-rose-400 rounded transition ml-1 shrink-0 opacity-0 group-hover:opacity-100 hover:bg-boba-800 p-0.5"
            >
              ✕
            </button>
          </div>

          <button
            @click="addNewQueryTab()"
            title="Tambah Tab Query Kosong"
            class="px-2 py-0.5 text-slate-400 hover:text-white hover:bg-boba-800 rounded text-xs transition"
          >
            +
          </button>
        </div>

        <!-- Toggle SQL Query Editor Button -->
        <div class="flex items-center space-x-1 ml-2 shrink-0 pr-1">
          <button
            @click="showQueryEditor = !showQueryEditor"
            :class="[
              'px-2 py-0.5 rounded text-[11px] font-mono transition border flex items-center space-x-1',
              showQueryEditor
                ? 'bg-sky-950/80 border-sky-600/60 text-sky-300 shadow-sm'
                : 'bg-boba-950 border-boba-700 text-slate-400 hover:text-slate-200 hover:bg-boba-850'
            ]"
            title="Tampilkan / Sembunyikan Editor Query SQL di Atas"
          >
            <span>{{ showQueryEditor ? '▲ Sembunyikan Query' : '▼ Tampilkan Query' }}</span>
          </button>
        </div>
      </div>

      <!-- Top Section: SQL Query Editor & AI Copilot Bar (Toggled per Tab) -->
      <div v-if="showQueryEditor" class="border-b border-boba-800 flex flex-col shrink-0 bg-[#0e121d] animate-in fade-in duration-100">
        <!-- Query Control Toolbar -->
        <div class="px-3 py-1.5 border-b border-boba-800 flex items-center justify-between text-xs bg-[#121724]">
          <div class="flex items-center space-x-2">
            <button
              @click="executeQuery()"
              :disabled="executing"
              class="px-3 py-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded font-medium text-xs shadow transition flex items-center space-x-1.5"
            >
              <span v-if="executing" class="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin"></span>
              <svg v-else class="w-3 h-3 fill-current" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z"/>
              </svg>
              <span>{{ executing ? 'Menjalankan...' : 'Jalankan (Ctrl+Enter)' }}</span>
            </button>

            <!-- Fitur 4: Visual EXPLAIN Button -->
            <button
              @click="handleExplainQuery"
              :disabled="executing || !currentQueryText.trim()"
              class="px-2.5 py-1 bg-sky-950/80 hover:bg-sky-800 text-sky-300 hover:text-white rounded border border-sky-700/50 text-xs font-medium transition flex items-center space-x-1.5"
              title="Analisis Rencana Eksekusi Query (EXPLAIN / Bottleneck Detector)"
            >
              <svg class="w-3 h-3 text-sky-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              <span>EXPLAIN</span>
            </button>

            <!-- Fitur 3: Saved Queries / Snippets Button -->
            <button
              @click="isSnippetsDrawerOpen = true"
              class="px-2.5 py-1 bg-amber-950/60 hover:bg-amber-800 text-amber-300 hover:text-white rounded border border-amber-700/50 text-xs font-medium transition flex items-center space-x-1.5"
              title="Buka Snippets / Saved Queries (E2EE)"
            >
              <svg class="w-3 h-3 text-amber-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path stroke-linecap="round" stroke-linejoin="round" d="M5 5a2 2 0 012-2h10a2 2 0 012 2v16l-7-3.5L5 21V5z" />
              </svg>
              <span>Snippets</span>
            </button>

            <button
              @click="currentQueryText = ''"
              class="px-2 py-1 text-slate-400 hover:text-slate-200 hover:bg-boba-800 rounded transition"
            >
              Clear
            </button>

            <button
              @click="formatQuickSql"
              class="px-2 py-1 text-slate-400 hover:text-slate-200 hover:bg-boba-800 rounded transition"
            >
              Format
            </button>
          </div>

          <!-- Execution Stats Badge & History Toggle -->
          <div class="flex items-center space-x-3 text-[11px] font-mono">
            <span v-if="lastExecutionTime !== null" class="text-slate-400">
              Waktu: <strong class="text-slate-200">{{ lastExecutionTime }}ms</strong>
            </span>
            <span v-if="queryResult" class="text-slate-400">
              Baris: <strong class="text-emerald-400">{{ queryResult.rows?.length ?? 0 }}</strong>
              <span v-if="queryResult.affected_rows > 0"> (Affected: {{ queryResult.affected_rows }})</span>
            </span>
            <button
              @click="showHistory = !showHistory"
              :class="['px-2 py-0.5 rounded transition text-[11px] flex items-center space-x-1', showHistory ? 'bg-sky-600 text-white' : 'text-slate-400 hover:bg-boba-800 hover:text-slate-200']"
              title="Lihat Riwayat Query"
            >
              <svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 6v6l4 2" />
              </svg>
              <span>Riwayat</span>
            </button>
          </div>
        </div>

        <!-- AI SQL Assistant Bar (Strict Read-Only Guardrail) -->
        <div class="px-3 py-1.5 bg-purple-950/20 border-b border-purple-900/30 flex items-center space-x-2">
          <Icon icon="lucide:sparkles" class="w-3.5 h-3.5 text-purple-400 shrink-0" />
          <span class="text-xs text-purple-400 font-mono font-semibold shrink-0">AI SQL:</span>
          <span class="text-[9px] px-1.5 py-0.2 rounded bg-emerald-950/80 text-emerald-400 border border-emerald-700/60 font-mono flex items-center space-x-1 shrink-0" title="AI SQL hanya melayani query BACA (SELECT / Read-Only)">
            <Icon icon="lucide:shield-check" class="w-2.5 h-2.5" />
            <span>Read-Only</span>
          </span>
          <input
            v-model="aiPrompt"
            @keydown.enter="handleAiGenerateSql"
            type="text"
            placeholder="Instruksi SQL read-only... (contoh: 'tampilkan 20 data terbaru yang aktif')"
            class="flex-1 bg-boba-950/80 border border-purple-900/50 focus:border-purple-400 rounded px-2.5 py-1 text-xs text-purple-200 placeholder-purple-400/50 focus:outline-none font-sans"
          />
          <button
            @click="handleAiGenerateSql"
            :disabled="aiGenerating || !aiPrompt.trim()"
            class="px-2.5 py-1 bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white rounded text-xs font-medium transition shrink-0"
          >
            {{ aiGenerating ? 'Memproses...' : 'Generate' }}
          </button>
        </div>

        <!-- Query History Dropdown -->
        <div v-if="showHistory" class="p-2 bg-boba-950 border-b border-boba-800 max-h-36 overflow-y-auto space-y-1 font-mono text-[11px]">
          <div v-if="queryHistory.length === 0" class="text-slate-500 text-center py-2 text-xs">
            Belum ada riwayat query.
          </div>
          <div
            v-for="(h, idx) in queryHistory"
            :key="idx"
            @click="loadHistoryQuery(h)"
            class="px-2.5 py-1 rounded bg-[#111622] hover:bg-sky-950/70 text-slate-300 hover:text-sky-200 cursor-pointer truncate flex items-center justify-between transition"
          >
            <span class="truncate mr-2">{{ h }}</span>
            <span class="text-[10px] text-slate-500 shrink-0 font-sans">Gunakan ↵</span>
          </div>
        </div>

        <!-- SQL Editor Textarea with IntelliSense Autocomplete -->
        <div class="p-2 relative">
          <textarea
            ref="sqlEditorTextareaRef"
            v-model="currentQueryText"
            @input="handleEditorInput"
            @keydown="handleEditorKeyDown"
            @blur="handleEditorBlur"
            spellcheck="false"
            autocomplete="off"
            autocorrect="off"
            autocapitalize="off"
            placeholder="Ketik query SQL di sini (Gunakan Tab / Enter untuk autocomplete, Ctrl+Enter untuk eksekusi)..."
            rows="4"
            class="w-full bg-[#07090e] border border-boba-800 rounded-lg p-3 text-xs font-mono text-emerald-300 placeholder-slate-600 focus:outline-none focus:border-sky-500/80 resize-y leading-relaxed"
          ></textarea>

          <!-- Floating IntelliSense Suggestions Box (Positioned Below Cursor / Word) -->
          <div
            v-if="showSuggestions && filteredSuggestions.length > 0"
            class="absolute z-50 bg-[#121724] border border-sky-500/70 rounded-lg shadow-2xl overflow-hidden font-mono text-xs w-72 max-h-52 overflow-y-auto pointer-events-auto"
            :style="{ top: `${suggestionPos.top}px`, left: `${suggestionPos.left}px` }"
          >
            <div class="px-2 py-1 bg-[#0b0e17] border-b border-boba-800 text-[10px] text-slate-400 font-sans flex items-center justify-between">
              <span>Saran IntelliSense (Tab / Enter)</span>
              <span class="text-[9px] text-slate-500">Esc tutup</span>
            </div>
            <div
              v-for="(sug, sIdx) in filteredSuggestions"
              :key="sug.value + sug.type"
              @mousedown.prevent="insertSuggestion(sug)"
              :class="[
                'px-2.5 py-1.5 flex items-center justify-between cursor-pointer select-none transition border-b border-boba-850 last:border-b-0',
                activeSuggestionIndex === sIdx ? 'bg-sky-600 text-white font-bold' : 'text-slate-300 hover:bg-boba-800'
              ]"
            >
              <div class="flex items-center space-x-2 truncate mr-2">
                <Icon
                  :icon="sug.type === 'table' ? 'lucide:table' : (sug.type === 'column' ? 'lucide:columns' : 'lucide:zap')"
                  :class="['w-3.5 h-3.5 shrink-0', sug.type === 'table' ? 'text-sky-400' : (sug.type === 'column' ? 'text-amber-400' : 'text-purple-400')]"
                />
                <span class="truncate">{{ sug.value }}</span>
              </div>
              <span
                :class="[
                  'text-[9px] px-1.5 py-0.2 rounded font-mono uppercase shrink-0',
                  activeSuggestionIndex === sIdx ? 'bg-sky-800 text-sky-100' : 'bg-boba-950 text-slate-400 border border-boba-800'
                ]"
              >
                {{ sug.type }}
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- Bottom Section: View Mode Switcher, Visual Quick Filter Bar & Content -->
      <div class="flex-1 flex flex-col overflow-hidden">
        <!-- View Mode Navigation Tabs -->
        <div class="px-3 py-1.5 border-b border-boba-800 flex items-center justify-between text-xs bg-[#111622] shrink-0">
          <div class="flex items-center space-x-1">
            <button
              @click="activeViewTab = 'data'"
              :class="['px-2.5 py-1 rounded text-xs font-medium transition flex items-center space-x-1.5', activeViewTab === 'data' ? 'bg-sky-950 border border-sky-600/60 text-sky-200' : 'text-slate-400 hover:bg-boba-800 hover:text-slate-200']"
            >
              <Icon icon="lucide:table" class="w-3.5 h-3.5" />
              <span>Data</span>
            </button>
            <button
              v-if="activeTable?.columns && activeTable.columns.length > 0"
              @click="activeViewTab = 'structure'"
              :class="['px-2.5 py-1 rounded text-xs font-medium transition flex items-center space-x-1.5', activeViewTab === 'structure' ? 'bg-sky-950 border border-sky-600/60 text-sky-200' : 'text-slate-400 hover:bg-boba-800 hover:text-slate-200']"
            >
              <Icon icon="lucide:columns" class="w-3.5 h-3.5" />
              <span>Struktur ({{ activeTable.columns.length }} Kolom)</span>
            </button>
            <button
              v-if="activeTable?.columns && activeTable.columns.length > 0"
              @click="activeViewTab = 'ddl'"
              :class="['px-2.5 py-1 rounded text-xs font-medium transition flex items-center space-x-1.5', activeViewTab === 'ddl' ? 'bg-sky-950 border border-sky-600/60 text-sky-200' : 'text-slate-400 hover:bg-boba-800 hover:text-slate-200']"
            >
              <Icon icon="lucide:file-code" class="w-3.5 h-3.5" />
              <span>DDL Script</span>
            </button>
            <button
              v-if="schemaOverview?.tables && schemaOverview.tables.length > 0"
              @click="activeViewTab = 'erd'"
              :class="['px-2.5 py-1 rounded text-xs font-medium transition flex items-center space-x-1.5', activeViewTab === 'erd' ? 'bg-sky-950 border border-sky-600/60 text-sky-200' : 'text-slate-400 hover:bg-boba-800 hover:text-slate-200']"
            >
              <Icon icon="lucide:network" class="w-3.5 h-3.5" />
              <span>ERD Diagram</span>
            </button>

            <!-- Instant Live Data Filter Search Box -->
            <div v-if="activeViewTab === 'data' && queryResult?.rows && queryResult.rows.length > 0" class="flex items-center space-x-1.5 ml-2">
              <div class="relative flex items-center">
                <Icon icon="lucide:search" class="w-3 h-3 text-slate-500 absolute left-2 pointer-events-none" />
                <input
                  v-model="gridSearchQuery"
                  type="text"
                  placeholder="Filter instan di tabel..."
                  class="bg-boba-950 border border-boba-700 focus:border-sky-500 rounded pl-6 pr-2 py-0.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none w-44 font-mono transition"
                />
              </div>
              <span v-if="gridSearchQuery.trim()" class="text-[10px] text-sky-400 font-mono">
                ({{ displayRows.length }}/{{ queryResult.rows.length }})
              </span>
            </div>
          </div>

          <!-- Actions: Insert Row & Export Tools -->
          <div class="flex items-center space-x-1.5">
            <button
              v-if="activeTable?.columns && activeTable.columns.length > 0 && activeViewTab === 'data'"
              @click="insertDraftRow()"
              class="px-2.5 py-1 bg-emerald-900/60 hover:bg-emerald-700 text-emerald-200 rounded text-[11px] font-medium border border-emerald-700/50 transition flex items-center space-x-1"
              title="Tambah baris baru langsung di tabel (Draft inline)"
            >
              <Icon icon="lucide:plus" class="w-3 h-3" />
              <span>Tambah Baris</span>
            </button>

            <template v-if="queryResult?.columns && queryResult.columns.length > 0 && activeViewTab === 'data'">
              <button
                @click="exportData('csv')"
                title="Ekspor ke CSV"
                class="px-2 py-1 bg-boba-800 hover:bg-boba-700 text-slate-300 hover:text-white rounded text-[11px] transition flex items-center space-x-1"
              >
                <Icon icon="lucide:file-text" class="w-3 h-3" />
                <span>CSV</span>
              </button>
              <button
                @click="exportData('excel')"
                title="Ekspor ke File Excel (.xls)"
                class="px-2 py-1 bg-emerald-950/80 hover:bg-emerald-800 text-emerald-300 hover:text-white rounded text-[11px] transition flex items-center space-x-1 border border-emerald-800/50"
              >
                <Icon icon="lucide:file-spreadsheet" class="w-3 h-3 text-emerald-400" />
                <span>Excel</span>
              </button>
              <button
                @click="exportData('json')"
                title="Ekspor ke JSON"
                class="px-2 py-1 bg-boba-800 hover:bg-boba-700 text-slate-300 hover:text-white rounded text-[11px] transition flex items-center space-x-1"
              >
                <Icon icon="lucide:file-json" class="w-3 h-3" />
                <span>JSON</span>
              </button>
              <button
                @click="exportData('sql')"
                title="Ekspor sebagai SQL INSERT Statements (Dump)"
                class="px-2 py-1 bg-boba-800 hover:bg-boba-700 text-slate-300 hover:text-white rounded text-[11px] transition flex items-center space-x-1"
              >
                <Icon icon="lucide:database" class="w-3 h-3" />
                <span>SQL Dump</span>
              </button>
            </template>
          </div>
        </div>

        <!-- Multi-Query Result Set Switcher Bar -->
        <div
          v-if="queryResults && queryResults.length > 1 && activeViewTab === 'data'"
          class="px-3 py-1.5 bg-[#141a29] border-b border-boba-800 flex items-center space-x-2 text-xs font-mono select-none overflow-x-auto shrink-0 shadow-inner"
        >
          <span class="text-[11px] text-slate-400 font-sans font-bold shrink-0">Hasil Query ({{ queryResults.length }} Query):</span>
          <button
            v-for="(res, rIdx) in queryResults"
            :key="rIdx"
            @click="activeResultIndex = rIdx"
            :class="[
              'px-2.5 py-1 rounded text-xs transition flex items-center space-x-1.5 shrink-0 border font-mono',
              activeResultIndex === rIdx
                ? 'bg-sky-600 text-white font-bold border-sky-400 shadow-md ring-1 ring-sky-300/50'
                : 'bg-boba-950 text-slate-400 hover:text-slate-200 border-boba-800 hover:bg-boba-850'
            ]"
          >
            <span>Result {{ rIdx + 1 }}</span>
            <span class="text-[10px] text-sky-200 font-sans" v-if="res?.rows && res.rows.length > 0">
              ({{ res.rows.length }} baris)
            </span>
            <span class="text-[10px] text-emerald-200 font-sans" v-else-if="res && res.affected_rows > 0">
              ({{ res.affected_rows }} affected)
            </span>
          </button>
        </div>

        <!-- Fitur 1: Visual Multi-Filter Bar with Per-Condition AND / OR -->
        <div
          v-if="activeTable?.columns && activeTable.columns.length > 0 && activeViewTab === 'data'"
          class="bg-[#0e131f] border-b border-boba-800 flex flex-col px-3 py-2 space-y-2 text-xs font-mono shrink-0"
        >
          <!-- Multi-Filter Header Controls -->
          <div class="flex items-center justify-between">
            <div class="flex items-center space-x-2">
              <span class="text-slate-300 text-[11px] font-sans font-bold flex items-center space-x-1.5">
                <Icon icon="lucide:filter" class="w-3.5 h-3.5 text-sky-400" />
                <span>Multi-Filter Query</span>
                <span
                  v-if="filterState?.active"
                  class="px-1.5 py-0.2 bg-emerald-950 border border-emerald-600/70 text-emerald-300 rounded text-[9px] font-mono"
                >
                  Aktif ({{ filterState.rules?.length ?? 0 }} Aturan)
                </span>
              </span>
            </div>

            <div class="flex items-center space-x-1.5">
              <button
                @click="addFilterRule"
                class="px-2.5 py-1 bg-boba-800 hover:bg-boba-700 text-slate-200 rounded text-[11px] transition flex items-center space-x-1 border border-boba-700"
              >
                <Icon icon="lucide:plus" class="w-3 h-3" />
                <span>Kondisi</span>
              </button>
              <button
                @click="applyMultiFilter"
                class="px-3.5 py-1 bg-sky-600 hover:bg-sky-500 text-white rounded text-[11px] font-semibold shadow transition"
              >
                Terapkan Filter
              </button>
              <button
                v-if="filterState?.active"
                @click="resetMultiFilter"
                class="px-2.5 py-1 bg-boba-800 hover:bg-boba-700 text-slate-300 rounded text-[11px] transition"
              >
                Reset
              </button>
            </div>
          </div>

          <!-- Dynamic Filter Conditions Rows (Per-Filter Conjunction) -->
          <div v-if="filterState?.rules && filterState.rules.length > 0" class="space-y-1.5 max-h-44 overflow-y-auto pr-1">
            <div
              v-for="(rule, rIdx) in filterState.rules"
              :key="rule.id"
              class="flex items-center space-x-2 bg-[#121826]/60 p-1 rounded-md border border-boba-800/80"
            >
              <!-- First row shows WHERE, subsequent rows show individual AND / OR selector -->
              <div class="w-18 shrink-0 flex justify-center">
                <span
                  v-if="rIdx === 0"
                  class="px-2 py-1 bg-boba-900 border border-boba-700 text-slate-400 rounded text-[10px] font-bold font-mono"
                >
                  WHERE
                </span>
                <select
                  v-else
                  v-model="rule.conjunction"
                  class="bg-sky-950 border border-sky-600/60 rounded px-1.5 py-0.5 text-xs text-sky-300 font-bold focus:outline-none cursor-pointer"
                >
                  <option value="AND">AND</option>
                  <option value="OR">OR</option>
                </select>
              </div>

              <!-- Column Selector -->
              <select
                v-model="rule.column"
                class="bg-boba-950 border border-boba-700 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none min-w-[140px]"
              >
                <option value="">-- Pilih Kolom --</option>
                <option v-for="c in (activeTable?.columns ?? [])" :key="c.name" :value="c.name">
                  {{ c.name }} ({{ c.data_type }})
                </option>
              </select>

              <!-- Operator Selector -->
              <select
                v-model="rule.operator"
                class="bg-boba-950 border border-boba-700 rounded px-2 py-1 text-xs text-slate-200 focus:outline-none min-w-[125px]"
              >
                <option value="=">= (Sama)</option>
                <option value="!=">!= (Tidak sama)</option>
                <option value="LIKE">LIKE (Mengandung)</option>
                <option value="STARTS WITH">STARTS WITH (Awalan)</option>
                <option value="ENDS WITH">ENDS WITH (Akhiran)</option>
                <option value=">">&gt; Lebih besar</option>
                <option value=">=">&gt;= Lebih besar sama</option>
                <option value="<">&lt; Lebih kecil</option>
                <option value="<=">&lt;= Lebih kecil sama</option>
                <option value="IS NULL">IS NULL (Kosong)</option>
                <option value="IS NOT NULL">IS NOT NULL (Ada isi)</option>
              </select>

              <!-- Value Field -->
              <input
                v-if="!['IS NULL', 'IS NOT NULL'].includes(rule.operator)"
                v-model="rule.value"
                @keydown.enter="applyMultiFilter"
                type="text"
                placeholder="Nilai filter..."
                class="flex-1 min-w-[120px] bg-boba-950 border border-boba-700 focus:border-boba-accent rounded px-2.5 py-1 text-xs text-slate-100 focus:outline-none font-mono"
              />
              <div v-else class="flex-1"></div>

              <!-- Remove Rule Button -->
              <button
                v-if="filterState.rules.length > 1"
                @click="removeFilterRule(rule.id)"
                title="Hapus kondisi ini"
                class="w-6 h-6 flex items-center justify-center rounded hover:bg-rose-950/80 text-slate-500 hover:text-rose-300 text-xs transition shrink-0"
              >
                ✕
              </button>
            </div>
          </div>
        </div>

        <!-- Unsaved Pending Edits & Draft Rows Banner (Commit / Rollback Controls) -->
        <div
          v-if="(pendingEditsCount > 0 || (pendingNewRows && pendingNewRows.length > 0)) && activeViewTab === 'data'"
          class="px-3.5 py-2 bg-[#1c1409] border-b border-amber-600/70 flex items-center justify-between text-xs font-sans shadow-md animate-in fade-in shrink-0 select-none"
        >
          <div class="flex items-center space-x-2.5 text-amber-200">
            <span class="w-2 h-2 rounded-full bg-amber-400"></span>
            <span class="font-bold">
              <span v-if="pendingEditsCount > 0">{{ pendingEditsCount }} sel diedit</span>
              <span v-if="pendingEditsCount > 0 && pendingNewRows?.length > 0"> & </span>
              <span v-if="pendingNewRows?.length > 0">{{ pendingNewRows.length }} baris draft baru</span>
              (belum di-commit ke database).
            </span>
          </div>

          <div class="flex items-center space-x-2">
            <button
              @click="rollbackPendingEdits"
              class="px-3 py-1 bg-boba-900 hover:bg-boba-800 text-slate-300 hover:text-white rounded border border-boba-700 text-xs font-medium transition flex items-center space-x-1.5"
            >
              <Icon icon="lucide:rotate-ccw" class="w-3.5 h-3.5 text-slate-400" />
              <span>Batalkan</span>
            </button>
            <button
              @click="commitPendingEdits"
              :disabled="committingEdits"
              class="px-4 py-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded font-bold text-xs shadow-lg transition flex items-center space-x-1.5"
            >
              <span v-if="committingEdits" class="w-3 h-3 border border-white border-t-transparent rounded-full animate-spin"></span>
              <Icon v-else icon="lucide:check" class="w-3.5 h-3.5" />
              <span>{{ committingEdits ? 'Menyimpan...' : 'Simpan Perubahan (Commit)' }}</span>
            </button>
          </div>
        </div>

        <!-- Query Error Banner -->
        <div v-if="errorMessage" class="p-3 bg-rose-950/60 border-b border-rose-800 text-rose-300 text-xs font-mono select-text flex items-start space-x-2">
          <span class="text-xs text-rose-400 font-bold shrink-0">[ERR]</span>
          <div class="flex-1 break-all">{{ errorMessage }}</div>
        </div>

        <!-- VIEW 1: Interactive Data Table Grid -->
        <div v-if="activeViewTab === 'data'" class="flex-1 flex flex-col overflow-hidden bg-[#07090e] relative font-mono text-xs select-text">
          <div class="flex-1 overflow-auto">
            <table v-if="queryResult?.columns && queryResult.columns.length > 0" class="w-full text-left border-collapse">
              <thead class="bg-[#141a29] sticky top-0 z-10 border-b border-boba-800 shadow-sm text-slate-300">
                <tr>
                  <th class="px-2 py-1.5 text-[10px] text-slate-500 font-mono border-r border-boba-800 w-10 text-center">#</th>
                  <th
                    v-for="col in queryResult.columns"
                    :key="col"
                    class="px-3 py-1.5 border-r border-boba-800 font-semibold tracking-wide text-sky-300 select-none whitespace-nowrap"
                  >
                    {{ col }}
                  </th>
                  <th class="px-3 py-1.5 text-slate-400 select-none w-24 text-center">
                    Aksi
                  </th>
                </tr>
              </thead>
              <tbody class="divide-y divide-boba-850">
                <!-- Existing Saved Rows -->
                <tr
                  v-for="(row, rIdx) in displayRows"
                  :key="rIdx"
                  class="hover:bg-boba-800/40 transition group"
                >
                  <td class="px-2 py-1 text-[10px] text-slate-600 border-r border-boba-850 text-center select-none">
                    {{ (currentPage - 1) * pageSize + rIdx + 1 }}
                  </td>
                  <td
                    v-for="(val, cIdx) in row"
                    :key="cIdx"
                    @dblclick="startInlineCellEdit(rIdx, cIdx, val)"
                    @contextmenu.prevent.stop="openCellContextMenu($event, rIdx, cIdx, row, val)"
                    :class="[
                      'px-3 py-1 border-r border-boba-850 text-slate-300 whitespace-nowrap max-w-xs truncate cursor-pointer transition-colors relative',
                      editingCell?.rIdx === rIdx && editingCell?.cIdx === cIdx
                        ? 'p-0.5 bg-sky-950 ring-1 ring-sky-400'
                        : (isCellPending(rIdx, cIdx) ? 'bg-amber-950/80 text-amber-200 border-amber-600/70 font-semibold ring-1 ring-amber-500/50' : 'hover:bg-sky-950/40'),
                      justUpdatedCell === `${rIdx}_${cIdx}`
                        ? 'bg-emerald-950/80 text-emerald-200 ring-1 ring-emerald-400'
                        : ''
                    ]"
                    :title="isCellPending(rIdx, cIdx) ? `Perubahan belum disimpan (Sebelumnya: ${pendingEdits[`${rIdx}_${cIdx}`]?.oldVal})` : (typeof val === 'object' ? JSON.stringify(val) : String(val))"
                  >
                    <!-- Indicator dot for pending edits -->
                    <span
                      v-if="isCellPending(rIdx, cIdx)"
                      class="inline-block w-1.5 h-1.5 rounded-full bg-amber-400 mr-1 animate-pulse"
                      title="Perubahan belum di-commit"
                    ></span>

                    <!-- Active Inline Cell Input -->
                    <input
                      v-if="editingCell?.rIdx === rIdx && editingCell?.cIdx === cIdx"
                      ref="inlineInputRef"
                      v-model="editingCell.tempValue"
                      @keydown.enter.prevent="saveInlineCellEdit(rIdx, cIdx)"
                      @keydown.esc.prevent="cancelInlineCellEdit"
                      @blur="saveInlineCellEdit(rIdx, cIdx)"
                      class="w-full bg-[#070a12] border border-sky-400 text-sky-200 px-1.5 py-0.5 rounded text-xs font-mono outline-none shadow-inner"
                    />

                    <!-- Render Cell Value -->
                    <template v-else>
                      <span v-if="val === null" class="text-slate-600 italic">NULL</span>
                      <span v-else-if="typeof val === 'boolean'" :class="val ? 'text-emerald-400' : 'text-rose-400'">
                        {{ val ? 'TRUE' : 'FALSE' }}
                      </span>
                      <span v-else-if="typeof val === 'object'" class="text-purple-400">
                        {{ JSON.stringify(val) }}
                      </span>
                      <span v-else>{{ val }}</span>
                    </template>
                  </td>
                  <td class="px-2 py-1 text-center select-none whitespace-nowrap">
                    <div class="opacity-0 group-hover:opacity-100 flex items-center justify-center space-x-1.5 transition">
                      <button
                        @click="copyRowAsJson(row)"
                        title="Salin 1 Baris Lengkap ke Clipboard (JSON)"
                        class="p-1 hover:bg-sky-900/60 rounded text-slate-400 hover:text-sky-300 transition text-[11px]"
                      >
                        <Icon icon="lucide:file-json" class="w-3.5 h-3.5" />
                      </button>
                      <button
                        @click="cloneRow(row)"
                        title="Clone / Duplikat Baris ke Baris Baru"
                        class="p-1 hover:bg-sky-900/60 rounded text-sky-400 hover:text-sky-200 transition text-xs"
                      >
                        <Icon icon="lucide:copy" class="w-3.5 h-3.5" />
                      </button>
                      <button
                        @click="openEditRowModal(row)"
                        title="Edit baris data (Modal)"
                        class="p-1 hover:bg-amber-900/60 rounded text-amber-400 hover:text-amber-200 transition text-xs"
                      >
                        <Icon icon="lucide:edit-3" class="w-3.5 h-3.5" />
                      </button>
                      <button
                        @click="handleDeleteRow(row)"
                        title="Hapus baris data"
                        class="p-1 hover:bg-rose-900/60 rounded text-rose-400 hover:text-rose-200 transition text-xs"
                      >
                        <Icon icon="lucide:trash-2" class="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>

                <!-- Draft Pending Insert / Cloned Rows -->
                <tr
                  v-for="(nRow, nIdx) in (pendingNewRows ?? [])"
                  :key="nRow.tempId"
                  class="bg-emerald-950/30 hover:bg-emerald-950/50 transition border-b border-emerald-800/60 ring-1 ring-emerald-500/40"
                >
                  <td class="px-2 py-1 text-[9px] text-emerald-300 border-r border-emerald-800/60 text-center select-none font-bold font-sans">
                    + BARU
                  </td>
                  <td
                    v-for="col in (queryResult?.columns ?? [])"
                    :key="col"
                    class="px-2 py-0.5 border-r border-emerald-800/60 text-emerald-200 whitespace-nowrap"
                  >
                    <input
                      v-model="nRow.values[col]"
                      :placeholder="activeTable?.columns.find(c => c.name === col)?.default_value ? `Default: ${activeTable?.columns.find(c => c.name === col)?.default_value}` : 'NULL'"
                      class="w-full bg-[#070f0c] border border-emerald-600/70 focus:border-emerald-400 text-emerald-200 px-1.5 py-0.5 rounded text-xs font-mono outline-none shadow-inner"
                    />
                  </td>
                  <td class="px-2 py-1 text-center select-none whitespace-nowrap">
                    <button
                      @click="removeDraftRow(nRow.tempId)"
                      title="Batalkan baris draft baru ini"
                      class="px-2 py-0.5 hover:bg-rose-950 rounded text-slate-400 hover:text-rose-300 transition text-[11px] font-bold"
                    >
                      ✕ Hapus
                    </button>
                  </td>
                </tr>
              </tbody>
            </table>

            <!-- Empty State Grid -->
            <div
              v-else-if="!executing && !errorMessage"
              class="h-full flex flex-col items-center justify-center p-8 text-center text-slate-500 space-y-1.5"
            >
              <div class="text-xs text-slate-400 font-medium">Belum ada data ditampilkan</div>
              <div class="text-[11px] text-slate-600">Pilih tabel di navigasi kiri atau jalankan query SQL.</div>
            </div>
          </div>

          <!-- Data Grid Pagination Footer with Total Records Counter -->
          <div
            v-if="queryResult?.columns && queryResult.columns.length > 0 && activeViewTab === 'data'"
            class="px-3 py-1.5 bg-[#121724] border-t border-boba-800 flex items-center justify-between text-xs shrink-0 select-none font-mono"
          >
            <div class="flex items-center space-x-3 text-slate-300">
              <div class="flex items-center space-x-1.5">
                <span class="text-slate-400 text-[11px] font-sans">Halaman:</span>
                <span class="font-bold text-sky-400">{{ currentPage }}</span>
              </div>
              <span class="text-slate-600">|</span>
              <div class="flex items-center space-x-1.5">
                <span class="text-slate-400 text-[11px] font-sans">Limit:</span>
                <select
                  v-model.number="pageSize"
                  @change="handlePageChange(1)"
                  class="bg-boba-950 border border-boba-700 rounded px-1.5 py-0.5 text-xs text-slate-200 focus:outline-none"
                >
                  <option :value="50">50</option>
                  <option :value="100">100</option>
                  <option :value="250">250</option>
                  <option :value="500">500</option>
                </select>
              </div>
              <span class="text-slate-600">|</span>
              <!-- Total Records Counter Display -->
              <div class="flex items-center space-x-1.5 text-slate-300 text-[11px]">
                <span class="text-slate-400 font-sans">Total Data:</span>
                <span class="font-bold text-emerald-400">
                  {{ typeof totalTableRows === 'number' ? totalTableRows.toLocaleString() : ((queryResult?.rows?.length ?? 0).toLocaleString()) }}
                </span>
                <span class="text-slate-500 font-sans text-[10px]">
                  (Menampilkan {{ (currentPage - 1) * pageSize + 1 }} - {{ (currentPage - 1) * pageSize + (queryResult?.rows?.length ?? 0) }})
                </span>
              </div>
            </div>

            <div class="flex items-center space-x-1.5">
              <button
                @click="handlePageChange(currentPage - 1)"
                :disabled="currentPage <= 1"
                class="px-2.5 py-1 bg-boba-800 hover:bg-boba-700 disabled:opacity-40 rounded text-[11px] text-slate-200 transition"
              >
                ◀ Prev
              </button>
              <button
                @click="handlePageChange(currentPage + 1)"
                :disabled="!queryResult?.rows || queryResult.rows.length < pageSize"
                class="px-2.5 py-1 bg-boba-800 hover:bg-boba-700 disabled:opacity-40 rounded text-[11px] text-slate-200 transition"
              >
                Next ▶
              </button>
            </div>
          </div>
        </div>

        <!-- VIEW 2: Table Structure / Column Meta -->
        <div v-else-if="activeViewTab === 'structure'" class="flex-1 overflow-auto bg-[#07090e] p-3 font-mono text-xs select-text">
          <table v-if="activeTable?.columns && activeTable.columns.length > 0" class="w-full text-left border-collapse border border-boba-800">
            <thead class="bg-[#141a29] border-b border-boba-800 text-slate-300">
              <tr>
                <th class="px-3 py-2 border-r border-boba-800">Nama Kolom</th>
                <th class="px-3 py-2 border-r border-boba-800">Tipe Data</th>
                <th class="px-3 py-2 border-r border-boba-800">Primary Key</th>
                <th class="px-3 py-2 border-r border-boba-800">Nullable</th>
                <th class="px-3 py-2">Default Value</th>
              </tr>
            </thead>
            <tbody class="divide-y divide-boba-850">
              <tr v-for="col in activeTable.columns" :key="col.name" class="hover:bg-boba-800/40">
                <td class="px-3 py-1.5 font-bold text-sky-300 border-r border-boba-850">{{ col.name }}</td>
                <td class="px-3 py-1.5 text-amber-300 border-r border-boba-850">{{ col.data_type }}</td>
                <td class="px-3 py-1.5 border-r border-boba-850">
                  <span v-if="col.is_primary_key" class="px-1.5 py-0.5 bg-amber-950 border border-amber-800 text-amber-300 rounded text-[10px] font-bold">PRIMARY KEY</span>
                  <span v-else class="text-slate-600">-</span>
                </td>
                <td class="px-3 py-1.5 border-r border-boba-850">
                  <span :class="col.is_nullable ? 'text-emerald-400' : 'text-rose-400'">
                    {{ col.is_nullable ? 'YES' : 'NO' }}
                  </span>
                </td>
                <td class="px-3 py-1.5 text-slate-400">{{ col.default_value ?? 'NULL' }}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <!-- VIEW 3: Table DDL Script -->
        <div v-else-if="activeViewTab === 'ddl'" class="flex-1 overflow-auto bg-[#07090e] p-3 font-mono text-xs select-text">
          <div class="p-3 bg-boba-950 rounded-lg border border-boba-800 whitespace-pre text-emerald-300 leading-relaxed">
{{ generateTableDdl() }}
          </div>
        </div>

        <!-- VIEW 4: Entity Relationship Diagram (ERD) -->
        <div v-else-if="activeViewTab === 'erd'" class="flex-1 flex overflow-hidden">
          <ErdDiagramView
            :db-config="tab.dbConnection"
            :active-db="activeDatabase"
            :tables="schemaOverview?.tables || []"
          />
        </div>
      </div>
    </div>

    <!-- Fitur 4: EXPLAIN & Optimizer Modal -->
    <div
      v-if="explainResult"
      class="fixed inset-0 bg-boba-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in"
    >
      <div class="bg-boba-900 border border-boba-700 rounded-xl max-w-2xl w-full p-6 shadow-2xl space-y-4 max-h-[85vh] overflow-y-auto font-sans">
        <div class="flex items-center justify-between border-b border-boba-800 pb-3">
          <div class="flex items-center space-x-2">
            <h3 class="text-base font-bold text-slate-100">Analisis Rencana Eksekusi (EXPLAIN)</h3>
          </div>
          <button @click="explainResult = null" class="text-slate-400 hover:text-white text-sm">✕</button>
        </div>

        <!-- Full Table Scan Alert -->
        <div
          v-if="explainResult.has_full_table_scan"
          class="p-3.5 bg-amber-950/70 border border-amber-600/70 rounded-xl flex items-start space-x-3 text-amber-200 text-xs"
        >
          <span class="text-xs font-bold text-amber-400 shrink-0">[WARN]</span>
          <div>
            <strong class="font-bold">Full Table Scan Terdeteksi</strong>
            <p class="text-[11px] text-amber-300/90 mt-0.5">
              Query ini memindai seluruh baris tabel tanpa menggunakan indeks yang sesuai. Hal ini dapat menyebabkan beban CPU & I/O tinggi pada dataset besar.
            </p>
          </div>
        </div>

        <!-- Optimizer Suggestions -->
        <div v-if="explainResult.suggestions && explainResult.suggestions.length > 0" class="space-y-1.5">
          <div class="text-[11px] font-semibold text-emerald-400 uppercase tracking-wider">Saran Optimasi Indeks:</div>
          <ul class="space-y-1 bg-emerald-950/30 border border-emerald-900/50 p-3 rounded-lg text-xs text-emerald-200 list-disc list-inside">
            <li v-for="(sug, idx) in explainResult.suggestions" :key="idx">{{ sug }}</li>
          </ul>
        </div>

        <!-- Raw EXPLAIN Output -->
        <div class="space-y-1.5">
          <div class="text-[11px] font-semibold text-slate-400 uppercase tracking-wider">Raw Plan Output:</div>
          <pre class="p-3 bg-black/60 border border-boba-800 rounded-lg text-xs font-mono text-slate-300 overflow-auto whitespace-pre-wrap max-h-56 leading-relaxed">{{ explainResult.raw_output }}</pre>
        </div>

        <div class="flex justify-end pt-2 border-t border-boba-800">
          <button
            @click="explainResult = null"
            class="px-4 py-1.5 bg-boba-800 hover:bg-boba-700 text-slate-200 rounded-lg text-xs"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>

    <!-- Fitur 5: Server Health Monitor Modal -->
    <div
      v-if="isHealthModalOpen"
      class="fixed inset-0 bg-boba-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in"
    >
      <div class="bg-boba-900 border border-boba-700 rounded-xl max-w-xl w-full p-6 shadow-2xl space-y-4 max-h-[85vh] overflow-y-auto font-sans">
        <div class="flex items-center justify-between border-b border-boba-800 pb-3">
          <div>
            <h3 class="text-base font-bold text-slate-100">Database Server Health Monitor</h3>
            <p class="text-[11px] text-slate-400">{{ tab.dbConnection?.name }} ({{ tab.dbConnection?.engine.toUpperCase() }})</p>
          </div>
          <button @click="isHealthModalOpen = false" class="text-slate-400 hover:text-white text-sm">✕</button>
        </div>

        <div v-if="loadingHealth" class="py-10 text-center text-slate-400 text-xs">
          Mengambil metrik server database...
        </div>

        <div v-else-if="serverMetrics" class="space-y-4">
          <!-- Metrics KPI Cards -->
          <div class="grid grid-cols-3 gap-2.5">
            <div class="bg-boba-950 border border-boba-800 p-3 rounded-xl text-center">
              <div class="text-[10px] text-slate-400 uppercase font-semibold">Active Connections</div>
              <div class="text-xl font-black text-sky-400 font-mono mt-1">
                {{ serverMetrics.active_connections }} <span class="text-xs text-slate-500 font-normal">/ {{ serverMetrics.max_connections }}</span>
              </div>
            </div>

            <div class="bg-boba-950 border border-boba-800 p-3 rounded-xl text-center">
              <div class="text-[10px] text-slate-400 uppercase font-semibold">Buffer/Cache Hit Rate</div>
              <div class="text-xl font-black text-emerald-400 font-mono mt-1">
                {{ serverMetrics.cache_hit_rate_pct !== null && serverMetrics.cache_hit_rate_pct !== undefined ? serverMetrics.cache_hit_rate_pct.toFixed(1) + '%' : '100%' }}
              </div>
            </div>

            <div class="bg-boba-950 border border-boba-800 p-3 rounded-xl text-center">
              <div class="text-[10px] text-slate-400 uppercase font-semibold">Uptime</div>
              <div class="text-sm font-bold text-purple-400 font-mono mt-2">
                {{ formatUptime(serverMetrics.uptime_seconds) }}
              </div>
            </div>
          </div>

          <!-- Server Details Table -->
          <div class="bg-boba-950 border border-boba-800 rounded-xl p-3 space-y-2 text-xs font-mono">
            <div class="flex justify-between border-b border-boba-850 pb-1.5">
              <span class="text-slate-400">Server Version:</span>
              <span class="text-slate-200 truncate max-w-xs">{{ serverMetrics.version }}</span>
            </div>
            <div class="flex justify-between border-b border-boba-850 pb-1.5" v-if="serverMetrics.queries_count > 0">
              <span class="text-slate-400">Total Queries/Commands:</span>
              <span class="text-slate-200">{{ serverMetrics.queries_count?.toLocaleString?.() ?? serverMetrics.queries_count }}</span>
            </div>
            <div class="flex justify-between border-b border-boba-850 pb-1.5" v-if="serverMetrics.memory_used_bytes">
              <span class="text-slate-400">Memory Usage:</span>
              <span class="text-slate-200">{{ formatBytes(serverMetrics.memory_used_bytes) }}</span>
            </div>
            <div v-for="(val, k) in serverMetrics.extra_info" :key="k" class="flex justify-between border-b border-boba-850 pb-1.5">
              <span class="text-slate-400">{{ k }}:</span>
              <span class="text-slate-200">{{ val }}</span>
            </div>
          </div>
        </div>

        <div class="flex justify-between items-center pt-2 border-t border-boba-800">
          <button
            @click="openHealthMonitor"
            class="px-3 py-1.5 bg-boba-800 hover:bg-boba-700 text-slate-300 rounded-lg text-xs"
          >
            Refresh
          </button>
          <button
            @click="isHealthModalOpen = false"
            class="px-4 py-1.5 bg-boba-800 hover:bg-boba-700 text-slate-200 rounded-lg text-xs"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>

    <!-- Fitur 3: Saved Queries / Snippets Drawer Modal -->
    <div
      v-if="isSnippetsDrawerOpen"
      class="fixed inset-0 bg-boba-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in"
    >
      <div class="bg-boba-900 border border-boba-700 rounded-xl max-w-xl w-full p-6 shadow-2xl space-y-4 max-h-[85vh] overflow-y-auto font-sans">
        <div class="flex items-center justify-between border-b border-boba-800 pb-3">
          <h3 class="text-base font-bold text-slate-100">SQL Snippets & Saved Queries</h3>
          <button @click="isSnippetsDrawerOpen = false" class="text-slate-400 hover:text-white text-sm">✕</button>
        </div>

        <!-- Quick Save Current Query Section -->
        <div v-if="currentQueryText.trim()" class="p-3 bg-boba-950 rounded-xl border border-boba-800 space-y-2">
          <div class="text-xs font-semibold text-sky-400">Simpan Query Aktif ke Vault:</div>
          <div class="flex space-x-2">
            <input
              v-model="newSnippetTitle"
              type="text"
              placeholder="Judul Snippet (misal: Laporan Penjualan)..."
              class="flex-1 bg-boba-900 border border-boba-700 rounded px-2.5 py-1 text-xs text-slate-100 focus:outline-none"
            />
            <button
              @click="handleSaveSnippet"
              :disabled="!newSnippetTitle.trim()"
              class="px-3 py-1 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white rounded text-xs font-medium transition"
            >
              + Simpan
            </button>
          </div>
        </div>

        <!-- Scope Filter Tabs -->
        <div class="flex items-center space-x-2 border-b border-boba-800 pb-2 text-xs">
          <button
            @click="snippetScope = 'connection'"
            :class="[
              'px-2.5 py-1 rounded font-medium transition',
              snippetScope === 'connection'
                ? 'bg-amber-600 text-white shadow-sm'
                : 'bg-boba-950 text-slate-400 hover:text-slate-200'
            ]"
          >
            Koneksi Ini: {{ tab.dbConnection?.name }} ({{ currentConnectionSnippetsCount }})
          </button>
          <button
            @click="snippetScope = 'all'"
            :class="[
              'px-2.5 py-1 rounded font-medium transition',
              snippetScope === 'all'
                ? 'bg-amber-600 text-white shadow-sm'
                : 'bg-boba-950 text-slate-400 hover:text-slate-200'
            ]"
          >
            Semua Snippet ({{ dbmsStore.savedQueries.length }})
          </button>
        </div>

        <!-- Saved Queries List -->
        <div class="space-y-2 max-h-64 overflow-y-auto">
          <div v-if="filteredSnippets.length === 0" class="py-6 text-center text-slate-500 text-xs">
            Belum ada query tersimpan untuk {{ snippetScope === 'connection' ? 'koneksi ini' : 'vault' }}.
          </div>
          <div
            v-for="snip in filteredSnippets"
            :key="snip.id"
            class="p-3 bg-boba-950/70 border border-boba-800 rounded-xl hover:border-amber-500/50 transition space-y-1.5 group"
          >
            <div class="flex items-center justify-between">
              <div class="flex items-center space-x-2 truncate mr-2">
                <span class="font-bold text-xs text-slate-200 truncate">{{ snip.title }}</span>
                <span v-if="snip.db_name" class="text-[9px] px-1.5 py-0.2 rounded bg-sky-950 text-sky-300 border border-sky-800/60 font-mono shrink-0">
                  {{ snip.db_name }}
                </span>
                <span v-else class="text-[9px] px-1.5 py-0.2 rounded bg-boba-800 text-slate-400 font-mono shrink-0">
                  Global
                </span>
              </div>
              <div class="flex items-center space-x-1 shrink-0">
                <button
                  @click="useSnippet(snip.query)"
                  class="px-2 py-0.5 bg-sky-600 hover:bg-sky-500 text-white rounded text-[10px] font-medium"
                >
                  Gunakan
                </button>
                <button
                  @click="dbmsStore.removeSavedQuery(snip.id)"
                  class="p-1 text-slate-500 hover:text-rose-400 rounded text-xs"
                >
                  ✕
                </button>
              </div>
            </div>
            <pre class="text-[11px] font-mono text-emerald-300 bg-black/40 p-2 rounded max-h-20 overflow-auto whitespace-pre-wrap">{{ snip.query }}</pre>
          </div>
        </div>

        <div class="flex justify-end pt-2 border-t border-boba-800">
          <button
            @click="isSnippetsDrawerOpen = false"
            class="px-4 py-1.5 bg-boba-800 hover:bg-boba-700 text-slate-200 rounded-lg text-xs"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>

    <!-- Table Context Menu Floating Overlay -->
    <div
      v-if="tableContextMenu.visible && tableContextMenu.table"
      :style="{ top: `${tableContextMenu.y}px`, left: `${tableContextMenu.x}px` }"
      class="fixed z-[99999] bg-[#161a26] border border-[#2b354b] shadow-2xl rounded py-1 w-56 text-[11px] text-slate-200 select-none font-sans"
      @click.stop
    >
      <div class="px-2.5 py-1 text-[10px] text-slate-400 font-semibold truncate border-b border-[#232b3d] mb-0.5 font-mono">
        {{ tableContextMenu.table.name }}
      </div>
      <button
        @click="handleContextAction('select')"
        class="w-full text-left px-2.5 py-1 hover:bg-sky-600 hover:text-white flex items-center space-x-2 transition"
      >
        <Icon icon="lucide:table" class="w-3.5 h-3.5 text-sky-400" />
        <span>Lihat Data (100 Baris)</span>
      </button>
      <button
        @click="handleContextAction('structure')"
        class="w-full text-left px-2.5 py-1 hover:bg-sky-600 hover:text-white flex items-center space-x-2 transition"
      >
        <Icon icon="lucide:columns" class="w-3.5 h-3.5 text-sky-400" />
        <span>Lihat Struktur Kolom</span>
      </button>
      <button
        @click="handleContextAction('alter')"
        class="w-full text-left px-2.5 py-1 hover:bg-indigo-600 hover:text-white flex items-center space-x-2 transition"
      >
        <Icon icon="lucide:table-properties" class="w-3.5 h-3.5 text-indigo-400" />
        <span>Modifikasi Desain Tabel</span>
      </button>
      <button
        @click="handleContextAction('copy_name')"
        class="w-full text-left px-2.5 py-1 hover:bg-sky-600 hover:text-white flex items-center space-x-2 transition"
      >
        <Icon icon="lucide:copy" class="w-3.5 h-3.5 text-slate-400" />
        <span>Salin Nama Tabel</span>
      </button>
      <button
        @click="handleContextAction('ddl')"
        class="w-full text-left px-2.5 py-1 hover:bg-sky-600 hover:text-white flex items-center space-x-2 transition border-b border-[#232b3d]/60 pb-1.5 mb-1"
      >
        <Icon icon="lucide:file-code" class="w-3.5 h-3.5 text-slate-400" />
        <span>Lihat Syntax DDL</span>
      </button>
      <button
        @click="handleContextAction('truncate')"
        class="w-full text-left px-2.5 py-1 hover:bg-amber-950/80 hover:text-amber-300 text-amber-400 flex items-center space-x-2 transition"
      >
        <Icon icon="lucide:eraser" class="w-3.5 h-3.5 text-amber-400" />
        <span>Kosongkan Tabel (TRUNCATE)</span>
      </button>
      <button
        @click="handleContextAction('drop')"
        class="w-full text-left px-2.5 py-1 hover:bg-rose-950/80 hover:text-rose-300 text-rose-400 flex items-center space-x-2 transition"
      >
        <Icon icon="lucide:trash-2" class="w-3.5 h-3.5 text-rose-400" />
        <span>Hapus Tabel (DROP)</span>
      </button>
    </div>

    <!-- Cell & Row Context Menu Floating Overlay -->
    <div
      v-if="cellContextMenu.visible"
      :style="{ top: `${cellContextMenu.y}px`, left: `${cellContextMenu.x}px` }"
      class="fixed z-[99999] bg-[#161a26] border border-[#2b354b] shadow-2xl rounded py-1 w-56 text-[11px] text-slate-200 select-none font-sans"
      @click.stop
    >
      <div class="px-2.5 py-1 text-[10px] text-slate-400 font-semibold truncate border-b border-[#232b3d] mb-0.5 font-mono">
        Kolom: {{ cellContextMenu.column }}
      </div>
      <button
        @click="handleCellContextAction('edit_inline')"
        class="w-full text-left px-2.5 py-1 hover:bg-sky-600 hover:text-white flex items-center space-x-2 transition"
      >
        <Icon icon="lucide:edit-2" class="w-3.5 h-3.5 text-sky-400" />
        <span>Edit Nilai Sel (Inline)</span>
      </button>
      <button
        @click="handleCellContextAction('edit_row')"
        class="w-full text-left px-2.5 py-1 hover:bg-sky-600 hover:text-white flex items-center space-x-2 transition"
      >
        <Icon icon="lucide:edit-3" class="w-3.5 h-3.5 text-sky-400" />
        <span>Edit Baris (Modal)</span>
      </button>
      <button
        @click="handleCellContextAction('clone')"
        class="w-full text-left px-2.5 py-1 hover:bg-sky-600 hover:text-white flex items-center space-x-2 transition"
      >
        <Icon icon="lucide:copy" class="w-3.5 h-3.5 text-sky-400" />
        <span>Duplikat Baris Ini</span>
      </button>
      <div class="h-px bg-[#232b3d] my-0.5"></div>
      <button
        @click="handleCellContextAction('copy_cell')"
        class="w-full text-left px-2.5 py-1 hover:bg-sky-600 hover:text-white flex items-center space-x-2 transition"
      >
        <Icon icon="lucide:clipboard" class="w-3.5 h-3.5 text-slate-400" />
        <span>Salin Nilai Sel</span>
      </button>
      <button
        @click="handleCellContextAction('copy_row_markdown')"
        class="w-full text-left px-2.5 py-1 hover:bg-sky-600 hover:text-white flex items-center space-x-2 transition"
      >
        <Icon icon="lucide:table" class="w-3.5 h-3.5 text-slate-400" />
        <span>Salin Baris (Markdown)</span>
      </button>
      <button
        @click="handleCellContextAction('copy_row_csv')"
        class="w-full text-left px-2.5 py-1 hover:bg-sky-600 hover:text-white flex items-center space-x-2 transition"
      >
        <Icon icon="lucide:file-text" class="w-3.5 h-3.5 text-slate-400" />
        <span>Salin Baris (CSV)</span>
      </button>
      <button
        @click="handleCellContextAction('copy_row_json')"
        class="w-full text-left px-2.5 py-1 hover:bg-sky-600 hover:text-white flex items-center space-x-2 transition"
      >
        <Icon icon="lucide:file-json" class="w-3.5 h-3.5 text-slate-400" />
        <span>Salin Baris (JSON)</span>
      </button>
      <button
        @click="handleCellContextAction('copy_row_sql')"
        class="w-full text-left px-2.5 py-1 hover:bg-sky-600 hover:text-white flex items-center space-x-2 transition"
      >
        <Icon icon="lucide:database" class="w-3.5 h-3.5 text-slate-400" />
        <span>Salin Baris (SQL INSERT)</span>
      </button>
      <button
        @click="handleCellContextAction('detail')"
        class="w-full text-left px-2.5 py-1 hover:bg-sky-600 hover:text-white flex items-center space-x-2 transition border-b border-[#232b3d]/60 pb-1 mb-0.5"
      >
        <Icon icon="lucide:maximize-2" class="w-3.5 h-3.5 text-slate-400" />
        <span>Lihat Detail Lengkap</span>
      </button>
      <button
        @click="handleCellContextAction('delete')"
        class="w-full text-left px-2.5 py-1 hover:bg-rose-950/80 hover:text-rose-300 text-rose-400 flex items-center space-x-2 transition"
      >
        <Icon icon="lucide:trash-2" class="w-3.5 h-3.5 text-rose-400" />
        <span>Hapus Baris Ini</span>
      </button>
    </div>

    <!-- Insert / Edit Row Modal -->
    <div
      v-if="(isInsertModalOpen || isEditModalOpen) && activeTable"
      class="fixed inset-0 bg-boba-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
    >
      <div class="bg-boba-900 border border-boba-700 rounded-xl max-w-lg w-full p-5 shadow-2xl space-y-4 max-h-[85vh] overflow-y-auto font-sans">
        <div class="flex items-center justify-between border-b border-boba-800 pb-2">
          <div class="font-bold text-sm text-slate-100">
            {{ isEditModalOpen ? `Edit Baris ${activeTable.name}` : `Tambah Baris Baru ke ${activeTable.name}` }}
          </div>
          <button @click="closeRowModals" class="text-slate-400 hover:text-white text-xs">✕</button>
        </div>

        <div class="space-y-2.5">
          <div v-for="col in activeTable.columns" :key="col.name" class="space-y-1">
            <div class="flex items-center justify-between text-xs">
              <div class="flex items-center space-x-1.5">
                <span class="font-semibold text-slate-200 font-mono">{{ col.name }}</span>
                <span v-if="col.is_primary_key" class="text-[9px] px-1 bg-amber-950 text-amber-300 rounded font-mono">PK</span>
              </div>
              <span class="text-[10px] text-slate-500 font-mono">({{ col.data_type }})</span>
            </div>
            <input
              v-model="rowFormValues[col.name]"
              type="text"
              :placeholder="col.default_value ? `Default: ${col.default_value}` : (col.is_nullable ? 'NULL' : 'Wajib diisi')"
              class="w-full bg-boba-950 border border-boba-700 focus:border-boba-accent rounded px-2.5 py-1.5 text-xs text-slate-100 font-mono focus:outline-none"
            />
          </div>
        </div>

        <div class="flex justify-end space-x-2 pt-2 border-t border-boba-800">
          <button
            @click="closeRowModals"
            class="px-3 py-1.5 bg-boba-800 hover:bg-boba-700 text-slate-300 rounded text-xs"
          >
            Batal
          </button>
          <button
            @click="isEditModalOpen ? handleCommitEdit() : handleCommitInsert()"
            class="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded text-xs font-semibold shadow"
          >
            {{ isEditModalOpen ? 'Simpan Perubahan (UPDATE)' : 'Simpan Baris (INSERT)' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Cell Detail Drawer / Modal -->
    <div
      v-if="selectedCell"
      class="fixed inset-0 bg-boba-950/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
    >
      <div class="bg-boba-900 border border-boba-700 rounded-xl max-w-xl w-full p-5 shadow-2xl space-y-3 font-sans">
        <div class="flex items-center justify-between border-b border-boba-800 pb-2">
          <div class="font-bold text-xs text-sky-400 font-mono">Field: {{ selectedCell.column }}</div>
          <button @click="selectedCell = null" class="text-slate-400 hover:text-white text-xs">✕</button>
        </div>
        <textarea
          :value="typeof selectedCell.value === 'object' ? JSON.stringify(selectedCell.value, null, 2) : String(selectedCell.value)"
          readonly
          rows="12"
          class="w-full bg-boba-950 border border-boba-800 rounded-lg p-3 text-xs font-mono text-slate-200 focus:outline-none"
        ></textarea>
        <div class="flex justify-end">
          <button
            @click="selectedCell = null"
            class="px-4 py-1.5 bg-boba-800 hover:bg-boba-700 text-slate-300 rounded text-xs"
          >
            Tutup
          </button>
        </div>
      </div>
    </div>
    <!-- Data Importer Modal -->
    <DataImporterModal
      :is-open="isImporterOpen"
      :db-config="tab.dbConnection"
      :active-db="activeDatabase"
      :tables="schemaOverview?.tables || []"
      :default-table="activeTable?.name"
      @close="isImporterOpen = false"
      @imported="handleDataImported"
    />

    <!-- Processlist Modal -->
    <ProcesslistModal
      :is-open="isProcesslistOpen"
      :db-config="tab.dbConnection"
      @close="isProcesslistOpen = false"
    />

    <!-- Table Designer Modal -->
    <TableDesignerModal
      :is-open="isTableDesignerOpen"
      :db-config="tab.dbConnection"
      :active-db="activeDatabase"
      :table-to-edit="tableDesigning"
      @close="closeTableDesigner"
      @saved="loadSchemaOverview"
    />

    <!-- Database User Manager Modal -->
    <UserManagerModal
      :is-open="isUserManagerOpen"
      :db-config="tab.dbConnection"
      @close="isUserManagerOpen = false"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { Icon } from '@iconify/vue';
import { tauriBridge } from '../services/tauriBridge.js';
import { useDialogStore } from '../stores/dialogStore.js';
import { useDbmsStore } from '../stores/dbmsStore.js';
import DataImporterModal from './DataImporterModal.vue';
import ProcesslistModal from './ProcesslistModal.vue';
import TableDesignerModal from './TableDesignerModal.vue';
import UserManagerModal from './UserManagerModal.vue';
import ErdDiagramView from './ErdDiagramView.vue';
import type { ActiveTab, DbTableMeta, DbSchemaOverview, DbQueryResult, DbServerMetrics, DbExplainResult } from '../types/index.js';

const props = defineProps<{
  tab: ActiveTab;
}>();

const dialogStore = useDialogStore();
const dbmsStore = useDbmsStore();

const isSidebarCollapsed = ref(false);

const editingTabId = ref<string | null>(null);
const editingTabTitle = ref('');

const vFocus = {
  mounted: (el: HTMLElement) => el.focus()
};

function startRenameTab(qTab: SubQueryTab) {
  editingTabId.value = qTab.id;
  editingTabTitle.value = qTab.title;
}

function saveRenameTab(qTab: SubQueryTab) {
  if (editingTabTitle.value.trim()) {
    qTab.title = editingTabTitle.value.trim();
  }
  editingTabId.value = null;
}

const isImporterOpen = ref(false);
const isProcesslistOpen = ref(false);
const isTableDesignerOpen = ref(false);
const isUserManagerOpen = ref(false);
const tableDesigning = ref<DbTableMeta | null>(null);

function openTableDesigner(tbl?: DbTableMeta) {
  tableDesigning.value = tbl || null;
  isTableDesignerOpen.value = true;
}

function closeTableDesigner() {
  tableDesigning.value = null;
  isTableDesignerOpen.value = false;
}

function handleDataImported() {
  loadSchemaOverview();
  if (activeTable.value) {
    handlePageChange(currentPage.value);
  }
}

const loadingSchema = ref(false);
const schemaOverview = ref<DbSchemaOverview | null>(null);
const activeDatabase = ref<string>('');
const tableFilter = ref('');

// Fitur 6: Multi-Tab SQL Queries
export interface FilterRule {
  id: string;
  conjunction: 'AND' | 'OR';
  column: string;
  operator: string;
  value: string;
}

export interface FilterState {
  rules: FilterRule[];
  active: boolean;
}

export interface PendingCellEdit {
  rIdx: number;
  cIdx: number;
  colName: string;
  oldVal: any;
  newVal: any;
  rowSnapshot: any[];
}

export interface PendingNewRow {
  tempId: string;
  values: Record<string, any>;
}

interface SubQueryTab {
  id: string;
  title: string;
  tableName?: string;
  text: string;
  showQueryEditor: boolean;
  queryResults: DbQueryResult[];
  activeResultIndex: number;
  activeTable: DbTableMeta | null;
  currentPage: number;
  pageSize: number;
  totalTableRows: number | null;
  lastExecutionTime: number | null;
  errorMessage: string | null;
  activeViewTab: 'data' | 'structure' | 'ddl';
  filterState: FilterState;
  pendingEdits: Record<string, PendingCellEdit>;
  pendingNewRows: PendingNewRow[];
}

function createDefaultTab(
  id = 'qtab_1',
  title = 'SQL 1',
  text = '',
  tableName?: string,
  targetTable: DbTableMeta | null = null,
  showQueryEditor = true
): SubQueryTab {
  return {
    id,
    title,
    tableName,
    text,
    showQueryEditor,
    queryResults: [],
    activeResultIndex: 0,
    activeTable: targetTable,
    currentPage: 1,
    pageSize: 100,
    totalTableRows: null,
    lastExecutionTime: null,
    errorMessage: null,
    activeViewTab: 'data',
    filterState: {
      rules: [
        {
          id: `rule_${Date.now()}_1`,
          conjunction: 'AND',
          column: '',
          operator: '=',
          value: '',
        },
      ],
      active: false,
    },
    pendingEdits: {},
    pendingNewRows: [],
  };
}

const queryTabs = ref<SubQueryTab[]>([createDefaultTab()]);
const activeQueryTabId = ref<string>('qtab_1');

const activeQueryTab = computed(() => {
  return queryTabs.value.find(t => t.id === activeQueryTabId.value) || queryTabs.value[0];
});

const showQueryEditor = computed({
  get: () => activeQueryTab.value?.showQueryEditor ?? true,
  set: (val: boolean) => {
    if (activeQueryTab.value) activeQueryTab.value.showQueryEditor = val;
  },
});

const currentQueryText = computed({
  get: () => activeQueryTab.value?.text || '',
  set: (val: string) => {
    if (activeQueryTab.value) activeQueryTab.value.text = val;
  },
});

const activeTable = computed({
  get: () => activeQueryTab.value?.activeTable || null,
  set: (val: DbTableMeta | null) => {
    if (activeQueryTab.value) activeQueryTab.value.activeTable = val;
  },
});

const queryResults = computed({
  get: () => activeQueryTab.value?.queryResults || [],
  set: (val: DbQueryResult[]) => {
    if (activeQueryTab.value) activeQueryTab.value.queryResults = val;
  },
});

const activeResultIndex = computed({
  get: () => activeQueryTab.value?.activeResultIndex || 0,
  set: (val: number) => {
    if (activeQueryTab.value) activeQueryTab.value.activeResultIndex = val;
  },
});

const queryResult = computed({
  get: () => {
    const list = queryResults.value;
    if (!list || list.length === 0) return null;
    const idx = Math.min(Math.max(0, activeResultIndex.value), list.length - 1);
    return list[idx] || null;
  },
  set: (val: DbQueryResult | null) => {
    if (activeQueryTab.value) {
      if (val === null) {
        activeQueryTab.value.queryResults = [];
      } else {
        const idx = activeResultIndex.value;
        if (activeQueryTab.value.queryResults[idx]) {
          activeQueryTab.value.queryResults[idx] = val;
        } else {
          activeQueryTab.value.queryResults = [val];
        }
      }
    }
  },
});

const gridSearchQuery = ref('');

const displayRows = computed(() => {
  if (!queryResult.value || !queryResult.value.rows) return [];
  const rows = queryResult.value.rows;
  const q = gridSearchQuery.value.trim().toLowerCase();
  if (!q) return rows;
  return rows.filter(r => r.some(v => v !== null && v !== undefined && String(v).toLowerCase().includes(q)));
});

const lastExecutionTime = computed({
  get: () => activeQueryTab.value?.lastExecutionTime ?? null,
  set: (val: number | null) => {
    if (activeQueryTab.value) activeQueryTab.value.lastExecutionTime = val;
  },
});

const errorMessage = computed({
  get: () => activeQueryTab.value?.errorMessage ?? null,
  set: (val: string | null) => {
    if (activeQueryTab.value) activeQueryTab.value.errorMessage = val;
  },
});

const currentPage = computed({
  get: () => activeQueryTab.value?.currentPage || 1,
  set: (val: number) => {
    if (activeQueryTab.value) activeQueryTab.value.currentPage = val;
  },
});

const pageSize = computed({
  get: () => activeQueryTab.value?.pageSize || 100,
  set: (val: number) => {
    if (activeQueryTab.value) activeQueryTab.value.pageSize = val;
  },
});

const totalTableRows = computed({
  get: () => activeQueryTab.value?.totalTableRows ?? null,
  set: (val: number | null) => {
    if (activeQueryTab.value) activeQueryTab.value.totalTableRows = val;
  },
});

const activeViewTab = computed({
  get: () => activeQueryTab.value?.activeViewTab || 'data',
  set: (val: 'data' | 'structure' | 'ddl') => {
    if (activeQueryTab.value) activeQueryTab.value.activeViewTab = val;
  },
});

const filterState = computed({
  get: () =>
    activeQueryTab.value?.filterState || {
      rules: [{ id: 'rule_1', conjunction: 'AND', column: '', operator: '=', value: '' }],
      active: false,
    },
  set: (val: FilterState) => {
    if (activeQueryTab.value) activeQueryTab.value.filterState = val;
  },
});

const pendingEdits = computed({
  get: () => activeQueryTab.value?.pendingEdits || {},
  set: (val: Record<string, PendingCellEdit>) => {
    if (activeQueryTab.value) activeQueryTab.value.pendingEdits = val;
  },
});

const pendingNewRows = computed({
  get: () => activeQueryTab.value?.pendingNewRows || [],
  set: (val: PendingNewRow[]) => {
    if (activeQueryTab.value) activeQueryTab.value.pendingNewRows = val;
  },
});

const pendingEditsCount = computed(() => {
  return Object.keys(pendingEdits.value).length;
});

function isCellPending(rIdx: number, cIdx: number): boolean {
  return `${rIdx}_${cIdx}` in pendingEdits.value;
}

function insertDraftRow() {
  if (!activeTable.value || !queryResult.value) return;
  const tempId = `draft_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`;
  const initialValues: Record<string, any> = {};

  activeTable.value.columns.forEach(c => {
    if (c.default_value) {
      initialValues[c.name] = c.default_value;
    } else {
      initialValues[c.name] = '';
    }
  });

  pendingNewRows.value.push({
    tempId,
    values: initialValues,
  });
}

function cloneRow(row: any[]) {
  if (!activeTable.value || !queryResult.value) return;
  const tempId = `clone_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`;
  const initialValues: Record<string, any> = {};

  queryResult.value.columns.forEach((colName, cIdx) => {
    const val = row[cIdx];
    initialValues[colName] = val === null ? '' : String(val);
  });

  pendingNewRows.value.push({
    tempId,
    values: initialValues,
  });
}

function removeDraftRow(tempId: string) {
  pendingNewRows.value = pendingNewRows.value.filter(r => r.tempId !== tempId);
}

const committingEdits = ref(false);

function addNewQueryTab(
  customTitle?: string,
  customText?: string,
  tableName?: string,
  targetTable: DbTableMeta | null = null,
  showEditor = true
) {
  const newId = `qtab_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`;
  const title = customTitle || `SQL ${queryTabs.value.length + 1}`;
  const newTab = createDefaultTab(newId, title, customText || '', tableName, targetTable, showEditor);
  queryTabs.value.push(newTab);
  activeQueryTabId.value = newId;
  return newTab;
}

function selectQueryTab(qTab: SubQueryTab) {
  activeQueryTabId.value = qTab.id;
  if (qTab.tableName && schemaOverview.value?.tables) {
    const target = schemaOverview.value.tables.find(t => t.name === qTab.tableName);
    if (target) qTab.activeTable = target;
  }
}

function closeQueryTab(id: string) {
  if (queryTabs.value.length <= 1) {
    queryTabs.value = [createDefaultTab('qtab_1', 'SQL 1', '')];
    activeQueryTabId.value = 'qtab_1';
    return;
  }
  const idx = queryTabs.value.findIndex(t => t.id === id);
  queryTabs.value = queryTabs.value.filter(t => t.id !== id);
  if (activeQueryTabId.value === id) {
    const nextTab = queryTabs.value[Math.max(0, idx - 1)];
    selectQueryTab(nextTab);
  }
}

const executing = ref(false);

const showHistory = ref(false);
const queryHistory = ref<string[]>([]);

const aiPrompt = ref('');
const aiGenerating = ref(false);

const selectedCell = ref<{ column: string; value: any } | null>(null);

// Fitur 4: EXPLAIN Plan Result
const explainResult = ref<DbExplainResult | null>(null);

// Fitur 5: Server Health Metrics
const isHealthModalOpen = ref(false);
const loadingHealth = ref(false);
const serverMetrics = ref<DbServerMetrics | null>(null);

// Fitur 3: Saved Queries / Snippets
const isSnippetsDrawerOpen = ref(false);
const newSnippetTitle = ref('');
const snippetScope = ref<'connection' | 'all'>('connection');

const filteredSnippets = computed(() => {
  const list = dbmsStore.savedQueries || [];
  if (snippetScope.value === 'connection') {
    return list.filter(s => !s.db_connection_id || s.db_connection_id === props.tab.dbConnection?.id);
  }
  return list;
});

const currentConnectionSnippetsCount = computed(() => {
  const list = dbmsStore.savedQueries || [];
  return list.filter(s => !s.db_connection_id || s.db_connection_id === props.tab.dbConnection?.id).length;
});

const isInsertModalOpen = ref(false);
const isEditModalOpen = ref(false);
const editingRowOriginal = ref<any[] | null>(null);
const rowFormValues = ref<Record<string, string>>({});

// Inline Cell Editing State
const editingCell = ref<{
  rIdx: number;
  cIdx: number;
  tempValue: string;
  originalVal: any;
} | null>(null);

const justUpdatedCell = ref<string | null>(null);
const inlineInputRef = ref<HTMLInputElement[] | null>(null);

// Cell Context Menu State
const cellContextMenu = ref<{
  visible: boolean;
  x: number;
  y: number;
  rIdx: number;
  cIdx: number;
  column: string;
  row: any[];
  value: any;
}>({
  visible: false,
  x: 0,
  y: 0,
  rIdx: 0,
  cIdx: 0,
  column: '',
  row: [],
  value: null,
});

const tableContextMenu = ref<{
  visible: boolean;
  x: number;
  y: number;
  table: DbTableMeta | null;
}>({
  visible: false,
  x: 0,
  y: 0,
  table: null,
});

function getEngineBadge(engine?: string): string {
  switch (engine?.toLowerCase()) {
    case 'mysql':
    case 'mariadb':
      return 'MY';
    case 'postgres':
    case 'postgresql':
      return 'PG';
    case 'sqlite':
      return 'LT';
    case 'redis':
      return 'RD';
    case 'mongodb':
      return 'MG';
    default:
      return 'DB';
  }
}

const filteredTables = computed(() => {
  if (!schemaOverview.value?.tables) return [];
  if (!tableFilter.value.trim()) return schemaOverview.value.tables;
  return schemaOverview.value.tables.filter(t =>
    t.name.toLowerCase().includes(tableFilter.value.toLowerCase())
  );
});

function getTablePrimaryKey(tbl: DbTableMeta) {
  return tbl.columns.find(c => c.is_primary_key);
}

async function loadSchemaOverview() {
  if (!props.tab.dbConnection) return;
  loadingSchema.value = true;
  errorMessage.value = null;

  try {
    const overview = await tauriBridge.dbmsGetSchemaOverview(
      props.tab.dbConnection,
      activeDatabase.value || undefined
    );
    schemaOverview.value = overview;
    if (overview.current_database) {
      activeDatabase.value = overview.current_database;
    }
  } catch (err: any) {
    errorMessage.value = String(err?.message || err);
  } finally {
    loadingSchema.value = false;
  }
}

function handleDatabaseChange() {
  loadSchemaOverview();
}

async function fetchTableCount(tableName: string) {
  if (!props.tab.dbConnection) return;
  const engine = props.tab.dbConnection.engine.toLowerCase();
  if (['mysql', 'mariadb', 'postgres', 'postgresql', 'sqlite'].includes(engine)) {
    try {
      const res = await tauriBridge.dbmsExecuteQuery(
        props.tab.dbConnection,
        activeDatabase.value || undefined,
        `SELECT COUNT(*) AS total FROM \`${tableName}\`;`
      );
      if (res && res[0]?.rows?.[0]?.[0] !== undefined) {
        totalTableRows.value = Number(res[0].rows[0][0]);
      }
    } catch {
      totalTableRows.value = null;
    }
  } else {
    totalTableRows.value = null;
  }
}

function handleSelectTable(tbl: DbTableMeta) {
  const engine = props.tab.dbConnection?.engine.toLowerCase();
  const generatedSql = engine === 'redis'
    ? `GET ${tbl.name}`
    : `SELECT * FROM ${tbl.name} LIMIT 100 OFFSET 0;`;

  fetchTableCount(tbl.name);

  // Cek apakah tab untuk tabel ini sudah terbuka
  const existingTab = queryTabs.value.find(t => t.tableName === tbl.name || t.title === tbl.name);
  if (existingTab) {
    activeQueryTabId.value = existingTab.id;
    existingTab.activeTable = tbl;
    if (!existingTab.queryResult) {
      if (!existingTab.text.trim()) existingTab.text = generatedSql;
      executeQuery();
    }
  } else {
    // Jika tab tunggal saat ini masih berupa tab default kosong "SQL 1", gunakan & beri nama tabel (dan hide query editor)
    if (queryTabs.value.length === 1 && queryTabs.value[0].title === 'SQL 1' && !queryTabs.value[0].text.trim() && !queryTabs.value[0].queryResult) {
      queryTabs.value[0].title = tbl.name;
      queryTabs.value[0].tableName = tbl.name;
      queryTabs.value[0].text = generatedSql;
      queryTabs.value[0].activeTable = tbl;
      queryTabs.value[0].showQueryEditor = false; // Sembunyikan query jika dibuka dari tabel
      activeQueryTabId.value = queryTabs.value[0].id;
      executeQuery();
    } else {
      // Buka tab query baru otomatis dengan nama tabel & sembunyikan query editor
      addNewQueryTab(tbl.name, generatedSql, tbl.name, tbl, false);
      executeQuery();
    }
  }

  activeViewTab.value = 'data';
}

function handlePageChange(page: number) {
  if (page < 1 || !activeTable.value) return;
  currentPage.value = page;
  const offset = (page - 1) * pageSize.value;
  let sql = '';
  if (filterState.value.active) {
    const whereClause = buildWhereClause();
    if (whereClause) {
      sql = `SELECT * FROM ${activeTable.value.name} WHERE ${whereClause} LIMIT ${pageSize.value} OFFSET ${offset};`;
    } else {
      sql = `SELECT * FROM ${activeTable.value.name} LIMIT ${pageSize.value} OFFSET ${offset};`;
    }
  } else {
    sql = `SELECT * FROM ${activeTable.value.name} LIMIT ${pageSize.value} OFFSET ${offset};`;
  }
  currentQueryText.value = sql;
  executeQuery(sql);
}

function addFilterRule() {
  if (!filterState.value.rules) filterState.value.rules = [];
  const defaultCol = activeTable.value?.columns[0]?.name || '';
  filterState.value.rules.push({
    id: `rule_${Date.now()}_${Math.random().toString(36).substring(2, 5)}`,
    conjunction: 'AND',
    column: defaultCol,
    operator: '=',
    value: '',
  });
}

function removeFilterRule(ruleId: string) {
  filterState.value.rules = filterState.value.rules.filter(r => r.id !== ruleId);
  if (filterState.value.rules.length === 0) {
    addFilterRule();
    resetMultiFilter();
  }
}

function buildWhereClause(): string {
  const { rules } = filterState.value;
  const validRules = rules.filter(
    r => r.column && (['IS NULL', 'IS NOT NULL'].includes(r.operator) || r.value.trim() !== '')
  );
  if (validRules.length === 0) return '';

  let clause = '';
  validRules.forEach((r, idx) => {
    const col = `\`${r.column}\``;
    const val = r.value.trim();
    let expr = '';
    if (r.operator === 'IS NULL' || r.operator === 'IS NOT NULL') {
      expr = `${col} ${r.operator}`;
    } else if (r.operator === 'LIKE') {
      expr = `${col} LIKE '%${val.replace(/'/g, "''")}%'`;
    } else if (r.operator === 'STARTS WITH') {
      expr = `${col} LIKE '${val.replace(/'/g, "''")}%'`;
    } else if (r.operator === 'ENDS WITH') {
      expr = `${col} LIKE '%${val.replace(/'/g, "''")}'`;
    } else if (!isNaN(Number(val)) && val !== '') {
      expr = `${col} ${r.operator} ${val}`;
    } else {
      expr = `${col} ${r.operator} '${val.replace(/'/g, "''")}'`;
    }

    if (idx === 0) {
      clause = expr;
    } else {
      const conj = r.conjunction || 'AND';
      clause += ` ${conj} ${expr}`;
    }
  });

  return clause;
}

function applyMultiFilter() {
  if (!activeTable.value) return;
  const whereClause = buildWhereClause();
  if (!whereClause) {
    resetMultiFilter();
    return;
  }
  filterState.value.active = true;
  currentPage.value = 1;
  const sql = `SELECT * FROM ${activeTable.value.name} WHERE ${whereClause} LIMIT ${pageSize.value} OFFSET 0;`;
  currentQueryText.value = sql;
  executeQuery(sql);
}

function resetMultiFilter() {
  filterState.value.active = false;
  if (filterState.value.rules) {
    filterState.value.rules.forEach(r => {
      r.value = '';
    });
  }
  currentPage.value = 1;
  if (activeTable.value) {
    const sql = `SELECT * FROM ${activeTable.value.name} LIMIT ${pageSize.value} OFFSET 0;`;
    currentQueryText.value = sql;
    executeQuery(sql);
  }
}

async function executeQuery(customQuery?: string) {
  if (!props.tab.dbConnection) return;

  let q = customQuery;
  if (!q) {
    const textarea = sqlEditorTextareaRef.value;
    if (textarea && textarea.selectionStart !== textarea.selectionEnd) {
      const selected = textarea.value.slice(textarea.selectionStart, textarea.selectionEnd).trim();
      if (selected) {
        q = selected;
      }
    }
  }

  if (!q) {
    q = currentQueryText.value;
  }

  if (!q.trim()) return;

  executing.value = true;
  errorMessage.value = null;

  try {
    const resList = await tauriBridge.dbmsExecuteQuery(
      props.tab.dbConnection,
      activeDatabase.value || undefined,
      q
    );
    queryResults.value = resList;
    activeResultIndex.value = 0;
    if (resList.length > 0) {
      const totalTime = resList.reduce((acc, r) => acc + (r.execution_time_ms || 0), 0);
      lastExecutionTime.value = totalTime;
    }

    if (!queryHistory.value.includes(q.trim())) {
      queryHistory.value.unshift(q.trim());
      if (queryHistory.value.length > 20) queryHistory.value.pop();
    }
  } catch (err: any) {
    errorMessage.value = String(err?.message || err);
    queryResults.value = [];
  } finally {
    executing.value = false;
  }
}

async function handleExplainQuery() {
  if (!props.tab.dbConnection || !currentQueryText.value.trim()) return;
  executing.value = true;
  errorMessage.value = null;

  try {
    const res = await tauriBridge.dbmsExplainQuery(
      props.tab.dbConnection,
      activeDatabase.value || undefined,
      currentQueryText.value
    );
    explainResult.value = res;
  } catch (err: any) {
    errorMessage.value = `EXPLAIN gagal: ${String(err?.message || err)}`;
  } finally {
    executing.value = false;
  }
}

async function openHealthMonitor() {
  if (!props.tab.dbConnection) return;
  isHealthModalOpen.value = true;
  loadingHealth.value = true;

  try {
    const metrics = await tauriBridge.dbmsGetServerMetrics(props.tab.dbConnection);
    serverMetrics.value = metrics;
  } catch (err: any) {
    console.error('Failed to get db health:', err);
  } finally {
    loadingHealth.value = false;
  }
}

function handleSaveSnippet() {
  if (!newSnippetTitle.value.trim() || !currentQueryText.value.trim()) return;
  dbmsStore.saveSavedQuery({
    id: `snip_${Date.now()}`,
    title: newSnippetTitle.value.trim(),
    query: currentQueryText.value.trim(),
    engine: props.tab.dbConnection?.engine,
    db_connection_id: props.tab.dbConnection?.id,
    db_name: activeDatabase.value || props.tab.dbConnection?.database,
    createdAt: Date.now(),
  });
  newSnippetTitle.value = '';
}

function useSnippet(sql: string) {
  currentQueryText.value = sql;
  isSnippetsDrawerOpen.value = false;
  executeQuery();
}

function loadHistoryQuery(q: string) {
  currentQueryText.value = q;
  showHistory.value = false;
  executeQuery();
}

// IntelliSense Autocomplete State
interface SuggestionItem {
  value: string;
  type: 'table' | 'column' | 'keyword';
}

const showSuggestions = ref(false);
const suggestionQuery = ref('');
const activeSuggestionIndex = ref(0);
const suggestionPos = ref({ top: 38, left: 16 });
const sqlEditorTextareaRef = ref<HTMLTextAreaElement | null>(null);

function updateCursorPosition() {
  const textarea = sqlEditorTextareaRef.value;
  if (!textarea) return;

  const cursorIndex = textarea.selectionStart;
  const textBeforeCursor = textarea.value.slice(0, cursorIndex);
  const lines = textBeforeCursor.split('\n');
  const currentLineIndex = lines.length - 1;
  const currentLineText = lines[currentLineIndex];

  // Font character metrics for monospace text-xs (12px, line-height 20px, p-3 = 12px)
  const charWidth = 7.4;
  const lineHeight = 20;
  const paddingLeft = 14;
  const paddingTop = 14;

  const colIndex = Math.max(0, currentLineText.length - (suggestionQuery.value.length || 0));
  const maxLeft = Math.max(16, textarea.clientWidth - 300);
  const left = Math.min(maxLeft, Math.max(paddingLeft, paddingLeft + colIndex * charWidth));
  const top = paddingTop + (currentLineIndex + 1) * lineHeight - textarea.scrollTop;

  suggestionPos.value = {
    top: Math.max(32, top + 6),
    left: Math.max(14, left)
  };
}

const SQL_KEYWORDS = [
  'SELECT', 'FROM', 'WHERE', 'INSERT INTO', 'UPDATE', 'DELETE FROM', 'JOIN',
  'LEFT JOIN', 'RIGHT JOIN', 'INNER JOIN', 'ON', 'GROUP BY', 'ORDER BY',
  'HAVING', 'LIMIT', 'OFFSET', 'DISTINCT', 'COUNT(*)', 'SUM()', 'AVG()',
  'AND', 'OR', 'NOT', 'IN', 'LIKE', 'BETWEEN', 'IS NULL', 'IS NOT NULL',
  'DESC', 'ASC', 'UNION ALL', 'CREATE TABLE', 'DROP TABLE', 'ALTER TABLE'
];

const allKnownColumns = computed<string[]>(() => {
  const set = new Set<string>();
  schemaOverview.value?.tables.forEach(t => {
    t.columns.forEach(c => set.add(c.name));
  });
  return Array.from(set);
});

const filteredSuggestions = computed<SuggestionItem[]>(() => {
  const q = suggestionQuery.value.trim().toLowerCase();
  if (!q) return [];
  const results: SuggestionItem[] = [];

  // 1. Table names
  schemaOverview.value?.tables.forEach(t => {
    if (t.name.toLowerCase().includes(q)) {
      results.push({ value: t.name, type: 'table' });
    }
  });

  // 2. Column names
  allKnownColumns.value.forEach(c => {
    if (c.toLowerCase().includes(q) && !results.some(r => r.value.toLowerCase() === c.toLowerCase())) {
      results.push({ value: c, type: 'column' });
    }
  });

  // 3. SQL Keywords
  SQL_KEYWORDS.forEach(kw => {
    if (kw.toLowerCase().startsWith(q) && !results.some(r => r.value.toLowerCase() === kw.toLowerCase())) {
      results.push({ value: kw, type: 'keyword' });
    }
  });

  return results.slice(0, 8);
});

function handleEditorInput(e: Event) {
  const textarea = sqlEditorTextareaRef.value;
  if (!textarea) return;
  const cursor = textarea.selectionStart;
  const textBeforeCursor = textarea.value.slice(0, cursor);
  const match = textBeforeCursor.match(/([a-zA-Z0-9_]+)$/);
  if (match && match[1].length >= 1) {
    suggestionQuery.value = match[1];
    activeSuggestionIndex.value = 0;
    updateCursorPosition();
    showSuggestions.value = true;
  } else {
    showSuggestions.value = false;
  }
}

function handleEditorBlur() {
  setTimeout(() => {
    showSuggestions.value = false;
  }, 200);
}

function insertSuggestion(sug: SuggestionItem) {
  const textarea = sqlEditorTextareaRef.value;
  if (!textarea) return;
  const cursor = textarea.selectionStart;
  const textBeforeCursor = textarea.value.slice(0, cursor);
  const textAfterCursor = textarea.value.slice(cursor);
  const match = textBeforeCursor.match(/([a-zA-Z0-9_]+)$/);
  if (match) {
    const start = cursor - match[1].length;
    const replacement = sug.value;
    currentQueryText.value = textarea.value.slice(0, start) + replacement + textAfterCursor;
    nextTick(() => {
      textarea.selectionStart = textarea.selectionEnd = start + replacement.length;
      textarea.focus();
    });
  }
  showSuggestions.value = false;
}

function handleEditorKeyDown(e: KeyboardEvent) {
  if (showSuggestions.value && filteredSuggestions.value.length > 0) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      activeSuggestionIndex.value = (activeSuggestionIndex.value + 1) % filteredSuggestions.value.length;
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      activeSuggestionIndex.value = (activeSuggestionIndex.value - 1 + filteredSuggestions.value.length) % filteredSuggestions.value.length;
      return;
    }
    if (e.key === 'Tab' || (e.key === 'Enter' && !e.ctrlKey && !e.metaKey)) {
      e.preventDefault();
      insertSuggestion(filteredSuggestions.value[activeSuggestionIndex.value]);
      return;
    }
    if (e.key === 'Escape') {
      e.preventDefault();
      showSuggestions.value = false;
      return;
    }
  }

  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
    e.preventDefault();
    executeQuery();
  }
}

function formatQuickSql() {
  let s = currentQueryText.value.trim();
  const keywords = ['SELECT', 'FROM', 'WHERE', 'JOIN', 'LEFT JOIN', 'GROUP BY', 'ORDER BY', 'LIMIT', 'OFFSET', 'INSERT INTO', 'UPDATE', 'SET', 'DELETE FROM'];
  for (const kw of keywords) {
    const re = new RegExp(`\\b${kw}\\b`, 'gi');
    s = s.replace(re, kw);
  }
  currentQueryText.value = s;
}

function openCellDetail(column: string, value: any) {
  selectedCell.value = { column, value };
}

function startInlineCellEdit(rIdx: number, cIdx: number, val: any) {
  if (val === null || val === undefined) {
    editingCell.value = { rIdx, cIdx, tempValue: '', originalVal: null };
  } else if (typeof val === 'object') {
    editingCell.value = { rIdx, cIdx, tempValue: JSON.stringify(val), originalVal: val };
  } else {
    editingCell.value = { rIdx, cIdx, tempValue: String(val), originalVal: val };
  }

  setTimeout(() => {
    if (inlineInputRef.value && inlineInputRef.value.length > 0) {
      inlineInputRef.value[0]?.focus();
      inlineInputRef.value[0]?.select();
    }
  }, 50);
}

function cancelInlineCellEdit() {
  editingCell.value = null;
}

function saveInlineCellEdit(rIdx: number, cIdx: number) {
  if (!editingCell.value || !activeTable.value || !queryResult.value) return;
  const { tempValue, originalVal } = editingCell.value;
  const colName = queryResult.value.columns[cIdx];
  const row = queryResult.value.rows[rIdx];

  // Compare if changed
  const origStr = originalVal === null ? '' : (typeof originalVal === 'object' ? JSON.stringify(originalVal) : String(originalVal));
  if (tempValue === origStr) {
    editingCell.value = null;
    return;
  }

  // Parse new value
  let parsedVal: any = tempValue;
  if (tempValue.trim().toUpperCase() === 'NULL' || tempValue.trim() === '') {
    parsedVal = null;
  } else if (!isNaN(Number(tempValue)) && tempValue.trim() !== '') {
    parsedVal = Number(tempValue);
  }

  const key = `${rIdx}_${cIdx}`;
  const existingPending = pendingEdits.value[key];
  const initialOldVal = existingPending ? existingPending.oldVal : originalVal;

  const initialStr = initialOldVal === null ? '' : (typeof initialOldVal === 'object' ? JSON.stringify(initialOldVal) : String(initialOldVal));
  if (tempValue === initialStr) {
    delete pendingEdits.value[key];
  } else {
    pendingEdits.value[key] = {
      rIdx,
      cIdx,
      colName,
      oldVal: initialOldVal,
      newVal: parsedVal,
      rowSnapshot: [...row],
    };
  }

  // Update view data locally (Pending commit)
  queryResult.value.rows[rIdx][cIdx] = parsedVal;
  editingCell.value = null;
}

function openCellContextMenu(e: MouseEvent, rIdx: number, cIdx: number, row: any[], value: any) {
  if (!queryResult.value) return;
  const colName = queryResult.value.columns[cIdx];
  cellContextMenu.value = {
    visible: true,
    x: Math.min(e.clientX, window.innerWidth - 220),
    y: Math.min(e.clientY, window.innerHeight - 220),
    rIdx,
    cIdx,
    column: colName,
    row,
    value,
  };
}

function closeCellContextMenu() {
  cellContextMenu.value.visible = false;
}

function closeAllContextMenus() {
  closeTableContextMenu();
  closeCellContextMenu();
}

async function copyRowAsMarkdown(row: any[]) {
  if (!queryResult.value?.columns) return;
  const cols = queryResult.value.columns;
  const header = '| ' + cols.join(' | ') + ' |';
  const separator = '| ' + cols.map(() => '---').join(' | ') + ' |';
  const rowStr = '| ' + row.map(v => v === null ? 'NULL' : String(v).replace(/\|/g, '\\|')).join(' | ') + ' |';
  const md = `${header}\n${separator}\n${rowStr}`;
  await navigator.clipboard.writeText(md);
  dialogStore.showToast('1 Baris (Markdown Table) disalin ke clipboard!', 'success', 2000);
}

async function copyRowAsCsv(row: any[]) {
  if (!queryResult.value?.columns) return;
  const cols = queryResult.value.columns;
  const header = cols.map(c => `"${c}"`).join(',');
  const rowStr = row.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',');
  const csv = `${header}\n${rowStr}`;
  await navigator.clipboard.writeText(csv);
  dialogStore.showToast('1 Baris (CSV) disalin ke clipboard!', 'success', 2000);
}

async function copyRowAsJson(row: any[]) {
  if (!queryResult.value?.columns) return;
  const obj: Record<string, any> = {};
  queryResult.value.columns.forEach((col, idx) => {
    obj[col] = row[idx];
  });
  await navigator.clipboard.writeText(JSON.stringify(obj, null, 2));
  dialogStore.showToast('1 Baris (JSON) berhasil disalin ke clipboard!', 'success', 2000);
}

async function handleCellContextAction(action: 'edit_inline' | 'edit_row' | 'clone' | 'copy_cell' | 'copy_row_markdown' | 'copy_row_csv' | 'copy_row_json' | 'copy_row_sql' | 'detail' | 'delete') {
  const { rIdx, cIdx, row, value, column } = cellContextMenu.value;
  closeCellContextMenu();

  if (action === 'edit_inline') {
    startInlineCellEdit(rIdx, cIdx, value);
  } else if (action === 'edit_row') {
    openEditRowModal(row);
  } else if (action === 'clone') {
    cloneRow(row);
  } else if (action === 'copy_cell') {
    const textToCopy = value === null ? 'NULL' : (typeof value === 'object' ? JSON.stringify(value) : String(value));
    await navigator.clipboard.writeText(textToCopy);
    dialogStore.showToast('Nilai sel berhasil disalin', 'success', 1500);
  } else if (action === 'copy_row_markdown') {
    await copyRowAsMarkdown(row);
  } else if (action === 'copy_row_csv') {
    await copyRowAsCsv(row);
  } else if (action === 'copy_row_json') {
    await copyRowAsJson(row);
  } else if (action === 'copy_row_sql') {
    const tableName = activeTable.value?.name || getEffectiveTable()?.name || 'my_table';
    const cols = queryResult.value?.columns || [];
    const vals = row.map(v => {
      if (v === null) return 'NULL';
      if (typeof v === 'number') return v;
      if (typeof v === 'boolean') return v ? '1' : '0';
      return `'${String(v).replace(/'/g, "''")}'`;
    });
    const sql = `INSERT INTO \`${tableName}\` (${cols.map(c => `\`${c}\``).join(', ')}) VALUES (${vals.join(', ')});`;
    await navigator.clipboard.writeText(sql);
    dialogStore.showToast('1 Baris (SQL INSERT) disalin ke clipboard!', 'success', 2000);
  } else if (action === 'detail') {
    openCellDetail(column, value);
  } else if (action === 'delete') {
    handleDeleteRow(row);
  }
}

function openTableContextMenu(e: MouseEvent, tbl: DbTableMeta) {
  tableContextMenu.value = {
    visible: true,
    x: Math.min(e.clientX, window.innerWidth - 220),
    y: Math.min(e.clientY, window.innerHeight - 200),
    table: tbl,
  };
}

function closeTableContextMenu() {
  tableContextMenu.value.visible = false;
  tableContextMenu.value.table = null;
}

async function handleContextAction(action: 'select' | 'structure' | 'alter' | 'copy_name' | 'ddl' | 'truncate' | 'drop') {
  const tbl = tableContextMenu.value.table;
  closeTableContextMenu();
  if (!tbl) return;

  if (action === 'select') {
    handleSelectTable(tbl);
  } else if (action === 'structure') {
    activeTable.value = tbl;
    activeViewTab.value = 'structure';
  } else if (action === 'alter') {
    openTableDesigner(tbl);
  } else if (action === 'copy_name') {
    await navigator.clipboard.writeText(tbl.name);
  } else if (action === 'ddl') {
    activeTable.value = tbl;
    activeViewTab.value = 'ddl';
  } else if (action === 'truncate') {
    const confirm = await dialogStore.confirm({
      title: `Kosongkan Tabel "${tbl.name}"?`,
      description: 'Semua data di dalam tabel ini akan dihapus secara permanen (TRUNCATE).',
      confirmText: 'Kosongkan',
      isDestructive: true,
    });
    if (confirm) {
      const sql = `TRUNCATE TABLE ${tbl.name};`;
      currentQueryText.value = sql;
      await executeQuery(sql);
      handleSelectTable(tbl);
    }
  } else if (action === 'drop') {
    const confirm = await dialogStore.confirm({
      title: `Hapus Tabel "${tbl.name}"?`,
      description: 'Tabel beserta seluruh strukturnya akan dihapus dari database (DROP TABLE).',
      confirmText: 'Hapus Tabel',
      isDestructive: true,
    });
    if (confirm) {
      const sql = `DROP TABLE ${tbl.name};`;
      currentQueryText.value = sql;
      await executeQuery(sql);
      loadSchemaOverview();
    }
  }
}

function generateTableDdl(): string {
  if (!activeTable.value) return '-- Pilih tabel untuk melihat DDL';
  const cols = activeTable.value.columns.map(c => {
    let def = `  \`${c.name}\` ${c.data_type.toUpperCase()}`;
    if (!c.is_nullable) def += ' NOT NULL';
    if (c.default_value) def += ` DEFAULT ${c.default_value}`;
    if (c.is_primary_key) def += ' PRIMARY KEY';
    return def;
  }).join(',\n');

  return `CREATE TABLE \`${activeTable.value.name}\` (\n${cols}\n);`;
}

function closeRowModals() {
  isInsertModalOpen.value = false;
  isEditModalOpen.value = false;
  editingRowOriginal.value = null;
  rowFormValues.value = {};
}

function openEditRowModal(row: any[]) {
  if (!activeTable.value || !queryResult.value) return;
  editingRowOriginal.value = row;
  const form: Record<string, string> = {};
  queryResult.value.columns.forEach((col, idx) => {
    form[col] = row[idx] === null ? 'NULL' : String(row[idx]);
  });
  rowFormValues.value = form;
  isEditModalOpen.value = true;
}

async function handleCommitInsert() {
  if (!activeTable.value) return;
  const cols: string[] = [];
  const vals: string[] = [];

  for (const [colName, val] of Object.entries(rowFormValues.value)) {
    if (val !== undefined && val !== '') {
      cols.push(colName);
      if (val.toUpperCase() === 'NULL') {
        vals.push('NULL');
      } else if (!isNaN(Number(val))) {
        vals.push(val);
      } else {
        vals.push(`'${val.replace(/'/g, "''")}'`);
      }
    }
  }

  if (cols.length === 0) {
    await dialogStore.alert({
      title: 'Data Kosong',
      description: 'Harap isi minimal satu kolom untuk memasukkan baris baru.',
      variant: 'error',
    });
    return;
  }

  const sql = `INSERT INTO ${activeTable.value.name} (${cols.join(', ')}) VALUES (${vals.join(', ')});`;
  closeRowModals();
  currentQueryText.value = sql;
  await executeQuery(sql);
  handlePageChange(currentPage.value);
}

function handleCommitEdit() {
  if (!activeTable.value || !editingRowOriginal.value || !queryResult.value) return;
  const rIdx = queryResult.value.rows.findIndex(r => r === editingRowOriginal.value);
  if (rIdx === -1) {
    closeRowModals();
    return;
  }

  const row = queryResult.value.rows[rIdx];

  queryResult.value.columns.forEach((colName, cIdx) => {
    const entered = rowFormValues.value[colName];
    if (entered !== undefined) {
      const orig = editingRowOriginal.value![cIdx];
      const origStr = orig === null ? 'NULL' : String(orig);
      if (entered !== origStr) {
        let parsedVal: any = entered;
        if (entered.trim().toUpperCase() === 'NULL' || entered.trim() === '') {
          parsedVal = null;
        } else if (!isNaN(Number(entered)) && entered.trim() !== '') {
          parsedVal = Number(entered);
        }

        const key = `${rIdx}_${cIdx}`;
        const existing = pendingEdits.value[key];
        pendingEdits.value[key] = {
          rIdx,
          cIdx,
          colName,
          oldVal: existing ? existing.oldVal : orig,
          newVal: parsedVal,
          rowSnapshot: [...row],
        };

        queryResult.value!.rows[rIdx][cIdx] = parsedVal;
      }
    }
  });

  closeRowModals();
}

async function commitPendingEdits() {
  if (
    !activeTable.value ||
    !queryResult.value ||
    (pendingEditsCount.value === 0 && pendingNewRows.value.length === 0)
  )
    return;
  committingEdits.value = true;
  errorMessage.value = null;

  try {
    const pk = getTablePrimaryKey(activeTable.value);

    // 1. Process modified existing rows (UPDATE)
    const editsByRow: Record<number, PendingCellEdit[]> = {};
    Object.values(pendingEdits.value).forEach(edit => {
      if (!editsByRow[edit.rIdx]) editsByRow[edit.rIdx] = [];
      editsByRow[edit.rIdx].push(edit);
    });

    for (const [rIdxStr, edits] of Object.entries(editsByRow)) {
      const rIdx = Number(rIdxStr);
      const row = edits[0].rowSnapshot;

      // Build WHERE clause for this row
      let whereClause = '';
      if (pk) {
        const pkIdx = queryResult.value.columns.indexOf(pk.name);
        if (pkIdx !== -1) {
          const pkVal = row[pkIdx];
          whereClause = typeof pkVal === 'number' ? `\`${pk.name}\` = ${pkVal}` : `\`${pk.name}\` = '${String(pkVal).replace(/'/g, "''")}'`;
        }
      }

      if (!whereClause) {
        const conditions: string[] = [];
        queryResult.value.columns.forEach((col, idx) => {
          const v = row[idx];
          if (v === null) {
            conditions.push(`\`${col}\` IS NULL`);
          } else if (typeof v === 'number') {
            conditions.push(`\`${col}\` = ${v}`);
          } else {
            conditions.push(`\`${col}\` = '${String(v).replace(/'/g, "''")}'`);
          }
        });
        whereClause = conditions.slice(0, 4).join(' AND ');
      }

      // Build SET clause
      const setClauses = edits.map(e => {
        let formatted = '';
        if (e.newVal === null) {
          formatted = 'NULL';
        } else if (typeof e.newVal === 'number') {
          formatted = String(e.newVal);
        } else {
          formatted = `'${String(e.newVal).replace(/'/g, "''")}'`;
        }
        return `\`${e.colName}\` = ${formatted}`;
      });

      const updateSql = `UPDATE \`${activeTable.value.name}\` SET ${setClauses.join(', ')} WHERE ${whereClause};`;

      await tauriBridge.dbmsExecuteQuery(
        props.tab.dbConnection!,
        activeDatabase.value || undefined,
        updateSql
      );
    }

    // 2. Process new / cloned draft rows (INSERT)
    for (const draftRow of pendingNewRows.value) {
      const cols: string[] = [];
      const vals: string[] = [];

      for (const [colName, rawVal] of Object.entries(draftRow.values)) {
        if (rawVal !== undefined && String(rawVal).trim() !== '') {
          const valStr = String(rawVal).trim();
          cols.push(`\`${colName}\``);
          if (valStr.toUpperCase() === 'NULL') {
            vals.push('NULL');
          } else if (!isNaN(Number(valStr))) {
            vals.push(valStr);
          } else {
            vals.push(`'${valStr.replace(/'/g, "''")}'`);
          }
        }
      }

      if (cols.length > 0) {
        const insertSql = `INSERT INTO \`${activeTable.value.name}\` (${cols.join(', ')}) VALUES (${vals.join(', ')});`;
        await tauriBridge.dbmsExecuteQuery(
          props.tab.dbConnection!,
          activeDatabase.value || undefined,
          insertSql
        );
      }
    }

    // Clear staging buffers on success
    pendingEdits.value = {};
    pendingNewRows.value = [];

    // Reload table data
    handlePageChange(currentPage.value);

    await dialogStore.alert({
      title: 'Perubahan Berhasil Disimpan',
      description: 'Semua perubahan baris dan data baru telah berhasil di-commit ke database.',
      variant: 'success',
    });
  } catch (err: any) {
    await dialogStore.alert({
      title: 'Gagal Menyimpan Perubahan',
      description: String(err?.message || err),
      variant: 'error',
    });
  } finally {
    committingEdits.value = false;
  }
}

function rollbackPendingEdits() {
  if (!queryResult.value) return;
  // Revert edited cells
  Object.values(pendingEdits.value).forEach(edit => {
    if (queryResult.value && queryResult.value.rows[edit.rIdx]) {
      queryResult.value.rows[edit.rIdx][edit.cIdx] = edit.oldVal;
    }
  });
  pendingEdits.value = {};
  pendingNewRows.value = [];
}

async function handleDeleteRow(row: any[]) {
  if (!activeTable.value || !queryResult.value) return;
  const pk = getTablePrimaryKey(activeTable.value);
  if (!pk) return;

  const pkIdx = queryResult.value.columns.indexOf(pk.name);
  if (pkIdx === -1) return;

  const pkVal = row[pkIdx];
  const pkClause = typeof pkVal === 'number' ? `${pk.name} = ${pkVal}` : `${pk.name} = '${String(pkVal).replace(/'/g, "''")}'`;

  const confirm = await dialogStore.confirm({
    title: 'Hapus Baris Data?',
    description: `Baris dengan ${pk.name} = "${pkVal}" akan dihapus dari tabel.`,
    confirmText: 'Hapus Baris',
    isDestructive: true,
  });

  if (confirm) {
    const sql = `DELETE FROM ${activeTable.value.name} WHERE ${pkClause};`;
    currentQueryText.value = sql;
    await executeQuery(sql);
    handlePageChange(currentPage.value);
  }
}

function isMutationQuery(sql: string): boolean {
  const sanitized = sql.replace(/--.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  const forbiddenPatterns = [
    /\bUPDATE\b/i,
    /\bDELETE\b/i,
    /\bDROP\b/i,
    /\bTRUNCATE\b/i,
    /\bALTER\b/i,
    /\bINSERT\b/i,
    /\bCREATE\b/i,
    /\bGRANT\b/i,
    /\bREVOKE\b/i,
    /\bREPLACE\b/i,
    /\bRENAME\b/i,
  ];
  return forbiddenPatterns.some(pat => pat.test(sanitized));
}

async function handleAiGenerateSql() {
  if (!aiPrompt.value.trim()) return;
  const prompt = aiPrompt.value.trim();

  // Check user prompt intent against mutating keywords
  const forbiddenKeywords = ['update', 'delete', 'hapus', 'ubah', 'drop', 'truncate', 'insert', 'tambah', 'alter', 'ganti', 'remove', 'modify'];
  const hasMutationIntent = forbiddenKeywords.some(kw => {
    const re = new RegExp(`\\b${kw}\\b`, 'i');
    return re.test(prompt);
  });

  if (hasMutationIntent) {
    await dialogStore.alert({
      title: 'Operasi Modifikasi Ditolak (Security Guard)',
      description: 'Demi integritas dan keamanan database, fitur AI SQL dibatasi secara ketat hanya untuk operasi BACA (Read-Only / SELECT). Perintah modifikasi seperti UPDATE, DELETE, DROP, TRUNCATE, dan INSERT diblokir.',
      variant: 'warning'
    });
    return;
  }

  aiGenerating.value = true;
  const targetTable = activeTable.value?.name || (schemaOverview.value?.tables[0]?.name ?? 'users');
  let generatedSql = '';

  if (prompt.toLowerCase().includes('semua') || prompt.toLowerCase().includes('all')) {
    generatedSql = `SELECT * FROM \`${targetTable}\` LIMIT ${pageSize.value};`;
  } else if (prompt.toLowerCase().includes('hitung') || prompt.toLowerCase().includes('count') || prompt.toLowerCase().includes('jumlah')) {
    generatedSql = `SELECT COUNT(*) AS total_count FROM \`${targetTable}\`;`;
  } else {
    generatedSql = `-- AI Generated (Read-Only): "${prompt}"\nSELECT * FROM \`${targetTable}\` ORDER BY 1 DESC LIMIT 50;`;
  }

  // Strict output validation guardrail
  if (isMutationQuery(generatedSql)) {
    await dialogStore.alert({
      title: 'Query Ditolak oleh Guardrail',
      description: 'Hasil query terdeteksi mengandung operasi perubahan data. Sistem memblokir eksekusi ini demi keamanan.',
      variant: 'error'
    });
    aiGenerating.value = false;
    return;
  }

  currentQueryText.value = generatedSql;
  aiGenerating.value = false;
  aiPrompt.value = '';
}

function exportData(type: 'csv' | 'json' | 'sql' | 'excel') {
  if (!queryResult.value || queryResult.value.columns.length === 0) return;

  const cols = queryResult.value.columns;
  const rows = queryResult.value.rows;
  let content = '';
  let mimeType = 'text/plain;charset=utf-8;';
  let filename = `${activeTable.value?.name || 'export'}_${Date.now()}`;

  if (type === 'csv') {
    content = cols.map(c => `"${c}"`).join(',') + '\n';
    content += rows.map(r => r.map(v => `"${String(v ?? '').replace(/"/g, '""')}"`).join(',')).join('\n');
    filename += '.csv';
  } else if (type === 'json') {
    const objects = rows.map(r => {
      const obj: Record<string, any> = {};
      cols.forEach((c, idx) => {
        obj[c] = r[idx];
      });
      return obj;
    });
    content = JSON.stringify(objects, null, 2);
    filename += '.json';
  } else if (type === 'sql') {
    const tableName = activeTable.value?.name || 'exported_table';
    content = rows.map(r => {
      const vals = r.map(v => {
        if (v === null) return 'NULL';
        if (typeof v === 'number') return v;
        if (typeof v === 'boolean') return v ? '1' : '0';
        return `'${String(v).replace(/'/g, "''")}'`;
      }).join(', ');
      return `INSERT INTO ${tableName} (${cols.join(', ')}) VALUES (${vals});`;
    }).join('\n');
    filename += '.sql';
  } else if (type === 'excel') {
    const tableName = activeTable.value?.name || 'Data';
    let html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
    <head><meta charset="utf-8"><!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet><x:Name>${tableName}</x:Name><x:WorksheetOptions><x:DisplayGridlines/></x:WorksheetOptions></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]--></head>
    <body><table border="1"><thead><tr>`;
    cols.forEach(c => {
      html += `<th style="background-color:#1e293b;color:#ffffff;font-weight:bold;">${c}</th>`;
    });
    html += `</tr></thead><tbody>`;
    rows.forEach(r => {
      html += `<tr>`;
      r.forEach(v => {
        html += `<td>${v !== null && v !== undefined ? String(v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;') : ''}</td>`;
      });
      html += `</tr>`;
    });
    html += `</tbody></table></body></html>`;
    content = html;
    mimeType = 'application/vnd.ms-excel;charset=utf-8;';
    filename += '.xls';
  }

  const blob = new Blob([content], { type: mimeType });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
}

function formatUptime(seconds: number): string {
  if (!seconds || seconds <= 0) return '0s';
  const d = Math.floor(seconds / 86400);
  const h = Math.floor((seconds % 86400) / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  if (d > 0) return `${d}d ${h}h ${m}m`;
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m ${seconds % 60}s`;
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

function handleCloseSubTabEvent(e: any) {
  if (e.detail?.tabId && e.detail.tabId !== props.tab.id) return;
  closeQueryTab(activeQueryTabId.value);
}

function handleNewSubTabEvent(e: any) {
  if (e.detail?.tabId && e.detail.tabId !== props.tab.id) return;
  addNewQueryTab();
}

onMounted(() => {
  loadSchemaOverview();
  window.addEventListener('boba:dbms-close-subtab', handleCloseSubTabEvent as EventListener);
  window.addEventListener('boba:dbms-new-subtab', handleNewSubTabEvent as EventListener);
});

onUnmounted(() => {
  window.removeEventListener('boba:dbms-close-subtab', handleCloseSubTabEvent as EventListener);
  window.removeEventListener('boba:dbms-new-subtab', handleNewSubTabEvent as EventListener);
});
</script>
