/**
 * Arcade Engine Package
 * A standalone JavaScript game engine for creating 2D and 3D arcade games
 * 
 * Usage:
 *   <script src="arcade-engine-package.js"></script>
 *   <script src="my-game.js"></script> (your game implementation)
 */

// Polyfills and utilities
const ArcadeEngine = (() => {
  // RxJS-like reactive streams (simplified)
  class Subject {
    constructor() {
      this.subscribers = [];
    }
    
    subscribe(observer) {
      if (typeof observer === 'function') {
        this.subscribers.push(observer);
        return { unsubscribe: () => {
          this.subscribers = this.subscribers.filter(s => s !== observer);
        }};
      }
      return { unsubscribe: () => {} };
    }
    
    next(value) {
      this.subscribers.forEach(sub => sub(value));
    }
  }

  class BehaviorSubject extends Subject {
    constructor(initialValue) {
      super();
      this.value = initialValue;
    }
    
    next(value) {
      this.value = value;
      super.next(value);
    }
  }

  class Subscription {
    constructor() {
      this.subscriptions = [];
    }
    
    add(sub) {
      this.subscriptions.push(sub);
      return this;
    }
    
    unsubscribe() {
      this.subscriptions.forEach(s => s.unsubscribe());
      this.subscriptions = [];
    }
  }

  // Easing functions
  const easing = {
    linear: (t) => t,
    easeInQuad: (t) => t * t,
    easeOutQuad: (t) => t * (2 - t),
    easeInOutQuad: (t) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
    easeInCubic: (t) => t * t * t,
    easeOutCubic: (t) => (--t) * t * t + 1,
    easeInOutCubic: (t) => t < 0.5 ? 4 * t * t * t : (t - 1) * (2 * (t - 2)) * (2 * (t - 2)) + 1,
  };

  // Tween utility
  class Tween {
    static to(target, props, config = {}) {
      const {
        duration = 300,
        easing: easingFn = easing.linear,
        delay = 0,
        onUpdate = () => {},
        onComplete = () => {}
      } = config;

      let startTime = null;
      let animationId = null;
      let initialProps = {};

      Object.keys(props).forEach(key => {
        initialProps[key] = target[key];
      });

      const animate = (timestamp) => {
        if (!startTime) startTime = timestamp;
        const elapsed = timestamp - startTime - delay;

        if (elapsed < 0) {
          animationId = requestAnimationFrame(animate);
          return;
        }

        if (elapsed >= duration) {
          Object.keys(props).forEach(key => {
            target[key] = props[key];
          });
          onUpdate();
          onComplete();
          return;
        }

        const progress = elapsed / duration;
        const easedProgress = easingFn(progress);

        Object.keys(props).forEach(key => {
          const start = initialProps[key];
          const end = props[key];
          target[key] = start + (end - start) * easedProgress;
        });

        onUpdate();
        animationId = requestAnimationFrame(animate);
      };

      animationId = requestAnimationFrame(animate);

      return {
        stop() {
          if (animationId) cancelAnimationFrame(animationId);
        }
      };
    }
  }

  // Base Game Model
  class GameModel {
    constructor(width, height, gameId, audio) {
      this.width = width;
      this.height = height;
      this.gameId = gameId;
      this.audio = audio || this.createDefaultAudio();

      this.state$ = new BehaviorSubject([]);
      this.score$ = new BehaviorSubject(0);
      this.subStat$ = new BehaviorSubject(0);
      this.status$ = new BehaviorSubject('READY');
      this.effects$ = new Subject();

      this.score = 0;
      this.subStat = 0;
      this.highScore = this.getHighScore();
      this.isPaused = false;
      this.isGameOver = false;
      this.level = 1;

      this.sub = new Subscription();
    }

    createDefaultAudio() {
      return {
        playTone: () => {},
        playMove: () => {},
        playSelect: () => {},
        playMatch: () => {},
        playExplosion: () => {},
        playGameOver: () => {}
      };
    }

    getHighScore() {
      try {
        return parseInt(localStorage.getItem(`hs_${this.gameId}`) || '0');
      } catch {
        return 0;
      }
    }

    saveHighScore() {
      if (this.score > this.highScore) {
        this.highScore = this.score;
        try {
          localStorage.setItem(`hs_${this.gameId}`, this.score.toString());
        } catch {}
      }
    }

    uid() {
      return Math.random().toString(36).substr(2, 9);
    }

    updateScore(points) {
      this.score += points;
      this.score$.next(this.score);
    }

    setPaused(val) {
      this.isPaused = val;
    }

    resize(width, height) {
      this.width = width;
      this.height = height;
      this.effects$.next({ type: 'RESIZE' });
    }

    stop() {
      this.sub.unsubscribe();
      this.sub = new Subscription();
    }

    // Abstract methods - override in subclass
    start() {
      throw new Error('start() must be implemented');
    }

    handleInput(action) {
      throw new Error('handleInput() must be implemented');
    }

    getRenderConfig() {
      throw new Error('getRenderConfig() must be implemented');
    }
  }

  // Input Manager
  class InputManager {
    constructor(container) {
      this.container = container;
      this.listeners = [];
      this.setupListeners();
    }

    setupListeners() {
      this.container.addEventListener('click', (e) => {
        const rect = this.container.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        this.emit({ type: 'SELECT', data: { x, y } });
      });

      document.addEventListener('keydown', (e) => {
        const keyMap = {
          'ArrowUp': 'UP',
          'ArrowDown': 'DOWN',
          'ArrowLeft': 'LEFT',
          'ArrowRight': 'RIGHT',
          ' ': 'SELECT',
          'Enter': 'SELECT'
        };
        if (keyMap[e.key]) {
          e.preventDefault();
          this.emit({ type: keyMap[e.key] });
        }
      });
    }

    subscribe(callback) {
      this.listeners.push(callback);
      return { unsubscribe: () => {
        this.listeners = this.listeners.filter(l => l !== callback);
      }};
    }

    emit(action) {
      this.listeners.forEach(listener => listener(action));
    }

    destroy() {
      this.listeners = [];
    }
  }

  // Sound Manager (mock)
  class SoundManager {
    playTone() {}
    playMove() {}
    playSelect() {}
    playMatch() {}
    playExplosion() {}
    playGameOver() {}
  }

  // Game Renderer (Canvas-based)
  class GameRenderer {
    constructor(container, renderConfig) {
      this.container = container;
      this.renderConfig = renderConfig;
      this.canvas = document.createElement('canvas');
      this.ctx = this.canvas.getContext('2d');
      this.container.appendChild(this.canvas);

      this.cellSize = 40;
      this.updateCanvasSize();
      window.addEventListener('resize', () => this.updateCanvasSize());
    }

    updateCanvasSize() {
      const rect = this.container.getBoundingClientRect();
      this.canvas.width = rect.width;
      this.canvas.height = rect.height;
    }

    render(gameItems, gameModel) {
      const { colors, bgColor } = this.renderConfig;
      
      // Clear canvas
      this.ctx.fillStyle = `#${bgColor.toString(16).padStart(6, '0')}`;
      this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

      // Draw grid reference
      this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
      this.ctx.lineWidth = 1;
      for (let i = 0; i <= gameModel.width; i++) {
        const x = (i / gameModel.width) * this.canvas.width;
        this.ctx.beginPath();
        this.ctx.moveTo(x, 0);
        this.ctx.lineTo(x, this.canvas.height);
        this.ctx.stroke();
      }
      for (let j = 0; j <= gameModel.height; j++) {
        const y = (j / gameModel.height) * this.canvas.height;
        this.ctx.beginPath();
        this.ctx.moveTo(0, y);
        this.ctx.lineTo(this.canvas.width, y);
        this.ctx.stroke();
      }

      // Draw items
      gameItems.forEach(item => {
        const x = (item.x / gameModel.width) * this.canvas.width;
        const y = (item.y / gameModel.height) * this.canvas.height;
        const size = Math.min(this.canvas.width / gameModel.width, this.canvas.height / gameModel.height) * 0.8;

        const color = colors[item.type] || 0xffffff;
        this.ctx.fillStyle = `#${color.toString(16).padStart(6, '0')}`;

        // Draw circle or square
        if (item.type === 10) {
          // Special case for aimer, draw as line
          this.ctx.strokeStyle = `#${color.toString(16).padStart(6, '0')}`;
          this.ctx.lineWidth = 2;
          this.ctx.beginPath();
          this.ctx.arc(x, y, size / 4, 0, Math.PI * 2);
          this.ctx.stroke();
        } else {
          this.ctx.beginPath();
          this.ctx.arc(x, y, size / 2, 0, Math.PI * 2);
          this.ctx.fill();
        }

        // Draw text if present
        if (item.text) {
          this.ctx.fillStyle = item.textColor || '#ffffff';
          this.ctx.font = 'bold 12px Arial';
          this.ctx.textAlign = 'center';
          this.ctx.textBaseline = 'middle';
          this.ctx.fillText(item.text, x, y);
        }
      });

      // Draw score
      this.ctx.fillStyle = '#ffffff';
      this.ctx.font = 'bold 16px Arial';
      this.ctx.textAlign = 'left';
      this.ctx.fillText(`Score: ${gameModel.score}`, 10, 25);

      // Draw status
      this.ctx.textAlign = 'center';
      this.ctx.fillText(gameModel.status$.value, this.canvas.width / 2, 25);
    }

    destroy() {
      this.canvas.remove();
    }
  }

  // Game Engine Controller
  class GameEngine {
    constructor(containerId, GameClass, width = 10, height = 10) {
      this.container = document.getElementById(containerId);
      if (!this.container) {
        throw new Error(`Container with ID "${containerId}" not found`);
      }

      this.game = new GameClass(width, height, GameClass.name);
      this.renderConfig = this.game.getRenderConfig();
      this.renderer = new GameRenderer(this.container, this.renderConfig);
      this.inputManager = new InputManager(this.container);
      this.audioManager = new SoundManager();

      this.setupSubscriptions();
    }

    setupSubscriptions() {
      // Render on state changes
      this.game.state$.subscribe(() => {
        this.renderer.render(this.game.state$.value, this.game);
      });

      // Handle input
      this.inputManager.subscribe((action) => {
        if (!this.game.isPaused && !this.game.isGameOver) {
          this.game.handleInput(action);
        }
      });

      // Handle effects
      this.game.effects$.subscribe((effect) => {
        this.handleEffect(effect);
      });
    }

    handleEffect(effect) {
      switch (effect.type) {
        case 'GAMEOVER':
          this.game.saveHighScore();
          alert(`Game Over! Score: ${this.game.score}`);
          break;
      }
    }

    start() {
      this.game.start();
    }

    pause() {
      this.game.setPaused(true);
    }

    resume() {
      this.game.setPaused(false);
    }

    reset() {
      this.game.stop();
      this.game = new this.game.constructor(this.game.width, this.game.height, this.game.gameId);
      this.setupSubscriptions();
      this.start();
    }

    destroy() {
      this.game.stop();
      this.inputManager.destroy();
      this.renderer.destroy();
    }
  }

  // Public API
  return {
    GameModel,
    GameEngine,
    InputManager,
    SoundManager,
    GameRenderer,
    Tween,
    easing,
    Subject,
    BehaviorSubject,
    Subscription,
    version: '1.0.0'
  };
})();

// Make available globally
if (typeof module !== 'undefined' && module.exports) {
  module.exports = ArcadeEngine;
}
