// INPUT HANDLING
const INPUT_MODE = { TOUCH: 'touch', DESKTOP: 'desktop' };
let activeInputMode = INPUT_MODE.TOUCH;

// Centralized helper keeps visual joysticks in sync with the current control scheme.
function setInputMode(mode) {
    if (activeInputMode === mode) return;
    activeInputMode = mode;
    document.body.classList.toggle('touch-controls-hidden', mode === INPUT_MODE.DESKTOP);
    if (mode === INPUT_MODE.DESKTOP) resetVirtualJoysticks();
}

// When switching away from touch we clear joystick state so desktops do not
// inherit stale vectors that keep the tank sliding.
function resetVirtualJoysticks() {
    input.move.active = false;
    input.move.x = 0;
    input.move.y = 0;
    input.move.angle = 0;
    input.move.mag = 0;
    input.aim.active = false;
    input.aim.x = 0;
    input.aim.y = 0;
    input.aim.angle = 0;
    input.aim.mag = 0;
    document.getElementById('thumb-l').style.transform = 'translate(-50%,-50%)';
    document.getElementById('thumb-r').style.transform = 'translate(-50%,-50%)';
}

// Joysticks only react when touch mode is active to avoid conflicting signals.
function isTouchMode() {
    return activeInputMode === INPUT_MODE.TOUCH;
}

// Desktop listeners flip to keyboard mode immediately so joysticks stay hidden.
window.addEventListener('keydown', e => {
    setInputMode(INPUT_MODE.DESKTOP);
    const k = e.key.toLowerCase();
    const clearAnalogAim = () => {
        mouseAim.active = false;
        mouseAim.down = false;
    };
    if (k === 'w') keys.w = true;
    if (k === 'a') keys.a = true;
    if (k === 's') keys.s = true;
    if (k === 'd') keys.d = true;
    if (k === 'arrowup') {
        keys.up = true;
        clearAnalogAim();
    }
    if (k === 'arrowleft') {
        keys.left = true;
        clearAnalogAim();
    }
    if (k === 'arrowdown') {
        keys.down = true;
        clearAnalogAim();
    }
    if (k === 'arrowright') {
        keys.right = true;
        clearAnalogAim();
    }
    if (k === ' ') activateUlt(e);
    if (k === 'escape' && state === 'GAME') togglePause();
});

window.addEventListener('keyup', e => {
    const k = e.key.toLowerCase();
    if (k === 'w') keys.w = false;
    if (k === 'a') keys.a = false;
    if (k === 's') keys.s = false;
    if (k === 'd') keys.d = false;
    if (k === 'arrowup') keys.up = false;
    if (k === 'arrowleft') keys.left = false;
    if (k === 'arrowdown') keys.down = false;
    if (k === 'arrowright') keys.right = false;
});

// Mouse motion provides turret aim using screen center as reference point.
window.addEventListener('mousemove', e => {
    if (state !== 'GAME' || paused) return;
    setInputMode(INPUT_MODE.DESKTOP);
    let cx = window.innerWidth / 2;
    let cy = window.innerHeight / 2;
    mouseAim.active = true;
    mouseAim.angle = Math.atan2(e.clientY - cy, e.clientX - cx);
});

window.addEventListener('mousedown', e => {
    if (e.target.tagName === 'CANVAS') mouseAim.down = true;
    setInputMode(INPUT_MODE.DESKTOP);
});

window.addEventListener('mouseup', () => {
    mouseAim.down = false;
});

document.getElementById('start-btn').addEventListener('click', e => {
    e.stopPropagation();
    startGame();
});

document.getElementById('restart-btn').addEventListener('click', e => {
    e.stopPropagation();
    startGame();
});

document.getElementById('pause-btn').addEventListener('click', togglePause);

document.getElementById('resume-btn').addEventListener('click', togglePause);

document.getElementById('restart-pause-btn').addEventListener('click', () => {
    startGame();
});

document.getElementById('home-btn').addEventListener('click', returnHome);

document.getElementById('home-gameover-btn').addEventListener('click', returnHome);

function activateUlt(e) {
    e.stopPropagation();
    if (player.ultReady && !player.isUlting) {
        player.isUlting = true;
        player.ultTimer = 150;
        addFloatText('CHARGING...', player.x, player.y - 50, 'cyan');
    }
}

document.getElementById('ult-btn').addEventListener('touchstart', activateUlt);
document.getElementById('ult-btn').addEventListener('mousedown', activateUlt);

// Virtual joystick handler mirrors mobile twin-stick shooters.
function handleJoy(tx, ty, type, phase) {
    if (!isTouchMode()) return;
    const rL = document.getElementById('stick-l').getBoundingClientRect();
    const rR = document.getElementById('stick-r').getBoundingClientRect();
    const cL = { x: rL.left + rL.width / 2, y: rL.top + rL.height / 2 };
    const cR = { x: rR.left + rR.width / 2, y: rR.top + rR.height / 2 };

    if (type === 'auto') {
        if (tx < window.innerWidth / 2) type = 'left';
        else type = 'right';
    }

    if (type === 'left') {
        if (phase === 'end') {
            input.move.active = false;
            document.getElementById('thumb-l').style.transform = 'translate(-50%,-50%)';
        } else {
            input.move.active = true;
            let dx = tx - cL.x;
            let dy = ty - cL.y;
            let ang = Math.atan2(dy, dx);
            let dist = Math.min(Math.hypot(dx, dy), 40);
            input.move.x = Math.cos(ang) * (dist / 40);
            input.move.y = Math.sin(ang) * (dist / 40);
            input.move.angle = ang;
            document.getElementById('thumb-l').style.transform = `translate(calc(-50% + ${input.move.x * 40}px), calc(-50% + ${input.move.y * 40}px))`;
        }
    } else {
        if (phase === 'end') {
            input.aim.active = false;
            document.getElementById('thumb-r').style.transform = 'translate(-50%,-50%)';
        } else {
            input.aim.active = true;
            let dx = tx - cR.x;
            let dy = ty - cR.y;
            let ang = Math.atan2(dy, dx);
            let dist = Math.min(Math.hypot(dx, dy), 40);
            input.aim.x = Math.cos(ang) * (dist / 40);
            input.aim.y = Math.sin(ang) * (dist / 40);
            input.aim.angle = ang;
            input.aim.mag = dist / 40;
            document.getElementById('thumb-r').style.transform = `translate(calc(-50% + ${input.aim.x * 40}px), calc(-50% + ${input.aim.y * 40}px))`;
        }
    }
}

document.addEventListener(
    'touchstart',
    e => {
        setInputMode(INPUT_MODE.TOUCH);
        if (e.target.id.includes('btn')) return;
        e.preventDefault();
        for (let t of e.changedTouches) handleJoy(t.clientX, t.clientY, 'auto', 'start');
    },
    { passive: false }
);

document.addEventListener(
    'touchmove',
    e => {
        e.preventDefault();
        for (let t of e.changedTouches) handleJoy(t.clientX, t.clientY, 'auto', 'move');
    },
    { passive: false }
);

document.addEventListener('touchend', e => {
    if (e.target.id.includes('btn')) return;
    e.preventDefault();
    for (let t of e.changedTouches) handleJoy(t.clientX, t.clientY, 'auto', 'end');
});

let md = false;
document.addEventListener('mousedown', e => {
    if (!isTouchMode()) return;
    if (e.target.id.includes('btn')) return;
    md = true;
    handleJoy(e.clientX, e.clientY, 'auto', 'start');
});

document.addEventListener('mousemove', e => {
    if (!isTouchMode()) return;
    if (md) handleJoy(e.clientX, e.clientY, 'auto', 'move');
});

document.addEventListener('mouseup', e => {
    if (!isTouchMode()) return;
    md = false;
    handleJoy(e.clientX, e.clientY, 'left', 'end');
    handleJoy(e.clientX, e.clientY, 'right', 'end');
});
