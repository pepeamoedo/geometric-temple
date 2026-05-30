/**
 * WebGPURenderer
 * 
 * Clase base responsable de negociar con la GPU (Adapter, Device),
 * configurar el contexto gráfico del Canvas en formato óptimo, regular el
 * Render Loop de alta precisión y gestionar redimensionados para pantallas Retina.
 */
export class WebGPURenderer {
  constructor(canvas) {
    this.canvas = canvas;
    this.adapter = null;
    this.device = null;
    this.context = null;
    this.format = null;

    // Variables de control de tiempo
    this.startTime = 0;
    this.lastTime = 0;
    this.elapsedTime = 0;
    this.deltaTime = 0;

    // Callbacks externas para escenas y lógica del juego
    this.renderCallback = null;
    this.resizeCallback = null;

    this.isInitialized = false;
  }

  /**
   * Inicializa la API WebGPU y configura el Canvas.
   * Lanza excepciones detalladas en caso de incompatibilidad del navegador o hardware.
   */
  async init() {
    // Validar compatibilidad de WebGPU en el navegador del usuario
    if (!navigator.gpu) {
      throw new Error(
        "WebGPU no está disponible en este navegador. " +
        "Por favor, utiliza una versión moderna de Chrome (113+), Edge (113+) o Safari (18+)."
      );
    }

    // 1. Solicitar el adaptador físico (GPU)
    // Pedimos rendimiento alto ('high-performance') para forzar la GPU dedicada si existe
    this.adapter = await navigator.gpu.requestAdapter({
      powerPreference: 'high-performance'
    });

    if (!this.adapter) {
      throw new Error("No se ha podido encontrar un adaptador de GPU disponible en tu sistema.");
    }

    // 2. Solicitar el dispositivo lógico
    // Este objeto representa la conexión con la que realizaremos la carga de shaders, buffers y pipelines
    this.device = await this.adapter.requestDevice();

    // 3. Obtener y configurar el contexto WebGPU del canvas
    this.context = this.canvas.getContext('webgpu');
    
    // Obtener el formato de textura preferido para la pantalla del usuario (comúnmente 'bgra8unorm')
    this.format = navigator.gpu.getPreferredCanvasFormat();

    // Configurar los parámetros del contexto
    this.context.configure({
      device: this.device,
      format: this.format,
      alphaMode: 'opaque', // Opaco para máximo rendimiento (no mezcla canales alfa con la página detrás)
    });

    // 4. Forzar el primer redimensionado e instalar el observador dinámico
    this.resize();
    window.addEventListener('resize', () => this.resize());

    this.isInitialized = true;
    console.log(`WebGPU inicializado correctamente. Formato de textura: ${this.format}`);
  }

  /**
   * Modifica el tamaño interno del Canvas para evitar borrosidad en pantallas de alta densidad (DPI/Retina).
   */
  resize() {
    // Limitamos el factor de escala a 2.0x por motivos de rendimiento
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const width = Math.floor(window.innerWidth * dpr);
    const height = Math.floor(window.innerHeight * dpr);

    // Evitamos reconfigurar la GPU si las dimensiones no han variado
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;

      // Reconfigurar el canvas con el nuevo ratio de píxeles asignados
      if (this.context && this.device) {
        this.context.configure({
          device: this.device,
          format: this.format,
          alphaMode: 'opaque',
        });
      }

      // Notificar a la escena externa del cambio
      if (this.resizeCallback) {
        this.resizeCallback(width, height);
      }
    }
  }

  /**
   * Inicia el requestAnimationFrame de alta precisión y vincula el bucle de dibujado.
   * 
   * @param {Function} renderCallback - Callback que se ejecuta en cada ciclo: (frameData) => {}
   */
  startLoop(renderCallback) {
    this.renderCallback = renderCallback;
    this.startTime = performance.now();
    this.lastTime = this.startTime;

    const tick = (now) => {
      if (!this.isInitialized) return;

      // Medidas de tiempo en segundos
      this.elapsedTime = (now - this.startTime) * 0.001;
      this.deltaTime = (now - this.lastTime) * 0.001;
      this.lastTime = now;

      // Limitar pico de Delta Time para evitar inestabilidad si el navegador entra en segundo plano
      if (this.deltaTime > 0.1) {
        this.deltaTime = 0.1;
      }

      // Ejecutar la rutina de renderizado del fotograma
      this.render();

      requestAnimationFrame(tick);
    };

    requestAnimationFrame(tick);
  }

  /**
   * Captura la textura activa de la GPU y despacha la orden de dibujado a la callback.
   */
  render() {
    // Obtener la textura activa donde la GPU va a proyectar este fotograma
    const currentTexture = this.context.getCurrentTexture();
    
    // Crear el TextureView requerido por el RenderPassEncoder
    const view = currentTexture.createView();

    // Invocar callback de dibujado externo inyectando todas las dependencias
    if (this.renderCallback) {
      this.renderCallback({
        device: this.device,
        view: view,
        format: this.format,
        elapsedTime: this.elapsedTime,
        deltaTime: this.deltaTime,
        width: this.canvas.width,
        height: this.canvas.height
      });
    }
  }
}
