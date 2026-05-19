import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import api from '@/api/axios'
import type { User } from '@/api/types'
import { useEnrollmentsStore } from '@/stores/enrollments'

const TOKEN_KEY = 'auth_token'

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null)
  const token = ref<string | null>(localStorage.getItem(TOKEN_KEY))

  const isAuthenticated = computed(() => token.value !== null)

  function setToken(value: string | null) {
    token.value = value
    if (value) {
      localStorage.setItem(TOKEN_KEY, value)
    } else {
      localStorage.removeItem(TOKEN_KEY)
    }
  }

  async function fetchMe() {
    const res = await api.get<User>('/auth/me')
    user.value = res.data
    return res.data
  }

  function login() {
    const base = import.meta.env.VITE_API_URL as string
    window.location.href = `${base}/auth/google`
  }

  function logout() {
    setToken(null)
    user.value = null
    useEnrollmentsStore().reset()
    if (typeof window !== 'undefined' && window.location.pathname !== '/login') {
      window.location.href = '/login'
    }
  }

  async function hydrate() {
    if (!token.value) return
    try {
      await fetchMe()
    } catch {
      logout()
    }
  }

  return {
    user,
    token,
    isAuthenticated,
    setToken,
    fetchMe,
    login,
    logout,
    hydrate,
  }
})
