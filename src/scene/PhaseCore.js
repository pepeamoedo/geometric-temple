/**
 * PhaseCore
 * 
 * Gestiona la escena final interactiva (STATE_CORE).
 * El usuario se encuentra en el origen [0,0,0] dentro del dodecaedro
 * rómbico estrellado, renderizado como una catedral fractal infinita caleidoscópica.
 * Emplea control dinámico de vista (Pan/Tilt) sincronizado con el puntero del ratón,
 * un desvanecimiento suave de blanco a translúcido al arrancar y la actualización
 * de la espacialización de acordes polifónicos estéreo de AudioSynth.
 */
const A = Math.sqrt(2);
const B = Math.sqrt(3);
const C = Math.sqrt(5);

export class PhaseCore {
  constructor() {
    this.device = null;
    this.format = null;

    // Recursos WebGPU
    this.pipeline = null;
    this.uniformBuffer = null;
    this.bindGroupLayout = null;
    this.bindGroup = null;

    this.width = window.innerWidth;
    this.height = window.innerHeight;

    // Coordenadas suavizadas del cursor (LERP) para Yaw / Pitch de la cámara
    this.mouseSmooth = { x: 0.5, y: 0.5 };
    
    // Seguimiento delta de Yaw y Pitch en primera persona (estilo FPS)
    this.yaw = 0.0;
    this.pitch = 0.0;
    this.yawSmooth = 0.0;
    this.pitchSmooth = 0.0;
    this.lastMouseX = null;
    this.lastMouseY = null;

    // Desvanecimiento del fundido a blanco inicial (1.0 -> 0.0)
    this.fade = 1.0;
    this.audioTriggered = false;

    // Parámetros interactivos configurados por el usuario
    this.params = {
      spacing: 6.0,
      foldOffset: 0.16,
      haloIntensity: 0.74,
      structContrast: 0.46,
      rotSpeed: 0.14,
      synthVolume: 0.60
    };

    // Referencia al elemento HTML del panel de mando
    this.panelEl = null;

    // Estado del puzzle inmersivo del Tetragrammaton (YHVH)
    this.puzzleSolved = false;
    this.solvedProgress = 0.0; // Interpolación suave de resolución (0.0 -> 1.0)
    this.selectedLetterIdx = null; // Índice de la letra seleccionada para intercambio
    this.correctOrder = ['Y', 'H', 'V', 'H']; // Y, H, V, H (De izquierda a derecha)
    this.currentOrder = ['H', 'V', 'H', 'Y']; // Estado desordenado inicial
    this.puzzleEl = null;

    // Control del fundido blanco del clímax final
    this.startExitFade = false;
    this.exitFade = 0.0;
  }

  /**
   * Inicializa la GPU y compila el shader 3D de catedral infinita.
   */
  async init(device, format) {
    this.device = device;
    this.format = format;

    // ======================================================================
    // CÓDIGO WGSL: RENDERIZADO DE INTERIOR CALEIDOSCÓPICO FRACTAL DE ESTRELLA
    // ======================================================================
    const wgslSource = `
      struct Uniforms {
        u_resolution : vec2<f32>, // Offset 0, size 8
        u_mouse      : vec2<f32>, // Offset 8, size 8
        u_expansion  : f32,       // Offset 16, size 4 (Luz de fundido fade out)
        u_time       : f32,       // Offset 20, size 4
        u_spacing    : f32,       // Offset 24, size 4
        u_fold_offset: f32,       // Offset 28, size 4
        u_halo_intensity : f32,   // Offset 32, size 4
        u_struct_contrast: f32,   // Offset 36, size 4
        u_rot_speed  : f32,       // Offset 40, size 4
        u_solved     : f32,       // Offset 44, size 4 (Progreso de resolución del puzzle)
        u_padding1   : f32,       // Offset 48, size 4
        u_padding2   : f32,       // Offset 52, size 4 (Alineado a 64 bytes total)
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

      // --- MATRICES DE ROTACIÓN ---
      
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

      // --- FUNCIONES DE DIBUJO DE EFECTOS ÓPTICOS (LENS FLARE HEXAGONAL) ---

      fn sdHexagon(p : vec2<f32>, r : f32) -> f32 {
        let k = vec2<f32>(-0.866025404, 0.5);
        var q = abs(p);
        q = q - 2.0 * min(dot(k, q), 0.0) * k;
        return length(q - vec2<f32>(clamp(q.x, -(1.0 / B) * r, (1.0 / B) * r), r)) * sign(q.y - r);
      }

      fn drawHexGhost(p : vec2<f32>, center : vec2<f32>, r : f32, color : vec3<f32>) -> vec3<f32> {
        let dist = sdHexagon(p - center, r);
        let fill = smoothstep(0.015, 0.0, dist) * 0.15; // Relleno suave con bordes anti-aliasing difuminados
        return color * fill;
      }

      // --- SDF INTERIOR DE DODECAEDRO RÓMBICO ESTRELLADO ---
      
      fn sdRhombicDodecahedron(p : vec3<f32>, r : f32) -> f32 {
        let q = abs(p);
        let d1 = (q.x + q.y) * (1.0 / A);
        let d2 = (q.y + q.z) * (1.0 / A);
        let d3 = (q.z + q.x) * (1.0 / A);
        return max(max(d1, d2), d3) - r;
      }

      fn sdStellatedRhombicDodecahedron(p : vec3<f32>, r : f32) -> f32 {
        let base = sdRhombicDodecahedron(p, r);
        let q = abs(p);
        let spike_r = r * 0.42;
        let s1 = (q.x + q.y + q.z * 0.28 - spike_r) * (1.0 / B);
        let s2 = (q.y + q.z + q.x * 0.28 - spike_r) * (1.0 / B);
        let s3 = (q.z + q.x + q.y * 0.28 - spike_r) * (1.0 / B);
        return min(base, min(s1, min(s2, s3)));
      }

      // --- INTERIOR CALEIDOSCÓPICO FRACTAL (opRep + Pliegues IFS) ---
      // Calcula la distancia hacia las paredes internas multiplicadas hacia el infinito
      fn sdCatedralFractal(p : vec3<f32>, time : f32) -> f32 {
        var q = p;

        // 1. Repetición de dominios infinita en los tres ejes
        let spacing = uniforms.u_spacing;
        q.x = fract(q.x / spacing + 0.5) * spacing - spacing * 0.5;
        q.y = fract(q.y / spacing + 0.5) * spacing - spacing * 0.5;
        q.z = fract(q.z / spacing + 0.5) * spacing - spacing * 0.5;

        // Rotación levísima en las capas internas del fractal
        let slowRot = rotateY(time * 0.05) * rotateX(time * 0.03);
        q = slowRot * q;

        // 2. Pliegues simétricos caleidoscópicos repetitivos
        for (var i = 0; i < 4; i = i + 1) {
          q = abs(q) - uniforms.u_fold_offset;
          
          // Rotación local entrelazada
          let c = cos(0.42 + f32(i) * 0.08);
          let s = sin(0.42 + f32(i) * 0.08);
          let temp = q.xz;
          q.x = temp.x * c - temp.y * s;
          q.z = temp.x * s + temp.y * c;
        }

        // Evaluar la estrella desde su interior (SDF negativo)
        return -sdStellatedRhombicDodecahedron(q, 1.25);
      }

      // Estimador de normales numérico en 3D para la Catedral Fractal Caleidoscópica
      fn getFractalNormal(p : vec3<f32>, time : f32) -> vec3<f32> {
        let eps = 0.0015;
        let h = sdCatedralFractal(p, time);
        return normalize(vec3<f32>(
          sdCatedralFractal(p + vec3<f32>(eps, 0.0, 0.0), time) - h,
          sdCatedralFractal(p + vec3<f32>(0.0, eps, 0.0), time) - h,
          sdCatedralFractal(p + vec3<f32>(0.0, 0.0, eps), time) - h
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

        if (uniforms.u_solved < 0.5) {
          // ==========================================
          // EXPANSION (TV TURN-ON FROM HORIZONTAL LINE)
          // X expands first from center to full width,
          // then Y expands to full height.
          // ==========================================
          let E = 1.0 - u_exp; // E goes from 0.0 to 1.0
          t_horiz = clamp((0.25 - E) / 0.25, 0.0, 1.0);
          t_vert = clamp((1.0 - E) / 0.75, 0.0, 1.0);
        } else {
          // ==========================================
          // COLLAPSE (TV TURN-OFF TO VERTICAL LINE)
          // X collapses first to 0, then Y to a point.
          // ==========================================
          let T = u_exp; // T goes from 0.0 to 1.0
          t_horiz = clamp(T / 0.75, 0.0, 1.0);
          t_vert = clamp((T - 0.75) / 0.25, 0.0, 1.0);
        }

        let scale_x = max(0.0001, 1.0 - t_horiz);
        let scale_y = max(0.0001, 1.0 - t_vert);
        p.x = p.x / scale_x;
        p.y = p.y / scale_y;

        // Origen exacto en el centro del espacio interior [0.0, 0.0, 0.0]
        let ro = vec3<f32>(0.0, 0.0, 0.0);

        // Control de rotación interactiva por ratón (Guiñada y Cabeceo suave)
        let yaw = (uniforms.u_mouse.x - 0.5) * 3.14159265 * 2.0;  // 360º de visión horizontal
        let pitch = (uniforms.u_mouse.y - 0.5) * 3.14159265;       // Cabeceo vertical
        
        let camRot = rotateY(yaw) * rotateX(pitch);
        let rd = camRot * normalize(vec3<f32>(p.x, p.y, 1.25));

        // --- EFECTO TILT-SHIFT (DESENFOQUE ARRIBA Y ABAJO) ---
        // Desenfoque basado en la posición vertical de la pantalla (abs(in.uv.y - 0.5))
        let dist_y = abs(in.uv.y - 0.5);
        let blur_amount = smoothstep(0.15, 0.5, dist_y) * 0.038;
        
        // Ruido pseudo-aleatorio de alta frecuencia basado en coordenadas de pantalla y tiempo
        let noiseX = sin(in.uv.x * 2314.15 + in.uv.y * 9431.62 + uniforms.u_time * 12.0) * 0.5;
        let noiseY = cos(in.uv.x * 1432.53 + in.uv.y * 6138.87 - uniforms.u_time * 15.0) * 0.5;

        // Rayo perturbado para simular dispersión de profundidad de campo y desenfoque de transición
        let active_t = max(t_horiz, t_vert);
        let total_blur = blur_amount + active_t * 0.05;
        let perturbed_rd = normalize(rd + vec3<f32>(noiseX, noiseY, 0.0) * total_blur);

        // Rotación general muy leve de la estructura física del entorno
        let structRot = rotateY(uniforms.u_time * uniforms.u_rot_speed) * rotateX(uniforms.u_time * uniforms.u_rot_speed * 0.625);

        // Raymarching con el rayo perturbado
        var t : f32 = 0.02;
        var d : f32 = 0.0;
        var pos : vec3<f32> = vec3<f32>(0.0);
        var hit = false;

        for (var i = 0; i < 48; i = i + 1) {
          pos = ro + perturbed_rd * t;
          let rpos = structRot * pos; // Rotar estructura física ligeramente
          
          d = sdCatedralFractal(rpos, uniforms.u_time);
          
          if (d < 0.0005) {
            hit = true;
            break;
          }
          t = t + d;
          if (t > 7.5) {
            break;
          }
        }

        // --- GLOW VOLUMÉTRICO CRISTALINO ---
        var glow : f32 = 0.0;
        var t_glow : f32 = 0.05;
        
        for (var i = 0; i < 24; i = i + 1) {
          let p_glow = ro + perturbed_rd * t_glow;
          let rpos_glow = structRot * p_glow;
          
          let d_glow = sdCatedralFractal(rpos_glow, uniforms.u_time);
          
          glow = glow + 0.0028 / (abs(d_glow) + 0.009);
          
          t_glow = t_glow + max(abs(d_glow) * 0.55, 0.03);
          if (t_glow > 6.0) {
            break;
          }
        }

        // --- ILUMINACIÓN CATEDRAL DE LUZ INVERTIDA ---
        // Fondo gélido blanco-azul y estructuras oscuras de alto contraste con halos dorados
        let base_color = vec3<f32>(0.96, 0.97, 1.0);
        
        // Efecto del puzzle resuelto: Transición del fondo a un santuario dorado celestial y arcoíris rotativo
        let solved_bg = vec3<f32>(0.98, 0.95, 0.86) + 0.04 * vec3<f32>(
          sin(uniforms.u_time * 1.8),
          cos(uniforms.u_time * 1.2),
          sin(uniforms.u_time * 0.7)
        );
        let active_base_color = mix(base_color, solved_bg, uniforms.u_solved);
        let depth_factor = clamp(t / 6.0, 0.0, 1.0);

        var color = active_base_color;

        if (hit) {
          // Estructura oscura de oro viejo y cobalto profundo
          let old_gold = vec3<f32>(0.12, 0.10, 0.06);
          let deep_cobalt = vec3<f32>(0.01, 0.04, 0.16);
          
          // Efecto del puzzle resuelto: Transición de la estructura a oro radiante brillante
          let struct_solved = mix(vec3<f32>(0.42, 0.32, 0.08), vec3<f32>(0.95, 0.72, 0.15), depth_factor);
          
          let struct_color = mix(old_gold, deep_cobalt, depth_factor);
          let active_struct_color = mix(struct_color, struct_solved, uniforms.u_solved);
          
          // Estimar normales para sombreado cel-shaded y bordes manga
          let rpos = structRot * pos;
          let N_local = getFractalNormal(rpos, uniforms.u_time);
          let N_world = transpose(structRot) * N_local;
          
          let lightDir = normalize(vec3<f32>(0.3, 0.9, -0.2));
          let diff = max(dot(N_world, lightDir), 0.0);
          let diffStepped = step(0.18, diff) * 0.45 + step(0.65, diff) * 0.55;
          var cel_shaded_color = active_struct_color * (0.35 + diffStepped * 0.65);
          
          // Contornos de tinta negra gruesos para las bóvedas fractales
          let edge = pow(1.0 - max(dot(-perturbed_rd, N_world), 0.0), 3.0);
          let border = smoothstep(0.48, 0.85, edge);
          cel_shaded_color = mix(cel_shaded_color, vec3<f32>(0.0, 0.0, 0.01), border * 0.92);
          
          color = mix(active_base_color, cel_shaded_color, uniforms.u_struct_contrast);
        }

        // Halos de luz dorada aditiva que delinean los arcos geométricos
        let gold_glow = vec3<f32>(1.0, 0.85, 0.45);
        
        // Efecto del puzzle resuelto: Rampa de intensidad de halo para luz cegadora e inmersiva
        let active_halo = uniforms.u_halo_intensity * (1.0 + uniforms.u_solved * 1.6);
        color = color + gold_glow * (glow * active_halo);

        // --- DESVANECIMIENTO DEL DESTRELLO BLANCO AL INICIAR ---
        // uniforms.u_expansion va de 1.0 a 0.0
        var final_color = mix(color, vec3<f32>(1.0), uniforms.u_expansion);

        // --- EFECTO DE REFLEJOS DE LENTES HEXAGONALES (LENS FLARES) ---
        // Posición proyectada de la fuente de luz en pantalla basándonos en la orientación de cámara
        let light_pos = vec2<f32>(sin(yaw) * 0.55, sin(pitch) * 0.55) * aspect;
        let flare_vec = -light_pos; // Vector que cruza el centro de la lente
        
        var flare = vec3<f32>(0.0);
        
        // 4 Fantasmas hexagonales con dispersión cromática simulada y halo circular
        let flare_p = p;
        flare = flare + drawHexGhost(flare_p, light_pos + flare_vec * 0.35, 0.06, vec3<f32>(1.0, 0.85, 0.45));  // Oro viejo
        flare = flare + drawHexGhost(flare_p, light_pos + flare_vec * 0.70, 0.12, vec3<f32>(0.2, 0.55, 1.0));  // Azul cobalto
        flare = flare + drawHexGhost(flare_p, light_pos + flare_vec * 1.15, 0.18, vec3<f32>(1.0, 0.42, 0.60));  // Rosa espectro
        flare = flare + drawHexGhost(flare_p, light_pos + flare_vec * 1.45, 0.08, vec3<f32>(0.25, 0.95, 0.50)); // Verde aura

        // Halo circular de difracción cromática
        let ring_dist = length(flare_p - (light_pos + flare_vec * 0.9));
        let ring_glow = smoothstep(0.012, 0.0, abs(ring_dist - 0.28)) * 0.06;
        flare = flare + vec3<f32>(0.95, 0.82, 1.0) * ring_glow;

        // Mezclar reflejos de lente en función de la disipación del destello de entrada
        let flare_intensity = clamp(1.0 - uniforms.u_expansion, 0.0, 1.0);
        var col = final_color + flare * (flare_intensity * 0.65);

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
        let crt_vignette = smoothstep(1.4, 0.65, length(orig_p));
        let final_textured = final_rgb * crt_scanline * phosphor_grille * crt_vignette;

        // CRT TV Collapse Mask, Scanlines, Noise and Phosphor Glow
        let active_x = step(abs(orig_p.x), aspect * scale_x);
        let active_y = step(abs(orig_p.y), scale_y);
        let inside_screen = active_x * active_y;

        let scanline = sin(orig_p.y * 320.0) * 0.08 * active_t;
        let noise = fract(sin(dot(orig_p.xy + uniforms.u_time, vec2<f32>(12.9898, 78.233))) * 43758.5453) * 0.12 * active_t;
        let col_noisy = final_textured - scanline + noise;

        let border_x = smoothstep(0.03, 0.0, abs(abs(orig_p.x) - aspect * scale_x)) * active_y;
        let border_y = smoothstep(0.03, 0.0, abs(abs(orig_p.y) - scale_y)) * active_x;
        let phosphor = (border_x + border_y) * vec3<f32>(0.72, 0.95, 1.0) * active_t * (1.0 - active_t);

        let final_crt = mix(vec3<f32>(0.0), col_noisy, inside_screen) + phosphor;

        return vec4<f32>(final_crt, 1.0);
      }
    `;

    // 1. Compilar código WGSL a Shader Module
    const shaderModule = this.device.createShaderModule({
      label: 'PhaseCore Shader Module',
      code: wgslSource
    });

    // 2. Reservar memoria del Uniform Buffer (Alineación requerida de 64 bytes para 16 floats)
    this.uniformBuffer = this.device.createBuffer({
      label: 'PhaseCore Uniform Buffer',
      size: 64,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });

    // 3. Crear el diseño de enlace del grupo
    this.bindGroupLayout = this.device.createBindGroupLayout({
      label: 'PhaseCore Bind Group Layout',
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
      label: 'PhaseCore Bind Group',
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
      label: 'PhaseCore Pipeline Layout',
      bindGroupLayouts: [this.bindGroupLayout]
    });

    // 6. Generar el Render Pipeline
    this.pipeline = this.device.createRenderPipeline({
      label: 'PhaseCore Render Pipeline',
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

    console.log("PhaseCore: Pipeline de interior fractal de la estrella 3D creado.");
    
    // Crear el panel de mando con sliders en la escena final (Ocultado a petición del usuario)
    // this.createControlPanel();

    // Crear el puzzle del Tetragrammaton hebreo en la escena final
    this.createPuzzle();

    // Registrar escuchadores de ratón delta interactivos (FPS)
    this.onPointerMove = this.onPointerMove.bind(this);
    this.onPointerDown = this.onPointerDown.bind(this);
    this.onPointerUp = this.onPointerUp.bind(this);

    window.addEventListener('pointermove', this.onPointerMove, { passive: true });
    window.addEventListener('pointerdown', this.onPointerDown, { passive: true });
    window.addEventListener('pointerup', this.onPointerUp, { passive: true });
  }

  /**
   * Captura el movimiento delta del ratón y arrastre táctil para mirada libre.
   */
  onPointerMove(e) {
    if (this.puzzleSolved) return;

    let dx = e.movementX;
    let dy = e.movementY;

    // Fallback táctil/móvil si movementX no está definido
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
    this.yaw += dx * sensitivity;
    this.pitch -= dy * sensitivity; // Y invertido para visión natural

    // Limitar el cabeceo (Pitch) entre -80º y +80º para evitar dar la vuelta
    const maxPitch = 80 * Math.PI / 180;
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
   * Crea dinámicamente un panel de control con sliders ("slices") en el DOM
   * y enlaza los eventos para interactuar en tiempo real con los parámetros 3D.
   */
  createControlPanel() {
    if (document.getElementById('core-control-panel')) return;

    this.panelEl = document.createElement('div');
    this.panelEl.id = 'core-control-panel';
    this.panelEl.className = 'control-panel';

    this.panelEl.innerHTML = `
      <div class="control-panel-title">
        <span>Catedral Fractal</span>
        <span style="font-size: 0.65rem; color: #00ddff; letter-spacing: 0.1em;">Parámetros 3D</span>
      </div>
      
      <div class="control-group">
        <label class="control-label">
          Espaciado Espacial
          <span class="control-value" id="val-spacing">${this.params.spacing.toFixed(2)}</span>
        </label>
        <input type="range" class="control-slider" id="slider-spacing" min="1.5" max="6.0" step="0.05" value="${this.params.spacing}">
      </div>

      <div class="control-group">
        <label class="control-label">
          Pliegue Fractal (IFS)
          <span class="control-value" id="val-fold">${this.params.foldOffset.toFixed(2)}</span>
        </label>
        <input type="range" class="control-slider" id="slider-fold" min="0.05" max="0.60" step="0.01" value="${this.params.foldOffset}">
      </div>

      <div class="control-group">
        <label class="control-label">
          Intensidad de Halo
          <span class="control-value" id="val-halo">${this.params.haloIntensity.toFixed(2)}</span>
        </label>
        <input type="range" class="control-slider" id="slider-halo" min="0.00" max="1.00" step="0.02" value="${this.params.haloIntensity}">
      </div>

      <div class="control-group">
        <label class="control-label">
          Contraste Estructura
          <span class="control-value" id="val-contrast">${this.params.structContrast.toFixed(2)}</span>
        </label>
        <input type="range" class="control-slider" id="slider-contrast" min="0.00" max="1.00" step="0.02" value="${this.params.structContrast}">
      </div>

      <div class="control-group">
        <label class="control-label">
          Velocidad Rotación
          <span class="control-value" id="val-rot">${this.params.rotSpeed.toFixed(2)}</span>
        </label>
        <input type="range" class="control-slider" id="slider-rot" min="0.00" max="0.40" step="0.01" value="${this.params.rotSpeed}">
      </div>

      <div class="control-group">
        <label class="control-label">
          Volumen Atmosférico
          <span class="control-value" id="val-vol">${this.params.synthVolume.toFixed(2)}</span>
        </label>
        <input type="range" class="control-slider" id="slider-vol" min="0.00" max="0.60" step="0.02" value="${this.params.synthVolume}">
      </div>
    `;

    document.body.appendChild(this.panelEl);

    // Enlazar eventos de cambio para actualizar los parámetros en tiempo real
    const setupSlider = (id, paramKey, valId) => {
      const slider = document.getElementById(id);
      const valEl = document.getElementById(valId);
      if (slider && valEl) {
        slider.addEventListener('input', (e) => {
          const val = parseFloat(e.target.value);
          this.params[paramKey] = val;
          valEl.innerText = val.toFixed(2);
        });
      }
    };

    setupSlider('slider-spacing', 'spacing', 'val-spacing');
    setupSlider('slider-fold', 'foldOffset', 'val-fold');
    setupSlider('slider-halo', 'haloIntensity', 'val-halo');
    setupSlider('slider-contrast', 'structContrast', 'val-contrast');
    setupSlider('slider-rot', 'rotSpeed', 'val-rot');
    setupSlider('slider-vol', 'synthVolume', 'val-vol');

    // Animación de entrada suave
    setTimeout(() => {
      if (this.panelEl) {
        this.panelEl.classList.add('show');
      }
    }, 100);
  }

  /**
   * Crea dinámicamente el contenedor HTML y las fichas para el puzzle del Tetragrammaton
   * sagrado hebreo (יהוה) y lo acopla al DOM de forma inmersiva.
   */
  createPuzzle() {
    if (document.getElementById('core-puzzle-container')) return;

    this.puzzleEl = document.createElement('div');
    this.puzzleEl.id = 'core-puzzle-container';
    this.puzzleEl.className = 'puzzle-container';

    this.puzzleEl.innerHTML = `
      <div class="puzzle-title">El Nombre Inefable</div>
      <div class="puzzle-instructions">El umbral de luz está sellado. Ordena las cuatro letras sagradas de izquierda a derecha para revelar la Verdad Eterna y despertar el plano celestial.</div>
      <div class="puzzle-slots" id="puzzle-slots"></div>
      <div class="puzzle-status" id="puzzle-status">Selecciona dos letras para intercambiar sus posiciones.</div>
    `;

    document.body.appendChild(this.puzzleEl);
    this.renderPuzzleLetters();

    // Animación suave de aparición flotante
    setTimeout(() => {
      if (this.puzzleEl) {
        this.puzzleEl.classList.add('show');
      }
    }, 1200);
  }

  /**
   * Renderiza dinámicamente las placas de letras hebreas con sus estados activos
   * y efectos de brillo sagrado al resolver.
   */
  renderPuzzleLetters() {
    const slotsEl = document.getElementById('puzzle-slots');
    if (!slotsEl) return;

    slotsEl.innerHTML = '';
    this.currentOrder.forEach((letter, idx) => {
      const btn = document.createElement('div');
      btn.className = 'puzzle-letter';
      
      if (this.puzzleSolved) {
        btn.classList.add('correct-glow');
      } else if (this.selectedLetterIdx === idx) {
        btn.classList.add('selected');
      }
      
      btn.innerText = letter;

      if (!this.puzzleSolved) {
        btn.addEventListener('click', () => this.handleLetterClick(idx));
      }

      slotsEl.appendChild(btn);
    });
  }

  /**
   * Gestiona el clic interactivo y el intercambio de posiciones (swap).
   */
  handleLetterClick(idx) {
    if (this.selectedLetterIdx === null) {
      this.selectedLetterIdx = idx;
    } else {
      if (this.selectedLetterIdx !== idx) {
        // Intercambiar las letras
        const temp = this.currentOrder[this.selectedLetterIdx];
        this.currentOrder[this.selectedLetterIdx] = this.currentOrder[idx];
        this.currentOrder[idx] = temp;
      }
      this.selectedLetterIdx = null;
    }
    
    this.renderPuzzleLetters();
    this.checkPuzzleSolved();
  }

  /**
   * Comprueba si el orden coincide de izquierda a derecha con Y, H, V, H.
   * Si es correcto, activa las animaciones del shader y el sweep armónico del sintetizador.
   */
  checkPuzzleSolved() {
    let solved = true;
    for (let i = 0; i < this.correctOrder.length; i++) {
      if (this.currentOrder[i] !== this.correctOrder[i]) {
        solved = false;
        break;
      }
    }

    if (solved && !this.puzzleSolved) {
      this.puzzleSolved = true;
      this.renderPuzzleLetters();
      
      const statusEl = document.getElementById('puzzle-status');
      if (statusEl) {
        statusEl.className = 'puzzle-status solved';
        statusEl.innerText = "¡YHVH! EL NOMBRE INEFABLE HA SIDO PROCLAMADO.";
      }

      // Disparar el clímax sonoro místico en AudioSynth
      if (this.synth) {
        this.synth.triggerSolvedClimax();
        
        // Proclamar con trompetas celestiales de latón
        this.synth.playCelestialTrumpets();
      }

      // Retardo de 2 segundos (un par de segundos) antes del fundido en blanco final
      setTimeout(() => {
        this.startExitFade = true;
        console.log("PhaseCore: Iniciando fundido en blanco de salida final.");
      }, 2000);

      console.log("PhaseCore: ¡Tetragrammaton resuelto! Acorde elevado, trompetas celestiales y fundido a blanco final programado.");
    }
  }

  /**
   * Actualiza los cálculos interactivos, interpola la visión del ratón
   * y desencadena la síntesis polifónica espacial de AudioSynth.
   * Devuelve `false` para ejecutarse de forma persistente como escena final infinita.
   */
  update(dt, input, synth) {
    if (synth) {
      this.synth = synth;
    }

    // 1. Desvanecimiento suave del fogonazo blanco de entrada (1.0 -> 0.0)
    if (this.fade > 0.0) {
      this.fade = Math.max(0.0, this.fade - dt * 0.7); // Tarda aprox 1.4s en disiparse por completo
    }

    // Animar la transición del shader de forma ultra suave cuando se resuelve el puzzle
    if (this.puzzleSolved && this.solvedProgress < 1.0) {
      this.solvedProgress = Math.min(1.0, this.solvedProgress + dt * 0.55); // Se resuelve en aprox 1.8 segundos
    }

    // Animar el fundido a blanco final del clímax místico tras el retardo de 2 segundos
    if (this.startExitFade && this.exitFade < 1.0) {
      this.exitFade = Math.min(1.0, this.exitFade + dt * 0.45); // Se funde en blanco completo en aprox 2.2 segundos
    }

    // 2. LERP para suavizar la vista horizontal (Yaw) y vertical (Pitch) del mouse delta
    const lerpSpeed = 0.12;
    this.yawSmooth += (this.yaw - this.yawSmooth) * lerpSpeed;
    this.pitchSmooth += (this.pitch - this.pitchSmooth) * lerpSpeed;

    // 3. Activar la síntesis polifónica de acorde de Séptima Mayor cristalina en AudioSynth
    if (synth && !this.audioTriggered) {
      this.audioTriggered = true;
      // Frecuencia Solfeggio 285Hz o 220Hz (La3) como tónica
      synth.startCoreResonance(220.0);
    }

    // 4. Actualizar la órbita de paneo estéreo interactiva basada en el reloj de AudioSynth
    if (synth && this.audioTriggered) {
      // Modulación dinámica de volumen según el slider
      synth.setVolume(this.params.synthVolume, 0.05);

      // Pasamos el tiempo transcurrido para modular la fase del paneo estéreo
      const elapsed = performance.now() * 0.001;
      synth.updateCorePanners(elapsed);
    }

    // Devuelve true para disparar el cambio de fase global a STATE_DUNES en el pico del blanco absoluto
    if (this.exitFade >= 1.0) {
      return true;
    }

    return false; // Escena infinita contemplativa
  }

  /**
   * Copia uniformes a la GPU y codifica el pase de renderizado.
   */
  render(device, view, encoder, frameData) {
    if (!this.pipeline) return;

    // 1. Float32Array de 16 elementos (64 bytes)
    const uniformsData = new Float32Array(16);
    uniformsData[0] = this.width;                     // u_resolution.x
    uniformsData[1] = this.height;                    // u_resolution.y
    uniformsData[2] = 0.5 + this.yawSmooth / (Math.PI * 2.0);             // u_mouse.x (Controla Yaw)
    uniformsData[3] = 0.5 + this.pitchSmooth / Math.PI;                  // u_mouse.y (Controla Pitch)
    uniformsData[4] = Math.max(this.fade, this.exitFade); // u_expansion (Fundido de entrada O de salida final a blanco)
    uniformsData[5] = frameData.elapsedTime;          // u_time
    uniformsData[6] = this.params.spacing;            // u_spacing
    uniformsData[7] = this.params.foldOffset;         // u_fold_offset
    uniformsData[8] = this.params.haloIntensity;      // u_halo_intensity
    uniformsData[9] = this.params.structContrast;     // u_struct_contrast
    uniformsData[10] = this.params.rotSpeed;          // u_rot_speed
    uniformsData[11] = this.solvedProgress;           // u_solved (Progreso de resolución del puzzle)
    uniformsData[12] = 0.0;                           // padding
    uniformsData[13] = 0.0;                           // padding
    uniformsData[14] = 0.0;                           // padding
    uniformsData[15] = 0.0;                           // padding

    // Escribir en buffer GPU
    device.queue.writeBuffer(this.uniformBuffer, 0, uniformsData.buffer);

    // 2. Descriptor de render pass
    const renderPassDescriptor = {
      colorAttachments: [
        {
          view: view,
          clearValue: { r: 0.96, g: 0.97, b: 1.0, a: 1.0 }, // Blanco-azul gélido por si falla el shader o durante clear
          loadOp: 'clear',
          storeOp: 'store'
        }
      ]
    };

    // 3. Codificar comandos
    const passEncoder = encoder.beginRenderPass(renderPassDescriptor);
    passEncoder.setPipeline(this.pipeline);
    passEncoder.setBindGroup(0, this.bindGroup);
    passEncoder.draw(3); // Pintar triángulo fullscreen
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
    // Remover escuchadores de ratón delta
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

    // Remover panel de control interactivo del DOM
    if (this.panelEl) {
      this.panelEl.classList.remove('show');
      const panel = this.panelEl;
      setTimeout(() => {
        if (panel && panel.parentNode) {
          panel.parentNode.removeChild(panel);
        }
      }, 1200);
      this.panelEl = null;
    }

    // Remover contenedor del puzzle del DOM
    if (this.puzzleEl) {
      this.puzzleEl.classList.remove('show');
      const puzzle = this.puzzleEl;
      setTimeout(() => {
        if (puzzle && puzzle.parentNode) {
          puzzle.parentNode.removeChild(puzzle);
        }
      }, 1500);
      this.puzzleEl = null;
    }

    // Remover contenedor de créditos cinematográficos
    if (this.creditsEl) {
      const credits = this.creditsEl;
      if (credits.parentNode) {
        credits.parentNode.removeChild(credits);
      }
      this.creditsEl = null;
    }

    console.log("PhaseCore: Catedral fractal liberada de GPU.");
  }
}
