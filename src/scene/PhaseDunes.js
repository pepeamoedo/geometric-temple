/**
 * PhaseDunes
 * 
 * Epílogo interactivo del desierto de dunas (STATE_DUNES).
 * El jugador recorre libremente el desierto en primera persona mediante el teclado
 * (WASD y Teclas de dirección) mientras mira a su alrededor en 360 grados de forma intuitiva
 * con el ratón (control de visión en primera persona estilo FPS).
 * Debe encontrar un artefacto octaédrico sagrado semi-enterrado en la arena que emite
 * un haz de luz cian neón vertical visible desde lejos. Al aproximarse a él, concluye el viaje.
 */
const A = Math.sqrt(2);
const B = Math.sqrt(3);
const C = Math.sqrt(5);

export class PhaseDunes {
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

    // Coordenadas suavizadas del cursor (LERP) para Yaw / Pitch de la mirada libre
    this.mouseSmooth = { x: 0.5, y: 0.5 };

    // Seguimiento delta de Yaw y Pitch en primera persona (estilo FPS)
    this.yaw = 0.0;
    this.pitch = 0.0;
    this.yawSmooth = 0.0;
    this.pitchSmooth = 0.0;
    this.lastMouseX = null;
    this.lastMouseY = null;

    // Coordenadas físicas en 3D de la cámara en el desierto (control voluntario)
    this.cameraX = 0.0;
    this.cameraZ = 0.0;
    this.cameraY = 0.52;
    this.stepTimer = 0.0;

    // Posición del artefacto sagrado en el espacio del desierto
    this.objX = 1.5;
    this.objZ = 7.5;

    // Fades de transición
    this.fade = 1.0; // Desvanecimiento inicial a blanco (1.0 -> 0.0)
    this.exitFade = 0.0; // Desvanecimiento final a negro (0.0 -> 1.0)
    this.isDone = false;

    // Control de teclado activo
    this.keys = {
      w: false, a: false, s: false, d: false,
      ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false
    };

    // Estado del audio
    this.audioTriggered = false;

    // Recursos de créditos
    this.creditsTriggered = false;
    this.creditsEl = null;
    this.promptEl = null;

    // Enlazar manejadores de eventos
    this.onKeyDown = this.onKeyDown.bind(this);
    this.onKeyUp = this.onKeyUp.bind(this);
    this.onPointerMove = this.onPointerMove.bind(this);
    this.onPointerDown = this.onPointerDown.bind(this);
    this.onPointerUp = this.onPointerUp.bind(this);
  }

  /**
   * Captura pulsaciones de teclado.
   */
  onKeyDown(e) {
    if (e.key === 'w' || e.key === 'W') this.keys.w = true;
    if (e.key === 'a' || e.key === 'A') this.keys.a = true;
    if (e.key === 's' || e.key === 'S') this.keys.s = true;
    if (e.key === 'd' || e.key === 'D') this.keys.d = true;
    if (e.key === 'ArrowUp') this.keys.ArrowUp = true;
    if (e.key === 'ArrowDown') this.keys.ArrowDown = true;
    if (e.key === 'ArrowLeft') this.keys.ArrowLeft = true;
    if (e.key === 'ArrowRight') this.keys.ArrowRight = true;
  }

  /**
   * Libera pulsaciones de teclado.
   */
  onKeyUp(e) {
    if (e.key === 'w' || e.key === 'W') this.keys.w = false;
    if (e.key === 'a' || e.key === 'A') this.keys.a = false;
    if (e.key === 's' || e.key === 'S') this.keys.s = false;
    if (e.key === 'd' || e.key === 'D') this.keys.d = false;
    if (e.key === 'ArrowUp') this.keys.ArrowUp = false;
    if (e.key === 'ArrowDown') this.keys.ArrowDown = false;
    if (e.key === 'ArrowLeft') this.keys.ArrowLeft = false;
    if (e.key === 'ArrowRight') this.keys.ArrowRight = false;
  }

  /**
   * Captura el movimiento delta del ratón y arrastre táctil para mirada libre.
   */
  onPointerMove(e) {
    if (this.isDone) return;

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
    this.yaw -= dx * sensitivity;
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
   * Inicializa la GPU y compila el shader 3D de desierto y dunas.
   */
  async init(device, format) {
    this.device = device;
    this.format = format;

    this.promptEl = document.getElementById('temple-prompt');

    // Registrar escuchadores de teclado para el desplazamiento y ratón delta
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('pointermove', this.onPointerMove, { passive: true });
    window.addEventListener('pointerdown', this.onPointerDown, { passive: true });
    window.addEventListener('pointerup', this.onPointerUp, { passive: true });

    // ======================================================================
    // CÓDIGO WGSL: RENDERIZADO DE DESIERTO FÍSICO CON REJILLA Y FARO DE LUZ
    // ======================================================================
    const wgslSource = `
      struct Uniforms {
        u_resolution : vec2<f32>, // Offset 0, size 8
        u_mouse      : vec2<f32>, // Offset 8, size 8
        u_camera_pos : vec3<f32>, // Offset 16, size 12 (Posición 3D calculada en CPU)
        u_fade_white : f32,       // Offset 28, size 4 (Fundido inicial a blanco, de 1 a 0)
        u_fade_black : f32,       // Offset 32, size 4 (Fundido final a negro, de 0 a 1)
        u_time       : f32,       // Offset 36, size 4
        u_padding1   : f32,       // Offset 40, size 4
        u_padding2   : f32,       // Offset 44, size 4 (Alineado perfecto a 48 bytes)
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

      // --- ALTURA MATEMÁTICA DE LAS DUNAS (Idéntica a CPU - Crestas Afiladas de Viento) ---
      
      fn getDuneHeight(x : f32, z : f32) -> f32 {
        let val1 = sin(x * 0.15 + z * 0.08);
        let h1 = (1.0 - abs(val1)) * 0.65;
        
        let val2 = cos(x * 0.08 - z * 0.12);
        let h2 = (1.0 - abs(val2)) * 0.35;
        
        let h3 = sin(x * 0.4 - z * 0.3) * 0.08;
        
        return h1 + h2 + h3 - 0.45;
      }

      // SDF aproximado del terreno
      fn sdDunes(p : vec3<f32>) -> f32 {
        let h = getDuneHeight(p.x, p.z);
        return (p.y - h) * 0.82;
      }

      // Normal exacta de la duna mediante diferencias finitas
      fn getDuneNormal(p : vec3<f32>) -> vec3<f32> {
        let eps = 0.015;
        let h_center = getDuneHeight(p.x, p.z);
        let h_right  = getDuneHeight(p.x + eps, p.z);
        let h_forward = getDuneHeight(p.x, p.z + eps);
        let dx = (h_right - h_center) / eps;
        let dz = (h_forward - h_center) / eps;
        return normalize(vec3<f32>(-dx, 1.0, -dz));
      }

      // SDF de la pieza octaédrica sagrada
      fn sdOctahedron(p : vec3<f32>, s : f32) -> f32 {
        let q = abs(p);
        return (q.x + q.y + q.z - s) * (1.0 / B);
      }

      // Color del cielo diurno degradado exacto de la muestra (sol abrasador)
      fn getSkyColor(rd : vec3<f32>) -> vec3<f32> {
        let lightDir = normalize(vec3<f32>(0.7, 0.35, -0.6));
        
        // Cielo degradado: azul acero arriba, calima arena abajo
        let skyBlue = mix(vec3<f32>(0.5, 0.68, 0.88), vec3<f32>(0.32, 0.48, 0.68), smoothstep(0.08, 0.6, rd.y));
        let skyGrad = mix(vec3<f32>(0.96, 0.88, 0.78), skyBlue, smoothstep(0.0, 0.08, rd.y));
        
        // Sol abrasador brillante
        let sunCos = dot(rd, lightDir);
        let sunDisk = smoothstep(0.994, 0.997, sunCos);
        let sunGlow = pow(max(sunCos, 0.0), 6.0) * 0.6 + pow(max(sunCos, 0.0), 96.0) * 2.0;
        
        var skyColor = skyGrad + vec3<f32>(1.0, 0.98, 0.9) * (sunDisk * 8.0 + sunGlow * 2.2);
        
        // Calima brillante del horizonte (reducida para despejar y revelar el horizonte)
        if (rd.y < 0.08) {
          let horizonHaze = 1.0 - smoothstep(-0.05, 0.08, rd.y);
          skyColor = mix(skyColor, vec3<f32>(0.96, 0.88, 0.78), horizonHaze * 0.12);
        }
        
        return skyColor;
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
        var t_horiz = 0.0;
        var t_vert = 0.0;
        var eye_open = 1.0;

        if (uniforms.u_fade_white > 0.0) {
          // ==========================================
          // ORGANIC EYE-BLINKING / OPENING (WAKING UP)
          // ==========================================
          let E = 1.0 - uniforms.u_fade_white; // E goes from 0.0 to 1.0
          if (E < 0.2) {
            eye_open = mix(0.0, 0.3, E / 0.2);
          } else if (E < 0.35) {
            eye_open = mix(0.3, 0.0, (E - 0.2) / 0.15);
          } else if (E < 0.5) {
            eye_open = mix(0.0, 0.5, (E - 0.35) / 0.15);
          } else if (E < 0.65) {
            eye_open = mix(0.5, 0.1, (E - 0.5) / 0.15);
          } else {
            eye_open = mix(0.1, 1.0, (E - 0.65) / 0.35);
          }
        } else if (uniforms.u_fade_black > 0.0) {
          // ==========================================
          // COLLAPSE (TV TURN-OFF TO HORIZONTAL LINE)
          // Y collapses first to 0, then X to a point.
          // ==========================================
          let T = uniforms.u_fade_black; // T goes from 0.0 to 1.0
          t_vert = clamp(T / 0.75, 0.0, 1.0);
          t_horiz = clamp((T - 0.75) / 0.25, 0.0, 1.0);
        }

        let scale_x = max(0.0001, 1.0 - t_horiz);
        let scale_y = max(0.0001, 1.0 - t_vert);
        p.x = p.x / scale_x;
        p.y = p.y / scale_y;

        // Recuperar posición de cámara 3D calculada en la CPU
        let ro = uniforms.u_camera_pos;

        // Control de mirada Yaw/Pitch con el ratón
        let yaw = (uniforms.u_mouse.x - 0.5) * 3.14159265 * 2.0;
        let pitch = (uniforms.u_mouse.y - 0.5) * 3.14159265 * 0.42;

        let camRot = rotateY(yaw) * rotateX(pitch);
        var rd = camRot * normalize(vec3<f32>(p.x, p.y, 0.95)); // FOV ampliado para ver el horizonte lejano

        // Defocus (blur) transition
        let active_t = max(t_horiz, t_vert);
        let total_blur = active_t * 0.045 + uniforms.u_fade_white * 0.04;
        let noiseX = sin(orig_p.x * 2314.15 + orig_p.y * 9431.62 + uniforms.u_time * 12.0) * 0.5;
        let noiseY = cos(orig_p.x * 1432.53 + orig_p.y * 6138.87 - uniforms.u_time * 15.0) * 0.5;
        let distorted_rd = normalize(rd + vec3<f32>(noiseX, noiseY, 0.0) * total_blur);

        // 2. Bucle de Raymarching para colisionar
        var t : f32 = 0.02;
        var d : f32 = 0.0;
        var pos : vec3<f32> = vec3<f32>(0.0);
        var hit_dunes = false;
        var hit_obj = false;
        
        var dust_accumulation = vec3<f32>(0.0);

        // Coordenadas fijas del artefacto en el desierto (semi-enterrado a Y)
        let obj_pos = vec3<f32>(1.5, getDuneHeight(1.5, 7.5) - 0.06, 7.5);
        let lightDir = normalize(vec3<f32>(0.5, 0.8, 0.3)); // Dirección del sol abrasador alto

        for (var i = 0; i < 75; i = i + 1) {
          pos = ro + distorted_rd * t;
          
          let d_dunes = sdDunes(pos);
          let d_obj = sdOctahedron(pos - obj_pos, 0.12);
          
          d = min(d_dunes, d_obj);
          
          if (d < 0.0004) {
            if (d_obj < 0.001) {
              hit_obj = true;
            } else {
              hit_dunes = true;
            }
            break;
          }

          // --- ACUMULAR PARTICULAS DE ARENA VOLANDO EN EL VIENTO (Volumétricas) ---
          let windDir = vec3<f32>(-22.0, -1.0, 16.0); // Velocidad extrema del viento horizontal
          let scaleGrid = vec3<f32>(24.0, 16.0, 24.0);
          let particlePos = pos * scaleGrid + windDir * uniforms.u_time;
          let voxel = floor(particlePos);
          let rand = fract(sin(dot(voxel, vec3<f32>(12.9898, 78.233, 45.164))) * 43758.5453);
          
          if (rand > 0.991) {
            let localCenter = (voxel + vec3<f32>(0.5) - windDir * uniforms.u_time) / scaleGrid;
            let distToSpec = length(pos - localCenter);
            // Grano de arena diminuto y muy afilado
            let sandGrain = (1.0 - smoothstep(0.0, 0.012, distToSpec)) * 0.95 * exp(-0.16 * t);
            let sunScatter = max(dot(distorted_rd, lightDir), 0.0) * 0.65 + 0.35;
            dust_accumulation += vec3<f32>(0.96, 0.78, 0.45) * sandGrain * sunScatter;
          }

          t = t + d;
          if (t > 48.0) { // Mayor alcance de visión para renderizar terreno lejano
            break;
          }
        }

        // 3. Generación del haz de luz vertical (Faro de luz cian neón visible desde lejos)
        let dist_to_beacon = length(pos.xz - vec2<f32>(1.5, 7.5));
        let beacon_glow = 0.0052 / (dist_to_beacon * dist_to_beacon + 0.002) * smoothstep(-0.6, 2.5, pos.y);
        let beacon_color = vec3<f32>(0.0, 0.9, 1.0) * beacon_glow * 1.6;

        // 4. Composición cromática final
        var color = vec3<f32>(0.0);

        if (hit_dunes) {
          let N = getDuneNormal(pos);
          let diff = pow(max(dot(N, lightDir), 0.0), 1.35);
          
          // Posterizar la luz difusa en bandas de color cel-shaded nítidas
          let diffStepped = step(0.15, diff) * 0.38 + step(0.55, diff) * 0.42 + step(0.85, diff) * 0.2;

          let R = reflect(-lightDir, N);
          let spec = pow(max(dot(distorted_rd, R), 0.0), 45.0) * 0.22;
          let specStepped = step(0.12, spec) * spec; // Specular stepped

          // Dunas de oro y sombras cálidas color arcilla (Exacto a la muestra)
          let sand_color = vec3<f32>(0.96, 0.78, 0.42);
          let shadow_color = vec3<f32>(0.42, 0.28, 0.12);
          let ambient = vec3<f32>(0.3, 0.38, 0.5) * (N.y * 0.5 + 0.5);
          var sand_shading = mix(shadow_color, sand_color, diffStepped) + ambient * 0.05;

          // Ondas de arena procedimentales
          let ripple = sin(pos.x * 24.0 + pos.z * 18.0) * 0.025;
          sand_shading = sand_shading + vec3<f32>(0.98, 0.88, 0.65) * (ripple * diffStepped);

          // Tramado de puntos manga (Halftone Screentone) en las sombras
          let screentone = sin(p.x * 220.0) * sin(p.y * 220.0);
          if (screentone > 0.38 && diffStepped < 0.45) {
            sand_shading = mix(sand_shading, shadow_color * 0.75, 0.48);
          }

          // Contorno de tinta manga en las crestas y valles de las dunas
          let edge = pow(1.0 - max(dot(-distorted_rd, N), 0.0), 4.0);
          let border = smoothstep(0.68, 0.94, edge);
          sand_shading = mix(sand_shading, vec3<f32>(0.15, 0.08, 0.06), border * 0.82);

          color = sand_shading + vec3<f32>(1.0, 0.96, 0.85) * specStepped;

          // --- EFECTO DE ESPEJISMO (Reflejo del sol/cielo al fondo sobre la arena caliente) ---
          if (t > 5.5 && distorted_rd.y < 0.05) {
            let mirageStrength = smoothstep(5.5, 9.5, t) * (1.0 - smoothstep(-0.01, 0.05, distorted_rd.y));
            let reflect_rd = reflect(distorted_rd, vec3<f32>(0.0, 1.0, 0.0));
            let skyReflect = getSkyColor(reflect_rd);
            color = mix(color, skyReflect, mirageStrength * 0.85);
          }
        } else if (hit_obj) {
          // Cristal octaédrico sagrado emisor brillante latiendo en cian neón cel-shaded
          let pulse = sin(uniforms.u_time * 6.0) * 0.25;
          var obj_color = vec3<f32>(0.0, 0.95, 1.0) * (1.2 + pulse);
          
          let N_obj = normalize(pos - obj_pos);
          let edge_obj = pow(1.0 - max(dot(-distorted_rd, N_obj), 0.0), 3.0);
          let border_obj = smoothstep(0.48, 0.82, edge_obj);
          obj_color = mix(obj_color, vec3<f32>(0.0, 0.0, 0.02), border_obj * 0.95);
          color = obj_color;
        } else {
          // Renderizar cielo diurno con el sol
          color = getSkyColor(distorted_rd);
        }

        // Incorporar el haz de luz del faro sagrado de forma aditiva
        color = color + beacon_color;

        // Sumar partículas suspendidas en el aire
        color = color + dust_accumulation;

        // 5. Niebla atmosférica dorada (muy reducida para máxima nitidez en el horizonte)
        let fog_factor = clamp(exp(-0.015 * t), 0.0, 1.0);
        let fog_color = vec3<f32>(0.96, 0.88, 0.78);
        var col = mix(fog_color, color, fog_factor);

        // 6. Aplicar fundidos de transiciones (entrada blanco / salida negro)
        // Desactivamos la mezcla de color plano blanca/negra pura para usar el collapse CRT
        var col_faded = col;

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

        // Apply organic eye-blinking/opening vertical aperture mask at start
        let limit_y = eye_open * (1.0 - 0.35 * (orig_p.x * orig_p.x) / (aspect * aspect));
        let eye_mask = 1.0 - smoothstep(0.0, 0.08, abs(orig_p.y) - limit_y);
        let final_with_eye = final_crt * eye_mask;

        return vec4<f32>(final_with_eye, 1.0);
      }
    `;

    // 1. Compilar código WGSL a Shader Module
    const shaderModule = this.device.createShaderModule({
      label: 'PhaseDunes Shader Module',
      code: wgslSource
    });

    // 2. Reservar memoria del Uniform Buffer (Alineación requerida de 48 bytes)
    this.uniformBuffer = this.device.createBuffer({
      label: 'PhaseDunes Uniform Buffer',
      size: 48,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });

    // 3. Crear el diseño de enlace del grupo
    this.bindGroupLayout = this.device.createBindGroupLayout({
      label: 'PhaseDunes Bind Group Layout',
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
      label: 'PhaseDunes Bind Group',
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
      label: 'PhaseDunes Pipeline Layout',
      bindGroupLayouts: [this.bindGroupLayout]
    });

    // 6. Generar el Render Pipeline
    this.pipeline = this.device.createRenderPipeline({
      label: 'PhaseDunes Render Pipeline',
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
      primitive: {
        topology: 'triangle-list'
      }
    });

    console.log("PhaseDunes: Pipeline de raymarching de dunas y artefacto 3D creado.");
  }

  /**
   * Función para calcular la altura de las dunas en un punto XZ en la CPU (idéntica a GPU).
   */
  getDuneHeight(x, z) {
    const val1 = Math.sin(x * 0.15 + z * 0.08);
    const h1 = (1.0 - Math.abs(val1)) * 0.65;
    
    const val2 = Math.cos(x * 0.08 - z * 0.12);
    const h2 = (1.0 - Math.abs(val2)) * 0.35;
    
    const h3 = Math.sin(x * 0.4 - z * 0.3) * 0.08;
    
    return h1 + h2 + h3 - 0.45;
  }

  /**
   * Actualiza el avance físico de la cámara, los timers, y LERPea los ángulos
   * de mirada del cursor.
   * Devuelve `false` para ejecutarse indefinidamente o gestiona los créditos.
   */
  update(dt, input, synth) {
    if (synth) {
      this.synth = synth;
    }

    // 1. Desvanecer suavemente el fundido a blanco de entrada (1.0 -> 0.0)
    if (this.fade > 0.0) {
      this.fade = Math.max(0.0, this.fade - dt * 0.33); // Tarda aprox 3 segundos
    }

    // 2. Activar la síntesis de sonido de viento si no está activa
    if (synth && !this.audioTriggered) {
      this.audioTriggered = true;
      synth.startDunesDrone();
    }

    // 3. LERP de mirada horizontal (Yaw) y vertical (Pitch) del mouse delta
    const lerpRotSpeed = 0.12;
    this.yawSmooth += (this.yaw - this.yawSmooth) * lerpRotSpeed;
    this.pitchSmooth += (this.pitch - this.pitchSmooth) * lerpRotSpeed;

    // 4. Comprobar la distancia física al artefacto sagrado en (1.5, 7.5)
    const dx = this.cameraX - this.objX;
    const dz = this.cameraZ - this.objZ;
    const distToObj = Math.sqrt(dx * dx + dz * dz);

    if (distToObj < 0.42 && !this.isDone) {
      this.isDone = true;
      console.log("PhaseDunes: ¡Artefacto sagrado encontrado en el desierto!");
      
      // Apagar los silbidos agudos del viento para centrar la victoria
      if (synth && synth.isInitialized) {
        synth.dunesGains.forEach((g) => {
          const t = synth.ctx.currentTime;
          g.gain.cancelScheduledValues(t);
          g.gain.setValueAtTime(g.gain.value, t);
          g.gain.linearRampToValueAtTime(0.008, t + 3.0); // Queda como un susurro apagado
        });
      }
    }

    // 5. Gestión del movimiento en primera persona (WASD y flechas de dirección)
    if (!this.isDone) {
      // Ángulo yaw de mirada suave acumulada
      const yaw = this.yawSmooth;

      // Vectores de desplazamiento proyectados en el plano XZ
      const fwdX = -Math.sin(yaw);
      const fwdZ = Math.cos(yaw);
      const rightX = Math.cos(yaw);
      const rightZ = Math.sin(yaw);

      let mx = 0.0;
      let mz = 0.0;

      if (this.keys.w || this.keys.ArrowUp) {
        mx += fwdX;
        mz += fwdZ;
      }
      if (this.keys.s || this.keys.ArrowDown) {
        mx -= fwdX;
        mz -= fwdZ;
      }
      if (this.keys.a || this.keys.ArrowLeft) {
        mx -= rightX;
        mz -= rightZ;
      }
      if (this.keys.d || this.keys.ArrowRight) {
        mx += rightX;
        mz += rightZ;
      }

      // Normalizar desplazamiento para evitar velocidades diagonales incrementales
      const moveLen = Math.sqrt(mx * mx + mz * mz);
      let isMoving = false;

      if (moveLen > 0.0) {
        isMoving = true;
        const speed = 1.35 * dt; // Velocidad de caminata inmersiva
        this.cameraX += (mx / moveLen) * speed;
        this.cameraZ += (mz / moveLen) * speed;
      }

      // Animación de balanceo de pisadas (bobbing) solo en desplazamiento activo
      if (isMoving) {
        this.stepTimer += dt * 8.0; // Frecuencia rítmica de pisadas
      } else {
        // Regresar suavemente a la posición de descanso
        this.stepTimer = this.stepTimer % (Math.PI * 2.0);
        if (this.stepTimer > 0.0) {
          this.stepTimer = Math.max(0.0, this.stepTimer - dt * 6.0);
        }
      }

      // Altura del suelo bloqueada a la duna + cabeceo de pisadas
      const baseHeight = this.getDuneHeight(this.cameraX, this.cameraZ);
      const stepBob = Math.sin(this.stepTimer) * 0.035;
      this.cameraY = baseHeight + 0.52 + stepBob;
    }

    // 6. Actualización dinámica del prompt HUD
    if (this.promptEl) {
      this.promptEl.classList.add('show');
      this.promptEl.classList.remove('pressing');
      if (this.isDone) {
        this.promptEl.innerText = "¡ARTEFACTO ENCONTRADO! PREPARANDO ASCENSIÓN...";
      } else {
        this.promptEl.innerText = "ENCUENTRA EL ARTEFACTO QUE RESPLANDECE EN LA ARENA\n[DESPLÁZATE CON WASD / FLECHAS Y MIRA CON EL RATÓN]";
      }
    }

    return this.isDone;
  }

  /**
   * Copia uniformes a la GPU y codifica el pase de renderizado.
   */
  render(device, view, encoder, frameData) {
    if (!this.pipeline) return;

    // Uniform Buffer de 12 elementos (48 bytes)
    const uniformsData = new Float32Array(12);
    uniformsData[0] = this.width;                     // u_resolution.x
    uniformsData[1] = this.height;                    // u_resolution.y
    uniformsData[2] = 0.5 + this.yawSmooth / (Math.PI * 2.0);             // u_mouse.x (Controla Yaw)
    uniformsData[3] = 0.5 + this.pitchSmooth / Math.PI;                  // u_mouse.y (Controla Pitch)
    uniformsData[4] = this.cameraX;                   // u_camera_pos.x
    uniformsData[5] = this.cameraY;                   // u_camera_pos.y
    uniformsData[6] = this.cameraZ;                   // u_camera_pos.z
    uniformsData[7] = this.fade;                      // u_fade_white (Fundido inicial a blanco)
    uniformsData[8] = this.exitFade;                  // u_fade_black (Fundido final a negro)
    uniformsData[9] = frameData.elapsedTime;          // u_time
    uniformsData[10] = 0.0;                           // padding
    uniformsData[11] = 0.0;                           // padding

    device.queue.writeBuffer(this.uniformBuffer, 0, uniformsData.buffer);

    const renderPassDescriptor = {
      colorAttachments: [
        {
          view: view,
          clearValue: { r: 0.96, g: 0.88, b: 0.78, a: 1.0 }, // Niebla del desierto
          loadOp: 'clear',
          storeOp: 'store'
        }
      ]
    };

    const passEncoder = encoder.beginRenderPass(renderPassDescriptor);
    passEncoder.setPipeline(this.pipeline);
    passEncoder.setBindGroup(0, this.bindGroup);
    passEncoder.draw(3); // Triángulo fullscreen procedural
    passEncoder.end();
  }

  /**
   * Crea el contenedor de créditos cinematográficos en el DOM.
   */
  createCredits() {
    if (document.getElementById('core-credits-container')) return;

    this.creditsEl = document.createElement('div');
    this.creditsEl.id = 'core-credits-container';
    this.creditsEl.className = 'credits-container show darken'; // Negro y visible

    document.body.appendChild(this.creditsEl);
  }

  /**
   * Orquesta la secuencia de créditos cinematográficos una vez completado el fade-out de las dunas.
   */
  startCreditsSequence() {
    if (this.creditsTriggered) return;
    this.creditsTriggered = true;
    console.log("PhaseDunes: Iniciando secuencia de títulos de cine.");

    // Quitar escuchadores de teclado y ratón delta
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointerup', this.onPointerUp);

    this.createCredits();

    // Diapositivas de créditos secuenciales
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

    // Construir diapositivas en el DOM
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

    // 1. Orquestar la atenuación final del volumen máster a silencio completo durante 20s
    if (this.synth && this.synth.isInitialized) {
      const t = this.synth.ctx.currentTime;
      this.synth.masterGain.gain.cancelScheduledValues(t);
      this.synth.masterGain.gain.setValueAtTime(this.synth.masterGain.gain.value, t);
      this.synth.masterGain.gain.exponentialRampToValueAtTime(0.0001, t + 20.0);
    }

    // 2. Mostrar diapositivas una a una con fundidos cruzados
    let currentSlideIdx = 0;

    const displayNextSlide = () => {
      if (currentSlideIdx >= slidesData.length) {
        console.log("PhaseDunes: Fin de créditos alcanzado.");
        return;
      }

      const activeSlide = document.getElementById(`credits-slide-${currentSlideIdx}`);
      if (activeSlide) {
        activeSlide.classList.add('active');
      }

      // Mantener diapositiva en pantalla 3.2 segundos
      setTimeout(() => {
        if (activeSlide) {
          activeSlide.classList.remove('active');
        }
        currentSlideIdx++;

        // Dejar 1.3s de silencio antes del fundido de la siguiente
        setTimeout(displayNextSlide, 1300);
      }, 3200);
    };

    // Comenzar la secuencia de inmediato puesto que el fondo ya es negro absoluto
    setTimeout(displayNextSlide, 800);
  }

  /**
   * Refresca las dimensiones.
   */
  resize(width, height) {
    this.width = width;
    this.height = height;
  }

  /**
   * Libera los recursos de GPU y pruna elementos del DOM.
   */
  destroy() {
    // Quitar escuchadores de teclado y ratón delta de forma segura
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
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

    // Remover créditos del DOM si existen
    if (this.creditsEl) {
      const credits = this.creditsEl;
      if (credits.parentNode) {
        credits.parentNode.removeChild(credits);
      }
      this.creditsEl = null;
    }

    console.log("PhaseDunes: Desierto y dunas liberado de GPU.");
  }
}
