<script setup>
import { ref, computed, watch } from 'vue'
import { supabase } from '@/lib/supabaseClient'
import { useAlert } from '@/composables/useAlert'

const props = defineProps({
  isOpen: { type: Boolean, required: true },
  pacientes: { type: Array, default: () => [] } // Se asume que el padre le pasa la lista de pacientes
})

const emit = defineEmits(['close', 'refresh'])
const { showAlert } = useAlert()

const loading = ref(false)

// Campos del Formulario
const idPaciente = ref(null)
const nombrePaquete = ref('Paquete de Rehabilitación')
const totalSesiones = ref(10)
const montoTotal = ref('')
const montoPagado = ref('') // Adelanto o pago total inicial
const metodoPago = ref('efectivo')
const fechaInicio = ref(new Date().toISOString().split('T')[0])
const fechaVencimiento = ref('')

// Cálculos reactivos para la Interfaz
const saldoPendiente = computed(() => {
  const total = parseFloat(montoTotal.value) || 0
  const pagado = parseFloat(montoPagado.value) || 0
  return Math.max(0, total - pagado)
})

const precioPorSesion = computed(() => {
  const total = parseFloat(montoTotal.value) || 0
  const sesiones = parseInt(totalSesiones.value) || 1
  return (total / sesiones).toFixed(2)
})

const estadoPagoCalculado = computed(() => {
  const total = parseFloat(montoTotal.value) || 0
  const pagado = parseFloat(montoPagado.value) || 0
  
  if (total === 0) return 'pendiente'
  if (pagado === 0) return 'pendiente'
  if (pagado >= total) return 'pagado'
  return 'parcial'
})

// Resetear formulario al abrir/cerrar
watch(() => props.isOpen, (newVal) => {
  if (newVal) {
    idPaciente.value = null
    nombrePaquete.value = 'Paquete de Rehabilitación'
    totalSesiones.value = 10
    montoTotal.value = ''
    montoPagado.value = ''
    metodoPago.value = 'efectivo'
    fechaInicio.value = new Date().toISOString().split('T')[0]
    fechaVencimiento.value = ''
  }
})

const handleSubmit = async () => {
  const total = parseFloat(montoTotal.value)
  const pagado = parseFloat(montoPagado.value) || 0

  if (!idPaciente.value) {
    showAlert('Debe seleccionar un paciente.', 'error')
    return
  }
  if (total <= 0) {
    showAlert('El monto total debe ser mayor a 0.', 'error')
    return
  }
  if (pagado > total) {
    showAlert('El monto pagado no puede ser mayor al monto total del paquete.', 'error')
    return
  }

  loading.value = true
  try {
    // 1. Insertar el Paquete
    const { data: paqueteData, error: errPaquete } = await supabase
      .from('Paquete')
      .insert({
        idPaciente: idPaciente.value,
        nombre_paquete: nombrePaquete.value.trim(),
        total_sesiones: totalSesiones.value,
        monto_total: total,
        monto_pagado: pagado,
        fecha_inicio: fechaInicio.value,
        fecha_vencimiento: fechaVencimiento.value || null,
        estado_pago: estadoPagoCalculado.value
      })
      .select('idPaquete')
      .single()

    if (errPaquete) throw errPaquete

    // 2. Si el paciente dejó un adelanto o pagó completo, registramos el Pago asociado al paquete
    if (pagado > 0) {
      const { error: errPago } = await supabase
        .from('Pago')
        .insert({
          idPaciente: idPaciente.value,
          idPaquete: paqueteData.idPaquete,
          monto: pagado,
          metodo_pago: metodoPago.value,
          estado_pago: 'completado'
        })

      if (errPago) throw errPago
    }

    showAlert('¡Paquete creado y registrado exitosamente!', 'success')
    emit('refresh')
    emit('close')
  } catch (error) {
    showAlert('Error al crear el paquete: ' + error.message, 'error')
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <Transition name="fade-modal">
    <div v-if="isOpen" class="modal-overlay" @click.self="emit('close')">
      <div class="modal-window" style="max-width: 600px;">
        
        <div class="modal-header">
          <h3>Vender Nuevo Paquete</h3>
          <button class="close-x" @click="emit('close')">&times;</button>
        </div>

        <form @submit.prevent="handleSubmit" class="modal-form">
          <div class="form-grid">
            
            <!-- Paciente -->
            <div class="input-group span-2">
              <label>Paciente *</label>
              <select v-model="idPaciente" required>
                <option :value="null" disabled>— Seleccionar paciente —</option>
                <option v-for="p in pacientes" :key="p.idPaciente" :value="p.idPaciente">
                  {{ p.Persona?.nombres }} {{ p.Persona?.apellidos }} - {{ p.Persona?.numero_documento }}
                </option>
              </select>
            </div>

            <!-- Detalles del Paquete -->
            <div class="input-group">
              <label>Nombre del Paquete *</label>
              <input type="text" v-model="nombrePaquete" placeholder="Ej: Rehabilitación Lumbar" required />
            </div>

            <div class="input-group">
              <label>Total de Sesiones *</label>
              <input type="number" v-model="totalSesiones" min="2" max="50" required />
            </div>

            <!-- Fechas -->
            <div class="input-group">
              <label>Fecha de Inicio *</label>
              <input type="date" v-model="fechaInicio" required />
            </div>

            <div class="input-group">
              <label>Fecha de Vencimiento (Opcional)</label>
              <input type="date" v-model="fechaVencimiento" />
            </div>

            <!-- Divisor Visual -->
            <div class="span-2" style="border-top: 1px solid #e2e8f0; margin: 10px 0;"></div>

            <!-- Finanzas -->
            <div class="input-group">
              <label>Monto Total (S/) *</label>
              <input type="number" v-model="montoTotal" step="0.01" min="1" placeholder="Ej: 500.00" required />
              <span v-if="montoTotal && totalSesiones" style="font-size: 11px; color: #64748b; margin-top: 2px;">
                Costo por sesión: S/ {{ precioPorSesion }}
              </span>
            </div>

            <div class="input-group">
              <label>Monto Pagado Hoy (S/)</label>
              <input type="number" v-model="montoPagado" step="0.01" min="0" placeholder="Ej: 250.00" />
              <span v-if="saldoPendiente > 0" style="font-size: 11px; color: #ef4444; margin-top: 2px;">
                Deuda pendiente: S/ {{ saldoPendiente.toFixed(2) }}
              </span>
              <span v-else-if="montoPagado && saldoPendiente === 0" style="font-size: 11px; color: #10b981; margin-top: 2px;">
                Paquete cancelado en su totalidad.
              </span>
            </div>

            <Transition name="slide-down">
              <div v-if="montoPagado > 0" class="input-group span-2">
                <label>Método de Pago del Adelanto *</label>
                <select v-model="metodoPago" required>
                  <option value="efectivo">Efectivo</option>
                  <option value="tarjeta">Tarjeta (POS)</option>
                  <option value="yape">Yape</option>
                  <option value="plin">Plin</option>
                </select>
              </div>
            </Transition>

          </div>

          <div class="modal-actions">
            <button type="button" class="btn-secondary" @click="emit('close')">Cancelar</button>
            <button type="submit" class="btn-primary-submit" :disabled="loading">
              <span v-if="loading" class="btn-spinner"></span>
              <span v-else>Vender Paquete</span>
            </button>
          </div>
        </form>

      </div>
    </div>
  </Transition>
</template>

<style scoped>
/* Las clases base como .modal-overlay, .input-group, etc., ya están en tu global.css */
</style>