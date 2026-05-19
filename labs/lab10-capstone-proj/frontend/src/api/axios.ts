import axios from 'axios'

const TOKEN_KEY = 'auth_token'

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL as string,
})

api.interceptors.request.use((config) => {
  const token = localStorage.getItem(TOKEN_KEY)
  if (token) {
    config.headers.set('Authorization', `Bearer ${token}`)
  }
  return config
})

api.interceptors.response.use(
  (response) => response,
  (error: unknown) => {
    if (
      typeof error === 'object' &&
      error !== null &&
      'response' in error &&
      (error as { response?: { status?: number } }).response?.status === 401
    ) {
      localStorage.removeItem(TOKEN_KEY)
      if (
        typeof window !== 'undefined' &&
        window.location.pathname !== '/login'
      ) {
        window.location.href = '/login'
      }
    }
    return Promise.reject(error as Error)
  },
)

export default api
