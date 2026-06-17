/**
 * validators.js - Validadores reutilizables centralizados
 * 
 * BENEFICIO: Elimina validaciones hardcodeadas en 3+ componentes
 * Usado por: FormularioPacienteModal, GestorTarifario, etc.
 */

// Patrones de documentos
export const DOCUMENT_PATTERNS = {
  DNI: /^[0-9]{8}$/,
  CE: /^[a-zA-Z0-9]{8,12}$/,
  RUC: /^[0-9]{11}$/,
  PASAPORTE: /^[a-zA-Z0-9]{6,20}$/
}

/**
 * Valida un documento según su tipo
 * @param {string} type - Tipo de documento (DNI, CE, RUC, PASAPORTE)
 * @param {string} value - Número de documento
 * @returns {boolean}
 */
export const validateDocument = (type, value) => {
  const pattern = DOCUMENT_PATTERNS[type]
  if (!pattern) return false
  return pattern.test(value.trim())
}

/**
 * Obtiene un mensaje de error legible para validación de documento
 * @param {string} type - Tipo de documento
 * @returns {string}
 */
export const getDocumentErrorMessage = (type) => {
  const messages = {
    DNI: 'El DNI debe contener exactamente 8 dígitos numéricos.',
    CE: 'El Carné de Extranjería debe tener entre 8 y 12 caracteres alfanuméricos.',
    RUC: 'El RUC debe contener exactamente 11 dígitos numéricos.',
    PASAPORTE: 'El Pasaporte debe tener entre 6 y 20 caracteres alfanuméricos.'
  }
  return messages[type] || 'Formato de documento inválido.'
}

/**
 * Valida un correo electrónico
 * @param {string} email - Correo a validar
 * @returns {boolean}
 */
export const validateEmail = (email) => {
  const pattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  return pattern.test(email)
}

/**
 * Valida un número de teléfono (Perú: 9 dígitos)
 * @param {string} phone - Número de teléfono
 * @returns {boolean}
 */
export const validatePhone = (phone) => {
  const pattern = /^[0-9]{9}$/
  return pattern.test(phone.replace(/\D/g, ''))
}

/**
 * Valida que un texto no sea vacío o solo espacios
 * @param {string} text - Texto a validar
 * @returns {boolean}
 */
export const validateText = (text) => {
  return text.trim().length > 0
}

/**
 * Valida que un número sea positivo
 * @param {number} value - Valor a validar
 * @param {boolean} allowZero - Permitir cero
 * @returns {boolean}
 */
export const validatePositiveNumber = (value, allowZero = false) => {
  const num = Number(value)
  if (isNaN(num)) return false
  return allowZero ? num >= 0 : num > 0
}

/**
 * Valida fecha en formato YYYY-MM-DD
 * @param {string} dateStr - Fecha a validar
 * @returns {boolean}
 */
export const validateDateFormat = (dateStr) => {
  return /^\d{4}-\d{2}-\d{2}$/.test(dateStr)
}

/**
 * Valida que la fecha no sea en el futuro
 * @param {string} dateStr - Fecha en formato YYYY-MM-DD
 * @returns {boolean}
 */
export const validateMaxDate = (dateStr) => {
  const date = new Date(dateStr)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return date <= today
}

/**
 * Valida que la fecha no sea en el pasado
 * @param {string} dateStr - Fecha en formato YYYY-MM-DD
 * @returns {boolean}
 */
export const validateMinDate = (dateStr) => {
  const date = new Date(dateStr)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return date >= today
}

/**
 * Valida monto de pago (mayor a 0)
 * @param {number} monto - Monto a validar
 * @returns {boolean}
 */
export const validatePaymentAmount = (monto) => {
  return validatePositiveNumber(monto, false)
}

/**
 * Valida que el monto no exceda un máximo
 * @param {number} monto - Monto a validar
 * @param {number} maximo - Máximo permitido
 * @returns {boolean}
 */
export const validatePaymentAmountNotExceeds = (monto, maximo) => {
  return validatePaymentAmount(monto) && Number(monto) <= Number(maximo)
}

/**
 * Validadores agrupados por campo
 * Útil para iterar sobre múltiples validaciones
 */
export const VALIDATORS = {
  nombres: {
    validate: validateText,
    message: 'Los nombres son obligatorios'
  },
  apellidos: {
    validate: validateText,
    message: 'Los apellidos son obligatorios'
  },
  email: {
    validate: validateEmail,
    message: 'El correo electrónico no es válido'
  },
  celular: {
    validate: validatePhone,
    message: 'El número de teléfono debe tener 9 dígitos'
  },
  precio: {
    validate: (val) => validatePositiveNumber(val, false),
    message: 'El precio debe ser mayor a 0'
  },
  monto: {
    validate: validatePaymentAmount,
    message: 'El monto debe ser mayor a S/ 0.00'
  }
}
