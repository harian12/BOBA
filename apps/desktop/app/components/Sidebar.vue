<template>
  <aside
    class="flex h-full select-none relative bg-boba-950"
    @click="closeContextMenu"
  >
    <!-- Left Activity Bar Rail (48px) -->
    <div class="w-12 bg-[#090c14] border-r border-boba-800 flex flex-col items-center py-2.5 justify-between shrink-0">
      <!-- Top Modes: Sessions / Databases / SFTP -->
      <div class="flex flex-col items-center space-y-2.5 w-full">
        <!-- Brand Logo -->
        <div class="p-1 mb-1 cursor-pointer" @click="$emit('open-update')" title="BOBA Desktop Suite v0.1.7 (Klik untuk cek update)">
          <img src="/logo.png" alt="BOBA" class="w-7 h-7 rounded-lg shadow-md object-contain border border-sky-500/30 hover:border-sky-400 transition" />
        </div>

        <!-- Mode 1: SSH Sessions / Terminal -->
        <button
          @click="handleModeClick('sessions')"
          :class="[
            'w-9 h-9 flex items-center justify-center rounded-lg transition relative',
            activeMode === 'sessions' && !isCollapsed
              ? 'bg-boba-800 text-sky-400 shadow-md border border-sky-500/30'
              : 'text-slate-400 hover:text-slate-200 hover:bg-boba-850'
          ]"
          :title="activeMode === 'sessions' && !isCollapsed ? 'Klik untuk sembunyikan sidebar' : 'Sessions & Remote SSH'"
        >
          <Icon icon="lucide:terminal" class="w-5 h-5" />
          <span v-if="activeMode === 'sessions' && !isCollapsed" class="absolute left-0 top-2 bottom-2 w-1 bg-sky-400 rounded-r"></span>
        </button>

        <!-- Mode 2: Databases (DBMS) -->
        <button
          @click="handleModeClick('databases')"
          :class="[
            'w-9 h-9 flex items-center justify-center rounded-lg transition relative',
            activeMode === 'databases' && !isCollapsed
              ? 'bg-boba-800 text-sky-400 shadow-md border border-sky-500/30'
              : 'text-slate-400 hover:text-slate-200 hover:bg-boba-850'
          ]"
          :title="activeMode === 'databases' && !isCollapsed ? 'Klik untuk sembunyikan sidebar' : 'Databases (DBMS Client & ERD)'"
        >
          <Icon icon="lucide:database" class="w-5 h-5" />
          <span v-if="activeMode === 'databases' && !isCollapsed" class="absolute left-0 top-2 bottom-2 w-1 bg-sky-400 rounded-r"></span>
        </button>

        <!-- Mode 3: SFTP Manager -->
        <button
          @click="sessionStore.openSftpTab()"
          class="w-9 h-9 flex items-center justify-center rounded-lg text-slate-400 hover:text-sky-300 hover:bg-boba-850 transition"
          title="Buka SFTP Manager Dedicated"
        >
          <Icon icon="lucide:folder-sync" class="w-5 h-5" />
        </button>
      </div>

      <!-- Bottom Tools: Keys, Security, Sync, Lock, Update -->
      <div class="flex flex-col items-center space-y-1.5 w-full">
        <!-- Update -->
        <button
          @click="$emit('open-update')"
          title="Periksa Update Aplikasi"
          class="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-sky-400 hover:bg-boba-850 rounded-md transition relative"
        >
          <Icon icon="lucide:rocket" class="w-4 h-4" />
          <span v-if="hasUpdateAvailable" class="absolute top-1 right-1 w-2 h-2 rounded-full bg-sky-400 animate-ping"></span>
        </button>

        <!-- SSH Key Vault -->
        <button
          @click="$emit('open-keys')"
          title="SSH Key Vault (E2EE)"
          class="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-amber-400 hover:bg-boba-850 rounded-md transition"
        >
          <Icon icon="lucide:key" class="w-4 h-4" />
        </button>

        <!-- Security Master Password -->
        <button
          @click="$emit('open-change-password')"
          title="Master Password (E2EE)"
          class="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-sky-400 hover:bg-boba-850 rounded-md transition"
        >
          <Icon icon="lucide:shield-check" class="w-4 h-4" />
        </button>

        <!-- Cloud Sync -->
        <button
          @click="$emit('open-sync')"
          :title="syncStore.token ? `Logged in: ${syncStore.userEmail}` : 'Cloud Sync'"
          class="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-slate-200 hover:bg-boba-850 rounded-md transition"
        >
          <Icon icon="lucide:cloud" :class="['w-4 h-4', syncStore.token ? 'text-emerald-400' : 'text-slate-400']" />
        </button>

        <!-- Lock Vault -->
        <button
          @click="vaultStore.lock"
          title="Lock Vault"
          class="w-8 h-8 flex items-center justify-center text-slate-400 hover:text-rose-400 hover:bg-boba-850 rounded-md transition"
        >
          <Icon icon="lucide:lock" class="w-4 h-4" />
        </button>
      </div>
    </div>

    <!-- Main Sidebar Drawer (w-64) -->
    <div v-show="!isCollapsed" class="w-64 bg-boba-900 border-r border-boba-800 flex flex-col h-full animate-in slide-in-from-left-2 duration-150">
      <!-- ================= PANEL 1: SESSIONS & SSH ================= -->
      <template v-if="activeMode === 'sessions'">
        <!-- Action Toolbar (Add Session / Folder) -->
        <div class="px-3 py-2.5 flex items-center justify-between border-b border-boba-800 text-xs">
          <div class="flex items-center space-x-1.5">
            <Icon icon="lucide:server" class="w-3.5 h-3.5 text-sky-400" />
            <span class="text-[11px] font-semibold uppercase tracking-wider text-slate-300">Sessions</span>
          </div>
          <div class="flex items-center space-x-1">
            <button
              @click="promptNewFolder"
              title="New Folder"
              class="px-2 py-1 text-slate-400 hover:text-slate-200 hover:bg-boba-800 rounded text-[11px] transition"
            >
              + Folder
            </button>
            <button
              @click="$emit('new-session')"
              title="New SSH Session"
              class="px-2 py-1 bg-boba-accent hover:bg-boba-accent-hover text-white rounded-md text-[11px] font-medium shadow-sm transition"
            >
              + Session
            </button>
            <button
              @click="isCollapsed = true"
              title="Sembunyikan Sidebar (Ctrl+B)"
              class="p-1 hover:bg-boba-800 text-slate-400 hover:text-slate-200 rounded transition ml-0.5"
            >
              <Icon icon="lucide:panel-left-close" class="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <!-- Search / Filter Sessions -->
        <div class="px-2.5 py-2 border-b border-boba-800">
          <input
            v-model="searchQuery"
            type="text"
            placeholder="Filter sessions..."
            class="w-full bg-boba-950 border border-boba-700 focus:border-boba-accent rounded-lg px-2.5 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none transition font-sans"
          />
        </div>

        <!-- Session Hierarchy Tree (Supports Drag and Drop) -->
        <div
          ref="treeContainer"
          class="flex-1 overflow-y-auto p-2 space-y-1 text-xs font-sans"
          data-unorg-zone
        >
          <div v-if="filteredFolders.length === 0 && unorganizedSessions.length === 0" class="p-6 text-center text-slate-500">
            No sessions found. Click "+ Session" to add.
          </div>

          <!-- Folders -->
          <div
            v-for="folder in filteredFolders"
            :key="folder.id"
            class="space-y-0.5"
            :data-folder-id="folder.id"
          >
            <!-- Folder Header Card -->
            <div
              @contextmenu.prevent="openFolderContextMenu($event, folder)"
              @pointerdown="onPointerDownFolder($event, folder)"
              :class="[
                'flex items-center justify-between px-2 py-1.5 rounded-md cursor-pointer group transition select-none relative',
                dragOverFolderId === folder.id ? 'bg-sky-950/70 border border-sky-500/60 shadow-sm' : 'hover:bg-boba-800/80',
                draggingFolderId === folder.id ? 'opacity-40' : ''
              ]"
            >
              <!-- Folder Insertion Drop Indicators -->
              <div
                v-if="dragOverFolderTargetId === folder.id && dragOverFolderPos === 'top'"
                class="absolute -top-1 left-0 right-0 h-0.5 bg-sky-400 rounded-full z-20 pointer-events-none shadow-[0_0_8px_#38bdf8]"
              ></div>
              <div
                v-if="dragOverFolderTargetId === folder.id && dragOverFolderPos === 'bottom'"
                class="absolute -bottom-1 left-0 right-0 h-0.5 bg-sky-400 rounded-full z-20 pointer-events-none shadow-[0_0_8px_#38bdf8]"
              ></div>

              <div
                class="flex items-center space-x-2 truncate mr-2"
                @click="toggleFolder(folder.id)"
              >
                <span class="text-slate-500 text-[10px] transform transition-transform duration-150 inline-block w-3 text-center">
                  {{ collapsedFolders[folder.id] ? '▶' : '▼' }}
                </span>
                <span class="text-slate-400 group-hover:text-amber-400 transition-colors">
                  <Icon icon="lucide:folder" class="w-3.5 h-3.5 inline" />
                </span>
                <span class="font-medium text-slate-200 truncate">{{ folder.name }}</span>
                <span class="text-[10px] text-slate-500 font-mono">({{ getSessionsInFolder(folder.id).length }})</span>
              </div>

              <!-- Folder Actions -->
              <div class="opacity-0 group-hover:opacity-100 flex items-center space-x-1 shrink-0 transition-opacity">
                <button
                  @click.stop="promptRenameFolder(folder)"
                  title="Rename folder"
                  class="w-5 h-5 flex items-center justify-center rounded hover:bg-boba-700 text-slate-400 hover:text-slate-200 text-xs transition"
                >
                  ✎
                </button>
                <button
                  @click.stop="deleteFolder(folder)"
                  title="Delete folder (Sessions will be unorganized)"
                  class="w-5 h-5 flex items-center justify-center rounded hover:bg-rose-950/60 text-slate-400 hover:text-rose-400 text-xs transition"
                >
                  ✕
                </button>
              </div>
            </div>

            <!-- Folder Sessions List -->
            <div
              v-show="!collapsedFolders[folder.id]"
              class="pl-4 space-y-0.5 border-l border-boba-800/80 ml-3.5 my-0.5"
            >
              <div
                v-if="getSessionsInFolder(folder.id).length === 0"
                class="py-1 px-2 text-[11px] text-slate-500 italic"
              >
                Empty folder
              </div>

              <div
                v-for="session in getSessionsInFolder(folder.id)"
                :key="session.id"
                :data-session-id="session.id"
                :data-parent-folder="folder.id"
                @dblclick="connectSession(session)"
                @contextmenu.prevent="openSessionContextMenu($event, session)"
                @pointerdown="onPointerDownSession($event, session)"
                :class="[
                  'flex items-center justify-between px-2 py-1.5 rounded-md cursor-pointer group transition select-none relative',
                  draggingSessionId === session.id ? 'opacity-40' : 'hover:bg-boba-800/80',
                  sessionStore.activeTab?.sessionConfig?.id === session.id ? 'bg-boba-800 text-sky-300 font-medium' : 'text-slate-300'
                ]"
              >
                <!-- Insertion Drop Line Indicators -->
                <div
                  v-if="dragOverSessionId === session.id && dragOverSessionPos === 'top'"
                  class="absolute -top-1 left-0 right-0 h-0.5 bg-sky-400 rounded-full z-20 pointer-events-none shadow-[0_0_8px_#38bdf8]"
                ></div>
                <div
                  v-if="dragOverSessionId === session.id && dragOverSessionPos === 'bottom'"
                  class="absolute -bottom-1 left-0 right-0 h-0.5 bg-sky-400 rounded-full z-20 pointer-events-none shadow-[0_0_8px_#38bdf8]"
                ></div>

                <div class="flex items-center space-x-2 truncate mr-1.5">
                  <span class="w-1.5 h-1.5 rounded-full bg-slate-600 group-hover:bg-sky-400 shrink-0 transition-colors"></span>
                  <span class="truncate text-[12px]">{{ session.name }}</span>
                </div>

                <div class="opacity-0 group-hover:opacity-100 flex items-center space-x-1 shrink-0 transition-opacity">
                  <button
                    @click.stop="$emit('edit-session', session)"
                    title="Edit session"
                    class="w-5 h-5 flex items-center justify-center rounded hover:bg-boba-700 text-slate-400 hover:text-slate-200 text-xs transition"
                  >
                    ✎
                  </button>
                  <button
                    @click.stop="deleteSession(session)"
                    title="Delete session"
                    class="w-5 h-5 flex items-center justify-center rounded hover:bg-rose-950/60 text-slate-400 hover:text-rose-400 text-xs transition"
                  >
                    ✕
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- Unorganized Sessions -->
          <div v-if="unorganizedSessions.length > 0" class="pt-1.5 space-y-0.5">
            <div
              v-if="filteredFolders.length > 0"
              class="px-2 py-1 text-[10px] font-semibold tracking-wider text-slate-500 uppercase"
            >
              Ungrouped
            </div>

            <div
              v-for="session in unorganizedSessions"
              :key="session.id"
              :data-session-id="session.id"
              @dblclick="connectSession(session)"
              @contextmenu.prevent="openSessionContextMenu($event, session)"
              @pointerdown="onPointerDownSession($event, session)"
              :class="[
                'flex items-center justify-between px-2 py-1.5 rounded-md cursor-pointer group transition select-none relative',
                draggingSessionId === session.id ? 'opacity-40' : 'hover:bg-boba-800/80',
                sessionStore.activeTab?.sessionConfig?.id === session.id ? 'bg-boba-800 text-sky-300 font-medium' : 'text-slate-300'
              ]"
            >
              <!-- Insertion Drop Line Indicators -->
              <div
                v-if="dragOverSessionId === session.id && dragOverSessionPos === 'top'"
                class="absolute -top-1 left-0 right-0 h-0.5 bg-sky-400 rounded-full z-20 pointer-events-none shadow-[0_0_8px_#38bdf8]"
              ></div>
              <div
                v-if="dragOverSessionId === session.id && dragOverSessionPos === 'bottom'"
                class="absolute -bottom-1 left-0 right-0 h-0.5 bg-sky-400 rounded-full z-20 pointer-events-none shadow-[0_0_8px_#38bdf8]"
              ></div>

              <div class="flex items-center space-x-2 truncate mr-1.5">
                <span class="w-1.5 h-1.5 rounded-full bg-slate-600 group-hover:bg-sky-400 shrink-0 transition-colors"></span>
                <span class="truncate text-[12px]">{{ session.name }}</span>
              </div>

              <div class="opacity-0 group-hover:opacity-100 flex items-center space-x-1 shrink-0 transition-opacity">
                <button
                  @click.stop="$emit('edit-session', session)"
                  title="Edit session"
                  class="w-5 h-5 flex items-center justify-center rounded hover:bg-boba-700 text-slate-400 hover:text-slate-200 text-xs transition"
                >
                  ✎
                </button>
                <button
                  @click.stop="deleteSession(session)"
                  title="Delete session"
                  class="w-5 h-5 flex items-center justify-center rounded hover:bg-rose-950/60 text-slate-400 hover:text-rose-400 text-xs transition"
                >
                  ✕
                </button>
              </div>
            </div>
          </div>
        </div>
      </template>

      <!-- ================= PANEL 2: DATABASES (DBMS) ================= -->
      <template v-else-if="activeMode === 'databases'">
        <!-- Action Toolbar for DB -->
        <div class="px-3 py-2.5 flex items-center justify-between border-b border-boba-800 text-xs">
          <div class="flex items-center space-x-1.5">
            <Icon icon="lucide:database" class="w-3.5 h-3.5 text-emerald-400" />
            <span class="text-[11px] font-semibold uppercase tracking-wider text-slate-300">Databases</span>
            <span class="text-[10px] text-slate-500 font-mono">({{ dbmsStore.databases.length }})</span>
          </div>
          <div class="flex items-center space-x-1">
            <button
              @click="dbmsStore.openNewModal()"
              title="Add New Database Connection"
              class="px-2 py-1 bg-emerald-900/80 hover:bg-emerald-700 text-emerald-200 hover:text-white rounded text-[11px] font-medium border border-emerald-600/50 transition flex items-center space-x-1"
            >
              <Icon icon="lucide:plus" class="w-3.5 h-3.5" />
              <span>+ DB</span>
            </button>
            <button
              @click="isCollapsed = true"
              title="Sembunyikan Sidebar (Ctrl+B)"
              class="p-1 hover:bg-boba-800 text-slate-400 hover:text-slate-200 rounded transition ml-0.5"
            >
              <Icon icon="lucide:panel-left-close" class="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <!-- Search / Filter Databases -->
        <div class="px-2.5 py-2 border-b border-boba-800">
          <input
            v-model="dbSearchQuery"
            type="text"
            placeholder="Filter databases..."
            class="w-full bg-boba-950 border border-boba-700 focus:border-emerald-500 rounded-lg px-2.5 py-1.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none transition font-sans"
          />
        </div>

        <!-- Database Connections List -->
        <div class="flex-1 overflow-y-auto p-2 space-y-1 text-xs font-sans">
          <div v-if="filteredDatabases.length === 0" class="p-6 text-center text-slate-500 text-xs">
            <div class="mb-2">Belum ada koneksi database.</div>
            <button
              @click="dbmsStore.openNewModal()"
              class="px-3 py-1.5 bg-boba-800 hover:bg-boba-750 text-emerald-300 rounded text-xs transition border border-boba-700"
            >
              + Tambah Database
            </button>
          </div>

          <div
            v-for="db in filteredDatabases"
            :key="db.id"
            @dblclick="dbmsStore.connectDatabase(db)"
            class="p-2.5 bg-boba-950/60 hover:bg-boba-800/80 border border-boba-800 hover:border-sky-500/40 rounded-lg cursor-pointer group transition select-none flex flex-col space-y-1.5"
            :title="`Double click untuk membuka DBMS Manager (${db.engine.toUpperCase()})`"
          >
            <!-- Top Row: Icon, Name, Actions -->
            <div class="flex items-center justify-between">
              <div class="flex items-center space-x-2 truncate mr-1">
                <Icon :icon="getDbIcon(db.engine)" class="w-4 h-4 shrink-0" />
                <span class="text-slate-200 font-bold truncate text-[12px] font-mono">{{ db.name }}</span>
              </div>

              <div class="opacity-0 group-hover:opacity-100 flex items-center space-x-1 shrink-0 transition-opacity">
                <button
                  @click.stop="dbmsStore.openEditModal(db)"
                  title="Edit database connection"
                  class="w-5 h-5 flex items-center justify-center rounded hover:bg-boba-700 text-slate-400 hover:text-slate-200 text-xs transition"
                >
                  ✎
                </button>
                <button
                  @click.stop="handleDeleteDb(db)"
                  title="Delete database connection"
                  class="w-5 h-5 flex items-center justify-center rounded hover:bg-rose-950/60 text-slate-400 hover:text-rose-400 text-xs transition"
                >
                  ✕
                </button>
              </div>
            </div>

            <!-- Details Row -->
            <div class="flex items-center justify-between text-[10px] text-slate-400 font-mono">
              <span class="truncate">{{ db.engine.toUpperCase() }} • {{ db.host || 'Local' }}:{{ db.port || 3306 }}</span>
              <button
                @click.stop="dbmsStore.connectDatabase(db)"
                class="px-1.5 py-0.5 bg-sky-950 hover:bg-sky-800 text-sky-300 rounded border border-sky-800/60 text-[10px] transition"
              >
                Buka
              </button>
            </div>
          </div>
        </div>
      </template>
    </div>

    <!-- Drag Ghost Indicator -->
    <div
      v-if="dragGhost"
      class="pointer-events-none fixed z-[10000] flex items-center space-x-2 bg-[#1b2230] border border-sky-500/70 shadow-2xl rounded-md px-3 py-1.5 text-xs font-mono text-slate-100"
      :style="{ left: `${dragGhost.x}px`, top: `${dragGhost.y}px`, transform: 'translate(-50%, -130%)' }"
    >
      <span>{{ dragGhost.type === 'folder' ? '📁' : '>' }}</span>
      <span class="truncate max-w-[200px]">{{ dragGhost.label }}</span>
    </div>

    <!-- Custom Session Context Menu -->
    <div
      v-if="contextMenu.show"
      class="fixed z-[9999] bg-[#141721] border border-[#2e3748] rounded-lg shadow-2xl p-1 w-52 text-xs font-sans text-slate-200 select-none backdrop-blur-md animate-in fade-in zoom-in-95 duration-100"
      :style="{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }"
      @click.stop
    >
      <!-- Session Menu Items -->
      <template v-if="contextMenu.type === 'session' && contextMenu.session">
        <button
          @click="handleContextConnect(contextMenu.session)"
          class="w-full flex items-center space-x-2 px-2.5 py-1.5 rounded hover:bg-sky-600 hover:text-white transition"
        >
          <Icon icon="lucide:terminal" class="w-3.5 h-3.5" />
          <span>Connect Terminal</span>
        </button>

        <button
          @click="handleContextOpenSftp(contextMenu.session)"
          class="w-full flex items-center space-x-2 px-2.5 py-1.5 rounded hover:bg-sky-600 hover:text-white transition"
        >
          <Icon icon="lucide:folder-sync" class="w-3.5 h-3.5" />
          <span>Open SFTP Manager</span>
        </button>

        <button
          @click="handleContextCut(contextMenu.session)"
          class="w-full flex items-center space-x-2 px-2.5 py-1.5 rounded hover:bg-sky-600 hover:text-white transition"
        >
          <Icon icon="lucide:scissors" class="w-3.5 h-3.5" />
          <span>Cut (Move)</span>
        </button>

        <button
          @click="handleContextCopy(contextMenu.session)"
          class="w-full flex items-center space-x-2 px-2.5 py-1.5 rounded hover:bg-sky-600 hover:text-white transition"
        >
          <Icon icon="lucide:copy" class="w-3.5 h-3.5" />
          <span>Copy</span>
        </button>

        <button
          @click="handleContextDuplicate(contextMenu.session)"
          class="w-full flex items-center space-x-2 px-2.5 py-1.5 rounded hover:bg-sky-600 hover:text-white transition"
        >
          <Icon icon="lucide:copy-plus" class="w-3.5 h-3.5" />
          <span>Duplicate</span>
        </button>

        <div class="h-px bg-[#2e3748] my-1"></div>

        <button
          @click="handleContextEdit(contextMenu.session)"
          class="w-full flex items-center space-x-2 px-2.5 py-1.5 rounded hover:bg-sky-600 hover:text-white transition"
        >
          <Icon icon="lucide:pencil" class="w-3.5 h-3.5" />
          <span>Edit</span>
        </button>

        <button
          @click="handleContextDeleteSession(contextMenu.session)"
          class="w-full flex items-center space-x-2 px-2.5 py-1.5 rounded hover:bg-rose-600 hover:text-white text-rose-400 transition"
        >
          <Icon icon="lucide:trash-2" class="w-3.5 h-3.5" />
          <span>Delete</span>
        </button>
      </template>

      <!-- Folder Menu Items -->
      <template v-else-if="contextMenu.type === 'folder' && contextMenu.folder">
        <button
          @click="handleContextNewSessionInFolder(contextMenu.folder)"
          class="w-full flex items-center space-x-2 px-2.5 py-1.5 rounded hover:bg-sky-600 hover:text-white transition"
        >
          <Icon icon="lucide:plus" class="w-3.5 h-3.5" />
          <span>New Session Inside</span>
        </button>

        <button
          v-if="clipboard"
          @click="handleContextPasteIntoFolder(contextMenu.folder)"
          class="w-full flex items-center space-x-2 px-2.5 py-1.5 rounded hover:bg-sky-600 hover:text-white text-sky-400 transition"
        >
          <Icon icon="lucide:clipboard-paste" class="w-3.5 h-3.5" />
          <span>Paste {{ clipboard.type === 'session' ? 'Session' : 'Folder' }}</span>
        </button>

        <button
          @click="handleContextRenameFolder(contextMenu.folder)"
          class="w-full flex items-center space-x-2 px-2.5 py-1.5 rounded hover:bg-sky-600 hover:text-white transition"
        >
          <Icon icon="lucide:pencil" class="w-3.5 h-3.5" />
          <span>Rename Folder</span>
        </button>

        <div class="h-px bg-[#2e3748] my-1"></div>

        <button
          @click="handleContextDeleteFolder(contextMenu.folder)"
          class="w-full flex items-center space-x-2 px-2.5 py-1.5 rounded hover:bg-rose-600 hover:text-white text-rose-400 transition"
        >
          <Icon icon="lucide:trash-2" class="w-3.5 h-3.5" />
          <span>Delete Folder</span>
        </button>
      </template>
    </div>
  </aside>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue';
import { Icon } from '@iconify/vue';
import { useVaultStore } from '../stores/vaultStore.js';
import { useSyncStore } from '../stores/syncStore.js';
import { useSessionStore } from '../stores/sessionStore.js';
import { useDialogStore } from '../stores/dialogStore.js';
import { useDbmsStore } from '../stores/dbmsStore.js';
import type { SshSessionConfig, Folder, DbConnectionConfig } from '../types/index.js';

defineProps<{
  hasUpdateAvailable?: boolean;
}>();

const emit = defineEmits(['new-session', 'edit-session', 'open-sync', 'open-keys', 'open-change-password', 'open-update']);

const vaultStore = useVaultStore();
const syncStore = useSyncStore();
const sessionStore = useSessionStore();
const dialogStore = useDialogStore();
const dbmsStore = useDbmsStore();

// Sidebar Modes: 'sessions' | 'databases'
const activeMode = ref<'sessions' | 'databases'>('sessions');
const isCollapsed = ref(false);

function handleModeClick(mode: 'sessions' | 'databases') {
  if (activeMode.value === mode) {
    isCollapsed.value = !isCollapsed.value;
  } else {
    activeMode.value = mode;
    isCollapsed.value = false;
  }
}

function handleKeyDown(e: KeyboardEvent) {
  if (e.ctrlKey && (e.key === 'b' || e.key === 'B')) {
    e.preventDefault();
    isCollapsed.value = !isCollapsed.value;
  }
}

const searchQuery = ref('');
const dbSearchQuery = ref('');
const collapsedFolders = ref<Record<string, boolean>>({});

function getDbIcon(engine?: string): string {
  switch (engine?.toLowerCase()) {
    case 'mysql':
    case 'mariadb':
      return 'logos:mysql';
    case 'postgres':
    case 'postgresql':
      return 'logos:postgresql';
    case 'sqlite':
      return 'logos:sqlite';
    case 'redis':
      return 'logos:redis';
    case 'mongodb':
      return 'logos:mongodb-icon';
    default:
      return 'lucide:database';
  }
}

const filteredDatabases = computed(() => {
  if (!dbSearchQuery.value.trim()) return dbmsStore.databases;
  const q = dbSearchQuery.value.toLowerCase();
  return dbmsStore.databases.filter(d =>
    d.name.toLowerCase().includes(q) ||
    d.engine.toLowerCase().includes(q) ||
    (d.host && d.host.toLowerCase().includes(q))
  );
});

async function handleDeleteDb(db: DbConnectionConfig) {
  const confirmed = await dialogStore.confirm({
    title: `Hapus Koneksi "${db.name}"?`,
    description: 'Koneksi database ini akan dihapus dari vault Anda.',
    confirmText: 'Hapus Database',
    isDestructive: true,
  });
  if (confirmed) {
    await dbmsStore.removeDatabase(db.id);
  }
}

// Drag and Drop States (Pointer-based, works reliably in WebView2)
const treeContainer = ref<HTMLElement | null>(null);
const dragType = ref<'session' | 'folder' | null>(null);
const draggingSessionId = ref<string | null>(null);
const draggingFolderId = ref<string | null>(null);

const dragOverFolderId = ref<string | null>(null);
const dragOverFolderTargetId = ref<string | null>(null);
const dragOverFolderPos = ref<'top' | 'bottom' | null>(null);

const dragOverSessionId = ref<string | null>(null);
const dragOverSessionPos = ref<'top' | 'bottom' | null>(null);
const dragOverRoot = ref(false);

const dragGhost = ref<{
  type: 'session' | 'folder';
  id: string;
  label: string;
  x: number;
  y: number;
} | null>(null);

// Pointer drag tracking
let dragStartX = 0;
let dragStartY = 0;
let isDragging = false;
let pendingDragItem: { type: 'session' | 'folder'; item: any } | null = null;

// Clipboard State for Cut/Copy/Paste
const clipboard = ref<{
  action: 'cut' | 'copy';
  type: 'session' | 'folder';
  data: SshSessionConfig | Folder;
} | null>(null);

// Context Menu State
const contextMenu = ref<{
  show: boolean;
  x: number;
  y: number;
  type: 'session' | 'folder' | null;
  session?: SshSessionConfig;
  folder?: Folder;
}>({
  show: false,
  x: 0,
  y: 0,
  type: null,
});

// Computed Filters
const filteredFolders = computed(() => {
  const folders = vaultStore.vault.folders || [];
  if (!searchQuery.value.trim()) return folders;
  const q = searchQuery.value.toLowerCase();

  return folders.filter(f => {
    if (f.name.toLowerCase().includes(q)) return true;
    const folderSessions = vaultStore.vault.sessions.filter(s => s.folder_id === f.id);
    return folderSessions.some(s => s.name.toLowerCase().includes(q) || s.host.toLowerCase().includes(q));
  });
});

const unorganizedSessions = computed(() => {
  const sessions = (vaultStore.vault.sessions || []).filter(s => !s.folder_id);
  if (!searchQuery.value.trim()) return sessions;
  const q = searchQuery.value.toLowerCase();
  return sessions.filter(s => s.name.toLowerCase().includes(q) || s.host.toLowerCase().includes(q));
});

function getSessionsInFolder(folderId: string) {
  const sessions = (vaultStore.vault.sessions || []).filter(s => s.folder_id === folderId);
  if (!searchQuery.value.trim()) return sessions;
  const q = searchQuery.value.toLowerCase();
  return sessions.filter(s => s.name.toLowerCase().includes(q) || s.host.toLowerCase().includes(q));
}

function toggleFolder(folderId: string) {
  collapsedFolders.value[folderId] = !collapsedFolders.value[folderId];
}

function connectSession(session: SshSessionConfig) {
  sessionStore.openSession(session);
}

// Dialog-based Folder Prompts
async function promptNewFolder() {
  const folderName = await dialogStore.prompt({
    title: 'Buat Folder Baru',
    description: 'Masukkan nama folder untuk mengelompokkan sesi:',
    placeholder: 'Nama folder (misal: Production, Staging)',
    confirmText: 'Buat Folder',
  });

  if (folderName && folderName.trim()) {
    vaultStore.addFolder(folderName.trim());
  }
}

async function promptRenameFolder(folder: Folder) {
  const newName = await dialogStore.prompt({
    title: 'Ubah Nama Folder',
    description: 'Masukkan nama baru untuk folder ini:',
    defaultValue: folder.name,
    confirmText: 'Simpan',
  });

  if (newName && newName.trim() && newName.trim() !== folder.name) {
    vaultStore.renameFolder(folder.id, newName.trim());
  }
}

async function deleteFolder(folder: Folder) {
  const confirmed = await dialogStore.confirm({
    title: `Hapus Folder "${folder.name}"?`,
    description: 'Sesi di dalam folder ini tidak akan dihapus, melainkan dipindahkan ke daftar tidak terkelompok (Ungrouped).',
    confirmText: 'Hapus Folder',
    isDestructive: true,
  });

  if (confirmed) {
    vaultStore.deleteFolder(folder.id);
  }
}

async function deleteSession(session: SshSessionConfig) {
  const confirmed = await dialogStore.confirm({
    title: `Hapus Sesi "${session.name}"?`,
    description: 'Sesi ini akan dihapus secara permanen dari vault Anda.',
    confirmText: 'Hapus Sesi',
    isDestructive: true,
  });

  if (confirmed) {
    vaultStore.deleteSession(session.id);
  }
}

// Pointer Drag and Drop Handlers
function onPointerDownSession(e: PointerEvent, session: SshSessionConfig) {
  if (e.button !== 0) return;
  dragStartX = e.clientX;
  dragStartY = e.clientY;
  pendingDragItem = { type: 'session', item: session };
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
}

function onPointerDownFolder(e: PointerEvent, folder: Folder) {
  if (e.button !== 0) return;
  dragStartX = e.clientX;
  dragStartY = e.clientY;
  pendingDragItem = { type: 'folder', item: folder };
  window.addEventListener('pointermove', onPointerMove);
  window.addEventListener('pointerup', onPointerUp);
}

function onPointerMove(e: PointerEvent) {
  if (!pendingDragItem) return;

  if (!isDragging) {
    const dist = Math.hypot(e.clientX - dragStartX, e.clientY - dragStartY);
    if (dist > 5) {
      isDragging = true;
      dragType.value = pendingDragItem.type;
      if (pendingDragItem.type === 'session') {
        draggingSessionId.value = pendingDragItem.item.id;
        dragGhost.value = {
          type: 'session',
          id: pendingDragItem.item.id,
          label: pendingDragItem.item.name,
          x: e.clientX,
          y: e.clientY,
        };
      } else {
        draggingFolderId.value = pendingDragItem.item.id;
        dragGhost.value = {
          type: 'folder',
          id: pendingDragItem.item.id,
          label: pendingDragItem.item.name,
          x: e.clientX,
          y: e.clientY,
        };
      }
    }
  }

  if (isDragging && dragGhost.value) {
    dragGhost.value.x = e.clientX;
    dragGhost.value.y = e.clientY;

    const elem = document.elementFromPoint(e.clientX, e.clientY);
    if (!elem) return;

    if (dragType.value === 'session') {
      const sessionCard = elem.closest('[data-session-id]') as HTMLElement | null;
      const folderCard = elem.closest('[data-folder-id]') as HTMLElement | null;
      const unorgZone = elem.closest('[data-unorg-zone]') as HTMLElement | null;

      if (sessionCard) {
        const targetId = sessionCard.getAttribute('data-session-id');
        if (targetId && targetId !== draggingSessionId.value) {
          const rect = sessionCard.getBoundingClientRect();
          const relY = e.clientY - rect.top;
          dragOverSessionId.value = targetId;
          dragOverSessionPos.value = relY < rect.height / 2 ? 'top' : 'bottom';
          dragOverFolderId.value = null;
          dragOverRoot.value = false;
          return;
        }
      }

      if (folderCard) {
        const folderId = folderCard.getAttribute('data-folder-id');
        if (folderId) {
          dragOverFolderId.value = folderId;
          dragOverSessionId.value = null;
          dragOverRoot.value = false;
          return;
        }
      }

      if (unorgZone && !sessionCard && !folderCard) {
        dragOverFolderId.value = null;
        dragOverSessionId.value = null;
        dragOverRoot.value = true;
        return;
      }
    } else if (dragType.value === 'folder') {
      const folderCard = elem.closest('[data-folder-id]') as HTMLElement | null;
      if (folderCard) {
        const targetId = folderCard.getAttribute('data-folder-id');
        if (targetId && targetId !== draggingFolderId.value) {
          const rect = folderCard.getBoundingClientRect();
          const relY = e.clientY - rect.top;
          dragOverFolderTargetId.value = targetId;
          dragOverFolderPos.value = relY < rect.height / 2 ? 'top' : 'bottom';
          return;
        }
      }
    }

    dragOverFolderId.value = null;
    dragOverFolderTargetId.value = null;
    dragOverSessionId.value = null;
    dragOverRoot.value = false;
  }
}

async function onPointerUp(e: PointerEvent) {
  window.removeEventListener('pointermove', onPointerMove);
  window.removeEventListener('pointerup', onPointerUp);

  if (!isDragging) {
    pendingDragItem = null;
    return;
  }

  if (dragType.value === 'session' && draggingSessionId.value) {
    const sessId = draggingSessionId.value;

    if (dragOverFolderId.value) {
      vaultStore.moveSessionToFolder(sessId, dragOverFolderId.value);
    } else if (dragOverSessionId.value && dragOverSessionPos.value) {
      const targetSessionId = dragOverSessionId.value;
      const targetSession = vaultStore.vault.sessions.find(s => s.id === targetSessionId);
      const targetFolderId = targetSession ? targetSession.folder_id : null;

      vaultStore.reorderSession(sessId, targetSessionId, dragOverSessionPos.value, targetFolderId);
    } else if (dragOverRoot.value) {
      vaultStore.moveSessionToFolder(sessId, null);
    }
  } else if (dragType.value === 'folder' && draggingFolderId.value) {
    const srcFolderId = draggingFolderId.value;
    if (dragOverFolderTargetId.value && dragOverFolderPos.value) {
      vaultStore.reorderFolder(srcFolderId, dragOverFolderTargetId.value, dragOverFolderPos.value);
    }
  }

  isDragging = false;
  pendingDragItem = null;
  dragType.value = null;
  draggingSessionId.value = null;
  draggingFolderId.value = null;
  dragOverFolderId.value = null;
  dragOverFolderTargetId.value = null;
  dragOverFolderPos.value = null;
  dragOverSessionId.value = null;
  dragOverSessionPos.value = null;
  dragOverRoot.value = false;
  dragGhost.value = null;
}

// Context Menu Handlers
function openSessionContextMenu(e: MouseEvent, session: SshSessionConfig) {
  contextMenu.value = {
    show: true,
    x: e.clientX,
    y: e.clientY,
    type: 'session',
    session,
  };
}

function openFolderContextMenu(e: MouseEvent, folder: Folder) {
  contextMenu.value = {
    show: true,
    x: e.clientX,
    y: e.clientY,
    type: 'folder',
    folder,
  };
}

function closeContextMenu() {
  contextMenu.value.show = false;
}

function handleContextConnect(session: SshSessionConfig) {
  closeContextMenu();
  connectSession(session);
}

function handleContextOpenSftp(session: SshSessionConfig) {
  closeContextMenu();
  sessionStore.openSftpTab(undefined, session);
}

function handleContextCut(session: SshSessionConfig) {
  closeContextMenu();
  clipboard.value = { action: 'cut', type: 'session', data: session };
}

function handleContextCopy(session: SshSessionConfig) {
  closeContextMenu();
  clipboard.value = { action: 'copy', type: 'session', data: session };
}

function handleContextDuplicate(session: SshSessionConfig) {
  closeContextMenu();
  vaultStore.duplicateSession(session.id);
}

function handleContextEdit(session: SshSessionConfig) {
  closeContextMenu();
  emit('edit-session', session);
}

function handleContextDeleteSession(session: SshSessionConfig) {
  closeContextMenu();
  deleteSession(session);
}

function handleContextNewSessionInFolder(folder: Folder) {
  closeContextMenu();
  emit('new-session', folder.id);
}

function handleContextRenameFolder(folder: Folder) {
  closeContextMenu();
  promptRenameFolder(folder);
}

function handleContextDeleteFolder(folder: Folder) {
  closeContextMenu();
  deleteFolder(folder);
}

function handleContextPasteIntoFolder(folder: Folder) {
  closeContextMenu();
  if (!clipboard.value) return;

  if (clipboard.value.type === 'session') {
    const session = clipboard.value.data as SshSessionConfig;
    if (clipboard.value.action === 'cut') {
      vaultStore.moveSessionToFolder(session.id, folder.id);
      clipboard.value = null;
    } else {
      vaultStore.duplicateSession(session.id, folder.id);
    }
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeyDown);
});

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyDown);
});
</script>
