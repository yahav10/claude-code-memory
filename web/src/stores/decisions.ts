import { defineStore } from 'pinia';
import { ref } from 'vue';
import { api } from '@/composables/useApi';

export const useDecisionsStore = defineStore('decisions', () => {
  const decisions = ref<any[]>([]);
  const total = ref(0);
  const detail = ref<any>(null);
  const loading = ref(false);
  const error = ref<string | null>(null);

  async function fetchDecisions(params: Record<string, string>) {
    loading.value = true;
    error.value = null;
    try {
      const result = await api.getDecisions(params);
      decisions.value = result.decisions;
      total.value = result.total;
    } catch (e: any) {
      error.value = e.message;
    } finally {
      loading.value = false;
    }
  }

  async function fetchDecisionDetail(id: number) {
    loading.value = true;
    error.value = null;
    try {
      detail.value = await api.getDecision(id);
    } catch (e: any) {
      error.value = e.message;
    } finally {
      loading.value = false;
    }
  }

  async function updateDecisionStatus(id: number, status: string) {
    await api.updateDecision(id, { status });
  }

  return { decisions, total, detail, loading, error, fetchDecisions, fetchDecisionDetail, updateDecisionStatus };
});
