<script setup>
import { ref, onMounted } from 'vue'
import { supabase } from '@/lib/supabaseClient'
import { useAlert } from '@/composables/useAlert'

const { showAlert, showConfirm } = useAlert()

const loading = ref(false)
const userId = ref(null)
const horarios = ref([]) // Estado local de todos los turnos en pantalla

// Diccionario de días para iterar la interfaz
const DIAS_SEMANA = [
  { id: 1, label: 'Lunes' },
  { id: 2, label: 'Martes' },
  { id: 3, label: 'Miércoles' },
  { id: 4, label: 'Jueves' },
  { id: 5, label: 'Viernes' },
  { id: 6, label: 'Sábado' },
  { id: 7, label: 'Domingo' }
]

// Cargar los horarios actuales del fisioterapeuta en sesión
const fetchHorarios = async () => {
  loading.value = true
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) throw new Error('No hay sesión activa.')
    userId.value = user.id

    const { data, error } = await supabase
      .from('Horario')
      .select('*')
      .eq('idFisioterapeuta', userId.value)
      .order('dia_semana', { ascending: true })
      .order('hora_inicio', { ascending: true })

    if (error) throw error

    // Formateamos las horas para los inputs tipo "time" (de HH:mm:ss a HH:mm)
    horarios.value = data.map(h => ({
      dia_semana: h.dia_semana,
      hora_inicio: h.hora_inicio.substring(0, 5),
      hora_fin: h.hora_fin.substring(0, 5)
    }))
  } catch (error) {
    showAlert('Error al cargar tu horario: ' + error.message, 'error')
  } finally {
    loading.value = false
  }
}

// Helpers para la interfaz
const getTurnosPorDia = (idDia) => horarios.value.filter(h => h.dia_semana === idDia)

const agregarTurno = (idDia) => {
  horarios.value.push({ dia_semana: idDia, hora_inicio: '08:00', hora_fin: '13:00' })
}

const removerTurno = (turno) => {
  horarios.value = horarios.value.filter(h => h !== turno)
}

// Lógica de Guardado (Batch Save)
const guardarHorarios = async () => {
  // 1. Validaciones lógicas
  for (let turno of horarios.value) {
    if (!turno.hora_inicio || !turno.hora_fin) {
      showAlert('Todos los turnos deben tener una hora de inicio y fin válidas.', 'error')
      return
    }
    if (turno.hora_inicio >= turno.hora_fin) {
      showAlert(`Hay un error lógico: La hora de inicio (${turno.hora_inicio}) no puede ser mayor o igual a la de fin.`, 'error')
      return
    }
  }

  const confirmado = await showConfirm('¿Deseas guardar estos horarios? Esto actualizará tu disponibilidad en el sistema de citas.')
  if (!confirmado) return

  loading.value = true
  try {
    // 2. Eliminamos los registros anteriores del fisioterapeuta
    const { error: errDel } = await supabase
      .from('Horario')
      .delete()
      .eq('idFisioterapeuta', userId.value)

    if (errDel) throw errDel

    // 3. Insertamos el nuevo bloque de horarios completo
    if (horarios.value.length > 0) {
      const inserts = horarios.value.map(h => ({
        idFisioterapeuta: userId.value,
        dia_semana: h.dia_semana,
        hora_inicio: h.hora_inicio,
        hora_fin: h.hora_fin
      }))

      const { error: errIns } = await supabase
        .from('Horario')
        .insert(inserts)

      if (errIns) throw errIns
    }

    showAlert('¡Tu horario ha sido actualizado con éxito!', 'success')
    await fetchHorarios() // Recargar para sincronizar
  } catch (error) {
    showAlert('Error al guardar: ' + error.message, 'error')
  } finally {
    loading.value = false
  }
}

onMounted(() => {
  fetchHorarios()
})
</script>

<template>
  <div class="view-container">

    <div class="action-header">
      <div class="header-text">
        <h2>Mi Disponibilidad</h2>
        <p>Configura tus bloques de atención para que recepción pueda agendarte citas.</p>
      </div>
      <button class="primary-btn" @click="guardarHorarios" :disabled="loading">
        <span v-if="loading" class="btn-spinner"></span>
        <span v-else>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="btn-icon">
            <path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" />
          </svg>
          Guardar Horarios
        </span>
      </button>
    </div>

    <div class="horarios-grid">
      <div v-for="dia in DIAS_SEMANA" :key="dia.id" class="data-card dia-card">
        
        <div class="dia-header">
          <h3>{{ dia.label }}</h3>
          <button class="btn-add-turno" @click="agregarTurno(dia.id)" title="Agregar bloque de hora">
            + Añadir Turno
          </button>
        </div>

        <div class="dia-body">
          <div v-if="getTurnosPorDia(dia.id).length === 0" class="dia-libre">
            Día Libre (Sin atención)
          </div>

          <div v-for="(turno, index) in getTurnosPorDia(dia.id)" :key="index" class="turno-row">
            <input type="time" v-model="turno.hora_inicio" required />
            <span>a</span>
            <input type="time" v-model="turno.hora_fin" required />
            <button type="button" class="btn-remove" @click="removerTurno(turno)" title="Eliminar turno">
              &times;
            </button>
          </div>
        </div>
        
      </div>
    </div>

  </div>
</template>

<style scoped>
.horarios-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 16px;
  align-items: start;
}

.dia-card {
  padding: 0;
  display: flex;
  flex-direction: column;
}

.dia-header {
  background: var(--gray-50);
  padding: 12px 16px;
  border-bottom: 1px solid var(--gray-100);
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.dia-header h3 {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
}

.btn-add-turno {
  background: none;
  border: none;
  color: var(--blue);
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
  padding: 4px;
}
.btn-add-turno:hover { text-decoration: underline; }

.dia-body {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.dia-libre {
  text-align: center;
  color: var(--gray-500);
  font-size: 12.5px;
  font-style: italic;
  padding: 10px;
  background: #f8fafc;
  border-radius: 6px;
  border: 1px dashed var(--gray-300);
}

.turno-row {
  display: flex;
  align-items: center;
  gap: 8px;
}

.turno-row input[type="time"] {
  flex: 1;
  padding: 6px;
  border: 1.5px solid var(--gray-200);
  border-radius: 6px;
  font-family: inherit;
  font-size: 13px;
  color: var(--navy);
  outline: none;
}
.turno-row input[type="time"]:focus { border-color: var(--blue); }

.turno-row span {
  font-size: 12px;
  color: var(--gray-500);
  font-weight: 500;
}

.btn-remove {
  background: #fee2e2;
  color: #ef4444;
  border: none;
  width: 24px;
  height: 24px;
  border-radius: 4px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 16px;
  font-weight: bold;
  cursor: pointer;
  transition: opacity 0.2s;
}
.btn-remove:hover { opacity: 0.8; }
</style>