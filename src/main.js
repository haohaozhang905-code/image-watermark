import { createApp } from 'vue'
import App from './App.vue'

function mount() {
  createApp(App).mount('#app')
}

if (document.fonts?.ready) {
  document.fonts.ready.then(mount).catch(mount)
} else {
  mount()
}
