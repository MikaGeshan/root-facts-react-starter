export const APP_CONFIG = {
  detectionConfidenceThreshold: 75,
  analyzingDelay: 2500,
  factsGenerationDelay: 2000,
  detectionRetryInterval: 200,
  stabilityThreshold: 10 // Membutuhkan 10 frame stabil sebelum trigger AI
};

export const TONE_CONFIG = {
  availableTones: [
    { value: 'normal', label: 'Normal' },
    { value: 'funny', label: 'Lucu' },
    { value: 'professional', label: 'Profesional' },
    { value: 'casual', label: 'Santai' }
  ],
  defaultTone: 'normal'
};

export const isValidDetection = (result) => {
  const { detectionConfidenceThreshold } = APP_CONFIG;
  const score = result?.score || 0;
  return result && result.isValid && (score * 100) >= detectionConfidenceThreshold;
};
