/**
 * useCitas.js — v3 (definitivo)
 *
 * CORRECCIONES RESPECTO A v2:
 * ─────────────────────────────────────────────────────────────────────────────
 * [E1] crearCita modalidad 'evaluacion_paquete':
 * Eliminado el flujo de Catalogo_Servicio (tabla inexistente).
 * Ahora selecciona un Paquete ya existente del paciente desde v_saldo_paquete.
 * El INSERT en Sesion vincula idPaquete directamente.
 *
 * [E2] numero_sesion: 0 → 1 (el CHECK de la BD exige >= 1)
 *
 * [E3] Falta el campo `tipo` (NOT NULL) en el INSERT de Sesion.
 * Se envía tipo: 'evaluacion' siempre al crear la cita inicial.
 *
 * [E4] fetchPaquetesPaciente usa la vista v_saldo_paquete correctamente,
 * filtrando por paciente y solo paquetes con saldo > 0.
 *
 * [E5] verificarDisponibilidad: sintaxis .not() de supabase corregida.
 * La forma correcta es .not('estado', 'in', '(cancelada,reprogramada,no_asistio)')
 * sin comillas dobles dentro del paréntesis.
 *
 * [E6] fetchPaquetesCatalogo eliminada (consultaba Catalogo_Servicio, tabla inexistente).
 *
 * ESTRUCTURA DEL FLUJO 'evaluacion_paquete':
 * 1. Al seleccionar paciente → fetchPaquetesPaciente carga sus paquetes con saldo
 * 2. La secretaria elige uno de esos paquetes en el modal
 * 3. crearCita inserta la Sesion con ese idPaquete ya existente
 * 4. El trigger de la BD actualiza el saldo del paquete automáticamente
 */

import { ref, computed } from 'vue'
import { supabase } from '@/lib/supabaseClient'
import { useAlert } from '@/composables/useAlert'

// ─── Constantes de negocio ────────────────────────────────────────────────────
export const MODALIDADES = [
    {
        id: 'evaluacion_inicial',
        label: 'Evaluación Inicial',
        descripcion: 'Punto de partida clínico. Costo S/ 0.00. No genera sesiones adicionales.',
        costo: 0,
        icono: '🔍',
        color: '#4a90c4',
    },
    {
        id: 'tratamiento',
        label: 'Tratamiento',
        descripcion: 'Incluye evaluación gratuita + configuración combinada de paquetes y sesiones sueltas.',
        icono: '📋',
        color: '#0f766e',
    },
    {
        id: 'masaje',
        label: 'Sesión de Masajes',
        descripcion: 'Servicio independiente de tarifa plana. No requiere evaluación médica.',
        icono: '💆',
        color: '#0ea5e9',
    },
]

export const ESTADOS_SESION = {
    reservada: { label: 'Reservada', color: '#f59e0b', bg: '#fef3c7' },
    agendada: { label: 'Agendada', color: '#10b981', bg: '#d1fae5' },
    atendida: { label: 'Atendida', color: '#3b82f6', bg: '#dbeafe' },
    cancelada: { label: 'Cancelada', color: '#ef4444', bg: '#fee2e2' },
    no_asistio: { label: 'No asistió', color: '#6b7280', bg: '#f3f4f6' },
    reprogramada: { label: 'Reprogramada', color: '#8b5cf6', bg: '#ede9fe' },
}

// ─── Composable ───────────────────────────────────────────────────────────────
export function useCitas() {
    const { showAlert } = useAlert()

    // ── Estado ──────────────────────────────────────────────────────────────────
    const citas = ref([])
    const fisios = ref([])
    const pacientes = ref([])
    const paquetes = ref([])   // paquetes CON SALDO del paciente seleccionado
    const horarios = ref([])
    const loading = ref(false)
    const loadingAccion = ref(false)

    const userRole = ref(null)
    const userId = ref(null)

    // ── Computed de rol ─────────────────────────────────────────────────────────
    const esFisioterapeuta = computed(() => userRole.value === 'fisioterapeuta')
    const esSecretaria = computed(() => userRole.value === 'secretaria')
    const esPaciente = computed(() => userRole.value === 'paciente')
    const esAdmin = computed(() => userRole.value === 'admin')
    const puedeGestionar = computed(() => esSecretaria.value || esAdmin.value)

    // ── initUser ────────────────────────────────────────────────────────────────
    const initUser = async () => {
        const { data: { user } } = await supabase.auth.getUser()
        if (user) {
            userRole.value = user.user_metadata?.rol || 'paciente'
            userId.value = user.id
        } else {
            // Manejo explícito de error si no hay sesión
            userId.value = null
            throw new Error('No hay sesión de usuario activa')
        }
    }

    // ── fetchCitas ──────────────────────────────────────────────────────────────
    const fetchCitas = async (filtros = {}) => {
        // ✅ CORRECCIÓN CRÍTICA: Validar userId antes de consultar
        if (!userId.value) {
            await initUser()
        }

        // Validación adicional: Si sigue sin userId después de initUser, abortar
        if (!userId.value && (esPaciente.value || esFisioterapeuta.value)) {
            showAlert('Error: Usuario no autenticado. Por favor, inicia sesión nuevamente.', 'error')
            loading.value = false
            return
        }

        loading.value = true
        try {
            // Consultamos la vista unificada
            let query = supabase.from('vw_citas_detalladas')
                .select('idSesion, fecha_hora, estado, tipo, paciente_en_sala, estado_pago, fisio_nombres, fisio_apellidos, fisio_especialidad, paciente_nombres, paciente_apellidos, idPaciente, idFisioterapeuta, idPaquete, idTratamiento, expires_at')

            // ✅ SEGURIDAD: Solo filtrar por userId si está confirmado
            if (esPaciente.value && userId.value) {
                query = query.eq('idPaciente', userId.value)
            } else if (esFisioterapeuta.value && userId.value) {
                query = query.eq('idFisioterapeuta', userId.value)
            }

            if (filtros.rangoInicio && filtros.rangoFin) {
                query = query.gte('fecha_hora', filtros.rangoInicio).lte('fecha_hora', filtros.rangoFin)
            } else if (filtros.fecha) {
                // ✅ CORRECCIÓN: Usamos -05:00 (Hora de Perú) en lugar de +00:00
                const inicio = `${filtros.fecha}T00:00:00-05:00`
                const fin = `${filtros.fecha}T23:59:59-05:00`
                query = query.gte('fecha_hora', inicio).lte('fecha_hora', fin)
            }

            if (filtros.estado) query = query.eq('estado', filtros.estado)
            if (filtros.idFisioterapeuta) query = query.eq('idFisioterapeuta', filtros.idFisioterapeuta)

            const { data, error } = await query.order('fecha_hora', { ascending: true })
            if (error) throw error
            citas.value = data ?? []
        } catch (err) {
            showAlert('Error al cargar citas: ' + err.message, 'error')
        } finally {
            loading.value = false
        }
    }

    const fetchEvaluacionesHuerfanas = async (idPaciente) => {
        if (!idPaciente) return []
        try {
            const { data, error } = await supabase
                .from('Sesion')
                .select('idSesion, fecha_hora, observaciones')
                .eq('idPaciente', idPaciente)
                .eq('tipo', 'evaluacion')
                .is('idTratamiento', null) // 👈 La clave: no tiene tratamiento comprado aún
                .in('estado', ['agendada', 'atendida']) // Excluimos canceladas o inasistencias
                .order('fecha_hora', { ascending: false }) // Las más recientes primero

            if (error) throw error
            return data || []
        } catch (err) {
            console.error('Error al cargar evaluaciones huérfanas:', err)
            return []
        }
    }

    // ── fetchFisios ─────────────────────────────────────────────────────────────
    const fetchFisios = async () => {
        const { data, error } = await supabase
            .from('Fisioterapeuta')
            .select(`
        idFisioterapeuta,
        especialidad,
        Persona ( nombres, apellidos )
      `)
        if (error) { showAlert('Error al cargar fisioterapeutas: ' + error.message, 'error'); return }
        fisios.value = data ?? []
    }

    // ── fetchPacientes ──────────────────────────────────────────────────────────
    const fetchPacientes = async () => {
        const { data, error } = await supabase
            .from('Paciente')
            .select(`
        idPaciente,
        Persona ( nombres, apellidos, celular, numero_documento )
      `)
        if (error) { showAlert('Error al cargar pacientes: ' + error.message, 'error'); return }
        pacientes.value = data ?? []
    }

    // ── fetchPaquetesPaciente ───────────────────────────────────────────────────
    const fetchPaquetesPaciente = async (idPaciente) => {
        if (!idPaciente) { paquetes.value = []; return }
        try {
            const { data, error } = await supabase
                .from('v_saldo_paquete')
                .select('idPaquete, nombre_paquete, total_sesiones, sesiones_consumidas, sesiones_restantes, estado_pago')
                .eq('idPaciente', idPaciente)
                .gt('sesiones_restantes', 0)
                .order('idPaquete', { ascending: false })

            if (error) throw error
            paquetes.value = data ?? []
        } catch (err) {
            showAlert('Error al cargar paquetes del paciente: ' + err.message, 'error')
        }
    }

    // ── fetchHorarioFisio ───────────────────────────────────────────────────────
    const fetchHorarioFisio = async (idFisioterapeuta) => {
        if (!idFisioterapeuta) { horarios.value = []; return }
        const { data, error } = await supabase
            .from('Horario')
            .select('dia_semana, hora_inicio, hora_fin')
            .eq('idFisioterapeuta', idFisioterapeuta)
        if (error) { showAlert('Error al cargar horario: ' + error.message, 'error'); return }
        horarios.value = data ?? []
    }

    // ── obtenerSlotsDisponibles ─────────────────────────────────────────────────
    const obtenerSlotsDisponibles = async (idFisioterapeuta, fechaSeleccionada, duracionMinutos) => {
        if (!idFisioterapeuta || !fechaSeleccionada) return []

        const [yyyy, mm, dd] = fechaSeleccionada.split('-')
        const fechaLocal = new Date(yyyy, mm - 1, dd)
        let diaSemana = fechaLocal.getDay()
        diaSemana = diaSemana === 0 ? 7 : diaSemana

        const { data: horariosFisio } = await supabase
            .from('Horario')
            .select('hora_inicio, hora_fin')
            .eq('idFisioterapeuta', idFisioterapeuta)
            .eq('dia_semana', diaSemana)

        if (!horariosFisio || horariosFisio.length === 0) return []

        const inicioDiaIso = `${yyyy}-${mm}-${dd}T00:00:00-05:00`
        const finDiaIso = `${yyyy}-${mm}-${dd}T23:59:59-05:00`

        const { data: citasDelDia } = await supabase
            .from('Sesion')
            .select('fecha_hora, tipo')
            .eq('idFisioterapeuta', idFisioterapeuta)
            .gte('fecha_hora', inicioDiaIso)
            .lte('fecha_hora', finDiaIso)
            .not('estado', 'in', '(cancelada,reprogramada,no_asistio)')

        const citasOcupadas = (citasDelDia || []).map(cita => {
            const fc = new Date(cita.fecha_hora)
            const inicioMinutos = fc.getHours() * 60 + fc.getMinutes()
            const duracionCita = cita.tipo === 'evaluacion' ? 20 : 60
            return { inicio: inicioMinutos, fin: inicioMinutos + duracionCita }
        })

        const parseTime = (timeStr) => {
            const [h, m] = timeStr.split(':').map(Number)
            return h * 60 + m
        }

        const formatTime = (mins) => {
            return `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`
        }

        const slotsLibres = []

        horariosFisio.forEach(bloque => {
            let actual = parseTime(bloque.hora_inicio)
            const finBloque = parseTime(bloque.hora_fin)

            while (actual + duracionMinutos <= finBloque) {
                const finActual = actual + duracionMinutos

                // En lugar de solo saber si hay choque, averiguamos CON CUÁL cita choca
                const choque = citasOcupadas.find(c => actual < c.fin && finActual > c.inicio)

                if (!choque) {
                    slotsLibres.push(formatTime(actual))
                    // Si el espacio está libre, avanzamos el bloque completo (ej: 60 min)
                    // para mostrar 08:00, 09:00, 10:00 y evitar agendas fragmentadas.
                    actual += duracionMinutos
                } else {
                    // Si choca con una cita (ej. una evaluación de 08:00 a 08:20),
                    // saltamos directamente a la hora en que termina esa cita (08:20).
                    actual = choque.fin
                }
            }
        })

        return slotsLibres
    }

    const mapearModalidadATipo = (modalidad) => {
        const mapas = {
            'evaluacion_inicial': 'evaluacion',
            'tratamiento': 'evaluacion', // La primera cita de un tratamiento siempre es la evaluación
            'masaje': 'masaje'
        };

        // Si la modalidad no existe en el mapa, devolvemos 'evaluacion' por seguridad
        return mapas[modalidad] || 'evaluacion';
    };

    // ── crearCita ───────────────────────────────────────────────────────────────
    // ── crearCita (Ciclos Clínicos) ──────────────────────────────────────────────
    // ── crearCita (Ciclos Clínicos con RPC y Lote) ──────────────────────────────
    const crearCita = async (payload) => {
        const {
            idPaciente,
            idFisioterapeuta,
            fecha_hora,
            modalidad,                  // Viene de Vue: 'evaluacion_inicial' | 'tratamiento' | 'masaje'
            sesionesOpcionales = [],    // Fechas adicionales seleccionadas en lote
            idTratamientoExistente = null, // (Escenario B)
            idEvaluacionSesion = null,     // (Escenario A)
            observaciones = null,
            tratamientoConfig = {}      // Aquí viene { sesionesDeseadas, tamanoPaquete, etc. }
        } = payload

        if (!idPaciente) { showAlert('Debe seleccionar un paciente.', 'error'); return false }
        if (!idFisioterapeuta) { showAlert('Debe seleccionar un fisioterapeuta.', 'error'); return false }

        // Si no viene de una evaluación previa (que ya tiene fecha), la fecha_hora es obligatoria
        if (!fecha_hora && !idEvaluacionSesion) {
            showAlert('Debe seleccionar fecha y hora.', 'error'); return false
        }

        // Verificamos disponibilidad solo si se va a agendar una cita principal ahora mismo
        if (fecha_hora) {
            const slotOcupado = await verificarDisponibilidad(idFisioterapeuta, fecha_hora)
            if (slotOcupado) {
                showAlert('Ese horario ya está ocupado para el fisioterapeuta seleccionado.', 'error')
                return false
            }
        }

        loadingAccion.value = true
        try {
            // ── 1. Caso simple: Solo Evaluación Inicial ─────────────────────
            if (modalidad === 'evaluacion_inicial') {
                const { data: sesion, error } = await supabase
                    .from('Sesion')
                    .insert({
                        idPaciente,
                        idFisioterapeuta,
                        fecha_hora,
                        estado: 'agendada', // Nace confirmada porque es gratis
                        estado_pago: 'cortesía',
                        tipo: 'evaluacion',
                        es_evaluacion_inicial: true,
                        numero_sesion: 1,
                        observaciones,
                        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
                    })
                    .select()
                    .single()

                if (error) throw error
                showAlert('✅ Evaluación inicial registrada (S/ 0.00).', 'success')
                return sesion
            }

            // ── 2. Caso 'tratamiento' o 'masaje': Llamar al RPC ─────────────
            const sesionesSolicitadas = tratamientoConfig.sesionesDeseadas || 0;
            if (sesionesSolicitadas < 1) {
                showAlert('Indique la cantidad de sesiones a contratar.', 'error')
                return false
            }

            // Adaptamos el string para que el RPC lo entienda según su lógica interna
            const modalidadDB = modalidad === 'masaje' ? 'masajes' : modalidad;

            const { data: ventaData, error: errVenta } = await supabase.rpc('vender_tratamiento', {
                p_id_paciente: idPaciente,
                p_id_fisioterapeuta: idFisioterapeuta,
                p_modalidad: modalidadDB,
                p_sesiones_solicitadas: sesionesSolicitadas,
                p_id_tratamiento_existente: idTratamientoExistente,
                p_id_evaluacion_sesion: idEvaluacionSesion,
                p_motivo_consulta: observaciones,
                p_diagnostico: null, // Se llenará en consulta médica
            })

            if (errVenta) throw errVenta
            const { id_tratamiento, combinacion, monto_total } = ventaData[0]

            let sesionPrincipal = null;

            // ── 3. Agendar la cita principal (Si no es un anclaje puro) ─────
            if (fecha_hora) {
                // Lógica de deuda: Si cobra y no agendó opcionales, la deuda se queda aquí
                const heredaDeuda = monto_total > 0 && sesionesOpcionales.length === 0;

                const { data: sesion, error: errSesion } = await supabase
                    .from('Sesion')
                    .insert({
                        idPaciente,
                        idFisioterapeuta,
                        fecha_hora,
                        idTratamiento: id_tratamiento,
                        es_evaluacion_inicial: modalidad === 'tratamiento',
                        estado: heredaDeuda ? 'reservada' : 'agendada',
                        estado_pago: heredaDeuda ? 'pendiente' : (modalidad === 'masaje' ? 'pendiente' : 'cortesía'),
                        tipo: modalidad === 'masaje' ? 'masaje' : 'evaluacion',
                        numero_sesion: idTratamientoExistente ? null : 1,
                        observaciones,
                        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
                    })
                    .select()
                    .single()

                if (errSesion) throw errSesion
                sesionPrincipal = sesion
            }

            // ── 4. Agendar sesiones opcionales en lote ──────────────────────
            if (sesionesOpcionales && sesionesOpcionales.length > 0) {
                const sesionesData = sesionesOpcionales.map((fechaIsoHora, index) => ({
                    idPaciente,
                    idFisioterapeuta,
                    idTratamiento: id_tratamiento,
                    es_evaluacion_inicial: false,
                    fecha_hora: fechaIsoHora,
                    estado: 'reservada', // Siempre reservadas hasta que paciente confirme asistencia
                    tipo: modalidad === 'masaje' ? 'masaje' : 'tratamiento_control',
                    numero_sesion: (idTratamientoExistente || idEvaluacionSesion) ? null : index + 2,
                    observaciones: 'Agendada en lote.',
                    // La primera de la lista recibe la deuda general del paquete/tratamiento
                    estado_pago: (index === 0 && monto_total > 0) ? 'pendiente' : 'pagado'
                }));

                const { error: errSesiones } = await supabase.from('Sesion').insert(sesionesData);
                if (errSesiones) throw errSesiones;
            }

            showAlert(`✅ ${idEvaluacionSesion ? 'Tratamiento anclado' : 'Operación exitosa'}: S/ ${monto_total.toFixed(2)}`, 'success')
            return { sesion: sesionPrincipal, id_tratamiento, combinacion, monto_total }

        } catch (err) {
            if (err.code === 'P0001') {
                showAlert('Regla de negocio: ' + err.message, 'error')
            } else {
                showAlert('Error al registrar: ' + (err.message || err.hint), 'error')
            }
            return false
        } finally {
            loadingAccion.value = false
        }
    }

    // ── agregarSesionesATratamiento (Para Recargas - Escenario B) ───────────
    const agregarSesionesATratamiento = async (payload) => {
        // En tu CitasView / ModalNuevaCita, el botón de recargar enviaría este payload unificado
        const {
            idPaciente,
            idFisioterapeuta,
            modalidad,               // 'tratamiento' | 'masaje'
            idTratamientoExistente,
            tratamientoConfig = {}
        } = payload

        const sesionesSolicitadas = tratamientoConfig.sesionesDeseadas || 0

        if (!idPaciente) { showAlert('Falta el paciente.', 'error'); return false }
        if (!idFisioterapeuta) { showAlert('Falta el fisioterapeuta.', 'error'); return false }
        if (sesionesSolicitadas < 1) {
            showAlert('Indique cuántas sesiones se van a recargar.', 'error')
            return false
        }
        if (!idTratamientoExistente) {
            showAlert('Debe indicar el tratamiento original a recargar.', 'error')
            return false
        }

        loadingAccion.value = true
        try {
            const modalidadDB = modalidad === 'masaje' ? 'masajes' : 'tratamiento';

            const { data, error } = await supabase.rpc('vender_tratamiento', {
                p_id_paciente: idPaciente,
                p_id_fisioterapeuta: idFisioterapeuta,
                p_modalidad: modalidadDB,
                p_sesiones_solicitadas: sesionesSolicitadas,
                p_id_tratamiento_existente: idTratamientoExistente,
                p_id_evaluacion_sesion: null, // Es recarga, no anclaje inicial
                p_motivo_consulta: null,
                p_diagnostico: null,
            })

            if (error) throw error
            const { id_tratamiento, combinacion, monto_total } = data[0]

            // Si envías sesionesOpcionales en este payload, podrías copiarlas e insertarlas aquí también
            // usando la misma lógica de "Agendar sesiones opcionales en lote" que hicimos arriba.

            showAlert(`✅ ${sesionesSolicitadas} sesión(es) recargada(s) — S/ ${monto_total.toFixed(2)}`, 'success')
            return { id_tratamiento, combinacion, monto_total }

        } catch (err) {
            if (err.code === 'P0001') {
                showAlert('Regla de negocio: ' + err.message, 'error')
            } else {
                showAlert('Error al recargar sesiones: ' + err.message, 'error')
            }
            return false
        } finally {
            loadingAccion.value = false
        }
    }


    const saldoPaciente = ref(0);

    // Agrega esta función
    const fetchSaldoPaciente = async (idPaciente) => {
        if (!idPaciente) { saldoPaciente.value = 0; return; }

        const { data, error } = await supabase
            .from('vw_saldo_paciente')
            .select('total_disponible')
            .eq('idPaciente', idPaciente)
            .maybeSingle(); // Usamos maybeSingle porque puede que el paciente aún no tenga registros

        saldoPaciente.value = data?.total_disponible ?? 0;
    };

    // ── registrarCheckIn ────────────────────────────────────────────────────────
    // Asegúrate de que el parámetro se llame 'sesion' (o cámbialo a 'cita' en ambos lados)
    const registrarCheckIn = async (sesion) => {
        if (!sesion || !sesion.idSesion) {
            console.error("Error: registrarCheckIn recibió un objeto inválido:", sesion);
            return false;
        }

        loadingAccion.value = true;
        try {
            const { error } = await supabase
                .from('Sesion')
                .update({
                    paciente_en_sala: true,
                })
                .eq('idSesion', sesion.idSesion);
            if (error) throw error;

            Object.assign(sesion, { ...sesion, paciente_en_sala: true });

            showAlert('✅ Paciente registrado en sala.', 'success');
            return true;
        } catch (err) {
            console.error("Error detallado:", err);
            showAlert('Error al registrar: ' + err.message, 'error');
            return false;
        } finally {
            loadingAccion.value = false;
        }
    }

    // ── confirmarPago ───────────────────────────────────────────────────────────
    const confirmarPago = async ({ idSesion, idPaciente, monto, metodoPago, numeroOperacion, idPaquete = null }) => {
        if (!metodoPago) { showAlert('Seleccione el método de pago.', 'error'); return false }
        if (monto === null || monto === undefined || monto <= 0) { showAlert('Ingrese un monto válido.', 'error'); return false }

        loadingAccion.value = true
        try {
            // 1. Insertar el pago
            const { error: errPago } = await supabase
                .from('Pago')
                .insert({
                    idPaciente,
                    idSesion: idPaquete ? null : idSesion,
                    idPaquete: idPaquete || null,
                    monto,
                    metodo_pago: metodoPago,
                    numero_operacion: numeroOperacion || null,
                    estado_pago: 'completado',
                })
            if (errPago) throw errPago

            // 2. Actualizar la sesión
            // OJO: Si pagas un paquete, el TRIGGER actualizará el Paquete. 
            // Pero la sesión específica también debe marcarse como pagada si era individual.

            const payloadSesion = { expires_at: null };

            // Si no es un paquete, la sesión en sí misma queda pagada.
            if (!idPaquete) {
                payloadSesion.estado_pago = 'pagado';
            }

            const { error: errSesion } = await supabase
                .from('Sesion')
                .update(payloadSesion)
                .eq('idSesion', idSesion)

            if (errSesion) throw errSesion

            showAlert('✅ Pago registrado correctamente.', 'success')
            return true
        } catch (err) {
            if (err.code === 'P0001') {
                showAlert('Regla de negocio: ' + err.message, 'error')
            } else {
                showAlert('Error al confirmar el pago: ' + err.message, 'error')
            }
            return false
        } finally {
            loadingAccion.value = false
        }
    }

    // ── cancelarCita ────────────────────────────────────────────────────────────
    const cancelarCita = async ({ idSesion, motivo }) => {
        if (!motivo?.trim()) { showAlert('Ingrese el motivo de la cancelación.', 'error'); return false }
        loadingAccion.value = true
        try {
            const { error } = await supabase
                .from('Sesion')
                .update({ estado: 'cancelada', observaciones: motivo.trim() })
                .eq('idSesion', idSesion)
                .in('estado', ['reservada', 'agendada'])
            if (error) throw error
            showAlert('Cita cancelada correctamente.', 'info')
            return true
        } catch (err) {
            showAlert('Error al cancelar la cita: ' + err.message, 'error')
            return false
        } finally {
            loadingAccion.value = false
        }
    }

    // ── marcarInasistencia ──────────────────────────────────────────────────────
    const marcarInasistencia = async (idSesion) => {
        loadingAccion.value = true
        try {
            const { error } = await supabase
                .from('Sesion')
                .update({ estado: 'no_asistio' })
                .eq('idSesion', idSesion)
                .eq('estado', 'agendada')
            if (error) throw error
            showAlert('Inasistencia registrada.', 'info')
            return true
        } catch (err) {
            showAlert('Error al registrar inasistencia: ' + err.message, 'error')
            return false
        } finally {
            loadingAccion.value = false
        }
    }

    // ── verificarDisponibilidad ─────────────────────────────────────────────────
    const verificarDisponibilidad = async (idFisioterapeuta, fecha_hora) => {
        // 1. Usar un rango más limpio para la consulta
        const fecha = new Date(fecha_hora);

        // Obtenemos los componentes sin pelear con el TimezoneOffset
        const year = fecha.getFullYear();
        const month = String(fecha.getMonth() + 1).padStart(2, '0');
        const day = String(fecha.getDate()).padStart(2, '0');
        const hours = String(fecha.getHours()).padStart(2, '0');
        const minutes = String(fecha.getMinutes()).padStart(2, '0');

        // Formato YYYY-MM-DD HH:MM:00
        const inicioBusqueda = `${year}-${month}-${day} ${hours}:${minutes}:00`;

        // Para el fin, sumamos 59 minutos a la fecha original
        const fechaFin = new Date(fecha.getTime() + (59 * 60 * 1000));
        const yearF = fechaFin.getFullYear();
        const monthF = String(fechaFin.getMonth() + 1).padStart(2, '0');
        const dayF = String(fechaFin.getDate()).padStart(2, '0');
        const hoursF = String(fechaFin.getHours()).padStart(2, '0');
        const minutesF = String(fechaFin.getMinutes()).padStart(2, '0');
        const finBusqueda = `${yearF}-${monthF}-${dayF} ${hoursF}:${minutesF}:59`;

        const { data, error } = await supabase
            .from('Sesion')
            .select('idSesion')
            .eq('idFisioterapeuta', idFisioterapeuta)
            // Usamos not.in para excluir los estados que no bloquean horario
            .not('estado', 'in', '("cancelada","reprogramada","no_asistio","atendida")')
            .gte('fecha_hora', inicioBusqueda)
            .lt('fecha_hora', finBusqueda)
            .limit(1);

        if (error) {
            console.error("Error al verificar disponibilidad:", error);
            return true; // Ante la duda, bloqueamos para evitar duplicados
        }

        return (data?.length ?? 0) > 0;
    }

    // ── Helpers de UI ────────────────────────────────────────────────────────────
    const formatFechaHora = (iso) => {
        if (!iso) return '—';
        return new Intl.DateTimeFormat('es-PE', {
            weekday: 'short', day: '2-digit', month: 'short',
            year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true,
            timeZone: 'America/Lima' // <--- FUERZA A LA ZONA HORARIA DE PERÚ
        }).format(new Date(iso));
    }

    const getEstadoInfo = (estado) =>
        ESTADOS_SESION[estado] ?? { label: estado, color: '#64748b', bg: '#f1f5f9' }

    const nombreCompleto = (persona) => {
        if (!persona) return '—'
        return `${persona.nombres ?? ''} ${persona.apellidos ?? ''}`.trim()
    }


    // ── confirmarAsistencia (Para evaluaciones gratuitas) ───────────────────────
    const confirmarAsistencia = async (idSesion) => {
        loadingAccion.value = true
        try {
            const { error } = await supabase
                .from('Sesion')
                .update({ estado: 'agendada' })
                .eq('idSesion', idSesion)
                .eq('estado', 'reservada')

            if (error) throw error
            showAlert('✅ Asistencia confirmada por teléfono. La cita está lista para el paciente.', 'success')
            return true
        } catch (err) {
            showAlert('Error al confirmar asistencia: ' + err.message, 'error')
            return false
        } finally {
            loadingAccion.value = false
        }
    }

    const calcularCombinacionOptima = (totalSesionesRequeridas, tarifario) => {
        // Asegúrate de que el 'tipo' o identificador coincida con tu BD
        const paquete5 = tarifario.find(t => t.tipo === 'paquete' && t.cantidad_sesiones === 5)
        const sesionSuelta = tarifario.find(t => t.tipo === 'sesion_suelta')

        if (!paquete5 || !sesionSuelta) return { paquetes: 0, sueltas: totalSesionesRequeridas, costoTotal: 0 }

        const cantidadPaquetes = Math.floor(totalSesionesRequeridas / 5)
        const cantidadSueltas = totalSesionesRequeridas % 5

        const costoTotal = (cantidadPaquetes * paquete5.precio) + (cantidadSueltas * sesionSuelta.precio)

        return {
            paquetes: cantidadPaquetes,
            sueltas: cantidadSueltas,
            costoTotal: costoTotal
        }
    }

    // ── reprogramarCita (Máximo 1 vez) ──────────────────────────────────────────
    const reprogramarCita = async ({ idSesion, idFisioterapeutaNuevo, nuevaFechaHora, motivo }) => {
        if (!motivo?.trim()) { showAlert('Ingrese el motivo de reprogramación.', 'error'); return false }
        if (!nuevaFechaHora) { showAlert('Seleccione la nueva fecha y hora.', 'error'); return false }
        if (!idFisioterapeutaNuevo) { showAlert('Seleccione un fisioterapeuta.', 'error'); return false }

        // Validación de fecha en el frontend (defensa en superficie, el trigger de BD también valida)
        const fechaCita = new Date(nuevaFechaHora)
        const ahora = new Date()
        ahora.setMinutes(ahora.getMinutes() - 5) // 5 min de gracia
        if (fechaCita < ahora) {
            showAlert('La nueva fecha y hora no puede estar en el pasado.', 'error')
            return false
        }

        loadingAccion.value = true
        try {
            // Una sola llamada — toda la lógica vive en Postgres, atómica y con rollback automático
            const { data: nuevaId, error } = await supabase.rpc('reprogramar_sesion', {
                p_id_sesion: idSesion,
                p_id_fisioterapeuta: idFisioterapeutaNuevo,
                p_nueva_fecha_hora: nuevaFechaHora,
                p_motivo: motivo.trim(),
            })

            if (error) throw error

            showAlert('✅ Cita reprogramada exitosamente.', 'success')
            return nuevaId  // retorna el idSesion de la nueva cita

        } catch (err) {
            // Los errores de regla de negocio vienen con el mensaje exacto del RAISE EXCEPTION
            showAlert('Error: ' + (err.message || 'Error desconocido al reprogramar'), 'error')
            return false
        } finally {
            loadingAccion.value = false
        }
    }

    const tarifario = ref([]);
    const fetchTarifario = async () => {
        const { data, error } = await supabase
            .from('Catalogo_Servicio')
            .select('idServicio, nombre, precio, tipo')
            .eq('activo', true);

        if (!error) tarifario.value = data;
    };

    return {
        // Estado
        citas, fisios, pacientes, paquetes, horarios,
        loading, loadingAccion, userRole, userId,
        // Computed de rol
        esFisioterapeuta, esSecretaria, esPaciente, esAdmin, puedeGestionar,
        // Acciones
        initUser,
        fetchCitas, fetchFisios, fetchPacientes,
        fetchPaquetesPaciente,
        fetchHorarioFisio,
        obtenerSlotsDisponibles, fetchTarifario,
        crearCita, registrarCheckIn, confirmarPago, saldoPaciente,
        cancelarCita, marcarInasistencia, confirmarAsistencia, reprogramarCita,
        agregarSesionesATratamiento, // ✅ NUEVO
        calcularCombinacionOptima,   // ✅ ASEGURAR QUE ESTÉ EXPORTADO
        fetchEvaluacionesHuerfanas,   // ✅ NUEVO
        // Helpers
        formatFechaHora, getEstadoInfo, nombreCompleto, verificarDisponibilidad, fetchSaldoPaciente,
    }
}