import type { NavigationGuard } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

export const authGuard: NavigationGuard = (to) => {
  if (to.meta?.public === true) {
    return true
  }
  const auth = useAuthStore()
  if (!auth.isAuthenticated) {
    return { path: '/login' }
  }
  return true
}
