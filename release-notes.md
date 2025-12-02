# 🎮 Tank Destroyer: Ultimate Edition v2.1.1

Major AI improvements and critical bug fixes! This version enhances enemy AI behavior, fixes the tank shooting bug after continue, and improves Demo mode player AI to tier 5 intelligence.

## ✨ What's New in v2.1.1

### 🐛 Bug Fixes

- **Tank Shooting After Continue** - Fixed critical bug where enemies wouldn't shoot after loading a saved game
- **Magic Skill Range** - Fixed ice and fire tanks wasting skills when out of range
- **Ice/Fire Tank Approach** - Fixed passive behavior, tanks now actively pursue player
- **Floating Text Performance** - Optimized cleanup from O(n²) to O(n)

### 🚀 Improvements

- **Demo AI Tier 5** - Full tier 5 intelligence with smooth wall avoidance
- **Wall Avoidance AI** - Ray-casting with 30-frame avoidance lock
- **Near-Miss Bullet Detection** - Patrol enemies alerted by nearby bullets
- **Fog Animation** - Smoother seamless looping with performance.now()
- **Settings Screen** - Full-screen redesign with instant appearance

### ⚙️ UI Changes

- Settings screen opens instantly (removed fade-in animation)
- Screen transition animations for closing settings/achievements

---

## 🛠️ Technical Stack

- **Pure JavaScript** - No frameworks, maximum performance
- **HTML5 Canvas** - Hardware-accelerated 2D rendering
- **Web Audio API** - Dynamic sound effects and music
- **Local Storage** - Save/load game progress

---

## 🚀 Quick Start

```bash
# Clone the repository
git clone https://github.com/mohammadfirmansyah/tank-destroyer.git

# Open in browser (no build required!)
# Simply open index.html or use a local server:
npx serve .
```

---

## 📚 Documentation

- [README.md](README.md) - Complete game documentation
- [CHANGELOG.md](CHANGELOG.md) - Detailed version history
- [CONTRIBUTING.md](CONTRIBUTING.md) - Contribution guidelines

---

## 📦 What's Included

- ✅ Complete game source code with tutorial-style comments
- ✅ 8 enemy tiers with unique AI behaviors
- ✅ 5 magic skill types (Shield, Blink, Ice, Fire, Electric)
- ✅ Smart Performance Optimizer
- ✅ Graphics Settings with 6 quality presets
- ✅ Achievement system with 50+ achievements

---

## 📋 Version History Summary

| Version | Key Changes |
|---------|-------------|
| v2.1.1 | AI improvements, fog animation, settings redesign, bug fixes |
| v2.1.0 | Graphics settings UI, quality presets, music hint |
| v2.0.4 | Music system, patrol/alert AI, crosshair fixes |
| v2.0.1 | Graphics on load fix, smoother splash transition |

---

Built with ❤️ using vanilla JavaScript and HTML5 Canvas
