# Build Information

This document provides detailed information about building, deploying, and hosting **Tank Destroyer: Ultimate Edition**.

## 📦 Project Type

**Tank Destroyer** is a **pure client-side web application** built with:
- HTML5 Canvas
- Vanilla JavaScript (ES6+)
- CSS3 (with Tailwind CDN)

**No build process, bundlers, or compilation required.**

## 🚀 Deployment Options

### Option 1: Static File Hosting (Recommended)

The game can be deployed to any static file hosting service:

#### GitHub Pages (Free, Recommended)
1. **Enable GitHub Pages:**
   ```bash
   # Repository Settings → Pages → Source: main branch / root folder
   ```
2. **Access URL:**
   ```
   https://yourusername.github.io/tank-destroyer/
   ```

#### Netlify
1. **Deploy via Drag & Drop:**
   - Visit [Netlify Drop](https://app.netlify.com/drop)
   - Drag the entire project folder
   - Get instant deployment

2. **Deploy via CLI:**
   ```bash
   npm install -g netlify-cli
   netlify deploy --prod
   ```

#### Vercel
```bash
npm install -g vercel
vercel --prod
```

#### Cloudflare Pages
1. Connect GitHub repository
2. Set build command: `(leave empty)`
3. Set output directory: `/`
4. Deploy

### Option 2: Local Development Server

#### Python (Recommended for Quick Testing)
```bash
# Python 3.x
python -m http.server 8000

# Access at: http://localhost:8000
```

#### Node.js (http-server)
```bash
npx http-server -p 8000

# Access at: http://localhost:8000
```

#### VS Code Live Server Extension
1. Install "Live Server" extension
2. Right-click `tank-destroyer.html`
3. Select "Open with Live Server"

## 🔧 Configuration

### Changing Game Settings

Edit constants in **`js/config.js`**:

```javascript
// World size
const WORLD_W = 10000; // Battlefield width
const WORLD_H = 10000; // Battlefield height

// Player stats
player.maxHp = 200;      // Maximum health
player.maxEnergy = 100;  // Maximum energy

// Enemy configuration
const ENEMY_TIERS = [
    { id: 0, hp: 120, speed: 1.8, ... },
    // Modify tier stats here
];
```

### Adjusting Visual Effects

Edit **`js/render.js`**:
- Particle density (line ~400-600)
- Screen shake intensity (line ~100-150)
- Rendering quality settings

### Modifying UI Layout

Edit **`index.html`** and **`css/style.css`**:
- HUD positioning
- Menu layouts
- Color themes
- Font sizes

## 🧪 Testing Checklist

Before deploying, ensure:

### Functionality
- [ ] Game starts without errors
- [ ] All weapons fire correctly
- [ ] Enemies spawn and behave properly
- [ ] Minimap displays correctly
- [ ] High scores persist across sessions
- [ ] Pause/Resume works
- [ ] Game over screen displays score

### Cross-Browser Compatibility
- [ ] Chrome (latest)
- [ ] Firefox (latest)
- [ ] Safari (latest)
- [ ] Edge (latest)

### Device Testing
- [ ] Desktop (1920x1080)
- [ ] Laptop (1366x768)
- [ ] Tablet (iPad)
- [ ] Mobile (iPhone, Android)

### Performance
- [ ] Maintains 60 FPS with 20+ enemies
- [ ] No memory leaks (test 30+ min session)
- [ ] Smooth animations and particle effects
- [ ] Quick load time (< 2 seconds)

### Console Errors
- [ ] No JavaScript errors in console
- [ ] No 404 errors for assets
- [ ] No CORS issues

## 📁 File Structure for Deployment

Ensure all these files are included:

```
tank-destroyer/
├── index.html              ✅ Entry point
├── css/
│   └── style.css           ✅ Styles
├── js/
│   ├── cache-buster.js     ✅ Cache management (auto-refresh)
│   ├── config.js           ✅ Configuration
│   ├── world.js            ✅ Map generation
│   ├── gameplay.js         ✅ Game loop
│   ├── systems.js          ✅ AI and systems
│   ├── render.js           ✅ Rendering
│   ├── ui.js               ✅ HUD
│   ├── input.js            ✅ Controls
│   ├── demo.js             ✅ Demo battle
│   ├── splash.js           ✅ Splash screen
│   ├── achievements.js     ✅ Achievement system
│   ├── saveManager.js      ✅ Save/Load game state
│   ├── tailwind.js         ✅ Tailwind CSS (local)
│   └── main.js             ✅ Initialization
├── assets/
│   └── fonts/              ✅ Custom fonts (Rajdhani, Black Ops One)
├── README.md               ✅ Documentation
├── CONTRIBUTING.md         ✅ Contribution guide
├── CHANGELOG.md            ✅ Version history
├── BUILD_INFO.md           ✅ This file
└── LICENSE                 ✅ License file
```

## 🌐 GitHub Pages Setup (Step-by-Step)

### Method 1: Via GitHub Web Interface
1. **Push Code to GitHub:**
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git branch -M main
   git remote add origin https://github.com/yourusername/tank-destroyer.git
   git push -u origin main
   ```

2. **Enable GitHub Pages:**
   - Go to repository Settings
   - Scroll to "Pages" section
   - Source: Select `main` branch
   - Folder: Select `/ (root)`
   - Click "Save"

3. **Access Your Game:**
   - URL: `https://yourusername.github.io/tank-destroyer/tank-destroyer.html`
   - Wait 1-2 minutes for deployment

### Method 2: Via GitHub CLI
```bash
# Create repository
gh repo create tank-destroyer --public --source=. --remote=origin --push

# Enable GitHub Pages
gh api repos/:owner/tank-destroyer/pages \
  -X POST \
  -f source[branch]=main \
  -f source[path]=/
```

## 🔐 Environment Considerations

### No Backend Required
- All game state is client-side
- No API calls or server communication
- No environment variables needed

### Cross-Origin Resource Sharing (CORS)
- **Not an issue** for GitHub Pages, Netlify, Vercel
- If self-hosting, ensure server allows same-origin access

### HTTPS
- **Recommended** for production
- GitHub Pages provides HTTPS automatically
- Required for some browser APIs (e.g., gamepad, clipboard)

## 📊 Performance Optimization Tips

### Already Optimized
- ✅ Canvas rendering uses `requestAnimationFrame`
- ✅ Particle count is limited (max 500)
- ✅ Off-screen entities are culled
- ✅ Minimal DOM manipulation

### Future Optimizations
- Consider OffscreenCanvas for background rendering
- Implement object pooling for bullets/particles
- Use Web Workers for AI calculations (if needed)

## 🛠️ Troubleshooting

### Game Doesn't Start
- **Check Console:** Look for JavaScript errors
- **Verify Paths:** Ensure all `<script>` tags point to correct files
- **CORS Issues:** Use a local server, not `file://` protocol

### Poor Performance
- **Reduce Particle Count:** Edit `js/render.js` (max particles)
- **Lower Enemy Count:** Edit `js/config.js` (spawn rates)
- **Disable Effects:** Comment out screen shake in `js/render.js`

### High Scores Not Saving
- **localStorage Disabled:** Check browser privacy settings
- **Incognito Mode:** localStorage doesn't persist in incognito
- **Quota Exceeded:** Clear browser data and try again

## 📞 Support

For deployment issues:
1. Check browser console for errors
2. Review this BUILD_INFO.md
3. Open an issue on GitHub
4. Contact maintainers

---

**Last Updated:** 2025-11-30  
**Version:** 2.0.0-RC.3
