import { defineStore } from 'pinia';
import { ref } from 'vue';
import { api } from '@/composables/useApi';

export const useImportStore = defineStore('import', () => {
  const scanning = ref(false);
  const importing = ref(false);
  const scanResult = ref<any>(null);
  const importResult = ref<any>(null);
  const error = ref<string | null>(null);

  async function scan() {
    scanning.value = true;
    error.value = null;
    try {
      scanResult.value = await api.scanSessions();
    } catch (e: any) {
      error.value = e.message;
    } finally {
      scanning.value = false;
    }
  }

  async function runImport(opts?: { skipExtraction?: boolean }) {
    importing.value = true;
    error.value = null;
    try {
      importResult.value = await api.runImport(opts);
    } catch (e: any) {
      error.value = e.message;
    } finally {
      importing.value = false;
    }
  }

  function reset() {
    scanResult.value = null;
    importResult.value = null;
    error.value = null;
  }

  return { scanning, importing, scanResult, importResult, error, scan, runImport, reset };
});
