import * as tf from '@tensorflow/tfjs';
import '@tensorflow/tfjs-backend-webgpu';
import { isWebGPUSupported } from '../utils/common';

export class DetectionService {
  constructor() {
    this.model = null;
    this.labels = [];
    this.config = null;
  }

  async loadModel(onProgress) {
    try {
      // [Advance] Implementasikan strategi Backend Adaptive
      if (isWebGPUSupported()) {
        try {
          await tf.setBackend('webgpu');
        } catch (e) {
          console.warn('WebGPU failed, falling back to WebGL', e);
          await tf.setBackend('webgl');
        }
      } else {
        await tf.setBackend('webgl');
      }
      await tf.ready();

      // [Basic] Muat model dan metadata secara bersamaan
      const metadataResponse = await fetch('/model/metadata.json');
      const metadata = await metadataResponse.json();
      this.labels = metadata.labels;

      this.model = await tf.loadLayersModel('/model/model.json', {
        onProgress: (fraction) => {
          if (onProgress) {
            // [Skilled] Menampilkan indikator loading dengan persentase
            onProgress(Math.floor(fraction * 100));
          }
        }
      });

      return true;
    } catch (error) {
      console.error('Failed to load model:', error);
      throw error;
    }
  }

  async predict(imageElement) {
    if (!this.model) return null;

    // [Advance] Manajemen Memori: Secara disiplin menggunakan tf.tidy()
    return tf.tidy(() => {
      // [Basic] Lakukan prediksi pada elemen gambar
      const tensor = tf.browser.fromPixels(imageElement)
        .resizeNearestNeighbor([224, 224])
        .expandDims(0)
        .toFloat()
        .div(255);

      const prediction = this.model.predict(tensor);
      const probabilities = prediction.dataSync();

      const maxProbability = Math.max(...probabilities);
      const classIndex = probabilities.indexOf(maxProbability);

      return {
        className: this.labels[classIndex],
        score: maxProbability,
        isValid: maxProbability > 0.5
      };
    });
  }

  isLoaded() {
    return this.model !== null;
  }

  dispose() {
    if (this.model) {
      this.model.dispose();
      this.model = null;
    }
  }
}
