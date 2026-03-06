import { createApp } from 'vue';
import { createPinia } from 'pinia';
import { createRouter, createWebHistory } from 'vue-router';
import App from './App.vue';
import './styles/main.css';

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', name: 'dashboard', component: () => import('./pages/DashboardPage.vue') },
    { path: '/decisions', name: 'decisions', component: () => import('./pages/DecisionsPage.vue') },
    { path: '/decisions/:id', name: 'decision-detail', component: () => import('./pages/DecisionDetailPage.vue') },
    { path: '/sessions', name: 'sessions', component: () => import('./pages/SessionsPage.vue') },
    { path: '/sessions/:id', name: 'session-detail', component: () => import('./pages/SessionDetailPage.vue') },
    { path: '/import-export', name: 'import-export', component: () => import('./pages/ImportExportPage.vue') },
    { path: '/settings', name: 'settings', component: () => import('./pages/SettingsPage.vue') },
    { path: '/analytics', name: 'analytics', component: () => import('./pages/AnalyticsPage.vue') },
  ],
});

const app = createApp(App);
app.use(createPinia());
app.use(router);
app.mount('#app');
