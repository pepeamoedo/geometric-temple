/**
 * InputManager
 * 
 * Captura y normaliza eventos globales de puntero (ratón y gestos táctiles).
 * Proporciona coordenadas normalizadas en los rangos [0, 1] y [-1, 1], ideales
 * para ser enviadas como inputs a shaders o sintetizadores de audio.
 */
export class InputManager {
  constructor() {
    // Coordenadas normalizadas [0, 1] (0 en esquina superior izquierda, 1 en inferior derecha)
    this.x = 0.5;
    this.y = 0.5;

    // Coordenadas en espacio NDC [-1, 1] (0 en el centro del viewport)
    // El eje Y se invierte (1 en la parte superior, -1 en la inferior) para cuadrar con el espacio del viewport
    this.nx = 0.0;
    this.ny = 0.0;

    // Estado del clic/toque
    this.isPointerDown = false;

    // Conjunto de escuchas para eventos de click
    this.clickListeners = new Set();

    this.init();
  }

  init() {
    // Vincular contextos para evitar problemas con addEventListener
    this.onPointerMove = this.onPointerMove.bind(this);
    this.onPointerDown = this.onPointerDown.bind(this);
    this.onPointerUp = this.onPointerUp.bind(this);

    // Escuchadores del puntero globales
    window.addEventListener('pointermove', this.onPointerMove, { passive: true });
    window.addEventListener('pointerdown', this.onPointerDown, { passive: true });
    window.addEventListener('pointerup', this.onPointerUp, { passive: true });

    // Evitar comportamientos no deseados de scroll/zoom multitáctil en dispositivos móviles
    window.addEventListener('touchstart', (e) => {
      if (e.touches.length > 1) {
        e.preventDefault();
      }
    }, { passive: false });
  }

  /**
   * Procesa el movimiento y actualiza las coordenadas normalizadas.
   */
  onPointerMove(event) {
    const width = window.innerWidth;
    const height = window.innerHeight;

    // Rango [0, 1]
    this.x = Math.max(0, Math.min(1, event.clientX / width));
    this.y = Math.max(0, Math.min(1, event.clientY / height));

    // Rango [-1, 1] (Coordenadas de dispositivo normalizadas - NDC)
    this.nx = (this.x * 2.0) - 1.0;
    this.ny = 1.0 - (this.y * 2.0); // Y invertida
  }

  onPointerDown(event) {
    this.isPointerDown = true;
    this.onPointerMove(event);
  }

  onPointerUp(event) {
    this.isPointerDown = false;
    
    // Notificar a los escuchas de clics pasándoles el estado actual de coordenadas
    const coords = { x: this.x, y: this.y, nx: this.nx, ny: this.ny };
    this.clickListeners.forEach(listener => listener(coords));
  }

  /**
   * Permite suscribirse al evento de liberación del puntero (clic/toque completo).
   * Devuelve una función para des-suscribirse.
   * 
   * @param {Function} callback - Función que recibe {x, y, nx, ny}
   * @returns {Function} Función de cancelación de la suscripción
   */
  onClick(callback) {
    this.clickListeners.add(callback);
    return () => {
      this.clickListeners.delete(callback);
    };
  }

  /**
   * Limpia los manejadores de eventos globales para prevenir fugas de memoria.
   */
  destroy() {
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointerup', this.onPointerUp);
    this.clickListeners.clear();
  }
}
