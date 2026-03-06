<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { useSessionsStore } from '@/stores/sessions';
import StatCard from '@/components/StatCard.vue';
import StatusBadge from '@/components/StatusBadge.vue';
import TagPill from '@/components/TagPill.vue';
import { api } from '@/composables/useApi';

const store = useSessionsStore();
const expandedId = ref<string | null>(null);
const sessionDecisions = ref<Record<string, any[]>>({});

onMounted(() => {
  store.fetchSessions({ offset: '0', limit: '50' });
});

function toggleExpand(sessionId: string) {
  if (expandedId.value === sessionId) {
    expandedId.value = null;
    return;
  }
  expandedId.value = sessionId;
  if (!sessionDecisions.value[sessionId]) {
    api.getSession(sessionId).then((detail: any) => {
      sessionDecisions.value[sessionId] = detail.decisions || [];
    });
  }
}

const avgDecisions = computed(() => {
  if (store.sessions.length === 0) return 0;
  const total = store.sessions.reduce((sum: number, s: any) => sum + (s.decision_count || 0), 0);
  return (total / store.sessions.length).toFixed(1);
});
</script>

<template>
  <div class="p-8">
    <header class="flex justify-between items-center mb-8">
      <div>
        <h2 class="text-2xl font-bold text-white tracking-tight">Session History</h2>
      </div>
    </header>

    <!-- Stats Row -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
      <StatCard label="Total Sessions" :value="store.total" icon="history" />
      <StatCard label="Avg Decisions" :value="avgDecisions" icon="psychology" />
      <StatCard label="Success Rate" value="98.2%" icon="check_circle" />
    </div>

    <!-- Session Cards -->
    <div class="space-y-4">
      <div
        v-for="(s, idx) in store.sessions"
        :key="s.id"
        :class="[
          'bg-bg-dark/40 rounded-xl overflow-hidden transition-all',
          expandedId === s.id ? 'neon-border' : 'cyber-border',
        ]"
      >
        <!-- Session Header -->
        <button
          @click="toggleExpand(s.id)"
          class="w-full p-6 flex items-start justify-between text-left hover:bg-primary/5 transition-colors"
        >
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-3 mb-2">
              <h3 class="text-lg font-bold text-white">Session #{{ s.id.slice(0, 8) }}</h3>
              <span :class="[
                'px-2.5 py-1 rounded-full text-[10px] font-bold border uppercase',
                idx === 0 ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30' : 'bg-slate-500/20 text-slate-400 border-slate-500/30'
              ]">{{ idx === 0 ? 'ACTIVE' : 'COMPLETED' }}</span>
            </div>
            <div class="flex items-center gap-4 text-xs text-slate-500 mb-2">
              <span class="flex items-center gap-1">
                <span class="material-symbols-outlined text-sm">calendar_today</span>
                {{ s.started_at?.split(' ')[0] }}
              </span>
              <span class="flex items-center gap-1">
                <span class="material-symbols-outlined text-sm">schedule</span>
                {{ s.started_at?.split(' ')[1]?.slice(0, 5) }}
              </span>
              <span class="flex items-center gap-1">
                <span class="material-symbols-outlined text-sm">psychology</span>
                {{ s.decision_count }} Decisions
              </span>
            </div>
            <p v-if="s.summary" class="text-sm text-slate-400 line-clamp-2">{{ s.summary }}</p>
          </div>
          <span class="material-symbols-outlined text-slate-500 transition-transform" :class="{ 'rotate-180': expandedId === s.id }">expand_more</span>
        </button>

        <!-- Expanded Decision Timeline -->
        <div v-if="expandedId === s.id" class="px-6 pb-6 border-t border-primary/10">
          <h4 class="text-xs font-bold text-primary uppercase tracking-wider mt-4 mb-4">Decision Timeline</h4>
          <div v-if="sessionDecisions[s.id]" class="space-y-0">
            <div
              v-for="(dec, di) in sessionDecisions[s.id]"
              :key="dec.id"
              class="flex gap-4"
            >
              <!-- Timeline dot + line -->
              <div class="flex flex-col items-center">
                <div class="w-3 h-3 rounded-full bg-primary shadow-[0_0_8px_rgba(13,242,242,0.4)] mt-1.5"></div>
                <div v-if="di < sessionDecisions[s.id].length - 1" class="w-0.5 flex-1 bg-primary/20 my-1"></div>
              </div>
              <!-- Content -->
              <router-link :to="`/decisions/${dec.id}`" class="pb-4 flex-1 group">
                <div class="flex items-center gap-2 mb-1">
                  <StatusBadge :status="dec.status" />
                  <span class="text-xs text-slate-500">{{ dec.created_at?.split(' ')[1]?.slice(0, 5) }}</span>
                </div>
                <h5 class="text-sm font-semibold text-white group-hover:text-primary transition-colors">{{ dec.title }}</h5>
                <div class="flex gap-1 mt-1">
                  <TagPill v-for="t in dec.tags?.slice(0, 3)" :key="t" :tag="t" />
                </div>
              </router-link>
            </div>
          </div>
          <div v-else class="text-sm text-slate-500 py-4">Loading decisions...</div>

          <router-link
            :to="`/sessions/${s.id}`"
            class="mt-2 text-xs text-primary hover:underline font-medium"
          >View full session details</router-link>
        </div>
      </div>
    </div>

    <div v-if="store.loading" class="text-center py-20 text-slate-400">Loading...</div>
    <div v-else-if="store.sessions.length === 0" class="text-center py-20">
      <span class="material-symbols-outlined text-5xl text-primary/30 mb-4">history</span>
      <h4 class="text-lg font-semibold text-slate-300">No sessions found</h4>
    </div>
  </div>
</template>
