/**
 * PhaseVoid
 * 
 * Gestiona el vacío interactivo (STATE_VOID) e implementa la mecánica progresiva
 * "El Ritual de los 7 Pasos". Emplea un motor de Raymarching 3D completo desarrollado
 * en un único Fragment Shader en WGSL, capaz de mutar geométricamente entre 7 formas
 * matemáticas complejas mediante mezcla por LERP, realizar una transición de color
 * suave a paletas estrictamente frías y sincronizar frecuencias armónicas de Solfeggio.
 */
const A = Math.sqrt(2);
const B = Math.sqrt(3);
const C = Math.sqrt(5);

export class PhaseVoid {
  constructor() {
    this.device = null;
    this.format = null;

    // Recursos de WebGPU
    this.pipeline = null;
    this.uniformBuffer = null;
    this.bindGroupLayout = null;
    this.bindGroup = null;

    // Dimensiones internas de renderizado
    this.width = window.innerWidth;
    this.height = window.innerHeight;

    // LERP para el posicionamiento suave de la luz
    this.lightPos = { x: 0.5, y: 0.5 };

    // --- RITUAL DE LOS 7 PASOS ---
    this.targetStage = 0; // Clics registrados (0 a 7)
    this.morph = 0.0;     // Interpolación suave entre las formas geométricas [0.0 - 6.0]

    // Paleta de Colores Fríos progresiva (de 0 a 6 clics)
    this.colors = [
      [0.72, 0.88, 1.00], // 0: Azul gélido / blanquecino
      [0.00, 0.82, 1.00], // 1: Cian eléctrico
      [0.00, 0.62, 0.52], // 2: Turquesa profundo
      [0.12, 0.06, 0.50], // 3: Índigo oscuro
      [0.52, 0.00, 0.82], // 4: Violeta espectral
      [0.00, 0.22, 0.82], // 5: Azul cobalto
      [0.42, 0.52, 0.72]  // 6: Azul pizarra / plata
    ];

    this.currentColor = [...this.colors[0]];
    this.expansion = 0.0; // Control de u_expansion para el blanco final en el clic 7

    // Frecuencias Solfeggio y sus quintas justas para el ritual (Clicks 0 a 6)
    // Quinta justa = Frecuencia x 1.5
    this.solfeggioScale = [
      60.0,   // 0: Drone de vacío base místico (Sub-grave)
      174.0,  // 1: Solfeggio 174Hz (Frecuencia base de sanación)
      261.0,  // 2: Quinta justa de 174Hz (174 x 1.5 = 261Hz)
      396.0,  // 3: Solfeggio 396Hz (Liberación de miedo y culpa)
      594.0,  // 4: Quinta justa de 396Hz (396 x 1.5 = 594Hz)
      528.0,  // 5: Solfeggio 528Hz (Transformación y milagros / ADN)
      792.0   // 6: Quinta justa de 528Hz (528 x 1.5 = 792Hz)
    ];

    // Registro de disparo para evitar múltiples lecturas del ratón en el mismo frame (Edge Trigger)
    this.wasPointerDown = false;
  }

  /**
   * Compila los Shaders 3D en la GPU y crea las tuberías de WebGPU.
   */
  async init(device, format) {
    this.device = device;
    this.format = format;

    // ======================================================================
    // CÓDIGO WGSL: MOTOR DE RAYMARCHING 3D INTERACTIVO
    // ======================================================================
    const wgslSource = `
      // Estructura de Uniforms (Alineación perfecta a 48 bytes - Múltiplo de 16)
      struct Uniforms {
        u_resolution : vec2<f32>, // Offset 0, size 8
        u_mouse      : vec2<f32>, // Offset 8, size 8
        u_color      : vec3<f32>, // Offset 16, size 12 (Alineado a límite de 16 bytes)
        u_time       : f32,       // Offset 28, size 4
        u_expansion  : f32,       // Offset 32, size 4
        u_stage      : f32,       // Offset 36, size 4
        u_padding1   : f32,       // Offset 40, size 4
        u_padding2   : f32,       // Offset 44, size 4
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

      // Vertex Shader Procedural (Pinta fullscreen sin transferencias de buffers de CPU)
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

      // --- FUNCIONES MATEMÁTICAS DE ROTACIÓN Y SOPORTE ---
      
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

      fn smin(a : f32, b : f32, k : f32) -> f32 {
        let h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
        return mix(b, a, h) - k * h * (1.0 - h);
      }

      // --- GENERADORES DE RUIDO FRACTAL (FBM) ---
      
      fn hash(p : vec2<f32>) -> f32 {
        let h = dot(p, vec2<f32>(127.1, 311.7));
        return fract(sin(h) * 43758.5453123);
      }

      fn noise(p : vec2<f32>) -> f32 {
        let i = floor(p);
        let f = fract(p);
        let u = f * f * (3.0 - 2.0 * f);
        
        let a = hash(i + vec2<f32>(0.0, 0.0));
        let b = hash(i + vec2<f32>(1.0, 0.0));
        let c = hash(i + vec2<f32>(0.0, 1.0));
        let d = hash(i + vec2<f32>(1.0, 1.0));
        
        return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
      }

      fn fbm(p : vec3<f32>) -> f32 {
        var value : f32 = 0.0;
        var amplitude : f32 = 0.5;
        var temp_p = p.xy * 2.0;
        for (var i = 0; i < 3; i = i + 1) {
          value = value + amplitude * noise(temp_p);
          temp_p = temp_p * 2.1;
          amplitude = amplitude * 0.5;
        }
        return value;
      }

      // --- FUNCIONES SDF 3D (SIGNED DISTANCE FIELDS) ---

      // 0. Esfera
      fn sdSphere(p : vec3<f32>, r : f32) -> f32 {
        return length(p) - r;
      }

      // 1. Octaedro
      fn sdOctahedron(p : vec3<f32>, s : f32) -> f32 {
        let q = abs(p);
        return (q.x + q.y + q.z - s) * (1.0 / B);
      }

      // 2. Icosaedro (Intersección de planos bajo simetría áurea)
      fn sdIcosahedron(p : vec3<f32>, r : f32) -> f32 {
        let q = abs(p);
        let phi = (1.0 + C) * 0.5;
        let n1 = normalize(vec3<f32>(phi, 1.0, 0.0));
        let n2 = normalize(vec3<f32>(0.0, phi, 1.0));
        let n3 = normalize(vec3<f32>(1.0, 0.0, phi));
        
        let d1 = dot(q, n1);
        let d2 = dot(q, n2);
        let d3 = dot(q, n3);
        
        return max(max(d1, d2), d3) - r;
      }

      // 3. Toroide
      fn sdTorus(p : vec3<f32>, t : vec2<f32>) -> f32 {
        let q = vec2<f32>(length(p.xz) - t.x, p.y);
        return length(q) - t.y;
      }

      // 4. Cubo Deformado
      fn sdBox(p : vec3<f32>, b : vec3<f32>) -> f32 {
        let q = abs(p) - b;
        let d_box = length(max(q, vec3<f32>(0.0))) + min(max(q.x, max(q.y, q.z)), 0.0);
        // Modulación matemática de seno 3D para la deformación
        let displacement = sin(p.x * 6.5 + uniforms.u_time) * sin(p.y * 6.5) * sin(p.z * 6.5) * 0.07;
        return d_box + displacement;
      }

      // 5. Tetractys 3D (10 esferas unidas en una pirámide de 3 pisos mediante smooth min)
      fn sdTetractys(p : vec3<f32>) -> f32 {
        var d = 10000.0;
        let r = 0.125;
        let k = 0.14; // Factor de fundido suave (smin)
        
        // Piso 1 (Superior, Y = 0.4) - 1 Esfera
        d = smin(d, length(p - vec3<f32>(0.0, 0.4, 0.0)) - r, k);
        
        // Piso 2 (Medio, Y = 0.0) - 3 Esferas en triángulo equilátero
        d = smin(d, length(p - vec3<f32>(0.0, 0.0, 0.24)) - r, k);
        d = smin(d, length(p - vec3<f32>(-0.2, 0.0, -0.12)) - r, k);
        d = smin(d, length(p - vec3<f32>(0.2, 0.0, -0.12)) - r, k);
        
        // Piso 3 (Inferior, Y = -0.4) - 6 Esferas estructurando la base
        d = smin(d, length(p - vec3<f32>(0.0, -0.4, 0.48)) - r, k);
        d = smin(d, length(p - vec3<f32>(-0.2, -0.4, 0.12)) - r, k);
        d = smin(d, length(p - vec3<f32>(0.2, -0.4, 0.12)) - r, k);
        d = smin(d, length(p - vec3<f32>(-0.4, -0.4, -0.24)) - r, k);
        d = smin(d, length(p - vec3<f32>(0.0, -0.4, -0.24)) - r, k);
        d = smin(d, length(p - vec3<f32>(0.4, -0.4, -0.24)) - r, k);
        
        return d;
      }

      // 6. Estrella de Escher / Merkaba (Estrella octaédrica conformada por dos tetraedros)
      fn sdTetrahedron(p : vec3<f32>, r : f32) -> f32 {
        let q = abs(p);
        let d = max(max(q.x + q.y - q.z, q.x - q.y + q.z), -q.x + q.y + q.z) - r;
        return d * (1.0 / B); // Factor de corrección de escala del octaedro
      }

      fn sdMerkaba(p : vec3<f32>, r : f32) -> f32 {
        let d1 = sdTetrahedron(p, r);
        let d2 = sdTetrahedron(vec3<f32>(p.x, -p.y, -p.z), r); // Tetraedro invertido
        return min(d1, d2); // Unión
      }

      // --- MATE DE MORPHING EN GPU ---
      // Interpola dinámicamente el SDF según la fase actual u_stage
      fn getSDF(p : vec3<f32>, stage : f32, time : f32) -> f32 {
        let s0 = sdSphere(p, 0.44) + fbm(p * 3.0 + time * 0.5) * 0.08;
        let s1 = sdOctahedron(p, 0.48);
        let s2 = sdIcosahedron(p, 0.44);
        let s3 = sdTorus(p, vec2<f32>(0.42, 0.16));
        let s4 = sdBox(p, vec3<f32>(0.42));
        let s5 = sdTetractys(p);
        let s6 = sdMerkaba(p, 0.46);

        if (stage < 1.0) { return mix(s0, s1, stage); }
        if (stage < 2.0) { return mix(s1, s2, stage - 1.0); }
        if (stage < 3.0) { return mix(s2, s3, stage - 2.0); }
        if (stage < 4.0) { return mix(s3, s4, stage - 3.0); }
        if (stage < 5.0) { return mix(s4, s5, stage - 4.0); }
        return mix(s5, s6, clamp(stage - 5.0, 0.0, 1.0));
      }

      // Estimador de normales numérico en 3D para el Morphing SDF
      fn getNormal(p : vec3<f32>, stage : f32, time : f32) -> vec3<f32> {
        let eps = 0.002;
        let h = getSDF(p, stage, time);
        return normalize(vec3<f32>(
          getSDF(p + vec3<f32>(eps, 0.0, 0.0), stage, time) - h,
          getSDF(p + vec3<f32>(0.0, eps, 0.0), stage, time) - h,
          getSDF(p + vec3<f32>(0.0, 0.0, eps), stage, time) - h
        ));
      }

      // --- FRAGMENT SHADER DE RAYMARCHING ---
      @fragment
      fn fs_main(in : VertexOutput) -> @location(0) vec4<f32> {
        let uv = in.uv;
        let aspect = uniforms.u_resolution.x / uniforms.u_resolution.y;

        // Centrar las coordenadas del lienzo
        var p = (uv - 0.5) * 2.0;
        p.x = p.x * aspect;

        // CRT TV Vertical Collapse (Horizontal compression first, then vertical)
        let orig_p = p;
        let T = uniforms.u_expansion;
        let t_horiz = clamp(T / 0.75, 0.0, 1.0);
        let t_vert = clamp((T - 0.75) / 0.25, 0.0, 1.0);

        let scale_x = max(0.0001, 1.0 - t_horiz);
        let scale_y = max(0.0001, 1.0 - t_vert);
        p.x = p.x / scale_x;
        p.y = p.y / scale_y;

        // Configuración de la Cámara 3D (Perspectiva virtual)
        let ro = vec3<f32>(0.0, 0.0, -2.5);          // Origen del rayo
        var rd = normalize(vec3<f32>(p.x, p.y, 1.6)); // Dirección del rayo

        // Defocus (blur) transition
        let active_t = max(t_horiz, t_vert);
        let noiseX = sin(orig_p.x * 2314.15 + orig_p.y * 9431.62 + uniforms.u_time * 12.0) * 0.5;
        let noiseY = cos(orig_p.x * 1432.53 + orig_p.y * 6138.87 - uniforms.u_time * 15.0) * 0.5;
        rd = normalize(rd + vec3<f32>(noiseX, noiseY, 0.0) * (active_t * 0.045));

        // Matrices de Rotación dinámicas para rotar la geometría en el vacío
        let angleX = uniforms.u_time * 0.35;
        let angleY = uniforms.u_time * 0.28;
        let rotMat = rotateY(angleY) * rotateX(angleX);

        // 1. Bucle de Raymarching para colisión con la superficie (Pieza o Suelo)
        var t : f32 = 0.02;
        var d : f32 = 0.0;
        var pos : vec3<f32> = vec3<f32>(0.0);
        var hit_shape = false;
        var hit_floor = false;
        var floor_pos : vec3<f32> = vec3<f32>(0.0);

        for (var i = 0; i < 50; i = i + 1) {
          pos = ro + rd * t;
          let rpos = rotMat * pos; // Rotar espacio local de las formas
          
          let d_shape = getSDF(rpos, uniforms.u_stage, uniforms.u_time);
          let d_floor = pos.y - (-0.75); // Plano en y = -0.75 debajo de la pieza
          
          d = min(d_shape, d_floor);
          
          if (d < 0.0005) {
            if (d_shape < d_floor) {
              hit_shape = true;
            } else {
              hit_floor = true;
              floor_pos = pos;
            }
            break;
          }
          t = t + d;
          if (t > 4.8) {
            break;
          }
        }

        // 2. Acumulación Volumétrica del Resplandor (Glow)
        // Permite que la anomalía se vea líquida y sumamente brillante
        var glow : f32 = 0.0;
        var t_glow : f32 = 0.0;
        
        for (var i = 0; i < 28; i = i + 1) {
          let p_glow = ro + rd * t_glow;
          let rpos_glow = rotMat * p_glow;
          
          let d_glow = getSDF(rpos_glow, uniforms.u_stage, uniforms.u_time);
          
          // Ecuación de resplandor inverso aditivo
          glow = glow + 0.0032 / (abs(d_glow) + 0.012);
          
          t_glow = t_glow + max(abs(d_glow) * 0.6, 0.025);
          if (t_glow > 3.8) {
            break;
          }
        }

        // 3. Proximidad del cursor del ratón (Atracción y vibración interactiva)
        let mouse = (uniforms.u_mouse - 0.5) * 2.0;
        let mouse_dist = length(p - vec2<f32>(mouse.x * aspect, mouse.y));
        let mouse_glow = 0.008 / (mouse_dist * mouse_dist + 0.004);

        // 4. Color del suelo con reflejo trazado si aplica
        var surface_color = vec3<f32>(0.0);

        if (hit_shape) {
          // Color básico cel-shaded de la pieza flotante
          let rpos = rotMat * pos;
          let N_local = getNormal(rpos, uniforms.u_stage, uniforms.u_time);
          let N_world = transpose(rotMat) * N_local; // Rotación inversa para devolver a world-space
          
          let lightDir = normalize(vec3<f32>(0.5, 0.8, -0.5));
          let diff = max(dot(N_world, lightDir), 0.0);
          let diffStepped = step(0.2, diff) * 0.4 + step(0.65, diff) * 0.55;
          surface_color = vec3<f32>(0.92, 0.95, 1.0) * (0.2 + diffStepped * 0.8);
          
          // Contorno de tinta estilo manga (fresnel outline)
          let edge = pow(1.0 - max(dot(-rd, N_world), 0.0), 3.0);
          let border = smoothstep(0.45, 0.85, edge);
          surface_color = mix(surface_color, vec3<f32>(0.02, 0.02, 0.05), border * 0.92);
        } else if (hit_floor) {
          // Base del suelo espejo gélido negro y azul profundo
          var floor_color = vec3<f32>(0.02, 0.03, 0.05);

          // Patrón de rejilla cian neón muy elegante y sutil en perspectiva
          let grid_size = 0.45;
          let gx = abs(fract(floor_pos.x / grid_size) - 0.5) / 0.035;
          let gz = abs(fract(floor_pos.z / grid_size) - 0.5) / 0.035;
          let grid_line = smoothstep(1.0, 0.0, min(gx, gz)) * 0.022;
          floor_color = floor_color + vec3<f32>(0.0, 0.5, 1.0) * grid_line;

          // Raymarching secundario: Reflejo en espejo plano
          let ro_refl = floor_pos + vec3<f32>(0.0, 0.005, 0.0); // Evitar colisión espuria
          let rd_refl = reflect(rd, vec3<f32>(0.0, 1.0, 0.0)); // Vector de reflexión

          var t_refl : f32 = 0.02;
          var d_refl : f32 = 0.0;
          var hit_refl = false;
          var pos_refl : vec3<f32> = vec3<f32>(0.0);

          for (var j = 0; j < 30; j = j + 1) {
            pos_refl = ro_refl + rd_refl * t_refl;
            let rpos_refl = rotMat * pos_refl;

            d_refl = getSDF(rpos_refl, uniforms.u_stage, uniforms.u_time);

            if (d_refl < 0.001) {
              hit_refl = true;
              break;
            }
            t_refl = t_refl + d_refl;
            if (t_refl > 3.0) {
              break;
            }
          }

          if (hit_refl) {
            // El rayo reflejado impacta en la pieza flotante
            // Color reflejado atenuado por la distancia recorrida (t_refl)
            let refl_dist_atten = 1.0 / (1.0 + t_refl * t_refl * 2.2);
            let reflection_glow = 0.82 * refl_dist_atten;
            // Mezclamos el color base del suelo con la reflexión
            floor_color = mix(floor_color, uniforms.u_color * reflection_glow + vec3<f32>(0.92, 0.95, 1.0) * 0.45 * refl_dist_atten, 0.60);
          }

          surface_color = floor_color;
        }

        // 5. Composición cromática final con cel-shading en el resplandor
        let exp_factor = uniforms.u_expansion * uniforms.u_expansion * uniforms.u_expansion;
        let final_glow = glow * (1.0 + exp_factor * 16.0) + mouse_glow * 0.12;
        
        // Posterizar/cuantizar el resplandor para bandas de color de comic dramáticas
        let stepped_glow = step(0.08, final_glow) * 0.15 + step(0.24, final_glow) * 0.28 + step(0.48, final_glow) * 0.44 + step(0.85, final_glow) * 0.35;
        var final_color = surface_color + uniforms.u_color * stepped_glow * 1.5;

        // --- DESTELLO FINAL A BLANCO EN EL CLIC 7 ---
        let whiteout = clamp((uniforms.u_expansion - 0.28) * 1.5, 0.0, 1.0);
        var col = mix(final_color, vec3<f32>(1.0), whiteout * 0.0);

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
      label: 'PhaseVoid Shader Module 3D',
      code: wgslSource
    });

    // 2. Reservar memoria del Uniform Buffer (Exactamente 48 bytes)
    this.uniformBuffer = this.device.createBuffer({
      label: 'PhaseVoid Uniform Buffer 3D',
      size: 48,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });

    // 3. Crear el diseño de enlace del grupo (Bind Group Layout)
    this.bindGroupLayout = this.device.createBindGroupLayout({
      label: 'PhaseVoid Bind Group Layout 3D',
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
      label: 'PhaseVoid Bind Group 3D',
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
      label: 'PhaseVoid Pipeline Layout 3D',
      bindGroupLayouts: [this.bindGroupLayout]
    });

    // 6. Generar el Render Pipeline
    this.pipeline = this.device.createRenderPipeline({
      label: 'PhaseVoid Render Pipeline 3D',
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
            writeMask: 0xF // GPUColorWrite.ALL (Seguridad de compilación absoluta)
          }
        ]
      },
      primitive: {
        topology: 'triangle-list'
      }
    });

    console.log("PhaseVoid: Pipeline de Raymarching 3D y uniformes de 48 bytes creados.");
  }

  /**
   * Actualiza el estado lógico, realiza interpolaciones suaves en JS y mapea
   * de forma ritual las frecuencias e intensidades al sintetizador de Audio.
   * Devuelve `true` al completarse el umbral de expansión (destello blanco final).
   */
  update(dt, input, synth) {
    // 1. Suavizar movimiento de la luz mediante LERP
    const lerpSpeed = 0.08;
    this.lightPos.x += (input.x - this.lightPos.x) * lerpSpeed;
    this.lightPos.y += (input.y - this.lightPos.y) * lerpSpeed;

    // 2. Detección de clic dinámico sobre la anomalía (Edge Trigger de PointerDown)
    const isClicked = input.isPointerDown && !this.wasPointerDown;
    this.wasPointerDown = input.isPointerDown;

    if (isClicked) {
      // Calcular la distancia euclídea al centro de la anomalía de luz
      const dx = input.x - this.lightPos.x;
      const dy = input.y - this.lightPos.y;
      const distance = Math.sqrt(dx * dx + dy * dy);

      // Si el clic es dentro del radio activo de la anomalía (25% del viewport)
      if (distance < 0.25) {
        if (this.targetStage < 7) {
          this.targetStage++;
          console.log(`[RITUAL] Clic registrado. Progreso: ${this.targetStage}/7`);
          
          // Tratar el cambio de sonido ritual de forma síncrona inmediata
          this.triggerSoundProgression(synth);
        }
      }
    }

    // 3. Modulación suave del factor Morph y Colores en JavaScript
    if (this.targetStage < 7) {
      // Morphing dinámico a la siguiente forma geométrica
      this.morph += (this.targetStage - this.morph) * 0.075;

      // Interpolación del color frío activo
      const targetCol = this.colors[Math.min(6, this.targetStage)];
      this.currentColor[0] += (targetCol[0] - this.currentColor[0]) * 0.075;
      this.currentColor[1] += (targetCol[1] - this.currentColor[1]) * 0.075;
      this.currentColor[2] += (targetCol[2] - this.currentColor[2]) * 0.075;

      // Mantener expansión desactivada
      this.expansion = 0.0;
    } else {
      // --- CUMPLIMIENTO DEL SÉPTIMO CLIC (EL UMBRAL) ---
      // El factor de morphing se estanca en la figura final (Merkaba)
      this.morph = 6.0;
      
      // El color muta a blanco puro radiante
      this.currentColor = [1.0, 1.0, 1.0];

      // Disparar expansión exponencial
      this.expansion = Math.min(1.0, this.expansion + dt * (0.35 + this.expansion * 3.8));
    }

    // 4. Audio de fondo dinámico reactivo al cursor mientras no se complete el ritual
    if (synth && this.targetStage < 7) {
      const dx = input.x - this.lightPos.x;
      const dy = input.y - this.lightPos.y;
      const distance = Math.sqrt(dx * dx + dy * dy);
      const proximity = Math.max(0.0, 1.0 - distance * 2.2);

      // Frecuencia base de la escala Solfeggio según etapa
      const baseFreq = this.solfeggioScale[this.targetStage];
      
      // Proximidad al núcleo incrementa la vibración ligeramente (+20% de tono)
      const targetFreq = baseFreq + (proximity * baseFreq * 0.20);
      
      // Abrir el filtro a mayor proximidad
      const targetFilter = 400.0 + (proximity * 1600.0) + (this.targetStage * 150.0);
      
      // Control de volumen sutil
      const targetVol = 0.15 + (proximity * 0.05);

      synth.setFrequency(targetFreq, 0.1);
      synth.setFilterCutoff(targetFilter, 0.1);
      synth.setVolume(targetVol, 0.1);
    }

    // 5. Finalizar la escena si la inundación blanca cubre la pantalla
    if (this.expansion >= 1.0) {
      return true; // Notifica a main.js para cambiar el estado global a STATE_TEMPLE
    }

    return false;
  }

  /**
   * Ejecuta los barridos y drops de frecuencia rituales en la transición de clics.
   */
  triggerSoundProgression(synth) {
    if (!synth) return;

    if (this.targetStage < 7) {
      // 1. Subir a la nueva frecuencia de Solfeggio con una rampa exponencial marcada
      const targetFreq = this.solfeggioScale[this.targetStage];
      // Abrir filtro súbitamente para dar brillo al impacto del clic
      const openCutoff = 2500.0 + (this.targetStage * 300.0);
      
      synth.setFrequency(targetFreq, 0.35); // Rampa de Pitch de 0.35s
      synth.setFilterCutoff(openCutoff, 0.1);
      synth.setVolume(0.26, 0.05); // Pulsación fuerte inicial de volumen

      // Devolver filtro y volumen a su rango base pasados 250ms
      setTimeout(() => {
        if (this.targetStage < 7) {
          synth.setFilterCutoff(400.0 + (this.targetStage * 200.0), 0.5);
          synth.setVolume(0.16, 0.5);
        }
      }, 250);
    } else {
      // --- SÉPTIMO CLIC: IMPACTO PROFUNDO / SUB-DROP ---
      console.log("[RITUAL] El Umbral se abre. Ejecutando Sub-Drop.");
      
      // Caída libre del oscilador a 35Hz (Sub-bass envolvente y físico)
      synth.setFrequency(35.0, 1.4);
      // Cerrar filtro pasa-bajos a 80Hz para absorber armónicos y generar zumbido puro
      synth.setFilterCutoff(80.0, 1.2);
      // Aumentar la potencia al máximo soportado para acentuar el impacto físico
      synth.setVolume(0.45, 0.1);

      // Desvanecer volumen de forma progresiva mientras la pantalla se inunda de blanco
      setTimeout(() => {
        synth.setVolume(0.0, 1.0);
      }, 800);
    }
  }

  /**
   * Envía los datos dinámicos alineados de los uniformes y codifica el pase de Raymarching.
   */
  render(device, view, encoder, frameData) {
    if (!this.pipeline) return;

    // 1. Mapeo a Float32Array (12 elementos = 48 bytes)
    const uniformsData = new Float32Array(12);
    uniformsData[0] = this.width;                     // u_resolution.x
    uniformsData[1] = this.height;                    // u_resolution.y
    uniformsData[2] = this.lightPos.x;                // u_mouse.x
    uniformsData[3] = 1.0 - this.lightPos.y;          // u_mouse.y
    uniformsData[4] = this.currentColor[0];           // u_color.r
    uniformsData[5] = this.currentColor[1];           // u_color.g
    uniformsData[6] = this.currentColor[2];           // u_color.b
    uniformsData[7] = frameData.elapsedTime;          // u_time
    uniformsData[8] = this.expansion;                 // u_expansion
    uniformsData[9] = this.morph;                     // u_stage
    uniformsData[10] = 0.0;                           // u_padding1
    uniformsData[11] = 0.0;                           // u_padding2

    // Escribir los datos en memoria GPU
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

    // 3. Codificar comandos de dibujado en GPU
    const passEncoder = encoder.beginRenderPass(renderPassDescriptor);
    passEncoder.setPipeline(this.pipeline);
    passEncoder.setBindGroup(0, this.bindGroup);
    passEncoder.draw(3); // Triángulo procedural a pantalla completa
    passEncoder.end();
  }

  /**
   * Refresca las dimensiones para asegurar el aspect ratio en el Raymarching.
   */
  resize(width, height) {
    this.width = width;
    this.height = height;
  }

  /**
   * Destruye recursos de GPU para prevenir pérdidas de memoria física.
   */
  destroy() {
    if (this.uniformBuffer) {
      this.uniformBuffer.destroy();
    }
    this.pipeline = null;
    this.uniformBuffer = null;
    this.bindGroupLayout = null;
    this.bindGroup = null;
    console.log("PhaseVoid: Pipeline 3D liberado.");
  }
}
