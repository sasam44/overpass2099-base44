import { VehicleControlInput } from './VehiclePhysics';

export interface TouchControlsState {
  accelerate: boolean;
  brake: boolean;
  left: boolean;
  right: boolean;
  nitro: boolean;
  handbrake: boolean;
}

export class InputManager {
  private readonly heldKeys = new Set<string>();
  private readonly justPressedKeys = new Set<string>();

  public readonly touchState: TouchControlsState = {
    accelerate: false,
    brake: false,
    left: false,
    right: false,
    nitro: false,
    handbrake: false,
  };

  private readonly onKeyDownBound: (e: KeyboardEvent) => void;
  private readonly onKeyUpBound: (e: KeyboardEvent) => void;
  private readonly onBlurBound: () => void;

  constructor() {
    this.onKeyDownBound = this.onKeyDown.bind(this);
    this.onKeyUpBound = this.onKeyUp.bind(this);
    this.onBlurBound = this.clearAll.bind(this);

    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', this.onKeyDownBound);
      window.addEventListener('keyup', this.onKeyUpBound);
      window.addEventListener('blur', this.onBlurBound);
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) this.clearAll();
      });
    }
  }

  private onKeyDown(e: KeyboardEvent): void {
    const code = e.code;
    if (
      [
        'ArrowUp',
        'ArrowDown',
        'ArrowLeft',
        'ArrowRight',
        'Space',
        'KeyW',
        'KeyA',
        'KeyS',
        'KeyD',
      ].includes(code)
    ) {
      // Prevent page scrolling on arrow/space keys
      e.preventDefault();
    }

    if (!this.heldKeys.has(code)) {
      this.justPressedKeys.add(code);
    }
    this.heldKeys.add(code);
  }

  private onKeyUp(e: KeyboardEvent): void {
    this.heldKeys.delete(e.code);
  }

  public clearAll(): void {
    this.heldKeys.clear();
    this.justPressedKeys.clear();
    this.touchState.accelerate = false;
    this.touchState.brake = false;
    this.touchState.left = false;
    this.touchState.right = false;
    this.touchState.nitro = false;
    this.touchState.handbrake = false;
  }

  public consumeJustPressed(code: string): boolean {
    if (this.justPressedKeys.has(code)) {
      this.justPressedKeys.delete(code);
      return true;
    }
    return false;
  }

  public clearFrameEdges(): void {
    this.justPressedKeys.clear();
  }

  public getVehicleControlInput(): VehicleControlInput {
    const accelKey =
      this.heldKeys.has('KeyW') ||
      this.heldKeys.has('ArrowUp') ||
      this.touchState.accelerate;
    const brakeKey =
      this.heldKeys.has('KeyS') ||
      this.heldKeys.has('ArrowDown') ||
      this.touchState.brake;
    const leftKey =
      this.heldKeys.has('KeyA') ||
      this.heldKeys.has('ArrowLeft') ||
      this.touchState.left;
    const rightKey =
      this.heldKeys.has('KeyD') ||
      this.heldKeys.has('ArrowRight') ||
      this.touchState.right;
    const handbrake = this.heldKeys.has('Space') || this.touchState.handbrake;
    const nitro =
      this.heldKeys.has('ShiftLeft') ||
      this.heldKeys.has('ShiftRight') ||
      this.heldKeys.has('KeyN') ||
      this.touchState.nitro;

    let steer = 0;
    if (leftKey) steer += 1;
    if (rightKey) steer -= 1;

    return {
      throttle: accelKey ? 1 : 0,
      brake: brakeKey ? 1 : 0,
      steer,
      handbrake,
      nitro,
    };
  }

  public setTouchControl(key: keyof TouchControlsState, active: boolean): void {
    this.touchState[key] = active;
  }

  public dispose(): void {
    if (typeof window !== 'undefined') {
      window.removeEventListener('keydown', this.onKeyDownBound);
      window.removeEventListener('keyup', this.onKeyUpBound);
      window.removeEventListener('blur', this.onBlurBound);
    }
  }
}
