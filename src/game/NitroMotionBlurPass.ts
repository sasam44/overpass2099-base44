import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

/**
 * Custom Screen-Space Radial Velocity Motion Blur & Chromatic Speed-Warp Shader
 * Activated dynamically when the player engages Nitro Boost.
 * Preserves sharp focus on the player car and vanishing point near screen center
 * while streaking peripheral road markings, buildings, and scenery radially.
 */
const NitroMotionBlurShader = {
  name: 'NitroMotionBlurShader',
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uIntensity: { value: 0.0 },
    uCollisionImpact: { value: 0.0 },
    uCenter: { value: new THREE.Vector2(0.5, 0.54) },
    uTime: { value: 0.0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uIntensity;
    uniform float uCollisionImpact;
    uniform vec2 uCenter;
    uniform float uTime;
    varying vec2 vUv;

    void main() {
      vec4 baseColor = texture2D(tDiffuse, vUv);
      if (uIntensity <= 0.002 && uCollisionImpact <= 0.002) {
        gl_FragColor = baseColor;
        return;
      }

      // Vector from radial focus center (vanishing point / player chassis) to current pixel
      vec2 dir = vUv - uCenter;
      float dist = length(dir);

      // Keep the central cone (player car & immediate road ahead) sharp,
      // ramping radial motion blur strongly toward the screen periphery.
      float radialMask = smoothstep(0.11, 0.66, dist);
      float totalEffect = max(uIntensity, uCollisionImpact * 0.75);
      float blurStrength = totalEffect * radialMask * 0.145;

      // 12-tap weighted radial velocity blur along the screen-space flow vector
      const int SAMPLES = 12;
      vec3 accumR = vec3(0.0);
      float totalWeight = 0.0;

      // Subtle high-frequency speed shimmer along radial rays
      float rayAngle = atan(dir.y, dir.x);
      float rayPulse = 0.92 + 0.08 * sin(rayAngle * 28.0 + uTime * 36.0);
      vec2 stepVec = dir * blurStrength * rayPulse / float(SAMPLES);

      // Chromatic aberration offset for high-speed lens dispersion + heavy collision impact jolt
      vec2 chromaOffset = dir * ((uIntensity * radialMask * 0.014) + (uCollisionImpact * 0.026));

      for (int i = 0; i < SAMPLES; i++) {
        float fi = float(i);
        float weight = 1.0 - (fi / float(SAMPLES)) * 0.55;
        vec2 sampleUv = clamp(vUv - stepVec * fi, vec2(0.002), vec2(0.998));

        float r = texture2D(tDiffuse, clamp(sampleUv - chromaOffset, vec2(0.002), vec2(0.998))).r;
        float g = texture2D(tDiffuse, sampleUv).g;
        float b = texture2D(tDiffuse, clamp(sampleUv + chromaOffset, vec2(0.002), vec2(0.998))).b;

        accumR += vec3(r, g, b) * weight;
        totalWeight += weight;
      }

      vec3 blurred = accumR / max(0.0001, totalWeight);

      // Subtle cyan-blue plasma energy rush at outer screen edges during Nitro Boost
      float edgeGlow = smoothstep(0.32, 0.82, dist) * uIntensity;
      vec3 nitroPlasmaTint = vec3(0.06, 0.68, 0.98) * edgeGlow * 0.18;

      // Fiery amber-red shockwave rim pulse on collision impact
      float impactEdge = smoothstep(0.25, 0.78, dist) * uCollisionImpact;
      vec3 impactTint = vec3(0.98, 0.32, 0.08) * impactEdge * 0.26;

      vec3 finalRgb = blurred + nitroPlasmaTint + impactTint;

      gl_FragColor = vec4(finalRgb, baseColor.a);
    }
  `,
};

export class NitroMotionBlurPass {
  public readonly composer: EffectComposer;
  private readonly renderPass: RenderPass;
  private readonly motionBlurPass: ShaderPass;
  private readonly outputPass: OutputPass;
  public intensity = 0;
  public collisionImpact = 0;
  private elapsedTime = 0;

  constructor(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
    width: number,
    height: number
  ) {
    this.composer = new EffectComposer(renderer);
    this.composer.setSize(width, height);

    this.renderPass = new RenderPass(scene, camera);
    this.composer.addPass(this.renderPass);

    this.motionBlurPass = new ShaderPass(NitroMotionBlurShader);
    this.composer.addPass(this.motionBlurPass);

    this.outputPass = new OutputPass();
    this.composer.addPass(this.outputPass);
  }

  public update(
    dt: number,
    nitroBlurIntensity: number,
    steerAngle: number,
    collisionFlash = 0
  ): void {
    this.elapsedTime += dt;
    this.intensity = Math.max(0, Math.min(1, nitroBlurIntensity));
    this.collisionImpact = Math.max(0, Math.min(1, collisionFlash));

    this.motionBlurPass.uniforms['uIntensity'].value = this.intensity;
    this.motionBlurPass.uniforms['uCollisionImpact'].value = this.collisionImpact;
    this.motionBlurPass.uniforms['uTime'].value = this.elapsedTime;
    // Shift radial vanishing focus slightly with steering so streaks curve into turns
    this.motionBlurPass.uniforms['uCenter'].value.set(
      0.5 - steerAngle * 0.12,
      0.53
    );
  }

  public get isActive(): boolean {
    return this.intensity > 0.005 || this.collisionImpact > 0.01;
  }

  public setSize(width: number, height: number): void {
    this.composer.setSize(width, height);
  }

  public render(): void {
    this.composer.render();
  }

  public dispose(): void {
    this.composer.dispose();
  }
}
