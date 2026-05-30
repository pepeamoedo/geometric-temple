import { WebGPURenderer } from './engine/WebGPURenderer.js';
import { InputManager } from './engine/InputManager.js';
import { AudioSynth } from './audio/AudioSynth.js';
import { PhaseVoid } from './scene/PhaseVoid.js';
import { PhaseTemple } from './scene/PhaseTemple.js';
import { PhaseCore } from './scene/PhaseCore.js';
import { PhaseDunes } from './scene/PhaseDunes.js';
import { PhaseAscension } from './scene/PhaseAscension.js';
import { PhaseBlackHole } from './scene/PhaseBlackHole.js';
import { PhaseTesseract } from './scene/PhaseTesseract.js';

// ==========================================================================
// CONFIGURACIÓN DE ESTADOS COMPLETADOS DE LA EXPERIENCIA
// ==========================================================================
const STATE_VOID = 'STATE_VOID';     // Vacío inicial: Anomalía + 7 clics rituales
const STATE_FLASH = 'STATE_FLASH';   // Destello blanco de transición
const STATE_TEMPLE = 'STATE_TEMPLE'; // Templo 3D: Avance de cámara y dodecaedro rómbico estrellado
const STATE_CORE = 'STATE_CORE';     // Interior de la estrella: Catedral fractal caleidoscópica contemplativa
const STATE_DUNES = 'STATE_DUNES';   // Epílogo: Caminata meditativa en primera persona por dunas de arena
const STATE_ASCENSION = 'STATE_ASCENSION'; // Ascensión cósmica majestuosa desde el desierto a las estrellas
const STATE_BLACKHOLE = 'STATE_BLACKHOLE'; // Singularidad: Caída libre en el Agujero Negro Supermasivo
const STATE_TESSERACT = 'STATE_TESSERACT'; // Dimensión 4D: Laberinto infinito del teseracto

class AppController {
  constructor() {
    this.canvas = document.getElementById('gl-canvas');
    this.startBtn = document.getElementById('start-btn');
    this.introOverlay = document.getElementById('intro-overlay');

    // Inicialización de controladores clave
    this.input = new InputManager();
    this.synth = new AudioSynth();
    this.renderer = new WebGPURenderer(this.canvas);

    // Instanciar clases de escenas modulares
    this.sceneVoid = new PhaseVoid();
    this.sceneTemple = new PhaseTemple();
    this.sceneCore = new PhaseCore();
    this.sceneDunes = new PhaseDunes();
    this.sceneAscension = new PhaseAscension();
    this.sceneBlackHole = new PhaseBlackHole();
    this.sceneTesseract = new PhaseTesseract();
    
    // Máquina de estados
    this.currentState = STATE_VOID;
    this.stateTimer = 0;
    this.isStarted = false;

    // Intensidad del destello en STATE_FLASH
    this.flashIntensity = 0;
    this.corePreInitialized = false;
    this.dunesPreInitialized = false;
    this.blackHolePreInitialized = false;
    this.tesseractPreInitialized = false;

    // Elementos del Panel de Modulación de Sonido
    this.audioToggle = document.getElementById('audio-panel-toggle');
    this.audioPanel = document.getElementById('audio-modulation-panel');
    this.audioClose = document.getElementById('audio-panel-close');

    // Deslizadores
    this.sliderMaster = document.getElementById('slider-master-volume');
    this.sliderReverb = document.getElementById('slider-reverb-mix');
    this.sliderBass = document.getElementById('slider-bass-volume');
    this.sliderCore = document.getElementById('slider-core-volume');
    this.sliderWind = document.getElementById('slider-wind-volume');

    // Indicadores numéricos
    this.valMaster = document.getElementById('val-master-volume');
    this.valReverb = document.getElementById('val-reverb-mix');
    this.valBass = document.getElementById('val-bass-volume');
    this.valCore = document.getElementById('val-core-volume');
    this.valWind = document.getElementById('val-wind-volume');

    // Grupos de control para deshabilitar dinámicamente
    this.grpBass = document.getElementById('grp-bass-drone');
    this.grpCore = document.getElementById('grp-core-chords');
    this.grpWind = document.getElementById('grp-dunes-wind');

    this.initAudioPanel();
    this.init();
  }

  async init() {
    // Desbloquear contexto de audio mediante interacción del usuario (Autoplay bypass)
    this.startBtn.addEventListener('click', () => this.startExperience());
  }

  /**
   * Arranca la aplicación tras el gesto del usuario.
   */
  async startExperience() {
    if (this.isStarted) return;
    this.isStarted = true;

    // Activar pantalla completa tras la interacción de usuario (autoplay y gestos bypass)
    if (document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().catch((err) => {
        console.warn("No se pudo iniciar pantalla completa:", err);
      });
    } else if (document.documentElement.webkitRequestFullscreen) { /* Safari */
      document.documentElement.webkitRequestFullscreen();
    } else if (document.documentElement.msRequestFullscreen) { /* IE11 */
      document.documentElement.msRequestFullscreen();
    }

    try {
      // 1. Ocultar interfaz de bienvenida
      this.introOverlay.classList.add('fade-out');

      // 2. Iniciar el sintetizador de sonido
      await this.synth.start();

      // Hacer visible el botón de control de sonido flotante
      if (this.audioToggle) {
        this.audioToggle.classList.remove('hidden');
      }
      this.updateAudioPanelState(this.currentState);

      // 3. Inicializar el contexto gráfico WebGPU
      await this.renderer.init();

      // 4. Inicializar escena primordial
      await this.sceneVoid.init(this.renderer.device, this.renderer.format);

      // 5. Vincular el redimensionamiento dinámico
      this.renderer.resizeCallback = (width, height) => {
        if (this.currentState === STATE_VOID) {
          this.sceneVoid.resize(width, height);
        }
      };

      // 6. Suscribir escuchas de clics interactivos globales
      this.input.onClick((coords) => this.handleGlobalClick(coords));

      // 7. Lanzar el loop principal a 60/120fps
      this.renderer.startLoop((frameData) => this.tick(frameData));

      // 8. Atajos de teclado de desarrollo para depuración (Teclas 1, 2, 3, 4, 5, 6, 7, 8)
      window.addEventListener('keydown', (e) => {
        if (!this.isStarted) return;
        if (e.key === '1') this.transitionTo(STATE_VOID);
        if (e.key === '2') this.transitionTo(STATE_FLASH);
        if (e.key === '3') this.transitionTo(STATE_TEMPLE);
        if (e.key === '4') this.transitionTo(STATE_CORE);
        if (e.key === '5') this.transitionTo(STATE_DUNES);
        if (e.key === '6') this.transitionTo(STATE_ASCENSION);
        if (e.key === '7') this.transitionTo(STATE_BLACKHOLE);
        if (e.key === '8') this.transitionTo(STATE_TESSERACT);
      });

    } catch (error) {
      console.error("Error al arrancar Geometric Temple:", error);
      alert(error.message || "Error fatal de inicialización.");
    }
  }

  /**
   * Evento de clic global para añadir interactividad menor según estado.
   */
  handleGlobalClick(coords) {
    if (this.currentState === STATE_CORE) {
      // Modulación sonora de resonancia interactiva de adorno al hacer clic dentro de la estrella
      // Modula levemente el filtro principal
      this.synth.setFilterCutoff(3000 + coords.x * 2000, 0.1);
    }
  }

  /**
   * Cambia el estado orquestando los lifecycles de inicialización y destrucción
   * de recursos GPU para garantizar la máxima optimización de memoria.
   */
  async transitionTo(nextState) {
    console.log(`[STATE] Transición: ${this.currentState} -> ${nextState}`);
    
    const previousState = this.currentState;
    this.currentState = nextState;
    this.stateTimer = 0;

    // Actualizar estados del panel de modulación de audio
    this.updateAudioPanelState(nextState);

    // --- ACCIONES DE SALIDA ---
    // Destruimos la escena anterior de forma segura SOLO cuando la GPU ha terminado
    // de procesar todos los comandos enviados a la cola que hacen uso de sus buffers.
    if (previousState === STATE_VOID) {
      const scene = this.sceneVoid;
      this.renderer.device.queue.onSubmittedWorkDone().then(() => {
        scene.destroy();
      });
    } 
    else if (previousState === STATE_TEMPLE) {
      const scene = this.sceneTemple;
      this.renderer.device.queue.onSubmittedWorkDone().then(() => {
        scene.destroy();
      });
      // Ocultar prompt de forma segura al salir de PhaseTemple
      const prompt = document.getElementById('temple-prompt');
      if (prompt) {
        prompt.classList.remove('show');
      }
    }
    else if (previousState === STATE_CORE) {
      const scene = this.sceneCore;
      this.renderer.device.queue.onSubmittedWorkDone().then(() => {
        scene.destroy();
      });
    }
    else if (previousState === STATE_DUNES) {
      const scene = this.sceneDunes;
      this.renderer.device.queue.onSubmittedWorkDone().then(() => {
        scene.destroy();
      });
    }
    else if (previousState === STATE_ASCENSION) {
      const scene = this.sceneAscension;
      this.renderer.device.queue.onSubmittedWorkDone().then(() => {
        scene.destroy();
      });
    }
    else if (previousState === STATE_BLACKHOLE) {
      const scene = this.sceneBlackHole;
      this.renderer.device.queue.onSubmittedWorkDone().then(() => {
        scene.destroy();
      });
    }
    else if (previousState === STATE_TESSERACT) {
      const scene = this.sceneTesseract;
      this.renderer.device.queue.onSubmittedWorkDone().then(() => {
        scene.destroy();
      });
    }

    // --- ACCIONES DE ENTRADA ---
    if (nextState === STATE_FLASH) {
      this.flashIntensity = 1.0;
      
      // Impacto acústico envolvente de baja frecuencia con gran reverberación (portal cósmico)
      this.synth.setFrequency(55.0, 2.5); // Descenso ultra lento y profundo a 55Hz
      this.synth.setFilterCutoff(480.0, 2.0); // Filtro cerrado para un retumbar cálido
      this.synth.setVolume(0.40, 0.1); // Subida de volumen inmersiva

      // Pre-inicializar la escena del templo en segundo plano (asíncrono)
      this.sceneTemple.init(this.renderer.device, this.renderer.format);
    } 
    else if (nextState === STATE_TEMPLE) {
      // Asegurar que la inicialización ha terminado
      if (!this.sceneTemple.pipeline) {
        await this.sceneTemple.init(this.renderer.device, this.renderer.format);
      }

      // Re-vincular redimensionamiento dinámico
      this.renderer.resizeCallback = (width, height) => {
        if (this.currentState === STATE_TEMPLE) {
          this.sceneTemple.resize(width, height);
        }
      };
      this.sceneTemple.resize(window.innerWidth, window.innerHeight);

      // Mostrar y configurar prompt interactivo del HUD
      const prompt = document.getElementById('temple-prompt');
      if (prompt) {
        prompt.classList.add('show');
        prompt.classList.remove('pressing');
        prompt.innerText = "MANTÉN PULSADO EL TEMPLO PARA AVANZAR";
      }

      // Resetear volumen y tono base para la caminata
      this.synth.setFrequency(220.0, 0.5);
      this.synth.setFilterCutoff(1200.0, 0.5);
      this.synth.setVolume(0.18, 0.5);

      // Reproducir la voz susurrada "acércate" con un leve retardo para dar ambiente
      setTimeout(() => {
        if (this.currentState === STATE_TEMPLE) {
          this.synth.playVoice(0.85);
        }
      }, 1000);
    } 
    else if (nextState === STATE_CORE) {
      // Asegurar que la inicialización de la catedral fractal ha terminado
      if (!this.sceneCore.pipeline) {
        await this.sceneCore.init(this.renderer.device, this.renderer.format);
      }

      // Re-vincular redimensionamiento
      this.renderer.resizeCallback = (width, height) => {
        if (this.currentState === STATE_CORE) {
          this.sceneCore.resize(width, height);
        }
      };
      this.sceneCore.resize(window.innerWidth, window.innerHeight);
    }
    else if (nextState === STATE_DUNES) {
      // Asegurar que la inicialización del desierto de dunas ha terminado
      if (!this.sceneDunes.pipeline) {
        await this.sceneDunes.init(this.renderer.device, this.renderer.format);
      }

      // Re-vincular redimensionamiento
      this.renderer.resizeCallback = (width, height) => {
        if (this.currentState === STATE_DUNES) {
          this.sceneDunes.resize(width, height);
        }
      };
      this.sceneDunes.resize(window.innerWidth, window.innerHeight);
    }
    else if (nextState === STATE_ASCENSION) {
      // Asegurar que la inicialización de la ascensión ha terminado
      if (!this.sceneAscension.pipeline) {
        await this.sceneAscension.init(this.renderer.device, this.renderer.format);
      }

      // Re-vincular redimensionamiento
      this.renderer.resizeCallback = (width, height) => {
        if (this.currentState === STATE_ASCENSION) {
          this.sceneAscension.resize(width, height);
        }
      };
      this.sceneAscension.resize(window.innerWidth, window.innerHeight);
    }
    else if (nextState === STATE_BLACKHOLE) {
      // Asegurar que la inicialización del agujero negro ha terminado
      if (!this.sceneBlackHole.pipeline) {
        await this.sceneBlackHole.init(this.renderer.device, this.renderer.format);
      }

      // Re-vincular redimensionamiento
      this.renderer.resizeCallback = (width, height) => {
        if (this.currentState === STATE_BLACKHOLE) {
          this.sceneBlackHole.resize(width, height);
        }
      };
      this.sceneBlackHole.resize(window.innerWidth, window.innerHeight);
    }
    else if (nextState === STATE_TESSERACT) {
      // Asegurar que la inicialización del Teseracto ha terminado
      if (!this.sceneTesseract.pipeline) {
        await this.sceneTesseract.init(this.renderer.device, this.renderer.format);
      }

      // Re-vincular redimensionamiento
      this.renderer.resizeCallback = (width, height) => {
        if (this.currentState === STATE_TESSERACT) {
          this.sceneTesseract.resize(width, height);
        }
      };
      this.sceneTesseract.resize(window.innerWidth, window.innerHeight);
    }
  }

  /**
   * Bucle tick ejecutado en requestAnimationFrame.
   */
  tick(frameData) {
    const { device, view, elapsedTime, deltaTime } = frameData;

    // Actualizar temporizadores
    this.stateTimer += deltaTime;

    // Lógica secundaria de interpolación
    this.updateStateLogic(deltaTime);

    // Crear codificador de comandos de dibujado
    const commandEncoder = device.createCommandEncoder({ label: "App Main Command Encoder" });

    // Delegación y actualización de escenas modulares
    if (this.currentState === STATE_VOID) {
      const completed = this.sceneVoid.update(deltaTime, this.input, this.synth);
      this.sceneVoid.render(device, view, commandEncoder, frameData);

      if (completed) {
        this.transitionTo(STATE_FLASH);
      }
    } 
    else if (this.currentState === STATE_FLASH) {
      // Destello blanco nativo manipulando rasterizador
      const val = Math.max(0.0, this.flashIntensity);
      const renderPassDescriptor = {
        colorAttachments: [
          {
            view: view,
            clearValue: { r: val, g: val, b: val, a: 1.0 },
            loadOp: 'clear',
            storeOp: 'store'
          }
        ]
      };
      const pass = commandEncoder.beginRenderPass(renderPassDescriptor);
      pass.end();
    } 
    else if (this.currentState === STATE_TEMPLE) {
      const completed = this.sceneTemple.update(deltaTime, this.input, this.synth);
      this.sceneTemple.render(device, view, commandEncoder, frameData);

      // Pre-inicializar la escena Core de manera asíncrona tan pronto como se detecta la colisión
      if (this.sceneTemple.isCollided && !this.corePreInitialized) {
        this.corePreInitialized = true;
        this.sceneCore.init(device, this.renderer.format);
      }

      if (completed) {
        // Al colisionar e inundarse la pantalla en blanco, entramos al núcleo interior
        this.transitionTo(STATE_CORE);
      }
    } 
    else if (this.currentState === STATE_CORE) {
      // Escena contemplativa final caleidoscópica
      const completed = this.sceneCore.update(deltaTime, this.input, this.synth);
      this.sceneCore.render(device, view, commandEncoder, frameData);

      // Pre-inicializar la escena Dunes de manera asíncrona tan pronto como se resuelve el puzzle
      if (this.sceneCore.puzzleSolved && !this.dunesPreInitialized) {
        this.dunesPreInitialized = true;
        this.sceneDunes.init(device, this.renderer.format);
      }

      if (completed) {
        this.transitionTo(STATE_DUNES);
      }
    }
    else if (this.currentState === STATE_DUNES) {
      // Epílogo del desierto y dunas
      const completed = this.sceneDunes.update(deltaTime, this.input, this.synth);
      this.sceneDunes.render(device, view, commandEncoder, frameData);

      if (completed) {
        this.transitionTo(STATE_ASCENSION);
      }
    }
    else if (this.currentState === STATE_ASCENSION) {
      // Clímax final de la ascensión espacial
      const completed = this.sceneAscension.update(deltaTime, this.input, this.synth);
      this.sceneAscension.render(device, view, commandEncoder, frameData);

      // Pre-inicializar la escena del Agujero Negro de forma asíncrona a mitad del ascenso
      if (this.sceneAscension.ascensionTime > 4.0 && !this.blackHolePreInitialized) {
        this.blackHolePreInitialized = true;
        this.sceneBlackHole.init(device, this.renderer.format);
      }

      if (completed) {
        this.transitionTo(STATE_BLACKHOLE);
      }
    }
    else if (this.currentState === STATE_BLACKHOLE) {
      // Caída en la singularidad del Agujero Negro Supermasivo
      const completed = this.sceneBlackHole.update(deltaTime, this.input, this.synth);
      this.sceneBlackHole.render(device, view, commandEncoder, frameData);

      // Pre-inicializar la escena del Teseracto de forma asíncrona a mitad de la caída
      if (this.sceneBlackHole.bhTime > 6.0 && !this.tesseractPreInitialized) {
        this.tesseractPreInitialized = true;
        this.sceneTesseract.init(device, this.renderer.format);
      }

      if (completed) {
        this.transitionTo(STATE_TESSERACT);
      }
    }
    else if (this.currentState === STATE_TESSERACT) {
      // Dimensión 4D: Laberinto infinito del teseracto
      this.sceneTesseract.update(deltaTime, this.input, this.synth);
      this.sceneTesseract.render(device, view, commandEncoder, frameData);
    }

    // Enviar a la cola de la GPU
    device.queue.submit([commandEncoder.finish()]);
  }

  /**
   * Lógica pasiva complementaria para transiciones automáticas temporizadas.
   */
  updateStateLogic(deltaTime) {
    if (this.currentState === STATE_FLASH) {
      // Decaimiento lineal del destello
      this.flashIntensity -= deltaTime * 0.85;

      // Al acabar el destello (1.2s), pasamos de forma asíncrona al templo
      if (this.stateTimer >= 1.2) {
        this.transitionTo(STATE_TEMPLE);
      }
    }
  }

  /**
   * Inicializa las escuchas y comportamientos del panel de modulación de audio.
   */
  initAudioPanel() {
    if (this.audioToggle) {
      this.audioToggle.addEventListener('click', () => {
        this.audioPanel.classList.toggle('hidden');
      });
    }

    if (this.audioClose) {
      this.audioClose.addEventListener('click', () => {
        this.audioPanel.classList.add('hidden');
      });
    }

    if (this.sliderMaster) {
      this.sliderMaster.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        if (this.valMaster) this.valMaster.innerText = `${val}%`;
        this.synth.setUserVolume(val / 100);
      });
    }

    if (this.sliderReverb) {
      this.sliderReverb.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        if (this.valReverb) this.valReverb.innerText = `${val}%`;
        if (this.synth.reverbGain && this.synth.ctx) {
          const t = this.synth.ctx.currentTime;
          this.synth.reverbGain.gain.setValueAtTime(val / 100, t);
        }
      });
    }

    if (this.sliderBass) {
      this.sliderBass.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        if (this.valBass) this.valBass.innerText = `${val}%`;
        if (this.synth.baseGain && this.synth.ctx) {
          const t = this.synth.ctx.currentTime;
          this.synth.baseGain.gain.setValueAtTime(val / 100, t);
        }
      });
    }

    if (this.sliderCore) {
      this.sliderCore.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        if (this.valCore) this.valCore.innerText = `${val}%`;
        if (this.synth.coreSubGain && this.synth.ctx) {
          const t = this.synth.ctx.currentTime;
          this.synth.coreSubGain.gain.setValueAtTime(val / 100, t);
        }
      });
    }

    if (this.sliderWind) {
      this.sliderWind.addEventListener('input', (e) => {
        const val = parseFloat(e.target.value);
        if (this.valWind) this.valWind.innerText = `${val}%`;
        if (this.synth.windSubGain && this.synth.ctx) {
          const t = this.synth.ctx.currentTime;
          this.synth.windSubGain.gain.setValueAtTime(val / 100, t);
        }
      });
    }
  }

  /**
   * Habilita/deshabilita dinámicamente los grupos de control de volumen
   * de efectos basándose en la fase activa del viaje.
   */
  updateAudioPanelState(state) {
    let enableBass = false;
    let enableCore = false;
    let enableWind = false;

    if (state === STATE_VOID || state === STATE_FLASH || state === STATE_TEMPLE) {
      enableBass = true;
    } else if (state === STATE_CORE || state === STATE_ASCENSION) {
      enableCore = true;
    } else if (state === STATE_DUNES) {
      enableWind = true;
    }

    const setGroupState = (group, slider, enabled) => {
      if (group) {
        if (enabled) {
          group.classList.remove('disabled');
        } else {
          group.classList.add('disabled');
        }
      }
      if (slider) {
        slider.disabled = !enabled;
      }
    };

    setGroupState(this.grpBass, this.sliderBass, enableBass);
    setGroupState(this.grpCore, this.sliderCore, enableCore);
    setGroupState(this.grpWind, this.sliderWind, enableWind);
  }
}

// Inicializar al cargar el documento
window.addEventListener('DOMContentLoaded', () => {
  new AppController();
});
