<script setup>
import { useRouter } from 'vue-router'
import { ref } from 'vue'
import { supabase } from '../lib/supabaseClient'
import { useAlert } from '@/composables/useAlert'
import logoImg from '@/components/icons/MovyBalance.png'

const router = useRouter()
const { showAlert } = useAlert()

const isLogin = ref(true)
const loading = ref(false)
const email = ref('')
const password = ref('')
const nombres = ref('')
const apellidos = ref('')
const showPassword = ref(false)

const handleSubmit = async () => {
    loading.value = true
    try {
        if (isLogin.value) {
            const { data, error } = await supabase.auth.signInWithPassword({
                email: email.value,
                password: password.value
            })
            if (error) throw error
            router.push({ name: 'dashboard' })
            showAlert('¡Bienvenido de vuelta a MovyBalance!', 'success')
        } else {
            const { data, error } = await supabase.auth.signUp({
                email: email.value,
                password: password.value,
                options: {
                    data: {
                        nombres: nombres.value,
                        apellidos: apellidos.value
                    }
                }
            })
            if (error) throw error
            showAlert('¡Cuenta creada con éxito! Revisa tu correo para confirmar tu cuenta.', 'success') // Alerta Éxito
            isLogin.value = true
        }
    } catch (error) {
        showAlert(error.message, 'error')
    } finally {
        loading.value = false
    }
}

const toggleMode = () => {
    isLogin.value = !isLogin.value
    email.value = ''
    password.value = ''
    nombres.value = ''
    apellidos.value = ''
}
</script>

<template>
    <!-- Página: ocupa exactamente el viewport, sin scroll -->
    <div class="auth-page">

        <!-- Tarjeta centrada -->
        <div class="auth-card" :class="{ 'is-register': !isLogin }">

            <!-- Logo real -->
            <div class="card-header">
                <img :src="logoImg" alt="MovyBalance" class="logo-img" />
            </div>

            <!-- Título -->
            <div class="form-title">
                <h2>{{ isLogin ? 'Bienvenido de vuelta' : 'Crear cuenta nueva' }}</h2>
                <p>{{ isLogin ? 'Ingresa tus credenciales para acceder al sistema' : 'Completa los datos para registrarte' }}</p>
            </div>

            <!-- Formulario -->
            <form @submit.prevent="handleSubmit" class="auth-form">

                <!-- Campos extra solo en registro -->
                <Transition name="slide-down">
                    <div v-if="!isLogin" class="fields-row">
                        <div class="form-group">
                            <label for="nombres">Nombres</label>
                            <div class="input-wrapper">
                                <svg class="input-icon" viewBox="0 0 20 20" fill="currentColor">
                                    <path
                                        d="M10 9a3 3 0 100-6 3 3 0 000 6zM6 8a2 2 0 11-4 0 2 2 0 014 0zm8 0a2 2 0 104 0 2 2 0 00-4 0z" />
                                </svg>
                                <input id="nombres" type="text" v-model="nombres" placeholder="Ej: Liliana" required />
                            </div>
                        </div>
                        <div class="form-group">
                            <label for="apellidos">Apellidos</label>
                            <div class="input-wrapper">
                                <svg class="input-icon" viewBox="0 0 20 20" fill="currentColor">
                                    <path
                                        d="M10 9a3 3 0 100-6 3 3 0 000 6zM6 8a2 2 0 11-4 0 2 2 0 014 0zm8 0a2 2 0 104 0 2 2 0 00-4 0z" />
                                </svg>
                                <input id="apellidos" type="text" v-model="apellidos" placeholder="Ej: Meza Berru"
                                    required />
                            </div>
                        </div>
                    </div>
                </Transition>

                <!-- Email -->
                <div class="form-group">
                    <label for="email">Correo Electrónico</label>
                    <div class="input-wrapper">
                        <svg class="input-icon" viewBox="0 0 20 20" fill="currentColor">
                            <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
                            <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
                        </svg>
                        <input id="email" type="email" v-model="email" placeholder="correo@ejemplo.com" required
                            autocomplete="email" />
                    </div>
                </div>

                <!-- Contraseña -->
                <div class="form-group">
                    <label for="password">Contraseña</label>
                    <div class="input-wrapper">
                        <svg class="input-icon" viewBox="0 0 20 20" fill="currentColor">
                            <path fill-rule="evenodd"
                                d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z"
                                clip-rule="evenodd" />
                        </svg>
                        <input id="password" :type="showPassword ? 'text' : 'password'" v-model="password"
                            placeholder="••••••••" required autocomplete="current-password" />
                        <button type="button" class="toggle-password" @click="showPassword = !showPassword"
                            tabindex="-1">
                            <svg v-if="!showPassword" viewBox="0 0 20 20" fill="currentColor">
                                <path d="M10 12a2 2 0 100-4 2 2 0 000 4z" />
                                <path fill-rule="evenodd"
                                    d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z"
                                    clip-rule="evenodd" />
                            </svg>
                            <svg v-else viewBox="0 0 20 20" fill="currentColor">
                                <path fill-rule="evenodd"
                                    d="M3.707 2.293a1 1 0 00-1.414 1.414l14 14a1 1 0 001.414-1.414l-1.473-1.473A10.014 10.014 0 0019.542 10C18.268 5.943 14.478 3 10 3a9.958 9.958 0 00-4.512 1.074l-1.78-1.781zm4.261 4.26l1.514 1.515a2.003 2.003 0 012.45 2.45l1.514 1.514a4 4 0 00-5.478-5.478z"
                                    clip-rule="evenodd" />
                                <path
                                    d="M12.454 16.697L9.75 13.992a4 4 0 01-3.742-3.741L2.335 6.578A9.98 9.98 0 00.458 10c1.274 4.057 5.064 7 9.542 7 .847 0 1.669-.105 2.454-.303z" />
                            </svg>
                        </button>
                    </div>
                </div>

                <!-- Submit -->
                <button type="submit" class="submit-btn" :disabled="loading">
                    <span v-if="loading" class="spinner"></span>
                    <span v-else>{{ isLogin ? 'Ingresar al Sistema' : 'Crear Cuenta' }}</span>
                </button>
            </form>

            <!-- Toggle -->
            <div class="card-footer">
                <p>
                    {{ isLogin ? '¿Aún no tienes cuenta?' : '¿Ya tienes una cuenta?' }}
                    <button type="button" class="toggle-link" @click="toggleMode">
                        {{ isLogin ? 'Regístrate aquí' : 'Inicia sesión' }}
                    </button>
                </p>
            </div>

        </div>
    </div>
</template>

<style scoped>


/* ── Página: viewport completo, sin scroll ───────── */
.auth-page {
    /* Ocupa exactamente la pantalla visible */
    width: 100vw;
    height: 100vh;
    overflow: hidden;

    display: flex;
    align-items: center;
    justify-content: center;

    /* Fondo neutro de toda la pantalla */
    background: #eef4f9;
    font-family: 'DM Sans', sans-serif;
    box-sizing: border-box;
    padding: 16px;
}

/* ── Tarjeta ─────────────────────────────────────── */
.auth-card {
    background: var(--white);
    border-radius: 20px;
    padding: 32px 40px 28px;
    width: 100%;
    max-width: 440px;

    /* Sombra solo en la tarjeta → el fondo permanece plano */
    box-shadow:
        0 4px 24px rgba(26, 58, 110, 0.10),
        0 1px 4px rgba(26, 58, 110, 0.06);
    border: 1px solid rgba(74, 144, 196, 0.12);

    /* Si hay muchos campos (registro) y la pantalla es pequeña, scroll solo dentro */
    max-height: 96vh;
    overflow-y: auto;

    animation: card-enter 0.5s cubic-bezier(0.34, 1.56, 0.64, 1) both;
}

.auth-card.is-register {
    max-width: 500px;
}

@keyframes card-enter {
    from {
        opacity: 0;
        transform: translateY(24px) scale(0.97);
    }

    to {
        opacity: 1;
        transform: translateY(0) scale(1);
    }
}

/* ── Logo real ───────────────────────────────────── */
.card-header {
    display: flex;
    justify-content: center;
    margin-bottom: 0px;
    padding-bottom: 20px;
    border-bottom: 1px solid var(--gray-100);
}

.logo-img {
    height: 150px;
    /* ajusta si quieres más/menos grande */
    width: auto;
    object-fit: contain;
    display: block;
}

/* ── Título del formulario ───────────────────────── */
.form-title {
    margin-bottom: 20px;
}

.form-title h2 {
    font-family: 'Playfair Display', serif;
    font-size: 19px;
    color: var(--navy);
    margin: 0 0 3px;
    font-weight: 700;
}

.form-title p {
    font-size: 13px;
    color: var(--gray-500);
    margin: 0;
}

/* ── Formulario ──────────────────────────────────── */
.auth-form {
    display: flex;
    flex-direction: column;
    gap: 14px;
}

.fields-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
}

.form-group {
    display: flex;
    flex-direction: column;
    gap: 5px;
}

.form-group label {
    font-size: 12px;
    font-weight: 600;
    color: var(--navy);
    letter-spacing: 0.3px;
}

.input-wrapper {
    position: relative;
    display: flex;
    align-items: center;
}

.input-icon {
    position: absolute;
    left: 12px;
    width: 15px;
    height: 15px;
    color: var(--blue);
    opacity: 0.7;
    pointer-events: none;
}

.input-wrapper input {
    width: 100%;
    padding: 10px 38px 10px 36px;
    border: 1.5px solid var(--gray-300);
    border-radius: var(--radius-sm);
    font-family: 'DM Sans', sans-serif;
    font-size: 13.5px;
    color: var(--gray-700);
    background: var(--gray-50);
    outline: none;
    box-sizing: border-box;
    transition: border-color var(--transition), box-shadow var(--transition), background var(--transition);
}

.input-wrapper input::placeholder {
    color: var(--gray-300);
}

.input-wrapper input:focus {
    border-color: var(--blue);
    background: var(--white);
    box-shadow: 0 0 0 3px rgba(74, 144, 196, 0.15);
}

.toggle-password {
    position: absolute;
    right: 10px;
    background: none;
    border: none;
    cursor: pointer;
    padding: 4px;
    color: var(--gray-500);
    display: flex;
    align-items: center;
    transition: color var(--transition);
}

.toggle-password:hover {
    color: var(--navy);
}

.toggle-password svg {
    width: 16px;
    height: 16px;
}

/* ── Botón ───────────────────────────────────────── */
.submit-btn {
    width: 100%;
    padding: 13px;
    margin-top: 2px;
    background: linear-gradient(135deg, var(--navy) 0%, #1e4d8c 60%, var(--blue) 100%);
    color: var(--white);
    border: none;
    border-radius: var(--radius-sm);
    font-family: 'DM Sans', sans-serif;
    font-size: 14.5px;
    font-weight: 600;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    box-shadow: 0 4px 14px rgba(26, 58, 110, 0.28);
    transition: transform var(--transition), box-shadow var(--transition), opacity var(--transition);
}

.submit-btn:hover:not(:disabled) {
    transform: translateY(-1px);
    box-shadow: 0 6px 20px rgba(26, 58, 110, 0.38);
}

.submit-btn:active:not(:disabled) {
    transform: translateY(0);
}

.submit-btn:disabled {
    opacity: 0.65;
    cursor: not-allowed;
}

.spinner {
    width: 17px;
    height: 17px;
    border: 2px solid rgba(255, 255, 255, 0.35);
    border-top-color: white;
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
}

@keyframes spin {
    to {
        transform: rotate(360deg);
    }
}

/* ── Footer toggle ───────────────────────────────── */
.card-footer {
    margin-top: 18px;
    text-align: center;
}

.card-footer p {
    font-size: 13px;
    color: var(--gray-500);
    margin: 0;
}

.toggle-link {
    background: none;
    border: none;
    font-family: 'DM Sans', sans-serif;
    font-size: 13px;
    font-weight: 600;
    color: var(--blue);
    cursor: pointer;
    padding: 0;
    margin-left: 4px;
    text-decoration: underline;
    text-decoration-color: transparent;
    transition: color var(--transition), text-decoration-color var(--transition);
}

.toggle-link:hover {
    color: var(--navy);
    text-decoration-color: var(--navy);
}

/* ── Badge profesional ───────────────────────────── */
.professional-badge {
    margin-top: 18px;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    font-size: 10px;
    letter-spacing: 1.5px;
    text-transform: uppercase;
    color: var(--gray-300);
    font-weight: 500;
}

.badge-dot {
    display: inline-block;
    width: 4px;
    height: 4px;
    border-radius: 50%;
    background: var(--blue-light);
}

/* ── Transición campos registro ──────────────────── */
.slide-down-enter-active,
.slide-down-leave-active {
    transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
    overflow: hidden;
}

.slide-down-enter-from,
.slide-down-leave-to {
    opacity: 0;
    transform: translateY(-10px);
    max-height: 0;
}

.slide-down-enter-to,
.slide-down-leave-from {
    opacity: 1;
    transform: translateY(0);
    max-height: 200px;
}

/* ── Responsive ──────────────────────────────────── */
@media (max-width: 480px) {
    .auth-card {
        padding: 24px 20px 20px;
        border-radius: 16px;
    }

    .fields-row {
        grid-template-columns: 1fr;
    }

    .logo-img {
        height: 70px;
    }
}
</style>