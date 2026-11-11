"""
Bot de Telegram para Vibraciones en iPhone (Sistema Salva Web)
Soporta Webhook oficial para Render (despierta automáticamente al recibir mensajes)
y Long-Polling como respaldo local.
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

# Importar configuración
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from config import SUPABASE_URL, SUPABASE_KEY, TELEGRAM_BOT_TOKEN

# URL pública de Render para el Webhook
RENDER_EXTERNAL_URL = os.environ.get("RENDER_EXTERNAL_URL", "https://salva-iphone-bot.onrender.com")

# Memoria de sesiones temporales para el flujo de login
SESIONES_LOGIN = {}

def log(msg):
    timestamp = time.strftime("%Y-%m-%d %H:%M:%S")
    print(f"[{timestamp}] [TelegramBot] {msg}", flush=True)

def telegram_api(metodo, params=None):
    """Llama a la API oficial de Telegram mediante urllib estándar"""
    if not TELEGRAM_BOT_TOKEN or "AQUI" in TELEGRAM_BOT_TOKEN:
        log("ERROR: TELEGRAM_BOT_TOKEN no configurado.")
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
            time.sleep(5.0)

def ejecutar_autenticacion_y_vinculo(chat_id, telegram_user, usuario, password):
    """Valida credenciales contra Supabase y guarda el chat_id en usuarios_app"""
    log(f"Autenticando usuario '{usuario}' para chat_id {chat_id}")
    
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

    # Vincular en base de datos
    supabase_rpc("vincular_telegram", {
        "p_usuario": usuario,
        "p_chat_id": chat_id,
        "p_telegram_user": telegram_user
    })

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

    log(f"Mensaje recibido de {chat_id} ({telegram_user}): {texto}")

    # Comando /start o /login
    if texto.startswith("/start") or texto == "/login":
        partes = texto.split(maxsplit=1)
        # Si viene con usuario adjunto: /start usuario
        if len(partes) > 1:
            usuario = partes[1].strip()
            SESIONES_LOGIN[chat_id] = {
                "paso": "esperando_password",
                "usuario": usuario
            }
            enviar_mensaje(
                chat_id,
                f"👤 Usuario detectado: `{usuario}`\n\n"
                f"🔑 Ahora escribe tu *contraseña*:"
            )
            return

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
        enviar_mensaje(chat_id, "🔔 *Enviando vibración de prueba a tu iPhone...*")
        enviar_vibracion_iphone(chat_id, 2)
        return

    # Flujo de login
    estado = SESIONES_LOGIN.get(chat_id, {})
    paso = estado.get("paso")

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

    if paso == "esperando_password":
        usuario = estado.get("usuario")
        password = texto.strip()
        ejecutar_autenticacion_y_vinculo(chat_id, telegram_user, usuario, password)
        return

    # Usuario y contraseña juntos en una línea: "usuario clave"
    partes = texto.split()
    if len(partes) == 2:
        usuario, password = partes[0].strip(), partes[1].strip()
        ejecutar_autenticacion_y_vinculo(chat_id, telegram_user, usuario, password)
        return

    enviar_mensaje(
        chat_id,
        "👋 Para iniciar sesión con tu cuenta, escribe /start o tu *nombre de usuario*."
    )

def procesar_callback(cb):
    cb_id = cb.get("id")
    chat_id = cb.get("message", {}).get("chat", {}).get("id")
    data = cb.get("data")

    telegram_api("answerCallbackQuery", {"callback_query_id": cb_id})

    if data == "probar" and chat_id:
        enviar_mensaje(chat_id, "📳 *Enviando vibración de prueba a tu iPhone (2 pulsos)...*")
        enviar_vibracion_iphone(chat_id, 2)

def procesar_update(update):
    """Procesa un update individual proveniente de Webhook o Polling"""
    if "message" in update:
        procesar_mensaje(update["message"])
    elif "callback_query" in update:
        procesar_callback(update["callback_query"])

# Servidor Webhook HTTP para Render
class WebhookHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.end_headers()
        self.wfile.write(b"Bot Telegram Activo 24/7 (Webhook Operativo)")

    def do_POST(self):
        try:
            content_length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(content_length).decode("utf-8")
            update = json.loads(body)
            # Procesar en hilo para responder inmediatamente a Telegram con 200 OK
            threading.Thread(target=procesar_update, args=(update,), daemon=True).start()
        except Exception as e:
            log(f"Error procesando update webhook: {e}")

        self.send_response(200)
        self.send_header("Content-Type", "text/plain")
        self.end_headers()
        self.wfile.write(b"OK")

    def log_message(self, format, *args):
        pass

def iniciar_bot():
    log("Iniciando Bot de Telegram para iPhone...")
    if not TELEGRAM_BOT_TOKEN or "AQUI" in TELEGRAM_BOT_TOKEN:
        log("ERROR: TELEGRAM_BOT_TOKEN no configurado.")
        return

    me = telegram_api("getMe")
    if not me or not me.get("ok"):
        log("ERROR: Token de Telegram inválido o sin conexión.")
        return

    bot_info = me.get("result", {})
    username = bot_info.get("username")
    log(f"Bot verificado: @{username}")

    puerto = int(os.environ.get("PORT", 8080))
    en_render = "RENDER" in os.environ or "PORT" in os.environ

    if en_render:
        # En la nube (Render): usar Webhook oficial
        # Esto garantiza que cada mensaje de un alumno sea un HTTP POST a Render que lo despierte de inmediato
        webhook_url = f"{RENDER_EXTERNAL_URL}/webhook"
        log(f"Configurando Webhook en Telegram: {webhook_url}")
        res = telegram_api("setWebhook", {
            "url": webhook_url,
            "drop_pending_updates": False
        })
        log(f"Resultado setWebhook: {res}")

        log(f"Iniciando servidor HTTP Webhook en puerto {puerto}...")
        servidor = HTTPServer(("0.0.0.0", puerto), WebhookHandler)
        log("Servidor Webhook listo y escuchando!")
        servidor.serve_forever()
    else:
        # En local: eliminar webhook y usar Long-Polling
        log("Ejecutando en modo local (Polling)...")
        telegram_api("deleteWebhook")
        
        # Iniciar health check en segundo plano
        threading.Thread(target=lambda: HTTPServer(("0.0.0.0", puerto), WebhookHandler).serve_forever(), daemon=True).start()
        
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
                        procesar_update(item)
                time.sleep(0.5)
            except KeyboardInterrupt:
                log("Bot detenido.")
                break
            except Exception as e:
                log(f"Error polling: {e}")
                time.sleep(3)

if __name__ == "__main__":
    iniciar_bot()
