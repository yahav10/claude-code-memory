<script setup lang="ts">
import { onMounted, computed } from 'vue';
import { useAnalyticsStore } from '@/stores/analytics';
import VChart from 'vue-echarts';
import { use } from 'echarts/core';
import { BarChart } from 'echarts/charts';
import { GridComponent, TooltipComponent, LegendComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

use([BarChart, GridComponent, TooltipComponent, LegendComponent, CanvasRenderer]);

const store = useAnalyticsStore();
onMounted(() => store.fetchAnalytics());

// --- Decision Quality computed helpers ---

// SVG donut: strokeDasharray for a circle with r=16 (circumference ≈ 100.53)
function donutDash(pct: number) {
  const circ = 2 * Math.PI * 16; // ~100.53
  return `${(pct / 100) * circ}, ${circ}`;
}

// Consequence dots (5 dots, filled proportionally)
function consequenceDots(pct: number) {
  const filled = Math.round((pct / 100) * 5);
  return Array.from({ length: 5 }, (_, i) => i < filled);
}

// Rationale depth bar width as percentage (normalise: 0-200 chars → 0-100%)
function rationaleBarWidth(avgLen: number) {
  return Math.min(100, Math.round((avgLen / 200) * 100));
}

// --- Work Patterns chart options ---

const complexityOption = computed(() => {
  const density = store.patterns?.decisionDensity || [];
  if (density.length === 0) return null;

  return {
    tooltip: { trigger: 'axis', backgroundColor: '#102222', borderColor: 'rgba(13,242,242,0.2)', textStyle: { color: '#e2e8f0', fontSize: 11 } },
    grid: { left: 30, right: 10, top: 10, bottom: 30 },
    xAxis: {
      type: 'category',
      data: density.map(d => `${d.decisionCount}`),
      axisLine: { lineStyle: { color: '#1a3a3a' } },
      axisLabel: { color: '#64748b', fontSize: 10 },
    },
    yAxis: {
      type: 'value',
      axisLine: { show: false },
      splitLine: { lineStyle: { color: 'rgba(13,242,242,0.05)' } },
      axisLabel: { color: '#64748b', fontSize: 10 },
    },
    series: [{
      type: 'bar',
      data: density.map((d, i, arr) => ({
        value: d.sessions,
        itemStyle: {
          color: `rgba(13,242,242,${0.2 + (0.8 * (d.sessions / Math.max(...arr.map(x => x.sessions))))})`,
          borderRadius: [2, 2, 0, 0],
        },
      })),
      barWidth: '60%',
    }],
  };
});

const radarBars = computed(() => {
  const tags = store.codebase?.topTags || [];
  if (tags.length === 0) return [];
  const max = tags[0]?.count || 1;
  return tags.slice(0, 6).map(t => ({
    tag: t.tag,
    count: t.count,
    pct: Math.round((t.count / max) * 100),
  }));
});
</script>

<template>
  <div class="flex-1 overflow-y-auto p-6 lg:p-10">
    <div class="max-w-6xl mx-auto space-y-8">
      <!-- Header -->
      <div class="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 class="text-3xl font-black text-slate-100 tracking-tight">Developer Intelligence</h1>
          <p class="text-primary/60 font-medium">Actionable intelligence from your decision history</p>
        </div>
        <button disabled title="Coming soon" class="flex items-center gap-2 bg-primary/40 text-bg-dark/60 px-6 py-2.5 rounded-lg font-bold text-sm cursor-not-allowed">
          <span class="material-symbols-outlined text-[18px]">ios_share</span>
          Export Analysis
        </button>
      </div>

      <div v-if="store.loading" class="py-20 text-center text-slate-400">Loading analytics...</div>

      <template v-else-if="store.quality">
        <!-- 1. AI Coach Summary -->
        <section class="relative">
          <div class="absolute -inset-1 bg-gradient-to-r from-primary/20 to-blue-500/20 rounded-xl blur-lg opacity-50"></div>
          <div class="relative bg-bg-dark/60 border border-primary/30 rounded-xl p-6 backdrop-blur-sm overflow-hidden">
            <div class="absolute top-0 right-0 p-8 opacity-10">
              <span class="material-symbols-outlined text-8xl text-primary">psychology</span>
            </div>
            <div class="flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
              <div class="space-y-4 max-w-2xl">
                <div class="flex items-center gap-2">
                  <span class="material-symbols-outlined text-primary">auto_awesome</span>
                  <h2 class="text-lg font-bold text-slate-100 uppercase tracking-wider">AI Coach Summary</h2>
                </div>

                <!-- Coach insights (loaded) -->
                <template v-if="store.coach?.insights?.length > 0">
                  <p class="text-slate-300 leading-relaxed">Based on your last {{ store.quality.totalDecisions }} decisions, here are key patterns identified in your workflow:</p>
                  <ul class="space-y-3">
                    <li v-for="(insight, i) in store.coach.insights" :key="i" class="flex items-start gap-3">
                      <span class="mt-1 w-1.5 h-1.5 rounded-full bg-primary shadow-[0_0_5px_#0df2f2] flex-shrink-0"></span>
                      <span class="text-sm text-slate-400">{{ insight }}</span>
                    </li>
                  </ul>
                </template>

                <!-- Coach error -->
                <div v-else-if="store.coach?.error" class="text-sm text-red-400">
                  {{ store.coach.error }}
                  <p class="text-xs text-slate-500 mt-1">Make sure ANTHROPIC_API_KEY is set.</p>
                </div>

                <!-- Default state -->
                <p v-else-if="!store.coachLoading" class="text-sm text-slate-500">Click "Generate New Summary" to get AI-powered coaching insights from your decision patterns.</p>

                <!-- Loading state -->
                <div v-if="store.coachLoading" class="flex items-center gap-2 text-sm text-primary/60">
                  <span class="material-symbols-outlined animate-spin text-sm">progress_activity</span>
                  Analyzing your patterns...
                </div>
              </div>

              <button
                @click="store.fetchCoach()"
                :disabled="store.coachLoading"
                class="whitespace-nowrap bg-primary/10 border border-primary hover:bg-primary hover:text-bg-dark text-primary px-5 py-3 rounded-lg font-bold text-sm transition-all"
                :class="{ 'opacity-50 cursor-wait': store.coachLoading }"
              >
                {{ store.coachLoading ? 'Generating...' : store.coach ? 'Generate New Summary' : 'Generate New Summary' }}
              </button>
            </div>
          </div>
        </section>

        <!-- 2. Decision Quality Insights — 4 cards matching mock layout -->
        <section class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <!-- Alternatives Coverage — Donut -->
          <div class="bg-bg-dark/40 border border-primary/10 p-5 rounded-xl flex flex-col items-center text-center">
            <div class="text-[10px] font-bold text-primary/50 uppercase tracking-widest mb-4">Alternatives Coverage</div>
            <div class="relative w-24 h-24 mb-4">
              <svg class="w-full h-full -rotate-90" viewBox="0 0 36 36">
                <circle class="stroke-primary/10" cx="18" cy="18" fill="none" r="16" stroke-width="3" />
                <circle class="stroke-primary" cx="18" cy="18" fill="none" r="16"
                  :stroke-dasharray="donutDash(store.quality.alternativesCoverage)"
                  stroke-linecap="round" stroke-width="3" />
              </svg>
              <div class="absolute inset-0 flex items-center justify-center font-bold text-xl text-slate-100">{{ store.quality.alternativesCoverage }}%</div>
            </div>
            <p class="text-xs text-slate-500">of decisions document alternatives</p>
          </div>

          <!-- Rationale Depth — Large number + bar -->
          <div class="bg-bg-dark/40 border border-primary/10 p-5 rounded-xl flex flex-col items-center text-center">
            <div class="text-[10px] font-bold text-primary/50 uppercase tracking-widest mb-4">Rationale Depth</div>
            <div class="text-3xl font-black text-primary mb-1">{{ store.quality.avgRationaleLength }}</div>
            <div class="text-[10px] text-slate-400 mb-4">Avg Chars / Decision</div>
            <div class="w-full bg-primary/10 h-1.5 rounded-full overflow-hidden">
              <div class="bg-primary h-full transition-all" :style="{ width: rationaleBarWidth(store.quality.avgRationaleLength) + '%' }"></div>
            </div>
          </div>

          <!-- Consequences Tracking — Number + dots -->
          <div class="bg-bg-dark/40 border border-primary/10 p-5 rounded-xl flex flex-col items-center text-center">
            <div class="text-[10px] font-bold text-primary/50 uppercase tracking-widest mb-4">Consequences Tracking</div>
            <div class="text-3xl font-black text-primary mb-1">{{ store.quality.consequencesTracking }}%</div>
            <div class="text-[10px] text-slate-400 mb-4">Tagged with Outcome</div>
            <div class="flex gap-1">
              <div v-for="(filled, i) in consequenceDots(store.quality.consequencesTracking)" :key="i"
                class="w-3 h-3 rounded-full" :class="filled ? 'bg-primary' : 'bg-primary/20'"></div>
            </div>
          </div>

          <!-- Decision Revisit Rate — Number + icon -->
          <div class="bg-bg-dark/40 border border-primary/10 p-5 rounded-xl flex flex-col items-center text-center">
            <div class="text-[10px] font-bold text-primary/50 uppercase tracking-widest mb-4">Decision Revisit Rate</div>
            <div class="text-3xl font-black text-primary mb-1">{{ store.quality.revisitRate }}%</div>
            <div class="text-[10px] text-slate-400 mb-4">Stability Index</div>
            <span class="material-symbols-outlined text-primary/60 text-4xl">
              {{ store.quality.revisitRate <= 20 ? 'trending_down' : store.quality.revisitRate <= 50 ? 'trending_flat' : 'trending_up' }}
            </span>
          </div>
        </section>

        <!-- 3. Work Patterns — Session Complexity + Technology Radar -->
        <section class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <!-- Session Complexity Trend (bar chart via ECharts) -->
          <div class="bg-bg-dark/40 border border-primary/10 p-6 rounded-xl">
            <div class="flex justify-between items-center mb-6">
              <h3 class="text-sm font-bold text-slate-100">Session Complexity Trend</h3>
              <span class="text-[10px] font-bold text-primary px-2 py-0.5 border border-primary/30 rounded">DECISIONS / SESSION</span>
            </div>
            <v-chart v-if="complexityOption" :option="complexityOption" autoresize style="height: 200px" />
            <div v-else class="h-48 flex items-center justify-center text-xs text-slate-500">No session data yet</div>
          </div>

          <!-- Technology Radar (horizontal bars, matching mock) -->
          <div class="bg-bg-dark/40 border border-primary/10 p-6 rounded-xl">
            <h3 class="text-sm font-bold text-slate-100 mb-6">Technology Radar</h3>
            <div v-if="radarBars.length > 0" class="space-y-4">
              <div v-for="bar in radarBars" :key="bar.tag" class="flex items-center gap-4">
                <span class="text-xs font-medium w-20 text-slate-400 truncate capitalize">{{ bar.tag }}</span>
                <div class="flex-1 bg-primary/10 h-2 rounded-full overflow-hidden">
                  <div class="h-full rounded-full transition-all"
                    :class="bar.pct >= 70 ? 'bg-primary shadow-[0_0_8px_#0df2f2]' : bar.pct >= 40 ? 'bg-primary/60' : 'bg-primary/30'"
                    :style="{ width: bar.pct + '%' }"></div>
                </div>
                <span class="text-xs font-bold w-8 text-right"
                  :class="bar.pct >= 70 ? 'text-primary' : bar.pct >= 40 ? 'text-primary/60' : 'text-primary/30'">{{ bar.count }}</span>
              </div>
            </div>
            <div v-else class="h-48 flex items-center justify-center text-xs text-slate-500">No tag data yet</div>
          </div>
        </section>

        <!-- 4. Codebase Knowledge — 3-column grid matching mock -->
        <section class="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <!-- Architecture Hotspots -->
          <div class="bg-bg-dark/40 border border-primary/10 p-6 rounded-xl">
            <h3 class="text-sm font-bold text-slate-100 mb-6 flex items-center gap-2">
              <span class="material-symbols-outlined text-primary text-sm">local_fire_department</span>
              Architecture Hotspots
            </h3>
            <div v-if="store.codebase?.hotspots?.length > 0" class="space-y-4">
              <div v-for="h in store.codebase.hotspots.slice(0, 5)" :key="h.filePath"
                class="flex items-center justify-between">
                <div class="flex flex-col min-w-0">
                  <span class="text-xs font-medium text-slate-200 truncate">{{ h.filePath }}</span>
                </div>
                <span class="text-xs font-bold text-primary bg-primary/10 px-2 py-1 rounded flex-shrink-0 ml-2">
                  {{ h.decisionCount }} Decisions
                </span>
              </div>
            </div>
            <p v-else class="text-xs text-slate-500 py-6 text-center">No file data yet</p>
          </div>

          <!-- Undocumented Zones (sessions with 0 decisions) -->
          <div class="bg-bg-dark/40 border border-primary/10 p-6 rounded-xl">
            <h3 class="text-sm font-bold text-slate-100 mb-6 flex items-center gap-2">
              <span class="material-symbols-outlined text-primary text-sm">visibility_off</span>
              Undocumented Zones
            </h3>
            <div v-if="store.patterns?.zeroDecisionSessions > 0" class="space-y-3">
              <div class="p-3 bg-red-500/5 border border-red-500/20 rounded-lg">
                <p class="text-[10px] font-bold text-red-400 mb-1 uppercase">Sessions Without Decisions</p>
                <p class="text-xs text-slate-300 font-medium">{{ store.patterns.zeroDecisionSessions }} sessions had no architectural decisions extracted</p>
              </div>
              <div class="p-3 bg-primary/5 border border-primary/10 rounded-lg">
                <p class="text-[10px] font-bold text-primary/50 mb-1 uppercase">Coverage Rate</p>
                <p class="text-xs text-slate-300 font-medium">
                  {{ Math.round(((store.patterns.totalSessions - store.patterns.zeroDecisionSessions) / Math.max(1, store.patterns.totalSessions)) * 100) }}% of sessions produced decisions
                </p>
              </div>
            </div>
            <div v-else class="p-3 bg-emerald-500/5 border border-emerald-500/20 rounded-lg">
              <p class="text-xs text-emerald-400">All sessions have documented decisions</p>
            </div>
          </div>

          <!-- Cross-Cutting Tags -->
          <div class="bg-bg-dark/40 border border-primary/10 p-6 rounded-xl">
            <h3 class="text-sm font-bold text-slate-100 mb-6 flex items-center gap-2">
              <span class="material-symbols-outlined text-primary text-sm">tag</span>
              Cross-Cutting Tags
            </h3>
            <div v-if="store.codebase?.topTags?.length > 0" class="flex flex-wrap gap-2">
              <span v-for="(t, i) in store.codebase.topTags.slice(0, 12)" :key="t.tag"
                class="px-3 py-1.5 text-[10px] font-bold rounded-full uppercase"
                :class="i === 0
                  ? 'bg-primary text-bg-dark shadow-[0_0_10px_rgba(13,242,242,0.4)]'
                  : 'bg-primary/20 text-primary border border-primary/30'">
                {{ t.tag }}
              </span>
            </div>
            <p v-else class="text-xs text-slate-500 py-6 text-center">No tags yet</p>
            <div v-if="store.codebase?.topTags?.length > 0" class="mt-6 flex items-center gap-3">
              <div class="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                <span class="material-symbols-outlined text-sm">lightbulb</span>
              </div>
              <p class="text-[11px] text-slate-400">"{{ store.codebase.topTags[0]?.tag }}" appears in {{ store.codebase.topTags[0]?.count }} decisions</p>
            </div>
          </div>
        </section>
      </template>

      <!-- Error state -->
      <div v-else-if="store.error" class="py-20 text-center">
        <span class="material-symbols-outlined text-5xl text-red-400/50 mb-4">error</span>
        <p class="text-slate-400">{{ store.error }}</p>
      </div>
    </div>
  </div>
</template>
