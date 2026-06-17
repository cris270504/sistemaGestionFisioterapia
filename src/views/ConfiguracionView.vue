<script setup>
import { ref, onMounted } from 'vue'
import { supabase } from '@/lib/supabaseClient'
import { useAlert } from '@/composables/useAlert'

const { showAlert } = useAlert()

const loading = ref(false)
const showModal = ref(false)
const personalList = ref([])

const email = ref('')
const password = ref('')
const nombres = ref('')
const apellidos = ref('')
const celular = ref('')
const tipoDocumento = ref('DNI')
const numeroDocumento = ref('')
const rolSeleccionado = ref('fisioterapeuta')
const especialidad = ref('')

const fetchPersonal = async () => {
  try {
    const { data, error } = await supabase
      .from('Persona')
      .select(`
        idPersona,
        nombres,
        apellidos,
        celular,
        tipo_documento,
        numero_documento,
        Fisioterapeuta(especialidad),
        Secretaria(idSecretaria),
        Paciente(idPaciente) // 👈 CLAVE: Consultamos si tienen registro médico
      `)

    if (error) throw error

    // 1. FILTRO RAÍZ: Descartamos a cualquier Persona que exista en la tabla Paciente
    const soloPersonal = data.filter(persona => {
      // Supabase devuelve null/undefined o un arreglo vacío si no hay relación
      const esPaciente = persona.Paciente && (Array.isArray(persona.Paciente) ? persona.Paciente.length > 0 : Object.keys(persona.Paciente).length > 0)
      return !esPaciente 
    })

    // 2. MAPEO LIMPIO: Ahora sí, el "else" apuntará 100% a los administradores
    personalList.value = soloPersonal.map(persona => {
      let rolCalculado = 'Administrador' // Fallback seguro

      const esFisio = persona.Fisioterapeuta && (Array.isArray(persona.Fisioterapeuta) ? persona.Fisioterapeuta.length > 0 : Object.keys(persona.Fisioterapeuta).length > 0)
      const esSecretaria = persona.Secretaria && (Array.isArray(persona.Secretaria) ? persona.Secretaria.length > 0 : Object.keys(persona.Secretaria).length > 0)

      if (esFisio) {
        rolCalculado = 'Fisioterapeuta'
      } else if (esSecretaria) {
        rolCalculado = 'Secretaria'
      }

      const especialidadCalculada = Array.isArray(persona.Fisioterapeuta)
        ? persona.Fisioterapeuta[0]?.especialidad
        : persona.Fisioterapeuta?.especialidad

      return {
        id: persona.idPersona,
        nombres: persona.nombres,
        apellidos: persona.apellidos,
        celular: persona.celular || '-',
        documento: `${persona.tipo_documento}: ${persona.numero_documento || '-'}`,
        rol: rolCalculado,
        especialidad: especialidadCalculada || '-'
      }
    })

  } catch (error) {
    showAlert('Error al cargar el personal: ' + error.message, 'error')
  }
}

const handleCreateUser = async () => {

  const docFiltrado = numeroDocumento.value.trim()
  const celularFiltrado = celular.value.trim()

  if (tipoDocumento.value === 'DNI') {
    // Validar que sean exactamente 8 caracteres y solo números
    const regexDni = /^\d{8}$/
    if (!regexDni.test(docFiltrado)) {
      showAlert('El DNI debe tener estrictamente 8 dígitos numéricos.', 'error')
      return // 👈 DETIENE la ejecución por completo
    }
  } else if (tipoDocumento.value === 'RUC') {
    // Por si en el futuro agregas RUC (11 dígitos)
    const regexRuc = /^\d{11}$/
    if (!regexRuc.test(docFiltrado)) {
      showAlert('El RUC debe tener estrictamente 11 dígitos numéricos.', 'error')
      return
    }
  }

  // Validar el celular (Debe tener exactamente 9 dígitos si se ingresa)
  if (celularFiltrado) {
    const regexCelular = /^9\d{8}$/ // Empieza con 9 y le siguen 8 números
    if (!regexCelular.test(celularFiltrado)) {
      showAlert('El número de celular debe ser válido en Perú (9 dígitos y empezar con 9).', 'error')
      return
    }
  }

  loading.value = true
  try {
    /* ============================================================================
       CAMBIO DE CLIENTE DE AUTENTICACIÓN
       ============================================================================ */
    // MIENTRAS ESTÉ DESACTIVADA LA CONFIRMACIÓN: Usamos el cliente aislado
    const { data, error } = await supabaseCrearTerceros.auth.signUp({

      // SI ACTIVAS LA CONFIRMACIÓN POR CORREO: Descomenta la línea de abajo y borra la de arriba
      // const { data, error } = await supabase.auth.signUp({
      email: email.value,
      password: password.value,
      options: {
        data: {
          rol: rolSeleccionado.value,
          nombres: nombres.value,
          apellidos: apellidos.value,
          tipo_documento: tipoDocumento.value,
          numero_documento: numeroDocumento.value,
          celular: celular.value || null
        }
      }
    })

    if (error) throw error
    if (!data.user) throw new Error('No se pudo generar la instancia de autenticación.')

    const newUid = data.user.id

    // 3. Insertar en la tabla hija usando el cliente GLOBAL (con tus credenciales de Admin intactas)
    if (rolSeleccionado.value === 'fisioterapeuta') {
      const { error: errFisio } = await supabase
        .from('Fisioterapeuta')
        .insert({
          idFisioterapeuta: newUid,
          especialidad: especialidad.value // 👈 CORREGIDO: Ajustado a tu variable real de especialidad
        })

      if (errFisio) throw errFisio

    } else if (rolSeleccionado.value === 'secretaria') {
      const { error: errSecretaria } = await supabase
        .from('Secretaria')
        .insert({
          idSecretaria: newUid
        })

      if (errSecretaria) throw errSecretaria
    }

    showAlert('¡Trabajador dado de alta exitosamente en MovyBalance!', 'success')
    showModal.value = false
    resetForm()
    await fetchPersonal()

  } catch (error) {
    showAlert('Error en el alta: ' + error.message, 'error')
  } finally {
    loading.value = false
  }
}

const resetForm = () => {
  email.value = ''
  password.value = ''
  nombres.value = ''
  apellidos.value = ''
  celular.value = ''
  numeroDocumento.value = ''
  especialidad.value = ''
  rolSeleccionado.value = 'fisioterapeuta'
}

onMounted(() => {
  fetchPersonal()
})
</script>

<template>
  <div class="config-view">

    <div class="action-header">
      <div class="header-text">
        <h2>Gestión de Personal</h2>
        <p>Da de alta especialistas y secretarias, y administra sus accesos al sistema.</p>
      </div>
      <button class="primary-btn" @click="showModal = true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"
          stroke-linejoin="round" class="btn-icon">
          <line x1="12" y1="5" x2="12" y2="19"></line>
          <line x1="5" y1="12" x2="19" y2="12"></line>
        </svg>
        Registrar Personal
      </button>
    </div>

    <div class="data-card">
      <div class="table-responsive">
        <table class="content-table">
          <thead>
            <tr>
              <th>Nombre Completo</th>
              <th>Rol de Sistema</th>
              <th>N° Documento</th>
              <th>Celular</th>
              <th>Especialidad</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="staff in personalList" :key="staff.id">
              <td class="staff-name">{{ staff.nombres }} {{ staff.apellidos }}</td>
              <td>
                <span class="badge" :class="staff.rol.toLowerCase()">
                  {{ staff.rol }}
                </span>
              </td>
              <td>{{ staff.documento }}</td>
              <td>{{ staff.celular }}</td>
              <td class="staff-detail">{{ staff.especialidad }}</td>
            </tr>

            <tr v-if="personalList.length === 0">
              <td colspan="5" class="empty-row">
                No se registran especialistas en la nómina activa.
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <Transition name="fade-modal">
      <div v-if="showModal" class="modal-overlay" @click.self="showModal = false">
        <div class="modal-window">

          <div class="modal-header">
            <h3>Alta de Nuevo Trabajador</h3>
            <button class="close-x" @click="showModal = false">&times;</button>
          </div>

          <form @submit.prevent="handleCreateUser" class="modal-form">
            <div class="form-grid">

              <div class="input-group">
                <label for="modal-nombres">Nombres *</label>
                <input id="modal-nombres" type="text" v-model="nombres" placeholder="Ej: Carlos Alberto" required />
              </div>

              <div class="input-group">
                <label for="modal-apellidos">Apellidos *</label>
                <input id="modal-apellidos" type="text" v-model="apellidos" placeholder="Ej: Mendoza Flores" required />
              </div>

              <div class="input-group">
                <label for="modal-tipo-doc">Tipo de Documento</label>
                <select id="modal-tipo-doc" v-model="tipoDocumento">
                  <option value="DNI">DNI</option>
                  <option value="CE">Carné de Extranjería</option>
                  <option value="PAS">Pasaporte</option>
                </select>
              </div>

              <div class="input-group">
                <label for="modal-num-doc">Número de Documento *</label>
                <input v-model="numeroDocumento" type="text" :maxlength="tipoDocumento === 'DNI' ? 8 : 15"
                  @input="numeroDocumento = numeroDocumento.replace(/\D/g, '')"
                  placeholder="Ingrese el número de documento" class="form-input" />
              </div>

              <div class="input-group">
                <label for="modal-celular">Celular</label>
                <input id="modal-celular" type="text" v-model="celular" placeholder="9 dígitos" maxlength="9" />
              </div>

              <div class="input-group">
                <label for="modal-rol">Rol del Sistema</label>
                <select id="modal-rol" v-model="rolSeleccionado">
                  <option value="fisioterapeuta">Fisioterapeuta</option>
                  <option value="secretaria">Secretaria</option>
                </select>
              </div>

              <div class="input-group span-2">
                <label for="modal-email">Correo Electrónico Institucional *</label>
                <input id="modal-email" type="email" v-model="email" placeholder="usuario@movybalance.com" required />
              </div>

              <div class="input-group span-2">
                <label for="modal-password">Contraseña Temporal de Acceso *</label>
                <input id="modal-password" type="password" v-model="password" placeholder="Mínimo 6 caracteres"
                  required />
              </div>

              <Transition name="slide-input">
                <div v-if="rolSeleccionado === 'fisioterapeuta'" class="input-group span-2">
                  <label for="modal-especialidad">Especialidad Terapéutica *</label>
                  <input id="modal-especialidad" type="text" v-model="especialidad"
                    placeholder="Ej: Kinesiología Deportiva / Rehabilitación Postural" required />
                </div>
              </Transition>

            </div>

            <div class="modal-actions">
              <button type="button" class="btn-secondary" @click="showModal = false">Cancelar</button>
              <button type="submit" class="btn-primary-submit" :disabled="loading">
                <span v-if="loading" class="btn-spinner"></span>
                <span v-else>Confirmar Registro</span>
              </button>
            </div>
          </form>

        </div>
      </div>
    </Transition>

  </div>
</template>

<style scoped>

</style>