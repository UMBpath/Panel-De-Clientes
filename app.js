// Configuración de Supabase - CAMBIAR POR TU NUEVO PROYECTO
const SUPABASE_URL = "https://lcrctcaogoyimtjmdqzu.supabase.co";
const SUPABASE_KEY = "sb_publishable_gQeoJvYho2FGdOX-JqXJlQ_6qJDzxV-";

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
const statusText = document.getElementById('status-text');
const statusDetail = document.getElementById('status-detail');
const vibrationLetter = document.getElementById('vibration-letter');
const vibrationTime = document.getElementById('vibration-time');
const vibrationModal = document.getElementById('vibration-modal');
const vibrationModalLetter = document.getElementById('vibration-modal-letter');
const vibrationModalCount = document.getElementById('vibration-modal-count');

// Información del usuario
let currentUser = null;
let userData = null;
let realtimeChannel = null;

// Mostrar mensajes
function showMessage(elementId, message, type = '') {
    const element = document.getElementById(elementId);
    if (element) {
        element.textContent = message;
        element.className = type ? `message ${type}` : 'message';
    }
}

// Actualizar estado de conexión
function updateConnectionStatus(status, text, detail) {
    statusIcon.className = `status-icon ${status}`;
    statusText.textContent = text;
    statusDetail.textContent = detail;
}

// Autenticar usuario
async function authenticateUser(username, password) {
    try {
        const response = await supabaseClient.rpc('autenticar_usuario_app', {
            p_usuario: username,
            p_password: password,
            p_device_id: getDeviceId(),
            p_origen: 'web'
        });

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

        // Guardar sesión
        localStorage.setItem('usuario', username);
        localStorage.setItem('password', password);

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

// Logout
logoutBtn.addEventListener('click', () => {
    // Detener escucha
    if (realtimeChannel) {
        realtimeChannel.unsubscribe();
        realtimeChannel = null;
    }

    // Limpiar sesión
    localStorage.removeItem('usuario');
    localStorage.removeItem('password');

    currentUser = null;
    userData = null;

    // Volver a login
    mainScreen.classList.add('hidden');
    loginScreen.classList.remove('hidden');
    loginForm.reset();
});

// Actualizar información del usuario
function updateUserInfo() {
    if (!userData) return;

    document.getElementById('info-username').textContent = userData.usuario || '—';
    document.getElementById('info-plan').textContent = userData.plan || '—';
    document.getElementById('info-expiration').textContent = userData.fecha_expiracion
        ? new Date(userData.fecha_expiracion).toLocaleDateString('es-PE')
        : '—';

    const statusEl = document.getElementById('info-status');
    if (userData.estado === 'activo') {
        statusEl.textContent = 'Activo';
        statusEl.style.color = '#27ae60';
    } else {
        statusEl.textContent = 'Inactivo';
        statusEl.style.color = '#c0392b';
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
                    updateConnectionStatus('connected', 'Conectado', 'Escuchando vibraciones en tiempo real');
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

    const letra = data.letra;
    const usuario = data.usuario;
    const timestamp = data.timestamp;

    // Verificar que sea para este usuario
    if (usuario !== currentUser) {
        console.log('Vibración de otro usuario, ignorando');
        return;
    }

    // Actualizar display
    vibrationLetter.textContent = letra;
    vibrationTime.textContent = `Recibido: ${new Date(timestamp).toLocaleTimeString('es-PE')}`;

    // Mostrar modal de vibración
    showVibrationModal(letra);

    // Vibrar dispositivo (si es compatible)
    if (navigator.vibrate) {
        const vibrationCount = getVibrationCount(letra);
        const pattern = createVibrationPattern(vibrationCount);
        navigator.vibrate(pattern);
    }
}

// Obtener número de vibraciones por letra
function getVibrationCount(letra) {
    const map = { 'A': 1, 'B': 2, 'C': 3, 'D': 4 };
    return map[letra.toUpperCase()] || 1;
}

// Crear patrón de vibración
function createVibrationPattern(count) {
    const pattern = [];
    for (let i = 0; i < count; i++) {
        pattern.push(200); // Vibrar 200ms
        if (i < count - 1) {
            pattern.push(100); // Pausa 100ms
        }
    }
    return pattern;
}

// Mostrar modal de vibración
function showVibrationModal(letra) {
    vibrationModalLetter.textContent = letra;
    const count = getVibrationCount(letra);
    vibrationModalCount.textContent = `${count} vibración${count > 1 ? 'es' : ''}`;

    vibrationModal.classList.remove('hidden');

    // Ocultar después de 3 segundos
    setTimeout(() => {
        vibrationModal.classList.add('hidden');
    }, 3000);
}

// Verificar sesión al cargar
async function checkExistingSession() {
    const savedUser = localStorage.getItem('usuario');
    const savedPassword = localStorage.getItem('password');

    if (savedUser && savedPassword) {
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
            // Sesión inválida, limpiar
            localStorage.removeItem('usuario');
            localStorage.removeItem('password');
        }
    }
}

// Iniciar verificación de sesión al cargar
checkExistingSession();
