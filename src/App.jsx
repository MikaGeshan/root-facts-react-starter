import { useRef, useState, useEffect, useCallback } from 'react';
import Header from './components/Header';
import CameraSection from './components/CameraSection';
import InfoPanel from './components/InfoPanel';
import { useAppState } from './hooks/useAppState';
import { DetectionService } from './services/DetectionService';
import { CameraService } from './services/CameraService';
import { RootFactsService } from './services/RootFactsService';
import { getCameraErrorMessage } from './utils/common';
import { APP_CONFIG, isValidDetection } from './utils/config';

function App() {
  const { state, actions } = useAppState();
  const detectionCleanupRef = useRef(null);
  const isRunningRef = useRef(false);
  const isAnalyzingRef = useRef(false);
  const stabilityCounterRef = useRef(0);
  const lastDetectedClassRef = useRef(null);

  const [currentTone, setCurrentTone] = useState('normal');
  const [fps, setFps] = useState(15);
  const lastDetectionTimeRef = useRef(0);

  // [Basic] Inisialisasi layanan deteksi, kamera, dan generator fakta saat aplikasi dimuat
  useEffect(() => {
    const detector = new DetectionService();
    const camera = new CameraService();
    const generator = new RootFactsService();

    actions.setServices({ detector, camera, generator });

    const init = async () => {
      try {
        // [Skilled] Menampilkan status "Menunggu Model..." dengan persentase
        actions.setModelStatus('Memuat Model Deteksi... 0%');
        await detector.loadModel((progress) => {
          actions.setModelStatus(`Memuat Model Deteksi... ${progress}%`);
        });

        actions.setModelStatus('Memuat Model AI Fakta... 0%');
        await generator.loadModel((progress) => {
          actions.setModelStatus(`Memuat Model AI Fakta... ${progress}%`);
        });

        actions.setModelStatus('Model AI Siap');
      } catch (error) {
        actions.setError('Gagal memuat model AI. Periksa koneksi internet Anda.');
      }
    };

    init();

    // [Basic] Bersihkan sumber daya saat komponen ditinggalkan
    return () => {
      if (detectionCleanupRef.current) {
        cancelAnimationFrame(detectionCleanupRef.current);
      }
      camera.stopCamera();
      // [Advance] Manajemen Memori: Secara disiplin menggunakan .dispose()
      detector.dispose();
    };
  }, []);

  // [Basic] Fungsi untuk menghentikan kamera dan loop deteksi
  const stopCamera = useCallback(() => {
    const { camera } = state.services;
    isRunningRef.current = false;
    isAnalyzingRef.current = false;
    stabilityCounterRef.current = 0;
    lastDetectedClassRef.current = null;

    if (detectionCleanupRef.current) {
      cancelAnimationFrame(detectionCleanupRef.current);
      detectionCleanupRef.current = null;
    }
    if (camera) {
      camera.stopCamera();
    }
    actions.setRunning(false);
  }, [state.services, actions]);

  // [Basic] Fungsi untuk memulai loop deteksi
  const runDetectionLoop = useCallback(async (time) => {
    const { detector, camera, generator } = state.services;
    if (!detector || !camera || !isRunningRef.current) return;

    // [Skilled] Fitur FPS Limit: Throttling detection loop
    // [Solution] Meningkatkan delay minimum ke 200ms (5 FPS) agar tidak terlalu dinamis
    const interval = Math.max(1000 / fps, 200);
    if (time - lastDetectionTimeRef.current >= interval) {
      lastDetectionTimeRef.current = time;

      // [Solution] Jangan lakukan deteksi jika sedang dalam proses analisis atau sudah ada hasil
      if (isAnalyzingRef.current || state.appState === 'result') {
        if (isRunningRef.current) {
          detectionCleanupRef.current = requestAnimationFrame(runDetectionLoop);
        }
        return;
      }

      if (camera.isReady()) {
        try {
          const result = await detector.predict(camera.video);
          if (result) {
            const isConfident = isValidDetection(result);
            
            // [Debugging] Lacak alur proses deteksi
            console.log(`[Detection] Class: ${result.className}, Score: ${(result.score * 100).toFixed(2)}%, Stable: ${stabilityCounterRef.current}`);

            // [Solution] Stabilisasi label UI: Hanya update jika deteksi valid (>50%)
            // Ini memungkinkan pengguna melihat hasil deteksi meskipun belum mencapai ambang batas stabilitas
            if (result.isValid && !isAnalyzingRef.current && state.appState !== 'result') {
              actions.setDetectionResult(result);
            }

            if (isConfident && state.appState === 'idle' && !isAnalyzingRef.current) {
              // Cek apakah objek sama dengan deteksi sebelumnya
              if (result.className === lastDetectedClassRef.current) {
                stabilityCounterRef.current += 1;
              } else {
                stabilityCounterRef.current = 1;
                lastDetectedClassRef.current = result.className;
              }

              // [Skilled] Membutuhkan stabilitas frame yang lebih tinggi (berdasarkan APP_CONFIG.stabilityThreshold)
              // sebelum melakukan trigger AI Generative
              if (stabilityCounterRef.current >= APP_CONFIG.stabilityThreshold) {
                console.log(`[System] Object stable! Triggering AI for: ${result.className}`);
                isAnalyzingRef.current = true;
                actions.setAppState('analyzing');

                // [Solution] Tambahkan delay sebelum generate untuk memastikan UI transisi dengan mulus
                // Memberikan waktu bagi pengguna untuk menyadari bahwa objek telah terkunci
                await new Promise((resolve) => setTimeout(resolve, APP_CONFIG.analyzingDelay));

                try {
                  console.log(`[AI] Generating facts for ${result.className}...`);
                  // Berhasil menampilkan teks Fun Fact unik yang relevan
                  const fact = await generator.generateFacts(result.className);
                  console.log(`[AI] Facts generated successfully`);

                  // Pastikan kita masih dalam mode scanning sebelum mengupdate hasil
                  if (isRunningRef.current) {
                    actions.setFunFactData(fact);
                    actions.setAppState('result');
                    // [Solution] Hentikan webcam setelah berhasil mendapatkan deskripsi
                    stopCamera();
                  }
                } catch (error) {
                  console.error('[AI] Fact generation failed:', error);
                  actions.setFunFactData('error');
                  actions.setAppState('result');
                  stopCamera();
                } finally {
                  isAnalyzingRef.current = false;
                }
              }
            } else if (!isConfident) {
              // Reset stability jika kepercayaan rendah
              stabilityCounterRef.current = 0;
            }
          }
        } catch (error) {
          console.error('[System] Detection error:', error);
        }
      }
    }

    if (isRunningRef.current) {
      detectionCleanupRef.current = requestAnimationFrame(runDetectionLoop);
    }
  }, [state.services, state.appState, actions, fps, stopCamera]);

  // [Basic] Fungsi untuk memulai dan menghentikan kamera
  const handleToggleCamera = useCallback(async () => {
    const { camera } = state.services;
    if (!camera) {
      console.error('Camera service not initialized');
      return;
    }

    if (state.isRunning) {
      console.log('Stopping camera...');
      stopCamera();
      actions.resetResults();
    } else {
      try {
        console.log('Starting camera...');
        // Reset stability trackers
        stabilityCounterRef.current = 0;
        lastDetectedClassRef.current = null;
        isAnalyzingRef.current = false;

        // [Solution] Update UI state first to unhide video element
        actions.setRunning(true);
        isRunningRef.current = true;
        actions.resetResults();

        // Ensure error is cleared
        actions.setError(null);

        // Wait for React to commit the 'isRunning' state change
        await new Promise((resolve) => setTimeout(resolve, 100));

        // Verify camera has video element
        if (!camera.video) {
          console.warn('Camera video element not set, waiting...');
          await new Promise((resolve) => setTimeout(resolve, 100));
        }

        await camera.startCamera();
        console.log('Camera started successfully');

        // Start detection loop
        if (detectionCleanupRef.current) {
          cancelAnimationFrame(detectionCleanupRef.current);
        }
        detectionCleanupRef.current = requestAnimationFrame(runDetectionLoop);
      } catch (error) {
        // [Rejected] Gagal meminta atau mengakses izin kamera
        console.error('Camera activation failed:', error);
        stopCamera();
        actions.setError(getCameraErrorMessage(error));
      }
    }
  }, [state.services, state.isRunning, actions, stopCamera, runDetectionLoop]);

  // [Advance] Fungsi untuk mengubah nada fakta yang dihasilkan
  const handleToneChange = (tone) => {
    setCurrentTone(tone);
    if (state.services.generator) {
      state.services.generator.setTone(tone);
    }
  };

  // [Skilled] Fungsi untuk menyalin fakta ke clipboard
  const handleCopyFact = () => {
    if (state.funFactData && state.funFactData !== 'error') {
      navigator.clipboard.writeText(state.funFactData)
        .then(() => alert('Fakta berhasil disalin!'))
        .catch((err) => console.error('Gagal menyalin:', err));
    }
  };

  return (
    <div className="app-container">
      <Header modelStatus={state.modelStatus} />

      <main className="main-content">
        <CameraSection
          isRunning={state.isRunning}
          onToggleCamera={handleToggleCamera}
          onToneChange={handleToneChange}
          fps={fps}
          onFpsChange={setFps}
          services={state.services}
          modelStatus={state.modelStatus}
          error={state.error}
          currentTone={currentTone}
        />

        <InfoPanel
          isRunning={state.isRunning}
          appState={state.appState}
          detectionResult={state.detectionResult}
          funFactData={state.funFactData}
          error={state.error}
          onCopyFact={handleCopyFact}
          onRestartScan={handleToggleCamera}
        />
      </main>


      <footer className="footer">
        <p>Powered by TensorFlow.js & Transformers.js</p>
      </footer>

      {state.error && (
        <div style={{
          position: 'fixed',
          bottom: '1rem',
          left: '50%',
          transform: 'translateX(-50%)',
          maxWidth: '380px',
          padding: '0.875rem 1rem',
          background: '#fef2f2',
          border: '1px solid #fecaca',
          borderRadius: 'var(--radius-md)',
          color: '#991b1b',
          fontSize: '0.8125rem',
          boxShadow: 'var(--shadow-lg)',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          zIndex: 1000
        }}>
          <strong>Error:</strong> {state.error}
          <button
            onClick={() => actions.setError(null)}
            style={{
              marginLeft: 'auto',
              background: 'transparent',
              border: 'none',
              fontSize: '1.25rem',
              cursor: 'pointer',
              color: '#991b1b',
              padding: 0,
              lineHeight: 1
            }}
          >
            ×
          </button>
        </div>
      )}
    </div>
  );
}

export default App;
