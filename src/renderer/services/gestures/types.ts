import { KitElement } from '../practice-stats';

export type DrumGestureSurface =
  | 'home'
  | 'ready'
  | 'paused'
  | 'result'
  | 'playing';

export type DrumGestureAction =
  | 'start'
  | 'pause'
  | 'resume'
  | 'continue'
  | 'retry'
  | 'end';

export interface DrumGestureHit {
  element: KitElement;
  timeMs: number;
  velocity: number;
}

export interface DrumGestureDefinition {
  id: string;
  surfaces: DrumGestureSurface[];
  elements: KitElement[];
  action: DrumGestureAction;
  windowMs: number;
  quietBeforeMs: number;
  minimumGapMs: number;
  maximumGapMs: number;
  minimumVelocity: number;
}

export interface DrumGestureState {
  recentHits: DrumGestureHit[];
  cooldownUntilMs: number;
  lastHitTimeMs?: number;
}

export interface DrumGestureTransition {
  state: DrumGestureState;
  action?: DrumGestureAction;
  gestureId?: string;
}
