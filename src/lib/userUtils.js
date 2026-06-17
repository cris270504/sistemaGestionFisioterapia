/**
 * userUtils.js - Utilidades centralizadas para manejo de datos de usuario
 * 
 * BENEFICIO: Consistencia en acceso a metadata de usuario (5+ archivos)
 * Usado por: AppNavbar, useCitas, router/index.js, etc.
 */

/**
 * Extrae el rol del usuario desde metadata
 * @param {Object} user - Usuario de Supabase
 * @returns {string} Rol del usuario ('admin', 'secretaria', 'fisioterapeuta', 'paciente')
 */
export const getUserRole = (user) => {
  return user?.user_metadata?.rol || 'paciente'
}

/**
 * Genera el nombre completo del usuario
 * @param {Object} user - Usuario de Supabase
 * @returns {string} Nombre completo o email
 */
export const getUserDisplayName = (user) => {
  if (!user) return 'Usuario'
  
  const { nombres = '', apellidos = '' } = user.user_metadata || {}
  const fullName = (nombres + ' ' + apellidos).trim()
  
  return fullName || user.email?.split('@')[0] || 'Usuario'
}

/**
 * Genera las iniciales del usuario para avatar
 * @param {Object} user - Usuario de Supabase
 * @returns {string} Iniciales (máximo 2 caracteres)
 */
export const getUserInitials = (user) => {
  const name = getUserDisplayName(user)
  return name
    .split(' ')
    .map(word => word[0])
    .join('')
    .substring(0, 2)
    .toUpperCase()
}

/**
 * Verifica si el usuario tiene un rol específico
 * @param {Object} user - Usuario de Supabase
 * @param {string|string[]} roles - Rol(es) a verificar
 * @returns {boolean}
 */
export const hasRole = (user, roles) => {
  const userRole = getUserRole(user)
  if (Array.isArray(roles)) {
    return roles.includes(userRole)
  }
  return userRole === roles
}

/**
 * Verifica si el usuario puede gestionar recursos (secretaria o admin)
 * @param {Object} user - Usuario de Supabase
 * @returns {boolean}
 */
export const canManage = (user) => {
  const userRole = getUserRole(user)
  return ['secretaria', 'admin'].includes(userRole)
}

/**
 * Verifica si el usuario es fisioterapeuta o admin
 * @param {Object} user - Usuario de Supabase
 * @returns {boolean}
 */
export const isTherapist = (user) => {
  const userRole = getUserRole(user)
  return ['fisioterapeuta', 'admin'].includes(userRole)
}

/**
 * Obtiene el label legible del rol en español
 * @param {string} role - Código del rol
 * @returns {string} Label
 */
export const getRoleLabel = (role) => {
  const labels = {
    admin: 'Administrador',
    secretaria: 'Secretaria',
    fisioterapeuta: 'Fisioterapeuta',
    paciente: 'Paciente'
  }
  return labels[role] || 'Sin rol'
}

/**
 * Obtiene el color del badge para un rol
 * @param {string} role - Código del rol
 * @returns {Object} { bg: string, color: string }
 */
export const getRoleBadgeStyle = (role) => {
  const styles = {
    admin: { bg: '#e2e8f0', color: '#1a3a6e' },
    secretaria: { bg: '#fef3c7', color: '#d97706' },
    fisioterapeuta: { bg: '#dceef8', color: '#4a90c4' },
    paciente: { bg: '#d1fae5', color: '#059669' }
  }
  return styles[role] || { bg: '#f3f4f6', color: '#64748b' }
}

/**
 * Obtiene datos del usuario de manera segura
 * Valida que exista antes de acceder
 * @param {Object} user - Usuario de Supabase
 * @returns {Object} { nombres, apellidos, email, rol }
 */
export const getUserData = (user) => {
  if (!user) {
    return { nombres: '', apellidos: '', email: '', rol: 'paciente' }
  }
  
  return {
    nombres: user.user_metadata?.nombres || '',
    apellidos: user.user_metadata?.apellidos || '',
    email: user.email || '',
    rol: user.user_metadata?.rol || 'paciente',
    id: user.id
  }
}
