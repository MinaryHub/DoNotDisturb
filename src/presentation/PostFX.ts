import * as THREE from 'three';
import {
  BlendFunction,
  Effect,
  EffectComposer,
  EffectPass,
  RenderPass,
  ToneMappingEffect,
  ToneMappingMode,
} from 'postprocessing';
import type { PresentationConfig } from '../core/configSchemas';
import type { PresentationState } from './PresentationState';
import fragment from './shaders/stateEffect.frag';

class StateEffect extends Effect {
  constructor() {
    super('StateEffect', fragment, {
      blendFunction: BlendFunction.NORMAL,
      uniforms: new Map<string, THREE.Uniform>([
        ['uStress', new THREE.Uniform(0)],
        ['uDesat', new THREE.Uniform(0)],
        ['uDistort', new THREE.Uniform(0)],
        ['uTunnel', new THREE.Uniform(0)],
        ['uFade', new THREE.Uniform(0)],
        ['uHurt', new THREE.Uniform(0)],
        ['uTime', new THREE.Uniform(0)],
        ['uAspect', new THREE.Uniform(1)],
        ['uPulseRate', new THREE.Uniform(1)],
        ['uRedTint', new THREE.Uniform(new THREE.Vector3())],
        ['uStressVignette', new THREE.Uniform(0.6)],
      ]),
    });
  }

  set(name: string, value: number): void {
    this.uniforms.get(name)!.value = value;
  }
}

/** 상태 기반 후처리 (CLAUDE.md 7). 강도는 PresentationState를 구독한다 */
export class PostFX {
  private readonly composer: EffectComposer;
  private readonly renderPass: RenderPass;
  private readonly effect = new StateEffect();

  constructor(
    private readonly renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
    private readonly cfg: PresentationConfig['postfx'],
  ) {
    this.composer = new EffectComposer(renderer, { frameBufferType: THREE.HalfFloatType });
    this.renderPass = new RenderPass(scene, camera);
    this.composer.addPass(this.renderPass);
    this.composer.addPass(new EffectPass(camera, new ToneMappingEffect({ mode: ToneMappingMode.ACES_FILMIC }), this.effect));
    (this.effect.uniforms.get('uRedTint')!.value as THREE.Vector3).fromArray(cfg.redTint);
    this.effect.set('uStressVignette', cfg.stressVignette);
  }

  setCamera(camera: THREE.Camera): void {
    this.renderPass.mainCamera = camera;
  }

  setSize(width: number, height: number): void {
    this.composer.setSize(width, height);
  }

  render(dt: number, state: PresentationState, heartbeatBpm: number): void {
    const size = this.renderer.getSize(new THREE.Vector2());
    const fx = this.cfg;
    this.effect.set('uAspect', size.x / Math.max(1, size.y));
    this.effect.set('uTime', state.time);
    this.effect.set('uStress', state.stress);
    this.effect.set('uHurt', state.hurt);
    this.effect.set('uDesat', Math.min(1, state.tired * fx.tiredDesaturation + state.danger * 0.15 + state.critical * 0.2));
    this.effect.set('uDistort', state.danger * fx.dangerDistortion * fx.distortionScale);
    this.effect.set('uTunnel', state.critical * fx.criticalTunnel);
    this.effect.set('uFade', state.burnoutTime < 0 ? 0 : Math.min(1, state.burnoutTime / fx.burnoutFadeSec));
    this.effect.set('uPulseRate', heartbeatBpm / 60);
    this.composer.render(dt);
  }

  dispose(): void {
    this.composer.dispose();
  }
}
