<script setup lang="ts">
import { computed } from 'vue';
import VChart from 'vue-echarts';
import { use } from 'echarts/core';
import { LineChart } from 'echarts/charts';
import { GridComponent, TooltipComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';

use([LineChart, GridComponent, TooltipComponent, CanvasRenderer]);

const props = defineProps<{ data: { date: string; count: number }[] }>();

const option = computed(() => ({
  tooltip: { trigger: 'axis' },
  grid: { left: 40, right: 20, top: 10, bottom: 30 },
  xAxis: { type: 'category', data: props.data.map(d => d.date), axisLine: { lineStyle: { color: '#334' } }, axisLabel: { color: '#888', fontSize: 10 } },
  yAxis: { type: 'value', axisLine: { show: false }, splitLine: { lineStyle: { color: 'rgba(13,242,242,0.05)' } }, axisLabel: { color: '#888' } },
  series: [{
    type: 'line',
    data: props.data.map(d => d.count),
    smooth: true,
    lineStyle: { color: '#0df2f2', width: 3 },
    areaStyle: { color: { type: 'linear', x: 0, y: 0, x2: 0, y2: 1, colorStops: [{ offset: 0, color: 'rgba(13,242,242,0.3)' }, { offset: 1, color: 'rgba(13,242,242,0)' }] } },
    itemStyle: { color: '#0df2f2' },
  }],
}));
</script>

<template>
  <v-chart :option="option" autoresize style="height: 220px" />
</template>
