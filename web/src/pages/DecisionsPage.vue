<script setup lang="ts">
import { ref, watch, onMounted, computed } from 'vue';
import { useDecisionsStore } from '@/stores/decisions';
import StatusBadge from '@/components/StatusBadge.vue';
import TagPill from '@/components/TagPill.vue';

const store = useDecisionsStore();

const search = ref('');
const statusFilters = ref<string[]>(['active']);
const page = ref(1);
const pageSize = 20;
const selected = ref<Set<number>>(new Set());

const allStatuses = ['active', 'deprecated', 'superseded'];

function toggleStatus(s: string) {
  const idx = statusFilters.value.indexOf(s);
  if (idx >= 0) statusFilters.value.splice(idx, 1);
  else statusFilters.value.push(s);
}

function clearFilters() {
  statusFilters.value = [];
  search.value = '';
}

function fetchPage() {
  const params: Record<string, string> = {
    offset: String((page.value - 1) * pageSize),
    limit: String(pageSize),
  };
  if (statusFilters.value.length > 0) params.status = statusFilters.value.join(',');
  if (search.value.trim()) params.search = search.value.trim();
  store.fetchDecisions(params);
}

const totalPages = computed(() => Math.max(1, Math.ceil(store.total / pageSize)));

const allSelected = computed(() =>
  store.decisions.length > 0 && store.decisions.every(d => selected.value.has(d.id))
);

function toggleAll() {
  if (allSelected.value) {
    selected.value.clear();
  } else {
    store.decisions.forEach(d => selected.value.add(d.id));
  }
}

function toggleOne(id: number) {
  if (selected.value.has(id)) selected.value.delete(id);
  else selected.value.add(id);
}

watch([statusFilters, search], () => { page.value = 1; fetchPage(); }, { deep: true });
watch(page, fetchPage);
onMounted(fetchPage);
</script>

<template>
  <div class="p-8">
    <!-- Search Bar -->
    <div class="mb-6">
      <div class="relative">
        <span class="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-slate-400">search</span>
        <input
          v-model="search"
          type="text"
          placeholder="Search Architectural Memory..."
          class="w-full pl-12 pr-24 py-3.5 bg-bg-dark/60 border border-primary/20 rounded-xl text-white placeholder-slate-500 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/30"
        />
        <span class="absolute right-4 top-1/2 -translate-y-1/2 text-xs text-slate-500 bg-bg-dark/80 px-2 py-1 rounded border border-primary/10">CMD + K</span>
      </div>
    </div>

    <div class="flex gap-8">
      <!-- Filters Sidebar -->
      <div class="w-56 flex-shrink-0">
        <div class="flex justify-between items-center mb-4">
          <h3 class="text-primary font-bold text-sm uppercase tracking-wider">Filters</h3>
          <button @click="clearFilters" class="text-xs text-slate-400 hover:text-primary">Clear all</button>
        </div>

        <!-- Status -->
        <div class="mb-6">
          <p class="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Status</p>
          <div class="space-y-2">
            <button
              v-for="s in allStatuses"
              :key="s"
              @click="toggleStatus(s)"
              class="flex items-center gap-3 cursor-pointer group w-full"
            >
              <span
                :class="[
                  'w-4 h-4 rounded flex-shrink-0 flex items-center justify-center border transition-colors',
                  statusFilters.includes(s)
                    ? 'bg-primary border-primary'
                    : 'border-slate-600 bg-bg-dark/60 group-hover:border-slate-400'
                ]"
              >
                <span v-if="statusFilters.includes(s)" class="material-symbols-outlined text-bg-dark text-xs leading-none" style="font-size: 14px">check</span>
              </span>
              <span class="text-sm capitalize group-hover:text-white transition-colors"
                :class="statusFilters.includes(s) ? 'text-white' : 'text-slate-400'"
              >{{ s }}</span>
            </button>
          </div>
        </div>
      </div>

      <!-- Table -->
      <div class="flex-1 min-w-0">
        <div class="bg-bg-dark/40 rounded-xl cyber-border overflow-hidden">
          <!-- Table Header -->
          <div class="grid grid-cols-[40px_1fr_100px_140px_100px_60px] items-center px-4 py-3 border-b border-primary/10 text-xs font-semibold text-slate-400 uppercase tracking-wider">
            <div>
              <input type="checkbox" :checked="allSelected" @change="toggleAll" class="w-4 h-4 rounded border-primary/30 bg-bg-dark text-primary" />
            </div>
            <div>Title</div>
            <div>Status</div>
            <div>Tags</div>
            <div>Date</div>
            <div>Session</div>
          </div>

          <!-- Rows -->
          <template v-if="store.decisions.length > 0">
            <router-link
              v-for="d in store.decisions"
              :key="d.id"
              :to="`/decisions/${d.id}`"
              class="grid grid-cols-[40px_1fr_100px_140px_100px_60px] items-center px-4 py-4 border-b border-primary/5 hover:bg-primary/5 transition-colors"
            >
              <div @click.prevent>
                <input type="checkbox" :checked="selected.has(d.id)" @change="toggleOne(d.id)" class="w-4 h-4 rounded border-primary/30 bg-bg-dark text-primary" />
              </div>
              <div class="min-w-0">
                <h4 class="text-sm font-semibold text-white truncate">{{ d.title }}</h4>
                <p class="text-xs text-slate-500 truncate mt-0.5">{{ d.decision }}</p>
              </div>
              <div>
                <StatusBadge :status="d.status" />
              </div>
              <div class="flex gap-1 flex-wrap">
                <TagPill v-for="t in d.tags.slice(0, 2)" :key="t" :tag="t" />
              </div>
              <div class="text-xs text-slate-400">{{ d.created_at?.split(' ')[0] }}</div>
              <div class="text-xs text-slate-500 font-mono truncate">{{ d.session_id?.slice(0, 6) }}</div>
            </router-link>
          </template>

          <!-- Empty State -->
          <div v-else-if="!store.loading" class="py-20 text-center">
            <span class="material-symbols-outlined text-5xl text-primary/30 mb-4">cloud_off</span>
            <h4 class="text-lg font-semibold text-slate-300">No decisions found</h4>
            <p class="text-sm text-slate-500 mt-1">Try a different query or start a conversation in Claude Code to create new architectural memories.</p>
          </div>

          <div v-else class="py-20 text-center text-slate-400">Loading...</div>
        </div>

        <!-- Bottom Bar -->
        <div class="flex items-center justify-between mt-4">
          <div class="flex items-center gap-3">
            <span v-if="selected.size > 0" class="text-sm text-primary font-bold">{{ selected.size }} items selected</span>
          </div>
          <div class="flex items-center gap-4">
            <span class="text-xs text-slate-500">Showing {{ store.decisions.length }} of {{ store.total }} memories</span>
            <div class="flex gap-1">
              <button
                @click="page = Math.max(1, page - 1)"
                :disabled="page <= 1"
                class="px-3 py-1.5 rounded bg-bg-dark/60 cyber-border text-xs text-slate-400 hover:text-primary disabled:opacity-30"
              >&lt;</button>
              <button
                v-for="p in Math.min(totalPages, 5)"
                :key="p"
                @click="page = p"
                :class="['px-3 py-1.5 rounded text-xs font-bold', p === page ? 'bg-primary text-bg-dark' : 'bg-bg-dark/60 cyber-border text-slate-400 hover:text-primary']"
              >{{ p }}</button>
              <button
                @click="page = Math.min(totalPages, page + 1)"
                :disabled="page >= totalPages"
                class="px-3 py-1.5 rounded bg-bg-dark/60 cyber-border text-xs text-slate-400 hover:text-primary disabled:opacity-30"
              >&gt;</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
