// Referencias a elementos del DOM
const zonaDeChat = document.getElementById('zonaDeChat');
const formularioChat = document.getElementById('formularioChat');
const mensajeInput = document.getElementById('mensajeInput');
const botonEnviar = document.getElementById('botonEnviar');

// Configuración de tiempos de espera y control
const TIEMPO_LIMITE_MS = 10000; // 10 segundos
const TIEMPO_ESPERA_ENTRE_ENVIOS = 2000; // 2 segundos

// Manejador del evento del formulario
formularioChat.addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const textoMensaje = mensajeInput.value.trim();
  if (!textoMensaje) return;

  // Renderizar mensaje del usuario
  agregarMensaje(textoMensaje, 'usuario');
  mensajeInput.value = '';

  // Bloquear interfaz para evitar envíos múltiples
  gestionarEstadoEnvio(true);

  // Crear elemento de respuesta provisional
  const idCargando = agregarMensaje('El agente está pensando...', 'agente cargando');

  try {
    const respuesta = await enviarMensajeWebhook(textoMensaje);
    actualizarMensaje(idCargando, respuesta);
  } catch (error) {
    actualizarMensaje(idCargando, `Error: ${error.message}`);
  } finally {
    // Aplicar temporizador de espera antes de reactivar el envío
    setTimeout(() => {
      gestionarEstadoEnvio(false);
    }, TIEMPO_ESPERA_ENTRE_ENVIOS);
  }
});

// Función asíncrona para enviar datos con AbortController
async function enviarMensajeWebhook(mensaje) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIEMPO_LIMITE_MS);

  try {
    const response = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'json' },
      body: JSON.stringify({ mensaje: mensaje }),
      signal: controller.signal
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      throw new Error('No se pudo obtener respuesta del servidor.');
    }

    const data = await response.json();
    return data.respuesta || 'Mensaje recibido correctamente.';
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error('La petición tardó demasiado y fue cancelada.');
    }
    throw error;
  }
}

// Agrega un mensaje a la "zona de chat"
function agregarMensaje(texto, tipo) {
  const divMensaje = document.createElement('div');
  const id = 'msg-' + Date.now();
  divMensaje.id = id;
  divMensaje.className = `mensaje ${tipo}`;
  
  const divBurbuja = document.createElement('div');
  divBurbuja.className = 'burbuja';
  divBurbuja.textContent = texto;

  divMensaje.appendChild(divBurbuja);
  zonaDeChat.appendChild(divMensaje);
  
  hacerScrollAlFinal();
  return id;
}

// Actualiza el texto de un mensaje existente por su ID
function actualizarMensaje(id, nuevoTexto) {
  const el = document.getElementById(id);
  if (el) {
    el.classList.remove('cargando');
    const burbuja = el.querySelector('.burbuja');
    if (burbuja) burbuja.textContent = nuevoTexto;
  }
}

// Controla el estado del botón y campo durante el envío
function gestionarEstadoEnvio(deshabilitar) {
  botonEnviar.disabled = deshabilitar;
  mensajeInput.disabled = deshabilitar;
}

// Autoscroll para mantener la vista en los últimos mensajes
function hacerScrollAlFinal() {
  zonaDeChat.scrollTop = zonaDeChat.scrollHeight;
}
