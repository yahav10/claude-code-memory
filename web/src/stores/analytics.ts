import { defineStore } from 'pinia';
import { ref } from 'vue';
import { api } from '@/composables/useApi';

export const useAnalyticsStore = defineStore('analytics', () => {
  const quality = ref<any>(null);
  const patterns = ref<any>(null);
  const codebase = ref<any>(null);
  const coach = ref<any>(null);
  const loading = ref(false);
  const coachLoading = ref(false);
  const error = ref<string | null>(null);

  async function fetchAnalytics() {
    loading.value = true;
    error.value = null;
    try {
      const [q, p, c] = await Promise.all([
        api.getAnalyticsQuality(),
        api.getAnalyticsPatterns(),
        api.getAnalyticsCodebase(),
      ]);
      quality.value = q;
      patterns.value = p;
      codebase.value = c;
    } catch (e: any) {
      error.value = e.message;
    } finally {
      loading.value = false;
    }
  }

  async function fetchCoach() {
    coachLoading.value = true;
    try {
      coach.value = await api.getAnalyticsCoach();
    } catch (e: any) {
      error.value = e.message;
    } finally {
      coachLoading.value = false;
    }
  }

  return { quality, patterns, codebase, coach, loading, coachLoading, error, fetchAnalytics, fetchCoach };
});
