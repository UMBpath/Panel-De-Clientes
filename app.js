// Configuración de Supabase
const SUPABASE_URL = "https://lcrctcaogoyimtjmdqzu.supabase.co";
const SUPABASE_KEY = "sb_publishable_gQeoJvYho2FGdOX-JqXJlQ_6qJDzxV-";

// Tiempo máximo de inactividad sin recibir vibraciones: 2 horas (en milisegundos)
const TIEMPO_MAX_INACTIVIDAD_MS = 2 * 60 * 60 * 1000; // 2 horas (7,200,000 ms)

// ============================================================
// REGISTRAR SERVICE WORKER (PWA - Requisito para iPhone)
// ============================================================
if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js')
        .then(() => console.log('Service Worker Registrado con éxito'))
        .catch((err) => console.log('Error al registrar Service Worker', err));
}

// ============================================================
// DETECCIÓN DE iOS y BANNER DE INSTALACIÓN PWA
// ============================================================
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

// Mostrar banner de instalación para iPhone si no está instalado como PWA
function mostrarBannerIOS() {
    if (!isIOS) return;

    // Verificar si ya está en modo standalone (instalado como PWA)
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches
        || window.navigator.standalone === true;

    if (!isStandalone) {
        const banner = document.getElementById('ios-install-banner');
        if (banner) {
            banner.classList.remove('hidden');

            // Cerrar banner al hacer clic en el botón
            const closeBtn = document.getElementById('ios-install-close');
            if (closeBtn) {
                closeBtn.addEventListener('click', () => {
                    banner.classList.add('hidden');
                    localStorage.setItem('ios-banner-dismissed', 'true');
                });
            }
        }
    }
}

// Verificar si el usuario ya cerró el banner anteriormente
if (localStorage.getItem('ios-banner-dismissed') !== 'true') {
    // Mostrar banner después de 2 segundos
    setTimeout(mostrarBannerIOS, 2000);
}

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
        console.log("â° Pasaron 2 horas sin recibir vibraciones. Cerrando sesión automáticamente...");
        cerrarSesionPorInactividad();
    }
}

// Revisar cada 30 segundos mientras la página estÃ© abierta
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
// DETECCIÓN DE iOS (Safari no soporta navigator.vibrate)
// ============================================================
const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;

// AudioContext compartido (se crea la primera vez que el usuario interactúa)
let _audioCtx = null;
function getAudioCtx() {
    if (!_audioCtx) {
        try {
            _audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        } catch (e) {
            console.warn('AudioContext no disponible:', e);
        }
    }
    return _audioCtx;
}

// Desbloquear AudioContext en el primer toque (iOS requiere esto)
document.addEventListener('touchstart', () => { getAudioCtx(); }, { once: true });

// Reproduce un pitido corto de 80 ms
function playBeep(frequency = 880, duration = 0.08) {
    const ctx = getAudioCtx();
    if (!ctx) return Promise.resolve();
    return new Promise(resolve => {
        try {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.type = 'sine';
            osc.frequency.value = frequency;
            gain.gain.setValueAtTime(0.9, ctx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
            osc.start(ctx.currentTime);
            osc.stop(ctx.currentTime + duration + 0.01);
            osc.onended = resolve;
        } catch (e) {
            resolve();
        }
    });
}

// ============================================================
// MOTOR DE VIBRACIÓN (Android vibra, iPhone vibra si es PWA)
// ============================================================
let isVibrating = false;

async function triggerVibration(count) {
    if (isVibrating) {
        console.log("Ya hay una vibración en curso. Esperando...");
        return;
    }
    isVibrating = true;

    try {
        // Verificar si estamos en modo PWA (instalado como app)
        const isStandalone = window.matchMedia('(display-mode: standalone)').matches
            || window.navigator.standalone === true;

        if (!isIOS && navigator.vibrate) {
            // --- Android: vibración física normal ---
            for (let i = 0; i < count; i++) {
                try { navigator.vibrate(800); } catch (e) {}
                if (i < count - 1) {
                    await new Promise(r => setTimeout(r, 1600));
                } else {
                    await new Promise(r => setTimeout(r, 800));
                }
            }
        } else if (isIOS && isStandalone && navigator.vibrate) {
            // --- iPhone PWA: vibración física (modo standalone) ---
            // Usar pulsos más cortos para mejor respuesta en iPhone
            for (let i = 0; i < count; i++) {
                try { navigator.vibrate([200, 50, 200]); } catch (e) {}
                if (i < count - 1) {
                    await new Promise(r => setTimeout(r, 800));
                } else {
                    await new Promise(r => setTimeout(r, 400));
                }
            }
        } else if (isIOS) {
            // --- iPhone NO PWA: audio por altavoz (fallback) ---
            for (let i = 0; i < count; i++) {
                await playBeep(880, 0.12);
                if (i < count - 1) {
                    await new Promise(r => setTimeout(r, 350));
                }
            }
        } else {
            // --- Otros dispositivos con vibración ---
            for (let i = 0; i < count; i++) {
                try { navigator.vibrate(800); } catch (e) {}
                if (i < count - 1) {
                    await new Promise(r => setTimeout(r, 1600));
                } else {
                    await new Promise(r => setTimeout(r, 800));
                }
            }
        }
    } finally {
        isVibrating = false;
    }
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

        // Actualizar Información del usuario
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

// Actualizar Información del usuario y estado de vibración
function updateUserInfo() {
    if (!userData) return;

    const elUser = document.getElementById('info-username');
    const elPlan = document.getElementById('info-plan');
    const elExp = document.getElementById('info-expiration');

    if (elUser) elUser.textContent = userData.usuario || '—';
    if (elPlan) elPlan.textContent = userData.plan || '—';
    if (elExp) {
        elExp.textContent = userData.fecha_expiracion
            ? new Date(userData.fecha_expiracion).toLocaleDateString('es-PE')
            : '—';
    }

    refrescarEstadoVisual();
    iniciarTemporizadorLicencia();
}

function refrescarEstadoVisual() {
    if (!userData) return;

    const elStatus = document.getElementById('info-status');

    if (userData.licencia_vigente === false) {
        if (elStatus) {
            elStatus.textContent = 'Sin Licencia / Expirado';
            elStatus.style.color = '#c0392b';
        }
        updateConnectionStatus('error', 'Licencia Expirada', 'Tu tiempo de licencia ha terminado. La app no vibrará.');
        return;
    }

    if (userData.estado !== 'activo') {
        if (elStatus) {
            elStatus.textContent = 'Cuenta Inactiva';
            elStatus.style.color = '#c0392b';
        }
        updateConnectionStatus('error', 'Cuenta Inactiva', 'Tu cuenta está inactiva por el administrador.');
        return;
    }

    if (userData.en_horario === false) {
        if (elStatus) {
            elStatus.textContent = 'Fuera de Horario';
            elStatus.style.color = '#f39c12';
        }
        updateConnectionStatus('connecting', 'Fuera de Horario', 'Las vibraciones funcionarán 5 min antes y hasta 15 min después de tu clase.');
        return;
    }

    if (elStatus) {
        elStatus.textContent = 'Activo (Listo para vibrar)';
        elStatus.style.color = '#27ae60';
    }
    updateConnectionStatus('connected', 'Conectado', 'Escuchando vibraciones en tiempo real');
}

// ============================================================
// TEMPORIZADOR REGRESIVO DE LICENCIA EN TIEMPO REAL (TEXTO NATURAL, SIN COLORES)
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
    const infoTimeLeft = document.getElementById('info-time-left');

    if (!userData) return;

    // Verificar si es licencia infinita
    const esInfinita = userData.plan && userData.plan.toLowerCase().includes('infinit');

    if (esInfinita) {
        if (countdownEl) countdownEl.textContent = "Sin límite";
        if (infoTimeLeft) infoTimeLeft.textContent = "Sin límite";
        return;
    }

    if (!userData.fecha_expiracion) {
        if (countdownEl) countdownEl.textContent = "Sin límite";
        if (infoTimeLeft) infoTimeLeft.textContent = "Sin límite";
        return;
    }

    const ahora = Date.now();
    // REGLA: La licencia se cierra 20 minutos DESPUÉS de la expiración (20 min de margen)
    const expiracionNominal = new Date(userData.fecha_expiracion).getTime();
    const expiracionCierre = expiracionNominal + (20 * 60 * 1000);
    const diff = expiracionCierre - ahora;

    if (diff <= 0) {
        if (countdownEl) countdownEl.textContent = "0 segundos (Licencia cerrada)";
        if (infoTimeLeft) infoTimeLeft.textContent = "0 segundos (Cerrada)";
        if (userData.estado !== 'inactivo') {
            userData.estado = 'inactivo';
            updateConnectionStatus('error', 'Licencia Cerrada', 'Tu licencia ha finalizado tras cumplirse los 20 minutos de cierre.');
        }
        return;
    }

    const dias = Math.floor(diff / (1000 * 60 * 60 * 24));
    const horas = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutos = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const segundos = Math.floor((diff % (1000 * 60)) / 1000);

    const partes = [];
    if (dias > 0) {
        partes.push(`${dias} ${dias === 1 ? 'día' : 'días'}`);
    }
    if (horas > 0 || dias > 0) {
        partes.push(`${horas} ${horas === 1 ? 'hora' : 'horas'}`);
    }
    if (minutos > 0 || horas > 0 || dias > 0) {
        partes.push(`${minutos} ${minutos === 1 ? 'minuto' : 'minutos'}`);
    }
    partes.push(`${segundos} ${segundos === 1 ? 'segundo' : 'segundos'}`);

    let texto = partes.join(', ');
    if (ahora > expiracionNominal) {
        texto += " (Tiempo de cierre adicional)";
    }

    if (countdownEl) {
        countdownEl.textContent = texto;
    }
    if (infoTimeLeft) {
        infoTimeLeft.textContent = texto;
    }
}

// Iniciar escucha de vibraciones
function startListeningForVibrations() {
    updateConnectionStatus('connecting', 'Conectando...', 'Estableciendo conexión en tiempo real');

    try {
        const canalNombre = currentUser ? `vibraciones_${currentUser}` : 'vibraciones_channel';
        const canalConfig = {
            event: 'INSERT',
            schema: 'public',
            table: 'vibraciones'
        };

        if (currentUser) {
            canalConfig.filter = `usuario=eq.${currentUser}`;
        }

        realtimeChannel = supabaseClient
            .channel(canalNombre)
            .on('postgres_changes', canalConfig, (payload) => {
                handleVibration(payload.new);
            })
            .subscribe((status, error) => {
                console.log('Status del canal:', status);

                if (status === 'SUBSCRIBED') {
                    refrescarEstadoVisual();
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

    // SI NO TIENE LICENCIA O ESTÁ FUERA DE HORARIO:
    // Siempre puede entrar a su cuenta, pero NO VIBRA fuera del horario ni sin licencia
    if (userData) {
        if (userData.puede_vibrar === false || userData.licencia_vigente === false || userData.estado !== 'activo' || userData.en_horario === false) {
            console.warn("Vibración ignorada: usuario sin licencia vigente o fuera de horario permitido");
            return;
        }
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
    if (userData && (userData.puede_vibrar === false || userData.licencia_vigente === false || userData.en_horario === false || userData.estado !== 'activo')) {
        alert("En este momento tu cuenta no tiene vibraciones activas (estás fuera de tu horario de clase o sin tiempo de licencia). Las vibraciones funcionarán automáticamente 5 minutos antes y hasta 15 minutos después de tu clase.");
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
    if (isIOS) {
        getAudioCtx(); // desbloquear AudioContext en iOS
    } else if (navigator.vibrate) {
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
// VERIFICAR SESIÃ“N AL CARGAR (VERIFICA SI ESTUVO CERRADA MÁS DE 2 HORAS)
// ============================================================
async function checkExistingSession() {
    const savedUser = localStorage.getItem('usuario');
    const savedPassword = localStorage.getItem('password');
    const lastVib = parseInt(localStorage.getItem('ultima_vibracion_timestamp') || '0', 10);

    if (savedUser && savedPassword) {
        // SI ESTUVO CERRADA Y PASARON MÁS DE 2 HORAS SIN VIBRACIÓN:
        if (lastVib > 0 && (Date.now() - lastVib) >= TIEMPO_MAX_INACTIVIDAD_MS) {
            console.log("â° Pasaron más de 2 horas sin vibración mientras la página estuvo cerrada.");
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

// Re-evaluar estado periódicamente (cada 30s) para que si entra en horario (ej: 5 min antes), se active automáticamente
setInterval(async () => {
    const savedUser = localStorage.getItem('usuario');
    const savedPassword = localStorage.getItem('password');
    if (savedUser && savedPassword && currentUser) {
        const result = await authenticateUser(savedUser, savedPassword);
        if (result.success && result.data) {
            userData = result.data;
            refrescarEstadoVisual();
        }
    }
}, 30000);
