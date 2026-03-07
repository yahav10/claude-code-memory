import { defineStore } from 'pinia';
import { ref } from 'vue';
import { api } from '@/composables/useApi';

export const useSettingsStore = defineStore('settings', () => {
  const dbInfo = ref<any>(null);
  const apiKeyStatus = ref<any>(null);
  const loading = ref(false);

  async function fetchDatabaseInfo() {
    loading.value = true;
    try { dbInfo.value = await api.getDatabaseInfo(); }
    finally { loading.value = false; }
  }

  async function fetchApiKeyStatus() {
    apiKeyStatus.value = await api.getApiKeyStatus();
  }

  async function saveApiKey(key: string) {
    apiKeyStatus.value = await api.saveApiKey(key);
  }

  async function removeApiKey() {
    apiKeyStatus.value = await api.removeApiKey();
  }

  async function vacuum() { await api.vacuum(); await fetchDatabaseInfo(); }
  async function rebuildFts() { await api.rebuildFts(); }

  return { dbInfo, apiKeyStatus, loading, fetchDatabaseInfo, fetchApiKeyStatus, saveApiKey, removeApiKey, vacuum, rebuildFts };
});
