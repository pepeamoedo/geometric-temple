/**
 * PhaseAscension
 * 
 * Clímax visual y auditivo de la ascensión (STATE_ASCENSION).
 * El jugador experimenta un viaje vertical cinematográfico desde el suelo del desierto
 * hasta la estratosfera y el espacio cósmico. Se bloquean los controles de movimiento WASD,
 * pero se mantiene la mirada interactiva en 360 grados para contemplar la curvatura de la Tierra
 * y un campo de estrellas procedimentales que centellean.
 */
const A = Math.sqrt(2);
const B = Math.sqrt(3);
const C = Math.sqrt(5);

export class PhaseAscension {
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

    // Seguimiento delta de Yaw y Pitch en primera persona (mirada interactiva 360)
    this.yaw = 0.0;
    this.pitch = 0.0;
    this.yawSmooth = 0.0;
    this.pitchSmooth = 0.0;
    this.lastMouseX = null;
    this.lastMouseY = null;

    // Coordenadas físicas en 3D de la cámara (Y asciende continuamente)
    this.cameraX = 1.5;
    this.cameraZ = 7.5;
    this.cameraY = 0.52;
    this.ascensionTime = 0.0;

    // Posición del artefacto sagrado en el suelo
    this.objX = 1.5;
    this.objZ = 7.5;

    // Fades de transición
    this.exitFade = 0.0; // Desvanecimiento final a negro (0.0 -> 1.0)
    this.isDone = false;

    // Recursos de créditos
    this.creditsTriggered = false;
    this.creditsEl = null;
    this.promptEl = null;

    // Enlazar manejadores de eventos
    this.onPointerMove = this.onPointerMove.bind(this);
    this.onPointerDown = this.onPointerDown.bind(this);
    this.onPointerUp = this.onPointerUp.bind(this);
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
    this.pitch -= dy * sensitivity;

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
   * Inicializa la GPU y compila el shader 3D de la ascensión espacial.
   */
  async init(device, format) {
    this.device = device;
    this.format = format;

    this.promptEl = document.getElementById('temple-prompt');

    // Registrar escuchadores de ratón delta
    window.addEventListener('pointermove', this.onPointerMove, { passive: true });
    window.addEventListener('pointerdown', this.onPointerDown, { passive: true });
    window.addEventListener('pointerup', this.onPointerUp, { passive: true });

    // ======================================================================
    // CÓDIGO WGSL: RENDERIZADO DE ASCENSIÓN CON TIERRA CURVA Y ESTRELLAS
    // ======================================================================
    const wgslSource = `
      struct Uniforms {
        u_resolution : vec2<f32>, // Offset 0, size 8
        u_mouse      : vec2<f32>, // Offset 8, size 8
        u_camera_pos : vec3<f32>, // Offset 16, size 12
        u_fade_black : f32,       // Offset 28, size 4 (Fundido final a negro, de 0 a 1)
        u_time       : f32,       // Offset 32, size 4
        u_ascension_time : f32,   // Offset 36, size 4
        u_padding2   : f32,       // Offset 40, size 4
        u_padding3   : f32,       // Offset 44, size 4
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

      // --- ALTURA MATEMÁTICA DE LAS DUNAS ---
      
      fn getDuneHeight(x : f32, z : f32) -> f32 {
        let val1 = sin(x * 0.15 + z * 0.08);
        let h1 = (1.0 - abs(val1)) * 0.65;
        
        let val2 = cos(x * 0.08 - z * 0.12);
        let h2 = (1.0 - abs(val2)) * 0.35;
        
        let h3 = sin(x * 0.4 - z * 0.3) * 0.08;
        
        return h1 + h2 + h3 - 0.45;
      }

      // --- CAMPO DE ESTRELLAS PROCEDIMENTAL 3D ---
      
      fn getStars(rd : vec3<f32>, time : f32) -> vec3<f32> {
        let scale = 180.0;
        let p = rd * scale;
        let ip = floor(p);
        let fp = fract(p);
        let rand = fract(sin(dot(ip, vec3<f32>(127.1, 311.7, 74.7))) * 43758.5453123);
        
        var stars = vec3<f32>(0.0);
        if (rand > 0.985) {
          let center = fp - vec3<f32>(0.5);
          let dist = length(center);
          let twinkle = sin(time * 4.0 + rand * 6.28) * 0.5 + 0.5;
          let glow = (1.0 - smoothstep(0.0, 0.09, dist)) * twinkle;
          
          // Mezcla de colores estelares cálidos y fríos
          let starColor = mix(vec3<f32>(1.0, 0.96, 0.85), vec3<f32>(0.65, 0.88, 1.0), rand);
          stars = starColor * glow * 2.0;
        }
        return stars;
      }

      // --- COLOR DEL CIELO DIURNO (PARA MEZCLA DE ALTITUD) ---
      
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
        
        // Calima brillante del horizonte
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

        if (uniforms.u_ascension_time < 1.5) {
          // ==========================================
          // EXPANSION (TV TURN-ON FROM HORIZONTAL LINE)
          // X expands first from center to full width,
          // then Y expands to full height.
          // ==========================================
          let E = clamp(uniforms.u_ascension_time / 1.5, 0.0, 1.0); // E goes from 0.0 to 1.0
          t_horiz = clamp((0.25 - E) / 0.25, 0.0, 1.0);
          t_vert = clamp((1.0 - E) / 0.75, 0.0, 1.0);
        }

        let scale_x = max(0.0001, 1.0 - t_horiz);
        let scale_y = max(0.0001, 1.0 - t_vert);
        p.x = p.x / scale_x;
        p.y = p.y / scale_y;

        let ro = uniforms.u_camera_pos;

        // Control de mirada Yaw/Pitch interactivo 360º
        let yaw = (uniforms.u_mouse.x - 0.5) * 3.14159265 * 2.0;
        let pitch = (uniforms.u_mouse.y - 0.5) * 3.14159265 * 0.42;

        let camRot = rotateY(yaw) * rotateX(pitch);
        var rd = camRot * normalize(vec3<f32>(p.x, -0.95, p.y)); // Mirar directamente hacia abajo a la Tierra para centrarla en el viewport

        // Defocus (blur) transition
        let active_t = max(t_horiz, t_vert);
        let noiseX = sin(orig_p.x * 2314.15 + orig_p.y * 9431.62 + uniforms.u_time * 12.0) * 0.5;
        let noiseY = cos(orig_p.x * 1432.53 + orig_p.y * 6138.87 - uniforms.u_time * 15.0) * 0.5;
        rd = normalize(rd + vec3<f32>(noiseX, noiseY, 0.0) * (active_t * 0.045));

        let lightDir = normalize(vec3<f32>(0.7, 0.35, -0.6));

        // ======================================================================
        // CÁLCULO DE LA CURVATURA DE LA TIERRA MEDIANTE INTERSECCIÓN DE ESFERA
        // ======================================================================
        let R: f32 = 180.0; // Radio del planeta simulado
        let sphere_center = vec3<f32>(1.5, -R, 7.5); // Posicionado para que Y=0 en el desierto

        let oc = ro - sphere_center;
        let b = dot(oc, rd);
        let c = dot(oc, oc) - R * R;
        let h = b * b - c;

        var hit_earth = false;
        var t_earth: f32 = -1.0;

        if (h > 0.0) {
          t_earth = -b - sqrt(h);
          if (t_earth > 0.0) {
            hit_earth = true;
          }
        }

        // ======================================================================
        // COMPOSICIÓN DEL ESPACIO Y CIELO
        // ======================================================================
        let daySky = getSkyColor(rd);
        let spaceSky = vec3<f32>(0.0); // Espacio negro absoluto

        // El factor de altitud mezcla la atmósfera del día con el espacio interestelar
        // A partir de Y=80.0 se entra en la oscuridad del espacio
        let altFactor = smoothstep(0.52, 100.0, ro.y);
        var skyColor = mix(daySky, spaceSky, altFactor);

        // Activar campo de estrellas a medida que oscurece la atmósfera
        let stars = getStars(rd, uniforms.u_time);
        skyColor = skyColor + stars * altFactor;

        var color = skyColor;

        // Si colisiona con el planeta
        if (hit_earth) {
          let hitPos = ro + rd * t_earth;
          let N = normalize(hitPos - sphere_center);
          let diff = pow(max(dot(N, lightDir), 0.0), 1.2);
          
          // Difuso cel-shaded para el planeta curvado
          let diffStepped = step(0.18, diff) * 0.45 + step(0.65, diff) * 0.55;

          // Terreno de dunas en la curvatura
          let sand_color = vec3<f32>(0.96, 0.78, 0.42);
          let shadow_color = vec3<f32>(0.42, 0.28, 0.12);
          var earthSurface = mix(shadow_color, sand_color, diffStepped);

          // Ondas de arena procedimentales para detalles a baja cota
          if (ro.y < 35.0) {
            let ripple = sin(hitPos.x * 24.0 + hitPos.z * 18.0) * 0.025;
            earthSurface = earthSurface + vec3<f32>(0.98, 0.88, 0.65) * (ripple * diffStepped);
          }

          // Contorno de tinta manga negro en el borde del horizonte del planeta
          let edge = pow(1.0 - max(dot(-rd, N), 0.0), 5.0);
          let border = smoothstep(0.62, 0.92, edge);
          earthSurface = mix(earthSurface, vec3<f32>(0.01, 0.01, 0.02), border * 0.90);

          // Brillo atmosférico azul al borde del disco del planeta (Limb Glow)
          let toCamera = normalize(ro - hitPos);
          let fresnel = pow(1.0 - max(dot(N, toCamera), 0.0), 5.0);
          let atmosphereGlow = vec3<f32>(0.0, 0.52, 0.96) * fresnel * 0.75 * (1.0 - altFactor);

          color = mix(earthSurface, atmosphereGlow, fresnel);

          // Fundido del planeta entero a medida que ascendemos a la inmensidad cósmica
          // A altitudes extremas, se disuelve en el vacío
          let earthFade = smoothstep(100.0, 15000.0, ro.y);
          color = mix(color, spaceSky, earthFade * 0.96);
        }

        // ======================================================================
        // TIERRA ENCOGIENDO A UN PUNTO DE LUZ
        // ======================================================================
        // La Tierra está centrada directamente debajo de la cámara en el plano XZ.
        // Dirección de la Tierra: recta hacia abajo (vec3<f32>(0.0, -1.0, 0.0)).
        let dir_to_earth = vec3<f32>(0.0, -1.0, 0.0);
        let earth_cos = dot(rd, dir_to_earth);
        
        // Un resplandor concentrado blanco-azul que imita el planeta encogiendo en la lejanía.
        // A mayor altitud, este brillo se concentra y destaca.
        let earth_glow_factor = smoothstep(150.0, 35000.0, ro.y);
        let earth_star_glow = 0.00015 / (1.0 - earth_cos + 0.000015) * earth_glow_factor;
        let earth_star_color = vec3<f32>(0.45, 0.78, 1.0) * earth_star_glow * 3.5;
        
        color = color + earth_star_color;

        // ======================================================================
        // HAZ DE LUZ CIAN DE LA VICTORIA (PROYECTADO HACIA EL ESPACIO)
        // ======================================================================
        // Distancia ortogonal al cilindro del faro en (1.5, 7.5)
        let dist_to_beacon = length(ro.xz - vec2<f32>(1.5, 7.5));
        let ray_dist_to_beacon = length(cross(rd, vec3<f32>(0.0, 1.0, 0.0)));
        
        // El haz se estrecha con la altura del observador pero brilla como un filamento de neón
        let beamRadius = 0.08 + ro.y * 0.002;
        let beacon_glow = 0.0028 / (ray_dist_to_beacon * ray_dist_to_beacon + 0.0004);
        let beacon_color = vec3<f32>(0.0, 0.95, 1.0) * beacon_glow * (1.0 - smoothstep(0.52, 550.0, ro.y));

        color = color + beacon_color * 0.72;

        // ======================================================================
        // LÍNEAS DE VELOCIDAD RADIALES ESTILO CÓMIC MANGA / ANIME (SPEED LINES)
        // ======================================================================
        let screenCenter = p; // Coordenadas del lienzo con aspecto corregido
        let radius = length(screenCenter);
        let angle = atan2(screenCenter.y, screenCenter.x);
        
        let sectors = 84.0; // Número de sectores angulares radiales
        let angleGrid = angle * sectors / 6.2831853;
        let sectorId = floor(angleGrid);
        let sectorFract = fract(angleGrid);
        
        let randLine = fract(sin(sectorId * 12.9898 + 45.164) * 43758.5453);
        
        // Las líneas se concentran solo en el borde exterior de la visión (vignette radial manga)
        let edgeFade = smoothstep(0.25, 1.15, radius);
        
        // Parpadeo ultra-rápido de alta frecuencia temporal (Speed Lines Flicker)
        let flicker = step(0.46, fract(sin(sectorId * 45.12 + uniforms.u_ascension_time * 65.0) * 43758.5453));
        
        var mangaLines : f32 = 0.0;
        if (randLine > 0.65 && edgeFade > 0.0) {
          // Grosor hiper-fino y afilado de cada filamento
          let lineWeight = (1.0 - smoothstep(0.0, 0.08, abs(sectorFract - 0.5)));
          
          // Se vuelven salvajes a medida que ganamos altitud
          let speedFactor = smoothstep(1.0, 8.0, uniforms.u_ascension_time) * (1.0 - uniforms.u_fade_black);
          mangaLines = lineWeight * edgeFade * flicker * speedFactor * 0.96;
        }

        // Adicionar las líneas cinéticas en blanco cian brillante sobre la composición
        color = mix(color, vec3<f32>(0.92, 0.97, 1.0), mangaLines);

        // ======================================================================
        // COMPOSICIÓN FINAL Y TRANSICIONES
        // ======================================================================
        // Sutil niebla dorada a baja altura
        let fog_factor = clamp(exp(-0.015 * t_earth), 0.0, 1.0);
        let fog_color = vec3<f32>(0.96, 0.88, 0.78);
        var col = mix(fog_color, color, mix(fog_factor, 1.0, altFactor));

        // Aplicar fundido final a negro absoluto (desactivado para usar CRT puro)
        let final_fade = col;

        // Desfase de canales RGB (Chromatic Aberration radial) mediante derivadas analíticas de GPU
        let ca_shift = 0.012 * p;
        let dColDX = dpdx(final_fade);
        let dColDY = dpdy(final_fade);
        let col_r = final_fade - dColDX * ca_shift.x - dColDY * ca_shift.y;
        let col_b = final_fade + dColDX * ca_shift.x + dColDY * ca_shift.y;
        let final_rgb = vec3<f32>(col_r.r, final_fade.g, col_b.b);

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
      label: 'PhaseAscension Shader Module',
      code: wgslSource
    });

    // 2. Reservar memoria del Uniform Buffer (Alineación requerida de 48 bytes)
    this.uniformBuffer = this.device.createBuffer({
      label: 'PhaseAscension Uniform Buffer',
      size: 48,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });

    // 3. Crear el diseño de enlace del grupo
    this.bindGroupLayout = this.device.createBindGroupLayout({
      label: 'PhaseAscension Bind Group Layout',
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
      label: 'PhaseAscension Bind Group',
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
      label: 'PhaseAscension Pipeline Layout',
      bindGroupLayouts: [this.bindGroupLayout]
    });

    // 6. Generar el Render Pipeline
    this.pipeline = this.device.createRenderPipeline({
      label: 'PhaseAscension Render Pipeline',
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

    console.log("PhaseAscension: Pipeline de renderizado de la ascensión espacial creado.");
  }

  /**
   * Actualiza el ascenso físico en vertical y LERPea los ángulos de mirada.
   * Al completarse la ascensión, lanza los créditos.
   */
  update(dt, input, synth) {
    if (synth) {
      this.synth = synth;
    }

    // 1. Iniciar la secuencia de sonido espacial en el primer ciclo
    if (synth && !this.creditsTriggered && this.ascensionTime === 0.0) {
      synth.startAscensionSound();
    }

    // 2. Avanzar el contador de tiempo de ascensión
    this.ascensionTime += dt;

    // 3. LERP de mirada horizontal (Yaw) y vertical (Pitch) interactiva
    const lerpRotSpeed = 0.12;
    this.yawSmooth += (this.yaw - this.yawSmooth) * lerpRotSpeed;
    this.pitchSmooth += (this.pitch - this.pitchSmooth) * lerpRotSpeed;

    // Modulación lenta espacial en 3D
    if (synth && synth.isInitialized) {
      synth.updateCorePanners(this.ascensionTime);
      
      // Sutil barrido de filtro basado en la altitud para dar sensación de salir de la atmósfera
      const filterFreq = Math.max(300.0, 1400.0 - (this.cameraY * 1.5));
      synth.setFilterCutoff(filterFreq, dt);
    }

    // 4. Ecuación de Ascenso Exponencial en Y (Propulsión supersónica radical)
    // Acelera masivamente para lograr un escape gravitatorio ultra rápido y dramático
    this.cameraY = 0.52 + Math.pow(this.ascensionTime, 3.4) * 8.0;

    // 5. Finalizar ascensión: Transición inmediata e ininterrumpida tras 12 segundos
    if (this.ascensionTime >= 12.0) {
      this.isDone = true;
      return true; // Transición inmediata sin fundidos a STATE_BLACKHOLE
    }

    // 6. Actualización de HUD del prompt
    if (this.promptEl) {
      if (this.isDone) {
        this.promptEl.classList.remove('show');
      } else {
        this.promptEl.classList.add('show');
        this.promptEl.classList.remove('pressing');
        this.promptEl.innerText = "ASCENDIENDO A LAS ESTRELLAS...\n[INTERACTÚA CON EL RATÓN PARA MIRAR A TU ALREDEDOR]";
      }
    }

    return false;
  }

  /**
   * Copia uniformes a la GPU y codifica el pase de renderizado.
   */
  render(device, view, encoder, frameData) {
    if (!this.pipeline) return;

    // Uniform Buffer de 12 elementos (48 bytes)
    const uniformsData = new Float32Array(12);
    uniformsData[0] = this.width;                                        // u_resolution.x
    uniformsData[1] = this.height;                                       // u_resolution.y
    uniformsData[2] = 0.5 + this.yawSmooth / (Math.PI * 2.0);             // u_mouse.x (Yaw)
    uniformsData[3] = 0.5 + this.pitchSmooth / Math.PI;                  // u_mouse.y (Pitch)
    uniformsData[4] = this.cameraX;                                      // u_camera_pos.x
    uniformsData[5] = this.cameraY;                                      // u_camera_pos.y
    uniformsData[6] = this.cameraZ;                                      // u_camera_pos.z
    uniformsData[7] = this.exitFade;                                     // u_fade_black
    uniformsData[8] = frameData.elapsedTime;                             // u_time
    uniformsData[9] = this.ascensionTime;                                // u_ascension_time
    uniformsData[10] = 0.0;                                              // padding
    uniformsData[11] = 0.0;                                              // padding

    device.queue.writeBuffer(this.uniformBuffer, 0, uniformsData.buffer);

    const renderPassDescriptor = {
      colorAttachments: [
        {
          view: view,
          clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 }, // Espacio negro
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
    this.creditsEl.className = 'credits-container show darken';

    document.body.appendChild(this.creditsEl);
  }

  /**
   * Orquesta la secuencia de créditos cinematográficos una vez completado el fade-out espacial.
   */
  startCreditsSequence() {
    if (this.creditsTriggered) return;
    this.creditsTriggered = true;
    console.log("PhaseAscension: Iniciando secuencia de títulos de cine.");

    // Quitar escuchadores de ratón delta
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

    // 1. Orquestar la atenuación final del volumen máster a silencio completo
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
        console.log("PhaseAscension: Fin de créditos alcanzado.");
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

    // Comenzar la secuencia de créditos
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

    console.log("PhaseAscension: Recursos de ascensión liberados de GPU.");
  }
}
