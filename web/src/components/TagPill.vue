<script setup lang="ts">
defineProps<{ tag: string }>();
</script>

<template>
  <span class="px-2 py-0.5 rounded text-[10px] font-bold bg-primary/10 text-primary uppercase">
    #{{ tag }}
  </span>
</template>
