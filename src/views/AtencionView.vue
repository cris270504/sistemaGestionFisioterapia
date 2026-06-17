<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { supabase } from '@/lib/supabaseClient'
import { useAlert } from '@/composables/useAlert'

const route = useRoute()
const router = useRouter()
const { showAlert } = useAlert()

const idSesion = route.params.idSesion
const loading = ref(true)
const saving = ref(false)

// ── Estados Principales ──
const sesion = ref(null)
const paciente = ref(null)

// ── Campos para Tratamiento (Sesión regular) ──
const notasEvolucion = ref('')
const indicaciones = ref('')

// ── Campos para Evaluación Inicial ──
const idEvaluacion = ref(null)
const motivoConsulta = ref('')
const apuntesGenerales = ref('')
const ejerciciosRealizados = ref('')
const observacionesEval = ref('')

// Determina dinámicamente qué formulario mostrar
const isEvaluacion = computed(() => sesion.value?.tipo === 'evaluacion')

const antecedentes = ref({
  alergias: '',
  familiares: '',
  traumatologicos: '',
  quirurgicos: '',
  observaciones: ''
})
const showModalAntecedentes = ref(false)
const savingAntecedentes = ref(false)

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

    if (dataSesion.tipo === 'evaluacion') {
      const { data: dataEval, error: errEval } = await supabase
        .from('Evaluacion_inicial')
        .select('*')
        .eq('idSesion', idSesion)
        .maybeSingle()

      if (errEval) throw errEval

      if (dataEval) {
        idEvaluacion.value = dataEval.idEvaluacionInicial
        motivoConsulta.value = dataEval.motivo_consulta || ''
        apuntesGenerales.value = dataEval.apuntes_generales || ''
        ejerciciosRealizados.value = dataEval.ejercicios_realizados || ''
        observacionesEval.value = dataEval.observaciones || ''
      }
    } else {
      notasEvolucion.value = dataSesion.notas_evolucion || ''
      indicaciones.value = dataSesion.indicaciones || ''
    }

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

const guardarAtencion = async () => {
  saving.value = true
  try {
    if (isEvaluacion.value) {
      // ── GUARDADO DE EVALUACIÓN INICIAL ──
      const payloadEvaluacion = {
        idPaciente: sesion.value.idPaciente,
        idFisioterapeuta: sesion.value.idFisioterapeuta,
        fecha: new Date().toISOString(),
        motivo_consulta: motivoConsulta.value.trim(),
        apuntes_generales: apuntesGenerales.value.trim(),
        ejercicios_realizados: ejerciciosRealizados.value.trim() || null,
        observaciones: observacionesEval.value.trim() || null,
        idSesion: sesion.value.idSesion,
        idTratamiento: sesion.value.idTratamiento || null
      }

      if (idEvaluacion.value) {
        const { error } = await supabase.from('Evaluacion_inicial').update(payloadEvaluacion).eq('idEvaluacionInicial', idEvaluacion.value)
        if (error) throw error
      } else {
        const { error } = await supabase.from('Evaluacion_inicial').insert(payloadEvaluacion)
        if (error) throw error
      }

      // ✅ CAMBIO DE ESTADO A 'ATENDIDA' TRAS GUARDAR LA EVALUACIÓN
      const { error: errUpdateSesion } = await supabase
        .from('Sesion')
        .update({ estado: 'atendida' })
        .eq('idSesion', idSesion)
      if (errUpdateSesion) throw errUpdateSesion

    } else {
      // ── GUARDADO DE SESIÓN DE TRATAMIENTO Y CAMBIO DE ESTADO ──
      const { error } = await supabase
        .from('Sesion')
        .update({
          notas_evolucion: notasEvolucion.value.trim(),
          indicaciones: indicaciones.value.trim(),
          estado: 'atendida' // ✅ CAMBIO DE ESTADO AQUÍ
        })
        .eq('idSesion', idSesion)
      if (error) throw error
    }

    showAlert('📝 Registro clínico guardado y sesión finalizada.', 'success')
    router.push('/citas')
  } catch (err) {
    showAlert('Error al guardar: ' + err.message, 'error')
  } finally {
    saving.value = false
  }
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

onMounted(() => {
  cargarSesionClinica()
})
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
      <button class="btn-secondary" @click="router.push('/citas')" :disabled="saving">
        &larr; Volver a la Agenda
      </button>
    </div>

    <div v-if="loading" style="padding: 40px; text-align: center; color: var(--gray-500);">
      <span class="spinner" style="display:inline-block; margin-right:8px; border-top-color: var(--blue);"></span>
      Cargando expediente...
    </div>

    <div v-else class="form-grid span-2" style="grid-template-columns: 1fr 2fr; gap: 24px; align-items: start;">

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
              :style="{ color: isEvaluacion ? '#0f766e' : 'var(--blue)', fontWeight: '600', textTransform: 'capitalize' }">
              {{ isEvaluacion ? 'Evaluación Inicial' : 'Sesión de Tratamiento' }}
            </span>
          </p>
          <p v-if="!isEvaluacion" style="margin: 0;"><strong>Sesión N°:</strong> {{ sesion.numero_sesion }}</p>
        </div>

        <button type="button" class="btn-secondary"
          style="width: 100%; margin-top: 20px; display: flex; justify-content: center; gap: 8px;"
          @click="showModalAntecedentes = true">
          📋 Ver / Editar Antecedentes
        </button>
      </div>

      <div class="data-card" style="padding: 24px;">
        <form @submit.prevent="guardarAtencion" style="display: flex; flex-direction: column; gap: 20px;">

          <template v-if="isEvaluacion">
            <div class="input-group">
              <label>Motivo de Consulta <span class="req">*</span></label>
              <textarea v-model="motivoConsulta" rows="3"
                placeholder="Síntomas principales, zona de dolor, tiempo de evolución..." required></textarea>
            </div>

            <div class="input-group">
              <label>Apuntes Generales (Anamnesis / Exploración Física) <span class="req">*</span></label>
              <textarea v-model="apuntesGenerales" rows="5"
                placeholder="Postura, rango de movimiento, fuerza muscular, pruebas especiales..." required></textarea>
            </div>

            <div class="form-grid">
              <div class="input-group">
                <label>Ejercicios Realizados en Evaluación (Opcional)</label>
                <textarea v-model="ejerciciosRealizados" rows="3"
                  placeholder="Ejercicios de prueba de tolerancia..."></textarea>
              </div>
              <div class="input-group">
                <label>Observaciones Adicionales (Opcional)</label>
                <textarea v-model="observacionesEval" rows="3"
                  placeholder="Alergias, recomendaciones preventivas..."></textarea>
              </div>
            </div>
          </template>

          <template v-else>
            <div class="input-group">
              <label>Notas de Evolución (SOAP / Procedimientos realizados) <span class="req">*</span></label>
              <textarea v-model="notasEvolucion" rows="6"
                placeholder="Describa el progreso del paciente, técnicas aplicadas y respuesta al tratamiento..."
                required></textarea>
            </div>

            <div class="input-group">
              <label>Indicaciones para el hogar (Opcional)</label>
              <textarea v-model="indicaciones" rows="4"
                placeholder="Ej: Reposo relativo, aplicación de compresas frías por 15 min..."></textarea>
            </div>
          </template>

          <div
            style="display: flex; justify-content: flex-end; margin-top: 10px; border-top: 1px solid var(--gray-100); padding-top: 20px;">
            <button type="submit" class="primary-btn" :disabled="saving"
              style="background: #10b981; padding: 12px 24px;">
              <span v-if="saving" class="btn-spinner"></span>
              <span v-else>💾 Guardar y Finalizar Sesión</span>
            </button>
          </div>

        </form>
      </div>

    </div>

    <!-- ── MODAL: ANTECEDENTES CLÍNICOS ── -->
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

              <div class="input-group">
                <label>Antecedentes Quirúrgicos</label>
                <textarea v-model="antecedentes.quirurgicos" rows="2"
                  placeholder="Cirugías previas, implantes, material de osteosíntesis..."></textarea>
              </div>

              <div class="input-group">
                <label>Antecedentes Traumatológicos</label>
                <textarea v-model="antecedentes.traumatologicos" rows="2"
                  placeholder="Fracturas, esguinces crónicos, luxaciones..."></textarea>
              </div>

              <div class="input-group">
                <label>Antecedentes Familiares</label>
                <textarea v-model="antecedentes.familiares" rows="2"
                  placeholder="Enfermedades hereditarias, artritis reumatoide..."></textarea>
              </div>

              <div class="input-group">
                <label>Observaciones / Enfermedades Crónicas</label>
                <textarea v-model="antecedentes.observaciones" rows="2"
                  placeholder="Hipertensión, diabetes, marcapasos..."></textarea>
              </div>

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

<style scoped>
.req {
  color: #ef4444;
}

textarea {
  font-size: 14px;
  line-height: 1.5;
  resize: vertical;
}

@media (max-width: 768px) {
  .span-2 {
    grid-template-columns: 1fr !important;
  }
}

/* Asegura que el contenedor principal esté bien alineado */
.form-grid {
  display: grid;
  grid-template-columns: 1fr 2fr;
  gap: 24px;
  align-items: start;
  /* <--- Esto es clave para que la tarjeta no se estire */
}

/* Mejora la tarjeta fija */
.data-card {
  /* Añade esto si sientes que queda muy pegada al borde superior */
  top: 80px;
  /* Ajusta según la altura de tu navbar superior */
}
</style>