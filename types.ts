export enum AppMode {
  VEO_STUDIO = 'VEO_STUDIO',
  LIVE_CONVERSATION = 'LIVE_CONVERSATION',
}

export type AspectRatio = '16:9' | '9:16';

export interface VeoConfig {
  prompt: string;
  aspectRatio: AspectRatio;
  image: File | null;
}

// Augment window for AI Studio specific methods
declare global {
  interface AIStudio {
    hasSelectedApiKey: () => Promise<boolean>;
    openSelectKey: () => Promise<void>;
  }

  interface Window {
    webkitAudioContext: typeof AudioContext;
    aistudio?: AIStudio;
  }
}