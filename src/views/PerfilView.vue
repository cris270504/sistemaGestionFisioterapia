<script setup>
import { ref, onMounted } from 'vue'
import { supabase } from '@/lib/supabaseClient'
import { useAlert } from '@/composables/useAlert'

const { showAlert } = useAlert()
const loading = ref(false)
const userRole = ref('')

// Campos del Perfil (Lectura Pura)
const nombres = ref('')
const apellidos = ref('')
const documentoIdentidad = ref('')
const email = ref('')

// Campos del Perfil (Modificables)
const celular = ref('')
const direccion = ref('')

// Campos para el Cambio de Contraseña
const nuevaContrasena = ref('')
const confirmacionContrasena = ref('')
const loadingPassword = ref(false)

// Cargar la información del usuario en sesión
const fetchPerfilUsuario = async () => {
  loading.value = true
  try {
    // 1. Obtener el usuario autenticado actualmente
    const { data: { user }, error: errAuth } = await supabase.auth.getUser()
    if (errAuth) throw errAuth
    if (!user) throw new Error('No se encontró una sesión activa.')

    email.value = user.email
    userRole.value = user.user_metadata?.rol || 'Paciente'

    // 2. Traer los datos sincronizados desde la tabla madre Persona
    const { data: persona, error: errPersona } = await supabase
      .from('Persona')
      .select('nombres, apellidos, tipo_documento, numero_documento, celular')
      .eq('idPersona', user.id)
      .single()

    if (errPersona) throw errPersona

    if (persona) {
      nombres.value = persona.nombres
      apellidos.value = persona.apellidos
      documentoIdentidad.value = `${persona.tipo_documento}: ${persona.numero_documento || '-'}`
      celular.value = persona.celular || ''
    }

    // 3. Si el usuario tiene el rol de Paciente, traemos su dirección residencial
    if (userRole.value.toLowerCase() === 'paciente') {
      const { data: paciente } = await supabase
        .from('Paciente')
        .select('direccion')
        .eq('idPaciente', user.id)
        .single()
      
      if (paciente) {
        direccion.value = paciente.direccion || ''
      }
    }

  } catch (error) {
    showAlert('Error al cargar perfil: ' + error.message, 'error')
  } finally {
    loading.value = false
  }
}

// Guardar modificaciones de datos demográficos
const handleUpdateDatos = async () => {
  // Validación rápida para el celular peruano (9 dígitos)
  if (celular.value && !/^9\d{8}$/.test(celular.value.trim())) {
    showAlert('El celular debe tener 9 dígitos y comenzar con 9.', 'error')
    return
  }

  loading.value = true
  try {
    const { data: { user } } = await supabase.auth.getUser()

    // 1. Actualizar datos comunes en la tabla Persona
    const { error: errPersona } = await supabase
      .from('Persona')
      .update({ celular: celular.value.trim() || null })
      .eq('idPersona', user.id)

    if (errPersona) throw errPersona

    // 2. Si es Paciente, actualizar también su dirección residencial
    if (userRole.value.toLowerCase() === 'paciente') {
      const { error: errPaciente } = await supabase
        .from('Paciente')
        .update({ direccion: direccion.value.trim() || null })
        .eq('idPaciente', user.id)
      
      if (errPaciente) throw errPaciente
    }

    showAlert('¡Tus datos personales se actualizaron correctamente!', 'success')
    await fetchPerfilUsuario()
  } catch (error) {
    showAlert('Error al guardar cambios: ' + error.message, 'error')
  } finally {
    loading.value = false
  }
}

// Lógica para cambiar la contraseña (Aplica la mutación sobre la sesión activa)
const handleUpdateContrasena = async () => {
  if (nuevaContrasena.value.length < 6) {
    showAlert('La nueva contraseña debe tener al menos 6 caracteres.', 'error')
    return
  }

  if (nuevaContrasena.value !== confirmacionContrasena.value) {
    showAlert('Las contraseñas ingresadas no coinciden.', 'error')
    return
  }

  loadingPassword.value = true
  try {
    // Supabase actualiza directamente el flujo de autenticación del usuario actual
    const { error } = await supabase.auth.updateUser({
      password: nuevaContrasena.value
    })

    if (error) throw error

    showAlert('¡Tu contraseña ha sido actualizada con éxito!', 'success')
    nuevaContrasena.value = ''
    confirmacionContrasena.value = ''
  } catch (error) {
    showAlert('Error al actualizar contraseña: ' + error.message, 'error')
  } finally {
    loadingPassword.value = false
  }
}

onMounted(() => {
  fetchPerfilUsuario()
})
</script>

<template>
  <div class="view-container">
    
    <!-- Encabezado de la Vista -->
    <div class="action-header">
      <div class="header-text">
        <h2>Mi Perfil</h2>
        <p>Gestiona tus opciones de contacto y actualiza tus credenciales de acceso al sistema.</p>
      </div>
      <!-- Badge dinámico indicando el rol actual con el que ingresaron -->
      <span class="badge" :class="userRole.toLowerCase()">
        Rol: {{ userRole }}
      </span>
    </div>

    <!-- Layout en dos columnas: Datos Personales vs Seguridad -->
    <div class="form-grid span-2" style="grid-template-columns: 1fr 1fr; gap: 24px; align-items: start;">
      
      <!-- Bloque A: Información Personal -->
      <div class="data-card" style="padding: 24px;">
        <h3 style="font-size: 16px; margin-bottom: 16px; border-bottom: 1px solid #f1f5f9; padding-bottom: 8px;">
          Información Personal
        </h3>
        
        <form @submit.prevent="handleUpdateDatos" style="display: flex; flex-direction: column; gap: 14px;">
          <div class="form-grid">
            <div class="input-group">
              <label>Nombres</label>
              <input type="text" :value="nombres" disabled style="opacity: 0.75; background: #f1f5f9; cursor: not-allowed;" />
            </div>

            <div class="input-group">
              <label>Apellidos</label>
              <input type="text" :value="apellidos" disabled style="opacity: 0.75; background: #f1f5f9; cursor: not-allowed;" />
            </div>

            <div class="input-group">
              <label>Documento de Identidad</label>
              <input type="text" :value="documentoIdentidad" disabled style="opacity: 0.75; background: #f1f5f9; cursor: not-allowed;" />
            </div>

            <div class="input-group">
              <label>Correo Electrónico</label>
              <input type="text" :value="email" disabled style="opacity: 0.75; background: #f1f5f9; cursor: not-allowed;" />
            </div>

            <!-- Campo Modificable: Celular -->
            <div class="input-group span-2">
              <label>Número de Celular</label>
              <input type="text" v-model="celular" placeholder="Ej: 987654321" maxlength="9" />
            </div>

            <!-- Campo Modificable Condicional: Dirección (Solo si es Paciente) -->
            <div v-if="userRole.toLowerCase() === 'paciente'" class="input-group span-2">
              <label>Dirección Residencial</label>
              <input type="text" v-model="direccion" placeholder="Ej: Urb. Miraflores Mz. B Lote 4, Castilla" />
            </div>
          </div>

          <div style="display: flex; justify-content: flex-end; margin-top: 10px;">
            <button type="submit" class="btn-primary-submit" :disabled="loading" style="padding: 10px 20px;">
              <span v-if="loading" class="btn-spinner"></span>
              <span v-else>Guardar Cambios</span>
            </button>
          </div>
        </form>
      </div>

      <!-- Bloque B: Seguridad y Credenciales -->
      <div class="data-card" style="padding: 24px;">
        <h3 style="font-size: 16px; margin-bottom: 16px; border-bottom: 1px solid #f1f5f9; padding-bottom: 8px;">
          Seguridad del Sistema
        </h3>
        <p style="margin: 0 0 16px 0; color: #64748b; font-size: 13px; line-height: 1.4;">
          Si es la primera vez que ingresas con tus datos de registro, te recomendamos modificar la clave por defecto para proteger tu historial clínico y accesos.
        </p>

        <form @submit.prevent="handleUpdateContrasena" style="display: flex; flex-direction: column; gap: 14px;">
          <div class="input-group">
            <label>Nueva Contraseña *</label>
            <input type="password" v-model="nuevaContrasena" placeholder="Mínimo 6 caracteres" required />
          </div>

          <div class="input-group">
            <label>Confirmar Nueva Contraseña *</label>
            <input type="password" v-model="confirmacionContrasena" placeholder="Repita la contraseña" required />
          </div>

          <div style="display: flex; justify-content: flex-end; margin-top: 10px;">
            <button type="submit" class="btn-primary-submit" :disabled="loadingPassword" style="background: linear-gradient(135deg, #1a3a6e 0%, #1e4d8c 100%); padding: 10px 20px;">
              <span v-if="loadingPassword" class="btn-spinner"></span>
              <span v-else>Actualizar Contraseña</span>
            </button>
          </div>
        </form>
      </div>

    </div>
  </div>
</template>

<style scoped>
/* Totalmente acoplado a global.css */
@media (max-width: 768px) {
  .form-grid.span-2 {
    grid-template-columns: 1fr !important;
  }
}
</style>