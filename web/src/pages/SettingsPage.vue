<script setup lang="ts">
import { onMounted, ref, computed } from 'vue';
import { useSettingsStore } from '@/stores/settings';

const store = useSettingsStore();
const vacuuming = ref(false);
const rebuilding = ref(false);
const showResetConfirm = ref(false);

onMounted(() => store.fetchDatabaseInfo());

const db = computed(() => store.dbInfo);

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function doVacuum() {
  vacuuming.value = true;
  try { await store.vacuum(); } finally { vacuuming.value = false; }
}

async function doRebuild() {
  rebuilding.value = true;
  try { await store.rebuildFts(); } finally { rebuilding.value = false; }
}
</script>

<template>
  <div class="p-8">
    <!-- Breadcrumb -->
    <nav class="flex items-center gap-2 text-sm mb-6">
      <span class="text-slate-400">Settings</span>
      <span class="text-slate-600">&gt;</span>
      <span class="text-primary font-medium">Database Settings</span>
    </nav>

    <header class="mb-8">
      <h2 class="text-2xl font-extrabold text-white tracking-tight">Database Settings</h2>
      <p class="text-slate-400 text-sm mt-1">Configure local storage, health parameters, and search indexing for your MCP instance.</p>
    </header>

    <template v-if="db">
      <!-- Info Cards -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8">
        <!-- Database Information -->
        <div class="bg-bg-dark/40 rounded-xl cyber-border p-6">
          <div class="flex items-center gap-3 mb-6">
            <span class="material-symbols-outlined text-primary">storage</span>
            <h3 class="font-bold text-lg text-white">Database Information</h3>
          </div>
          <dl class="space-y-4">
            <div class="flex justify-between items-center">
              <dt class="text-sm text-slate-400">Path</dt>
              <dd class="text-sm text-slate-200 font-mono text-right max-w-[60%] truncate">{{ db.path }}</dd>
            </div>
            <div class="flex justify-between items-center">
              <dt class="text-sm text-slate-400">Size</dt>
              <dd class="text-sm text-white font-bold">{{ formatSize(db.sizeBytes) }}</dd>
            </div>
            <div class="flex justify-between items-center">
              <dt class="text-sm text-slate-400">WAL Mode</dt>
              <dd class="flex items-center gap-2">
                <div :class="['w-2 h-2 rounded-full', db.walEnabled ? 'bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]' : 'bg-red-500']"></div>
                <span class="text-sm text-white font-medium">{{ db.walEnabled ? 'Enabled' : 'Disabled' }}</span>
              </dd>
            </div>
          </dl>
        </div>

        <!-- MCP Server -->
        <div class="bg-bg-dark/40 rounded-xl cyber-border p-6">
          <div class="flex items-center gap-3 mb-6">
            <span class="material-symbols-outlined text-primary">dns</span>
            <h3 class="font-bold text-lg text-white">MCP Server</h3>
          </div>
          <dl class="space-y-4">
            <div class="flex justify-between items-center">
              <dt class="text-sm text-slate-400">Registration</dt>
              <dd class="text-sm text-slate-200">Registered (Local)</dd>
            </div>
            <div class="flex justify-between items-center">
              <dt class="text-sm text-slate-400">Health Status</dt>
              <dd class="flex items-center gap-2">
                <span class="px-2.5 py-1 rounded-full text-[10px] font-bold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">HEALTHY</span>
              </dd>
            </div>
            <div class="flex justify-between items-center">
              <dt class="text-sm text-slate-400">Records</dt>
              <dd class="text-sm text-white font-bold">{{ db.decisionCount }} decisions, {{ db.sessionCount }} sessions</dd>
            </div>
          </dl>
        </div>
      </div>

      <!-- Maintenance Operations -->
      <h3 class="font-bold text-lg text-white mb-4">Maintenance Operations</h3>
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-8">
        <button
          @click="doVacuum"
          :disabled="vacuuming"
          class="bg-bg-dark/40 rounded-xl cyber-border p-6 text-left hover:bg-primary/5 transition-colors flex items-center justify-between group"
        >
          <div class="flex items-center gap-4">
            <span class="material-symbols-outlined text-primary text-2xl">cleaning_services</span>
            <div>
              <h4 class="font-semibold text-white group-hover:text-primary transition-colors">Vacuum Database</h4>
              <p class="text-xs text-slate-500 mt-0.5">Optimize and reclaim unused storage space</p>
            </div>
          </div>
          <span class="material-symbols-outlined text-slate-500">chevron_right</span>
        </button>

        <button
          @click="doRebuild"
          :disabled="rebuilding"
          class="bg-bg-dark/40 rounded-xl cyber-border p-6 text-left hover:bg-primary/5 transition-colors flex items-center justify-between group"
        >
          <div class="flex items-center gap-4">
            <span class="material-symbols-outlined text-primary text-2xl">manage_search</span>
            <div>
              <h4 class="font-semibold text-white group-hover:text-primary transition-colors">Rebuild Search Index</h4>
              <p class="text-xs text-slate-500 mt-0.5">Refresh full-text search capabilities</p>
            </div>
          </div>
          <span class="material-symbols-outlined text-slate-500">chevron_right</span>
        </button>
      </div>

      <!-- Danger Zone -->
      <div class="bg-bg-dark/40 rounded-xl border border-red-500/30 p-6 flex items-center justify-between">
        <div>
          <h4 class="font-bold text-red-400 flex items-center gap-2">
            <span class="text-lg">&#9888;</span> Danger Zone
          </h4>
          <p class="text-sm text-slate-400 mt-1">Irreversibly delete all database records and reset the system to factory state.</p>
        </div>
        <button
          @click="showResetConfirm = true"
          class="bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30 font-bold py-2.5 px-6 rounded-lg transition-colors flex-shrink-0"
        >Reset Database</button>
      </div>

      <!-- Reset Confirm Dialog -->
      <div v-if="showResetConfirm" class="fixed inset-0 bg-black/60 flex items-center justify-center z-50" @click.self="showResetConfirm = false">
        <div class="bg-bg-dark rounded-xl border border-red-500/30 p-6 max-w-md w-full mx-4">
          <h4 class="font-bold text-red-400 text-lg mb-2">Reset Database?</h4>
          <p class="text-sm text-slate-400 mb-6">This action is not available via the web UI for safety. Use the CLI instead.</p>
          <button @click="showResetConfirm = false" class="w-full bg-slate-700 hover:bg-slate-600 text-white font-bold py-2.5 rounded-lg">Close</button>
        </div>
      </div>
    </template>

    <div v-else-if="store.loading" class="text-center py-20 text-slate-400">Loading...</div>

    <!-- Footer -->
    <div class="mt-12 text-center space-y-2">
      <div class="flex items-center justify-center gap-6 text-xs text-slate-500">
        <span class="flex items-center gap-1"><span class="material-symbols-outlined text-sm">lock</span> LOCAL-FIRST</span>
        <span>·</span>
        <span class="flex items-center gap-1"><span class="material-symbols-outlined text-sm">cloud_off</span> NO CLOUD SYNCING</span>
      </div>
      <p class="text-xs text-slate-600 italic">Your data stays on your machine.</p>
    </div>
  </div>
</template>
