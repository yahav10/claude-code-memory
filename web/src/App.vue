<script setup lang="ts">
import AppSidebar from './components/AppSidebar.vue';
</script>

<template>
  <div class="flex h-screen overflow-hidden">
    <AppSidebar />
    <main class="flex-1 overflow-y-auto">
      <router-view />
    </main>
  </div>
</template>
