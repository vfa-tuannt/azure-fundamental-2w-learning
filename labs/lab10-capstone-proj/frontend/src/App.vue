<script setup lang="ts">
import { computed } from 'vue'
import { useRoute, RouterView } from 'vue-router'
import Toast from 'primevue/toast'
import ConfirmDialog from 'primevue/confirmdialog'
import AppLayout from './layouts/AppLayout.vue'

const route = useRoute()
const isLoginPage = computed(() => route.name === 'login')
</script>

<template>
  <AppLayout v-if="!isLoginPage" />
  <RouterView v-else />
  <Toast />
  <ConfirmDialog />
</template>
