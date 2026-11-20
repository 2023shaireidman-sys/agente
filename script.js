// Variables de estado y sesión
let sessionIdMemoria = null;
let ultimoEnvio = 0;
const LIMITE_CARACTERES = 500;
const TIEMPO_ESPERA_MS = 30000;
const PAUSA_ENTRE_ENVIOS_MS = 1500;

// Elementos del DOM
const zonaDeChat = document.getElementById('zonaDeChat');
const formularioChat = document.getElementById('formularioChat');
const mensajeInput = document.getElementById('mensajeInput');
const botonEnviar = document.getElementById('botonEnviar');
const contadorCaracteres = document.getElementById('contadorCaracteres');

// Inicializar sesión al cargar
const sessionId = obtenerOCrearSessionId();

// Actualizar contador de caracteres en tiempo real
mensajeInput.addEventListener('input', () => {
  const longitudActual = mensajeInput.value.length;
  contadorCaracteres.textContent = `${longitudActual} / ${LIMITE_CARACTERES}`;
  contadorCaracteres.style.color = longitudActual >= LIMITE_CARACTERES ? '#dc2626' : '#64748b';
});

// Escuchar el envío del formulario
formularioChat.addEventListener('submit', async (e) => {
  e.preventDefault();
  await procesarEnvio();
});

// Permitir enviar con Enter (y salto de línea con Shift+Enter)
mensajeInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    formularioChat.requestSubmit();
  }
});

// Genera o recupera un sessionId único
function obtenerOCrearSessionId() {
  const claveStorage = 'promptin_session_id';
  
  try {
    const guardado = localStorage.getItem(claveStorage);
    if (guardado) return guardado;
  } catch (e) {
    // Si localStorage está bloqueado, seguimos usando memoria
  }

  const nuevoId = (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID()
    : `ses-${Date.now()}-${Math.random().toString(36).substring(2, 10)}`;

  try {
    localStorage.setItem(claveStorage, nuevoId);
  } catch (e) {
    sessionIdMemoria = nuevoId;
  }

  return nuevoId;
}

// Verifica si la URL del webhook es válida
function urlWebhookEsValida() {
  if (typeof WEBHOOK_URL === 'undefined' || !WEBHOOK_URL) return false;
  const url = WEBHOOK_URL.trim();
  if (url === '' || url.includes('ACA VA') || url.includes('ejemplo-webhook-prueba')) {
    return false;
  }
  return true;
}

// Desplaza el chat suavemente hasta el último mensaje
function bajarAlFinalDelChat() {
  requestAnimationFrame(() => {
    zonaDeChat.scrollTop = zonaDeChat.scrollHeight;
  });
}

// Agrega una burbuja de mensaje al chat usando textContent
function agregarBurbuja(texto, tipo, esCargando = false) {
  const contenedor = document.createElement('div');
  contenedor.className = `mensaje ${tipo}`;
  if (esCargando) {
    contenedor.classList.add('cargando');
  }

  const burbuja = document.createElement('div');
  burbuja.className = 'burbuja';
  burbuja.textContent = texto;

  contenedor.appendChild(burbuja);
  zonaDeChat.appendChild(contenedor);
  bajarAlFinalDelChat();

  return contenedor;
}

// Bloquea o desbloquea los controles de escritura
function alternarControles(deshabilitar) {
  mensajeInput.disabled = deshabilitar;
  botonEnviar.disabled = deshabilitar;
  if (!deshabilitar) {
    mensajeInput.focus();
  }
}

// Limpia marcas Markdown y analiza la respuesta de Make de forma tolerante
function procesarRespuestaMake(textoCrudo) {
  let texto = textoCrudo.trim();
  if (!texto) return '(respuesta vacía)';

  // Quitar envoltorios Markdown como ```json ... ```
  texto = texto.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();

  // Intentar parseo estándar
  let datos = null;
  try {
    datos = JSON.parse(texto);
  } catch (e) {
    // Si parece un objeto JSON roto por saltos de línea crudos
    if (texto.startsWith('{') && texto.endsWith('}')) {
      try {
        const textoReparado = texto.replace(/\r?\n/g, '\\n');
        datos = JSON.parse(textoReparado);
      } catch (e2) {
        // Extracción por expresión regular como último recurso
        const campos = ['response', 'respuesta', 'message', 'mensaje'];
        for (const campo of campos) {
          const regex = new RegExp(`"${campo}"\\s*:\\s*"([\\s\\S]*?)"\\s*(?:,|\\})`, 'i');
          const coincidencia = texto.match(regex);
          if (coincidencia && coincidencia[1].trim() !== '') {
            return coincidencia[1].replace(/\\n/g, '\n').replace(/\\"/g, '"');
          }
        }
      }
    }
  }

  // Si es un objeto válido, buscar los campos en orden
  if (datos !== null && typeof datos === 'object' && !Array.isArray(datos)) {
    const claves = ['response', 'respuesta', 'message', 'mensaje'];
    for (const clave of claves) {
      if (typeof datos[clave] === 'string' && datos[clave].trim() !== '') {
        return datos[clave];
      }
    }
    return 'Make respondió, pero sin el campo response';
  }

  // Si no es un objeto (texto plano, número, booleano, lista, etc.)
  return texto;
}

// Flujo principal de validación y envío a Make
async function procesarEnvio() {
  const mensaje = mensajeInput.value.trim();

  // Validaciones previas
  if (!mensaje) return;

  if (mensaje.length > LIMITE_CARACTERES) {
    agregarBurbuja(`El mensaje no puede superar los ${LIMITE_CARACTERES} caracteres.`, 'agente');
    return;
  }

  if (!urlWebhookEsValida()) {
    agregarBurbuja('Falta pegar la URL de tu webhook en config.js', 'agente');
    return;
  }

  // Pausa mínima de 1,5 segundos entre envíos
  const ahora = Date.now();
  if (ahora - ultimoEnvio < PAUSA_ENTRE_ENVIOS_MS) {
    return;
  }
  ultimoEnvio = ahora;

  // Mostrar mensaje del usuario y limpiar campo
  agregarBurbuja(mensaje, 'usuario');
  mensajeInput.value = '';
  contadorCaracteres.textContent = `0 / ${LIMITE_CARACTERES}`;
  contadorCaracteres.style.color = '#64748b';

  // Estado cargando
  alternarControles(true);
  const burbujaCarga = agregarBurbuja('Pensando...', 'agente', true);

  const controlador = new AbortController();
  const temporizador = setTimeout(() => controlador.abort(), TIEMPO_ESPERA_MS);

  try {
    const respuesta = await fetch(WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        sessionId: sessionId,
        mensaje: mensaje,
        fecha: new Date().toISOString()
      }),
      signal: controlador.signal
    });

    const textoRespuesta = await respuesta.text();

    if (!respuesta.ok) {
      throw new Error(`HTTP_${respuesta.status}`);
    }

    const textoFinal = procesarRespuestaMake(textoRespuesta);
    agregarBurbuja(textoFinal, 'agente');

  } catch (error) {
    if (error.name === 'AbortError') {
      agregarBurbuja('Tiempo agotado: Make tardó más de 30 segundos en responder.', 'agente');
    } else if (error.message && error.message.startsWith('HTTP_')) {
      const codigo = error.message.split('_')[1];
      agregarBurbuja(`Make respondió con error (código ${codigo}). Revisá que tu escenario esté en Active o que hayas apretado Run once.`, 'agente');
    } else {
      agregarBurbuja('Error de red: no se pudo conectar con Make. Revisá tu conexión a internet.', 'agente');
    }
  } finally {
    clearTimeout(temporizador);
    if (burbujaCarga && burbujaCarga.parentNode) {
      burbujaCarga.remove();
    }
    alternarControles(false);
  }
}
