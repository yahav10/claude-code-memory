<script setup lang="ts">
defineProps<{ label: string; value: string | number; icon?: string; delta?: string }>();
</script>

<template>
  <div class="bg-bg-dark/40 p-5 rounded-xl cyber-border neon-glow">
    <p class="text-xs font-medium text-slate-400 uppercase tracking-widest mb-1">{{ label }}</p>
    <div class="flex items-end justify-between">
      <h3 class="text-3xl font-bold text-white">{{ value }}</h3>
      <span v-if="delta" class="text-emerald-500 text-xs font-bold mb-1">{{ delta }}</span>
      <span v-else-if="icon" class="material-symbols-outlined text-primary">{{ icon }}</span>
    </div>
  </div>
</template>
