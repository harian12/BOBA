import { ref, onMounted, onUnmounted, watch } from 'vue';
import { useVaultStore } from '../stores/vaultStore.js';
import { useDialogStore } from '../stores/dialogStore.js';

const timeoutMinutes = ref(15);
const remainingSeconds = ref(0)
const lastActivity = ref(Date.now())
let timer: ReturnType<typeof setInterval> | null = null

const EVENTS = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'wheel']

export const useAutoLock = () => {
  // Asumsi auto-import Nuxt (vaultStore, dialogStore)
  const vaultStore = useVaultStore()
  const dialogStore = useDialogStore()

  const ping = () => { lastActivity.value = Date.now() }

  const start = () => {
    stop()
    EVENTS.forEach(e => window.addEventListener(e, ping, { passive: true }))
    timer = setInterval(() => {
      if (timeoutMinutes.value <= 0 || !vaultStore.isUnlocked) return
      
      const idle = Date.now() - lastActivity.value
      const maxIdle = timeoutMinutes.value * 60 * 1000
      remainingSeconds.value = Math.max(0, Math.floor((maxIdle - idle) / 1000))

      if (idle > maxIdle) {
        vaultStore.lock()
        dialogStore.showToast('Proteksi Data dikunci otomatis karena tidak ada aktivitas', 'info', 3000)
        stop()
      }
    }, 1000)
  }

  const stop = () => {
    EVENTS.forEach(e => window.removeEventListener(e, ping))
    if (timer) {
      clearInterval(timer)
      timer = null
    }
  }

  const setTimeoutMinutes = (m: number) => {
    timeoutMinutes.value = m
    localStorage.setItem('boba_auto_lock_timeout', m.toString())
    ping()
  }

  onMounted(() => {
    const saved = localStorage.getItem('boba_auto_lock_timeout')
    if (saved !== null) timeoutMinutes.value = parseInt(saved, 10)

    watch([() => vaultStore.isUnlocked, timeoutMinutes], ([unlocked, minutes]) => {
      if (unlocked && minutes > 0) {
        ping()
        start()
      } else {
        stop()
      }
    }, { immediate: true })
  })

  onUnmounted(stop)

  return { timeoutMinutes, remainingSeconds, setTimeoutMinutes }
}
