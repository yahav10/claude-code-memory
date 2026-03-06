<script setup lang="ts">
import { onMounted } from 'vue';
import { useDashboardStore } from '@/stores/dashboard';
import StatCard from '@/components/StatCard.vue';
import StatusBadge from '@/components/StatusBadge.vue';
import TagPill from '@/components/TagPill.vue';
import ActivityChart from '@/components/ActivityChart.vue';

const store = useDashboardStore();
onMounted(() => store.fetchDashboard());
</script>

<template>
  <div class="p-8">
    <!-- Header -->
    <header class="flex justify-between items-center mb-8">
      <div>
        <h2 class="text-2xl font-bold text-white tracking-tight">System Overview</h2>
        <p class="text-slate-400 text-sm">Your context memory is synchronized.</p>
      </div>
    </header>

    <template v-if="store.stats">
      <!-- Stats Row -->
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <StatCard label="Total Decisions" :value="store.stats.totalDecisions" icon="analytics" />
        <StatCard label="Active" :value="store.stats.activeDecisions" icon="check_circle" />
        <StatCard label="Sessions" :value="store.stats.totalSessions" icon="terminal" />
        <StatCard label="Last Activity" :value="store.stats.lastActivity ? 'Recent' : 'Never'" icon="schedule" />
      </div>

      <!-- Middle Row -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-8">
        <div class="lg:col-span-2 bg-bg-dark/40 rounded-xl cyber-border p-6">
          <div class="flex justify-between items-center mb-4">
            <h3 class="font-bold text-lg text-white">Activity Timeline</h3>
            <span class="text-xs text-slate-500">Last 7 Days</span>
          </div>
          <ActivityChart :data="store.timeline" />
        </div>
        <div class="bg-bg-dark/40 rounded-xl cyber-border p-6">
          <h3 class="font-bold text-lg text-white mb-6">Quick Actions</h3>
          <div class="space-y-4">
            <router-link to="/import-export" class="w-full bg-primary hover:bg-primary/90 text-bg-dark font-bold py-3 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors">
              <span class="material-symbols-outlined">download</span> Export Context
            </router-link>
            <router-link to="/import-export" class="w-full bg-primary/10 hover:bg-primary/20 text-primary border border-primary/30 font-bold py-3 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors">
              <span class="material-symbols-outlined">upload</span> Import Memory
            </router-link>
          </div>
        </div>
      </div>

      <!-- Bottom Row -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <!-- Recent Decisions -->
        <div class="lg:col-span-2 bg-bg-dark/40 rounded-xl cyber-border overflow-hidden">
          <div class="p-6 border-b border-primary/10 flex justify-between items-center">
            <h3 class="font-bold text-lg text-white">Recent Decisions</h3>
            <router-link to="/decisions" class="text-xs text-primary hover:underline font-medium">View all</router-link>
          </div>
          <div class="divide-y divide-primary/10">
            <router-link
              v-for="d in store.stats.recentDecisions"
              :key="d.id"
              :to="`/decisions/${d.id}`"
              class="p-4 hover:bg-primary/5 transition-colors flex items-center justify-between"
            >
              <div class="flex items-center gap-4">
                <div class="p-2 rounded bg-bg-dark/60 text-primary cyber-border">
                  <span class="material-symbols-outlined">psychology</span>
                </div>
                <div>
                  <h4 class="text-sm font-semibold text-white">{{ d.title }}</h4>
                  <div class="flex gap-2 mt-1">
                    <TagPill v-for="t in d.tags.slice(0, 2)" :key="t" :tag="t" />
                  </div>
                </div>
              </div>
              <StatusBadge :status="d.status" />
            </router-link>
          </div>
        </div>

        <!-- Top Tags -->
        <div class="bg-bg-dark/40 rounded-xl cyber-border p-6">
          <h3 class="font-bold text-lg text-white mb-6">Top Context Tags</h3>
          <div class="space-y-6">
            <div v-for="t in store.stats.topTags" :key="t.tag">
              <div class="flex justify-between items-center mb-2">
                <span class="text-sm font-medium text-slate-300">#{{ t.tag }}</span>
                <span class="text-sm text-primary font-bold">{{ t.count }}</span>
              </div>
              <div class="w-full bg-slate-800 h-2 rounded-full overflow-hidden">
                <div
                  class="bg-primary h-full rounded-full shadow-[0_0_8px_rgba(13,242,242,0.6)]"
                  :style="{ width: `${(t.count / (store.stats.topTags[0]?.count || 1)) * 100}%` }"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>

    <div v-else-if="store.loading" class="text-center py-20 text-slate-400">Loading...</div>
  </div>
</template>
