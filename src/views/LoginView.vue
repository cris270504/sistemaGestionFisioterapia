<script setup>
import AuthVue from '@/components/Auth.vue'
</script>

<template>
  <div class="login-view">
    <AuthVue />
  </div>
</template>

<style scoped>
.login-view {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
  background-color: #f4f6f9;
}
</style>