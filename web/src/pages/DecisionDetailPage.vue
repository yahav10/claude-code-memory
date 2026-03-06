<script setup lang="ts">
import { onMounted, computed } from 'vue';
import { useRoute } from 'vue-router';
import { useDecisionsStore } from '@/stores/decisions';
import StatusBadge from '@/components/StatusBadge.vue';
import TagPill from '@/components/TagPill.vue';

const route = useRoute();
const store = useDecisionsStore();

const id = computed(() => Number(route.params.id));

onMounted(() => store.fetchDecisionDetail(id.value));

const d = computed(() => store.detail);
</script>

<template>
  <div class="p-8" v-if="d">
    <!-- Breadcrumb -->
    <nav class="flex items-center gap-2 text-sm mb-6">
      <router-link to="/decisions" class="text-slate-400 hover:text-primary transition-colors">Decisions</router-link>
      <span class="text-slate-600">&gt;</span>
      <span class="text-primary font-medium">ADR-{{ String(d.id).padStart(4, '0') }}</span>
    </nav>

    <!-- Hero -->
    <div class="mb-8">
      <div class="flex items-center gap-4 mb-4">
        <StatusBadge :status="d.status" />
        <span class="text-xs text-slate-500">{{ d.created_at }}</span>
        <router-link v-if="d.session_id" :to="`/sessions/${d.session_id}`" class="text-xs text-primary hover:underline">
          Session Link
        </router-link>
      </div>
      <h1 class="text-3xl font-extrabold text-white uppercase tracking-tight mb-3">{{ d.title }}</h1>
      <p class="text-slate-400">{{ d.decision }}</p>
      <div class="flex gap-2 mt-4">
        <TagPill v-for="t in d.tags" :key="t" :tag="t" />
      </div>
    </div>

    <!-- Two Column Layout -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
      <!-- Left Column -->
      <div class="lg:col-span-2 space-y-8">
        <!-- Context -->
        <div v-if="d.context" class="bg-bg-dark/40 rounded-xl cyber-border p-6">
          <h3 class="text-primary font-bold text-sm uppercase tracking-wider mb-4">Context</h3>
          <p class="text-slate-300 text-sm leading-relaxed">{{ d.context }}</p>
        </div>

        <!-- Decision Highlight -->
        <div class="bg-bg-dark/40 rounded-xl neon-border p-6">
          <h3 class="text-primary font-bold text-sm uppercase tracking-wider mb-4">Decision</h3>
          <p class="text-white text-base font-medium leading-relaxed">{{ d.decision }}</p>
        </div>

        <!-- Rationale -->
        <div class="bg-bg-dark/40 rounded-xl cyber-border p-6">
          <h3 class="text-primary font-bold text-sm uppercase tracking-wider mb-4">Rationale</h3>
          <p class="text-slate-300 text-sm leading-relaxed">{{ d.rationale }}</p>
        </div>

        <!-- Alternatives -->
        <div v-if="d.alternatives && d.alternatives.length > 0" class="bg-bg-dark/40 rounded-xl cyber-border p-6">
          <h3 class="text-primary font-bold text-sm uppercase tracking-wider mb-4">Alternatives Considered</h3>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div
              v-for="(alt, i) in d.alternatives"
              :key="i"
              class="bg-bg-dark/60 rounded-lg p-4 cyber-border"
            >
              <p class="text-slate-300 text-sm">{{ alt }}</p>
            </div>
          </div>
        </div>
      </div>

      <!-- Right Sidebar -->
      <div class="space-y-6">
        <!-- Consequences -->
        <div v-if="d.consequences" class="bg-bg-dark/40 rounded-xl cyber-border p-6">
          <h3 class="text-primary font-bold text-sm uppercase tracking-wider mb-4">Consequences</h3>
          <p class="text-slate-300 text-sm leading-relaxed">{{ d.consequences }}</p>
        </div>

        <!-- Affected Files -->
        <div v-if="d.files && d.files.length > 0" class="bg-bg-dark/40 rounded-xl cyber-border p-6">
          <h3 class="text-primary font-bold text-sm uppercase tracking-wider mb-4">Affected Files</h3>
          <div class="space-y-2">
            <div
              v-for="f in d.files"
              :key="f"
              class="flex items-center gap-2 text-sm text-slate-300 bg-bg-dark/60 rounded-lg px-3 py-2 cyber-border"
            >
              <span class="material-symbols-outlined text-primary text-base">description</span>
              <span class="font-mono text-xs truncate">{{ f }}</span>
            </div>
          </div>
        </div>

        <!-- Metadata -->
        <div class="bg-bg-dark/40 rounded-xl cyber-border p-6">
          <h3 class="text-primary font-bold text-sm uppercase tracking-wider mb-4">Metadata</h3>
          <dl class="space-y-3 text-sm">
            <div class="flex justify-between">
              <dt class="text-slate-500">ID</dt>
              <dd class="text-slate-300 font-mono">{{ d.id }}</dd>
            </div>
            <div class="flex justify-between">
              <dt class="text-slate-500">Created</dt>
              <dd class="text-slate-300">{{ d.created_at }}</dd>
            </div>
            <div v-if="d.created_by" class="flex justify-between">
              <dt class="text-slate-500">Author</dt>
              <dd class="text-slate-300">{{ d.created_by }}</dd>
            </div>
            <div v-if="d.session_id" class="flex justify-between">
              <dt class="text-slate-500">Session</dt>
              <dd class="text-primary font-mono text-xs">{{ d.session_id.slice(0, 12) }}</dd>
            </div>
            <div v-if="d.superseded_by" class="flex justify-between">
              <dt class="text-slate-500">Superseded by</dt>
              <dd>
                <router-link :to="`/decisions/${d.superseded_by}`" class="text-primary hover:underline">ADR-{{ String(d.superseded_by).padStart(4, '0') }}</router-link>
              </dd>
            </div>
          </dl>
        </div>
      </div>
    </div>
  </div>

  <div v-else-if="store.loading" class="p-8 text-center py-20 text-slate-400">Loading...</div>
  <div v-else class="p-8 text-center py-20">
    <span class="material-symbols-outlined text-5xl text-primary/30 mb-4">error</span>
    <h3 class="text-lg text-slate-300">Decision not found</h3>
  </div>
</template>
