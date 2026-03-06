<script setup lang="ts">
import { ref } from 'vue';
import { api } from '@/composables/useApi';

const selectedFormat = ref('json');
const exporting = ref(false);
const importFile = ref<File | null>(null);
const dragOver = ref(false);

const formats = [
  { id: 'json', label: 'JSON', icon: 'data_object', desc: 'Full structured export' },
  { id: 'markdown', label: 'MD', icon: 'description', desc: 'Human-readable format' },
  { id: 'csv', label: 'CSV', icon: 'table_chart', desc: 'Spreadsheet compatible' },
];

async function doExport() {
  exporting.value = true;
  try {
    const data = await api.exportData(selectedFormat.value);
    let blob: Blob;
    let filename: string;

    if (selectedFormat.value === 'json') {
      blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      filename = 'memory-export.json';
    } else if (selectedFormat.value === 'csv') {
      blob = new Blob([data], { type: 'text/csv' });
      filename = 'memory-export.csv';
    } else {
      blob = new Blob([data], { type: 'text/markdown' });
      filename = 'memory-export.md';
    }

    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  } finally {
    exporting.value = false;
  }
}

function onDrop(e: DragEvent) {
  dragOver.value = false;
  const files = e.dataTransfer?.files;
  if (files && files.length > 0) importFile.value = files[0];
}

function onFileSelect(e: Event) {
  const input = e.target as HTMLInputElement;
  if (input.files && input.files.length > 0) importFile.value = input.files[0];
}
</script>

<template>
  <div class="p-8">
    <header class="mb-8">
      <h2 class="text-2xl font-extrabold text-white tracking-tight">Data Portability</h2>
      <p class="text-slate-400 text-sm mt-1">Migrate and extract your datasets with cryptographic integrity.</p>
    </header>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
      <!-- Export -->
      <div class="bg-bg-dark/40 rounded-xl cyber-border p-6">
        <h3 class="font-bold text-lg text-white mb-6">Export Dataset</h3>

        <!-- Format Selection -->
        <p class="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Output Format</p>
        <div class="grid grid-cols-3 gap-3 mb-6">
          <button
            v-for="f in formats"
            :key="f.id"
            @click="selectedFormat = f.id"
            :class="[
              'p-4 rounded-lg text-center transition-all',
              selectedFormat === f.id
                ? 'neon-border bg-primary/10'
                : 'cyber-border bg-bg-dark/60 hover:bg-primary/5'
            ]"
          >
            <span class="material-symbols-outlined text-2xl mb-1" :class="selectedFormat === f.id ? 'text-primary' : 'text-slate-400'">{{ f.icon }}</span>
            <p class="text-sm font-bold" :class="selectedFormat === f.id ? 'text-primary' : 'text-slate-300'">{{ f.label }}</p>
          </button>
        </div>

        <!-- Schema Preview -->
        <p class="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Schema Preview</p>
        <div class="bg-bg-dark rounded-lg p-4 cyber-border mb-6 font-mono text-xs text-slate-400 overflow-auto max-h-40">
          <pre v-if="selectedFormat === 'json'">{
  "version": "1.0",
  "exported_at": "...",
  "decisions": [...],
  "sessions": [...]
}</pre>
          <pre v-else-if="selectedFormat === 'csv'">id,title,decision,rationale,status,tags,created_at</pre>
          <pre v-else># Architectural Decisions Export
## Decision Title
**Status:** active | **Date:** ...</pre>
        </div>

        <button
          @click="doExport"
          :disabled="exporting"
          class="w-full bg-primary hover:bg-primary/90 text-bg-dark font-bold py-3.5 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors disabled:opacity-50"
        >
          <span class="material-symbols-outlined">download</span>
          {{ exporting ? 'Exporting...' : 'Initiate Export' }}
        </button>
      </div>

      <!-- Import -->
      <div class="bg-bg-dark/40 rounded-xl cyber-border p-6">
        <h3 class="font-bold text-lg text-white mb-6">Import Dataset</h3>

        <!-- Drop Zone -->
        <div
          @dragover.prevent="dragOver = true"
          @dragleave="dragOver = false"
          @drop.prevent="onDrop"
          :class="[
            'border-2 border-dashed rounded-xl p-12 text-center transition-all mb-6',
            dragOver ? 'border-primary bg-primary/10' : 'border-primary/20 hover:border-primary/40'
          ]"
        >
          <span class="material-symbols-outlined text-4xl text-primary/40 mb-3">cloud_upload</span>
          <p class="text-sm text-slate-300 mb-2">Drop archive here</p>
          <label class="text-xs text-primary hover:underline cursor-pointer">
            or browse files
            <input type="file" accept=".json,.csv,.zip" @change="onFileSelect" class="hidden" />
          </label>
          <div class="flex justify-center gap-2 mt-4">
            <span class="px-2 py-1 rounded text-[10px] font-bold bg-primary/10 text-primary border border-primary/20">.JSON</span>
            <span class="px-2 py-1 rounded text-[10px] font-bold bg-primary/10 text-primary border border-primary/20">.ZIP</span>
            <span class="px-2 py-1 rounded text-[10px] font-bold bg-primary/10 text-primary border border-primary/20">.CSV</span>
          </div>
        </div>

        <!-- File Selected -->
        <div v-if="importFile" class="mb-6">
          <p class="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Validation Status</p>
          <div class="bg-bg-dark/60 rounded-lg p-4 cyber-border space-y-2">
            <div class="flex items-center gap-2 text-sm">
              <span class="material-symbols-outlined text-primary text-base">description</span>
              <span class="text-slate-300">{{ importFile.name }}</span>
            </div>
            <p class="text-xs text-slate-500">Ready for validation. Click Execute Migration to proceed.</p>
          </div>
        </div>

        <button
          :disabled="!importFile"
          class="w-full bg-primary/10 hover:bg-primary/20 text-primary border border-primary/30 font-bold py-3.5 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors disabled:opacity-30"
        >
          <span class="material-symbols-outlined">upload</span>
          Execute Migration
        </button>
      </div>
    </div>
  </div>
</template>
