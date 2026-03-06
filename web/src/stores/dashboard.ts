import { defineStore } from 'pinia';
import { ref } from 'vue';
import { api } from '@/composables/useApi';

export const useDashboardStore = defineStore('dashboard', () => {
  const stats = ref<any>(null);
  const timeline = ref<any[]>([]);
  const loading = ref(false);
  const error = ref<string | null>(null);

  async function fetchDashboard() {
    loading.value = true;
    error.value = null;
    try {
      const [s, t] = await Promise.all([api.getDashboard(), api.getTimeline()]);
      stats.value = s;
      timeline.value = t;
    } catch (e: any) {
      error.value = e.message;
    } finally {
      loading.value = false;
    }
  }

  return { stats, timeline, loading, error, fetchDashboard };
});
