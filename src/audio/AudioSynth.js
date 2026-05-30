import acercateVoiceUrl from '../../assets/audio/acercate.m4a';

/**
 * AudioSynth
 * 
 * Clase base que gestiona el contexto de audio y la síntesis de sonido interactiva.
 * Se ha expandido para soportar síntesis polifónica espacial (Space Chords) con
 * múltiples osciladores en paralelo, filtros de resonancia cristalina y nodos de
 * panoramización estéreo dinámica (StereoPannerNodes) para el clímax tridimensional.
 */
export class AudioSynth {
  constructor() {
    this.ctx = null;
    this.osc = null;
    this.filter = null;
    this.masterGain = null;
    this.userMasterGain = null;
    
    // Variables para la síntesis de acordes espaciales (STATE_CORE)
    this.coreOscs = [];
    this.corePanners = [];
    this.coreGains = [];
    this.isCoreActive = false;

    // Variables para la escena de dunas (viento procedimental)
    this.dunesOscs = [];
    this.dunesGains = [];
    this.dunesFilters = [];

    // Variables para el latido del corazón y tensión procedimental
    this.heartBPM = 40.0;
    this.tension = 0.0;
    this.nextBeatTime = 0.0;
    this.schedulerTimerId = null;
    this.lfo = null;
    this.lfoGain = null;

    // Variables para la precarga y reproducción de la voz "acércate"
    this.acercateBuffer = null;
    this.isVoiceLoading = false;

    // Nodos de Reverb Convolucional procedimental
    this.reverbNode = null;
    this.reverbGain = null;

    // Nodos de Ganancia para modulación externa de volumen por phase/efecto
    this.baseGain = null;
    this.coreSubGain = null;
    this.windSubGain = null;

    // Variables para la fase del agujero negro (STATE_BLACKHOLE)
    this.blackHoleBass = null;
    this.blackHoleLFO = null;
    this.blackHoleLFOGain = null;
    this.blackHoleBassGain = null;
    this.blackHoleNoise = null;
    this.blackHoleFilter = null;
    this.blackHoleSweepLFO = null;
    this.blackHoleSweepGain = null;
    this.blackHoleNoiseGain = null;
    this.blackHolePanner = null;
    this.blackHolePanLFO = null;
    this.blackHolePanGain = null;

    this.isInitialized = false;
    this.isPlaying = false;
  }

  /**
   * Inicializa el motor de audio y arranca el oscilador ambiente básico.
   */
  async start() {
    if (this.isInitialized) {
      if (this.ctx.state === 'suspended') {
        await this.ctx.resume();
        this.isPlaying = true;
        this.setVolume(0.15, 1.0);
        this.startScheduler();
        this.loadVoice();
      }
      return;
    }

    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AudioContextClass();
    
    this.userMasterGain = this.ctx.createGain();
    this.userMasterGain.gain.setValueAtTime(0.42, this.ctx.currentTime); // 42% initial user master volume
    this.userMasterGain.connect(this.ctx.destination);
    
    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.setValueAtTime(0, this.ctx.currentTime);
    
    this.filter = this.ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.setValueAtTime(600, this.ctx.currentTime);
    this.filter.Q.setValueAtTime(2.0, this.ctx.currentTime);
    
    this.osc = this.ctx.createOscillator();
    this.osc.type = 'triangle';
    this.osc.frequency.setValueAtTime(110, this.ctx.currentTime);

    this.baseGain = this.ctx.createGain();
    this.baseGain.gain.setValueAtTime(0.15, this.ctx.currentTime); // 15% default base drone volume
    this.osc.connect(this.baseGain);
    this.baseGain.connect(this.filter);
    
    // Crear e inicializar Reverb Convolucional procedimental de alta densidad
    this.reverbNode = this.ctx.createConvolver();
    this.reverbNode.buffer = this.createReverbImpulseResponse(2.5, 2.5); // 2.5 segundos de cola
    
    this.reverbGain = this.ctx.createGain();
    this.reverbGain.gain.setValueAtTime(0.45, this.ctx.currentTime); // Mezcla wet de reverb al 45%
    
    // Ruta en paralelo de Reverb Convolucional
    this.filter.connect(this.masterGain); // dry path
    this.filter.connect(this.reverbNode); // wet path
    this.reverbNode.connect(this.reverbGain);
    this.reverbGain.connect(this.masterGain);
    
    this.masterGain.connect(this.userMasterGain);
    
    this.osc.start(0);
    
    // Inicializar LFO de respiración procedimental en el filtro
    this.lfo = this.ctx.createOscillator();
    this.lfo.type = 'sine';
    this.lfo.frequency.setValueAtTime(0.15, this.ctx.currentTime); // Respiración lenta inicial (0.15Hz)
    
    this.lfoGain = this.ctx.createGain();
    this.lfoGain.gain.setValueAtTime(250.0, this.ctx.currentTime); // Oscilación de +-250Hz en la frecuencia
    
    this.lfo.connect(this.lfoGain);
    this.lfoGain.connect(this.filter.frequency);
    this.lfo.start(0);
    
    const t = this.ctx.currentTime;
    this.masterGain.gain.linearRampToValueAtTime(0.15, t + 1.8);
    
    this.isInitialized = true;
    this.isPlaying = true;

    // Arrancar secuenciador temporal del latido
    this.startScheduler();

    // Precargar la voz del susurro "acércate"
    this.loadVoice();

    console.log('AudioSynth: Contexto de audio iniciado.');
  }

  /**
   * Cambia la frecuencia del oscilador monofónico.
   */
  setFrequency(freq, rampTime = 0.15) {
    if (!this.isInitialized || !this.isPlaying || this.isCoreActive) return;
    
    const targetFreq = Math.max(20, Math.min(20000, freq));
    const t = this.ctx.currentTime;
    
    this.osc.frequency.cancelScheduledValues(t);
    this.osc.frequency.setValueAtTime(this.osc.frequency.value, t);
    this.osc.frequency.exponentialRampToValueAtTime(targetFreq, t + rampTime);
  }

  /**
   * Ajusta el corte del filtro de paso bajo.
   */
  setFilterCutoff(freq, rampTime = 0.15) {
    if (!this.isInitialized || !this.isPlaying) return;
    
    const targetFreq = Math.max(40, Math.min(20000, freq));
    const t = this.ctx.currentTime;
    
    this.filter.frequency.cancelScheduledValues(t);
    this.filter.frequency.setValueAtTime(this.filter.frequency.value, t);
    this.filter.frequency.exponentialRampToValueAtTime(targetFreq, t + rampTime);
  }

  /**
   * Ajusta el volumen maestro general.
   */
  setVolume(volume, rampTime = 0.15) {
    if (!this.isInitialized) return;
    
    const targetVol = Math.max(0.0, Math.min(1.0, volume));
    const t = this.ctx.currentTime;
    
    this.masterGain.gain.cancelScheduledValues(t);
    this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, t);
    this.masterGain.gain.linearRampToValueAtTime(targetVol, t + rampTime);
  }

  /**
   * Ajusta el volumen maestro manual del usuario.
   */
  setUserVolume(volume, rampTime = 0.02) {
    if (!this.isInitialized || !this.userMasterGain) return;
    
    const targetVol = Math.max(0.0, Math.min(1.0, volume));
    const t = this.ctx.currentTime;
    
    this.userMasterGain.gain.cancelScheduledValues(t);
    this.userMasterGain.gain.setValueAtTime(this.userMasterGain.gain.value, t);
    this.userMasterGain.gain.linearRampToValueAtTime(targetVol, t + rampTime);
  }

  /**
   * ==========================================================================
   * SÍNTESIS POLIFÓNICA ESPACIAL: STATE_CORE (CLÍMAX)
   * ==========================================================================
   */

  /**
   * Detiene el oscilador monofónico y crea un acorde de Séptima Mayor celestial,
   * cristalino e inmersivo en estéreo giratorio de 4 voces en paralelo.
   * 
   * @param {number} baseFreq - Frecuencia fundamental (ej. 220Hz - La3)
   */
  startCoreResonance(baseFreq = 220.0) {
    if (!this.isInitialized || this.isCoreActive) return;
    
    console.log("AudioSynth: Transmutando a resonancia polifónica estéreo (Core Chords).");
    this.isCoreActive = true;

    // Detener secuenciador de latidos y LFO de respiración para el clímax puro
    if (this.schedulerTimerId) {
      clearInterval(this.schedulerTimerId);
      this.schedulerTimerId = null;
    }
    if (this.lfo) {
      try { this.lfo.stop(); } catch (e) {}
      this.lfo.disconnect();
      this.lfo = null;
    }
    if (this.lfoGain) {
      this.lfoGain.disconnect();
      this.lfoGain = null;
    }

    const t = this.ctx.currentTime;

    // 1. Detener y desconectar de forma ultra suave el oscilador base monofónico
    if (this.osc) {
      try {
        this.osc.stop(t + 0.2);
        // Desconexión diferida para evitar clicks
        setTimeout(() => {
          if (this.osc) {
            this.osc.disconnect();
            this.osc = null;
          }
        }, 300);
      } catch (e) {
        // En caso de que ya se hubiese detenido
      }
    }

    // 2. Definir las proporciones armónicas de un acorde de Séptima Mayor puro (Solfeggio-friendly)
    // 1.0 (Tónica), 1.25 (Tercera mayor), 1.5 (Quinta justa), 1.875 (Séptima mayor)
    const intervals = [1.0, 1.25, 1.5, 1.875];
    
    // Configurar el filtro principal a modo Highpass (Pasa-Altos) cristalino o Lowpass abierto
    this.filter.type = 'lowpass';
    this.filter.frequency.setValueAtTime(4500.0, t); // Filtro muy abierto para armónicos cristalinos
    this.filter.Q.setValueAtTime(1.0, t);

    // Inicializar sub-gain de acordes catedral para modulación externa
    if (!this.coreSubGain) {
      this.coreSubGain = this.ctx.createGain();
      const sliderVal = document.getElementById('slider-core-volume') ? parseFloat(document.getElementById('slider-core-volume').value) / 100 : 0.20;
      this.coreSubGain.gain.setValueAtTime(sliderVal, t); // Lee del deslizador o usa el valor por defecto
      this.coreSubGain.connect(this.filter);
    }

    // 3. Crear 4 voces de osciladores y panoramizadores en paralelo
    this.coreOscs = [];
    this.corePanners = [];
    this.coreGains = [];

    intervals.forEach((multiplier, index) => {
      // Oscilador de onda senoidal pura (Crystalline Sine Wave)
      const osc = this.ctx.createOscillator();
      osc.type = 'sine'; 
      osc.frequency.setValueAtTime(baseFreq * multiplier, t);

      // Nodo de Ganancia por voz (para balancear el acorde)
      const voiceGain = this.ctx.createGain();
      voiceGain.gain.setValueAtTime(0, t); // Inicialmente mudo

      // Nodo de Panoramización Estéreo para el movimiento espacial de la voz
      const panner = this.ctx.createStereoPanner();
      panner.pan.setValueAtTime(0, t);

      // Conexiones: Oscilador -> Ganancia de voz -> Panoramizador -> Sub-Gain Catedral
      osc.connect(voiceGain);
      voiceGain.connect(panner);
      panner.connect(this.coreSubGain);

      // Arrancar voz
      osc.start(0);

      // Guardar referencias
      this.coreOscs.push(osc);
      this.corePanners.push(panner);
      this.coreGains.push(voiceGain);

      // Rampa de volumen suave para cada voz del acorde
      voiceGain.gain.linearRampToValueAtTime(0.40, t + 2.0); // escalado por coreSubGain (0.40 * 0.20 = 0.08)
    });

    // Subir volumen maestro a volumen envolvente místico
    this.masterGain.gain.linearRampToValueAtTime(0.25, t + 1.5);
  }

  /**
   * Actualiza el paneo estéreo giratorio de las 4 voces basándose en el reloj del motor gráfico.
   * Crea una sensación acústica tridimensional de órbita y rotación alrededor del usuario.
   */
  updateCorePanners(elapsedTime) {
    if (!this.isInitialized || !this.isCoreActive || this.corePanners.length < 4) return;

    const t = this.ctx.currentTime;
    
    // Frecuencias y desfases angulares distintos para cada voz
    const panVals = [
      Math.sin(elapsedTime * 0.35),               // Voz 1 (Tónica): Pandeo senoidal lento
      Math.cos(elapsedTime * 0.28),               // Voz 2 (Tercera): Coseno para ortogonalidad espacial
      -Math.sin(elapsedTime * 0.42 + Math.PI/4),  // Voz 3 (Quinta): Desfase angular
      -Math.cos(elapsedTime * 0.30 - Math.PI/3)   // Voz 4 (Séptima): Movimiento inverso
    ];

    // Aplicar valores a los StereoPannerNodes
    for (let i = 0; i < 4; i++) {
      const targetPan = Math.max(-1.0, Math.min(1.0, panVals[i]));
      this.corePanners[i].pan.setValueAtTime(targetPan, t);
    }
  }

  /**
   * Eleva las frecuencias del acorde y abre el filtro totalmente
   * para representar el clímax místico cuando el puzzle hebreo es resuelto.
   */
  triggerSolvedClimax() {
    if (!this.isInitialized || !this.isCoreActive || this.coreOscs.length < 4) return;
    
    const t = this.ctx.currentTime;
    console.log("AudioSynth: ¡Frecuencias elevándose al plano celestial!");

    // Abrir el filtro maestro totalmente para brillo infinito
    this.filter.type = 'lowpass';
    this.filter.frequency.cancelScheduledValues(t);
    this.filter.frequency.setValueAtTime(this.filter.frequency.value, t);
    this.filter.frequency.exponentialRampToValueAtTime(12000.0, t + 2.5); // Abre hasta 12kHz
    this.filter.Q.setValueAtTime(1.5, t);

    // Duplicar frecuencias de las 4 voces para elevarlas una octava de forma ultra suave (sweep)
    this.coreOscs.forEach((osc, idx) => {
      const currentFreq = osc.frequency.value;
      osc.frequency.cancelScheduledValues(t);
      osc.frequency.setValueAtTime(currentFreq, t);
      osc.frequency.exponentialRampToValueAtTime(currentFreq * 2.0, t + 2.5); // Subida mística de 2.5s
    });

    // Subir ganancia individual de las voces para mayor resplandor
    this.coreGains.forEach((gainNode) => {
      const currentGain = gainNode.gain.value;
      gainNode.gain.cancelScheduledValues(t);
      gainNode.gain.setValueAtTime(currentGain, t);
      gainNode.gain.linearRampToValueAtTime(0.12, t + 2.5); // Incremento a 12% por voz
    });

    // Rampa de volumen maestro a nivel máximo envolvente
    this.masterGain.gain.cancelScheduledValues(t);
    this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, t);
    this.masterGain.gain.linearRampToValueAtTime(0.36, t + 2.0);
  }

  /**
   * Arranca la síntesis procedimental del viento del desierto de dunas (STATE_DUNES) de forma realista.
   * Genera un buffer de ruido blanco y lo reproduce en bucle a través de filtros pasabanda de resonancia
   * media y filtros pasabajos profundos, modulando las frecuencias dinámicamente mediante LFOs lentos
   * para simular soplidos y ráfagas de viento orgánicas en el espacio estéreo.
   */
  startDunesDrone() {
    if (!this.isInitialized) return;

    console.log("AudioSynth: Iniciando síntesis de viento del desierto realista con ruido blanco.");
    const t = this.ctx.currentTime;

    // 1. Detener y silenciar por completo los acordes de la catedral (PhaseCore)
    this.coreOscs.forEach((oscNode) => {
      try { oscNode.stop(t + 2.0); } catch (e) {}
    });
    this.coreGains.forEach((gainNode) => {
      const val = gainNode.gain.value;
      gainNode.gain.cancelScheduledValues(t);
      gainNode.gain.setValueAtTime(val, t);
      gainNode.gain.linearRampToValueAtTime(0.0, t + 2.0); // Desvanecimiento total en 2s
    });

    // Detener también el oscilador base monofónico por seguridad
    if (this.osc) {
      try { this.osc.stop(t); } catch (e) {}
    }

    // Inicializar sub-gain de viento para modulación externa
    if (!this.windSubGain) {
      this.windSubGain = this.ctx.createGain();
      const sliderVal = document.getElementById('slider-wind-volume') ? parseFloat(document.getElementById('slider-wind-volume').value) / 100 : 0.38;
      this.windSubGain.gain.setValueAtTime(sliderVal, t); // Lee del deslizador o usa el valor por defecto
      this.windSubGain.connect(this.masterGain);
    }

    // 2. Crear las voces de viento procedimentales
    this.dunesOscs = [];
    this.dunesGains = [];
    this.dunesFilters = [];

    // Generar buffer de ruido blanco de 3 segundos
    const sampleRate = this.ctx.sampleRate;
    const bufferSize = sampleRate * 3.0;
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, sampleRate);
    const channelData = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      channelData[i] = Math.random() * 2.0 - 1.0;
    }

    // Dos canales paralelos estéreo para espacialidad inmersiva gigante
    const windPans = [-0.65, 0.65];

    windPans.forEach((panValue, idx) => {
      // Fuente del buffer de ruido en bucle
      const noiseSource = this.ctx.createBufferSource();
      noiseSource.buffer = noiseBuffer;
      noiseSource.loop = true;

      // Filtro pasaalto para remover por completo zumbidos y resonancias graves pesadas (rumble)
      const highpass = this.ctx.createBiquadFilter();
      highpass.type = 'highpass';
      highpass.frequency.setValueAtTime(220.0, t); // Cortar todo por debajo de 220Hz (limpieza total de zumbido)

      // Filtro pasabanda para el "silbido" del viento
      const bandpass = this.ctx.createBiquadFilter();
      bandpass.type = 'bandpass';
      bandpass.frequency.setValueAtTime(380.0 + idx * 80.0, t);
      bandpass.Q.setValueAtTime(1.5, t); // Q aireado y amplio para soplo realista

      // Filtro pasabajo para suavizar el aire y quitar el hiss estridente de alta frecuencia
      const lowpass = this.ctx.createBiquadFilter();
      lowpass.type = 'lowpass';
      lowpass.frequency.setValueAtTime(1600.0, t);
      lowpass.Q.setValueAtTime(0.7, t);

      // Nodo de ganancia de voz
      const voiceGain = this.ctx.createGain();
      voiceGain.gain.setValueAtTime(0.0, t);

      // Panoramizador estéreo
      const panner = this.ctx.createStereoPanner();
      panner.pan.setValueAtTime(panValue, t);

      // Conexiones: Fuente -> Pasaalto -> Pasabanda -> Pasabajo -> Ganancia -> Pan -> Sub-Gain Viento
      noiseSource.connect(highpass);
      highpass.connect(bandpass);
      bandpass.connect(lowpass);
      lowpass.connect(voiceGain);
      voiceGain.connect(panner);

      // Enviar al Convolver Reverb para una espacialidad colosal (75% wet)
      if (this.reverbNode) {
        const reverbSend = this.ctx.createGain();
        reverbSend.gain.setValueAtTime(0.75, t);
        panner.connect(reverbSend);
        reverbSend.connect(this.reverbNode);
      }

      // Enviar a la salida de viento modular (dry)
      panner.connect(this.windSubGain);

      // LFO lento para simular ráfagas de viento y cambios de silbido (desfasados)
      const windLFO = this.ctx.createOscillator();
      windLFO.type = 'sine';
      windLFO.frequency.setValueAtTime(0.06 + idx * 0.04, t); // Frecuencia de ráfagas lenta

      const lfoGain = this.ctx.createGain();
      lfoGain.gain.setValueAtTime(200.0, t); // Oscilación de +-200Hz en el filtro pasabanda

      windLFO.connect(lfoGain);
      lfoGain.connect(bandpass.frequency);

      // Iniciar osciladores y fuentes
      noiseSource.start(t);
      windLFO.start(t);

      // Guardar referencias para limpieza posterior
      this.dunesOscs.push(noiseSource);
      this.dunesOscs.push(windLFO);
      this.dunesGains.push(voiceGain);
      this.dunesFilters.push(highpass);
      this.dunesFilters.push(bandpass);
      this.dunesFilters.push(lowpass);

      // Rampa de volumen fuerte e inmersiva (fade in de 3 segundos para el desierto)
      voiceGain.gain.linearRampToValueAtTime(1.0, t + 3.0); // escalado por windSubGain (1.0 * 0.38 = 0.38)
    });

    // Subir volumen maestro a volumen inmersivo alto
    this.masterGain.gain.cancelScheduledValues(t);
    this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, t);
    this.masterGain.gain.linearRampToValueAtTime(0.65, t + 2.5); // Aumentar master gain de dunas (0.42 -> 0.65)
  }

  /**
   * Arranca la síntesis de la ascensión espacial (STATE_ASCENSION).
   * Desvanece el viento del desierto e introduce una atmósfera armónica estéreo 
   * de acordes Lydian majestuosos y rotativos de 4 voces para simular ingravidez y ascenso estelar.
   */
  startAscensionSound() {
    if (!this.isInitialized) return;

    console.log("AudioSynth: Iniciando banda sonora de ascensión cósmica celestial.");
    const t = this.ctx.currentTime;

    // 1. Suave desvanecimiento del viento del desierto en 6.0s
    this.dunesGains.forEach((g) => {
      const currentVal = g.gain.value;
      g.gain.cancelScheduledValues(t);
      g.gain.setValueAtTime(currentVal, t);
      g.gain.linearRampToValueAtTime(0.015, t + 6.0); // Susurro de viento de fondo muy tenue
    });

    // 2. Transmutar el estado core a activo para habilitar panners estéreo giratorios en 3D
    this.isCoreActive = true;

    // 3. Limpiar cualquier voz residual previa del core
    this.coreOscs.forEach(o => { try { o.stop(); } catch(e){} o.disconnect(); });
    this.corePanners.forEach(p => p.disconnect());
    this.coreGains.forEach(g => g.disconnect());
    
    this.coreOscs = [];
    this.corePanners = [];
    this.coreGains = [];

    // Frecuencias base de un acorde Maj7 celestial y cálido en La menor / Do Mayor
    const baseFreq = 110.0; // A2
    const intervals = [1.0, 1.25, 1.5, 1.875]; // Tónica, Tercera mayor, Quinta justa, Séptima mayor

    // Abrir el filtro maestro y suavizarlo
    this.filter.type = 'lowpass';
    this.filter.frequency.setValueAtTime(1400.0, t);
    this.filter.Q.setValueAtTime(1.5, t);

    // Asegurar que coreSubGain está inicializado
    if (!this.coreSubGain) {
      this.coreSubGain = this.ctx.createGain();
      const sliderVal = document.getElementById('slider-core-volume') ? parseFloat(document.getElementById('slider-core-volume').value) / 100 : 0.20;
      this.coreSubGain.gain.setValueAtTime(sliderVal, t);
      this.coreSubGain.connect(this.filter);
    }

    // 4. Crear 4 voces espaciales rotativas puras (sine) para el ascenso
    intervals.forEach((multiplier, index) => {
      const osc = this.ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(baseFreq * multiplier, t);

      const voiceGain = this.ctx.createGain();
      voiceGain.gain.setValueAtTime(0, t); // Fade in suave

      const panner = this.ctx.createStereoPanner();
      panner.pan.setValueAtTime(0, t);

      osc.connect(voiceGain);
      voiceGain.connect(panner);
      panner.connect(this.coreSubGain);

      osc.start(t);

      this.coreOscs.push(osc);
      this.corePanners.push(panner);
      this.coreGains.push(voiceGain);

      // Rampa de ataque ultra suave de 4 segundos
      voiceGain.gain.linearRampToValueAtTime(0.35, t + 4.0); // escalado por coreSubGain
    });

    // Ajustar el volumen maestro lentamente a un nivel envolvente y mágico
    this.masterGain.gain.cancelScheduledValues(t);
    this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, t);
    this.masterGain.gain.linearRampToValueAtTime(0.48, t + 5.0);
  }

  /**
   * Sintetiza procedimentalmente una fanfare de trompetas celestiales de latón
   * rica en armónicos y bañada en reverb convolutiva masiva al resolver el puzzle.
   */
  playCelestialTrumpets() {
    if (!this.isInitialized) return;

    const t = this.ctx.currentTime;
    console.log("AudioSynth: ¡Proclamando el Nombre Sagrado con trompetas celestiales!");

    // Tríada mayor mística y brillante: La3 (220Hz), Do#4 (275Hz), Mi4 (330Hz), La4 (440Hz)
    const frequencies = [220.0, 275.0, 330.0, 440.0];

    frequencies.forEach((freq, idx) => {
      // 1. Oscilador diente de sierra (brassy metallic richness)
      const osc = this.ctx.createOscillator();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, t);

      // Sutil vibrato de viento (5.8Hz LFO) para realismo de afinación física
      const vibrato = this.ctx.createOscillator();
      const vibratoGain = this.ctx.createGain();
      vibrato.frequency.value = 5.8;
      vibratoGain.gain.value = freq * 0.007; // Amplitud vibrato sutil
      vibrato.connect(vibratoGain);
      vibratoGain.connect(osc.frequency);
      vibrato.start(t);
      vibrato.stop(t + 4.5);

      // 2. Filtro envolvente rápido para el sonido de metal de la boquilla (brass swell)
      const voiceFilter = this.ctx.createBiquadFilter();
      voiceFilter.type = 'lowpass';
      voiceFilter.frequency.setValueAtTime(300, t);
      // Rápida apertura de ataque en 80ms, luego decaimiento cálido
      voiceFilter.frequency.exponentialRampToValueAtTime(3200, t + 0.08 + idx * 0.04);
      voiceFilter.frequency.exponentialRampToValueAtTime(1400, t + 0.6);
      voiceFilter.Q.setValueAtTime(3.0, t);

      // 3. Envolvente de volumen (Attack rápido, Decay, Sustain, Release largo)
      const voiceGain = this.ctx.createGain();
      voiceGain.gain.setValueAtTime(0, t);
      // Entrada arpegiada (idx * 0.05) para emular trompetistas reales
      voiceGain.gain.linearRampToValueAtTime(0.09, t + 0.10 + idx * 0.05);
      voiceGain.gain.setValueAtTime(0.09, t + 1.8);
      voiceGain.gain.exponentialRampToValueAtTime(0.001, t + 4.5);

      // Conexión: Osc -> Filtro -> Ganancia de voz
      osc.connect(voiceFilter);
      voiceFilter.connect(voiceGain);
      
      // Enviar generosamente a la reverb del templo en paralelo (85% wet)
      if (this.reverbNode) {
        const reverbSend = this.ctx.createGain();
        reverbSend.gain.setValueAtTime(0.85, t);
        voiceGain.connect(reverbSend);
        reverbSend.connect(this.reverbNode);
      }

      voiceGain.connect(this.masterGain);

      // Iniciar
      osc.start(t);
      osc.stop(t + 4.6);
    });

    // Swell de volumen maestro celestial
    this.masterGain.gain.cancelScheduledValues(t);
    this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, t);
    this.masterGain.gain.linearRampToValueAtTime(0.38, t + 0.2);
  }

  /**
   * Arranca la síntesis del agujero negro masivo (STATE_BLACKHOLE).
   * Desvanece las voces de ascensión e introduce un zumbido de subgraves ultraprofundo (36Hz)
   * y un silbido de disco de acreción estéreo y circular inmersivo.
   */
  startBlackHoleSound() {
    if (!this.isInitialized) return;

    console.log("AudioSynth: Iniciando paisaje sonoro gravitatorio del Agujero Negro.");
    const t = this.ctx.currentTime;

    // 1. Suave desvanecimiento de las voces de ascensión en 3.0s
    this.coreGains.forEach((g) => {
      const currentVal = g.gain.value;
      g.gain.cancelScheduledValues(t);
      g.gain.setValueAtTime(currentVal, t);
      g.gain.linearRampToValueAtTime(0.0, t + 3.0);
    });

    // 2. Oscilador de subgraves de presión gravitatoria pura a 36Hz con LFO lento
    this.blackHoleBass = this.ctx.createOscillator();
    this.blackHoleBass.type = 'sine';
    this.blackHoleBass.frequency.setValueAtTime(36.0, t);

    this.blackHoleLFO = this.ctx.createOscillator();
    this.blackHoleLFO.type = 'sine';
    this.blackHoleLFO.frequency.setValueAtTime(1.8, t); // Latido gravitatorio rápido

    this.blackHoleLFOGain = this.ctx.createGain();
    this.blackHoleLFOGain.gain.setValueAtTime(3.0, t); // Modula +-3Hz

    this.blackHoleLFO.connect(this.blackHoleLFOGain);
    this.blackHoleLFOGain.connect(this.blackHoleBass.frequency);

    this.blackHoleBassGain = this.ctx.createGain();
    this.blackHoleBassGain.gain.setValueAtTime(0.0, t);
    this.blackHoleBassGain.gain.linearRampToValueAtTime(0.75, t + 4.0); // Presión masiva en 4s

    this.blackHoleBass.connect(this.blackHoleBassGain);
    this.blackHoleBassGain.connect(this.userMasterGain || this.ctx.destination);

    this.blackHoleBass.start(t);
    this.blackHoleLFO.start(t);

    // 3. Disco de acreción: Ruido blanco en bucle pasado por un filtro pasabanda de Q alto
    const sampleRate = this.ctx.sampleRate;
    const bufferSize = sampleRate * 2.0;
    const noiseBuffer = this.ctx.createBuffer(1, bufferSize, sampleRate);
    const channelData = noiseBuffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      channelData[i] = Math.random() * 2.0 - 1.0;
    }

    this.blackHoleNoise = this.ctx.createBufferSource();
    this.blackHoleNoise.buffer = noiseBuffer;
    this.blackHoleNoise.loop = true;

    this.blackHoleFilter = this.ctx.createBiquadFilter();
    this.blackHoleFilter.type = 'bandpass';
    this.blackHoleFilter.frequency.setValueAtTime(800.0, t);
    this.blackHoleFilter.Q.setValueAtTime(8.0, t); // Alta resonancia silbante

    // LFO de barrido lento en la resonancia
    this.blackHoleSweepLFO = this.ctx.createOscillator();
    this.blackHoleSweepLFO.type = 'sine';
    this.blackHoleSweepLFO.frequency.setValueAtTime(0.32, t);

    this.blackHoleSweepGain = this.ctx.createGain();
    this.blackHoleSweepGain.gain.setValueAtTime(450.0, t);

    this.blackHoleSweepLFO.connect(this.blackHoleSweepGain);
    this.blackHoleSweepGain.connect(this.blackHoleFilter.frequency);

    this.blackHoleNoiseGain = this.ctx.createGain();
    this.blackHoleNoiseGain.gain.setValueAtTime(0.0, t);
    this.blackHoleNoiseGain.gain.linearRampToValueAtTime(0.35, t + 3.0); // Entrada progresiva

    // Paneador estéreo para rotación veloz del disco de acreción
    this.blackHolePanner = this.ctx.createStereoPanner();
    this.blackHolePanner.pan.setValueAtTime(0.0, t);

    this.blackHolePanLFO = this.ctx.createOscillator();
    this.blackHolePanLFO.type = 'sine';
    this.blackHolePanLFO.frequency.setValueAtTime(0.95, t); // Giro rápido de 0.95Hz

    this.blackHolePanGain = this.ctx.createGain();
    this.blackHolePanGain.gain.setValueAtTime(1.0, t);

    this.blackHolePanLFO.connect(this.blackHolePanGain);
    this.blackHolePanGain.connect(this.blackHolePanner.pan);

    this.blackHoleNoise.connect(this.blackHoleFilter);
    this.blackHoleFilter.connect(this.blackHoleNoiseGain);
    this.blackHoleNoiseGain.connect(this.blackHolePanner);
    this.blackHolePanner.connect(this.masterGain);

    this.blackHoleNoise.start(t);
    this.blackHoleSweepLFO.start(t);
    this.blackHolePanLFO.start(t);

    // Elevar volumen maestro
    this.masterGain.gain.cancelScheduledValues(t);
    this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, t);
    this.masterGain.gain.linearRampToValueAtTime(0.68, t + 3.0);

    // 4. Clúster de Coro Psicodélico Surrealista (Estilo György Ligeti - 2001 Odisea del Espacio)
    // Creamos osciladores sinusoidales/triangulares de alta frecuencia desafinados y modulados
    this.stargateChoirOscs = [];
    this.stargateChoirGains = [];
    
    this.stargateChoirMasterGain = this.ctx.createGain();
    this.stargateChoirMasterGain.gain.setValueAtTime(0.0, t);
    this.stargateChoirMasterGain.gain.linearRampToValueAtTime(0.25, t + 4.5); // Entrada flotante e inquietante

    const choirFreqs = [880.0, 1046.5, 1318.5, 1568.0]; // Acorde disonante y celestial suspendido

    choirFreqs.forEach((freq, idx) => {
      const osc = this.ctx.createOscillator();
      osc.type = 'triangle'; // Tono vocal característico
      osc.frequency.setValueAtTime(freq, t);
      
      // Vibrato desafinado errático mediante LFO individual
      const vibrato = this.ctx.createOscillator();
      vibrato.type = 'sine';
      vibrato.frequency.setValueAtTime(1.1 + idx * 0.35, t);
      
      const vibratoGain = this.ctx.createGain();
      vibratoGain.gain.setValueAtTime(12.0 + idx * 4.0, t); // Oscilación de frecuencia
      
      vibrato.connect(vibratoGain);
      vibratoGain.connect(osc.frequency);
      
      // Tremolo desfasado para dar sensación de coro inestable
      const gNode = this.ctx.createGain();
      gNode.gain.setValueAtTime(0.20, t);
      
      const tremolo = this.ctx.createOscillator();
      tremolo.type = 'sine';
      tremolo.frequency.setValueAtTime(0.42 + idx * 0.15, t);
      
      const tremoloGain = this.ctx.createGain();
      tremoloGain.gain.setValueAtTime(0.12, t);
      
      tremolo.connect(tremoloGain);
      tremoloGain.connect(gNode.gain);
      
      osc.connect(gNode);
      gNode.connect(this.stargateChoirMasterGain);
      
      vibrato.start(t);
      tremolo.start(t);
      osc.start(t);
      
      this.stargateChoirOscs.push(osc);
      this.stargateChoirOscs.push(vibrato);
      this.stargateChoirOscs.push(tremolo);
      this.stargateChoirGains.push(gNode);
    });

    this.stargateChoirMasterGain.connect(this.reverbGain || this.ctx.destination);
  }

  /**
   * Dispara el colapso auditivo final de absorción por la singularidad.
   * Modula el máster a silencio dramático instantáneo.
   */
  triggerBlackHoleSingularity() {
    if (!this.isInitialized) return;
    const t = this.ctx.currentTime;
    console.log("AudioSynth: ¡Singularidad alcanzada! El sonido se colapsa al vacío absoluto.");

    this.masterGain.gain.cancelScheduledValues(t);
    this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, t);
    this.masterGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.48);

    if (this.blackHoleBassGain) {
      this.blackHoleBassGain.gain.cancelScheduledValues(t);
      this.blackHoleBassGain.gain.setValueAtTime(this.blackHoleBassGain.gain.value, t);
      this.blackHoleBassGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.48);
    }

    if (this.stargateChoirMasterGain) {
      this.stargateChoirMasterGain.gain.cancelScheduledValues(t);
      this.stargateChoirMasterGain.gain.setValueAtTime(this.stargateChoirMasterGain.gain.value, t);
      this.stargateChoirMasterGain.gain.exponentialRampToValueAtTime(0.0001, t + 0.48);
    }
  }

  /**
   * Sintetiza la majestuosa banda sonora del Teseracto (Hans Zimmer - Interstellar).
   * Incorpora un órgano de iglesia multitonal polifónico, un secuenciador de acordes
   * lentos y un reloj de relatividad temporal de 1Hz.
   */
  startTesseractSound() {
    if (!this.isInitialized) return;
    this.isPlaying = true;

    const t = this.ctx.currentTime;
    console.log("AudioSynth: Iniciando banda sonora interestelar de órgano para el Teseracto (4D).");

    // 1. Apagar sonidos de dunas/agujero negro anteriores si quedase alguno
    try {
      if (this.blackHoleBass) { this.blackHoleBass.stop(); }
      if (this.blackHoleNoise) { this.blackHoleNoise.stop(); }
      if (this.stargateChoirOscs) {
        this.stargateChoirOscs.forEach(o => { try { o.stop(); } catch(e){} });
      }
    } catch(e){}

    // 2. Reloj de relatividad temporal (Ticking Clock de 1Hz)
    this.tesseractTickTimer = setInterval(() => {
      if (!this.isPlaying) return;
      const now = this.ctx.currentTime;
      
      const tickOsc = this.ctx.createOscillator();
      tickOsc.type = 'triangle';
      tickOsc.frequency.setValueAtTime(2800.0, now);
      tickOsc.frequency.exponentialRampToValueAtTime(50.0, now + 0.06);
      
      const tickGain = this.ctx.createGain();
      tickGain.gain.setValueAtTime(0.07, now);
      tickGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.05);
      
      tickOsc.connect(tickGain);
      tickGain.connect(this.masterGain);
      
      tickOsc.start(now);
      tickOsc.stop(now + 0.08);
    }, 1000);

    // 3. Sintetizador de Órgano de Iglesia polifónico detunado
    this.organOscs = [];
    this.organGains = [];

    // Acordes solemnes de Interstellar:
    // A minor (Lamento) -> F major (Esperanza) -> C major (Lanzamiento) -> G major (Gravedad)
    const chords = [
      [110.0, 164.8, 220.0, 261.6, 329.6], // Am
      [87.3,  130.8, 174.6, 220.0, 261.6], // F
      [65.4,  98.0,  130.8, 164.8, 196.0], // C
      [98.0,  146.8, 196.0, 246.9, 293.7]  // G
    ];

    this.organMasterGain = this.ctx.createGain();
    this.organMasterGain.gain.setValueAtTime(0.0, t);
    this.organMasterGain.gain.linearRampToValueAtTime(0.35, t + 4.0); // Entrada expansiva

    // Filtro pasabajos global para tono cálido de catedral
    this.organFilter = this.ctx.createBiquadFilter();
    this.organFilter.type = 'lowpass';
    this.organFilter.frequency.setValueAtTime(650.0, t);
    this.organFilter.Q.setValueAtTime(2.0, t);

    // LFO lento para barrido envolvente de frecuencia de corte
    this.organFilterLFO = this.ctx.createOscillator();
    this.organFilterLFO.type = 'sine';
    this.organFilterLFO.frequency.setValueAtTime(0.12, t); // Bucle cada 8 segundos

    this.organFilterLFOForce = this.ctx.createGain();
    this.organFilterLFOForce.gain.setValueAtTime(250.0, t);

    this.organFilterLFO.connect(this.organFilterLFOForce);
    this.organFilterLFOForce.connect(this.organFilter.frequency);
    this.organFilterLFO.start(t);

    // Creamos 5 pares de osciladores detunados para un grosor orquestal real
    for (let i = 0; i < 5; i++) {
      const oscSaw = this.ctx.createOscillator();
      const oscTri = this.ctx.createOscillator();
      
      oscSaw.type = 'sawtooth';
      oscTri.type = 'triangle';
      
      oscSaw.detune.setValueAtTime(-8.0 + i * 4.0, t);
      oscTri.detune.setValueAtTime(8.0 - i * 4.0, t);
      
      const vGain = this.ctx.createGain();
      vGain.gain.setValueAtTime(0.24, t);
      
      oscSaw.connect(vGain);
      oscTri.connect(vGain);
      vGain.connect(this.organFilter);
      
      oscSaw.start(t);
      oscTri.start(t);
      
      this.organOscs.push(oscSaw);
      this.organOscs.push(oscTri);
      this.organGains.push(vGain);
    }

    this.organFilter.connect(this.organMasterGain);
    this.organMasterGain.connect(this.reverbGain || this.ctx.destination);

    // Función del secuenciador para cambiar de acordes cada 4 segundos
    let currentChordIdx = 0;
    const playNextChord = () => {
      if (!this.isPlaying) return;
      const now = this.ctx.currentTime;
      const chord = chords[currentChordIdx];
      
      for (let i = 0; i < 5; i++) {
        const oscSaw = this.organOscs[i * 2];
        const oscTri = this.organOscs[i * 2 + 1];
        
        oscSaw.frequency.cancelScheduledValues(now);
        oscTri.frequency.cancelScheduledValues(now);
        
        oscSaw.frequency.setValueAtTime(oscSaw.frequency.value, now);
        oscTri.frequency.setValueAtTime(oscTri.frequency.value, now);
        
        oscSaw.frequency.exponentialRampToValueAtTime(chord[i], now + 1.2);
        oscTri.frequency.exponentialRampToValueAtTime(chord[i] * 2.0, now + 1.2); // Triplicado con brillo
      }
      
      currentChordIdx = (currentChordIdx + 1) % chords.length;
    };

    playNextChord();
    this.tesseractSequencerTimer = setInterval(playNextChord, 4000);

    // Asegurar volumen máster correcto
    this.masterGain.gain.cancelScheduledValues(t);
    this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, t);
    this.masterGain.gain.linearRampToValueAtTime(0.65, t + 2.5);
  }

  /**
   * Cierra dramáticamente el órgano y detiene el reloj del teseracto.
   */
  triggerTesseractSilence() {
    if (!this.isInitialized) return;
    const t = this.ctx.currentTime;
    console.log("AudioSynth: Teseracto terminando. Silenciando órgano majestuoso.");

    if (this.organMasterGain) {
      this.organMasterGain.gain.cancelScheduledValues(t);
      this.organMasterGain.gain.setValueAtTime(this.organMasterGain.gain.value, t);
      this.organMasterGain.gain.exponentialRampToValueAtTime(0.0001, t + 3.0);
    }
    
    if (this.tesseractTickTimer) {
      clearInterval(this.tesseractTickTimer);
      this.tesseractTickTimer = null;
    }
  }

  /**
   * ==========================================================================
   * PLANIFICADOR DE LATIDO PROCEDIMENTAL (LOOKAHEAD SCHEDULER)
   * ==========================================================================
   */

  /**
   * Arranca el bucle de planificación temporal del latido.
   */
  startScheduler() {
    if (!this.isInitialized) return;
    if (this.schedulerTimerId) {
      clearInterval(this.schedulerTimerId);
    }
    this.nextBeatTime = this.ctx.currentTime;
    this.schedulerTimerId = setInterval(() => this.scheduler(), 25);
  }

  /**
   * Bucle del planificador. Compara el tiempo del siguiente evento con la
   * ventana de anticipación y programa los nodos Web Audio en consecuencia.
   */
  scheduler() {
    const currentTime = this.ctx.currentTime;
    const scheduleAheadTime = 0.1; // Planificar 100ms a futuro
    
    // Evitar bucles infinitos por congelamiento de pestañas al suspender y reactivar
    if (this.nextBeatTime < currentTime) {
      this.nextBeatTime = currentTime;
    }
    
    while (this.nextBeatTime < currentTime + scheduleAheadTime) {
      this.scheduleHeartbeat(this.nextBeatTime);
      const secondsPerBeat = 60.0 / this.heartBPM;
      this.nextBeatTime += secondsPerBeat;
    }
  }

  /**
   * Genera procedimentalmente un latido de corazón de doble golpe ("lub-dub").
   */
  scheduleHeartbeat(time) {
    if (!this.isInitialized || this.isCoreActive) return;

    // Calcular volumen dinámico según la tensión (el corazón late más fuerte a mayor tensión)
    const lubVolume = 0.20 + this.tension * (0.80 - 0.20);
    const dubVolume = 0.14 + this.tension * (0.65 - 0.14);

    // 1. "Lub" (Primer pulso: 55Hz a 10Hz, ruidoso y corto)
    const osc1 = this.ctx.createOscillator();
    const gain1 = this.ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(55, time);
    osc1.frequency.exponentialRampToValueAtTime(10, time + 0.12);

    gain1.gain.setValueAtTime(0, time);
    gain1.gain.linearRampToValueAtTime(lubVolume, time + 0.02);
    gain1.gain.exponentialRampToValueAtTime(0.001, time + 0.12);

    osc1.connect(gain1);
    gain1.connect(this.userMasterGain || this.ctx.destination); // Conexión directa para bypass de masterGain (máximo impacto de subgraves)
    osc1.start(time);
    osc1.stop(time + 0.15);

    // 2. "Dub" (Segundo pulso: 50Hz a 10Hz, más suave y ligeramente retardado)
    const osc2 = this.ctx.createOscillator();
    const gain2 = this.ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(50, time + 0.18);
    osc2.frequency.exponentialRampToValueAtTime(10, time + 0.30);

    gain2.gain.setValueAtTime(0, time + 0.18);
    gain2.gain.linearRampToValueAtTime(dubVolume, time + 0.20);
    gain2.gain.exponentialRampToValueAtTime(0.001, time + 0.30);

    osc2.connect(gain2);
    gain2.connect(this.userMasterGain || this.ctx.destination); // Conexión directa
    osc2.start(time + 0.18);
    osc2.stop(time + 0.35);
  }

  /**
   * Actualiza dinámicamente la tensión para modular el BPM del latido y
   * la respiración procedimental (LFO del filtro de paso bajo).
   * 
   * @param {number} normalizedDistance - Valor de 0.0 (lejos) a 1.0 (contacto con el templo)
   */
  setTension(normalizedDistance) {
    if (!this.isInitialized || !this.isPlaying || this.isCoreActive) return;

    const tension = Math.max(0.0, Math.min(1.0, normalizedDistance));
    this.tension = tension;

    // Mapeo lineal: 40 BPM a 150 BPM
    this.heartBPM = 40.0 + tension * (150.0 - 40.0);

    // Rampa de velocidad para LFO de respiración: 0.15Hz a 0.8Hz
    if (this.lfo) {
      const targetLFOFreq = 0.15 + tension * (0.8 - 0.15);
      const t = this.ctx.currentTime;
      this.lfo.frequency.cancelScheduledValues(t);
      this.lfo.frequency.setValueAtTime(this.lfo.frequency.value, t);
      this.lfo.frequency.exponentialRampToValueAtTime(targetLFOFreq, t + 0.1);
    }
  }

  /**
   * Carga de forma asíncrona la voz "acércate" y la decodifica en un AudioBuffer.
   */
  async loadVoice() {
    // "No cargues el audio" - Carga de audio externo deshabilitada a petición del usuario.
    console.log("AudioSynth: Carga de archivo de audio 'acércate' deshabilitada.");
    return;
  }

  /**
   * Reproduce la voz precargada "acércate" ruteada directamente al destino final.
   */
  playVoice(volume = 1.25) {
    if (!this.isInitialized || !this.acercateBuffer) {
      console.warn("AudioSynth: Intento de reproducir la voz sin estar cargada.");
      return;
    }

    const t = this.ctx.currentTime;
    
    // Crear el nodo de fuente
    const source = this.ctx.createBufferSource();
    source.buffer = this.acercateBuffer;

    // Modulación de tono (pitch shift hacia los graves mediante reducción del playbackRate)
    // 0.65 hace que suene un 35% más lento y mucho más grave (efecto entidad cósmica)
    source.playbackRate.setValueAtTime(0.65, t);

    // 1. RUTA DRY (Sonido directo claro)
    const voiceGain = this.ctx.createGain();
    voiceGain.gain.setValueAtTime(volume, t);

    source.connect(voiceGain);
    voiceGain.connect(this.userMasterGain || this.ctx.destination); // Directo a la salida para presencia física

    // 2. RUTA WET (Envío a la Reverb de templo)
    if (this.reverbNode) {
      const voiceReverbGain = this.ctx.createGain();
      voiceReverbGain.gain.setValueAtTime(volume * 0.9, t); // Envío generoso del 90% para un gran eco de templo
      
      source.connect(voiceReverbGain);
      voiceReverbGain.connect(this.reverbNode); // Conectar al Convolver del templo
    }
    
    // Disparar
    source.start(t);
    console.log("AudioSynth: Reproduciendo voz 'acércate' modulada (grave + reverb de templo).");
  }

  /**
   * Genera de forma procedimental una respuesta al impulso estéreo de ruido blanco 
   * con decaimiento exponencial para modelar una catedral con gran reverberación.
   */
  createReverbImpulseResponse(duration = 2.5, decay = 2.5) {
    const rate = this.ctx.sampleRate;
    const len = rate * duration;
    const buffer = this.ctx.createBuffer(2, len, rate);
    
    for (let channel = 0; channel < 2; channel++) {
      const data = buffer.getChannelData(channel);
      for (let i = 0; i < len; i++) {
        // Ruido blanco aleatorio atenuado por la curva de decaimiento exponencial
        data[i] = (Math.random() * 2.0 - 1.0) * Math.pow(1.0 - i / len, decay);
      }
    }
    return buffer;
  }

  /**
   * Detiene todo el sonido liberando todos los osciladores y voces.
   */
  async stop() {
    if (!this.isInitialized || !this.isPlaying) return;
    
    const t = this.ctx.currentTime;
    this.masterGain.gain.cancelScheduledValues(t);
    this.masterGain.gain.setValueAtTime(this.masterGain.gain.value, t);
    this.masterGain.gain.linearRampToValueAtTime(0, t + 0.6); // Fade-out suave
    
    setTimeout(async () => {
      // Limpiar nodos de Reverb convolucional
      if (this.reverbNode) {
        this.reverbNode.disconnect();
        this.reverbNode = null;
      }
      if (this.reverbGain) {
        this.reverbGain.disconnect();
        this.reverbGain = null;
      }

      // Detener secuenciador de latidos y LFO
      if (this.schedulerTimerId) {
        clearInterval(this.schedulerTimerId);
        this.schedulerTimerId = null;
      }
      if (this.lfo) {
        try { this.lfo.stop(); } catch (e) {}
        this.lfo.disconnect();
        this.lfo = null;
      }
      if (this.lfoGain) {
        this.lfoGain.disconnect();
        this.lfoGain = null;
      }

      // Detener oscilador simple
      if (this.osc) {
        try { this.osc.stop(); } catch(e){}
        this.osc.disconnect();
        this.osc = null;
      }

      // Detener y limpiar voces del Core
      this.coreOscs.forEach(o => {
        try { o.stop(); } catch(e){}
        o.disconnect();
      });
      this.corePanners.forEach(p => p.disconnect());
      this.coreGains.forEach(g => g.disconnect());

      this.coreOscs = [];
      this.corePanners = [];
      this.coreGains = [];
      this.isCoreActive = false;

      // Detener y limpiar voces de dunas (viento)
      this.dunesOscs.forEach(o => {
        try { o.stop(); } catch(e){}
        o.disconnect();
      });
      this.dunesGains.forEach(g => g.disconnect());
      this.dunesFilters.forEach(f => f.disconnect());
      this.dunesOscs = [];
      this.dunesGains = [];
      this.dunesFilters = [];

      // Detener y limpiar voces del Agujero Negro
      if (this.blackHoleBass) {
        try { this.blackHoleBass.stop(); } catch(e){}
        this.blackHoleBass.disconnect();
        this.blackHoleBass = null;
      }
      if (this.blackHoleLFO) {
        try { this.blackHoleLFO.stop(); } catch(e){}
        this.blackHoleLFO.disconnect();
        this.blackHoleLFO = null;
      }
      if (this.blackHoleLFOGain) {
        this.blackHoleLFOGain.disconnect();
        this.blackHoleLFOGain = null;
      }
      if (this.blackHoleBassGain) {
        this.blackHoleBassGain.disconnect();
        this.blackHoleBassGain = null;
      }
      if (this.blackHoleNoise) {
        try { this.blackHoleNoise.stop(); } catch(e){}
        this.blackHoleNoise.disconnect();
        this.blackHoleNoise = null;
      }
      if (this.blackHoleFilter) {
        this.blackHoleFilter.disconnect();
        this.blackHoleFilter = null;
      }
      if (this.blackHoleSweepLFO) {
        try { this.blackHoleSweepLFO.stop(); } catch(e){}
        this.blackHoleSweepLFO.disconnect();
        this.blackHoleSweepLFO = null;
      }
      if (this.blackHoleSweepGain) {
        this.blackHoleSweepGain.disconnect();
        this.blackHoleSweepGain = null;
      }
      if (this.blackHoleNoiseGain) {
        this.blackHoleNoiseGain.disconnect();
        this.blackHoleNoiseGain = null;
      }
      if (this.blackHolePanner) {
        this.blackHolePanner.disconnect();
        this.blackHolePanner = null;
      }
      if (this.blackHolePanLFO) {
        try { this.blackHolePanLFO.stop(); } catch(e){}
        this.blackHolePanLFO.disconnect();
        this.blackHolePanLFO = null;
      }
      if (this.blackHolePanGain) {
        this.blackHolePanGain.disconnect();
        this.blackHolePanGain = null;
      }

      // Detener clúster de coro stargate
      if (this.stargateChoirOscs) {
        this.stargateChoirOscs.forEach(o => {
          try { o.stop(); } catch(e){}
          o.disconnect();
        });
        this.stargateChoirOscs = null;
      }
      if (this.stargateChoirGains) {
        this.stargateChoirGains.forEach(g => g.disconnect());
        this.stargateChoirGains = null;
      }
      if (this.stargateChoirMasterGain) {
        this.stargateChoirMasterGain.disconnect();
        this.stargateChoirMasterGain = null;
      }

      // Detener e inquietar el sintetizador del Teseracto
      if (this.tesseractTickTimer) {
        clearInterval(this.tesseractTickTimer);
        this.tesseractTickTimer = null;
      }
      if (this.tesseractSequencerTimer) {
        clearInterval(this.tesseractSequencerTimer);
        this.tesseractSequencerTimer = null;
      }
      if (this.organOscs) {
        this.organOscs.forEach(o => {
          try { o.stop(); } catch(e){}
          o.disconnect();
        });
        this.organOscs = [];
      }
      if (this.organGains) {
        this.organGains.forEach(g => g.disconnect());
        this.organGains = [];
      }
      if (this.organFilterLFO) {
        try { this.organFilterLFO.stop(); } catch(e){}
        this.organFilterLFO.disconnect();
        this.organFilterLFO = null;
      }
      if (this.organFilterLFOForce) {
        this.organFilterLFOForce.disconnect();
        this.organFilterLFOForce = null;
      }
      if (this.organFilter) {
        this.organFilter.disconnect();
        this.organFilter = null;
      }
      if (this.organMasterGain) {
        this.organMasterGain.disconnect();
        this.organMasterGain = null;
      }

      if (this.ctx && this.ctx.state !== 'suspended') {
        await this.ctx.suspend();
      }
      this.isPlaying = false;
    }, 650);
  }
}
