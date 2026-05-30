# 🏛️ Geometric Temple — WebGPU & Procedural Audio Experience

> **Una experiencia interactiva y narrativa construida desde cero con WebGPU, Raymarching de Campos de Distancia Signada (SDF) y diseño sonoro procedimental.**

🔗 **[Jugar / Ver Demo en Vivo](https://pepeamoedo.com/GEOMETRICTEMPLE/)**

<img width="1010" height="843" alt="image" src="https://github.com/user-attachments/assets/e8799f02-b919-48a3-be4d-6fe53c9c1262" />

## 👁️ La Experiencia

**Geometric Temple** explora la intersección entre la matemática pura y la psicología del jugador. A través de una máquina de estados controlada, el usuario transita desde un vacío oscuro hacia el descubrimiento de una geometría colosal (un dodecaedro rómbico estrellado) renderizada en tiempo real mediante funciones matemáticas, sin usar modelos 3D pre-exportados.

La tensión inmersiva se logra vinculando la posición espacial de la cámara con motores de audio generados por código (latidos y respiración) que reaccionan dinámicamente a la proximidad.

## 🛠️ Arquitectura y Características Técnicas

Este proyecto prescinde de librerías comerciales como Three.js o Babylon.js para implementar un motor gráfico propio y ligero.

### 1. Renderizado WebGPU & WGSL
* **Pipeline Modular:** Gestión de estados limpia (`PhaseVoid` a `PhaseTemple`) asegurando la liberación de recursos y transiciones de cámara fluidas.
* **Raymarching & SDF:** La geometría del templo no está hecha de polígonos. Se calcula píxel a píxel en el *Fragment Shader* utilizando *Signed Distance Fields* (Campos de Distancia Signada) para esculpir matemáticas puras en tiempo real.
* **Atmósfera Matemática:** Implementación de niebla exponencial (*exponential fog*) en WGSL para dotar de una escala masiva y profundidad a la escena.

### 2. Audio Procedimental (Web Audio API)
Diseño de sonido dinámico sin depender de pesadas librerías de audio externas:
* **Síntesis Biológica:** Generación de un latido de corazón usando osciladores de baja frecuencia (LFO) y de respiración mediante ruido filtrado.
* **Interactividad Espacial:** La frecuencia de los latidos (BPM) y la tensión del oscilador están matemáticamente normalizadas a la coordenada Z de la cámara mediante interpolación lineal (Lerp). Al acercarse al templo, la
