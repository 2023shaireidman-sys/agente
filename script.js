// Variables globales
let arbolDecision = {};
let historialRespuestas = [];

// Elementos del DOM
const zonaMensajes = document.getElementById('zona-de-mensajes') || document.getElementById('zonas-de-mensajes');
const ingresoOpciones = document.getElementById('ingreso-de-mensajes') || document.getElementById('ingresos-de-opciones');

// Cargar el proyecto al iniciar
document.addEventListener('DOMContentLoaded', () => {
    cargarArbolDecision();
});

// Función para obtener el JSON de conversación local
function cargarArbolDecision() {
    fetch('arbol_decision.json')
        .then(response => {
            if (!response.ok) {
                throw new Error('No se pudo acceder al archivo JSON');
            }
            return response.json();
        })
        .then(data => {
            arbolDecision = data;
            irANodo('inicio');
        })
        .catch(error => {
            console.error('Error al cargar arbol_decision.json:', error);
            mostrarErrorServidor('Abrí el proyecto con Live Server o un servidor local para que pueda leer arbol_decision.json.');
        });
}

// Muestra mensajes de advertencia o errores en el chat
function mostrarErrorServidor(mensaje) {
    if (!zonaMensajes) return;
    
    const msjError = document.createElement('div');
    msjError.className = 'mensaje bot';
    msjError.style.backgroundColor = '#ef4444';
    msjError.style.color = '#ffffff';
    msjError.style.fontWeight = 'bold';
    msjError.textContent = mensaje;
    
    zonaMensajes.appendChild(msjError);
    zonaMensajes.scrollTop = zonaMensajes.scrollHeight;
}

// Navegación principal del árbol de decisiones
function irANodo(idNodo) {
    const nodo = arbolDecision[idNodo];
    if (!nodo) {
        console.error('Nodo no encontrado:', idNodo);
        return;
    }

    // Agregar el mensaje emitido por el bot
    agregarMensajeBot(nodo.texto);

    // Limpiar el área de ingreso de opciones
    if (ingresoOpciones) {
        ingresoOpciones.innerHTML = '';
    }

    // Renderizar inputs o botones según la configuración del nodo
    if (nodo.requiereInput) {
        renderizarFormularioInput(nodo);
    } else if (nodo.opciones && nodo.opciones.length > 0) {
        nodo.opciones.forEach(opcion => {
            const boton = document.createElement('button');
            boton.className = 'opcion-btn';
            
            if (opcion.siguiente === 'fin' || opcion.texto.toLowerCase().includes('terminar')) {
                boton.classList.add('salir');
            }

            boton.textContent = opcion.texto;
            boton.addEventListener('click', () => {
                agregarMensajeUsuario(opcion.texto);
                historialRespuestas.push({ nodo: idNodo, seleccion: opcion.texto });
                
                // Si el nodo incluye comunicación externa por Webhook/API
                if (opcion.enviarAWebhook) {
                    enviarMensajeAWebhook(opcion.texto, opcion.siguiente);
                } else {
                    irANodo(opcion.siguiente);
                }
            });
            ingresoOpciones.appendChild(boton);
        });
    }
}

// Agrega un mensaje del bot al chat con autoscroll
function agregarMensajeBot(texto) {
    if (!zonaMensajes) return;
    const msj = document.createElement('div');
    msj.className = 'mensaje bot';
    msj.textContent = texto;
    zonaMensajes.appendChild(msj);
    zonaMensajes.scrollTop = zonaMensajes.scrollHeight;
}

// Agrega la interacción del usuario al chat
function agregarMensajeUsuario(texto) {
    if (!zonaMensajes) return;
    const msj = document.createElement('div');
    msj.className = 'mensaje usuario';
    msj.textContent = texto;
    zonaMensajes.appendChild(msj);
    zonaMensajes.scrollTop = zonaMensajes.scrollHeight;
}

// Formulario para ingreso de datos (<input>) con validación
function renderizarFormularioInput(nodo) {
    if (!ingresoOpciones) return;

    const contenedor = document.createElement('div');
    contenedor.className = 'input-contenedor';
    contenedor.style.display = 'flex';
    contenedor.style.flexDirection = 'column';
    contenedor.style.gap = '6px';

    const form = document.createElement('form');
    form.className = 'input-fila';
    form.style.display = 'flex';
    form.style.gap = '8px';

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'input-datos';
    input.placeholder = nodo.placeholder || 'Escribí tu consulta...';

    const btnEnviar = document.createElement('button');
    btnEnviar.type = 'submit';
    btnEnviar.className = 'opcion-btn';
    btnEnviar.textContent = 'Enviar';

    const msjError = document.createElement('span');
    msjError.className = 'msj-error';
    msjError.style.color = '#ef4444';
    msjError.style.fontSize = '0.8rem';
    msjError.style.fontWeight = 'bold';

    form.appendChild(input);
    form.appendChild(btnEnviar);
    contenedor.appendChild(form);
    contenedor.appendChild(msjError);

    form.addEventListener('submit', (e) => {
        e.preventDefault();
        const valor = input.value.trim();

        // Validaciones de formato
        if (nodo.tipoValidacion === 'texto') {
            if (!valor || /\d/.test(valor)) {
                msjError.textContent = '⚠️ Ingresá un texto válido (sin números).';
                return;
            }
        } else if (nodo.tipoValidacion === 'numero') {
            if (isNaN(valor) || valor === '') {
                msjError.textContent = '⚠️ Ingresá un valor numérico válido.';
                return;
            }
        } else if (!valor) {
            msjError.textContent = '⚠️ Por favor, ingresá una consulta.';
            return;
        }

        agregarMensajeUsuario(valor);
        historialRespuestas.push({ nodo: nodo.id, valorInput: valor });

        // Si el nodo requiere enviar datos a un Webhook/API externo
        if (nodo.urlWebhook) {
            enviarMensajeAWebhook(valor, nodo.siguiente, nodo.urlWebhook);
        } else {
            irANodo(nodo.siguiente);
        }
    });

    ingresoOpciones.appendChild(contenedor);
}

// Envío a Webhook solucionando el error 'Unexpected token A, "Accepted" is not valid JSON'
async function enviarMensajeAWebhook(mensajeTexto, siguienteNodo, urlApi) {
    const indicadorCarga = document.createElement('div');
    indicadorCarga.className = 'mensaje bot';
    indicadorCarga.textContent = 'El agente está pensando...';
    zonaMensajes.appendChild(indicadorCarga);
    zonaMensajes.scrollTop = zonaMensajes.scrollHeight;

    try {
        const response = await fetch(urlApi, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ mensaje: mensajeTexto })
        });

        // Removemos el mensaje de estado "pensando"
        indicadorCarga.remove();

        // Leemos la respuesta como texto primero para evitar el error al parsear "Accepted" directamente
        const textoRespuesta = await response.text();

        try {
            // Intentamos parsear como objeto JSON
            const data = JSON.parse(textoRespuesta);
            const respuestaBot = data.respuesta || data.texto || data.message || JSON.stringify(data);
            agregarMensajeBot(respuestaBot);
        } catch (errorJson) {
            // Si la respuesta fue "Accepted" en texto plano u otro formato no-JSON
            if (textoRespuesta.trim() === "Accepted") {
                agregarMensajeBot("¡Mensaje recibido! En Make (Integromat), asegurate de cambiar la respuesta del Webhook a Status 200 y devolver un objeto JSON válido.");
            } else if (textoRespuesta.trim() !== "") {
                agregarMensajeBot(textoRespuesta);
            } else {
                agregarMensajeBot("Respuesta recibida correctamente.");
            }
        }

        // Continuar al siguiente nodo si existe
        if (siguienteNodo && arbolDecision[siguienteNodo]) {
            irANodo(siguienteNodo);
        }

    } catch (error) {
        indicadorCarga.remove();
        console.error('Error al conectar con la API/Webhook:', error);
        mostrarErrorServidor('No se pudo conectar con el servidor o webhook.');
        
        if (siguienteNodo && arbolDecision[siguienteNodo]) {
            irANodo(siguienteNodo);
        }
    }
}
