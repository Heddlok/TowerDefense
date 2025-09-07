export class SoundManager {
  constructor() {
    this.audioContext = null;
    this.sounds = new Map();
    this.masterVolume = 0.3;
    this.enabled = true;
    
    this.initAudioContext();
  }

  initAudioContext() {
    try {
      this.audioContext = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) {
      console.warn('Web Audio API not supported');
      this.enabled = false;
    }
  }

  // Resume audio context on first user interaction
  resumeContext() {
    if (this.audioContext && this.audioContext.state === 'suspended') {
      this.audioContext.resume();
    }
  }

  // Generate procedural sounds
  createTone(frequency, duration, type = 'sine', volume = 0.1) {
    if (!this.enabled || !this.audioContext) return;

    const oscillator = this.audioContext.createOscillator();
    const gainNode = this.audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(this.audioContext.destination);
    
    oscillator.frequency.setValueAtTime(frequency, this.audioContext.currentTime);
    oscillator.type = type;
    
    gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
    gainNode.gain.linearRampToValueAtTime(volume * this.masterVolume, this.audioContext.currentTime + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.001, this.audioContext.currentTime + duration);
    
    oscillator.start(this.audioContext.currentTime);
    oscillator.stop(this.audioContext.currentTime + duration);
  }

  // Sound effects
  playShoot() {
    this.createTone(800, 0.1, 'square', 0.15);
  }

  playHit() {
    this.createTone(200, 0.2, 'sawtooth', 0.2);
  }

  playEnemyDeath() {
    this.createTone(150, 0.3, 'triangle', 0.25);
  }

  playTowerPlace() {
    this.createTone(400, 0.15, 'sine', 0.2);
  }

  playWaveStart() {
    this.createTone(600, 0.2, 'sine', 0.3);
    setTimeout(() => this.createTone(800, 0.2, 'sine', 0.3), 100);
  }

  playGameOver() {
    this.createTone(200, 0.5, 'sawtooth', 0.4);
    setTimeout(() => this.createTone(150, 0.5, 'sawtooth', 0.4), 200);
  }

  playBackgroundMusic() {
    if (!this.enabled || !this.audioContext) return;
    
    // Simple ambient drone
    const oscillator = this.audioContext.createOscillator();
    const gainNode = this.audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(this.audioContext.destination);
    
    oscillator.frequency.setValueAtTime(60, this.audioContext.currentTime);
    oscillator.type = 'sine';
    
    gainNode.gain.setValueAtTime(0, this.audioContext.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.05 * this.masterVolume, this.audioContext.currentTime + 2);
    
    oscillator.start();
    
    // Store for cleanup
    this.backgroundMusic = { oscillator, gainNode };
  }

  stopBackgroundMusic() {
    if (this.backgroundMusic) {
      this.backgroundMusic.gainNode.gain.exponentialRampToValueAtTime(0.001, this.audioContext.currentTime + 1);
      setTimeout(() => {
        this.backgroundMusic.oscillator.stop();
        this.backgroundMusic = null;
      }, 1000);
    }
  }

  setVolume(volume) {
    this.masterVolume = Math.max(0, Math.min(1, volume));
  }

  toggle() {
    this.enabled = !this.enabled;
    if (!this.enabled) {
      this.stopBackgroundMusic();
    }
  }
}
