import { ref } from 'vue'

// Estados globales compartidos por toda la app
const isVisible = ref(false)
const message = ref('')
const type = ref('info') // 'success', 'error', 'info', 'warning'
const timeoutId = ref(null)

// Estados exclusivos para el flujo de confirmación (Modal)
const isConfirmVisible = ref(false)
const confirmMessage = ref('')
let confirmResolve = null // Guardará la respuesta de la Promesa

export function useAlert() {
  
  // 📢 Banner de notificación clásico (Auto-cerrable)
  const showAlert = (msg, alertType = 'info') => {
    if (timeoutId.value) clearTimeout(timeoutId.value)

    message.value = msg
    type.value = alertType
    isVisible.value = true

    timeoutId.value = setTimeout(() => {
      isVisible.value = false
    }, 4000)
  }

  const closeAlert = () => {
    isVisible.value = false
    if (timeoutId.value) clearTimeout(timeoutId.value)
  }

  // ❓ NUEVO: Lanzar modal de confirmación estilizado asíncrono
  const showConfirm = (msg) => {
    confirmMessage.value = msg
    isConfirmVisible.value = true
    
    // Retornamos una promesa que se resolverá cuando el usuario dé clic en Aceptar o Cancelar
    return new Promise((resolve) => {
      confirmResolve = resolve
    })
  }

  // Manejadores de respuesta del Modal
  const acceptConfirm = () => {
    isConfirmVisible.value = false
    if (confirmResolve) confirmResolve(true) // Retorna true
  }

  const cancelConfirm = () => {
    isConfirmVisible.value = false
    if (confirmResolve) confirmResolve(false) // Retorna false
  }

  return {
    // Retornos del banner
    isVisible,
    message,
    type,
    showAlert,
    closeAlert,
    
    // Retornos de la confirmación
    isConfirmVisible,
    confirmMessage,
    showConfirm,
    acceptConfirm,
    cancelConfirm
  }
}