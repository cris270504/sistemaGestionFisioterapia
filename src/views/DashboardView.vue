<script setup>
import { ref } from 'vue'
import AppSidebar from '@/components/AppSidebar.vue'
import AppNavbar  from '@/components/AppNavbar.vue'

const sidebarCollapsed = ref(false)

const toggleSidebar = () => {
  sidebarCollapsed.value = !sidebarCollapsed.value
}
</script>

<template>
  <div class="app-shell">

    <div class="main-wrapper">


      <main class="page-content">
        <!-- Aquí se inyecta la vista activa -->
      </main>
    </div>
  </div>
</template>

<style scoped>
.app-shell {
  display: flex;
  height: 100vh;
  overflow: hidden;
  background: #eef4f9;
  font-family: 'DM Sans', sans-serif;
}

.main-wrapper {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-width: 0; /* evita desbordamiento en flex */
}

.page-content {
  flex: 1;
  overflow-y: auto;
  padding: 28px 32px;
}

@media (max-width: 768px) {
  .page-content { padding: 18px 16px; }
}
</style>