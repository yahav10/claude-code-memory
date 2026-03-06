import { defineStore } from 'pinia';
import { ref } from 'vue';
import { api } from '@/composables/useApi';

export const useSessionsStore = defineStore('sessions', () => {
  const sessions = ref<any[]>([]);
  const total = ref(0);
  const detail = ref<any>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);

  async function fetchSessions(params: Record<string, string>) {
    loading.value = true;
    try {
      const result = await api.getSessions(params);
      sessions.value = result.sessions;
      total.value = result.total;
    } catch (e: any) {
      error.value = e.message;
    } finally {
      loading.value = false;
    }
  }

  async function fetchSessionDetail(id: string) {
    loading.value = true;
    try {
      detail.value = await api.getSession(id);
    } catch (e: any) {
      error.value = e.message;
    } finally {
      loading.value = false;
    }
  }

  return { sessions, total, detail, loading, error, fetchSessions, fetchSessionDetail };
});
