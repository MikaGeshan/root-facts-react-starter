export class CameraService {
  constructor() {
    this.stream = null;
    this.video = null;
    this.canvas = null;
    this.config = null;
    this.fps = 30;
  }

  setVideoElement(videoElement) {
    this.video = videoElement;
  }

  setCanvasElement(canvasElement) {
    this.canvas = canvasElement;
  }

  // [Basic] Tambahkan konfigurasi kamera untuk mendapatkan daftar perangkat input video
  async loadCameras() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices.filter((device) => device.kind === 'videoinput');
    } catch (error) {
      console.error('Error loading cameras:', error);
      return [];
    }
  }

  // [Basic] Memulai kamera dengan perangkat yang dipilih dan menampilkan pada elemen video
  async startCamera(cameraType = 'default') {
    this.stopCamera();

    const facingMode = cameraType === 'front' ? 'user' : 'environment';
    const constraints = {
      video: {
        facingMode: { ideal: facingMode },
        frameRate: { ideal: this.fps }
      }
    };

    try {
      this.stream = await navigator.mediaDevices.getUserMedia(constraints);
      if (this.video) {
        this.video.srcObject = this.stream;
        await this.video.play();
      }
      return true;
    } catch (error) {
      console.error('Error starting camera:', error);
      throw error;
    }
  }

  // [Basic] Menghentikan siaran kamera dan membersihkan sumber daya
  stopCamera() {
    if (this.stream) {
      this.stream.getTracks().forEach((track) => track.stop());
      this.stream = null;
    }
    if (this.video) {
      this.video.srcObject = null;
    }
  }

  // [Skilled] Implementasikan metode untuk mengatur FPS kamera
  setFPS(fps) {
    this.fps = fps;
    if (this.stream) {
      const track = this.stream.getVideoTracks()[0];
      if (track) {
        track.applyConstraints({ frameRate: { ideal: fps } }).catch((e) => {
          console.warn('Failed to apply FPS constraints:', e);
        });
      }
    }
  }

  // [Basic] Periksa apakah kamera sedang aktif
  isActive() {
    return this.stream !== null;
  }

  // [Basic] Periksa apakah elemen video siap untuk digunakan
  isReady() {
    return this.video && this.video.readyState >= 2;
  }
}