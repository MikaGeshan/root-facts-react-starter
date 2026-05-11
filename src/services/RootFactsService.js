import { pipeline, env } from '@huggingface/transformers';
import { TONE_CONFIG } from '../utils/config.js';
import { isWebGPUSupported } from '../utils/common.js';

export class RootFactsService {
  constructor() {
    this.generator = null;
    this.isModelLoaded = false;
    this.isGenerating = false;
    this.currentTone = TONE_CONFIG.defaultTone;
    
    // Konfigurasi lingkungan Transformers.js
    env.allowLocalModels = false;
    env.useBrowserCache = true;
    env.logLevel = 'error';
  }

  // [Basic] Muat model dan inisialisasi pipeline text2text-generation
  // [Advance] Implementasikan strategi Backend Adaptive
  async loadModel(onProgress) {
    try {
      const device = isWebGPUSupported() ? 'webgpu' : 'webgl';
      
      this.generator = await pipeline('text2text-generation', 'Xenova/flan-t5-small', {
        device: device,
        progress_callback: (progress) => {
          if (onProgress && progress.status === 'progress') {
            onProgress(Math.round(progress.progress));
          }
        }
      });

      this.isModelLoaded = true;
      return true;
    } catch (error) {
      console.error('Failed to load Transformers model:', error);
      throw error;
    }
  }

  // [Advance] Konfigurasi tone fakta yang dihasilkan
  setTone(tone) {
    this.currentTone = tone;
  }

  // [Basic] Lakukan prediksi pada elemen gambar yang diberikan dan kembalikan hasilnya
  // [Skilled] Konfigurasikan parameter generasi berdasarkan kebutuhan
  // [Advance] Implemenasikan parameter tone untuk mengatur nada fakta yang dihasilkan
  async generateFacts(vegetableName) {
    if (!this.generator) throw new Error('Generator model not loaded');

    const toneInstruction = this._getToneInstruction(this.currentTone);
    const prompt = `Give me a very short, interesting fun fact about ${vegetableName}. ${toneInstruction} Keep it under 30 words.`;

    try {
      this.isGenerating = true;
      
      // [Skilled] Mengatur parameter temperature, max_new_tokens, top_p, dan do_sample
      const result = await this.generator(prompt, {
        max_new_tokens: 50,
        temperature: 0.7,
        top_p: 0.9,
        do_sample: true,
      });

      this.isGenerating = false;
      return result[0].generated_text;
    } catch (error) {
      this.isGenerating = false;
      console.error('Fact generation error:', error);
      throw error;
    }
  }

  _getToneInstruction(tone) {
    switch (tone) {
      case 'funny':
        return 'Make it sound funny and witty.';
      case 'professional':
        return 'Make it sound formal and scientific.';
      case 'casual':
        return 'Make it sound friendly and casual.';
      case 'normal':
      default:
        return 'Make it informative.';
    }
  }

  isReady() {
    return this.isModelLoaded;
  }
}
