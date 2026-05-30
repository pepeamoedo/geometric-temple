/**
 * PhaseTesseract
 * 
 * Clímax definitivo y final de la experiencia (STATE_TESSERACT).
 * Recrea de forma interactiva la secuencia del Teseracto (4D) de la película Interstellar.
 * El jugador flota en un laberinto infinito de pasillos de luz ortogonales y estanterías
 * de líneas de tiempo en color ámbar, cobre y oro.
 * Se implementa una rotación hiperdimensional en 4D y un deslizamiento de corredores.
 * Los controles de ratón en 360º permiten explorar este espacio infinito recursivo.
 * A los 15 segundos, se lanza la secuencia de créditos cinematográficos definitivos.
 */
const A = Math.sqrt(2);
const B = Math.sqrt(3);
const C = Math.sqrt(5);

export class PhaseTesseract {
  constructor() {
    this.device = null;
    this.format = null;

    // Recursos de WebGPU
    this.pipeline = null;
    this.uniformBuffer = null;
    this.bindGroupLayout = null;
    this.bindGroup = null;

    this.width = window.innerWidth;
    this.height = window.innerHeight;

    // Mirada interactiva libre en 360º (Yaw/Pitch)
    this.yaw = 0.0;
    this.pitch = 0.0;
    this.yawSmooth = 0.0;
    this.pitchSmooth = 0.0;
    this.lastMouseX = null;
    this.lastMouseY = null;

    // Reloj interno de la fase
    this.tessTime = 0.0;
    this.isDone = false;

    // Créditos cinematográficos finales
    this.creditsTriggered = false;
    this.creditsEl = null;
    this.promptEl = null;

    // Manejadores de interacción
    this.onPointerMove = this.onPointerMove.bind(this);
    this.onPointerDown = this.onPointerDown.bind(this);
    this.onPointerUp = this.onPointerUp.bind(this);
  }

  onPointerMove(e) {
    if (this.isDone) return;

    let dx = e.movementX;
    let dy = e.movementY;

    if (dx === undefined || dy === undefined) {
      if (this.lastMouseX !== null) {
        dx = e.clientX - this.lastMouseX;
        dy = e.clientY - this.lastMouseY;
      } else {
        dx = 0;
        dy = 0;
      }
      this.lastMouseX = e.clientX;
      this.lastMouseY = e.clientY;
    }

    const sensitivity = 0.0022;
    this.yaw -= dx * sensitivity;
    this.pitch -= dy * sensitivity;

    // Limitar cabeceo para evitar volteo invertido
    const maxPitch = 82 * Math.PI / 180;
    this.pitch = Math.max(-maxPitch, Math.min(maxPitch, this.pitch));
  }

  onPointerDown(e) {
    this.lastMouseX = e.clientX;
    this.lastMouseY = e.clientY;
  }

  onPointerUp() {
    this.lastMouseX = null;
    this.lastMouseY = null;
  }

  /**
   * Inicializa la GPU y compila el sombreador procedural del Teseracto 4D.
   */
  async init(device, format) {
    this.device = device;
    this.format = format;

    this.promptEl = document.getElementById('temple-prompt');

    window.addEventListener('pointermove', this.onPointerMove, { passive: true });
    window.addEventListener('pointerdown', this.onPointerDown, { passive: true });
    window.addEventListener('pointerup', this.onPointerUp, { passive: true });

    // Código del sombreador WGSL del Teseracto Infinito (Interstellar)
    const wgslSource = `
      struct Uniforms {
        u_resolution     : vec2<f32>, // Offset 0
        u_mouse          : vec2<f32>, // Offset 8
        u_time           : f32,       // Offset 16
        u_tesseract_time : f32,       // Offset 20
        u_padding1       : f32,       // Offset 24
        u_padding2       : f32,       // Offset 28
      }

      @group(0) @binding(0) var<uniform> uniforms : Uniforms;

      // Constantes matemáticas hiperdimensionales
      const A = 1.41421356237; // raiz de 2
      const B = 1.73205080757; // raiz de 3
      const C = 2.2360679775;  // raiz de 5

      struct VertexOutput {
        @builtin(position) position : vec4<f32>,
        @location(0) uv : vec2<f32>,
      }

      @vertex
      fn vs_main(@builtin(vertex_index) vertexIndex : u32) -> VertexOutput {
        var pos = array<vec2<f32>, 3>(
          vec2<f32>(-1.0, -1.0),
          vec2<f32>( 3.0, -1.0),
          vec2<f32>(-1.0,  3.0)
        );
        var out : VertexOutput;
        out.position = vec4<f32>(pos[vertexIndex], 0.0, 1.0);
        out.uv = pos[vertexIndex] * 0.5 + 0.5;
        return out;
      }

      fn rotateX(angle : f32) -> mat3x3<f32> {
        let s = sin(angle);
        let c = cos(angle);
        return mat3x3<f32>(
          vec3<f32>(1.0, 0.0, 0.0),
          vec3<f32>(0.0,  c, -s),
          vec3<f32>(0.0,  s,  c)
        );
      }

      fn rotateY(angle : f32) -> mat3x3<f32> {
        let s = sin(angle);
        let c = cos(angle);
        return mat3x3<f32>(
          vec3<f32>( c, 0.0,  s),
          vec3<f32>(0.0, 1.0, 0.0),
          vec3<f32>(-s, 0.0,  c)
        );
      }

      // --- DISTANCIA A LAS ESTANTERÍAS Y PASILLOS DE TIEMPO DEL TESERACTO ---
      // Retorna el SDF del laberinto ortogonal infinito
      fn getTesseractMap(pos : vec3<f32>, w_angle : f32) -> vec4<f32> {
        // Deslizamiento 4D de los pasillos como ondas sinusoidales complejas
        let shift = vec3<f32>(
          sin(pos.y * 0.28 + w_angle) * 0.75,
          cos(pos.z * 0.28 - w_angle) * 0.75,
          sin(pos.x * 0.28 + w_angle * 0.5) * 0.75
        );
        
        let p_grid = pos + shift;
        
        // Repetición espacial infinita (módulo 5.0 unidades)
        let grid_size = 5.0;
        let p_rep = (fract(p_grid / grid_size) - 0.5) * grid_size;
        
        // Espesores de las estanterías (vigas ortogonales)
        let thickness = 0.16;
        
        // Corredores extruidos en X, Y y Z
        let d_x = length(p_rep.yz) - thickness;
        let d_y = length(p_rep.xz) - thickness;
        let d_z = length(p_rep.xy) - thickness;
        
        // Unir las vigas para formar la rejilla
        let beams = min(d_x, min(d_y, d_z));
        
        // Estructura interna de "libros" / "filas de tiempo" mediante alta frecuencia
        let cell = floor(p_grid / grid_size);
        let book_wave = sin(pos.x * 12.0) * sin(pos.y * 12.0) * sin(pos.z * 12.0);
        let shelves = beams + abs(book_wave) * 0.015;
        
        // Clasificación de color: 0 = estructura, 1 = filamento central brillante
        var mat_type = 0.0;
        let center_wire = min(length(p_rep.yz), min(length(p_rep.xz), length(p_rep.xy))) - 0.015;
        
        let final_d = min(shelves, center_wire);
        if (final_d == center_wire) {
          mat_type = 1.0;
        }
        
        return vec4<f32>(final_d, mat_type, cell.x, cell.y);
      }

      @fragment
      fn fs_main(in : VertexOutput) -> @location(0) vec4<f32> {
        let uv = in.uv;
        let aspect = uniforms.u_resolution.x / uniforms.u_resolution.y;

        var p = (uv - 0.5) * 2.0;
        p.x = p.x * aspect;

        let orig_p = p;

        // Mirada 360 interactiva
        let yaw = (uniforms.u_mouse.x - 0.5) * 3.14159265 * 2.0;
        let pitch = (uniforms.u_mouse.y - 0.5) * 3.14159265 * 0.42;

        let camRot = rotateY(yaw) * rotateX(pitch);
        var rd = camRot * normalize(vec3<f32>(p.x, p.y, 0.95));

        // Angulo de rotación dimensional
        let w_angle = uniforms.u_tesseract_time * 0.28;

        // Cámara flotando de forma contemplativa a velocidad lenta por el teseracto
        let ro = vec3<f32>(
          uniforms.u_tesseract_time * 0.32,
          1.2 + sin(uniforms.u_tesseract_time * 0.22) * 0.4,
          uniforms.u_tesseract_time * 0.22
        );

        // ======================================================================
        // TRAZADOR DE RAYOS (RAYMARCHING) DENTRO DEL TESERACTO
        // ======================================================================
        var t = 0.08;
        var hit = false;
        var hit_type = 0.0;
        var hit_cell = vec2<f32>(0.0);
        var pos = ro;
        
        var accumulated_glow = vec3<f32>(0.0);
        
        for (var i = 0; i < 52; i = i + 1) {
          pos = ro + rd * t;
          let map = getTesseractMap(pos, w_angle);
          let d = map.x;
          
          // Brillo radiante volumétrico de las líneas de tiempo doradas
          // Mayor cercanía a las vigas genera mayor incandescencia
          let glow_intensity = 0.0058 / (d * d + 0.0028);
          let beam_color = mix(
            vec3<f32>(0.98, 0.52, 0.12), // Cobre/Oro cálido profundo
            vec3<f32>(1.0, 0.88, 0.58),  // Amarillo brillante / Luz blanca
            map.y
          );
          accumulated_glow += beam_color * glow_intensity * (1.0 - t * 0.016);
          
          if (d < 0.002) {
            hit = true;
            hit_type = map.y;
            hit_cell = map.zw;
            break;
          }
          
          t += d * 0.82; // Avanzar el rayo
          if (t > 45.0) {
            break;
          }
        }

        // ======================================================================
        // COMPOSICIÓN DE COLOR E ILUMINACIÓN
        // ======================================================================
        var color = vec3<f32>(0.0);
        
        if (hit) {
          // Color estructural de la estantería: Madera/Cobre oscuro cel-shaded
          let N = normalize(pos - floor(pos) - vec3<f32>(0.5));
          let light_dir = normalize(vec3<f32>(0.5, 1.0, -0.3));
          let diff = max(dot(N, light_dir), 0.0);
          
          let diffuse_step = step(0.20, diff) * 0.35 + step(0.68, diff) * 0.65;
          let base_struct = mix(vec3<f32>(0.16, 0.08, 0.04), vec3<f32>(0.52, 0.32, 0.16), diffuse_step);
          
          // Si impacta en el núcleo de luz brillante central (filamento hiperdimensional)
          if (hit_type > 0.5) {
            color = vec3<f32>(1.0, 0.95, 0.82) * 2.8;
          } else {
            color = base_struct;
          }
          
          // Difuminar con la distancia para dar profundidad infinita
          let depth_fade = exp(-0.05 * t);
          color = color * depth_fade;
        }
        
        // Añadir el brillo radiante volumétrico acumulado (filamentos flotantes)
        color = color + accumulated_glow * 0.82;
        
        // Destellos estroboscópicos lentos que emulan partículas de gravedad cayendo
        let flicker_noise = sin(pos.x * 0.85 + pos.y * 1.42 + uniforms.u_time * 2.2) * 0.5 + 0.5;
        let gravity_sparks = pow(flicker_noise, 8.0) * vec3<f32>(1.0, 0.72, 0.28) * 0.35 * exp(-0.04 * t);
        color = color + gravity_sparks;

        // ======================================================================
        // EFECTOS CRT POST-PROCESADO
        // ======================================================================
        // Desfase de canales RGB (Chromatic Aberration radial hiperdimensional)
        let radius = length(orig_p);
        let ca_shift = 0.012 * orig_p;
        let dColDX = dpdx(color);
        let dColDY = dpdy(color);
        let col_r = color - dColDX * ca_shift.x - dColDY * ca_shift.y;
        let col_b = color + dColDX * ca_shift.x + dColDY * ca_shift.y;
        let final_rgb = vec3<f32>(col_r.x, color.y, col_b.z);

        // Texturizado de fósforo y scanlines permanentes
        let crt_scanline = 0.94 + 0.06 * sin(orig_p.y * 360.0);
        let phosphor_grille = 0.96 + 0.04 * sin(orig_p.x * 540.0);
        let crt_vignette = 1.0 - smoothstep(0.65, 1.4, radius);
        var final_textured = final_rgb * crt_scanline * phosphor_grille * crt_vignette;
        
        // Fundido a negro final de entrada (destello de la singularidad) y salida a créditos
        var fade = 1.0;
        if (uniforms.u_tesseract_time < 1.5) {
          fade = smoothstep(0.0, 1.5, uniforms.u_tesseract_time); // Blending de entrada
        } else if (uniforms.u_tesseract_time > 12.0) {
          fade = 1.0 - smoothstep(12.0, 15.0, uniforms.u_tesseract_time); // Fundido de salida
        }
        
        final_textured = final_textured * fade;

        return vec4<f32>(final_textured, 1.0);
      }
    `;

    // 1. Compilar Shader Module
    console.log("PhaseTesseract: Compilando sombreador del Teseracto...");
    const shaderModule = this.device.createShaderModule({
      label: 'PhaseTesseract Shader Module',
      code: wgslSource
    });

    // Validar compilación
    if (shaderModule.getCompilationInfo) {
      const compInfo = await shaderModule.getCompilationInfo();
      const errors = compInfo.messages.filter(m => m.type === 'error');
      if (errors.length > 0) {
        console.error("PhaseTesseract: Errores de compilación del sombreador WGSL:", errors);
        this.showVisualError("WGSL Compilation Error", errors.map(e => `Línea ${e.lineNum}:${e.linePos} - ${e.message}`).join('\n'));
        throw new Error(`WGSL Shader Error: ${errors[0].message}`);
      }
    }

    try {
      // 2. Uniform Buffer de 32 bytes (Alineación requerida 16 bytes)
      this.uniformBuffer = this.device.createBuffer({
        label: 'PhaseTesseract Uniform Buffer',
        size: 32,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
      });

      // 3. Crear Bind Group Layout
      this.bindGroupLayout = this.device.createBindGroupLayout({
        label: 'PhaseTesseract Bind Group Layout',
        entries: [
          {
            binding: 0,
            visibility: GPUShaderStage.FRAGMENT,
            buffer: { type: 'uniform' }
          }
        ]
      });

      // 4. Crear Bind Group
      this.bindGroup = this.device.createBindGroup({
        label: 'PhaseTesseract Bind Group',
        layout: this.bindGroupLayout,
        entries: [
          {
            binding: 0,
            resource: { buffer: this.uniformBuffer }
          }
        ]
      });

      // 5. Configurar Pipeline Layout
      const pipelineLayout = this.device.createPipelineLayout({
        label: 'PhaseTesseract Pipeline Layout',
        bindGroupLayouts: [this.bindGroupLayout]
      });

      // 6. Generar Render Pipeline
      this.pipeline = this.device.createRenderPipeline({
        label: 'PhaseTesseract Render Pipeline',
        layout: pipelineLayout,
        vertex: {
          module: shaderModule,
          entryPoint: 'vs_main'
        },
        fragment: {
          module: shaderModule,
          entryPoint: 'fs_main',
          targets: [
            {
              format: this.format,
              writeMask: 0xF
            }
          ]
        },
        primitive: { topology: 'triangle-list' }
      });

      console.log("PhaseTesseract: Sombreador del Teseracto 4D creado con éxito.");
    } catch (e) {
      console.error("PhaseTesseract: Error al crear el Pipeline de WebGPU:", e);
      this.showVisualError("WebGPU Pipeline Creation Error", e.message || String(e));
      throw e;
    }
  }

  /**
   * Muestra un overlay visual en pantalla con el error de compilación.
   */
  showVisualError(title, message) {
    const errorDiv = document.createElement('div');
    errorDiv.style.position = 'fixed';
    errorDiv.style.top = '10px';
    errorDiv.style.left = '10px';
    errorDiv.style.right = '10px';
    errorDiv.style.bottom = '10px';
    errorDiv.style.background = 'rgba(30, 0, 0, 0.95)';
    errorDiv.style.color = '#ff6b6b';
    errorDiv.style.fontFamily = 'monospace';
    errorDiv.style.padding = '20px';
    errorDiv.style.overflow = 'auto';
    errorDiv.style.zIndex = '99999';
    errorDiv.style.border = '2px solid #ff0000';
    errorDiv.style.borderRadius = '8px';
    
    errorDiv.innerHTML = `
      <h2 style="margin-top:0;color:#ff3333;">⚠️ ERROR DETECTADO EN WEBGPU: ${title}</h2>
      <pre style="white-space:pre-wrap;background:#2a0505;padding:15px;border:1px solid #551111;border-radius:4px;color:#ffcccc;">${message}</pre>
    `;
    document.body.appendChild(errorDiv);
  }

  /**
   * Actualiza el temporizador de fase y gestiona el clímax sonoro.
   * Lanza los créditos de cierre cinemáticos en el segundo 15.
   */
  update(dt, input, synth) {
    if (synth) {
      this.synth = synth;
    }

    // 1. Iniciar banda sonora de órgano de iglesia interestelar en el primer frame
    if (synth && this.tessTime === 0.0) {
      synth.startTesseractSound();
    }

    // 2. Incrementar reloj de la fase
    this.tessTime += dt;

    // 3. Paneo interactivo Yaw/Pitch suave
    const lerpRotSpeed = 0.12;
    this.yawSmooth += (this.yaw - this.yawSmooth) * lerpRotSpeed;
    this.pitchSmooth += (this.pitch - this.pitchSmooth) * lerpRotSpeed;

    // 4. Final de la transmisión: Mostrar créditos de cierre cinemáticos en 15s
    if (this.tessTime >= 15.0) {
      this.isDone = true;
      if (!this.creditsTriggered) {
        this.startCreditsSequence();
      }
    }

    // 5. Configurar prompt HUD explicativo
    if (this.promptEl) {
      if (this.isDone) {
        this.promptEl.classList.remove('show');
      } else {
        this.promptEl.classList.add('show');
        this.promptEl.classList.remove('pressing');
        this.promptEl.innerText = "DENTRO DEL AGUJERO NEGRO: EL TESERACTO (4D)\n[MUEVE EL RATÓN PARA EXPLORAR LAS LÍNEAS DE TIEMPO INFINITAS]";
      }
    }

    return this.creditsTriggered;
  }

  /**
   * Copia uniformes a la GPU y ejecuta el pase de dibujado.
   */
  render(device, view, encoder, frameData) {
    if (!this.pipeline) return;

    const uniformsData = new Float32Array(8);
    uniformsData[0] = this.width;                                        // u_resolution.x
    uniformsData[1] = this.height;                                       // u_resolution.y
    uniformsData[2] = 0.5 + this.yawSmooth / (Math.PI * 2.0);             // u_mouse.x (Yaw)
    uniformsData[3] = 0.5 + this.pitchSmooth / Math.PI;                  // u_mouse.y (Pitch)
    uniformsData[4] = frameData.elapsedTime;                             // u_time
    uniformsData[5] = this.tessTime;                                     // u_tesseract_time
    uniformsData[6] = 0.0;                                               // padding
    uniformsData[7] = 0.0;                                               // padding

    device.queue.writeBuffer(this.uniformBuffer, 0, uniformsData.buffer);

    const renderPassDescriptor = {
      colorAttachments: [
        {
          view: view,
          clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 }, // Negro absoluto de fondo
          loadOp: 'clear',
          storeOp: 'store'
        }
      ]
    };

    const passEncoder = encoder.beginRenderPass(renderPassDescriptor);
    passEncoder.setPipeline(this.pipeline);
    passEncoder.setBindGroup(0, this.bindGroup);
    passEncoder.draw(3);
    passEncoder.end();
  }

  /**
   * Crea el contenedor de créditos cinemáticos oscurecidos en el DOM.
   */
  createCredits() {
    if (document.getElementById('core-credits-container')) return;

    this.creditsEl = document.createElement('div');
    this.creditsEl.id = 'core-credits-container';
    this.creditsEl.className = 'credits-container show darken';

    document.body.appendChild(this.creditsEl);
  }

  /**
   * Secuencia de créditos en fundidos cruzados.
   */
  startCreditsSequence() {
    if (this.creditsTriggered) return;
    this.creditsTriggered = true;
    console.log("PhaseTesseract: Iniciando secuencia de títulos de cine.");

    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointerup', this.onPointerUp);

    this.createCredits();

    const slidesData = [
      {
        title: "GEOMETRIC TEMPLE",
        subtitle: "Una Odisea Sensorial Generativa"
      },
      {
        text: "Creado y Desarrollado por",
        subtext: "Pepe Amoedo"
      },
      {
        text: "Implementado con tecnologías nativas",
        subtext: "WebGPU & Web Audio API"
      },
      {
        text: "Síntesis de Audio y Gráficos 3D",
        subtext: "100% Procedimentales en Tiempo Real"
      },
      {
        title: "GEOMETRIC TEMPLE",
        subtitle: "Fin de la Transmisión"
      }
    ];

    slidesData.forEach((slide, idx) => {
      const slideEl = document.createElement('div');
      slideEl.className = 'credits-slide';
      slideEl.id = `credits-slide-${idx}`;

      if (slide.title) {
        const titleEl = document.createElement('div');
        titleEl.className = 'credits-title';
        titleEl.innerText = slide.title;
        slideEl.appendChild(titleEl);
      }

      if (slide.subtitle) {
        const subtitleEl = document.createElement('div');
        subtitleEl.className = 'credits-subtitle';
        subtitleEl.innerText = slide.subtitle;
        slideEl.appendChild(subtitleEl);
      }

      if (slide.text) {
        const textEl = document.createElement('div');
        textEl.className = 'credits-text';
        textEl.innerText = slide.text;
        slideEl.appendChild(textEl);
      }

      if (slide.subtext) {
        const subtextEl = document.createElement('div');
        subtextEl.className = 'credits-subtext';
        subtextEl.innerText = slide.subtext;
        slideEl.appendChild(subtextEl);
      }

      this.creditsEl.appendChild(slideEl);
    });

    // Silenciar masterGain suavemente
    if (this.synth && this.synth.isInitialized) {
      const t = this.synth.ctx.currentTime;
      this.synth.masterGain.gain.cancelScheduledValues(t);
      this.synth.masterGain.gain.setValueAtTime(this.synth.masterGain.gain.value, t);
      this.synth.masterGain.gain.exponentialRampToValueAtTime(0.0001, t + 10.0);
    }

    let currentSlideIdx = 0;

    const displayNextSlide = () => {
      if (currentSlideIdx >= slidesData.length) {
        console.log("PhaseTesseract: Fin de créditos alcanzado.");
        return;
      }

      const activeSlide = document.getElementById(`credits-slide-${currentSlideIdx}`);
      if (activeSlide) {
        activeSlide.classList.add('active');
      }

      setTimeout(() => {
        if (activeSlide) {
          activeSlide.classList.remove('active');
        }
        currentSlideIdx++;

        setTimeout(displayNextSlide, 1300);
      }, 3200);
    };

    setTimeout(displayNextSlide, 800);
  }

  resize(width, height) {
    this.width = width;
    this.height = height;
  }

  destroy() {
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointerup', this.onPointerUp);

    if (this.uniformBuffer) {
      this.uniformBuffer.destroy();
    }
    this.pipeline = null;
    this.uniformBuffer = null;
    this.bindGroupLayout = null;
    this.bindGroup = null;

    if (this.creditsEl) {
      const credits = this.creditsEl;
      if (credits.parentNode) {
        credits.parentNode.removeChild(credits);
      }
      this.creditsEl = null;
    }

    console.log("PhaseTesseract: Recursos del Teseracto liberados de GPU.");
  }
}
