import './assets/main.css'
import 'primeicons/primeicons.css'
import 'md-editor-v3/lib/style.css'

import { createApp } from 'vue'
import { createPinia } from 'pinia'
import PrimeVue from 'primevue/config'
import ToastService from 'primevue/toastservice'
import ConfirmationService from 'primevue/confirmationservice'
import Lara from '@primevue/themes/lara'

import App from './App.vue'
import router from './router'
import { useAuthStore } from './stores/auth'

const app = createApp(App)

const pinia = createPinia()
app.use(pinia)
app.use(router)
app.use(PrimeVue, { theme: { preset: Lara } })
app.use(ToastService)
app.use(ConfirmationService)

const auth = useAuthStore(pinia)
void auth.hydrate().finally(() => {
  app.mount('#app')
})
