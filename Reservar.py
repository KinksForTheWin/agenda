import os
import json
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo # Asegúrate de que zoneinfo esté importado

# Configuración de zona horaria (Montevideo)
TIMEZONE = ZoneInfo("America/Montevideo")

BASE_DIR = os.path.join(os.path.dirname(__file__), "reservas")
CONFIG_DIR = os.path.join(os.path.dirname(__file__), "config_negocios") # Nuevo directorio para configuraciones


def _get_reservation_path(id_negocio: str, dia_del_anio: str, id_calendario: int) -> str:
    """Retorna la ruta al archivo de reservas para un día y calendario específicos."""
    return os.path.join(BASE_DIR, id_negocio, dia_del_anio, f"{id_calendario}.json")

def _get_business_config_path(id_negocio: str) -> str:
    """Retorna la ruta al archivo de configuración de un negocio."""
    return os.path.join(CONFIG_DIR, f"{id_negocio}.json")

def cargar_reservas(id_negocio: str, dia_del_anio: str, id_calendario: int) -> list:
    """Carga las reservas existentes para un día y calendario específicos."""
    path = _get_reservation_path(id_negocio, dia_del_anio, id_calendario)
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    return []

def guardar_reservas(id_negocio: str, dia_del_anio: str, id_calendario: int, reservas: list):
    """Guarda las reservas para un día y calendario específicos."""
    dir_path = os.path.dirname(_get_reservation_path(id_negocio, dia_del_anio, id_calendario))
    os.makedirs(dir_path, exist_ok=True)
    with open(_get_reservation_path(id_negocio, dia_del_anio, id_calendario), "w", encoding="utf-8") as f:
        json.dump(reservas, f, indent=4)

def cargar_config_negocio(id_negocio: str) -> dict:
    """Carga la configuración de un negocio."""
    path = _get_business_config_path(id_negocio)
    if os.path.exists(path):
        with open(path, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}

def guardar_config_negocio(id_negocio: str, config: dict):
    """Guarda la configuración de un negocio."""
    os.makedirs(CONFIG_DIR, exist_ok=True)
    with open(_get_business_config_path(id_negocio), "w", encoding="utf-8") as f:
        json.dump(config, f, indent=4)


def get_dia_del_anio(fecha: datetime) -> str:
    """Retorna el día del año como una cadena formateada (ej: '001', '365')."""
    return fecha.strftime("%j") # %j es el día del año como número decimal con relleno de cero


def bloques_horarios(id_negocio: str, id_calendario: int, dia_semana_num: int) -> list:
    """Genera una lista de bloques horarios disponibles para un calendario y día de la semana."""
    config = cargar_config_negocio(id_negocio)
    
    # Obtener configuración específica del calendario, si existe
    calendario_config = config.get("calendarios", {}).get(str(id_calendario), {})

    # Valores por defecto si no están en la configuración del calendario
    horario_inicio_hora = calendario_config.get("horario_inicio", 9)
    horario_fin_hora = calendario_config.get("horario_fin", 18)
    duracion_turno_min = calendario_config.get("duracion_turno_min", 30)
    dias_habiles_config = calendario_config.get("dias_habiles", [0, 1, 2, 3, 4]) # Por defecto L-V

    # Si el día de la semana no es hábil según la configuración, no hay bloques.
    # weekday() returns 0 for Monday, 6 for Sunday.
    # getDay() in JS returns 0 for Sunday, 6 for Saturday.
    # Adjusting for Python's weekday: 0=Monday, ..., 6=Sunday.
    # If the dias_habiles_config array corresponds to JS getDay() (0=Sun, 6=Sat),
    # then map it for Python's weekday():
    # JS_DAY_TO_PY_DAY = {0:6, 1:0, 2:1, 3:2, 4:3, 5:4, 6:5}
    # For now, assuming dias_habiles_config directly uses Python's weekday (0=Mon, ..., 6=Sun)
    if dia_semana_num not in dias_habiles_config:
        return []

    bloques = []
    inicio = datetime(1, 1, 1, horario_inicio_hora, 0, tzinfo=TIMEZONE)
    fin = datetime(1, 1, 1, horario_fin_hora, 0, tzinfo=TIMEZONE)
    
    current_block = inicio
    while current_block < fin:
        bloques.append({"hora": current_block.strftime("%H:%M")})
        current_block += timedelta(minutes=duracion_turno_min)
    return bloques


def crear_reserva(id_negocio: str, fecha_str: str, hora: str, usuario: str, id_calendario: int):
    """Crea una nueva reserva si el bloque horario está disponible."""
    try:
        fecha_obj = datetime.strptime(fecha_str, "%Y-%m-%d").replace(tzinfo=TIMEZONE)
    except ValueError:
        raise ValueError("Formato de fecha inválido. Use YYYY-MM-DD.")

    dia_del_anio = get_dia_del_anio(fecha_obj)
    
    # Verificar si el día es hábil para el calendario
    dia_semana_num = fecha_obj.weekday() # 0=Monday, 6=Sunday
    bloques_validos = bloques_horarios(id_negocio, id_calendario, dia_semana_num)
    
    if not any(b['hora'] == hora for b in bloques_validos):
        raise ValueError("El horario seleccionado no es válido o el día no es hábil para este calendario.")

    reservas = cargar_reservas(id_negocio, dia_del_anio, id_calendario)

    # Verificar si la hora ya está reservada
    if any(reserva['hora'] == hora for reserva in reservas):
        raise ValueError(f"El horario {hora} del día {fecha_str} ya está reservado para el calendario {id_calendario}.")

    nueva_reserva = {
        "fecha": fecha_str,
        "hora": hora,
        "usuario": usuario,
        "timestamp": datetime.now(TIMEZONE).isoformat()
    }
    reservas.append(nueva_reserva)
    guardar_reservas(id_negocio, dia_del_anio, id_calendario, reservas)
    return nueva_reserva