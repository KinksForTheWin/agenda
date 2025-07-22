// Variables globales
const TIMEZONE_SERVER = "America/Montevideo"; // Asegúrate de que coincida con tu backend
let datosCalendarioGlobal = {};
let negocioIdGlobal = ''; // Para almacenar el ID del negocio globalmente
let calendarioIdGlobal = ''; // Para almacenar el ID del calendario globalmente
let currentOutsideClickListener = null; // Para manejar el cierre del panel lateral al hacer clic fuera

document.addEventListener('DOMContentLoaded', () => {
    // Escuchar el click en el botón "Cargar Calendario"
    const cargarBtn = document.getElementById('cargar');
    if (cargarBtn) {
        cargarBtn.addEventListener('click', cargarCalendario);
    }

    // Escuchar el cambio en el menú desplegable del calendario
    const calendarioSelect = document.getElementById('calendario');
    if (calendarioSelect) {
        calendarioSelect.addEventListener('change', cargarCalendario);
        // También escuchar Enter en el select, por si el usuario lo navega con teclado
        calendarioSelect.addEventListener("keypress", function (event) {
            if (event.key === "Enter") {
                cargarCalendario();
            }
        });
    }

    // Escuchar Enter en el input de negocio (solo si es visible)
    const negocioInput = document.getElementById('negocio');
    if (negocioInput && negocioInput.type !== 'hidden') {
        negocioInput.addEventListener("keypress", function (event) {
            if (event.key === "Enter") {
                cargarCalendario();
            }
        });
    }

    // Cargar automáticamente el calendario al cargar la página
    cargarCalendarioInicial();

    // Actualizar la hora del servidor y del navegador cada segundo
    setInterval(updateServerTime, 1000);
    setInterval(updateBrowserTime, 1000);
});

/**
 * Carga el calendario al inicio de la página.
 * Intenta usar el ID de calendario de la URL si está presente, de lo contrario, usa el por defecto.
 */
function cargarCalendarioInicial() {
    const negocioInput = document.getElementById('negocio');
    const calendarioSelect = document.getElementById('calendario');

    if (!negocioInput || !calendarioSelect) {
        console.warn("Elementos 'negocio' o 'calendario' no encontrados.");
        return;
    }

    negocioIdGlobal = negocioInput.value;

    // Obtener ID de calendario de la URL (si existe)
    const urlParams = new URLSearchParams(window.location.search);
    const idCalendarioFromUrl = urlParams.get('calendario');

    if (idCalendarioFromUrl) {
        // Verificar si la opción realmente existe en el dropdown
        const optionExists = Array.from(calendarioSelect.options).some(
            option => option.value === idCalendarioFromUrl
        );
        if (optionExists) {
            calendarioSelect.value = idCalendarioFromUrl;
        } else {
            console.warn(`Calendario ID ${idCalendarioFromUrl} de la URL no encontrado en las opciones. Usando por defecto.`);
            calendarioSelect.value = '1'; // Fallback a Calendario 1 si el de la URL no es válido
        }
    } else {
        calendarioSelect.value = '1'; // Por defecto, cargar Calendario 1
    }

    // Solo cargar si hay un ID de negocio válido
    if (negocioIdGlobal) {
        cargarCalendario();
    } else {
        mostrarToast("Ingrese un ID de negocio en la URL para comenzar. Ejemplo: /reservas/mi_negocio", 'info');
    }
}


/**
 * Carga los datos del calendario desde el backend y los renderiza.
 * Se llama al hacer clic en el botón "Cargar", al cambiar el dropdown o al inicio.
 */
async function cargarCalendario() {
    const negocioInput = document.getElementById('negocio');
    const calendarioSelect = document.getElementById('calendario');

    negocioIdGlobal = negocioInput ? negocioInput.value : '';
    calendarioIdGlobal = calendarioSelect ? calendarioSelect.value : '';

    if (!negocioIdGlobal || !calendarioIdGlobal) {
        mostrarToast("Verifique el ID del negocio y seleccione un calendario.", 'error');
        return;
    }

    const cargarBtn = document.getElementById('cargar');
    if (cargarBtn) {
        cargarBtn.disabled = true;
        cargarBtn.textContent = "Cargando...";
    }

    // Asegurarse de que el panel lateral esté cerrado antes de cargar un nuevo calendario
    cerrarDetalleDiaPanel();

    try {
        const response = await fetch(`/disponibilidad/${negocioIdGlobal}/${calendarioIdGlobal}`);
        if (!response.ok) {
            if (response.status === 404) {
                const errorData = await response.json();
                throw new Error(errorData.detail || "Calendario no encontrado.");
            }
            throw new Error(`Error HTTP! estado: ${response.status}`);
        }
        datosCalendarioGlobal = await response.json();
        renderizarCalendario();
        mostrarToast("Calendario cargado exitosamente!", 'success');
        actualizarURL(negocioIdGlobal, calendarioIdGlobal); // Actualizar URL después de cargar
    } catch (error) {
        console.error("No se pudo cargar el calendario:", error);
        document.getElementById('calendario-container').innerHTML = `
            <p style="color: red; text-align: center;">No se pudo cargar el calendario. ${error.message || "Verifique el ID del negocio y del calendario."}</p>
        `;
        mostrarToast(`Error al cargar calendario: ${error.message || "Desconocido"}`, 'error');
    } finally {
        if (cargarBtn) {
            cargarBtn.disabled = false;
            cargarBtn.textContent = "Cargar Calendario";
        }
    }
}

/**
 * Actualiza la URL del navegador con el ID del calendario seleccionado como parámetro de consulta.
 * @param {string} idNegocio - El ID del negocio.
 * @param {string} idCalendario - El ID del calendario seleccionado.
 */
function actualizarURL(idNegocio, idCalendario) {
    const currentUrl = new URL(window.location);
    currentUrl.searchParams.set('calendario', idCalendario);
    window.history.pushState({}, '', currentUrl);
}

/**
 * Normaliza una fecha a la medianoche de Montevideo para comparaciones.
 * @returns {Date} La fecha de hoy a la medianoche, en la zona horaria del servidor.
 */
function getTodayMontevideoNormalized() {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}


/**
 * Renderiza el calendario en el contenedor principal.
 */
function renderizarCalendario() {
    const contenedor = document.getElementById('calendario-container');
    if (!contenedor) return;

    contenedor.innerHTML = ''; // Limpiar contenido anterior

    const hoy = getTodayMontevideoNormalized();
    const anioActual = hoy.getFullYear();
    const mesActual = hoy.getMonth(); // 0-11

    const fechaMaximaReservaStr = datosCalendarioGlobal.fecha_maxima_reserva;
    let fechaMaximaReserva = null;
    if (fechaMaximaReservaStr) {
        try {
            fechaMaximaReserva = new Date(fechaMaximaReservaStr + 'T00:00:00'); // Asegurar zona horaria consistente
            fechaMaximaReserva.setHours(0, 0, 0, 0); // Limpiar la hora
        } catch (e) {
            console.error("Error al parsear fecha_maxima_reserva:", e);
            fechaMaximaReserva = null;
        }
    }

    for (let i = 0; i < 12; i++) { // Renderizar 12 meses (ej. desde el actual)
        const fechaIteracion = new Date(anioActual, mesActual + i, 1);
        const nombreMes = fechaIteracion.toLocaleString('es-ES', { month: 'long' });
        const anio = fechaIteracion.getFullYear();
        const diasEnMes = new Date(anio, fechaIteracion.getMonth() + 1, 0).getDate();
        const primerDiaSemana = new Date(anio, fechaIteracion.getMonth(), 1).getDay(); // 0 = Domingo, 6 = Sábado

        const tabla = document.createElement('table');
        tabla.classList.add('calendario-mes');
        tabla.innerHTML = `
            <caption>${nombreMes.charAt(0).toUpperCase() + nombreMes.slice(1)} ${anio}</caption>
            <thead>
                <tr>
                    <th>Lun</th><th>Mar</th><th>Mié</th><th>Jue</th><th>Vie</th><th>Sáb</th><th>Dom</th>
                </tr>
            </thead>
            <tbody></tbody>
        `;
        const tbody = tabla.querySelector('tbody');
        let fila = document.createElement('tr');

        // Rellenar días vacíos al inicio del mes
        // JS getDay(): 0=Sun, 1=Mon, ..., 6=Sat
        // Convertir a 0=Mon, ..., 6=Sun para el layout de la tabla
        let offset = primerDiaSemana === 0 ? 6 : primerDiaSemana - 1;

        for (let j = 0; j < offset; j++) {
            fila.insertCell();
        }

        for (let dia = 1; dia <= diasEnMes; dia++) {
            if ((offset + dia - 1) % 7 === 0 && dia !== 1) { // Si es el primer día de la semana y no es el primer día del mes
                tbody.appendChild(fila);
                fila = document.createElement('tr');
            }
            const celda = fila.insertCell();
            celda.textContent = dia;

            const fechaActualCelda = new Date(anio, fechaIteracion.getMonth(), dia);
            fechaActualCelda.setHours(0, 0, 0, 0); // Limpiar la hora para comparaciones

            // Clase para días pasados
            if (fechaActualCelda < hoy) { // Comparar con la fecha normalizada de hoy
                celda.classList.add('dia-pasado');
                continue; // No permitir selecciones en días pasados
            }

            // Clase para días fuera de la fecha máxima de reserva
            if (fechaMaximaReserva && fechaActualCelda > fechaMaximaReserva) {
                celda.classList.add('dia-no-disponible');
                celda.title = "No se permiten reservas después de esta fecha";
                continue;
            }

            const fechaKey = `${anio}-${(fechaIteracion.getMonth() + 1).toString().padStart(2, '0')}-${dia.toString().padStart(2, '0')}`;
            const reservasDelDia = datosCalendarioGlobal.dias ? datosCalendarioGlobal.dias[fechaKey] || [] : [];
            const diaSemanaNumPy = fechaActualCelda.getDay() === 0 ? 6 : fechaActualCelda.getDay() - 1; // 0=Lun, 6=Dom (Python)
            const bloquesDisponibles = datosCalendarioGlobal.bloques_por_dia_semana ? datosCalendarioGlobal.bloques_por_dia_semana[diaSemanaNumPy] || [] : [];
            
            // --- MODIFICACIÓN CLAVE AQUÍ ---
            // Crear una lista de todos los bloques, marcando los que están reservados o pasados
            const ahora = new Date(); // Hora actual del navegador
            const todosLosBloquesDelDia = bloquesDisponibles.map(b => {
                const [h, m] = b.hora.split(':').map(Number);
                const horaBloque = new Date(fechaActualCelda.getFullYear(), fechaActualCelda.getMonth(), fechaActualCelda.getDate(), h, m);
                
                const isReserved = reservasDelDia.some(r => r.hora === b.hora);
                const isPast = fechaActualCelda.toDateString() === hoy.toDateString() && horaBloque < ahora;

                return {
                    hora: b.hora,
                    isReserved: isReserved,
                    isPast: isPast // También marcamos como pasado si es el día actual
                };
            }).sort((a, b) => a.hora.localeCompare(b.hora)); // Ordenar por hora

            // Determinar si el día tiene bloques disponibles para reservar
            const tieneBloquesDisponiblesParaReservar = todosLosBloquesDelDia.some(b => !b.isReserved && !b.isPast);


            if (tieneBloquesDisponiblesParaReservar) {
                celda.classList.add('dia-disponible');
                celda.dataset.fecha = fechaKey;
                celda.dataset.bloques = JSON.stringify(todosLosBloquesDelDia); // Pasar TODOS los bloques
                celda.addEventListener('click', () => mostrarDetalleDiaPanel(fechaKey, todosLosBloquesDelDia)); // Usar el nuevo panel lateral
                celda.title = "Día disponible";
            } else {
                celda.classList.add('dia-sin-disponibilidad');
                celda.title = "No hay horarios disponibles";
                celda.dataset.fecha = fechaKey; // Necesario para mostrar panel incluso si no hay disponibles para reservar
                celda.dataset.bloques = JSON.stringify(todosLosBloquesDelDia);
                // Si quieres que el clic siga abriendo el panel para días sin disponibilidad total:
                celda.addEventListener('click', () => mostrarDetalleDiaPanel(fechaKey, todosLosBloquesDelDia));
            }
            // Marcar el día actual
            if (fechaActualCelda.toDateString() === hoy.toDateString()) {
                celda.classList.add('dia-actual');
            }
        }
        tbody.appendChild(fila); // Añadir la última fila
        contenedor.appendChild(tabla);
    }
}

/**
 * Muestra un panel lateral con los horarios disponibles para el día seleccionado.
 * @param {string} fecha - La fecha del día seleccionado (YYYY-MM-DD).
 * @param {Array<Object>} bloques - Array de objetos con {hora: "HH:MM", isReserved: boolean, isPast: boolean} para el día.
 */
function mostrarDetalleDiaPanel(fecha, bloques) {
    const panel = document.getElementById('detalle-dia-panel');
    if (!panel) {
        console.error("Panel de detalles de día no encontrado.");
        return;
    }

    const panelContent = panel.querySelector('.panel-content');
    if (!panelContent) {
        console.error("Contenido del panel de detalles de día no encontrado.");
        return;
    }

    // Cerrar cualquier panel abierto antes de abrir uno nuevo
    cerrarDetalleDiaPanel();

    // Limpiar contenido anterior e inyectar el nuevo
    panelContent.innerHTML = `
        <h3>Horarios para el ${fecha}</h3>
        <div id="panel-horarios-list"></div>
        <p><small>Hora servidor: <span id="hora-servidor-panel"></span></small></p>
        <p><small>Hora navegador: <span id="hora-navegador-panel"></span></small></p>
    `;

    const horariosListDiv = panelContent.querySelector('#panel-horarios-list');
    if (bloques.length > 0) {
        bloques.forEach(bloque => {
            const btn = document.createElement('button');
            btn.classList.add('btn-hora'); // Reutilizar la clase existente para los botones de hora
            btn.textContent = bloque.hora;
            btn.dataset.fecha = fecha;
            btn.dataset.hora = bloque.hora;

            // --- MODIFICACIÓN CLAVE AQUÍ ---
            if (bloque.isReserved) {
                btn.classList.add('btn-hora-reservada'); // Nueva clase para horas reservadas
                btn.disabled = true; // Deshabilitar el botón
                btn.title = "Ya reservado";
            } else if (bloque.isPast) {
                btn.classList.add('btn-hora-pasada'); // Nueva clase para horas pasadas
                btn.disabled = true; // Deshabilitar el botón
                btn.title = "Hora ya pasada";
            } else {
                btn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    prepararReserva(e.target.dataset.fecha, e.target.dataset.hora);
                    cerrarDetalleDiaPanel();
                });
                btn.title = "Click para reservar";
            }
            horariosListDiv.appendChild(btn);
        });
    } else {
        horariosListDiv.innerHTML = '<p>No hay horarios definidos para esta fecha.</p>';
    }

    // Mostrar el panel
    panel.classList.add('open');
    document.body.classList.add('panel-open');

    const closeBtn = panel.querySelector('.close-button');
    if (closeBtn) {
        closeBtn.onclick = cerrarDetalleDiaPanel;
    }

    if (currentOutsideClickListener) {
        document.removeEventListener('click', currentOutsideClickListener);
    }
    currentOutsideClickListener = function(event) {
        // Cierra el panel si el clic no fue dentro del panel y el panel está abierto,
        // y no fue en una celda de día disponible (para evitar doble-trigger).
        if (!panel.contains(event.target) && !event.target.closest('.calendario-mes td') && panel.classList.contains('open')) {
            cerrarDetalleDiaPanel();
        }
    };
    document.addEventListener('click', currentOutsideClickListener);

    if (window.panelTimeInterval) clearInterval(window.panelTimeInterval);
    window.panelTimeInterval = setInterval(updatePanelTime, 1000);
}

/**
 * Cierra el panel lateral de detalles del día.
 */
function cerrarDetalleDiaPanel() {
    const panel = document.getElementById('detalle-dia-panel');
    if (panel) {
        panel.classList.remove('open');
        document.body.classList.remove('panel-open'); // Quitar clase del body
    }
    // Quitar el listener de click fuera cuando el panel está cerrado
    if (currentOutsideClickListener) {
        document.removeEventListener('click', currentOutsideClickListener);
        currentOutsideClickListener = null;
    }
    // Limpiar el intervalo de actualización de hora del panel
    if (window.panelTimeInterval) {
        clearInterval(window.panelTimeInterval);
        window.panelTimeInterval = null;
    }
}

/**
 * Prepara y muestra el modal de confirmación de reserva.
 * @param {string} fecha - La fecha de la reserva (YYYY-MM-DD).
 * @param {string} hora - La hora de la reserva (HH:MM).
 */
function prepararReserva(fecha, hora) {
    const modal = document.getElementById('modal-reserva');
    const spanFecha = document.getElementById('reserva-fecha');
    const spanHora = document.getElementById('reserva-hora');
    const nombreUsuarioInput = document.getElementById('nombre-usuario');

    spanFecha.textContent = fecha;
    spanHora.textContent = hora;
    nombreUsuarioInput.value = ''; // Limpiar campo de usuario

    modal.style.display = 'block';

    const confirmarBtn = document.getElementById('confirmar-reserva');
    confirmarBtn.onclick = () => {
        confirmarReserva(fecha, hora);
    };

    const closeButton = document.querySelector('#modal-reserva .close-button'); // Especificar para el modal
    closeButton.onclick = () => {
        modal.style.display = 'none';
    };

    window.onclick = (event) => {
        if (event.target === modal) {
            modal.style.display = 'none';
        }
    };
}

/**
 * Envía la reserva al backend.
 * @param {string} fecha - La fecha de la reserva.
 * @param {string} hora - La hora de la reserva.
 */
async function confirmarReserva(fecha, hora) {
    const usuario = document.getElementById('nombre-usuario').value;
    if (!usuario) {
        mostrarToast("Por favor, introduce tu nombre.", 'error');
        return;
    }

    try {
        const response = await fetch('/reservar', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                idNegocio: negocioIdGlobal,
                idCalendario: parseInt(calendarioIdGlobal),
                fecha: fecha,
                hora: hora,
                usuario: usuario
            }),
        });

        const data = await response.json();

        if (response.ok) {
            mostrarToast(data.mensaje, 'success');
            document.getElementById('modal-reserva').style.display = 'none';
            document.getElementById('nombre-usuario').value = ''; // Limpiar campo
            cargarCalendario(); // Recargar el calendario para actualizar disponibilidad
        } else {
            throw new Error(data.detail || data.mensaje || "Error al crear la reserva.");
        }
    } catch (error) {
        console.error("Error al confirmar reserva:", error);
        mostrarToast(`Error al reservar: ${error.message}`, 'error');
    }
}

/**
 * Muestra un mensaje "toast" temporal en la interfaz.
 * @param {string} mensaje - El texto del mensaje.
 * @param {'info'|'success'|'error'} tipo - El tipo de mensaje para aplicar estilos (info, success, error).
 */
function mostrarToast(mensaje, tipo = 'info') {
    const toast = document.getElementById('toast');
    toast.textContent = mensaje;
    toast.className = `toast ${tipo} show`; // Añade 'show' para mostrar
    setTimeout(() => {
        toast.className = toast.className.replace("show", ""); // Quita 'show' para ocultar
    }, 3000); // Ocultar después de 3 segundos
}

/**
 * Actualiza la hora del servidor mostrada en la interfaz principal.
 */
async function updateServerTime() {
    try {
        const response = await fetch('/hora-servidor');
        const data = await response.json();
        const horaServidorElement = document.getElementById('hora-servidor');
        if (horaServidorElement) {
            horaServidorElement.textContent = `🖥️ Hora servidor (${TIMEZONE_SERVER}): ${data.hora}`;
        }
    } catch (error) {
        console.error("Error al obtener la hora del servidor:", error);
        const horaServidorElement = document.getElementById('hora-servidor');
        if (horaServidorElement) {
            horaServidorElement.textContent = `🖥️ Hora servidor (America/Montevideo): Error al cargar`;
        }
    }
}

/**
 * Actualiza la hora del navegador mostrada en la interfaz principal.
 */
function updateBrowserTime() {
    const now = new Date();
    const options = {
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    };
    const formattedTime = now.toLocaleString('es-ES', options);
    const browserTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'Zona Desconocida';
    const horaNavegadorElement = document.getElementById('hora-navegador');
    if (horaNavegadorElement) {
        horaNavegadorElement.textContent = `📍 Hora navegador (${browserTimeZone}): ${formattedTime}`;
    }
}

/**
 * Actualiza la hora del servidor y navegador en el panel lateral.
 * Se llama periódicamente cuando el panel está abierto.
 */
async function updatePanelTime() {
    const horaServidorPanel = document.getElementById('hora-servidor-panel');
    const horaNavegadorPanel = document.getElementById('hora-navegador-panel');

    try {
        const response = await fetch('/hora-servidor');
        const data = await response.json();
        if (horaServidorPanel) {
            horaServidorPanel.textContent = data.hora;
        }
    } catch (error) {
        console.error("Error al obtener la hora del servidor para el panel:", error);
        if (horaServidorPanel) {
            horaServidorPanel.textContent = "Error al cargar";
        }
    }

    if (horaNavegadorPanel) {
        const now = new Date();
        const options = {
            timeZone: 'America/Montevideo',
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: false
        };
        const formatter = new Intl.DateTimeFormat('es-ES', options);
        const montevideoTimeBrowser = formatter.format(now);
        horaNavegadorPanel.textContent = montevideoTimeBrowser;
    }
}