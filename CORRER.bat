@echo off
cd /d "%~dp0"

REM Crear entorno virtual si no existe
if not exist venv (
    echo Creando entorno virtual...
    python -m venv venv
)

REM Activar entorno virtual
call "venv\Scripts\activate.bat"

REM Actualizar pip
echo Actualizando pip...
python -m pip install --upgrade pip

REM Instalar fastapi si no está
pip show fastapi >nul 2>&1
if errorlevel 1 (
    pip install fastapi
) else (
    echo fastapi ya instalado.
)

REM Instalar uvicorn si no está
pip show uvicorn >nul 2>&1
if errorlevel 1 (
    pip install uvicorn
) else (
    echo uvicorn ya instalado.
)

REM Instalar jinja2 si no está
pip show jinja2 >nul 2>&1
if errorlevel 1 (
    pip install jinja2
) else (
    echo jinja2 ya instalado.
)

REM Instalar tzdata si no está (para zoneinfo en Windows)
pip show tzdata >nul 2>&1
if errorlevel 1 (
    pip install tzdata
) else (
    echo tzdata ya instalado.
)

REM Instalar pytz si no está (opcional alternativa zoneinfo)
pip show pytz >nul 2>&1
if errorlevel 1 (
    pip install pytz
) else (
    echo pytz ya instalado.
)

REM Instalar python-multipart si no está (necesario para manejar formularios FastAPI)
pip show python-multipart >nul 2>&1
if errorlevel 1 (
    pip install python-multipart
) else (
    echo python-multipart ya instalado.
)

REM Abrir navegador en segundo plano
start "" http://127.0.0.1:8000

REM Ejecutar servidor uvicorn (sin pause para permitir cerrar ventana con X)
uvicorn app:app --reload
