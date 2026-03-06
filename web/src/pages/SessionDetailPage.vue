<script setup lang="ts">
import { onMounted, computed } from 'vue';
import { useRoute } from 'vue-router';
import { useSessionsStore } from '@/stores/sessions';
import StatCard from '@/components/StatCard.vue';
import StatusBadge from '@/components/StatusBadge.vue';
import TagPill from '@/components/TagPill.vue';

const route = useRoute();
const store = useSessionsStore();

const sessionId = computed(() => route.params.id as string);

onMounted(() => store.fetchSessionDetail(sessionId.value));

const s = computed(() => store.detail);
</script>

<template>
  <div class="p-8" v-if="s">
    <!-- Breadcrumb -->
    <nav class="flex items-center gap-2 text-sm mb-6">
      <router-link to="/sessions" class="text-slate-400 hover:text-primary transition-colors">Sessions</router-link>
      <span class="text-slate-600">&gt;</span>
      <span class="text-primary font-medium">#{{ s.id.slice(0, 8) }}</span>
    </nav>

    <!-- Header -->
    <header class="mb-8">
      <h2 class="text-2xl font-bold text-white tracking-tight mb-2">Session #{{ s.id.slice(0, 8) }}</h2>
      <div class="flex items-center gap-4 text-sm text-slate-400">
        <span>Started: {{ s.started_at }}</span>
        <span v-if="s.ended_at">Ended: {{ s.ended_at }}</span>
      </div>
      <p v-if="s.summary" class="text-slate-400 mt-3">{{ s.summary }}</p>
    </header>

    <!-- Stats -->
    <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
      <StatCard label="Decisions Made" :value="s.decision_count" icon="psychology" />
      <StatCard label="Duration" value="—" icon="schedule" />
      <StatCard label="Status" value="Complete" icon="check_circle" />
    </div>

    <!-- Decision Timeline -->
    <div class="bg-bg-dark/40 rounded-xl cyber-border p-6">
      <h3 class="font-bold text-lg text-white mb-6">Decision Timeline</h3>
      <div class="space-y-0">
        <div
          v-for="(dec, di) in s.decisions"
          :key="dec.id"
          class="flex gap-4"
        >
          <div class="flex flex-col items-center">
            <div class="w-3 h-3 rounded-full bg-primary shadow-[0_0_8px_rgba(13,242,242,0.4)] mt-1.5"></div>
            <div v-if="di < s.decisions.length - 1" class="w-0.5 flex-1 bg-primary/20 my-1"></div>
          </div>
          <router-link :to="`/decisions/${dec.id}`" class="pb-6 flex-1 group">
            <div class="flex items-center gap-3 mb-1">
              <StatusBadge :status="dec.status" />
              <span class="text-xs text-slate-500">{{ dec.created_at }}</span>
            </div>
            <h4 class="text-sm font-semibold text-white group-hover:text-primary transition-colors">{{ dec.title }}</h4>
            <div class="flex gap-1 mt-2">
              <TagPill v-for="t in dec.tags" :key="t" :tag="t" />
            </div>
          </router-link>
        </div>
      </div>
    </div>
  </div>

  <div v-else-if="store.loading" class="p-8 text-center py-20 text-slate-400">Loading...</div>
  <div v-else class="p-8 text-center py-20">
    <span class="material-symbols-outlined text-5xl text-primary/30 mb-4">error</span>
    <h3 class="text-lg text-slate-300">Session not found</h3>
  </div>
</template>
