"""
Bot de Telegram para Vibraciones en iPhone (Sistema Salva Web)
Valida Usuario y Contraseña directamente desde Telegram contra Supabase.
"""

import sys
import os
import time
import json
import threading
import urllib.request
import urllib.parse
import urllib.error
from http.server import HTTPServer, BaseHTTPRequestHandler

# Servidor web mínimo para mantener vivo el servicio en la nube gratis (Render / Railway)
class HealthCheckHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header("Content-Type", "text/plain")
        self.end_headers()
        self.wfile.write(b"Bot Telegram Activo 24/7")
    
    def log_message(self, format, *args):
        pass

def iniciar_servidor_web():
    try:
        puerto = int(os.environ.get("PORT", 8080))
        servidor = HTTPServer(("0.0.0.0", puerto), HealthCheckHandler)
        log(f"Servidor web de salud activo en puerto {puerto}")
        servidor.serve_forever()
    except Exception as e:
        log(f"Aviso servidor web: {e}")

# Importar configuración
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from config import SUPABASE_URL, SUPABASE_KEY, TELEGRAM_BOT_TOKEN

# Memoria de sesiones temporales para el flujo de login
# Formato: { chat_id: { "paso": "esperando_password", "usuario": "carlos" } }
SESIONES_LOGIN = {}

def log(msg):
    timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{timestamp}] [TelegramBot] {msg}")

def telegram_api(metodo, params=None):
    """Llama a la API oficial de Telegram mediante urllib estándar"""
    if not TELEGRAM_BOT_TOKEN or "AQUI" in TELEGRAM_BOT_TOKEN:
        log("ERROR: TELEGRAM_BOT_TOKEN no configurado en config.py")
        return None
    url = f"https://api.telegram.org/bot{TELEGRAM_BOT_TOKEN}/{metodo}"
    try:
        data = None
        headers = {}
        if params:
            data = json.dumps(params).encode("utf-8")
            headers["Content-Type"] = "application/json"
        
        req = urllib.request.Request(url, data=data, headers=headers)
        with urllib.request.urlopen(req, timeout=30) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except Exception as e:
        log(f"Error llamando a Telegram API ({metodo}): {e}")
        return None

def supabase_rpc(funcion, params):
    """Ejecuta una función RPC en Supabase vía REST API estándar"""
    url = f"{SUPABASE_URL}/rest/v1/rpc/{funcion}"
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json"
    }
    try:
        data = json.dumps(params).encode("utf-8")
        req = urllib.request.Request(url, data=data, headers=headers)
        with urllib.request.urlopen(req, timeout=10) as resp:
            return json.loads(resp.read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        cuerpo = e.read().decode("utf-8", errors="ignore")
        log(f"Error HTTP Supabase ({funcion}): {e.code} - {cuerpo}")
        return {"exito": False, "mensaje": f"Error servidor ({e.code})"}
    except Exception as e:
        log(f"Error de conexión Supabase ({funcion}): {e}")
        return {"exito": False, "mensaje": str(e)}

def enviar_mensaje(chat_id, texto, reply_markup=None):
    params = {
        "chat_id": chat_id,
        "text": texto,
        "parse_mode": "Markdown"
    }
    if reply_markup:
        params["reply_markup"] = reply_markup
    return telegram_api("sendMessage", params)

def enviar_vibracion_iphone(chat_id, cantidad):
    """Envía N notificaciones consecutivas para activar el motor háptico de iOS"""
    for i in range(1, cantidad + 1):
        params = {
            "chat_id": chat_id,
            "text": f"📳 Vibración ({i}/{cantidad})",
            "disable_notification": False
        }
        telegram_api("sendMessage", params)
        if i < cantidad:
            time.sleep(8.0)

def ejecutar_autenticacion_y_vinculo(chat_id, telegram_user, usuario, password):
    """Valida credenciales contra Supabase y guarda el chat_id en usuarios_app"""
    log(f"Autenticando usuario '{usuario}' para chat_id {chat_id}")
    
    # 1. Validar usuario y contraseña con autenticar_usuario_app
    auth_res = supabase_rpc("autenticar_usuario_app", {
        "p_usuario": usuario,
        "p_password": password,
        "p_device_id": str(chat_id),
        "p_origen": "telegram_iphone"
    })
    
    if not auth_res.get("exito"):
        mensaje_error = auth_res.get("mensaje", "Usuario o contraseña incorrectos.")
        enviar_mensaje(
            chat_id,
            f"❌ *Error de Autenticación*\n\n{mensaje_error}\n\n"
            f"Escribe de nuevo tu *nombre de usuario* para reintentar:"
        )
        SESIONES_LOGIN[chat_id] = {"paso": "esperando_usuario"}
        return

    # 2. Si las credenciales son válidas, vincular telegram_chat_id
    vinc_res = supabase_rpc("vincular_telegram", {
        "p_usuario": usuario,
        "p_chat_id": chat_id,
        "p_telegram_user": telegram_user
    })

    # Limpiar estado de sesión
    SESIONES_LOGIN.pop(chat_id, None)

    plan = auth_res.get("plan", "Activo")
    nombre = auth_res.get("usuario", usuario)

    teclado = {
        "inline_keyboard": [[
            {"text": "📳 Probar Vibración Ahora", "callback_data": "probar"}
        ]]
    }

    enviar_mensaje(
        chat_id,
        f"✅ *¡Inicio de Sesión Exitoso!*\n\n"
        f"👤 *Usuario:* `{nombre}`\n"
        f"📦 *Licencia:* {plan}\n"
        f"📱 *Estado:* iPhone vinculado y listo.\n\n"
        f"⚡ *¿Cómo usarlo en el examen?*\n"
        f"1. Abre **SmowlCM.exe** en tu PC e inicia sesión con este mismo usuario y contraseña.\n"
        f"2. Durante el examen, cada vez que presiones la tecla punto (** . **), tu iPhone vibrará la cantidad de veces de la opción correcta:\n"
        f"   • **A** = 1 vibración\n"
        f"   • **B** = 2 vibraciones\n"
        f"   • **C** = 3 vibraciones\n"
        f"   • **D** = 4 vibraciones\n\n"
        f"👇 Presiona el botón para comprobar cómo vibra:",
        reply_markup=teclado
    )

def procesar_mensaje(msg):
    chat = msg.get("chat", {})
    chat_id = chat.get("id")
    telegram_user = chat.get("username", "") or chat.get("first_name", "")
    texto = (msg.get("text") or "").strip()

    if not chat_id or not texto:
        return

    # Comando /start o /login
    if texto.startswith("/start") or texto == "/login":
        SESIONES_LOGIN[chat_id] = {"paso": "esperando_usuario"}
        enviar_mensaje(
            chat_id,
            "👋 *¡Bienvenido al Bot de Vibraciones Salva Web!*\n\n"
            "Para activar las vibraciones en tu iPhone, ingresa las mismas credenciales que te dio tu administrador.\n\n"
            "👤 Por favor, escribe tu *nombre de usuario*:"
        )
        return

    # Comando /probar
    if texto == "/probar":
        enviar_mensaje(chat_id, "🔔 *Enviando 3 vibraciones de prueba a tu iPhone...*")
        enviar_vibracion_iphone(chat_id, 3)
        return

    # Comando /desvincular o /salir
    if texto == "/desvincular" or texto == "/salir":
        SESIONES_LOGIN.pop(chat_id, None)
        enviar_mensaje(chat_id, "ℹ️ Sesión cerrada. Para volver a iniciar envía /start")
        return

    # Flujo de inicio de sesión paso a paso
    estado = SESIONES_LOGIN.get(chat_id, {})
    paso = estado.get("paso")

    # Si está esperando el usuario
    if paso == "esperando_usuario":
        usuario_ingresado = texto.replace("@", "").strip()
        SESIONES_LOGIN[chat_id] = {
            "paso": "esperando_password",
            "usuario": usuario_ingresado
        }
        enviar_mensaje(
            chat_id,
            f"👤 Usuario: `{usuario_ingresado}`\n\n"
            f"🔑 Ahora escribe tu *contraseña*:"
        )
        return

    # Si está esperando la contraseña
    if paso == "esperando_password":
        usuario = estado.get("usuario")
        password = texto.strip()
        ejecutar_autenticacion_y_vinculo(chat_id, telegram_user, usuario, password)
        return

    # Si el usuario escribe todo en una sola línea (ej: "carlos 1234")
    partes = texto.split()
    if len(partes) == 2:
        usuario, password = partes[0].strip(), partes[1].strip()
        ejecutar_autenticacion_y_vinculo(chat_id, telegram_user, usuario, password)
        return

    # Mensaje no reconocido
    enviar_mensaje(
        chat_id,
        "👋 Para iniciar sesión con tu cuenta, envía el comando /start o escribe tu *usuario*."
    )

def procesar_callback(cb):
    cb_id = cb.get("id")
    chat_id = cb.get("message", {}).get("chat", {}).get("id")
    data = cb.get("data")

    telegram_api("answerCallbackQuery", {"callback_query_id": cb_id})

    if data == "probar" and chat_id:
        enviar_mensaje(chat_id, "📳 *Enviando 3 vibraciones de prueba a tu iPhone...*")
        enviar_vibracion_iphone(chat_id, 3)

def iniciar_bot():
    log("Iniciando Bot de Telegram para iPhone...")
    
    # Iniciar servidor web en segundo plano para compatibilidad con plan Free de Render
    threading.Thread(target=iniciar_servidor_web, daemon=True).start()

    if not TELEGRAM_BOT_TOKEN or "AQUI" in TELEGRAM_BOT_TOKEN:
        print("ERROR: TELEGRAM_BOT_TOKEN no configurado.")
        return

    me = telegram_api("getMe")
    if not me or not me.get("ok"):
        log("ERROR: Token de Telegram inválido o sin conexión.")
        return

    bot_info = me.get("result", {})
    log(f"Bot conectado exitosamente: @{bot_info.get('username')} ({bot_info.get('first_name')})")

    offset = None
    while True:
        try:
            params = {"timeout": 25}
            if offset:
                params["offset"] = offset

            updates = telegram_api("getUpdates", params)
            if updates and updates.get("ok"):
                for item in updates.get("result", []):
                    offset = item.get("update_id") + 1
                    if "message" in item:
                        procesar_mensaje(item["message"])
                    elif "callback_query" in item:
                        procesar_callback(item["callback_query"])
            time.sleep(0.5)
        except KeyboardInterrupt:
            log("Bot detenido por el usuario.")
            break
        except Exception as e:
            log(f"Error en loop de bot: {e}")
            time.sleep(3)

if __name__ == "__main__":
    iniciar_bot()
