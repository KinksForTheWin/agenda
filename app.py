import os
import json
from datetime import datetime, timedelta
from zoneinfo import ZoneInfo

from fastapi import FastAPI, HTTPException, Request, status, Form
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.middleware.cors import CORSMiddleware

from Reservar import (
    bloques_horarios,
    cargar_reservas,
    crear_reserva,
    get_dia_del_anio,
    cargar_config_negocio,
    guardar_config_negocio
)
from pydantic import BaseModel

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")

MARGEN_MINUTOS = 60  # Configurable
TIMEZONE = ZoneInfo("America/Montevideo")  # Zona horaria configurada

class ReservaRequest(BaseModel):
    idNegocio: str
    idCalendario: int
    fecha: str  # YYYY-MM-DD
    hora: str   # HH:MM
    usuario: str

class CalendarConfig(BaseModel):
    nombre: str
    horario_inicio: int
    horario_fin: int
    duracion_turno_min: int
    dias_habiles: list[int] # 0=Lunes, 6=Domingo
    fecha_maxima_reserva: str | None = None

class BusinessConfig(BaseModel):
    max_calendarios: int = 1
    calendarios: dict[str, CalendarConfig] = {}


@app.get("/", response_class=HTMLResponse)
async def read_root(request: Request):
    return templates.TemplateResponse("index.html", {"request": request, "id_negocio": None, "max_calendarios": None, "calendarios_config": {}})

@app.get("/reservas/{id_negocio}", response_class=HTMLResponse)
async def show_reservations(request: Request, id_negocio: str):
    config_negocio = cargar_config_negocio(id_negocio)
    max_calendarios = config_negocio.get("max_calendarios", 1)
    calendarios_config = config_negocio.get("calendarios", {})

    return templates.TemplateResponse(
        "index.html",
        {
            "request": request,
            "id_negocio": id_negocio,
            "max_calendarios": max_calendarios,
            "calendarios_config": calendarios_config
        }
    )

@app.get("/reservas/{id_negocio}/admin", response_class=HTMLResponse)
async def admin_panel(request: Request, id_negocio: str):
    config_negocio = cargar_config_negocio(id_negocio)
    max_calendarios_value = config_negocio.get("max_calendarios", 1)
    calendarios_config_value = config_negocio.get("calendarios", {})

    default_fecha_maxima_value = (datetime.now(TIMEZONE) + timedelta(days=90)).strftime("%Y-%m-%d")

    dias_semana_nombres = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"]

    return templates.TemplateResponse("admin.html", {
        "request": request,
        "id_negocio": id_negocio,
        "max_calendarios": max_calendarios_value,
        "calendarios_config": calendarios_config_value,
        "dias_semana_nombres": dias_semana_nombres,
        "default_fecha_maxima": default_fecha_maxima_value
    })


@app.post("/reservas/{id_negocio}/admin/config", response_class=HTMLResponse)
async def save_admin_config(request: Request, id_negocio: str,
                            max_calendarios: int = Form(...),
                            ):
    form_data = await request.form()

    # 1. Cargar la configuración actual del negocio
    current_config = cargar_config_negocio(id_negocio) # This loads the *initial* config

    # 2. Actualizar max_calendarios
    current_config["max_calendarios"] = max_calendarios

    # 3. Inicializar un nuevo diccionario para los calendarios que vamos a guardar
    updated_calendarios = {}

    for i in range(1, max_calendarios + 1):
        cal_id = str(i)
        
        # Obtener la configuración existente para este calendario o un diccionario vacío si no existe
        existing_cal_config = current_config.get("calendarios", {}).get(cal_id, {})

        # Obtener valores del formulario, usando defaults si no están presentes
        nombre = form_data.get(f"nombre_calendario_{i}", f"Calendario {i}")
        horario_inicio = int(form_data.get(f"horario_inicio_{i}", 9))
        horario_fin = int(form_data.get(f"horario_fin_{i}", 18))
        duracion_turno_min = int(form_data.get(f"duracion_turno_min_{i}", 30))
        dias_habiles_str = form_data.getlist(f"dias_habiles_{i}")
        dias_habiles = [int(d) for d in dias_habiles_str]

        fecha_maxima_reserva = form_data.get(f"fecha_maxima_reserva_{i}")
        if fecha_maxima_reserva == "":
            fecha_maxima_reserva = None

        # Construir la configuración para el calendario actual, sobrescribiendo lo que venga del formulario
        current_calendar_data = {
            "nombre": nombre,
            "horario_inicio": horario_inicio,
            "horario_fin": horario_fin,
            "duracion_turno_min": duracion_turno_min,
            "dias_habiles": dias_habiles,
            "fecha_maxima_reserva": fecha_maxima_reserva
        }
        
        existing_cal_config.update(current_calendar_data)
        updated_calendarios[cal_id] = existing_cal_config

    # Asignar el diccionario de calendarios actualizado a la configuración principal
    current_config["calendarios"] = updated_calendarios

    # 4. Guardar la configuración actualizada
    guardar_config_negocio(id_negocio, current_config)

    # 5. Volver a cargar la configuración desde el archivo DESPUÉS de guardar
    # Esto asegura que la plantilla siempre muestre la configuración persistida en el disco.
    reloaded_config = cargar_config_negocio(id_negocio)

    # Re-render the admin panel with a success message
    default_fecha_maxima_value = (datetime.now(TIMEZONE) + timedelta(days=90)).strftime("%Y-%m-%d")
    dias_semana_nombres = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"]

    return templates.TemplateResponse(
        "admin.html",
        {
            "request": request,
            "id_negocio": id_negocio,
            # Pasar los valores recargados del archivo JSON
            "max_calendarios": reloaded_config.get("max_calendarios", 1),
            "calendarios_config": reloaded_config.get("calendarios", {}),
            "mensaje": "Configuración guardada exitosamente!",
            "dias_semana_nombres": dias_semana_nombres,
            "default_fecha_maxima": default_fecha_maxima_value
        },
        status_code=status.HTTP_200_OK
    )

@app.get("/disponibilidad/{id_negocio}/{id_calendario}")
async def get_disponibilidad(id_negocio: str, id_calendario: int):
    config = cargar_config_negocio(id_negocio)
    calendarios_config = config.get("calendarios", {})
    
    if str(id_calendario) not in calendarios_config:
        raise HTTPException(status_code=404, detail="Calendario no encontrado para este negocio.")
    
    cal_config = calendarios_config[str(id_calendario)]

    all_reservations_by_date = {}
    now = datetime.now(TIMEZONE)
    
    for i in range(366): 
        current_date = now + timedelta(days=i)
        fecha_str = current_date.strftime("%Y-%m-%d")
        dia_del_anio = get_dia_del_anio(current_date)

        reservas_for_day = cargar_reservas(id_negocio, dia_del_anio, id_calendario)
        
        if reservas_for_day:
            all_reservations_by_date[fecha_str] = reservas_for_day

    bloques_por_dia_semana = {}
    for dia_semana_num_py in range(7):
        bloques_por_dia_semana[str(dia_semana_num_py)] = bloques_horarios(
            id_negocio,
            id_calendario,
            dia_semana_num_py
        )

    return {
        "dias": all_reservations_by_date,
        "bloques_por_dia_semana": bloques_por_dia_semana,
        "fecha_maxima_reserva": cal_config.get("fecha_maxima_reserva")
    }

@app.post("/reservar")
async def reservar(reserva_request: ReservaRequest):
    try:
        crear_reserva(
            reserva_request.idNegocio,
            reserva_request.fecha,
            reserva_request.hora,
            reserva_request.usuario,
            reserva_request.idCalendario
        )
        return {"mensaje": "Reserva creada exitosamente!"}
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error interno del servidor: {e}")

@app.get("/hora-servidor", response_class=JSONResponse)
async def get_server_time():
    now = datetime.now(TIMEZONE)
    return {"hora": now.strftime("%Y-%m-%d %H:%M:%S")}