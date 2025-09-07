export class PerformanceMonitor {
  constructor() {
    this.frameCount = 0;
    this.lastTime = performance.now();
    this.fps = 60;
    this.frameTime = 16.67;
    this.samples = [];
    this.maxSamples = 60;
    
    this.lowFpsThreshold = 30;
    this.adaptiveQuality = true;
    this.renderScale = 1.0;
    this.particleCount = 0;
    this.maxParticles = 50;
  }

  update() {
    this.frameCount++;
    const currentTime = performance.now();
    const deltaTime = currentTime - this.lastTime;
    
    if (deltaTime >= 1000) { // Update every second
      this.fps = this.frameCount * 1000 / deltaTime;
      this.frameTime = deltaTime / this.frameCount;
      
      this.samples.push(this.fps);
      if (this.samples.length > this.maxSamples) {
        this.samples.shift();
      }
      
      this.frameCount = 0;
      this.lastTime = currentTime;
      
      this.adjustQuality();
    }
  }

  adjustQuality() {
    if (!this.adaptiveQuality) return;
    
    const avgFps = this.samples.reduce((a, b) => a + b, 0) / this.samples.length;
    
    if (avgFps < this.lowFpsThreshold) {
      this.renderScale = Math.max(0.5, this.renderScale - 0.1);
      this.maxParticles = Math.max(10, this.maxParticles - 5);
    } else if (avgFps > 55) {
      this.renderScale = Math.min(1.0, this.renderScale + 0.05);
      this.maxParticles = Math.min(50, this.maxParticles + 2);
    }
  }

  getStats() {
    const avgFps = this.samples.length > 0 
      ? this.samples.reduce((a, b) => a + b, 0) / this.samples.length 
      : this.fps;
    
    return {
      fps: Math.round(this.fps),
      avgFps: Math.round(avgFps),
      frameTime: Math.round(this.frameTime * 100) / 100,
      renderScale: Math.round(this.renderScale * 100) / 100,
      maxParticles: this.maxParticles
    };
  }

  shouldRenderParticles() {
    return this.particleCount < this.maxParticles;
  }

  incrementParticles() {
    this.particleCount++;
  }

  decrementParticles() {
    this.particleCount = Math.max(0, this.particleCount - 1);
  }

  resetParticles() {
    this.particleCount = 0;
  }
}
