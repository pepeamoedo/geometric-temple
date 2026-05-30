/**
 * PhaseBlackHole
 * 
 * Clímax definitivo y final antes de los créditos (STATE_BLACKHOLE).
 * El jugador experimenta la caída libre en el Agujero Negro Supermasivo de la Vía Láctea (Sagitario A*).
 * Los controles WASD permanecen bloqueados, pero se mantiene la mirada interactiva en 360º.
 * Se implementa un trazador de rayos relativista real (Relativistic Raymarching) que curva la luz
 * debido al campo gravitatorio, logrando la icónica apariencia del Agujero Negro "Gargantua" (Interstellar)
 * con su disco de acreción doblemente deformado, superpuesto a la Vía Láctea y estrellas con picos de lente.
 * Finalmente, el horizonte de sucesos traga la cámara físicamente al cruzar el umbral del agujero negro.
 */
const A = Math.sqrt(2);
const B = Math.sqrt(3);
const C = Math.sqrt(5);

export class PhaseBlackHole {
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
    this.bhTime = 0.0;
    this.isDone = false;
    this.singularityTriggered = false;

    // Créditos cinematográficos
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
   * Inicializa la GPU y compila el sombreador procedural del agujero negro relativista.
   */
  async init(device, format) {
    this.device = device;
    this.format = format;

    this.promptEl = document.getElementById('temple-prompt');

    window.addEventListener('pointermove', this.onPointerMove, { passive: true });
    window.addEventListener('pointerdown', this.onPointerDown, { passive: true });
    window.addEventListener('pointerup', this.onPointerUp, { passive: true });

    // Código del sombreador WGSL del Agujero Negro Gargantua Relativista
    const wgslSource = `
      struct Uniforms {
        u_resolution : vec2<f32>, // Offset 0, size 8
        u_mouse      : vec2<f32>, // Offset 8, size 8
        u_time       : f32,       // Offset 16, size 4
        u_bh_time    : f32,       // Offset 20, size 4
        u_padding1   : f32,       // Offset 24, size 4
        u_padding2   : f32,       // Offset 28, size 4
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

      // --- CAMPO DE ESTRELLAS DE FONDO CON DISTORSIÓN RELATIVISTA ---
      fn getLensedStars(rd : vec3<f32>, scale : f32) -> vec3<f32> {
        let p = rd * scale;
        let ip = floor(p);
        let fp = fract(p);
        let rand = fract(sin(dot(ip, vec3<f32>(127.1, 311.7, 74.7))) * 43758.5453123);
        
        var stars = vec3<f32>(0.0);
        if (rand > 0.985) {
          let center = fp - vec3<f32>(0.5);
          let dist = length(center);
          let twinkle = sin(uniforms.u_time * 2.8 + rand * 6.28) * 0.5 + 0.5;
          let glow = (1.0 - smoothstep(0.0, 0.11, dist)) * twinkle;
          
          let starColor = mix(vec3<f32>(0.75, 0.92, 1.0), vec3<f32>(0.96, 0.65, 0.85), rand);
          stars = starColor * glow * 1.5;
        }
        return stars;
      }

      // --- ESTRELLAS DESTACADAS CON PICOS DE LENTE DE CÓMIC (LENS FLARES AZULES) ---
      fn getBlueSpikeStar(rd : vec3<f32>, star_dir : vec3<f32>, uniforms_time : f32) -> vec3<f32> {
        let cos_a = dot(rd, star_dir);
        if (cos_a < 0.9982) {
          return vec3<f32>(0.0);
        }
        
        let angle_dist = acos(clamp(cos_a, -1.0, 1.0));
        
        let ortho1 = normalize(vec3<f32>(-star_dir.y, star_dir.x, 0.0));
        let ortho2 = cross(star_dir, ortho1);
        let dist_x = abs(dot(rd - star_dir, ortho1));
        let dist_y = abs(dot(rd - star_dir, ortho2));
        
        let spike = exp(-dist_x * 90.0) * exp(-dist_y * 12.0) + exp(-dist_y * 90.0) * exp(-dist_x * 12.0);
        let core = exp(-angle_dist * 800.0);
        
        let twinkle = sin(uniforms_time * 3.5 + star_dir.x * 100.0) * 0.15 + 0.85;
        
        return vec3<f32>(0.42, 0.72, 1.0) * (core * 2.8 + spike * 0.35) * twinkle;
      }

      // --- NEBULA FLUIDA PSICODÉLICA (ESTILO 2001 ODISEA DEL ESPACIO) ---
      fn getStargateFluid(uv : vec2<f32>, time : f32) -> vec3<f32> {
        var q = vec2<f32>(0.0);
        q.x = sin(uv.x * 2.8 + time * 1.2) * 0.5 + 0.5;
        q.y = cos(uv.y * 2.8 - time * 1.0) * 0.5 + 0.5;
        
        var r = vec2<f32>(0.0);
        r.x = sin((uv.x + q.x * 1.8) * 3.8 + time * 1.6) * 0.5 + 0.5;
        r.y = cos((uv.y + q.y * 1.8) * 3.8 - time * 1.4) * 0.5 + 0.5;
        
        let f = sin((uv.x + r.x * 2.2) * 2.4 + time * 0.7) * 0.5 + 0.5;
        
        // Colores neón líquidos vibrantes de 2001: magenta, verde ácido y azul eléctrico
        let col1 = vec3<f32>(1.0, 0.0, 0.58);   // Rosa/Magenta neón
        let col2 = vec3<f32>(0.0, 0.98, 0.42);  // Verde ácido
        let col3 = vec3<f32>(0.0, 0.62, 1.0);   // Azul eléctrico
        
        var final_col = mix(col1, col2, f);
        final_col = mix(final_col, col3, length(q) * 0.48);
        return final_col * (f * 1.35 + 0.25);
      }

      @fragment
      fn fs_main(in : VertexOutput) -> @location(0) vec4<f32> {
        let uv = in.uv;
        let aspect = uniforms.u_resolution.x / uniforms.u_resolution.y;

        var p = (uv - 0.5) * 2.0;
        p.x = p.x * aspect;

        let orig_p = p;
        var t_horiz = 0.0;
        var t_vert = 0.0;

        let scale_x = 1.0;
        let scale_y = 1.0;

        // 1. Transición cinematográfica: giro de 180º de mirar abajo a mirar al frente
        let trans_progress = clamp(uniforms.u_bh_time / 3.0, 0.0, 1.0);
        let yaw_t = -3.14159265 * (1.0 - trans_progress); // Yaw gira de -180 a 0 grados (pan a la derecha)
        let pitch_t = -1.5707963 * (1.0 - trans_progress); // Pitch sube de -90 a 0 grados (sube la mirada)

        // Mirada 360 con ratón/móvil + offset de la transición
        let yaw = (uniforms.u_mouse.x - 0.5) * 3.14159265 * 2.0 + yaw_t;
        let pitch = (uniforms.u_mouse.y - 0.5) * 3.14159265 * 0.42 + pitch_t;

        let camRot = rotateY(yaw) * rotateX(pitch);
        var rd = camRot * normalize(vec3<f32>(p.x, p.y, 0.95));

        // Ruido para desenfoque de lente de transición (Defocus)
        let active_t = max(t_horiz, t_vert);
        let noiseX = sin(orig_p.x * 2314.15 + orig_p.y * 9431.62 + uniforms.u_time * 12.0) * 0.5;
        let noiseY = cos(orig_p.x * 1432.53 + orig_p.y * 6138.87 - uniforms.u_time * 15.0) * 0.5;
        rd = normalize(rd + vec3<f32>(noiseX, noiseY, 0.0) * (active_t * 0.045));

        // ======================================================================
        // DINÁMICA DE LA SINGULARIDAD: TRAGADO DE LA PANTALLA
        // ======================================================================
        // A partir de los 12.0s, el horizonte de sucesos devora todo gradualmente
        let swallow_progress = smoothstep(12.0, 15.0, uniforms.u_bh_time);
        let base_horizon = 0.18;
        let target_horizon = base_horizon + swallow_progress * 4.4;

        // ======================================================================
        // TRAZADOR DE RAYOS RELATIVISTA (RELATIVISTIC RAYMARCHING) - ESTILO GARGANTUA
        // ======================================================================
        // Atracción gravitatoria física: la cámara se mantiene estática durante el giro de 3s y luego acelera
        let cam_speed = pow(max(0.0, uniforms.u_bh_time - 3.0), 1.2) * 0.25;
        var ro = vec3<f32>(0.0, 0.45, cam_speed); 
        let bh_center = vec3<f32>(0.0, 0.0, 4.5); // Gargantua enfrente de la cámara
        let disk_normal = normalize(vec3<f32>(0.0, 1.0, -0.06)); // Disco de acreción edge-on inclinado

        var pos = ro;
        let step_size = 0.12;
        var accumulated_color = vec3<f32>(0.0);
        var accumulated_alpha = 0.0;
        var hit_horizon = false;

        // Marchar curvando el rayo según el potencial gravitatorio de Einstein
        for (var i = 0; i < 45; i = i + 1) {
          let r_vec = bh_center - pos;
          let r_dist = length(r_vec);

          // Si el rayo cruza el horizonte de sucesos actual, cae en la singularidad
          if (r_dist < target_horizon) {
            hit_horizon = true;
            break;
          }

          // Desviación de luz gravitatoria relativista (Einstein Ray Bending)
          // Fuerza proporcional a 1.0 / r^3
          let gravity_bending = 0.045 / (r_dist * r_dist * r_dist + 0.001);
          rd = normalize(rd + normalize(r_vec) * gravity_bending);

          // Avanzar la posición del rayo
          let next_pos = pos + rd * step_size;

          // Comprobar si el rayo ha cruzado el plano 3D del disco de acreción
          let h1 = dot(pos - bh_center, disk_normal);
          let h2 = dot(next_pos - bh_center, disk_normal);

          if (h1 * h2 < 0.0) {
            // Intersección encontrada en el plano del disco
            let t_plane = h1 / (h1 - h2);
            let intersect = pos + rd * step_size * t_plane;
            let d_center = length(intersect - bh_center);

            // Límites físicos del disco de acreción de Gargantua
            if (d_center > target_horizon + 0.05 && d_center < 1.45) {
              // Gas arremolinado a gran velocidad
              let disk_angle = atan2(intersect.z - bh_center.z, intersect.x - bh_center.x);
              let speed = uniforms.u_time * 5.5;
              let gas_wave = sin(d_center * 24.0 - disk_angle * 2.0 - speed) * 0.5 + 0.5;

              // Color caliente espectacular: blanco nucleo -> amarillo -> fuego naranja -> rojo oscuro
              let disk_fire = mix(
                vec3<f32>(0.98, 0.22, 0.04), // Fuego naranja/rojo
                vec3<f32>(1.0, 0.94, 0.68),  // Núcleo blanco-amarillo
                gas_wave * (1.0 - smoothstep(0.35, 1.35, d_center))
              );

              // Densidad del gas decreciente
              let density = smoothstep(target_horizon + 0.05, target_horizon + 0.12, d_center) 
                            * (1.0 - smoothstep(0.78, 1.45, d_center)) 
                            * (0.82 + 0.18 * gas_wave);
              
              let color_contrib = disk_fire * density * 3.5 * (1.0 - swallow_progress);

              // Acumulación alfa frontal/trasera para volumen realista
              accumulated_color += color_contrib * (1.0 - accumulated_alpha);
              accumulated_alpha += density * 0.65 * (1.0 - accumulated_alpha);

              if (accumulated_alpha > 0.98) {
                break;
              }
            }
          }

          pos = next_pos;
        }

        // ======================================================================
        // RENDERING DE LA GALAXIA ESPIRAL BARRADA DEL FONDO (INSPIRADA EN LA IMG 1)
        // ======================================================================
        var bg_color = vec3<f32>(0.0);

        if (!hit_horizon) {
          let esc_rd = rd; // Dirección del rayo al escapar de la gravedad del hoyo

          // 1. Estrellas deformadas por gravedad
          let esc_stars = getLensedStars(esc_rd, 160.0);

          // 2. Rotación general inclinada de la galaxia oblicua en el fondo
          let cos_rot = cos(0.48); // Inclinación en radianes (unos 28 grados)
          let sin_rot = sin(0.48);
          let tilted_p = vec2<f32>(
            esc_rd.x * cos_rot - esc_rd.y * sin_rot,
            (esc_rd.x * sin_rot + esc_rd.y * cos_rot) * 1.75 // Vista oblicua
          );
          let gd = length(tilted_p);
          let edge_fade = 1.0 - smoothstep(0.18, 0.72, gd);

          var esc_galaxy = vec3<f32>(0.0);
          if (edge_fade > 0.0) {
            let galaxy_angle = atan2(tilted_p.y, tilted_p.x);
            let galaxy_speed = uniforms.u_time * 0.18;

            let arm_wind = galaxy_angle - log(max(0.01, gd)) * 2.8 - galaxy_speed * 1.5;
            let arm1 = sin(arm_wind) * 0.5 + 0.5;
            let arm2 = sin(arm_wind + 3.14159) * 0.5 + 0.5;
            let arm_shape = pow(max(arm1, arm2), 2.5);

            // Brazos de estrellas azules brillantes (Hot young stars)
            let arm_blue = vec3<f32>(0.28, 0.55, 0.98) * arm_shape * smoothstep(0.06, 0.42, gd) * 2.5;

            // Brazos de polvo rojizo/marrón (Dust lanes) desplazados angularmente
            let dust_wind = arm_wind + 0.28;
            let dust1 = sin(dust_wind) * 0.5 + 0.5;
            let dust2 = sin(dust_wind + 3.14159) * 0.5 + 0.5;
            let dust_shape = pow(max(dust1, dust2), 3.2);
            let nebulae_red = vec3<f32>(0.92, 0.32, 0.18) * dust_shape * smoothstep(0.05, 0.38, gd) * 2.8;

            // Núcleo de barra ovalada crema extremadamente brillante
            let core_angle = galaxy_speed * 0.6;
            let cos_c = cos(core_angle);
            let sin_c = sin(core_angle);
            let rot_bar = vec2<f32>(
              tilted_p.x * cos_c - tilted_p.y * sin_c,
              (tilted_p.x * sin_c + tilted_p.y * cos_c) * 2.4
            );
            let bar_dist = length(rot_bar);
            let core_glow = exp(-bar_dist * 12.0);
            let core_color = vec3<f32>(1.0, 0.92, 0.78) * core_glow * 4.8;

            // Halo difuso central color naranja/crema
            let central_envelope = exp(-gd * 4.5) * vec3<f32>(0.98, 0.65, 0.38) * 1.5;

            esc_galaxy = (core_color + (arm_blue + nebulae_red) * 0.88 + central_envelope) * edge_fade;
          }

          // 3. Estrellas destacadas con flares
          let star1 = getBlueSpikeStar(esc_rd, normalize(vec3<f32>(0.55, 0.45, 0.70)), uniforms.u_time);
          let star2 = getBlueSpikeStar(esc_rd, normalize(vec3<f32>(-0.62, 0.42, 0.66)), uniforms.u_time);
          let star3 = getBlueSpikeStar(esc_rd, normalize(vec3<f32>(-0.25, -0.62, 0.75)), uniforms.u_time);
          let star4 = getBlueSpikeStar(esc_rd, normalize(vec3<f32>(0.48, -0.65, 0.58)), uniforms.u_time);
          let highlighted_stars = star1 + star2 + star3 + star4;

          // Mezclar la galaxia con la nebulosa fluida psicodélica de 2001 Odisea del Espacio
          let fluid_uv = vec2<f32>(esc_rd.x, esc_rd.y) * 1.6;
          let stargate_fluid = getStargateFluid(fluid_uv, uniforms.u_time);
          let mixed_bg = mix(esc_galaxy, stargate_fluid, 0.65);

          // Estrella de la Tierra alejándose (en dirección -Y en el espacio interestelar, directo abajo al inicio)
          let earth_dir = vec3<f32>(0.0, -1.0, 0.0);
          let earth_cos = dot(esc_rd, earth_dir);
          var earth_star = vec3<f32>(0.0);
          if (earth_cos > 0.9995) {
            let earth_glow = 0.00008 / (1.0 - earth_cos + 0.000008);
            earth_star = vec3<f32>(0.42, 0.75, 1.0) * earth_glow * (1.0 - trans_progress);
          }

          bg_color = esc_stars * 0.4 + mixed_bg * (1.0 - swallow_progress) + highlighted_stars * (1.0 - swallow_progress) + earth_star;
        }

        // Combinar el fondo con el volumen del disco de acreción lensed frontal
        var color = mix(bg_color, accumulated_color, accumulated_alpha);

        // ======================================================================
        // LÍNEAS DE VELOCIDAD RELATIVISTAS DE CAÍDA LIBRE (SPEED LINES)
        // ======================================================================
        let radius = length(orig_p);
        let speed_angle = atan2(orig_p.y, orig_p.x);
        let sectors = 96.0;
        let speed_angle_grid = speed_angle * sectors / 6.2831853;
        let sectorId = floor(speed_angle_grid);
        let sectorFract = fract(speed_angle_grid);

        let speed_rand = fract(sin(sectorId * 12.9898 + 45.164) * 43758.5453);
        let speed_flicker = step(0.40, fract(sin(sectorId * 45.12 + uniforms.u_time * 85.0) * 43758.5453));

        var mangaLines : f32 = 0.0;
        if (speed_rand > 0.60 && !hit_horizon) {
          let lineWeight = 1.0 - smoothstep(0.0, 0.12, abs(sectorFract - 0.5));
          let edgeFade = smoothstep(0.20, 1.25, radius);
          let speedFactor = smoothstep(0.5, 4.0, uniforms.u_bh_time) * (1.0 - swallow_progress);
          mangaLines = lineWeight * edgeFade * speed_flicker * speedFactor * 0.95;
        }

        // Mezclar las líneas cinéticas de color cian neón/blanco brillante
        color = mix(color, vec3<f32>(0.0, 0.96, 1.0), mangaLines);

        // ======================================================================
        // CORREDOR SLIT-SCAN PSICODÉLICO DE PICOS DE LUZ (2001: STAR GATE CORRIDOR)
        // ======================================================================
        // Creamos una perspectiva de túnel en los laterales con filamentos de luz deslizándose a gran velocidad
        let wall_depth = 1.0 / (abs(orig_p.x) + 0.06);
        let wall_y = orig_p.y * wall_depth;
        let wall_x = uniforms.u_time * 7.5 - wall_depth * 1.8;

        let stripe_id = floor(wall_y * 14.0);
        let stripe_fract = fract(wall_y * 14.0);
        let stripe_rand = fract(sin(stripe_id * 142.31 + 45.16) * 43758.5453);

        // Paleta de colores psicodélicos vibrantes de 2001
        let stargate_pink = vec3<f32>(1.0, 0.0, 0.58);
        let stargate_green = vec3<f32>(0.02, 0.98, 0.42);
        let stargate_cyan = vec3<f32>(0.0, 0.92, 1.0);
        let stargate_yellow = vec3<f32>(1.0, 0.88, 0.0);

        var stripe_color = mix(stargate_pink, stargate_green, stripe_rand);
        stripe_color = mix(stripe_color, mix(stargate_cyan, stargate_yellow, stripe_rand), step(0.5, stripe_rand));

        // Destellos de luz intensos fluyendo por las rendijas laterales
        let slit_light = smoothstep(0.18, 0.0, abs(stripe_fract - 0.5)) 
                        * (sin(wall_x * 0.9 + stripe_rand * 12.0) * 0.5 + 0.5);

        // La máscara se intensifica en los bordes izquierdo/derecho y se difumina al centro
        let slit_mask = smoothstep(0.04, 0.65, abs(orig_p.x)) * (1.0 - swallow_progress);
        let stargate_corridor = stripe_color * slit_light * slit_mask * 1.45;

        // Sumar la aportación luminosa del túnel de luz
        color = color + stargate_corridor;

        // ======================================================================
        // EFECTO CRT Y PERCEPCIÓN DE PANTALLA
        // ======================================================================
        // Desfase de canales RGB (Chromatic Aberration radial relativista)
        let lensing_warp = 1.0 + 0.15 / (max(0.01, radius - target_horizon * 0.05) + 0.001);
        let ca_shift = 0.015 * orig_p * lensing_warp;
        let dColDX = dpdx(color);
        let dColDY = dpdy(color);
        let col_r = color - dColDX * ca_shift.x - dColDY * ca_shift.y;
        let col_b = color + dColDX * ca_shift.x + dColDY * ca_shift.y;
        let final_rgb = vec3<f32>(col_r.x, color.y, col_b.z);

        // Permanent CRT Glass scanline and phosphor grille texturing
        let crt_scanline = 0.94 + 0.06 * sin(orig_p.y * 360.0);
        let phosphor_grille = 0.96 + 0.04 * sin(orig_p.x * 540.0);
        let crt_vignette = 1.0 - smoothstep(0.65, 1.4, length(orig_p));
        let final_textured = final_rgb * crt_scanline * phosphor_grille * crt_vignette;

        // CRT TV Collapse Mask y Scanlines
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

    // 1. Compilar Shader Module
    console.log("PhaseBlackHole: Compilando sombreador WGSL...");
    const shaderModule = this.device.createShaderModule({
      label: 'PhaseBlackHole Shader Module',
      code: wgslSource
    });

    // Validar compilación de forma proactiva
    if (shaderModule.getCompilationInfo) {
      const compInfo = await shaderModule.getCompilationInfo();
      const errors = compInfo.messages.filter(m => m.type === 'error');
      if (errors.length > 0) {
        console.error("PhaseBlackHole: Errores de compilación del sombreador WGSL:", errors);
        this.showVisualError("WGSL Compilation Error", errors.map(e => `Línea ${e.lineNum}:${e.linePos} - ${e.message}`).join('\n'));
        throw new Error(`WGSL Shader Error: ${errors[0].message}`);
      } else if (compInfo.messages.length > 0) {
        console.warn("PhaseBlackHole: Advertencias de compilación WGSL:", compInfo.messages);
      }
    }

    try {
      // 2. Uniform Buffer de 32 bytes (Alineación requerida 16 bytes)
      this.uniformBuffer = this.device.createBuffer({
        label: 'PhaseBlackHole Uniform Buffer',
        size: 32,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
      });

      // 3. Crear Bind Group Layout
      this.bindGroupLayout = this.device.createBindGroupLayout({
        label: 'PhaseBlackHole Bind Group Layout',
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
        label: 'PhaseBlackHole Bind Group',
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
        label: 'PhaseBlackHole Pipeline Layout',
        bindGroupLayouts: [this.bindGroupLayout]
      });

      // 6. Generar Render Pipeline
      this.pipeline = this.device.createRenderPipeline({
        label: 'PhaseBlackHole Render Pipeline',
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

      console.log("PhaseBlackHole: Sombreador Gargantua relativista de Agujero Negro creado con éxito.");
    } catch (e) {
      console.error("PhaseBlackHole: Error al crear el Pipeline de WebGPU:", e);
      this.showVisualError("WebGPU Pipeline Creation Error", e.message || String(e));
      throw e;
    }
  }

  /**
   * Muestra un overlay visual en pantalla con el error detallado de WebGPU.
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
      <p style="color:#aaaaaa;">Por favor, copia este error y repórtalo para solucionarlo inmediatamente.</p>
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

    // 1. Iniciar banda sonora pesada de gravedad en el primer frame
    if (synth && this.bhTime === 0.0) {
      synth.startBlackHoleSound();
    }

    // 2. Incrementar reloj de la fase
    this.bhTime += dt;

    // 3. Paneo interactivo Yaw/Pitch suave
    const lerpRotSpeed = 0.12;
    this.yawSmooth += (this.yaw - this.yawSmooth) * lerpRotSpeed;
    this.pitchSmooth += (this.pitch - this.pitchSmooth) * lerpRotSpeed;

    // 4. Lanzar colapso de audio a singularidad silenciosa al comenzar la absorción
    if (this.bhTime >= 12.0 && !this.singularityTriggered) {
      this.singularityTriggered = true;
      if (synth) {
        synth.triggerBlackHoleSingularity();
      }
    }

    // 5. Final de la fase: Retorna true al llegar a los 15s para saltar al Teseracto 4D
    if (this.bhTime >= 15.0) {
      this.isDone = true;
      return true; // Transición inmediata al Teseracto
    }

    // 6. Configurar prompt HUD explicativo
    if (this.promptEl) {
      if (this.isDone) {
        this.promptEl.classList.remove('show');
      } else {
        this.promptEl.classList.add('show');
        this.promptEl.classList.remove('pressing');
        this.promptEl.innerText = "CAYENDO EN EL AGUJERO NEGRO SUPERMASIVO (GARGANTUA)...\n[INTERACTÚA CON EL RATÓN PARA CONTEMPLAR EL ESPACIO DEFORMADO]";
      }
    }

    return false;
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
    uniformsData[5] = this.bhTime;                                       // u_bh_time
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
   * Orquesta la preciosa secuencia de créditos en fundidos cruzados.
   */
  startCreditsSequence() {
    if (this.creditsTriggered) return;
    this.creditsTriggered = true;
    console.log("PhaseBlackHole: Iniciando secuencia de títulos de cine.");

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

    // Asegurar silencio completo en AudioSynth para el master
    if (this.synth && this.synth.isInitialized) {
      const t = this.synth.ctx.currentTime;
      this.synth.masterGain.gain.cancelScheduledValues(t);
      this.synth.masterGain.gain.setValueAtTime(this.synth.masterGain.gain.value, t);
      this.synth.masterGain.gain.exponentialRampToValueAtTime(0.0001, t + 10.0);
    }

    let currentSlideIdx = 0;

    const displayNextSlide = () => {
      if (currentSlideIdx >= slidesData.length) {
        console.log("PhaseBlackHole: Fin de créditos alcanzado.");
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

    console.log("PhaseBlackHole: Recursos de Agujero Negro liberados de GPU.");
  }
}
