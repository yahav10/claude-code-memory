import { defineStore } from 'pinia';
import { ref } from 'vue';
import { api } from '@/composables/useApi';

export const useSettingsStore = defineStore('settings', () => {
  const dbInfo = ref<any>(null);
  const loading = ref(false);

  async function fetchDatabaseInfo() {
    loading.value = true;
    try { dbInfo.value = await api.getDatabaseInfo(); }
    finally { loading.value = false; }
  }

  async function vacuum() { await api.vacuum(); await fetchDatabaseInfo(); }
  async function rebuildFts() { await api.rebuildFts(); }

  return { dbInfo, loading, fetchDatabaseInfo, vacuum, rebuildFts };
});
