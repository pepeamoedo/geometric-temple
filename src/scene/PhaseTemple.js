/**
 * PhaseTemple
 * 
 * Gestiona la segunda escena (STATE_TEMPLE).
 * Implementa el viaje en 3D del usuario aproximándose al templo procedimental:
 * un Dodecaedro Rómbico Estrellado flotando en el vacío cósmico.
 * Controla el avance en Z, la detección del límite físico (colisión a z = -0.8)
 * y activa el fundido a blanco exponencial expandiendo el núcleo de la estrella.
 */
const A = Math.sqrt(2);
const B = Math.sqrt(3);
const C = Math.sqrt(5);

export class PhaseTemple {
  constructor() {
    this.device = null;
    this.format = null;

    // Recursos de WebGPU
    this.pipeline = null;
    this.uniformBuffer = null;
    this.bindGroupLayout = null;
    this.bindGroup = null;

    // Dimensiones internas
    this.width = window.innerWidth;
    this.height = window.innerHeight;

    // Control de cámara en 3D
    this.cameraZ = 14.0; // Inicia en Z positivo lejano (para verse desde extremadamente lejos)
    this.cameraSpeed = 0.0; // Velocidad de avance actual (inicia en 0 para momentum)
    this.maxSpeed = 0.95; // Velocidad máxima de avance voluntario

    // Mecánica de transición (El Umbral)
    this.collisionLimit = 0.8; // Colisiona cerca de la estrella (z = 0.8)
    this.coreExpansion = 0.0;   // Crecimiento de la luz central
    this.fade = 1.0;            // Fundido de entrada inicial (1.0 -> 0.0)
    this.isCollided = false;

    // Referencia al elemento DOM del prompt interactivo
    this.promptEl = null;
  }

  /**
   * Inicializa la GPU y compila el shader modular en código WGSL.
   */
  async init(device, format) {
    this.device = device;
    this.format = format;

    // Obtener la referencia al prompt interactivo
    this.promptEl = document.getElementById('temple-prompt');

    // ======================================================================
    // CÓDIGO WGSL: RENDERIZADO 3D DE DODECAEDRO RÓMBICO ESTRELLADO
    // ======================================================================
    const wgslSource = `
      struct Uniforms {
        u_resolution : vec2<f32>, // Offset 0, size 8
        u_mouse      : vec2<f32>, // Offset 8, size 8
        u_camera_z   : f32,       // Offset 16, size 4
        u_expansion  : f32,       // Offset 20, size 4
        u_time       : f32,       // Offset 24, size 4
        u_padding1   : f32,       // Offset 28, size 4 (Alineación perfecta a 32 bytes)
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

      // Vertex Shader Procedural Fullscreen
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

      // --- FUNCIONES MATEMÁTICAS ---
      
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

      // --- SDF ESTRELLA DE ESCHER (MERKABA) ---
      
      fn sdTetrahedron(p : vec3<f32>, r : f32) -> f32 {
        let q = abs(p);
        let d = max(max(q.x + q.y - q.z, q.x - q.y + q.z), -q.x + q.y + q.z) - r;
        return d * (1.0 / B);
      }

      fn sdMerkaba(p : vec3<f32>, r : f32) -> f32 {
        let d1 = sdTetrahedron(p, r);
        let d2 = sdTetrahedron(vec3<f32>(p.x, -p.y, -p.z), r);
        return min(d1, d2);
      }

      fn sdSphere(p : vec3<f32>, r : f32) -> f32 {
        return length(p) - r;
      }

      fn sdBox(p : vec3<f32>, b : vec3<f32>) -> f32 {
        let q = abs(p) - b;
        return length(max(q, vec3<f32>(0.0))) + min(max(q.x, max(q.y, q.z)), 0.0);
      }

      // Estimador de normales numérico en 3D para el Merkaba
      fn getStarNormal(p : vec3<f32>, r : f32) -> vec3<f32> {
        let eps = 0.002;
        let h = sdMerkaba(p, r);
        return normalize(vec3<f32>(
          sdMerkaba(p + vec3<f32>(eps, 0.0, 0.0), r) - h,
          sdMerkaba(p + vec3<f32>(0.0, eps, 0.0), r) - h,
          sdMerkaba(p + vec3<f32>(0.0, 0.0, eps), r) - h
        ));
      }

      // Estimador de normales numérico en 3D para el puente
      fn getBridgeNormal(p : vec3<f32>) -> vec3<f32> {
        let eps = 0.002;
        let h = sdBox(p, vec3<f32>(0.14, 0.004, 8.0));
        return normalize(vec3<f32>(
          sdBox(p + vec3<f32>(eps, 0.0, 0.0), vec3<f32>(0.14, 0.004, 8.0)) - h,
          sdBox(p + vec3<f32>(0.0, eps, 0.0), vec3<f32>(0.14, 0.004, 8.0)) - h,
          sdBox(p + vec3<f32>(0.0, 0.0, eps), vec3<f32>(0.14, 0.004, 8.0)) - h
        ));
      }

      // --- FRAGMENT SHADER ---
      @fragment
      fn fs_main(in : VertexOutput) -> @location(0) vec4<f32> {
        let uv = in.uv;
        let aspect = uniforms.u_resolution.x / uniforms.u_resolution.y;

        var p = (uv - 0.5) * 2.0;
        p.x = p.x * aspect;

        // CRT TV Transitions
        let orig_p = p;
        let u_exp = uniforms.u_expansion;
        var t_horiz = 0.0;
        var t_vert = 0.0;

        if (uniforms.u_camera_z > 5.0) {
          // ==========================================
          // EXPANSION (TV TURN-ON FROM VERTICAL LINE)
          // Y expands first from center to full height,
          // then X expands to full width.
          // ==========================================
          let E = 1.0 - u_exp; // E goes from 0.0 to 1.0
          t_vert = clamp((0.25 - E) / 0.25, 0.0, 1.0);
          t_horiz = clamp((1.0 - E) / 0.75, 0.0, 1.0);
        } else {
          // ==========================================
          // COLLAPSE (TV TURN-OFF TO HORIZONTAL LINE)
          // Y collapses first to 0, then X to a point.
          // ==========================================
          let T = u_exp; // T goes from 0.0 to 1.0
          t_vert = clamp(T / 0.75, 0.0, 1.0);
          t_horiz = clamp((T - 0.75) / 0.25, 0.0, 1.0);
        }

        let scale_x = max(0.0001, 1.0 - t_horiz);
        let scale_y = max(0.0001, 1.0 - t_vert);
        p.x = p.x / scale_x;
        p.y = p.y / scale_y;

        // Efecto realista de andar (Head-bobbing):
        // Oscilación vertical en Y (pasos) y balanceo lateral en X (hombros)
        // Vinculado a camera_z para que solo ocurra en movimiento activo
        let bobY = sin(uniforms.u_camera_z * 9.5) * 0.045;
        let bobX = cos(uniforms.u_camera_z * 4.75) * 0.025;

        // Cámara posicionada en [bobX, bobY, camera_z] mirando hacia el origen [0.0, 0.0, 0.0]
        let ro = vec3<f32>(bobX, bobY, uniforms.u_camera_z);
        var rd = normalize(vec3<f32>(p.x - bobX * 0.5, p.y - bobY * 0.5, -1.4)); // Dirección de rayo apuntando al centro de la estrella centrado

        // Defocus (blur) transition
        let active_t = max(t_horiz, t_vert);
        let noiseX = sin(orig_p.x * 2314.15 + orig_p.y * 9431.62 + uniforms.u_time * 12.0) * 0.5;
        let noiseY = cos(orig_p.x * 1432.53 + orig_p.y * 6138.87 - uniforms.u_time * 15.0) * 0.5;
        rd = normalize(rd + vec3<f32>(noiseX, noiseY, 0.0) * (active_t * 0.045));

        // Rotación lenta de la estrella flotante
        let angleX = uniforms.u_time * 0.25;
        let angleY = uniforms.u_time * 0.18;
        let rotMat = rotateY(angleY) * rotateX(angleX);

        // Raymarching
        var t : f32 = 0.0;
        var d : f32 = 0.0;
        var pos : vec3<f32> = vec3<f32>(0.0);
        var hit_star = false;
        var hit_bridge = false;
        let star_radius : f32 = 0.55;

        for (var i = 0; i < 45; i = i + 1) {
          pos = ro + rd * t;
          let rpos = rotMat * pos; // Rotación en espacio local
          
          let sin_offset = sin(pos.z * 0.4) * 0.35; // Oscilación sinusoidal del camino
          let d_star = sdMerkaba(rpos, star_radius);
          let d_bridge = sdBox(pos - vec3<f32>(sin_offset, -0.38, 8.0), vec3<f32>(0.14, 0.004, 8.0));
          d = min(d_star, d_bridge);
          
          if (d < 0.001) {
            if (d_star < d_bridge) {
              hit_star = true;
            } else {
              hit_bridge = true;
            }
            break;
          }
          t = t + d;
          if (t > 9.5) {
            break;
          }
        }

        // --- GLOW VOLUMÉTRICO ACUMULATIVO ---
        var glow : f32 = 0.0;
        var t_glow : f32 = 0.0;
        
        for (var i = 0; i < 30; i = i + 1) {
          let p_glow = ro + rd * t_glow;
          let rpos_glow = rotMat * p_glow;
          
          let d_glow = sdMerkaba(rpos_glow, star_radius);
          
          glow = glow + 0.0035 / (abs(d_glow) + 0.015);
          
          t_glow = t_glow + max(abs(d_glow) * 0.55, 0.02);
          if (t_glow > 9.0) {
            break;
          }
        }

        // --- EXPANSIÓN DEL NÚCLEO EMISIVO (El Umbral) ---
        // A medida que el usuario colisiona con la estrella y u_expansion crece,
        // una esfera de luz blanca crece en el centro tragándose todo
        let core_pulse = sin(uniforms.u_time * 5.0) * 0.05 * uniforms.u_expansion;
        let d_core = sdSphere(rotMat * pos, 0.02 + uniforms.u_expansion * 1.6 + core_pulse);
        let core_intensity = uniforms.u_expansion * uniforms.u_expansion * 22.0;
        let core_glow = core_intensity / (abs(d_core) + 0.008);

        // Tramado de puntos manga (Halftone Screentone) en el aura cósmica
        let screentone = sin(p.x * 240.0) * sin(p.y * 240.0);
        var aura_factor = glow;
        if (screentone > 0.4 && glow < 0.35) {
          aura_factor = aura_factor * 0.65; // Tramado clásico de puntos manga
        }
        let aura_base = vec3<f32>(0.05, 0.45, 0.95) * aura_factor;
        
        var color = aura_base;
        
        if (hit_star) {
          let rpos = rotMat * pos;
          let N_local = getStarNormal(rpos, star_radius);
          let N_world = transpose(rotMat) * N_local;
          
          let lightDir = normalize(vec3<f32>(0.5, 0.8, -0.4));
          let diff = max(dot(N_world, lightDir), 0.0);
          let diffStepped = step(0.18, diff) * 0.45 + step(0.6, diff) * 0.55;
          var star_color = vec3<f32>(0.0, 0.9, 1.0) * (0.3 + diffStepped * 0.7);
          
          // Contorno de tinta manga negro
          let edge = pow(1.0 - max(dot(-rd, N_world), 0.0), 3.0);
          let border = smoothstep(0.48, 0.82, edge);
          star_color = mix(star_color, vec3<f32>(0.0, 0.0, 0.02), border * 0.95);
          
          color = color + star_color;
        }

        // Estilizar y sumar la calzada cel-shaded con bordes de tinta
        if (hit_bridge) {
          let sin_offset = sin(pos.z * 0.4) * 0.35;
          let N = getBridgeNormal(pos - vec3<f32>(sin_offset, -0.38, 8.0));
          let lightDir = normalize(vec3<f32>(0.5, 0.8, -0.4));
          let diff = max(dot(N, lightDir), 0.0);
          let diffStepped = step(0.2, diff) * 0.5 + step(0.7, diff) * 0.5;
          var bridge_color = vec3<f32>(0.02, 0.45, 0.88) * (0.4 + diffStepped * 0.6);
          
          // Contorno de tinta negro
          let edge = pow(1.0 - max(dot(-rd, N), 0.0), 4.0);
          let border = smoothstep(0.40, 0.80, edge);
          bridge_color = mix(bridge_color, vec3<f32>(0.0, 0.0, 0.0), border * 0.9);
          
          // Atenuar con distancia para un difuminado perfecto
          let fade_dist = clamp((16.0 - pos.z) / 4.0, 0.0, 1.0) * clamp(pos.z / 0.5, 0.0, 1.0);
          bridge_color = bridge_color * (fade_dist * 0.8);
          
          color = color + bridge_color;
        }

        // Añadir el resplandor de la estrella expandiéndose
        color = color + vec3<f32>(0.92, 0.96, 1.0) * core_glow;

        // Fundido a blanco absoluto al superar cierto límite de expansión (desactivado para usar CRT puro)
        let final_color = color;

        // Niebla cósmica realista
        let fog_color = vec3<f32>(0.0, 0.0, 0.0);
        let col = mix(fog_color, final_color, clamp(exp(-0.22 * t), 0.0, 1.0));

        // Desfase de canales RGB (Chromatic Aberration radial) mediante derivadas analíticas de GPU
        let ca_shift = 0.012 * p;
        let dColDX = dpdx(col);
        let dColDY = dpdy(col);
        let col_r = col - dColDX * ca_shift.x - dColDY * ca_shift.y;
        let col_b = col + dColDX * ca_shift.x + dColDY * ca_shift.y;
        let final_rgb = vec3<f32>(col_r.r, col.g, col_b.b);

        // Permanent CRT Glass scanline and phosphor grille texturing
        let crt_scanline = 0.94 + 0.06 * sin(orig_p.y * 360.0);
        let phosphor_grille = 0.96 + 0.04 * sin(orig_p.x * 540.0);
        let crt_vignette = 1.0 - smoothstep(0.65, 1.4, length(orig_p));
        let final_textured = final_rgb * crt_scanline * phosphor_grille * crt_vignette;

        // CRT TV Collapse Mask, Scanlines, Noise and Phosphor Glow
        let active_x = step(abs(orig_p.x), aspect * scale_x);
        let active_y = step(abs(orig_p.y), scale_y);
        let inside_screen = active_x * active_y;

        let scanline = sin(orig_p.y * 320.0) * 0.08 * active_t;
        let noise = fract(sin(dot(orig_p.xy + uniforms.u_time, vec2<f32>(12.9898, 78.233))) * 43758.5453) * 0.12 * active_t;
        let col_noisy = final_textured - scanline + noise;

        let border_x = (1.0 - smoothstep(0.0, 0.03, abs(abs(orig_p.x) - aspect * scale_x))) * active_y;
        let border_y = (1.0 - smoothstep(0.0, 0.03, abs(abs(orig_p.y) - scale_y))) * active_x;
        let phosphor = (border_x + border_y) * vec3<f32>(0.72, 0.95, 1.0) * active_t * (1.0 - active_t);

        let final_crt = mix(vec3<f32>(0.0), col_noisy, inside_screen) + phosphor;

        return vec4<f32>(final_crt, 1.0);
      }
    `;

    // 1. Compilar código WGSL a Shader Module
    const shaderModule = this.device.createShaderModule({
      label: 'PhaseTemple Shader Module',
      code: wgslSource
    });

    // 2. Reservar memoria del Uniform Buffer (Alineación requerida de 32 bytes)
    this.uniformBuffer = this.device.createBuffer({
      label: 'PhaseTemple Uniform Buffer',
      size: 32,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });

    // 3. Crear el diseño de enlace del grupo
    this.bindGroupLayout = this.device.createBindGroupLayout({
      label: 'PhaseTemple Bind Group Layout',
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.FRAGMENT,
          buffer: {
            type: 'uniform'
          }
        }
      ]
    });

    // 4. Crear el Bind Group asignando el buffer
    this.bindGroup = this.device.createBindGroup({
      label: 'PhaseTemple Bind Group',
      layout: this.bindGroupLayout,
      entries: [
        {
          binding: 0,
          resource: {
            buffer: this.uniformBuffer
          }
        }
      ]
    });

    // 5. Configurar el diseño de la tubería
    const pipelineLayout = this.device.createPipelineLayout({
      label: 'PhaseTemple Pipeline Layout',
      bindGroupLayouts: [this.bindGroupLayout]
    });

    // 6. Generar el Render Pipeline
    this.pipeline = this.device.createRenderPipeline({
      label: 'PhaseTemple Render Pipeline',
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
            writeMask: 0xF // GPUColorWrite.ALL
          }
        ]
      },
      primitive: {
        topology: 'triangle-list'
      }
    });

    console.log("PhaseTemple: Pipeline de aproximación de estrella 3D creado.");
  }

  /**
   * Actualiza el avance de cámara, comprueba colisiones físicas e incrementa
   * la expansión del núcleo de absorción.
   * Devuelve `true` al completarse el fundido blanco completo.
   */
  update(dt, input, synth) {
    // 0. Desvanecer destello blanco de entrada inicial (1.0 -> 0.0)
    if (this.fade > 0.0) {
      this.fade = Math.max(0.0, this.fade - dt * 0.8);
    }

    // 1. Calcular distancia del puntero al centro para avance voluntario sobre el templo
    const distFromCenter = Math.sqrt(input.nx * input.nx + input.ny * input.ny);
    const isPressingTemple = input.isPointerDown && distFromCenter < 0.45;

    // 2. Control dinámico del aviso interactivo del HUD
    if (this.promptEl) {
      if (isPressingTemple && !this.isCollided) {
        this.promptEl.classList.add('pressing');
        this.promptEl.innerText = "AVANZANDO HACIA EL TEMPLO...";
      } else {
        this.promptEl.classList.remove('pressing');
        if (this.isCollided) {
          this.promptEl.innerText = "EL UMBRAL SE ABRE...";
        } else {
          this.promptEl.innerText = "MANTÉN PULSADO EL TEMPLO PARA AVANZAR";
        }
      }
    }

    // 3. Avance de cámara con inercia (Momentum)
    const targetSpeed = isPressingTemple ? this.maxSpeed : 0.0;
    this.cameraSpeed += (targetSpeed - this.cameraSpeed) * 0.08;

    if (!this.isCollided) {
      this.cameraZ -= dt * this.cameraSpeed; // Restamos Z para avanzar hacia el origen

      // Reactividad de Audio base: aumentar levemente ganancia y abrir filtro al acercarse
      if (synth) {
        // La cámara avanza desde 14.0 a 0.8. Calculamos progreso [0.0 a 1.0]
        const progress = Math.max(0.0, Math.min(1.0, (14.0 - this.cameraZ) / 13.2));
        
        // Modulación interactiva de tensión para latido y respiración LFO
        synth.setTension(progress);
        
        const targetFreq = 220.0 + progress * 80.0; // Pasa de 220Hz a 300Hz progresivamente
        const targetFilter = 1200.0 + progress * 2300.0; // Abre filtro de 1.2kHz a 3.5kHz
        const targetVol = 0.18 + progress * 0.08; // Crece ganancia ligeramente

        synth.setFrequency(targetFreq, 0.1);
        synth.setFilterCutoff(targetFilter, 0.1);
        synth.setVolume(targetVol, 0.1);
      }

      // Comprobar colisión con el límite físico de proximidad
      if (this.cameraZ <= this.collisionLimit) {
        this.cameraZ = this.collisionLimit; // Detener avance físico de cámara
        this.isCollided = true;
        console.log("[TEMPLE] Colisión física detectada. Iniciando animación de absorción.");
      }
    } else {
      // 4. Colisionado: Detención de cámara y expansión exponencial del núcleo
      // Crece muy rápido exponencialmente
      this.coreExpansion = Math.min(1.0, this.coreExpansion + dt * (0.32 + this.coreExpansion * 3.6));

      // Reactividad de Audio en colisión: subida veloz de volumen y filtro con posterior caída brusca
      if (synth) {
        // Mantener tensión máxima en colisión
        synth.setTension(1.0);

        // Barrido místico descendente hacia subgraves profundos para evitar sonido de videojuego
        const sweepFreq = 220.0 - this.coreExpansion * 165.0; // Baja de 220Hz a 55Hz
        const sweepFilter = 1200.0 - this.coreExpansion * 800.0; // Cierra el filtro a 400Hz para un tono oscuro y expansivo
        const sweepVol = 0.28 + (1.0 - this.coreExpansion) * 0.12; // Swell de volumen expansivo con fade suave

        synth.setFrequency(sweepFreq, 0.05);
        synth.setFilterCutoff(sweepFilter, 0.05);
        synth.setVolume(sweepVol, 0.05);
      }
    }

    // 5. Devolver true para disparar el cambio de fase global en el pico del blanco absoluto
    if (this.coreExpansion >= 1.0) {
      return true; // Notifica a main.js para cambiar el estado global a STATE_CORE
    }

    return false;
  }

  /**
   * Copia uniformes a la GPU y dibuja la escena.
   */
  render(device, view, encoder, frameData) {
    if (!this.pipeline) return;

    // Combinar el fundido de entrada inicial (this.fade) y la absorción de salida (this.coreExpansion)
    const activeExpansion = Math.max(this.fade, this.coreExpansion);

    // 1. Float32Array de 8 elementos (32 bytes)
    const uniformsData = new Float32Array(8);
    uniformsData[0] = this.width;                     // u_resolution.x
    uniformsData[1] = this.height;                    // u_resolution.y
    uniformsData[2] = 0.5;                            // u_mouse.x
    uniformsData[3] = 0.5;                            // u_mouse.y
    uniformsData[4] = this.cameraZ;                   // u_camera_z
    uniformsData[5] = activeExpansion;                // u_expansion (Combined fade factor)
    uniformsData[6] = frameData.elapsedTime;          // u_time
    uniformsData[7] = 0.0;                            // padding

    // Escribir en buffer GPU
    device.queue.writeBuffer(this.uniformBuffer, 0, uniformsData.buffer);

    // 2. Descriptor del Pase de Renderizado
    const renderPassDescriptor = {
      colorAttachments: [
        {
          view: view,
          clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 },
          loadOp: 'clear',
          storeOp: 'store'
        }
      ]
    };

    // 3. Codificar comandos
    const passEncoder = encoder.beginRenderPass(renderPassDescriptor);
    passEncoder.setPipeline(this.pipeline);
    passEncoder.setBindGroup(0, this.bindGroup);
    passEncoder.draw(3); // Triángulo procedural a pantalla completa
    passEncoder.end();
  }

  /**
   * Refresca las dimensiones.
   */
  resize(width, height) {
    this.width = width;
    this.height = height;
  }

  /**
   * Destruye recursos de la GPU.
   */
  destroy() {
    if (this.uniformBuffer) {
      this.uniformBuffer.destroy();
    }
    this.pipeline = null;
    this.uniformBuffer = null;
    this.bindGroupLayout = null;
    this.bindGroup = null;
    console.log("PhaseTemple: Recursos liberados.");
  }
}
