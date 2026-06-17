<script setup>
/**
 * ModalReprogramarCita.vue — v3 BLINDADO
 * * MEJORAS:
 * - Usa getTodayISO para fechas en todo el componente
 * - Eliminado toISOString() para evitar desfase de UTC-5
 * - Usa useSearch para búsqueda
 */
import { ref, watch, computed } from 'vue'
import { useCitas } from '@/composables/useCitas'
import { useSearch } from '@/composables/useSearch'
import { getTodayISO } from '@/lib/dateUtils'

const props = defineProps({
  isOpen: { type: Boolean, required: true },
  sesion: { type: Object, default: null },
  fisios: { type: Array, default: () => [] },
  loadingAccion: { type: Boolean, default: false }
})

const emit = defineEmits(['close', 'submit'])
const { obtenerSlotsDisponibles } = useCitas()

const idFisioterapeuta = ref(null)
const fecha = ref('')
const hora = ref('')
const motivo = ref('')

// ✅ Usando useSearch para búsqueda consistente
const { 
  searchQuery: searchFisio, 
  filteredItems: fisiosFiltrados 
} = useSearch(computed(() => props.fisios), (f) => 
  `${f.Persona?.nombres} ${f.Persona?.apellidos}`.toLowerCase()
)

const showFisioList = ref(false)
const slotsDisponibles = ref([])
const loadingSlots = ref(false)

const fechaMin = computed(() => getTodayISO())

const slotsFiltrados = computed(() => {
  if (loadingSlots.value) return [];

  const ahora = new Date();
  // ✅ CORRECCIÓN: Usamos tu función local para evitar que brinque al día siguiente en la noche
  const fechaHoy = getTodayISO();

  if (fecha.value !== fechaHoy) return slotsDisponibles.value;

  const horaActual = ahora.getHours();
  const minActual = ahora.getMinutes();

  return slotsDisponibles.value.filter(slot => {
    const [h, m] = slot.split(':').map(Number);
    return h > horaActual || (h === horaActual && m > minActual);
  });
});

// Precargar datos al abrir
watch(() => props.isOpen, (abierto) => {
  if (abierto && props.sesion) {
    idFisioterapeuta.value = props.sesion.idFisioterapeuta
    const fisioActual = props.fisios.find(f => f.idFisioterapeuta === idFisioterapeuta.value)
    searchFisio.value = fisioActual ? `${fisioActual.Persona?.nombres} ${fisioActual.Persona?.apellidos}` : ''
    fecha.value = ''
    hora.value = ''
    motivo.value = ''
    slotsDisponibles.value = []
  }
})

const seleccionarFisio = (f) => {
  idFisioterapeuta.value = f.idFisioterapeuta
  searchFisio.value = `${f.Persona?.nombres} ${f.Persona?.apellidos}`
  showFisioList.value = false
}

const hideFisioDelay = () => setTimeout(() => { showFisioList.value = false }, 200)

// Calcular horarios al cambiar fisio o fecha
watch([idFisioterapeuta, fecha], async ([idFisio, f]) => {
  if (!idFisio || !f) { slotsDisponibles.value = []; hora.value = ''; return }
  loadingSlots.value = true
  const duracion = props.sesion?.tipo === 'evaluacion' ? 20 : 60
  slotsDisponibles.value = await obtenerSlotsDisponibles(idFisio, f, duracion)
  if (!slotsDisponibles.value.includes(hora.value)) hora.value = ''
  loadingSlots.value = false
})

const handleSubmit = () => {
  if (!fecha.value || !hora.value || !motivo.value.trim()) return

  // ✅ CORRECCIÓN: Forzamos el string exacto con la zona horaria -05:00
  const fechaHoraIso = `${fecha.value}T${hora.value}:00-05:00`

  emit('submit', {
    idSesion: props.sesion.idSesion,
    idFisioterapeutaNuevo: idFisioterapeuta.value,
    nuevaFechaHora: fechaHoraIso,
    motivo: motivo.value
  })
}
</script>

<template>
  <Transition name="fade-modal">
    <div v-if="isOpen" class="modal-overlay" @click.self="emit('close')">
      <div class="modal-window" style="max-width: 500px;">
        <div class="modal-header">
          <h3>Reprogramar Cita</h3>
          <button class="close-x" @click="emit('close')" :disabled="loadingAccion">&times;</button>
        </div>

        <form @submit.prevent="handleSubmit" class="modal-form">
          <div class="cancelacion-aviso"
            style="margin-bottom: 16px; background: #e0f2fe; border-color: #bae6fd; color: #0369a1;">
            <strong>Atención:</strong> Las citas solo pueden ser reprogramadas 1 vez.
          </div>

          <div class="input-group" style="position: relative;">
            <label>Nuevo Fisioterapeuta <span class="req">*</span></label>
            <input type="text" v-model="searchFisio" @focus="showFisioList = true" @blur="hideFisioDelay"
              placeholder="🔍 Buscar especialista..." required class="search-input"
              :class="{ 'is-selected': idFisioterapeuta }" />
            <ul v-if="showFisioList && fisiosFiltrados.length > 0" class="options-list">
              <li v-for="f in fisiosFiltrados" :key="f.idFisioterapeuta" @click="seleccionarFisio(f)">
                <div class="li-name">{{ f.Persona?.nombres }} {{ f.Persona?.apellidos }}</div>
                <div class="li-sub">{{ f.especialidad }}</div>
              </li>
            </ul>
          </div>

          <div class="form-grid">
            <div class="input-group">
              <label>Nueva Fecha <span class="req">*</span></label>
              <input type="date" v-model="fecha" :min="fechaMin" required />
            </div>
            <div class="input-group">
              <label>Nuevo Horario <span class="req">*</span></label>
              <select v-model="hora" required :disabled="!fecha || !idFisioterapeuta || loadingSlots">
                <option value="" disabled>{{ loadingSlots ? 'Buscando huecos...' : '— Seleccione hora —' }}</option>
                <option v-for="slot in slotsFiltrados" :key="slot" :value="slot">
                  {{ slot }}
                </option>
              </select>
              <p v-if="fecha && idFisioterapeuta && slotsFiltrados.length === 0 && !loadingSlots"
                class="field-hint warn">
                ⚠️ No hay horarios disponibles para el resto del día.
              </p>
            </div>
          </div>

          <div class="input-group">
            <label>Motivo de la reprogramación <span class="req">*</span></label>
            <textarea v-model="motivo" rows="3" placeholder="Ej: El paciente solicitó cambio de turno..." required
              maxlength="250"></textarea>
          </div>

          <div class="modal-actions">
            <button type="button" class="btn-secondary" @click="emit('close')"
              :disabled="loadingAccion">Cancelar</button>
            <button type="submit" class="btn-primary-submit"
              :disabled="loadingAccion || !hora || !fecha || !motivo.trim()">
              <span v-if="loadingAccion">Procesando...</span>
              <span v-else>Confirmar Reprogramación</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.cancelacion-aviso {
  font-size: 12.5px;
  border: 1px solid;
  border-radius: var(--radius-sm);
  padding: 12px;
}

.search-input {
  width: 100%;
  padding-right: 30px !important;
}

.search-input.is-selected {
  background-color: #f0fdf4 !important;
  border-color: #10b981 !important;
  color: #065f46;
  font-weight: 600;
}

.options-list {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  background: white;
  border: 1px solid var(--gray-200);
  border-radius: var(--radius-sm);
  max-height: 180px;
  overflow-y: auto;
  z-index: 50;
  margin: 4px 0 0 0;
  padding: 0;
  list-style: none;
  box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
}

.options-list li {
  padding: 10px 12px;
  cursor: pointer;
  border-bottom: 1px solid var(--gray-50);
  transition: background 0.2s;
}

.options-list li:hover {
  background: #f0f7ff;
}

.li-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--navy);
}

.li-sub {
  font-size: 11.5px;
  color: var(--gray-500);
}

.req {
  color: #ef4444;
}

.field-hint {
  margin: 0;
  font-size: 11.5px;
  color: var(--gray-500);
  line-height: 1.4;
}

.field-hint.warn {
  color: #b45309;
}
</style>