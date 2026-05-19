import type { NavigationGuard } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const PUBLIC_ROUTES = new Set(['/login', '/auth/callback'])

export const authGuard: NavigationGuard = (to) => {
  if (PUBLIC_ROUTES.has(to.path)) {
    return true
  }
  const auth = useAuthStore()
  if (!auth.isAuthenticated) {
    return { path: '/login' }
  }
  return true
}
