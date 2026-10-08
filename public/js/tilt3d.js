/**
 * QuizNest 3D Micro-Physics & Tilt Engine (Tilt3D)
 * Provides 60fps zero-dependency mouse parallax tilt, specular sheen reflection,
 * tactile push micro-physics, and celebratory confetti effects.
 */
(function (global) {
  'use strict';

  var isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
  var currentTiltCard = null;
  var rafId = null;

  var SELECTOR = '.card, .sim-card, .quiz-card, .metric-card, .role-card-content, .hero-demo-box, .stat-card, [data-tilt-3d]';

  function initTilt() {
    if (isTouch) return; // Preserve buttery mobile touch performance

    // Event delegation on mousemove
    document.addEventListener('mousemove', function (e) {
      var card = e.target.closest(SELECTOR);
      if (!card) {
        if (currentTiltCard) {
          resetCard(currentTiltCard);
          currentTiltCard = null;
        }
        return;
      }

      if (currentTiltCard && currentTiltCard !== card) {
        resetCard(currentTiltCard);
      }
      currentTiltCard = card;

      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(function () {
        applyTilt(card, e.clientX, e.clientY);
      });
    }, { passive: true });

    document.addEventListener('mouseleave', function () {
      if (currentTiltCard) {
        resetCard(currentTiltCard);
        currentTiltCard = null;
      }
    });
  }

  function applyTilt(card, mouseX, mouseY) {
    // Keep cards completely stable without any angular tilt or wobbling
    var rect = card.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    var px = (mouseX - rect.left) / rect.width;
    var py = (mouseY - rect.top) / rect.height;

    px = Math.max(0, Math.min(1, px));
    py = Math.max(0, Math.min(1, py));

    card.style.setProperty('--mouse-x', (px * 100).toFixed(1) + '%');
    card.style.setProperty('--mouse-y', (py * 100).toFixed(1) + '%');
  }

  function resetCard(card) {
    if (!card) return;
    card.style.transform = '';
    card.style.removeProperty('--mouse-x');
    card.style.removeProperty('--mouse-y');
  }

  /**
   * Generates a celebratory confetti particle burst at (x, y) coordinates
   */
  function burstConfetti(x, y, count) {
    var num = count || 24;
    var colors = ['#4f5bff', '#10b981', '#ec4899', '#f59e0b', '#06b6d4', '#a855f7'];

    var container = document.getElementById('tilt3d-confetti-layer');
    if (!container) {
      container = document.createElement('div');
      container.id = 'tilt3d-confetti-layer';
      container.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;pointer-events:none;z-index:99999;overflow:hidden;';
      document.body.appendChild(container);
    }

    var originX = x || (window.innerWidth / 2);
    var originY = y || (window.innerHeight / 2);

    for (var i = 0; i < num; i++) {
      var p = document.createElement('div');
      var color = colors[Math.floor(Math.random() * colors.length)];
      var size = Math.floor(Math.random() * 8) + 6;
      var angle = Math.random() * Math.PI * 2;
      var velocity = Math.random() * 120 + 60;
      var vx = Math.cos(angle) * velocity;
      var vy = Math.sin(angle) * velocity - 40; // slight upward bias
      var rot = Math.random() * 360;

      p.style.cssText = [
        'position:absolute;',
        'width:' + size + 'px;',
        'height:' + (size * (Math.random() > 0.5 ? 1 : 0.6)) + 'px;',
        'background-color:' + color + ';',
        'border-radius:' + (Math.random() > 0.5 ? '50%' : '2px') + ';',
        'left:' + originX + 'px;',
        'top:' + originY + 'px;',
        'transform:translate(-50%, -50%) rotate(' + rot + 'deg);',
        'transition:transform 0.85s cubic-bezier(0.25, 1, 0.5, 1), opacity 0.85s ease;',
        'opacity:1;'
      ].join('');

      container.appendChild(p);

      (function (particle, targetVx, targetVy) {
        requestAnimationFrame(function () {
          requestAnimationFrame(function () {
            particle.style.transform = 'translate(' + (targetVx - 50) + '%, ' + (targetVy + 100) + '%) rotate(' + (rot + 360) + 'deg) scale(0.6)';
            particle.style.opacity = '0';
          });
        });
        setTimeout(function () {
          if (particle.parentNode) {
            particle.parentNode.removeChild(particle);
          }
        }, 950);
      })(p, vx * 1.6, vy * 1.6);
    }
  }

  // Self-initialize on DOM ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initTilt);
  } else {
    initTilt();
  }

  global.Tilt3D = {
    init: initTilt,
    confetti: burstConfetti,
    burst: burstConfetti,
    reset: resetCard
  };

})(window);
