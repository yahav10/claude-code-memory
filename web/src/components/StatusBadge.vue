<script setup lang="ts">
defineProps<{ status: string }>();
const colors: Record<string, string> = {
  active: 'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  deprecated: 'bg-red-500/20 text-red-400 border-red-500/30',
  superseded: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
};
</script>

<template>
  <span :class="['px-2.5 py-1 rounded-full text-[10px] font-bold border uppercase', colors[status] || colors.active]">
    {{ status }}
  </span>
</template>
