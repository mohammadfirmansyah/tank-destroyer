# Contributing to Tank Destroyer: Ultimate Edition

Thank you for considering contributing to Tank Destroyer! We welcome contributions from the community to help make this game even better.

## 🌟 Ways to Contribute

- 🐛 **Bug Reports** - Report issues you encounter
- 💡 **Feature Suggestions** - Propose new features or improvements
- 🔧 **Code Contributions** - Submit bug fixes or new features
- 📖 **Documentation** - Improve or expand documentation
- 🎨 **Assets** - Contribute visual or audio assets
- 🧪 **Testing** - Help test new features and report bugs

## 📋 Before You Start

1. **Check Existing Issues** - Look through [existing issues](https://github.com/mohammadfirmansyah/tank-destroyer/issues) to avoid duplicates
2. **Read the Code** - Familiarize yourself with the project structure and coding style
3. **Start Small** - Begin with small contributions to understand the workflow

## 🐛 Reporting Bugs

When reporting bugs, please include:

- **Clear Title** - Descriptive one-line summary
- **Steps to Reproduce** - Detailed steps to recreate the issue
- **Expected Behavior** - What you expected to happen
- **Actual Behavior** - What actually happened
- **Screenshots/Videos** - Visual evidence if applicable
- **Environment** - Browser, OS, device type
- **Console Errors** - Any JavaScript errors from browser console

**Example Bug Report:**
```markdown
### Bug: Enemy tanks don't chase player when player moves away

**Steps to Reproduce:**
1. Start a new game
2. Wait for enemies to spawn
3. Move away from enemies
4. Observe that enemies remain stationary

**Expected:** Enemies should pursue the player within their pursuit radius
**Actual:** Enemies do not follow the player
**Browser:** Chrome 120.0.6099.109
**OS:** Windows 11
**Console Errors:** None
```

## 💡 Suggesting Features

When suggesting features, please include:

- **Clear Description** - What feature you'd like to see
- **Use Case** - Why this feature would be valuable
- **Implementation Ideas** - How you envision it working (optional)
- **Mockups/Diagrams** - Visual representations if helpful

**Example Feature Request:**
```markdown
### Feature: Boss Battle System

**Description:** Add challenging boss encounters every 10 waves

**Use Case:** Provides progression milestones and memorable encounters

**Implementation Ideas:**
- Bosses have 10x normal HP
- Unique attack patterns (spread fire, homing missiles)
- Special loot drops (guaranteed legendary weapons)
- Boss warning on HUD before spawn

**Mockup:** [Link to sketch or diagram]
```

## 🔧 Code Contributions

### Getting Started

1. **Fork the Repository**
   ```bash
   # Click "Fork" button on GitHub
   ```

2. **Clone Your Fork**
   ```bash
   git clone https://github.com/YOUR_USERNAME/tank-destroyer.git
   cd tank-destroyer
   ```

3. **Create a Feature Branch**
   ```bash
   git checkout -b feature/your-feature-name
   # or
   git checkout -b fix/bug-description
   ```

### Coding Standards

#### JavaScript Style
- **ES6+ Syntax** - Use modern JavaScript features
- **Const/Let** - No `var` declarations
- **Arrow Functions** - Prefer arrow functions for callbacks
- **Descriptive Names** - Use clear variable and function names
- **Comments in English** - All code comments must be in English
- **Tutorial-Style Comments** - Write educational comments explaining "why" not just "what"

**Example:**
```javascript
// Calculate pursuit radius based on enemy intelligence level
// Higher tier enemies can detect player from farther away, creating
// pressure and forcing tactical retreats
const pursuitRadius = 1000 + (intelligence * 500); // Tier 0: 1500, Tier 4: 3500
```

#### Code Organization
- **One Responsibility** - Each function should do one thing well
- **Pure Functions** - Minimize side effects where possible
- **Consistent Formatting** - Use 4-space indentation
- **Line Length** - Keep lines under 100 characters for readability

#### File Structure
- **config.js** - Constants and configuration only
- **systems.js** - Game logic and systems (AI, combat, loot, boss)
- **render.js** - Canvas rendering code only
- **gameplay.js** - Game loop and state management
- **ui.js** - HUD updates and UI interactions
- **input.js** - Input handling (keyboard, mouse, touch)
- **achievements.js** - Achievement system and tracking
- **saveManager.js** - Save/Load game state persistence
- **demo.js** - Homepage demo battle background
- **splash.js** - Splash screen and loading
- **world.js** - Map generation and spawning
- **main.js** - Initialization and entry point

### Testing Your Changes

1. **Manual Testing**
   - Test on multiple browsers (Chrome, Firefox, Edge, Safari)
   - Test on both desktop and mobile devices
   - Verify no console errors
   - Check performance (60 FPS target)

2. **Edge Cases**
   - Test extreme scenarios (0 HP, max HP, 0 energy, etc.)
   - Test boundary conditions (map edges, max enemies)
   - Test rapid inputs (button mashing, fast movement)

3. **Visual Verification**
   - Ensure UI elements don't overlap
   - Check text readability on all backgrounds
   - Verify animations are smooth

### Submitting Your Changes

1. **Commit Your Changes**
   ```bash
   git add .
   git commit -m "feat: add boss battle system"
   ```

   **Commit Message Format:**
   ```
   <type>: <description>
   
   [optional body]
   [optional footer]
   ```

   **Types:**
   - `feat:` - New feature
   - `fix:` - Bug fix
   - `docs:` - Documentation changes
   - `style:` - Code style changes (formatting, no logic change)
   - `refactor:` - Code refactoring
   - `perf:` - Performance improvements
   - `test:` - Adding or updating tests
   - `chore:` - Maintenance tasks

2. **Push to Your Fork**
   ```bash
   git push origin feature/your-feature-name
   ```

3. **Create Pull Request**
   - Go to the original repository on GitHub
   - Click "New Pull Request"
   - Select your fork and branch
   - Fill out the PR template:

   **PR Template:**
   ```markdown
   ## Description
   Brief description of what this PR does
   
   ## Type of Change
   - [ ] Bug fix
   - [ ] New feature
   - [ ] Documentation update
   - [ ] Performance improvement
   
   ## Testing
   - [ ] Tested on Chrome
   - [ ] Tested on Firefox
   - [ ] Tested on mobile
   - [ ] No console errors
   
   ## Screenshots (if applicable)
   [Add screenshots or GIFs demonstrating the change]
   
   ## Related Issues
   Closes #123
   ```

## 📖 Documentation Contributions

Documentation improvements are always welcome:

- Fix typos or grammatical errors
- Clarify confusing explanations
- Add missing information
- Create tutorials or guides
- Improve code comments

**Language:** All documentation and comments must be in **English**.

## 🎨 Asset Contributions

If you want to contribute visual or audio assets:

- **Format Requirements:**
  - Images: PNG or SVG
  - Audio: MP3 or OGG
  - Size: Optimized for web (compressed)

- **License:** Ensure you have the rights to contribute the asset
- **Style:** Match the existing game aesthetic (military/industrial theme)

## ⚠️ Important Notes

- **Don't Break Existing Features** - Ensure your changes don't break current functionality
- **Keep it Simple** - Prefer simple, readable code over clever one-liners
- **Ask Questions** - If unsure, open an issue to discuss before implementing
- **Be Patient** - PRs are reviewed as time permits
- **Be Respectful** - Follow our Code of Conduct (be professional and courteous)

## 🔄 After Your PR is Submitted

- **Respond to Feedback** - Address reviewer comments promptly
- **Update Your PR** - Make requested changes and push updates
- **Be Patient** - Reviews take time; don't spam maintainers
- **Celebrate** - Once merged, your contribution is part of the game! 🎉

## 🏆 Recognition

Contributors will be:
- Listed in the repository contributors page
- Mentioned in release notes for significant contributions
- Given credit in documentation for major features

## 📞 Getting Help

- **GitHub Issues** - For bug reports and feature requests
- **GitHub Discussions** - For questions and general discussion
- **Email** - Contact maintainers for sensitive issues

---

Thank you for contributing to Tank Destroyer: Ultimate Edition! Your efforts help make this game better for everyone.

**Happy Coding! 🎮**
