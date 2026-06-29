<script setup>
import { ref, onMounted, computed } from 'vue'
import { supabase } from '@/lib/supabaseClient'
import { useAlert } from '@/composables/useAlert'

const { showAlert, showConfirm } = useAlert()

const serviciosList = ref([])
const loading = ref(false)
const showModal = ref(false)
const isEditing = ref(false)

const form = ref({
  idServicio: null,
  nombre: '',
  tipo: 'paquete',
  cantidad_sesiones: 5,
  precio: '',
  activo: true
})

const fetchCatalogo = async () => {
  loading.value = true
  try {
    const { data, error } = await supabase
      .from('Catalogo_Servicio')
      .select('*')
      .order('tipo', { ascending: false })
      .order('precio', { ascending: true })

    if (error) throw error
    serviciosList.value = data || []
  } catch (error) {
    showAlert('Error al cargar tarifario: ' + error.message, 'error')
  } finally {
    loading.value = false
  }
}

const clasesTipo = {
  paquete: 'administrador',
  sesion_suelta: 'fisioterapeuta',
  masaje: 'masaje' // Reemplaza 'masaje' por la clase CSS que uses para su color
}

const etiquetasTipo = {
  paquete: 'Paquete',
  sesion_suelta: 'Sesión Suelta',
  masaje: 'Masaje'
}

const openCreateForm = () => {
  isEditing.value = false
  // Simplemente inicializamos el formulario vacío
  form.value = {
    idServicio: null,
    nombre: '',
    tipo: 'paquete', // Por defecto el primero
    cantidad_sesiones: 5,
    precio: '',
    activo: true
  }
  showModal.value = true
}

const openEditForm = (servicio) => {
  isEditing.value = true
  form.value = { ...servicio }
  showModal.value = true
}

const toggleEstado = async (servicio) => {
  try {
    const { error } = await supabase
      .from('Catalogo_Servicio')
      .update({ activo: !servicio.activo })
      .eq('idServicio', servicio.idServicio)

    if (error) throw error
    showAlert(servicio.activo ? 'Servicio desactivado del catálogo.' : 'Servicio reactivado.', 'info')
    await fetchCatalogo()
  } catch (error) {
    showAlert('Error al cambiar estado: ' + error.message, 'error')
  }
}

const handleDelete = async (id) => {
  const confirmado = await showConfirm('¿Eliminar este servicio del catálogo? Los pacientes que ya lo compraron no se verán afectados.')
  if (!confirmado) return

  try {
    const { error } = await supabase.from('Catalogo_Servicio').delete().eq('idServicio', id)
    if (error) throw error
    showAlert('Servicio eliminado del tarifario.', 'success')
    await fetchCatalogo()
  } catch (error) {
    showAlert('No se puede eliminar porque existen registros históricos asociados a este paquete.', 'error')
  }
}

const handleSubmit = async () => {
  if (!form.value.precio || parseFloat(form.value.precio) <= 0) {
    showAlert('El precio debe ser mayor a 0.', 'error')
    return
  }

  if (form.value.tipo === 'sesion_suelta' && sesionIndividual.value && !isEditing.value) {
    showAlert('Error: Ya existe un servicio de Sesión Individual registrado.', 'error')
    return
  }

  // 2. Aplicar lógica de negocio (Forzar nombre y sesiones)
  if (form.value.tipo === 'sesion_suelta') {
    form.value.nombre = 'Sesión Individual'
    form.value.cantidad_sesiones = 1
  } else if (form.value.tipo === 'masaje') {
    // Le asignamos un nombre específico para que no se mezcle en caja
    form.value.nombre = 'Sesión de Masajes'
    form.value.cantidad_sesiones = 1
  } else {
    // Si es paquete, validamos el nombre obligatorio
    if (!form.value.nombre.trim()) {
      showAlert('El nombre del paquete es obligatorio.', 'error')
      return
    }
  }

  loading.value = true
  try {
    if (isEditing.value) {
      const { error } = await supabase
        .from('Catalogo_Servicio')
        .update({
          nombre: form.value.nombre,
          tipo: form.value.tipo,
          cantidad_sesiones: form.value.cantidad_sesiones,
          precio: parseFloat(form.value.precio)
        })
        .eq('idServicio', form.value.idServicio)

      if (error) throw error
      showAlert('Tarifa actualizada correctamente.', 'success')
    } else {
      const { error } = await supabase
        .from('Catalogo_Servicio')
        .insert({
          nombre: form.value.nombre,
          tipo: form.value.tipo,
          cantidad_sesiones: form.value.cantidad_sesiones,
          precio: parseFloat(form.value.precio)
        })

      if (error) throw error
      showAlert('Nuevo servicio agregado al tarifario.', 'success')
    }

    showModal.value = false
    await fetchCatalogo()
  } catch (error) {
    showAlert('Error al guardar: ' + error.message, 'error')
  } finally {
    loading.value = false
  }
}

const sesionIndividual = computed(() =>
  serviciosList.value.find(s => s.tipo === 'sesion_suelta')
)

onMounted(() => fetchCatalogo())
</script>

<template>
  <div class="view-container">
    <div class="action-header">
      <div class="header-text">
        <h2>Tarifario y Paquetes</h2>
        <p>Configura el precio base de las sesiones y diseña paquetes de venta.</p>
      </div>
      <button class="primary-btn" @click="openCreateForm">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="btn-icon">
          <line x1="12" y1="5" x2="12" y2="19"></line>
          <line x1="5" y1="12" x2="19" y2="12"></line>
        </svg>
        Nuevo Servicio
      </button>
    </div>

    <div class="data-card">
      <div class="table-responsive">
        <table class="content-table">
          <thead>
            <tr>
              <th>Nombre del Servicio</th>
              <th>Tipo</th>
              <th>Sesiones</th>
              <th>Precio (S/)</th>
              <th>Estado</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in serviciosList" :key="item.idServicio" :style="!item.activo ? 'opacity: 0.6;' : ''">
              <td class="staff-name">{{ item.nombre }}</td>
              <td>
                <span class="badge" :class="clasesTipo[item.tipo] || 'fisioterapeuta'">
                  {{ etiquetasTipo[item.tipo] || 'Sesión Suelta' }}
                </span>
              </td>
              <td style="font-weight: 600;">{{ item.cantidad_sesiones }}</td>
              <td style="font-weight: 700; color: #1a3a6e;">S/ {{ item.precio.toFixed(2) }}</td>
              <td>
                <button @click="toggleEstado(item)" :style="item.activo ? 'color: #10b981;' : 'color: #ef4444;'"
                  style="background: none; border: none; font-weight: 600; cursor: pointer;">
                  {{ item.activo ? 'Activo' : 'Inactivo' }}
                </button>
              </td>
              <td>
                <button @click="openEditForm(item)" class="btn-secondary"
                  style="padding: 6px 12px; margin-right: 6px;">Editar</button>
                <button @click="handleDelete(item.idServicio)" class="btn-secondary"
                  style="padding: 6px 12px; background: #fee2e2; color: #ef4444;">Eliminar</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Modal Formulario -->
    <Transition name="fade-modal">
      <div v-if="showModal" class="modal-overlay" @click.self="showModal = false">
        <div class="modal-window" style="max-width: 450px;">
          <div class="modal-header">
            <h3>{{ isEditing ? 'Modificar Tarifa' : 'Crear Nuevo Servicio' }}</h3>
            <button class="close-x" @click="showModal = false">&times;</button>
          </div>

          <form @submit.prevent="handleSubmit" class="modal-form">
            <div class="form-grid">

              <div class="input-group span-2">
                <label>Tipo de Servicio</label>
                <select v-model="form.tipo" :disabled="isEditing">
                  <option value="sesion_suelta" :disabled="sesionIndividual && form.tipo !== 'sesion_suelta'">
                    Sesión Individual {{ sesionIndividual && form.tipo !== 'sesion_suelta' ? '(Ya registrada)' : '' }}
                  </option>
                  <option value="masaje" :disabled="masaje && form.tipo !== 'masaje'">
                    Sesión de masaje {{ masaje && form.tipo !== 'masaje' ? '(Ya registrada)' : '' }}
                  </option>
                  <option value="paquete">Paquete de Fisioterapia</option>
                </select>
              </div>

              <div v-if="form.tipo === 'paquete'" class="input-group span-2">
                <label>Nombre del Paquete *</label>
                <input type="text" v-model="form.nombre" placeholder="Ej: Paquete Deportivo Integral" required />
              </div>

              <div v-if="form.tipo === 'paquete'" class="input-group">
                <label>Cantidad de Sesiones</label>
                <input type="number" v-model="form.cantidad_sesiones" min="1" required />
              </div>

              <div class="input-group" :class="{ 'span-2': form.tipo === 'sesion_suelta' }">
                <label>Precio (S/) *</label>
                <input type="number" v-model="form.precio" step="0.01" min="1" placeholder="0.00" required />
              </div>
            </div>

            <div class="modal-actions">
              <button type="button" class="btn-secondary" @click="showModal = false">Cancelar</button>
              <button type="submit" class="btn-primary-submit" :disabled="loading">
                <span v-if="loading" class="btn-spinner"></span>
                <span v-else>Guardar Tarifario</span>
              </button>
            </div>
          </form>
        </div>
      </div>
    </Transition>
  </div>
</template>