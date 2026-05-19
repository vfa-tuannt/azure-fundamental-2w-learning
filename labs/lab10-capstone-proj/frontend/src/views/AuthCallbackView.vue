<script setup lang="ts">
import { onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()

onMounted(async () => {
  const token = route.query.token
  if (typeof token !== 'string' || token.length === 0) {
    await router.replace({ path: '/login', query: { error: 'missing_token' } })
    return
  }

  auth.setToken(token)
  await router.replace({ path: '/auth/callback' })

  try {
    await auth.fetchMe()
    await router.replace('/challenges')
  } catch {
    auth.logout()
  }
})
</script>

<template>
  <div class="flex min-h-dvh items-center justify-center bg-slate-50">
    <div class="flex items-center gap-3 text-slate-600">
      <i class="pi pi-spin pi-spinner text-xl" />
      <span>Signing you in…</span>
    </div>
  </div>
</template>
