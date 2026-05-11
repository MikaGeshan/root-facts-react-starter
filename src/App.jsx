import { useRef, useState, useEffect, useCallback } from 'react';
import Header from './components/Header';
import CameraSection from './components/CameraSection';
import InfoPanel from './components/InfoPanel';
import { useAppState } from './hooks/useAppState';
import { DetectionService } from './services/DetectionService';
import { CameraService } from './services/CameraService';
import { RootFactsService } from './services/RootFactsService';
import { getCameraErrorMessage } from './utils/common';

function App() {
  const { state, actions } = useAppState();
  const detectionCleanupRef = useRef(null);
  const isRunningRef = useRef(false);
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
    // Tambahkan delay minimum 100ms agar CPU tidak membengkak
    const interval = Math.max(1000 / fps, 100);
    if (time - lastDetectionTimeRef.current >= interval) {
      lastDetectionTimeRef.current = time;

      if (camera.isReady()) {
        try {
          const result = await detector.predict(camera.video);
          if (result) {
            // [Basic] Menampilkan label hasil prediksi secara otomatis
            actions.setDetectionResult(result);
            
            // [Basic] Aplikasi berhasil mengirimkan hasil deteksi ke AI secara dinamis
            if (result.isValid && state.appState === 'idle') {
              actions.setAppState('analyzing');
              
              try {
                // Berhasil menampilkan teks Fun Fact unik yang relevan
                const fact = await generator.generateFacts(result.className);
                actions.setFunFactData(fact);
                actions.setAppState('result');
                
                // [Solution] Hentikan webcam setelah berhasil mendapatkan deskripsi
                stopCamera();
              } catch (error) {
                actions.setFunFactData('error');
                actions.setAppState('result');
                stopCamera();
              }
            }
          }
        } catch (error) {
          console.error('Detection error:', error);
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
        // [Solution] Update UI state first to unhide video element
        actions.setRunning(true);
        isRunningRef.current = true;
        actions.resetResults();
        
        // Ensure error is cleared
        actions.setError(null);
        
        // Wait for React to commit the 'isRunning' state change
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Verify camera has video element
        if (!camera.video) {
          console.warn('Camera video element not set, waiting...');
          await new Promise(resolve => setTimeout(resolve, 100));
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
        .catch(err => console.error('Gagal menyalin:', err));
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
