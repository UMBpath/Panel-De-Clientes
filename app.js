// Configuración de Supabase
const SUPABASE_URL = "https://lcrctcaogoyimtjmdqzu.supabase.co";
const SUPABASE_KEY = "sb_publishable_gQeoJvYho2FGdOX-JqXJlQ_6qJDzxV-";

// Tiempo máximo de inactividad sin recibir vibraciones: 2 horas (en milisegundos)
const TIEMPO_MAX_INACTIVIDAD_MS = 2 * 60 * 60 * 1000; // 2 horas (7,200,000 ms)

// Inicializar Supabase
let supabaseClient;

try {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
    console.log("Supabase inicializado correctamente");
} catch (error) {
    console.error("Error inicializando Supabase:", error);
    showMessage("login-message", "Error cargando Supabase. Por favor recarga la página.", "error");
}

// Elementos del DOM
const loginScreen = document.getElementById('login-screen');
const mainScreen = document.getElementById('main-screen');
const loginForm = document.getElementById('login-form');
const logoutBtn = document.getElementById('logout-btn');
const userDisplay = document.getElementById('user-display');
const statusIcon = document.getElementById('status-icon');
const statusTitle = document.getElementById('status-title') || document.getElementById('status-text');
const statusDetail = document.getElementById('status-detail');
const vibrationLetter = document.getElementById('vibration-letter');
const vibrationTime = document.getElementById('vibration-time');
const vibrationModal = document.getElementById('vibration-modal');
const vibrationModalLetter = document.getElementById('vibration-modal-letter');
const vibrationModalCount = document.getElementById('vibration-modal-count');

// Elementos de Bloqueo Estilo Netflix
const lockOverlay = document.getElementById('netflix-lock-overlay');
const btnLockScreen = document.getElementById('btn-lock-screen');
const lockBubble = document.getElementById('lock-bubble');
const lockStatusText = document.getElementById('lock-status-text');
const lockConfirmBtn = document.getElementById('lock-confirm-btn');
const lockStealthLetter = document.getElementById('lock-stealth-letter');
const lockFooterHint = document.getElementById('lock-footer-hint');

// Información del usuario y estado
let currentUser = null;
let userData = null;
let realtimeChannel = null;

// ============================================================
// CONTROL DE INACTIVIDAD (2 HORAS SIN VIBRACIÓN: ABIERTA O CERRADA)
// ============================================================

function registrarActividadVibracion() {
    localStorage.setItem('ultima_vibracion_timestamp', Date.now().toString());
}

function verificarInactividadSesion() {
    if (!currentUser) return;

    const ultimoTimestamp = parseInt(localStorage.getItem('ultima_vibracion_timestamp') || '0', 10);
    if (ultimoTimestamp > 0 && (Date.now() - ultimoTimestamp) >= TIEMPO_MAX_INACTIVIDAD_MS) {
        console.log("⏰ Pasaron 2 horas sin recibir vibraciones. Cerrando sesión automáticamente...");
        cerrarSesionPorInactividad();
    }
}

// Revisar cada 30 segundos mientras la página esté abierta
setInterval(verificarInactividadSesion, 30000);

function cerrarSesionPorInactividad() {
    limpiarSesion();
    mainScreen.classList.add('hidden');
    loginScreen.classList.remove('hidden');
    loginForm.reset();
    showMessage(
        "login-message",
        "Tu sesión se cerró automáticamente por inactividad (más de 2 horas sin vibraciones). Por favor, ingresa tus credenciales de nuevo.",
        "info"
    );
}

function limpiarSesion() {
    if (licenseTimerInterval) {
        clearInterval(licenseTimerInterval);
        licenseTimerInterval = null;
    }

    if (realtimeChannel) {
        realtimeChannel.unsubscribe();
        realtimeChannel = null;
    }

    localStorage.removeItem('usuario');
    localStorage.removeItem('password');
    localStorage.removeItem('ultima_vibracion_timestamp');

    currentUser = null;
    userData = null;

    if (typeof desactivarBloqueoNetflix === 'function') {
        desactivarBloqueoNetflix();
    }
    if (typeof releaseWakeLock === 'function') {
        releaseWakeLock();
    }
}

// ============================================================
// MOTOR DE VIBRACIÓN FUERTE (0.8s continuo y espaciado)
// ============================================================
let isVibrating = false;

async function triggerVibration(count) {
    if (isVibrating) {
        console.log("Ya hay una vibración en curso. Esperando...");
        return;
    }
    isVibrating = true;

    if (navigator.vibrate) {
        for (let i = 0; i < count; i++) {
            try {
                // 800ms de vibración continua a máxima intensidad
                navigator.vibrate(800);
            } catch (e) {
                console.error("Error al llamar a navigator.vibrate:", e);
            }

            if (i < count - 1) {
                // 800ms vibrando + 800ms de pausa entre cada pulso
                await new Promise(r => setTimeout(r, 1600));
            } else {
                await new Promise(r => setTimeout(r, 800));
            }
        }
    } else {
        console.warn("Este dispositivo o navegador no soporta navigator.vibrate");
    }

    isVibrating = false;
}

// Obtener número de vibraciones por letra
function getVibrationCount(letra) {
    const map = { 'A': 1, 'B': 2, 'C': 3, 'D': 4, 'E': 5 };
    return map[String(letra).toUpperCase()] || 1;
}

// Mostrar mensajes de alerta
function showMessage(elementId, message, type = '') {
    const element = document.getElementById(elementId);
    if (element) {
        element.textContent = message;
        element.className = type ? `message ${type}` : 'message';
    }
}

// Actualizar estado de conexión
function updateConnectionStatus(status, text, detail) {
    if (statusIcon) statusIcon.className = `status-icon ${status}`;
    if (statusTitle) statusTitle.textContent = text;
    if (statusDetail) statusDetail.textContent = detail;
}

// Autenticar usuario (si la licencia expiró, igual puede entrar pero en modo inactivo)
async function authenticateUser(username, password) {
    try {
        const response = await supabaseClient.rpc('autenticar_usuario_app', {
            p_usuario: username,
            p_password: password,
            p_device_id: getDeviceId(),
            p_origen: 'web'
        });

        // Caso: la licencia expiró -> el usuario entra a su cuenta pero inactivo (no le sirve nada)
        const msg = (response.data?.mensaje || response.error?.message || '').toLowerCase();
        if (msg.includes('expirad')) {
            console.warn("Licencia expirada: acceso permitido en modo inactivo");
            return {
                success: true,
                message: 'Licencia expirada',
                data: {
                    usuario: username,
                    plan: 'Expirado',
                    fecha_expiracion: null,
                    estado: 'inactivo'
                }
            };
        }

        if (response.error) {
            console.error("Error autenticando:", response.error);
            return { success: false, message: response.error.message, data: null };
        }

        const data = response.data;
        if (!data || !data.exito) {
            return { success: false, message: data?.mensaje || 'Error de autenticación', data: null };
        }

        return { success: true, message: data.mensaje, data: data };
    } catch (error) {
        console.error("Error en autenticación:", error);
        return { success: false, message: 'Error de conexión', data: null };
    }
}

// Obtener ID del dispositivo
function getDeviceId() {
    let deviceId = localStorage.getItem('device_id');
    if (!deviceId) {
        deviceId = 'web_' + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
        localStorage.setItem('device_id', deviceId);
    }
    return deviceId;
}

// Login
loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value.trim();

    if (!username || !password) {
        showMessage("login-message", "Por favor ingresa usuario y contraseña", "error");
        return;
    }

    showMessage("login-message", "Autenticando...", "");

    const result = await authenticateUser(username, password);

    if (result.success && result.data) {
        currentUser = username;
        userData = result.data;

        // Guardar sesión y fijar marca de tiempo de inicio de actividad
        localStorage.setItem('usuario', username);
        localStorage.setItem('password', password);
        registrarActividadVibracion();

        // Mostrar pantalla principal
        userDisplay.textContent = username;
        loginScreen.classList.add('hidden');
        mainScreen.classList.remove('hidden');
        showMessage("login-message", "", "");

        // Actualizar información del usuario
        updateUserInfo();

        // Iniciar escucha de vibraciones
        startListeningForVibrations();
    } else {
        showMessage("login-message", result.message, "error");
    }
});

// Logout manual
logoutBtn.addEventListener('click', () => {
    limpiarSesion();
    mainScreen.classList.add('hidden');
    loginScreen.classList.remove('hidden');
    loginForm.reset();
});

// Actualizar información del usuario
function updateUserInfo() {
    if (!userData) return;

    const elUser = document.getElementById('info-username');
    const elPlan = document.getElementById('info-plan');
    const elExp = document.getElementById('info-expiration');
    const elStatus = document.getElementById('info-status');

    if (elUser) elUser.textContent = userData.usuario || '—';
    if (elPlan) elPlan.textContent = userData.plan || '—';
    if (elExp) {
        elExp.textContent = userData.fecha_expiracion
            ? new Date(userData.fecha_expiracion).toLocaleDateString('es-PE')
            : '—';
    }
    if (elStatus) {
        if (userData.estado === 'activo') {
            elStatus.textContent = 'Activo';
            elStatus.style.color = '#27ae60';
        } else {
            elStatus.textContent = 'Expirado / Inactivo';
            elStatus.style.color = '#c0392b';
        }
    }

    // Iniciar temporizador regresivo de licencia
    iniciarTemporizadorLicencia();
}

// ============================================================
// TEMPORIZADOR REGRESIVO DE LICENCIA EN TIEMPO REAL
// ============================================================
let licenseTimerInterval = null;

function iniciarTemporizadorLicencia() {
    if (licenseTimerInterval) {
        clearInterval(licenseTimerInterval);
        licenseTimerInterval = null;
    }
    actualizarTemporizador();
    licenseTimerInterval = setInterval(actualizarTemporizador, 1000);
}

function actualizarTemporizador() {
    const countdownEl = document.getElementById('license-countdown');
    const countdownSub = document.getElementById('license-countdown-sub');
    const infoTimeLeft = document.getElementById('info-time-left');

    if (!userData || !userData.fecha_expiracion) {
        if (countdownEl) {
            countdownEl.textContent = "Sin límite";
            countdownEl.className = "license-countdown";
        }
        if (countdownSub) countdownSub.textContent = "Licencia permanente o sin fecha definida";
        if (infoTimeLeft) infoTimeLeft.textContent = "Permanente";
        return;
    }

    const ahora = Date.now();
    const expiracion = new Date(userData.fecha_expiracion).getTime();
    const diff = expiracion - ahora;

    if (diff <= 0) {
        if (countdownEl) {
            countdownEl.textContent = "LICENCIA EXPIRADA";
            countdownEl.className = "license-countdown expired";
        }
        if (countdownSub) countdownSub.textContent = "Tu tiempo de licencia ha finalizado";
        if (infoTimeLeft) {
            infoTimeLeft.textContent = "00:00:00 (Expirada)";
            infoTimeLeft.style.color = "#ef4444";
        }
        return;
    }

    const dias = Math.floor(diff / (1000 * 60 * 60 * 24));
    const horas = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutos = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const segundos = Math.floor((diff % (1000 * 60)) / 1000);

    const pad = (n) => String(n).padStart(2, '0');

    let textoCorto = "";
    let textoCompleto = "";

    if (dias > 0) {
        textoCorto = `${dias}d ${pad(horas)}h ${pad(minutos)}m ${pad(segundos)}s`;
        textoCompleto = `${dias} día${dias > 1 ? 's' : ''}, ${pad(horas)}h ${pad(minutos)}m ${pad(segundos)}s restantes`;
    } else {
        textoCorto = `${pad(horas)}:${pad(minutos)}:${pad(segundos)}`;
        textoCompleto = `${pad(horas)} horas, ${pad(minutos)} minutos y ${pad(segundos)} segundos restantes`;
    }

    if (countdownEl) {
        countdownEl.textContent = textoCorto;
        if (diff < 15 * 60 * 1000) {
            // Alerta: menos de 15 minutos restantes
            countdownEl.className = "license-countdown warning";
        } else {
            countdownEl.className = "license-countdown";
        }
    }

    if (countdownSub) {
        countdownSub.textContent = textoCompleto;
    }

    if (infoTimeLeft) {
        infoTimeLeft.textContent = textoCorto;
        infoTimeLeft.style.color = diff < 15 * 60 * 1000 ? "#f59e0b" : "#38bdf8";
    }
}

// Iniciar escucha de vibraciones
function startListeningForVibrations() {
    updateConnectionStatus('connecting', 'Conectando...', 'Estableciendo conexión en tiempo real');

    try {
        realtimeChannel = supabaseClient
            .channel('vibraciones_channel')
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'vibraciones'
                },
                (payload) => {
                    handleVibration(payload.new);
                }
            )
            .subscribe((status, error) => {
                console.log('Status del canal:', status);

                if (status === 'SUBSCRIBED') {
                    if (userData && userData.estado === 'inactivo') {
                        updateConnectionStatus('error', 'Licencia Expirada', 'Tu cuenta está inactiva. No recibirá vibraciones.');
                    } else {
                        updateConnectionStatus('connected', 'Conectado', 'Escuchando vibraciones en tiempo real');
                    }
                } else if (error) {
                    console.error('Error en el canal:', error);
                    updateConnectionStatus('error', 'Error de conexión', error.message);
                }
            });
    } catch (error) {
        console.error('Error iniciando escucha:', error);
        updateConnectionStatus('error', 'Error', 'No se pudo iniciar la escucha de vibraciones');
    }
}

// Manejar vibración recibida
function handleVibration(data) {
    console.log('Vibración recibida:', data);

    const letra = String(data.letra || 'A').toUpperCase();
    const usuario = data.usuario;
    const timestamp = data.timestamp || new Date().toISOString();

    // Si viene dirigido a un usuario específico, verificar que sea el logueado
    if (usuario && currentUser && usuario !== currentUser) {
        console.log('Vibración de otro usuario, ignorando');
        return;
    }

    // SI LA LICENCIA EXPIRÓ: ENTRA A LA CUENTA PERO NO LE SIRVE NADA (NO VIBRA)
    if (userData && (userData.estado === 'inactivo' || userData.estado === 'expirado')) {
        console.warn("Licencia vencida: vibración recibida pero bloqueada (cuenta inactiva)");
        return;
    }

    // CADA VEZ QUE RECIBE UNA VIBRACIÓN, SE REINICIA EL TEMPORIZADOR DE 2 HORAS
    registrarActividadVibracion();

    // Actualizar display
    if (vibrationLetter) vibrationLetter.textContent = letra;
    if (vibrationTime) vibrationTime.textContent = `Recibido: ${new Date(timestamp).toLocaleTimeString('es-PE')}`;

    // Actualizar letra en pantalla de bloqueo
    if (lockStealthLetter) lockStealthLetter.textContent = letra;

    // Mostrar modal de vibración
    showVibrationModal(letra);

    // Ejecutar vibración fuerte de 0.8s
    const vibrationCount = getVibrationCount(letra);
    triggerVibration(vibrationCount);
}

// Mostrar modal de vibración
function showVibrationModal(letra) {
    if (!vibrationModal) return;
    if (vibrationModalLetter) vibrationModalLetter.textContent = letra;
    const count = getVibrationCount(letra);
    if (vibrationModalCount) vibrationModalCount.textContent = `${count} vibración${count > 1 ? 'es' : ''} (0.8s)`;

    vibrationModal.classList.remove('hidden');

    setTimeout(() => {
        vibrationModal.classList.add('hidden');
    }, 3500);
}

// Prueba manual desde botones
function probarVibracion(letra) {
    if (userData && (userData.estado === 'inactivo' || userData.estado === 'expirado')) {
        alert("Tu licencia ha expirado. No puedes recibir ni emitir vibraciones.");
        return;
    }
    registrarActividadVibracion();
    const count = getVibrationCount(letra);
    if (vibrationLetter) vibrationLetter.textContent = letra;
    if (vibrationTime) vibrationTime.textContent = `Prueba manual: ${new Date().toLocaleTimeString('es-PE')}`;
    if (lockStealthLetter) lockStealthLetter.textContent = letra;
    showVibrationModal(letra);
    triggerVibration(count);
}
window.probarVibracion = probarVibracion;

// ============================================================
// BLOQUEO DE PANTALLA ESTILO NETFLIX (Antitoques)
// ============================================================
let isScreenLocked = false;
let wakeLockSentinel = null;
let lockStep = 0; // 0: reposo bloqueado, 1: candado grande, 2: esperando confirmación
let lockResetTimer = null;

// Mantener pantalla encendida (WakeLock)
async function requestWakeLock() {
    try {
        if ('wakeLock' in navigator) {
            wakeLockSentinel = await navigator.wakeLock.request('screen');
            console.log('WakeLock pantalla activa');
        }
    } catch (e) {
        console.warn('WakeLock error:', e);
    }
}

function releaseWakeLock() {
    if (wakeLockSentinel !== null) {
        try {
            wakeLockSentinel.release();
        } catch (e) {}
        wakeLockSentinel = null;
    }
}

document.addEventListener('visibilitychange', () => {
    if (isScreenLocked && document.visibilityState === 'visible') {
        requestWakeLock();
    }
});

// Activar Bloqueo Estilo Netflix
async function activarBloqueoNetflix() {
    isScreenLocked = true;
    lockStep = 0;
    if (lockOverlay) lockOverlay.classList.remove('hidden');

    // Desbloquear permisos de audio y vibración con este clic
    if (navigator.vibrate) {
        try { navigator.vibrate(80); } catch(e){}
    }

    // Solicitar WakeLock para que no se apague la pantalla
    requestWakeLock();

    // Entrar en pantalla completa para ocultar barra de Chrome/navegador
    try {
        if (document.documentElement.requestFullscreen) {
            await document.documentElement.requestFullscreen();
        }
    } catch (e) {}

    resetearEstadoCandado();
}

// Desactivar Bloqueo
function desactivarBloqueoNetflix() {
    isScreenLocked = false;
    lockStep = 0;
    if (lockOverlay) lockOverlay.classList.add('hidden');
    clearTimeout(lockResetTimer);

    try {
        if (document.fullscreenElement && document.exitFullscreen) {
            document.exitFullscreen();
        }
    } catch (e) {}

    console.log("Pantalla desbloqueada exitosamente");
}

function resetearEstadoCandado() {
    lockStep = 0;
    if (lockBubble) lockBubble.classList.remove('pulse-large');
    if (lockConfirmBtn) lockConfirmBtn.classList.add('hidden');
    if (lockStatusText) lockStatusText.textContent = "Pantalla bloqueada";
    if (lockFooterHint) lockFooterHint.textContent = "Toca la pantalla para activar el candado";
    if (lockStealthLetter) lockStealthLetter.classList.remove('peek');
}

// Toque en cualquier parte del overlay
if (lockOverlay) {
    lockOverlay.addEventListener('click', (e) => {
        if (!isScreenLocked) return;

        // Si tocó el botón de confirmación, lo dejamos a su propio evento
        if (e.target === lockConfirmBtn || (lockConfirmBtn && lockConfirmBtn.contains(e.target))) {
            return;
        }

        // Si tocó el candado interactivo
        if (e.target === lockBubble || (lockBubble && lockBubble.contains(e.target))) {
            manejarToqueCandado();
            return;
        }

        // Si tocó el resto de la pantalla negra
        manejarToquePantalla();
    });

    // Prevenir gestos de salir de Chrome, pull-to-refresh y zoom
    lockOverlay.addEventListener('touchmove', (e) => e.preventDefault(), { passive: false });
    lockOverlay.addEventListener('contextmenu', (e) => e.preventDefault());
}

// Paso 1: Toca la pantalla -> el candado se hace grande
function manejarToquePantalla() {
    clearTimeout(lockResetTimer);

    if (lockStep === 0) {
        lockStep = 1;
        if (lockBubble) lockBubble.classList.add('pulse-large');
        if (lockStatusText) lockStatusText.textContent = "Toca el candado para desbloquear";
        if (lockFooterHint) lockFooterHint.textContent = "Toque detectado";
        if (lockStealthLetter) lockStealthLetter.classList.add('peek');

        if (navigator.vibrate) {
            try { navigator.vibrate(60); } catch(e){}
        }

        lockResetTimer = setTimeout(resetearEstadoCandado, 3500);
    } else {
        resetearEstadoCandado();
    }
}

// Paso 2: Toca el candado agrandado -> aparece el botón de confirmación
function manejarToqueCandado() {
    clearTimeout(lockResetTimer);

    if (lockStep === 0 || lockStep === 1) {
        lockStep = 2;
        if (lockBubble) lockBubble.classList.add('pulse-large');
        if (lockConfirmBtn) lockConfirmBtn.classList.remove('hidden');
        if (lockStatusText) lockStatusText.textContent = "Confirma para desbloquear";
        if (lockFooterHint) lockFooterHint.textContent = "Pulsa el botón rojo para salir";

        if (navigator.vibrate) {
            try { navigator.vibrate(80); } catch(e){}
        }

        lockResetTimer = setTimeout(resetearEstadoCandado, 4500);
    }
}

// Paso 3: Confirmar desbloqueo definitivo
if (lockConfirmBtn) {
    lockConfirmBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        desactivarBloqueoNetflix();
    });
}

// Asignar botón de bloqueo
if (btnLockScreen) {
    btnLockScreen.addEventListener('click', activarBloqueoNetflix);
}

// ============================================================
// VERIFICAR SESIÓN AL CARGAR (VERIFICA SI ESTUVO CERRADA MÁS DE 2 HORAS)
// ============================================================
async function checkExistingSession() {
    const savedUser = localStorage.getItem('usuario');
    const savedPassword = localStorage.getItem('password');
    const lastVib = parseInt(localStorage.getItem('ultima_vibracion_timestamp') || '0', 10);

    if (savedUser && savedPassword) {
        // SI ESTUVO CERRADA Y PASARON MÁS DE 2 HORAS SIN VIBRACIÓN:
        if (lastVib > 0 && (Date.now() - lastVib) >= TIEMPO_MAX_INACTIVIDAD_MS) {
            console.log("⏰ Pasaron más de 2 horas sin vibración mientras la página estuvo cerrada.");
            limpiarSesion();
            showMessage(
                "login-message",
                "Tu sesión se cerró automáticamente (más de 2 horas sin vibraciones). Vuelve a iniciar sesión.",
                "info"
            );
            return;
        }

        const result = await authenticateUser(savedUser, savedPassword);

        if (result.success && result.data) {
            currentUser = savedUser;
            userData = result.data;

            userDisplay.textContent = savedUser;
            loginScreen.classList.add('hidden');
            mainScreen.classList.remove('hidden');

            updateUserInfo();
            startListeningForVibrations();
        } else {
            limpiarSesion();
        }
    }
}

// Iniciar verificación
checkExistingSession();
