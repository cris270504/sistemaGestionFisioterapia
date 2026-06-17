<script setup>
import { ref, watch } from 'vue'
import { supabase } from '@/lib/supabaseClient'
import { validatePaymentAmountNotExceeds, validatePaymentAmount } from '@/lib/validators'
import { useAlert } from '@/composables/useAlert'

const props = defineProps({
  isOpen: { type: Boolean, required: true },
  sesion: { type: Object, default: null },
  loadingAccion: { type: Boolean, default: false }
})

const emit = defineEmits(['close', 'submit'])
const { showAlert } = useAlert()

const metodoPago = ref('efectivo')
const numeroOperacion = ref('')
const tipoPago = ref('completo') // 'completo' o 'parcial'
const montoIngresado = ref(null)

// Datos traídos en vivo de la BD
const paqueteAsociado = ref(null)
const precioSesionSuelta = ref(0)
const cargandoFinanzas = ref(false)

const esPaqueteMultiple = ref(false)
const saldoPendiente = ref(0)

watch(() => props.isOpen, async (abierto) => {
  if (abierto && props.sesion) {
    metodoPago.value = 'efectivo'
    numeroOperacion.value = ''
    tipoPago.value = 'completo'
    montoIngresado.value = null
    paqueteAsociado.value = null
    precioSesionSuelta.value = 0
    esPaqueteMultiple.value = false
    saldoPendiente.value = 0
    
    cargandoFinanzas.value = true
    
    if (props.sesion.idPaquete) {
      // ─── LÓGICA PARA PAQUETES ───
      const { data } = await supabase
        .from('Paquete')
        .select('monto_total, monto_pagado, total_sesiones')
        .eq('idPaquete', props.sesion.idPaquete)
        .single()
        
      if (data) {
        paqueteAsociado.value = data
        saldoPendiente.value = Number(data.monto_total) - Number(data.monto_pagado)
        esPaqueteMultiple.value = data.total_sesiones > 1
        montoIngresado.value = saldoPendiente.value // Sugerir pago completo por defecto
      }
    } else {
      // ─── LÓGICA PARA SESIONES SUELTAS O EVALUACIONES ───
      // 1. Buscamos el precio oficial en el Tarifario
      const { data } = await supabase
        .from('Catalogo_Servicio')
        .select('precio')
        .eq('tipo', 'sesion_suelta')
        .eq('activo', true)
        .limit(1)
        .single()
        
      if (data) {
        precioSesionSuelta.value = Number(data.precio)
      }

      // 2. Evaluamos si cobramos o es gratis
      if (props.sesion.tipo === 'evaluacion') {
        montoIngresado.value = 0 // Evaluaciones son gratuitas
      } else {
        montoIngresado.value = precioSesionSuelta.value // Tratamiento suelto
      }
    }
    
    cargandoFinanzas.value = false
  }
})

watch(tipoPago, (val) => {
  if (val === 'completo') montoIngresado.value = saldoPendiente.value
  else montoIngresado.value = null
})

const handleSubmit = () => {
  // ✅ CORRECCIÓN CRÍTICA: Validaciones mejoradas de pago
  const monto = Number(montoIngresado.value)

  // Validación 1: Monto es obligatorio y positivo
  if (!validatePaymentAmount(monto)) {
    showAlert('El monto debe ser mayor a S/ 0.00', 'error')
    return
  }

  // Validación 2: Para paquetes, no exceder saldo pendiente
  if (paqueteAsociado.value && !validatePaymentAmountNotExceeds(monto, saldoPendiente.value)) {
    showAlert(
      `No puedes cobrar más que el saldo pendiente: S/ ${saldoPendiente.value.toFixed(2)}`,
      'error'
    )
    return
  }

  // Validación 3: Validar método de pago para montos importantes
  if (metodoPago.value === 'transferencia' && !numeroOperacion.value.trim()) {
    showAlert('Debes ingresar el número de operación para transferencias', 'error')
    return
  }

  // Validación 4: No hay montos cero permitidos
  if (monto === 0) {
    showAlert('El monto no puede ser cero. Usa cancelación si no pagarás.', 'error')
    return
  }

  emit('submit', {
    idSesion: props.sesion.idSesion,
    idPaciente: props.sesion.idPaciente,
    idPaquete: props.sesion.idPaquete || null,
    monto: monto,
    metodoPago: metodoPago.value,
    numeroOperacion: numeroOperacion.value
  })
}
</script>

<template>
  <Transition name="fade-modal">
    <div v-if="isOpen" class="modal-overlay" @click.self="emit('close')">
      <div class="modal-window" style="max-width: 420px;">
        
        <div class="modal-header">
          <h3>Confirmar Cobro</h3>
          <button class="close-x" @click="emit('close')" :disabled="loadingAccion">&times;</button>
        </div>

        <div v-if="cargandoFinanzas" style="padding: 30px; text-align: center; color: var(--gray-500);">
          <span class="spinner" style="display:inline-block; margin-right: 8px;"></span> Calculando tarifas...
        </div>

        <form v-else @submit.prevent="handleSubmit" class="modal-form">
          
          <div v-if="paqueteAsociado" class="resumen-financiero">
            <p><strong>Total del Paquete:</strong> S/ {{ Number(paqueteAsociado.monto_total).toFixed(2) }}</p>
            <p style="color: #059669;"><strong>Abonado hasta ahora:</strong> S/ {{ Number(paqueteAsociado.monto_pagado).toFixed(2) }}</p>
            <div class="saldo-pendiente">Saldo Pendiente: S/ {{ saldoPendiente.toFixed(2) }}</div>
          </div>

          <div v-else class="resumen-financiero" style="border-color: #bae6fd; background: #eff6ff;">
            <template v-if="sesion?.tipo === 'evaluacion'">
              <p style="color: #1e40af; margin: 0; font-size: 14px;">
                <strong>Costo de Evaluación:</strong> Gratuita (S/ 0.00)
              </p>
            </template>
            <template v-else>
              <p style="color: #1e40af; margin: 0; font-size: 14px;">
                <strong>Tarifa Oficial de Sesión:</strong> S/ {{ precioSesionSuelta.toFixed(2) }}
              </p>
              <p style="color: #64748b; margin-top: 4px; font-size: 11px;">
                * Precio basado en el tarifario actual.
              </p>
            </template>
          </div>

          <div v-if="esPaqueteMultiple && saldoPendiente > 0" class="input-group">
            <label>Tipo de Pago</label>
            <div style="display: flex; gap: 10px;">
              <label class="radio-btn">
                <input type="radio" v-model="tipoPago" value="completo"> Pagar Saldo Completo
              </label>
              <label class="radio-btn">
                <input type="radio" v-model="tipoPago" value="parcial"> Abonar una parte
              </label>
            </div>
          </div>

          <div class="input-group">
            <label>Monto a cobrar (S/) <span style="color: red">*</span></label>
            <input type="number" step="0.01" min="0" :max="saldoPendiente > 0 ? saldoPendiente : null" 
                   v-model="montoIngresado" :disabled="tipoPago === 'completo' && paqueteAsociado" required />
          </div>

          <div class="input-group">
            <label>Método de Pago <span style="color: red">*</span></label>
            <select v-model="metodoPago" required>
              <option value="efectivo">💵 Efectivo</option>
              <option value="yape">📱 Yape</option>
              <option value="plin">📱 Plin</option>
              <option value="tarjeta">💳 Tarjeta (POS)</option>
            </select>
          </div>

          <div class="input-group" v-if="['yape', 'plin', 'tarjeta'].includes(metodoPago)">
            <label>N° de Operación / Referencia</label>
            <input type="text" v-model="numeroOperacion" placeholder="Ej: 0012345" />
          </div>

          <div class="modal-actions">
            <button type="button" class="btn-secondary" @click="emit('close')" :disabled="loadingAccion">Cancelar</button>
            <button type="submit" class="btn-primary-submit" :disabled="loadingAccion">
              <span v-if="loadingAccion">Procesando...</span>
              <span v-else>Confirmar Ingreso</span>
            </button>
          </div>

        </form>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.resumen-financiero { background: #f8fafc; border: 1px solid #e2e8f0; padding: 12px; border-radius: 8px; margin-bottom: 16px; font-size: 13px; }
.resumen-financiero p { margin: 0 0 6px 0; color: #334155; }
.saldo-pendiente { font-size: 15px; font-weight: 700; color: #b45309; margin-top: 8px; border-top: 1px solid #e2e8f0; padding-top: 8px; }
.radio-btn { display: flex; align-items: center; gap: 6px; font-size: 13px; cursor: pointer; }
</style>