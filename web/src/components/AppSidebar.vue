<script setup lang="ts">
import { useRoute } from 'vue-router';
const route = useRoute();

const navItems = [
  { path: '/', label: 'Dashboard', icon: 'dashboard' },
  { path: '/decisions', label: 'Decisions', icon: 'psychology' },
  { path: '/sessions', label: 'Sessions', icon: 'history' },
  { path: '/import-export', label: 'Import/Export', icon: 'swap_horiz' },
  { path: '/settings', label: 'Settings', icon: 'settings' },
];

function isActive(path: string) {
  if (path === '/') return route.path === '/';
  return route.path.startsWith(path);
}
</script>

<template>
  <aside class="w-64 border-r border-primary/20 flex flex-col bg-bg-dark/50 backdrop-blur-md sticky top-0 h-screen">
    <div class="p-6 flex items-center gap-3">
      <div class="w-10 h-10 rounded-lg bg-primary/20 flex items-center justify-center border border-primary/40">
        <span class="material-symbols-outlined text-primary text-2xl">memory</span>
      </div>
      <div>
        <h1 class="text-sm font-bold tracking-tight text-white uppercase">Claude Code</h1>
        <p class="text-[10px] text-primary font-medium tracking-widest uppercase opacity-70">Memory Engine</p>
      </div>
    </div>

    <nav class="flex-1 px-4 space-y-1 mt-4">
      <router-link
        v-for="item in navItems"
        :key="item.path"
        :to="item.path"
        :class="[
          'flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all',
          isActive(item.path)
            ? 'bg-primary text-bg-dark font-semibold'
            : 'text-slate-400 hover:bg-primary/10 hover:text-primary'
        ]"
      >
        <span class="material-symbols-outlined text-[20px]">{{ item.icon }}</span>
        <span class="text-sm">{{ item.label }}</span>
      </router-link>
    </nav>

    <div class="p-4 border-t border-primary/10">
      <div class="bg-primary/5 rounded-xl p-4 cyber-border">
        <p class="text-[11px] text-slate-400 mb-2 uppercase tracking-tighter">System Status</p>
        <div class="flex items-center gap-2">
          <div class="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.6)]"></div>
          <span class="text-xs font-medium text-slate-200">Memory Active</span>
        </div>
      </div>
    </div>
  </aside>
</template>
