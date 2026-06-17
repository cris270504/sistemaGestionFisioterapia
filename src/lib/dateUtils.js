/**
 * dateUtils.js - Utilidades centralizadas para manejo de fechas
 * 
 * BENEFICIO: Elimina duplicación de código en 3+ archivos
 * Usado por: CitasView, ModalNuevaCita, ModalReprogramarCita, etc.
 */

/**
 * Convierte una fecha a formato ISO YYYY-MM-DD
 * @param {Date} date - Fecha a convertir (por defecto: hoy)
 * @returns {string} Fecha en formato YYYY-MM-DD
 */
export const getDateISO = (date = new Date()) => {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

/**
 * Obtiene la fecha de hoy en formato ISO
 * @returns {string} Fecha de hoy en formato YYYY-MM-DD
 */
export const getTodayISO = () => getDateISO()

/**
 * Convierte partes de fecha a ISO 8601 completo (con hora)
 * @param {string} dateStr - Formato YYYY-MM-DD
 * @param {string} timeStr - Formato HH:mm
 * @returns {string|null} ISO 8601 datetime o null
 */
export const getDateTimeISO = (dateStr, timeStr) => {
  if (!dateStr || !timeStr) return null
  const [yyyy, mm, dd] = dateStr.split('-')
  const [hh, min] = timeStr.split(':')
  return new Date(yyyy, mm - 1, dd, hh, min, 0).toISOString()
}

/**
 * Formatea una fecha ISO a texto legible en español
 * @param {string} iso - Fecha en formato ISO
 * @param {string} formato - 'corto' | 'completo'
 * @returns {string} Fecha formateada
 */
export const formatDateES = (iso, formato = 'completo') => {
  if (!iso) return ''
  const date = new Date(iso)
  
  if (formato === 'corto') {
    return new Intl.DateTimeFormat('es-PE', { 
      day: '2-digit', 
      month: '2-digit', 
      year: 'numeric' 
    }).format(date)
  }
  
  return new Intl.DateTimeFormat('es-PE', { 
    weekday: 'long',
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  }).format(date)
}

/**
 * Extrae solo la hora de una fecha ISO
 * @param {string} iso - Fecha en formato ISO
 * @returns {string} Hora en formato HH:mm
 */
export const getTimeFromISO = (iso) => {
  if (!iso) return ''
  return new Intl.DateTimeFormat('es-PE', { 
    hour: '2-digit', 
    minute: '2-digit' 
  }).format(new Date(iso))
}

/**
 * Obtiene el día de la semana (1-7, donde 1 es lunes, 7 es domingo)
 * @param {string} dateStr - Formato YYYY-MM-DD
 * @returns {number} Día de la semana (1-7)
 */
export const getDayOfWeek = (dateStr) => {
  const [yyyy, mm, dd] = dateStr.split('-')
  const date = new Date(yyyy, mm - 1, dd)
  let day = date.getDay()
  return day === 0 ? 7 : day
}

/**
 * Valida si una cadena está en formato YYYY-MM-DD
 * @param {string} dateStr - Cadena a validar
 * @returns {boolean}
 */
export const isValidDateFormat = (dateStr) => {
  return /^\d{4}-\d{2}-\d{2}$/.test(dateStr)
}

/**
 * Valida si una cadena está en formato HH:mm
 * @param {string} timeStr - Cadena a validar
 * @returns {boolean}
 */
export const isValidTimeFormat = (timeStr) => {
  return /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(timeStr)
}

/**
 * Formatea rango de fechas para mostrar
 * @param {string} inicio - Fecha inicio (YYYY-MM-DD)
 * @param {string} fin - Fecha fin (YYYY-MM-DD)
 * @returns {string} Rango formateado
 */
export const formatDateRange = (inicio, fin) => {
  return `${formatDateES(inicio, 'corto')} - ${formatDateES(fin, 'corto')}`
}

/**
 * Calcula la edad basada en fecha de nacimiento
 * @param {string} fechaNacimiento - Formato YYYY-MM-DD
 * @returns {number} Edad en años
 */
export const calcularEdad = (fechaNacimiento) => {
  const hoy = new Date()
  const nacimiento = new Date(fechaNacimiento)
  let edad = hoy.getFullYear() - nacimiento.getFullYear()
  const mesActual = hoy.getMonth()
  const mesNacimiento = nacimiento.getMonth()
  
  if (mesActual < mesNacimiento || 
      (mesActual === mesNacimiento && hoy.getDate() < nacimiento.getDate())) {
    edad--
  }
  
  return edad
}
