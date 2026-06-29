<script setup>
import { ref, watch, computed } from 'vue'
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
const tratamientoAsociado = ref(null)
const precioSesionSuelta = ref(0)
const cargandoFinanzas = ref(false)

const saldoPendiente = ref(0)

// Helper visual para el color del ciclo (Misma lógica que pusimos en la tabla)
const colorTratamiento = computed(() => {
  if (!props.sesion?.idTratamiento) return '#0f766e';
  const PALETA = ['#ef4444', '#f97316', '#eab308', '#84cc16', '#22c55e', '#14b8a6', '#06b6d4', '#0ea5e9', '#3b82f6', '#6366f1'];
  let hash = 0;
  const str = String(props.sesion.idTratamiento);
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  return PALETA[Math.abs(hash) % PALETA.length];
});

watch(() => props.isOpen, async (abierto) => {
  if (abierto && props.sesion) {
    metodoPago.value = 'efectivo'
    numeroOperacion.value = ''
    tipoPago.value = 'completo'
    montoIngresado.value = null
    tratamientoAsociado.value = null
    precioSesionSuelta.value = 0
    saldoPendiente.value = 0

    cargandoFinanzas.value = true

    // ─── LÓGICA INTELIGENTE: ¿ES UN CICLO DE TRATAMIENTO O CITA SUELTA? ───
    if (props.sesion.idPaquete) {
      // 1. Buscamos el precio original en la tabla PAQUETE
      const { data: paqueteData, error } = await supabase
        .from('Paquete')
        .select('monto_total')
        .eq('idPaquete', props.sesion.idPaquete)
        .single()

      if (paqueteData && !error) {
        // 👇 SOLUCIÓN: Sumamos todos los recibos reales vinculados a este paquete
        const { data: pagosPrevios } = await supabase
          .from('Pago')
          .select('monto')
          .eq('idPaquete', props.sesion.idPaquete)

        // Calculamos cuánto ha abonado en total sumando el historial real
        const totalAbonado = pagosPrevios
          ? pagosPrevios.reduce((sum, p) => sum + Number(p.monto), 0)
          : 0

        tratamientoAsociado.value = paqueteData

        // El saldo pendiente es el precio del paquete menos lo que sumó la auditoría
        saldoPendiente.value = Math.max(0, Number(paqueteData.monto_total) - totalAbonado)

        // Sugerimos el saldo restante automáticamente (Ej: 250 - 130 = 120)
        montoIngresado.value = saldoPendiente.value
      }
      const tipoABuscar = props.sesion.tipo === 'masaje' ? 'masaje' : 'sesion_suelta'
      // 2. Es una cita suelta o evaluación (Sin Tratamiento)
      const { data: catData } = await supabase
        .from('Catalogo_Servicio')
        .select('precio')
        .eq('tipo', tipoABuscar)
        .eq('activo', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .single()

      if (catData) {
        precioSesionSuelta.value = Number(catData.precio)
      }

      // Evaluamos si cobramos o es gratis
      if (props.sesion.tipo === 'evaluacion') {
        montoIngresado.value = 0
        saldoPendiente.value = 0
      } else {
        // 👇 ¡NUEVA LÓGICA DE AUDITORÍA EN VIVO! 👇
        // Consultamos la tabla Pago para ver si esta sesión ya tiene abonos previos
        const { data: pagosPrevios } = await supabase
          .from('Pago')
          .select('monto')
          .eq('idSesion', props.sesion.idSesion)

        // Sumamos todos los adelantos registrados en caja para esta cita
        const totalAbonado = pagosPrevios
          ? pagosPrevios.reduce((sum, p) => sum + Number(p.monto), 0)
          : 0

        // El saldo pendiente real es el precio total menos lo que ya pagó
        saldoPendiente.value = Math.max(0, precioSesionSuelta.value - totalAbonado)
        montoIngresado.value = saldoPendiente.value // Sugiere automáticamente los S/ 30.00 restantes
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
  const monto = Number(montoIngresado.value)

  if (!validatePaymentAmount(monto) && props.sesion.tipo !== 'evaluacion') {
    showAlert('El monto debe ser mayor a S/ 0.00', 'error')
    return
  }

  if (tratamientoAsociado.value && !validatePaymentAmountNotExceeds(monto, saldoPendiente.value)) {
    showAlert(`No puedes cobrar más que el saldo pendiente: S/ ${saldoPendiente.value.toFixed(2)}`, 'error')
    return
  }

  if (metodoPago.value === 'transferencia' && !numeroOperacion.value.trim()) {
    showAlert('Debes ingresar el número de operación para transferencias', 'error')
    return
  }

  // 👇 Enviamos la información enriquecida a useCitas.js
  emit('submit', {
    idSesion: props.sesion.idSesion,
    idPaciente: props.sesion.idPaciente,
    idPaquete: props.sesion.idPaquete || null, // Clave para actualizar el ciclo
    monto: monto,
    metodoPago: metodoPago.value,
    numeroOperacion: numeroOperacion.value,
    esPagoCompleto: monto === saldoPendiente.value
  })
}
</script>

<template>
  <Transition name="fade-modal">
    <div v-if="isOpen" class="modal-overlay" @click.self="emit('close')">
      <div class="modal-window" style="max-width: 440px;">

        <div class="modal-header">
          <h3>Registrar Ingreso en Caja</h3>
          <button class="close-x" @click="emit('close')" :disabled="loadingAccion">&times;</button>
        </div>

        <div v-if="cargandoFinanzas" style="padding: 40px; text-align: center; color: var(--gray-500);">
          <span class="spinner" style="display:inline-block; margin-right: 8px;"></span> Consultando estado de cuenta...
        </div>

        <form v-else @submit.prevent="handleSubmit" class="modal-form">

          <div v-if="tratamientoAsociado" class="resumen-financiero paquete-mode"
            :style="`--ciclo-color: ${colorTratamiento}`">
            <div class="ciclo-badge">🔗 Ciclo #{{ sesion.idTratamiento }}</div>
            <p class="aviso-txt">Esta cita forma parte de un ciclo de tratamiento. El cobro se abonará a la cuenta
              global del paciente.</p>

            <div class="cifras-grid">
              <div>
                <span class="lbl">Costo Total:</span>
                <span class="val">S/ {{ Number(tratamientoAsociado.monto_total).toFixed(2) }}</span>
              </div>
              <div>
                <span class="lbl">Abonado:</span>
                <span class="val text-green">S/ {{ Number(tratamientoAsociado.monto_pagado || 0).toFixed(2) }}</span>
              </div>
            </div>

            <div class="saldo-pendiente">
              Saldo Restante a Pagar: <span>S/ {{ saldoPendiente.toFixed(2) }}</span>
            </div>
          </div>

          <!-- ── ESCENARIO B: PAGO DE SESIÓN SUELTA O EVALUACIÓN ── -->
          <div v-else class="resumen-financiero suelta-mode">

            <!-- Etiqueta dinámica: Sabe distinguir si es Evaluación o Sesión Normal -->
            <div class="ciclo-badge" :style="sesion?.tipo === 'masaje' ? 'background: #fef3c7; color: #d97706;' : ''">
              {{
                (sesion?.tipo === 'evaluacion' || sesion?.es_evaluacion_inicial)
                  ? 'Evaluación Inicial'
                  : (sesion?.tipo === 'masaje')
                    ? '💆 Sesión de Masajes'
                    : 'Sesión Individual'
              }}
            </div>

            <template v-if="sesion?.tipo === 'evaluacion' || sesion?.es_evaluacion_inicial">
              <p class="suelta-txt"><strong>Costo:</strong> Gratuita (S/ 0.00)</p>
              <p class="aviso-txt">Solo registre la operación para que el sistema asiente la visita.</p>
            </template>

            <template v-else>
              <p class="suelta-txt"><strong>Tarifa Oficial:</strong> S/ {{ precioSesionSuelta.toFixed(2) }}</p>

              <!-- Si el precio cargó bien, muestra el texto normal -->
              <p v-if="precioSesionSuelta > 0" class="aviso-txt">
                * Basado en el tarifario estándar de sesiones sueltas.
              </p>
              <!-- Si el precio es 0, lanza una advertencia visual -->
              <p v-else class="aviso-txt" style="color: #ef4444; font-weight: bold;">
                ⚠️ Advertencia: La tarifa base está en S/ 0.00. Verifique el Catálogo de Servicios.
              </p>
            </template>
          </div>

          <div v-if="saldoPendiente > 0" class="input-group" style="margin-top: 20px;">
            <label>¿Qué desea registrar?</label>
            <div class="radio-group">
              <label class="radio-card" :class="{ 'active': tipoPago === 'completo' }">
                <input type="radio" v-model="tipoPago" value="completo">
                <div class="rc-content">
                  <strong>Pagar Todo</strong>
                  <span>S/ {{ saldoPendiente.toFixed(2) }}</span>
                </div>
              </label>
              <label class="radio-card" :class="{ 'active': tipoPago === 'parcial' }">
                <input type="radio" v-model="tipoPago" value="parcial">
                <div class="rc-content">
                  <strong>Adelanto</strong>
                  <span>Abono parcial</span>
                </div>
              </label>
            </div>
          </div>

          <div v-if="saldoPendiente > 0" class="input-group">
            <label>Monto a recibir (S/) <span class="req">*</span></label>
            <input type="number" step="0.01" min="0" :max="saldoPendiente > 0 ? saldoPendiente : null"
              v-model="montoIngresado" :disabled="tipoPago === 'completo'" required class="monto-input" />
          </div>
          <div v-if="saldoPendiente > 0" class="input-group">
            <label>Método de Pago <span class="req">*</span></label>
            <input type="text" v-model="metodoPago" placeholder="Efectivo" disabled />
            <!-- PRÓXIMAMENTE
            <select v-model="metodoPago" required>
              <option value="efectivo">💵 Efectivo</option>
              <option value="yape">📱 Yape</option>
              <option value="plin">📱 Plin</option>
              <option value="tarjeta">💳 Tarjeta (POS)</option>
            </select>
            -->
          </div>

          <div class="input-group"
            v-if="['yape', 'plin', 'tarjeta', 'transferencia'].includes(metodoPago) && saldoPendiente > 0">
            <label>N° de Operación / Referencia <span class="req">*</span></label>
            <input type="text" v-model="numeroOperacion" placeholder="Ej: 0012345" required />
          </div>

          <div class="modal-actions">
            <button type="button" class="btn-secondary" @click="emit('close')"
              :disabled="loadingAccion">Cancelar</button>
            <button type="submit" class="btn-primary-submit" :disabled="loadingAccion">
              <span v-if="loadingAccion" class="btn-spinner"></span>
              <span v-else>{{ saldoPendiente > 0 ? 'Confirmar Ingreso a Caja' : 'Registrar como Cortesía' }}</span>
            </button>
          </div>

        </form>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.resumen-financiero {
  padding: 16px;
  border-radius: 10px;
  margin-bottom: 16px;
  border: 1px solid transparent;
}

/* Diseño para modo Tratamiento */
.paquete-mode {
  background: #f8fafc;
  border-color: #cbd5e1;
  position: relative;
  border-left: 4px solid var(--ciclo-color);
}

.ciclo-badge {
  display: inline-block;
  background: var(--ciclo-color);
  color: white;
  padding: 4px 10px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 700;
  margin-bottom: 10px;
}

.cifras-grid {
  display: flex;
  gap: 20px;
  margin: 12px 0;
  padding: 12px;
  background: white;
  border-radius: 8px;
  border: 1px solid #e2e8f0;
}

.cifras-grid div {
  display: flex;
  flex-direction: column;
}

.lbl {
  font-size: 11px;
  color: #64748b;
  text-transform: uppercase;
  font-weight: 600;
}

.val {
  font-size: 14px;
  font-weight: 700;
  color: #0f172a;
}

.text-green {
  color: #10b981;
}

.saldo-pendiente {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 14px;
  font-weight: 600;
  color: #334155;
  padding-top: 10px;
  border-top: 1px dashed #cbd5e1;
}

.saldo-pendiente span {
  font-size: 18px;
  font-weight: 800;
  color: #b45309;
}

/* Diseño para modo Suelta */
.suelta-mode {
  background: #f0fdfa;
  border-color: #5eead4;
}

.suelta-txt {
  font-size: 15px;
  color: #0f766e;
  margin: 10px 0 4px;
}

.aviso-txt {
  font-size: 12px;
  color: #64748b;
  margin: 0;
  line-height: 1.4;
}

/* Controles modernos tipo Radio Card */
.radio-group {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.radio-card {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  border: 2px solid #e2e8f0;
  padding: 12px;
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
  background: white;
}

.radio-card:hover {
  border-color: #cbd5e1;
}

.radio-card.active {
  border-color: #0ea5e9;
  background: #f0f9ff;
}

.radio-card input {
  margin-top: 4px;
  accent-color: #0ea5e9;
}

.rc-content {
  display: flex;
  flex-direction: column;
}

.rc-content strong {
  font-size: 13px;
  color: #0f172a;
}

.rc-content span {
  font-size: 12px;
  color: #64748b;
}

.radio-card.active .rc-content span {
  color: #0284c7;
  font-weight: 600;
}

.monto-input {
  font-size: 16px;
  font-weight: bold;
  color: #0f172a;
}

.monto-input:disabled {
  background-color: #f1f5f9;
  color: #64748b;
}

.req {
  color: #ef4444;
}
</style>