<script setup>
import { useAlert } from '@/composables/useAlert'

// Desestructuramos TODAS las variables, tanto del banner como de la confirmación
const { 
  isVisible, message, type, closeAlert,
  isConfirmVisible, confirmMessage, acceptConfirm, cancelConfirm 
} = useAlert()
</script>

<template>
  <Transition name="toast">
    <div v-if="isVisible" class="custom-alert" :class="type">
      <div class="alert-icon">
        <svg v-if="type === 'success'" viewBox="0 0 20 20" fill="currentColor">
          <path fill-rule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clip-rule="evenodd"/>
        </svg>
        <svg v-if="type === 'error'" viewBox="0 0 20 20" fill="currentColor">
          <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clip-rule="evenodd"/>
        </svg>
        <svg v-if="type === 'info'" viewBox="0 0 20 20" fill="currentColor">
          <path fill-rule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clip-rule="evenodd"/>
        </svg>
      </div>
      <div class="alert-content">
        <p>{{ message }}</p>
      </div>
      <button @click="closeAlert" class="alert-close">&times;</button>
    </div>
  </Transition>

  <Transition name="fade-modal">
    <div v-if="isConfirmVisible" class="modal-overlay" style="z-index: 9999;">
      <div class="modal-window" style="max-width: 450px; text-align: center; padding: 24px;">
        
        <div style="margin-bottom: 16px;">
          <svg style="width: 48px; height: 48px; color: #ef4444; margin: 0 auto;" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
            <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>

        <h3 style="font-size: 16px; margin-bottom: 12px; color: #1e293b;">Confirmar Acción</h3>
        <p style="font-size: 14px; color: #64748b; line-height: 1.5; margin-bottom: 24px;">
          {{ confirmMessage }}
        </p>

        <div style="display: flex; gap: 12px; justify-content: center;">
          <button type="button" class="btn-secondary" @click="cancelConfirm" style="padding: 10px 18px; font-size: 13.5px;">
            No, Cancelar
          </button>
          <button type="button" class="btn-primary-submit" @click="acceptConfirm" style="background: #ef4444; padding: 10px 18px; font-size: 13.5px;">
            Sí, Continuar
          </button>
        </div>

      </div>
    </div>
  </Transition>
</template>

<style scoped>
/* Los mismos estilos que ya tenías para el toast clásico */
.custom-alert {
  position: fixed;
  top: 20px;
  right: 20px;
  z-index: 9999;
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 300px;
  max-width: 420px;
  padding: 16px;
  border-radius: 10px;
  box-shadow: 0 10px 20px rgba(11, 37, 69, 0.12);
  color: #ffffff;
  font-family: sans-serif;
}

.alert-icon svg { width: 24px; height: 24px; }
.alert-content p { margin: 0; font-size: 14px; font-weight: 500; line-height: 1.4; }
.alert-close {
  background: none; border: none; color: rgba(255, 255, 255, 0.7); font-size: 20px;
  cursor: pointer; margin-left: auto; padding: 0 4px; transition: color 0.2s;
}
.alert-close:hover { color: #ffffff; }

.success { background-color: #10b981; border-left: 5px solid #047857; }
.error { background-color: #ef4444; border-left: 5px solid #b91c1c; }
.info { background-color: #134074; border-left: 5px solid #0B2545; }

.toast-enter-active { animation: slideIn 0.3s cubic-bezier(0.4, 0, 0.2, 1); }
.toast-leave-active { animation: slideIn 0.2s reverse ease-in-out; }

@keyframes slideIn {
  from { transform: translateX(120%); opacity: 0; }
  to { transform: translateX(0); opacity: 1; }
}
</style>