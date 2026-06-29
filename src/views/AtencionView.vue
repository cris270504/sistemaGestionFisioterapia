<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { supabase } from '@/lib/supabaseClient'
import { useAlert } from '@/composables/useAlert'

// ── IMPORTACIÓN DE TUS NUEVOS COMPONENTES MODULARES ──
import FichaEvaluacionInicial from '@/components/FichaEvaluacionInicial.vue'
import FormularioEvolucion from '@/components/FormularioEvolucion.vue'

const route = useRoute()
const router = useRouter()
const { showAlert } = useAlert()

const idSesion = route.params.idSesion
const loading = ref(true)

// ── Estados Principales ──
const sesion = ref(null)
const paciente = ref(null)

// ── Lógica de UI ──
const showModalAntecedentes = ref(false)
const savingAntecedentes = ref(false)
const verFichaHistorica = ref(false) // Controla el modal de lectura pedido por la fisio

const antecedentes = ref({
  alergias: '',
  familiares: '',
  traumatologicos: '',
  quirurgicos: '',
  observaciones: ''
})

// Determina dinámicamente qué componente renderizar
const isEvaluacion = computed(() => sesion.value?.tipo === 'evaluacion' || sesion.value?.es_evaluacion_inicial)
const isMasaje = computed(() => sesion.value?.tipo === 'masaje') // 👈 Detecta si es una cita de masajes

const tipoMasaje = ref('')
const comentarioMasaje = ref('')
const savingMasaje = ref(false)

const guardarAtencionMasaje = async () => {
  if (!tipoMasaje.value.trim()) {
    showAlert('Por favor, especifique el tipo de masaje realizado.', 'error')
    return
  }

  savingMasaje.value = true
  try {
    // Concatenamos de forma limpia los dos datos dentro del campo notas_evolucion
    const NotasEvolucionFinal = `Tipo de Masaje: ${tipoMasaje.value.trim()} | Observaciones: ${comentarioMasaje.value.trim() || 'Sin observaciones adicionales.'}`

    const { error } = await supabase
      .from('Sesion')
      .update({
        notas_evolucion: NotasEvolucionFinal,
        estado: 'atendida' // Transiciona la cita directamente a atendida
      })
      .eq('idSesion', idSesion)

    if (error) throw error

    showAlert('💆 Sesión de masaje registrada correctamente.', 'success')
    router.push('/citas')
  } catch (err) {
    showAlert('Error al registrar la atención de masaje: ' + err.message, 'error')
  } finally {
    savingMasaje.value = false
  }
}

const cargarSesionClinica = async () => {
  try {
    const { data: dataSesion, error: errSesion } = await supabase
      .from('Sesion')
      .select(`
        *,
        Paciente (
          idPaciente,
          Persona (nombres, apellidos, numero_documento, fecha_nacimiento)
        )
      `)
      .eq('idSesion', idSesion)
      .single()

    if (errSesion) throw errSesion

    sesion.value = dataSesion
    paciente.value = dataSesion.Paciente.Persona

    // Cargamos Antecedentes para la barra lateral
    const { data: dataAntec, error: errAntec } = await supabase
      .from('Antecedentes')
      .select('*')
      .eq('idPaciente', dataSesion.idPaciente)
      .maybeSingle()

    if (errAntec) throw errAntec

    if (dataAntec) {
      antecedentes.value = {
        alergias: dataAntec.alergias || '',
        familiares: dataAntec.familiares || '',
        traumatologicos: dataAntec.traumatologicos || '',
        quirurgicos: dataAntec.quirurgicos || '',
        observaciones: dataAntec.observaciones || ''
      }
    }

    // NOTA TECH LEAD: Hemos eliminado la carga de Evaluacion_inicial aquí.
    // De eso se encarga ahora tu FichaEvaluacionInicial internamente.

  } catch (err) {
    showAlert('Error al cargar expediente: ' + err.message, 'error')
    router.push('/citas')
  } finally {
    loading.value = false
  }
}

const calcularEdad = (fechaNacimiento) => {
  if (!fechaNacimiento) return 'No registrada'
  const hoy = new Date()
  const nac = new Date(fechaNacimiento)
  let edad = hoy.getFullYear() - nac.getFullYear()
  const m = hoy.getMonth() - nac.getMonth()
  if (m < 0 || (m === 0 && hoy.getDate() < nac.getDate())) edad--
  return `${edad} años`
}

const guardarAntecedentes = async () => {
  savingAntecedentes.value = true
  try {
    const payload = {
      idPaciente: sesion.value.idPaciente,
      alergias: antecedentes.value.alergias.trim() || null,
      familiares: antecedentes.value.familiares.trim() || null,
      traumatologicos: antecedentes.value.traumatologicos.trim() || null,
      quirurgicos: antecedentes.value.quirurgicos.trim() || null,
      observaciones: antecedentes.value.observaciones.trim() || null,
      update_at: new Date().toISOString()
    }

    const { error } = await supabase
      .from('Antecedentes')
      .upsert(payload, { onConflict: 'idPaciente' })

    if (error) throw error

    showAlert('📋 Antecedentes clínicos actualizados.', 'success')
    showModalAntecedentes.value = false
  } catch (err) {
    showAlert('Error al guardar antecedentes: ' + err.message, 'error')
  } finally {
    savingAntecedentes.value = false
  }
}

// Escucha el evento de completado desde cualquiera de los dos componentes hijos
const finalizarAtencion = async () => {
  try {
    // Por si el componente no cambió el estado, lo forzamos aquí a modo de seguro
    await supabase.from('Sesion').update({ estado: 'atendida' }).eq('idSesion', idSesion)
    showAlert('📝 Registro clínico guardado y sesión finalizada.', 'success')
    router.push('/citas')
  } catch (err) {
    showAlert('Error al cambiar el estado de la cita.', 'error')
  }
}

const mostrarFichaHistorica = () => { verFichaHistorica.value = true }

onMounted(() => { cargarSesionClinica() })
</script>

<template>
  <div class="view-container">

    <div class="action-header">
      <div class="header-text">
        <h2>Registro Clínico</h2>
        <p v-if="!loading">
          {{ isEvaluacion ? 'Diagnóstico y evaluación inicial del paciente.' : 'Evolución y seguimiento de la sesión actual.' }}
        </p>
      </div>
      <button class="btn-secondary" @click="router.push('/citas')">
        &larr; Volver a la Agenda
      </button>
    </div>

    <div v-if="loading" style="padding: 40px; text-align: center; color: var(--gray-500);">
      <span class="spinner" style="display:inline-block; margin-right:8px; border-top-color: var(--blue);"></span>
      Cargando expediente...
    </div>

    <div v-else class="form-grid span-2" style="grid-template-columns: 1fr 2.5fr; gap: 24px; align-items: start;">

      <div class="data-card" style="padding: 20px; position: sticky; top: 20px;">
        <div
          style="display: flex; align-items: center; gap: 12px; margin-bottom: 16px; padding-bottom: 16px; border-bottom: 1px solid var(--gray-100);">
          <div
            style="width: 48px; height: 48px; border-radius: 50%; background: var(--blue-light); display: flex; align-items: center; justify-content: center; color: white; font-weight: bold; font-size: 18px;">
            {{ paciente.nombres.charAt(0) }}{{ paciente.apellidos.charAt(0) }}
          </div>
          <div>
            <h3 style="margin: 0; font-size: 16px; color: var(--navy);">{{ paciente.nombres }} {{ paciente.apellidos }}
            </h3>
            <span style="font-size: 12px; color: var(--gray-500);">Doc: {{ paciente.numero_documento }}</span>
          </div>
        </div>

        <div v-if="antecedentes.alergias"
          style="margin-top: 12px; margin-bottom: 16px; padding: 8px 12px; background: #fef2f2; border: 1px solid #fca5a5; border-radius: 6px; color: #991b1b; font-size: 12.5px; font-weight: 600;">
          ⚠️ ALERGIAS REPORTADAS: <span style="font-weight: 400;">{{ antecedentes.alergias }}</span>
        </div>

        <div style="font-size: 13.5px; color: var(--gray-700); display: flex; flex-direction: column; gap: 10px;">
          <p style="margin: 0;"><strong>Edad:</strong> {{ calcularEdad(paciente.fecha_nacimiento) }}</p>
          <p style="margin: 0;">
            <strong>Tipo de Cita: </strong>
            <span
              :style="{ color: isEvaluacion ? '#0f766e' : (isMasaje ? '#d97706' : 'var(--blue)'), fontWeight: '600', textTransform: 'capitalize' }">
              {{ isEvaluacion ? 'Evaluación Inicial' : (isMasaje ? 'Sesión de Masajes' : 'Sesión de Tratamiento') }}
            </span>
          </p>
          <p v-if="!isEvaluacion" style="margin: 0;"><strong>Sesión N°:</strong> {{ sesion.numero_sesion }}</p>
        </div>

        <button type="button" class="btn-secondary"
          style="width: 100%; margin-top: 20px; display: flex; justify-content: center; gap: 8px;"
          @click="showModalAntecedentes = true">
          📋 Ver / Editar Antecedentes
        </button>

        <button type="button" class="btn-secondary"
          style="width: 100%; margin-top: 10px; display: flex; justify-content: center; gap: 8px; background: #ccfbf1; color: #0f766e; border-color: #99f6e4;"
          @click="router.push({ name: 'HistoriaClinica', params: { idPaciente: sesion.idPaciente } })">
          📚 Ver Historial Completo
        </button>
      </div>

      <div class="data-card" style="padding: 24px;">

        <FichaEvaluacionInicial v-if="isEvaluacion" :idSesion="sesion.idSesion" :idTratamiento="sesion.idTratamiento"
          :idPaciente="sesion.idPaciente" :idFisioterapeuta="sesion.idFisioterapeuta" @completado="finalizarAtencion" />

        <div v-else-if="isMasaje" class="masaje-atencion-box">
          <div
            style="display: flex; align-items: center; gap: 12px; margin-bottom: 24px; padding-bottom: 12px; border-bottom: 1px solid #e2e8f0;">
            <span style="font-size: 28px;">💆</span>
            <div>
              <h3 style="margin: 0; font-size: 18px; color: #d97706; font-weight: 700;">Atención de Sesión de Masajes
              </h3>
              <p style="margin: 0; font-size: 13px; color: var(--gray-500);">Registro rápido y simplificado para masajes
                independientes</p>
            </div>
          </div>

          <div style="display: flex; flex-direction: column; gap: 20px;">
            <div style="display: flex; flex-direction: column; gap: 8px;">
              <label style="font-size: 14px; font-weight: 600; color: #334155;">Tipo de Masaje Realizado <span
                  style="color: #ef4444;">*</span></label>
              <input type="text"
                style="width: 100%; padding: 10px 14px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 14px;"
                placeholder="Ej: Relajante, Descontracturante, Deportivo, Drenaje..." v-model="tipoMasaje" />
            </div>

            <div style="display: flex; flex-direction: column; gap: 8px;">
              <label style="font-size: 14px; font-weight: 600; color: #334155;">Comentarios u Observaciones
                Adicionales</label>
              <textarea
                style="width: 100%; padding: 10px 14px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 14px; resize: vertical;"
                rows="6" placeholder="Escriba aquí los detalles observados durante la sesión de masaje..."
                v-model="comentarioMasaje"></textarea>
            </div>

            <div
              style="display: flex; justify-content: flex-end; margin-top: 10px; border-top: 1px solid #e2e8f0; padding-top: 20px;">
              <button type="button"
                style="background: #d97706; color: white; border: none; padding: 12px 24px; border-radius: 8px; font-size: 15px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 8px;"
                @click="guardarAtencionMasaje" :disabled="savingMasaje || !tipoMasaje.trim()">
                <span v-if="savingMasaje" class="spinner"></span>
                <span v-else>💾 Registrar Atención de Masaje</span>
              </button>
            </div>
          </div>
        </div>

        <FormularioEvolucion v-else :idSesion="sesion.idSesion" @guardado="finalizarAtencion"
          @ver-ficha-inicial="mostrarFichaHistorica" />

      </div>
    </div>

    <Transition name="fade-modal">
      <div v-if="verFichaHistorica" class="modal-overlay" @click.self="verFichaHistorica = false">
        <div class="modal-window" style="max-width: 900px; max-height: 90vh; display: flex; flex-direction: column;">
          <div class="modal-header">
            <h3>Ficha de Evaluación Inicial Original</h3>
            <button class="close-x" @click="verFichaHistorica = false">&times;</button>
          </div>
          <div class="modal-form" style="overflow-y: auto; padding: 20px;">
            <FichaEvaluacionInicial :idTratamiento="sesion.idTratamiento" :idPaciente="sesion.idPaciente"
              :modoLectura="true" />
          </div>
          <div class="modal-actions" style="padding: 15px; border-top: 1px solid #eee;">
            <button class="btn-secondary" @click="verFichaHistorica = false">Cerrar Ficha</button>
          </div>
        </div>
      </div>
    </Transition>

    <Transition name="fade-modal">
      <div v-if="showModalAntecedentes" class="modal-overlay" @click.self="showModalAntecedentes = false">
        <div class="modal-window" style="max-width: 600px; max-height: 90vh; display: flex; flex-direction: column;">
          <div class="modal-header">
            <h3>Historial Médico y Antecedentes</h3>
            <button class="close-x" @click="showModalAntecedentes = false"
              :disabled="savingAntecedentes">&times;</button>
          </div>
          <div class="modal-form" style="overflow-y: auto; padding-right: 8px;">
            <form @submit.prevent="guardarAntecedentes" style="display: flex; flex-direction: column; gap: 16px;">
              <div class="input-group">
                <label style="color: #991b1b; font-weight: 700;">Alergias Relevantes (Medicamentos, materiales,
                  etc.)</label>
                <textarea v-model="antecedentes.alergias" rows="2"
                  placeholder="Ej: Alergia al látex, paracetamol..."></textarea>
              </div>
              <div class="input-group"><label>Antecedentes Quirúrgicos</label><textarea
                  v-model="antecedentes.quirurgicos" rows="2"></textarea></div>
              <div class="input-group"><label>Antecedentes Traumatológicos</label><textarea
                  v-model="antecedentes.traumatologicos" rows="2"></textarea></div>
              <div class="input-group"><label>Antecedentes Familiares</label><textarea v-model="antecedentes.familiares"
                  rows="2"></textarea></div>
              <div class="input-group"><label>Observaciones / Enfermedades Crónicas</label><textarea
                  v-model="antecedentes.observaciones" rows="2"></textarea></div>

              <div class="modal-actions"
                style="position: sticky; bottom: -20px; background: white; padding-top: 10px; border-top: 1px solid #eee;">
                <button type="button" class="btn-secondary" @click="showModalAntecedentes = false"
                  :disabled="savingAntecedentes">Cerrar</button>
                <button type="submit" class="btn-primary-submit" :disabled="savingAntecedentes">
                  <span v-if="savingAntecedentes" class="btn-spinner"></span>
                  <span v-else>💾 Guardar Antecedentes</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>
    </Transition>

  </div>
</template>
