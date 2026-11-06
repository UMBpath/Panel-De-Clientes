"""
Configuración del servidor
"""

# Configuración de Supabase
SUPABASE_URL = "https://lcrctcaogoyimtjmdqzu.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxjcmN0Y2FvZ295aW10am1kcXp1Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTMyNDY1MzUsImV4cCI6MjEwODgyMjUzNX0.QsiEby4e87gNt_JsBFOfiFdCewZpEsXD7_a2FXqI0bg"

# API Key de Anthropic (solo para el ejecutable local)
ANTHROPIC_API_KEY = ""

# Configuración de Telegram Bot para iPhone
TELEGRAM_BOT_TOKEN = "PEGA_AQUI_TU_TELEGRAM_BOT_TOKEN"
TELEGRAM_BOT_USERNAME = "PEGA_AQUI_TU_TELEGRAM_BOT_USERNAME"
TELEGRAM_BOT_TOKEN = "9067549159:AAExAb8RdYaH0v6NLP7nIHybHO68GCoMLsU"
TELEGRAM_BOT_USERNAME = "salva_iphone_vibrador_bot"


# Configuración de Proxy (opcional)
USAR_PROXY = True
PROXY_HOST = "127.0.0.1"
PROXY_PORT = 1080

# Modelos de Claude (en orden de preferencia)
MODELOS = ["claude-sonnet-5", "claude-sonnet-4-5", "claude-haiku-4-5"]
MAX_TOKENS = 1024
LADO_MAX = 1456

# Hotkeys
HOTKEYS_CAPTURA = ["."]
HOTKEYS_SALIR = ["ctrl+alt+q", "ctrl+shift+q", "ctrl+shift+c", "ctrl+shift+x"]

# Prompt del sistema
PROMPT_SISTEMA = (
    "Recibes una captura de pantalla de un examen o formulario. "
    "Puede haber UNA o VARIAS preguntas visibles. En ESTE ciclo resuelves UNA sola. "
    "Una pregunta YA ESTÁ MARCADA / respondida si ves cualquiera de esto: "
    "círculo o radio relleno, checkbox con palomita, opción resaltada o con "
    "fondo distinto, borde de selección, texto de respuesta escrito, o un "
    "indicador de correcto/incorrecto. "
    ""
    "LÓGICA IMPORTANTE: "
    "SI la pregunta de ARRIBA está marcada, resuelve la pregunta de ABAJO. "
    "SI la pregunta de ARRIBA NO está marcada, resuelve la pregunta de ARRIBA. "
    ""
    "Paso 1: verifica si la pregunta de arriba tiene alguna opción marcada. "
    "Paso 2: si la de arriba está marcada, ignórala y resuelve la de abajo. "
    "Paso 3: si la de arriba NO está marcada, resuelve esa y no mires la de abajo. "
    "Paso 4: elige la opción correcta SOLO de la pregunta seleccionada. "
    ""
    "Devuelve la LETRA de la opción correcta (A, B, C, o D). "
    "Las opciones usualmente están etiquetadas como A, B, C, D en el examen. "
    "Si no hay etiquetas visibles, asume el orden de izquierda a derecha como A, B, C, D. "
    "NUNCA elijas una opción que ya esté marcada."
)

# Herramienta para Claude
HERRAMIENTA = {
    "name": "seleccionar_opcion",
    "description": (
        "Selecciona la opción correcta de la primera pregunta SIN marcar. "
        "Omite cualquier pregunta que ya esté respondida."
    ),
    "input_schema": {
        "type": "object",
        "properties": {
            "preguntas_omitidas": {
                "type": "string",
                "description": (
                    "Enunciados breves de las preguntas ya marcadas que se omiten. "
                    "Vacío si ninguna está marcada."
                ),
            },
            "pregunta": {
                "type": "string",
                "description": "Enunciado de la primera pregunta aún SIN marcar.",
            },
            "hay_mas_preguntas": {
                "type": "boolean",
                "description": "True si hay más preguntas debajo de esta.",
            },
            "razonamiento": {
                "type": "string",
                "description": "Razonamiento usando solo esta pregunta pendiente.",
            },
            "texto": {
                "type": "string",
                "description": "Texto de la opción elegida.",
            },
            "letra": {
                "type": "string",
                "description": "Letra de la opción correcta (A, B, C, o D).",
                "enum": ["A", "B", "C", "D"],
            },
        },
        "required": [
            "preguntas_omitidas",
            "pregunta",
            "hay_mas_preguntas",
            "razonamiento",
            "texto",
            "letra",
        ],
    },
}
