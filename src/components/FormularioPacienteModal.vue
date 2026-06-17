<script setup>
import { ref, watch, computed } from 'vue'
import { supabase } from '@/lib/supabaseClient'
import { useAlert } from '@/composables/useAlert'

// 1. Definición de Props y Emits obligatorios
const props = defineProps({
    isOpen: { type: Boolean, required: true },
    pacienteData: { type: Object, default: null }
})
const emit = defineEmits(['close', 'refresh'])

// 2. Composable de Alertas
const { showAlert } = useAlert()

// 3. Estados operativos locales
const loading = ref(false)
const isEditing = ref(false)
const currentPacienteId = ref(null)

// 4. Campos reactivos del Formulario Administrativo / Clínico
const nombres = ref('')
const apellidos = ref('')
const tipoDocumento = ref('DNI')
const numeroDocumento = ref('')
const celular = ref('')
const fechaNacimiento = ref('')
const direccion = ref('')
const email = ref('')

// Restricción de fecha: Calcular dinámicamente el día de hoy para el límite máximo del input
const maxFechaPermitida = computed(() => {
    const hoy = new Date()
    const yyyy = hoy.getFullYear()
    const mm = String(hoy.getMonth() + 1).padStart(2, '0')
    const dd = String(hoy.getDate()).padStart(2, '0')
    return `${yyyy}-${mm}-${dd}`
})

// 6. Escuchador Reactivo del Modal (Mapeo de Datos)
watch(() => props.isOpen, (newVal) => {
    if (newVal) {
        if (props.pacienteData) {
            // Modo Edición
            isEditing.value = true
            currentPacienteId.value = props.pacienteData.Persona?.idPersona || props.pacienteData.idPaciente

            nombres.value = props.pacienteData.Persona?.nombres || ''
            apellidos.value = props.pacienteData.Persona?.apellidos || ''
            tipoDocumento.value = props.pacienteData.Persona?.tipo_documento || 'DNI'
            numeroDocumento.value = props.pacienteData.Persona?.numero_documento || ''
            celular.value = props.pacienteData.Persona?.celular || ''
            fechaNacimiento.value = props.pacienteData.Persona?.fecha_nacimiento || ''
            direccion.value = props.pacienteData.direccion || ''
        } else {
            // Modo Creación
            isEditing.value = false
            currentPacienteId.value = null
            resetForm()
        }
    }
})

const resetForm = () => {
    nombres.value = ''
    apellidos.value = ''
    tipoDocumento.value = 'DNI'
    numeroDocumento.value = ''
    celular.value = ''
    fechaNacimiento.value = ''
    direccion.value = ''
    email.value = ''
}

// 7. Lógica unificada para el Envío de Información (INSERT / UPDATE)
const handleSubmit = async () => {
    const docFiltrado = numeroDocumento.value.trim()
    const nombresTrim = nombres.value.trim()
    const apellidosTrim = apellidos.value.trim()
    const direccionTrim = direccion.value.trim()
    const emailTrim = email.value.trim()

    // Validaciones de texto obligatorias
    if (!nombresTrim || !apellidosTrim) {
        showAlert('Los nombres y apellidos son campos obligatorios y no pueden contener solo espacios.', 'error')
        return
    }

    // Validación de Tipo y Formato de Documento
    if (tipoDocumento.value === 'DNI') {
        if (!/^[0-9]{8}$/.test(docFiltrado)) {
            showAlert('El DNI debe contener estrictamente 8 dígitos numéricos.', 'error')
            return
        }
    } else if (tipoDocumento.value === 'CE') {
        if (!/^[a-zA-Z0-9]{8,12}$/.test(docFiltrado)) {
            showAlert('El Carné de Extranjería (CE) debe tener entre 8 y 12 caracteres alfanuméricos.', 'error')
            return
        }
    } else if (tipoDocumento.value === 'PAS') {
        if (!/^[a-zA-Z0-9]{6,12}$/.test(docFiltrado)) {
            showAlert('El Pasaporte debe tener entre 6 y 12 caracteres alfanuméricos.', 'error')
            return
        }
    }

    // Validación del celular
    if (celular.value && !/^9\d{8}$/.test(celular.value.trim())) {
        showAlert('El celular debe tener 9 dígitos y comenzar con 9.', 'error')
        return
    }

    // Validar que la fecha de nacimiento no sea una fecha futura
    if (fechaNacimiento.value) {
        const fechaSeleccionada = new Date(fechaNacimiento.value)
        const fechaActual = new Date()
        // Ponemos el contador de horas a cero para comparar únicamente días
        fechaActual.setHours(0, 0, 0, 0)

        if (fechaSeleccionada > fechaActual) {
            showAlert('La fecha de nacimiento no puede ser una fecha futura.', 'error')
            return
        }
    }

    // Validación de estructura de correo electrónico (Solo en creación)
    if (!isEditing.value) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
        if (!emailRegex.test(emailTrim)) {
            showAlert('Por favor, ingrese un formato de correo electrónico válido.', 'error')
            return
        }
    }

    loading.value = true
    try {
        if (isEditing.value) {
            const fechaFormateada = fechaNacimiento.value ? fechaNacimiento.value : null

            // A. Modificar tabla madre Persona
            const { error: errPersona } = await supabase.from('Persona').update({
                nombres: nombresTrim,
                apellidos: apellidosTrim,
                tipo_documento: tipoDocumento.value,
                numero_documento: docFiltrado,
                celular: celular.value || null,
                fecha_nacimiento: fechaFormateada
            })
                .eq('idPersona', currentPacienteId.value)
                .select()

            if (errPersona) throw errPersona

            // B. Modificar tabla hija Paciente
            const { error: errPaciente, data: resPaciente } = await supabase
                .from('Paciente')
                .update({
                    direccion: direccionTrim ? direccionTrim : null
                })
                .eq('idPaciente', currentPacienteId.value)
                .select()

            if (errPaciente) throw errPaciente

            if (!resPersona?.length || !resPaciente?.length) {
                showAlert('Los datos no se modificaron en el servidor.', 'warning')
                return
            }

            showAlert('Expediente e identificación actualizados correctamente', 'success')
        } else {
            // Flujo de Registro Inicial en Supabase Auth
            const { data, error: errAuth } = await supabase.functions.invoke('crear-paciente-admin', {
                body: {
                    email: emailTrim,
                    password: docFiltrado,
                    nombres: nombresTrim,
                    apellidos: apellidosTrim,
                    rol: 'paciente',
                    tipo_documento: tipoDocumento.value,
                    numero_documento: docFiltrado,
                    celular: celular.value || null,
                    fecha_nacimiento: fechaNacimiento.value || null
                }
            })

            // 1. Errores críticos de red (ej. sin internet o servidor caído)
            if (errAuth) throw errAuth

            // 2. ✅ AQUÍ ATRAPAMOS EL MENSAJE DE LA EDGE FUNCTION Y LO MOSTRAMOS EN LA VISTA
            if (data && data.error) {
                showAlert(data.error, 'error') // Mostrará: "El documento 72917370 ya pertenece..."
                loadingAccion.value = false
                return false // Detenemos la ejecución aquí
            }

            // 3. Si todo salió bien, procedemos con el INSERT en la tabla Paciente
            const nuevoUid = data.user_id

            const { error: errPaciente } = await supabase
                .from('Paciente')
                .insert({
                    idPaciente: nuevoUid,
                    direccion: direccionTrim ? direccionTrim : null
                })

            if (errPaciente) throw errPaciente

            showAlert('✅ Paciente guardado correctamente.', 'success')
            emit('refresh')
            emit('close')
        }
    } catch (err) {
        showAlert('Error inesperado: ' + (err.message || 'No se pudo contactar al servidor'), 'error')
    } finally {
        loadingAccion.value = false;
    }
}
</script>

<template>
    <Transition name="fade-modal">
        <div v-if="isOpen" class="modal-overlay" @click.self="emit('close')">
            <div class="modal-window">

                <div class="modal-header">
                    <h3>{{ isEditing ? 'Modificar Datos de Ficha' : 'Alta y Acceso de Paciente' }}</h3>
                    <button class="close-x" @click="emit('close')">&times;</button>
                </div>

                <form @submit.prevent="handleSubmit" class="modal-form">
                    <div class="form-grid">

                        <div class="input-group">
                            <label>Nombres *</label>
                            <input type="text" v-model="nombres" placeholder="Ej: Maria Elena" required />
                        </div>

                        <div class="input-group">
                            <label>Apellidos *</label>
                            <input type="text" v-model="apellidos" placeholder="Ej: Palacios Riofrio" required />
                        </div>

                        <div class="input-group">
                            <label>Tipo de Documento</label>
                            <select v-model="tipoDocumento">
                                <option value="DNI">DNI</option>
                                <option value="CE">Carné de Extranjería</option>
                                <option value="PAS">Pasaporte</option>
                            </select>
                        </div>

                        <div class="input-group">
                            <label>Número de Documento *</label>
                            <input v-model="numeroDocumento" type="text" :maxlength="tipoDocumento === 'DNI' ? 8 : 12"
                                placeholder="Ingrese número de documento" required />
                        </div>

                        <div class="input-group">
                            <label>Celular</label>
                            <input type="text" v-model="celular" placeholder="9 dígitos" maxlength="9" />
                        </div>

                        <div class="input-group">
                            <label>Fecha de Nacimiento</label>
                            <input type="date" v-model="fechaNacimiento" :max="maxFechaPermitida" />
                        </div>

                        <div class="input-group span-2">
                            <label>Dirección Residencial</label>
                            <input type="text" v-model="direccion"
                                placeholder="Ej: Urb. Miraflores Mz. B Lote 4, Castilla" />
                        </div>

                        <div v-if="!isEditing" class="form-grid span-2"
                            style="gap: 14px; margin-top: 10px; border-top: 1px solid #f1f5f9; padding-top: 15px;">
                            <div class="input-group span-2">
                                <label>Correo Electrónico del Paciente *</label>
                                <input type="email" v-model="email" placeholder="paciente@ejemplo.com"
                                    :required="!isEditing" />
                            </div>

                            <div class="input-group span-2">
                                <p
                                    style="margin: 0; color: #64748b; font-size: 12.5px; font-style: italic; display: flex; align-items: center; gap: 6px;">
                                    <svg style="width: 16px; height: 16px; color: #4a90c4;" viewBox="0 0 24 24"
                                        fill="none" stroke="currentColor" stroke-width="2">
                                        <circle cx="12" cy="12" r="10"></circle>
                                        <line x1="12" y1="16" x2="12" y2="12"></line>
                                        <line x1="12" y1="8" x2="12.01" y2="8"></line>
                                    </svg>
                                    🔑 La contraseña inicial del paciente será automáticamente su número de documento.
                                </p>
                            </div>
                        </div>

                    </div>

                    <div class="modal-actions">
                        <button type="button" class="btn-secondary" @click="emit('close')">Cancelar</button>
                        <button type="submit" class="btn-primary-submit" :disabled="loading">
                            <span v-if="loading" class="btn-spinner"></span>
                            <span v-else>{{ isEditing ? 'Guardar Cambios' : 'Generar Acceso' }}</span>
                        </button>
                    </div>
                </form>

            </div>
        </div>
    </Transition>
</template>

<style scoped></style>