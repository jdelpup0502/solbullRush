document.addEventListener('DOMContentLoaded', () => {
    const bull = document.getElementById('bull');
    const startScreen = document.getElementById('start-screen');
    const gameContainer = document.getElementById('game-container');
    const startButton = document.getElementById('start-button');
    const touchControls = document.getElementById('touch-controls');
    const tcLeft = document.getElementById('tc-left');
    const tcRight = document.getElementById('tc-right');
    const tcDuck = document.getElementById('tc-duck');
    const tcJump = document.getElementById('tc-jump');
    const speedBoostIcon = document.getElementById('speed-boost-icon');
    const muteToggle = document.getElementById('mute-toggle');
    const pauseOverlay = document.getElementById('pause-overlay');
    function showSpeedBoostIcon() { if (speedBoostIcon) speedBoostIcon.style.display = 'flex'; }
    function hideSpeedBoostIcon() { if (speedBoostIcon) speedBoostIcon.style.display = 'none'; }
    

    
    // Game state
    let gameRunning = false;
    let gameLoopId = null;
    let gamePausedBySystem = false; // track auto-pauses
    
    // Game physics constants
    const GRAVITY = -0.5; // Reduced gravity for slower, more floaty jumps
    const JUMP_FORCE = 16; // Slightly reduced since gravity is weaker
    const HORIZONTAL_SPEED = 5;
    const FLOOR_HEIGHT = 80; // Raised to match the ground level in the background image
    
    // Background scrolling
    let backgroundPosition = 0;
    
    // Platform system
    let platforms = [];
    const PLATFORM_WIDTH = 200; // Made platforms wider
    const PLATFORM_HEIGHT = 30; // Made platforms taller
    const PLATFORM_SPACING = 250; // Closer spacing to help reach higher platforms
    const PLATFORM_COLLISION_LEFT_INSET = 92;   // increase until the left edge feels right
    const PLATFORM_COLLISION_RIGHT_INSET = 12;  // keep right side tighter

    let nextPlatformX = 500; // Start first platform 500px ahead
    
    // Bear system
    let bears = [];
    const BEAR_SIZE = 80; // Bear width/height
    const BEAR_FLOAT_SPEED = 0.02; // How fast bears float up and down
    const BEAR_FLOAT_AMPLITUDE = 15; // How far bears float up and down
    let nextBearSpawn = 200; // Distance to next bear spawn

    // Bear spawning controls
    const BEAR_SPAWN_MIN_GAP = 320;   // min horizontal gap between bears
    const BEAR_SPAWN_MAX_GAP = 560;   // max horizontal gap between bears
    const BEAR_PLATFORM_PROB  = 0.65; // chance to prefer platform over ground when platforms exist
    const BEAR_PLATFORM_MARGIN = 24;  // keep bears away from platform edges
    const BEAR_MIN_AHEAD = 380;       // always spawn at least this far ahead of the bull

    // Bear idle bobbing (visual only)
    const BEAR_PLATFORM_BOB = 4;      // small bob on platforms
    const BEAR_GROUND_BOB   = 3;      // very small bob on ground

    
    // Laser system
    let lasers = [];
    let nextLaserSpawn = 0;
    const LASER_WIDTH = 200;
    const LASER_HEIGHT = 15; // Made taller for better visibility
    const LASER_SPEED = 7;    // base speed (world units per frame towards left)
    const LASER_SPAWN_INTERVAL = 1500; // Faster spawning
    const LASER_HIT_INSET_L = 24;
    const LASER_HIT_INSET_R = 24;
    const LASER_SPAWN_GRACE_MS = 2500; // grace period before any lasers spawn
    const MAX_LARGE_LASERS = 2; // fewer large lasers

    // Side dart lasers (small, fast, from edges)
    let sideLasers = [];
    let nextSideLaserAt = 0; // timestamp ms for next spawn
    const SIDE_LASER_WIDTH = 36;
    const SIDE_LASER_HEIGHT = 6;
    const SIDE_LASER_SPEED = 12; // base speed for side darts
    const SIDE_LASER_MIN_MS = 1800; // fewer side lasers
    const SIDE_LASER_MAX_MS = 3200;
    const MAX_SIDE_LASERS = 2;
    
    // Game state
    let bearsEaten = 0;
    let gameTimer = 30; // 30 seconds
    let gameStartTime = 0;
    let gameActive = false;
    let gameEndReason = 'time'; // 'time' or 'laser'
    let speedOrbs = [];
    let nextSpeedOrbSpawn = 800; // first orb appears a bit ahead
    let speedBoostActive = false;
    let speedBoostUntil = 0;

    // Audio/haptics state
    let audioContext = null;
    let masterGain = null;
    let isMuted = false;
    function ensureAudio() {
        if (audioContext) return;
        try {
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            masterGain = audioContext.createGain();
            masterGain.gain.value = 0.4;
            masterGain.connect(audioContext.destination);
        } catch (e) {
            // no audio available
        }
    }
    function setMuted(muted) {
        isMuted = !!muted;
        if (muteToggle) {
            muteToggle.classList.toggle('is-muted', isMuted);
            muteToggle.textContent = isMuted ? '🔇' : '🔊';
        }
        if (masterGain) masterGain.gain.value = isMuted ? 0 : 0.4;
    }
    function vibrate(ms) {
        if (navigator.vibrate) navigator.vibrate(ms);
    }
    function playTone(freq, type, durationMs, attackMs = 5, decayMs = 60) {
        if (isMuted) return;
        ensureAudio();
        if (!audioContext) return;
        const osc = audioContext.createOscillator();
        const gain = audioContext.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, audioContext.currentTime);
        gain.gain.setValueAtTime(0, audioContext.currentTime);
        gain.gain.linearRampToValueAtTime(1, audioContext.currentTime + attackMs / 1000);
        gain.gain.linearRampToValueAtTime(0, audioContext.currentTime + (attackMs + decayMs) / 1000);
        osc.connect(gain);
        gain.connect(masterGain);
        osc.start();
        osc.stop(audioContext.currentTime + durationMs / 1000);
    }
    const sfx = {
        jump: () => playTone(520, 'square', 120, 5, 80),
        eat: () => playTone(300, 'sine', 130, 5, 120),
        orb: () => playTone(760, 'triangle', 140, 5, 140),
        laser: () => playTone(120, 'sawtooth', 220, 5, 220),
        start: () => playTone(440, 'triangle', 160, 5, 120)
    };

    
    // Bull properties
    let positionX = 0;
    let positionY = 0; // 0 is at the bottom (floor level)
    let velocityX = 0;
    let velocityY = 0;
    let isOnGround = false;
    let isMovingLeft = false;
    let isMovingRight = false;
    let isDucking = false;

    // Speed boost power-up
    const SPEEDBOOST_MULTIPLIER = 1.7;           // how much faster while boosted
    const SPEEDBOOST_DURATION_MS = 5000;         // 5 seconds
    const ORB_SIZE = 48;                          // matches CSS
    const ORB_SPAWN_MIN_GAP = 1600;               // spawn less frequently than bears
    const ORB_SPAWN_MAX_GAP = 2400;
    const ORB_PLATFORM_PROB = 0.7;               // prefer platforms when available
    const ORB_PLATFORM_MARGIN = 26;              // keep orbs away from platform edges
    const ORB_MIN_AHEAD = 420;                   // always spawn at least this far ahead

    
    // Animation
    const runFrames = ['assets/solbullFrame1.png', 'assets/solbullFrame2.png'];
    const duckFrame = 'assets/duckFrame.png';
    let currentFrame = 0;
    let frameCounter = 0;
    
    // Get game container dimensions
    let gameWidth = gameContainer.clientWidth;
    let gameHeight = gameContainer.clientHeight;
    
    // Update game dimensions on resize
    window.addEventListener('resize', () => {
        gameWidth = gameContainer.clientWidth;
        gameHeight = gameContainer.clientHeight;
    });

    // Pause/resume helpers
    function pauseGame(reason) {
        if (!gameRunning) return;
        gameRunning = false;
        gamePausedBySystem = true;
        if (pauseOverlay) pauseOverlay.style.display = 'flex';
    }
    function resumeGame() {
        if (gameRunning) return;
        if (pauseOverlay) pauseOverlay.style.display = 'none';
        gameRunning = true;
        gamePausedBySystem = false;
        gameLoopId = requestAnimationFrame(gameLoop);
    }

    // Utility: detect coarse pointer devices (touch phones/tablets)
    const isTouchDevice = window.matchMedia('(hover: none) and (pointer: coarse)').matches;
    if (isTouchDevice) {
        // Prevent pinch-zoom and double-tap zoom during gameplay
        document.addEventListener('gesturestart', (e) => e.preventDefault(), { passive: false });
        document.addEventListener('gesturechange', (e) => e.preventDefault(), { passive: false });
        document.addEventListener('gestureend', (e) => e.preventDefault(), { passive: false });
        document.addEventListener('dblclick', (e) => e.preventDefault(), { passive: false });
    }
    
    function updateBackground() {
        // Update background position to follow the bull
        backgroundPosition = -positionX * 0.5; // Parallax effect - background moves slower than bull
        document.body.style.backgroundPosition = `${backgroundPosition}px bottom`;
    }
    
    
      
      
    
    function generatePlatform(x) {
        // Generate platforms at different height levels with even higher options
        let platformLevels = [
            FLOOR_HEIGHT + 120,  // Low level - easy to reach
            FLOOR_HEIGHT + 180,  // Medium-low level 
            FLOOR_HEIGHT + 240,  // Medium level
            FLOOR_HEIGHT + 300,  // High level
            FLOOR_HEIGHT + 360,  // Very high level
            FLOOR_HEIGHT + 420,  // Extreme high level
            FLOOR_HEIGHT + 480   // Sky level - very challenging
        ];
        
        // Choose a random level, with bias toward lower-medium levels
        let levelChoice = Math.random();
        let height;
        if (levelChoice < 0.3) height = platformLevels[0];      // 30% low
        else if (levelChoice < 0.5) height = platformLevels[1]; // 20% medium-low
        else if (levelChoice < 0.7) height = platformLevels[2]; // 20% medium
        else if (levelChoice < 0.85) height = platformLevels[3]; // 15% high
        else if (levelChoice < 0.95) height = platformLevels[4]; // 10% very high
        else if (levelChoice < 0.99) height = platformLevels[5]; // 4% extreme high
        else height = platformLevels[6];                         // 1% sky level
        
        return {
            x: x,
            y: height,
            width: PLATFORM_WIDTH,
            height: PLATFORM_HEIGHT,
            element: null
        };
    }
    
    function createPlatformElement(platform) {
        // Create HTML element for platform
        let platformDiv = document.createElement('img');
        platformDiv.src = 'assets/platforms/platform1.png';
        platformDiv.className = 'platform';
        platformDiv.style.position = 'absolute';
        platformDiv.style.width = PLATFORM_WIDTH + 'px';
        platformDiv.style.height = PLATFORM_HEIGHT + 'px';
        platformDiv.style.zIndex = '50';
        platformDiv.style.objectFit = 'cover';
        gameContainer.appendChild(platformDiv); 
        platform.element = platformDiv;
        return platformDiv;
    }
    
    // Replace your existing generateBear with this
    function generateBear() {
        // Always spawn the next bear at least BEAR_MIN_AHEAD in front of the bull
        let spawnX = Math.max(nextBearSpawn, positionX + BEAR_MIN_AHEAD);
    
        // Candidate platforms ahead of the bull within a generous window
        const aheadStart = positionX + 250;
        const aheadEnd   = positionX + window.innerWidth + 900;
        const candidatePlatforms = platforms.filter(p =>
        (p.x + BEAR_PLATFORM_MARGIN < aheadEnd) &&
        (p.x + p.width - BEAR_PLATFORM_MARGIN > aheadStart)
        );
    
        // Decide surface: prefer platforms when available
        const usePlatform = candidatePlatforms.length > 0 && Math.random() < BEAR_PLATFORM_PROB;
    
        let spawnY = FLOOR_HEIGHT;
        let onPlatform = false;
    
        if (usePlatform) {
        // Choose a random platform and a safe X inside its bounds
        const p = candidatePlatforms[Math.floor(Math.random() * candidatePlatforms.length)];
        const left  = p.x + BEAR_PLATFORM_MARGIN;
        const right = p.x + p.width - BEAR_PLATFORM_MARGIN;
    
        // Pick an X inside this platform; if our planned X is outside, clamp inside
        spawnX = Math.min(Math.max(spawnX, left), right);
        // Small random nudge along the platform for variety
        const wiggle = Math.floor(Math.random() * 41) - 20; // -20..+20
        spawnX = Math.min(Math.max(spawnX + wiggle, left), right);
    
        spawnY = p.y;        // top surface
        onPlatform = true;
        } else {
        // Ground spawn: keep the planned X, sit on the floor
        spawnY = FLOOR_HEIGHT;
        onPlatform = false;
        }
    
        // Bob amplitude: small on surfaces (no big floating bears)
        const floatAmp = onPlatform ? BEAR_PLATFORM_BOB : BEAR_GROUND_BOB;
    
        return {
        x: spawnX,
        y: spawnY,
        baseY: spawnY,
        floatOffset: Math.random() * Math.PI * 2,
        floatAmp: floatAmp,
        element: null,
        onPlatform: onPlatform
        };
    }
  
    
    function createBearElement(bear) {
        let bearDiv = document.createElement('img');
        bearDiv.src = 'assets/bear.png';
        bearDiv.className = 'bear';
        bearDiv.style.position = 'absolute';
        bearDiv.style.width = BEAR_SIZE + 'px';
        bearDiv.style.height = BEAR_SIZE + 'px';
        bearDiv.style.zIndex = '75';
        bearDiv.style.objectFit = 'contain';
        gameContainer.appendChild(bearDiv);
        bear.element = bearDiv;
        return bearDiv;
    }
    
    // Replace your existing updateBears with this
    function updateBears() {
        // Spawn bears at regular forward gaps
        while (nextBearSpawn < positionX + window.innerWidth + 300) {
        const newBear = generateBear();
        bears.push(newBear);
        createBearElement(newBear);
    
        // Schedule next spawn using min/max gap
        nextBearSpawn = newBear.x + (BEAR_SPAWN_MIN_GAP + Math.random() * (BEAR_SPAWN_MAX_GAP - BEAR_SPAWN_MIN_GAP));
        }
    
        // Update existing bears
        for (let i = bears.length - 1; i >= 0; i--) {
        const bear = bears[i];
    
        // Small idle bob only; keep them anchored to their surface
        bear.floatOffset += BEAR_FLOAT_SPEED;
        const floatY = Math.sin(bear.floatOffset) * (bear.floatAmp || 0);
    
        // World -> screen
        const screenX = (window.innerWidth / 2) + (bear.x - positionX) - BEAR_SIZE / 2;
        const bearWorldY = bear.baseY + floatY;
        const screenY = -bearWorldY;
    
        // Place sprite so its feet sit on the surface (top = bottom - height)
        bear.element.style.left = screenX + 'px';
        bear.element.style.top = (window.innerHeight + screenY - BEAR_SIZE) + 'px';
    
        // Despawn far behind
        if (bear.x < positionX - 1000) {
            bear.element.remove();
            bears.splice(i, 1);
        }
        }
    }
  
    
    function checkBearCollisions() {
        // Check if bull is eating any bears - using improved collision box
        let bullLeft = positionX + 25; // More accurate to bull's visual edges
        let bullRight = positionX + 125; // 100px wide collision box
        let bullBottom = positionY;
        
        // Adjust collision box height when ducking to match visual
        let bullHeight = isDucking ? 80 : 140; // More accurate to visual sprite
        let bullTop = positionY + bullHeight;
        
        for (let i = bears.length - 1; i >= 0; i--) {
            let bear = bears[i];
            let bearLeft = bear.x - BEAR_SIZE/2;
            let bearRight = bear.x + BEAR_SIZE/2;
            let bearBottom = bear.baseY + Math.sin(bear.floatOffset) * BEAR_FLOAT_AMPLITUDE;
            let bearTop = bearBottom + BEAR_SIZE;
            
            // Check collision
            if (bullRight > bearLeft && bullLeft < bearRight && 
                bullTop > bearBottom && bullBottom < bearTop) {
                // Bear eaten!
                bearsEaten++;
                sfx.eat();
                vibrate(10);
                bear.element.remove();
                bears.splice(i, 1);
                updateUI();
            }
        }
    }

    function createSpeedOrbElement(orb) {
        const el = document.createElement('div');
        el.className = 'speed-orb';
        el.style.width = ORB_SIZE + 'px';
        el.style.height = ORB_SIZE + 'px';
        gameContainer.appendChild(el);
        orb.element = el;
        return el;
      }
      
      // Choose a platform (or ground) and place an orb on its top or on the floor
      function generateSpeedOrb() {
        // Plan an X ahead
        let spawnX = Math.max(nextSpeedOrbSpawn, positionX + ORB_MIN_AHEAD);
      
        // Find platforms in a forward window
        const aheadStart = positionX + 250;
        const aheadEnd   = positionX + window.innerWidth + 900;
        const candidates = platforms.filter(p =>
          (p.x + ORB_PLATFORM_MARGIN < aheadEnd) &&
          (p.x + p.width - ORB_PLATFORM_MARGIN > aheadStart)
        );
      
        const usePlatform = candidates.length > 0 && Math.random() < ORB_PLATFORM_PROB;
      
        let baseY = FLOOR_HEIGHT;
        if (usePlatform) {
          const p = candidates[Math.floor(Math.random() * candidates.length)];
          const left  = p.x + ORB_PLATFORM_MARGIN + ORB_SIZE / 2;
          const right = p.x + p.width - ORB_PLATFORM_MARGIN - ORB_SIZE / 2;
      
          spawnX = Math.min(Math.max(spawnX, left), right);
          const wiggle = Math.floor(Math.random() * 41) - 20; // -20..+20
          spawnX = Math.min(Math.max(spawnX + wiggle, left), right);
      
          baseY = p.y; // top of platform
        }
      
        const orb = {
          x: spawnX,             // world center X
          baseY: baseY,          // world bottom Y (sits on surface)
          floatOffset: Math.random() * Math.PI * 2,
          element: null
        };
      
        createSpeedOrbElement(orb);
        return orb;
      }

      function resetSpeedBoost() {
        // Clear boost state and HUD
        speedBoostActive = false;
        speedBoostUntil = 0;
        if (typeof hideSpeedBoostIcon === 'function') hideSpeedBoostIcon();
      
        // Remove any existing speed orbs from the scene
        if (Array.isArray(speedOrbs)) {
          for (const orb of speedOrbs) {
            if (orb && orb.element) orb.element.remove();
          }
        }
        speedOrbs = [];
      
        // Re-seed the next spawn a bit ahead of current position
        nextSpeedOrbSpawn = (typeof positionX === 'number' ? positionX : 0) + 800;
      }
      
      
      function updateSpeedOrbs() {
        // Spawn with larger gaps than bears
        while (nextSpeedOrbSpawn < positionX + window.innerWidth + 300) {
          const orb = generateSpeedOrb();
          speedOrbs.push(orb);
          nextSpeedOrbSpawn = orb.x + (ORB_SPAWN_MIN_GAP + Math.random() * (ORB_SPAWN_MAX_GAP - ORB_SPAWN_MIN_GAP));
        }
      
        // Place on screen (keep anchored to surface with tiny bob for life)
        for (let i = speedOrbs.length - 1; i >= 0; i--) {
          const orb = speedOrbs[i];
          orb.floatOffset += 0.02; // gentle idle motion
          const floatY = Math.sin(orb.floatOffset) * 2; // small bob
          const worldY = orb.baseY + floatY;
      
          const left = (window.innerWidth / 2) + (orb.x - positionX) - ORB_SIZE / 2;
          const top  = window.innerHeight - (worldY + ORB_SIZE);
      
          if (orb.element) {
            orb.element.style.left = left + 'px';
            orb.element.style.top  = top + 'px';
          }
      
          // Despawn far behind
          if (orb.x < positionX - 1000) {
            if (orb.element) orb.element.remove();
            speedOrbs.splice(i, 1);
          }
        }
      }
      
      function checkSpeedOrbCollisions() {
        // Bull AABB aligned with your platform/bear box
        const bullLeft   = positionX + 25;
        const bullRight  = positionX + 125;
        const bullBottom = positionY;
        const bullHeight = isDucking ? 80 : 140;
        const bullTop    = positionY + bullHeight;
      
        for (let i = speedOrbs.length - 1; i >= 0; i--) {
          const orb = speedOrbs[i];
      
          // AABB for orb (center x with square size, bottom anchored at baseY)
          const orbLeft   = orb.x - ORB_SIZE / 2;
          const orbRight  = orb.x + ORB_SIZE / 2;
          const orbBottom = orb.baseY;
          const orbTop    = orb.baseY + ORB_SIZE;
      
          const horizontal = (bullRight > orbLeft) && (bullLeft < orbRight);
          const vertical   = (bullBottom < orbTop) && (bullTop > orbBottom);
      
          if (horizontal && vertical) {
            // Activate boost
            speedBoostActive = true;
            speedBoostUntil = Date.now() + SPEEDBOOST_DURATION_MS;
            showSpeedBoostIcon();
            sfx.orb();
            vibrate(10);
      
            // Remove orb
            if (orb.element) orb.element.remove();
            speedOrbs.splice(i, 1);
          }
        }
      }
      
    
    function updatePlatforms() {
        // Generate new platforms as needed
        while (nextPlatformX < positionX + window.innerWidth + 500) {
            let newPlatform = generatePlatform(nextPlatformX);
            platforms.push(newPlatform);
            createPlatformElement(newPlatform);
            nextPlatformX += PLATFORM_SPACING + Math.random() * 200; // Add some randomness to spacing
        }
        
        // Update platform positions and remove off-screen platforms
        for (let i = platforms.length - 1; i >= 0; i--) {
            let platform = platforms[i];
            let screenX = (window.innerWidth / 2) + (platform.x - positionX);
            let screenY = -platform.y;
            
            platform.element.style.left = screenX + 'px';
            platform.element.style.top = (window.innerHeight + screenY) + 'px';
            
            // Keep platforms - only remove if VERY far behind (increased distance)
            if (platform.x < positionX - 2000) { // Much larger distance before removal
                platform.element.remove();
                platforms.splice(i, 1);
            }
        }
    }

    const ICON_MARGIN_PX = 10;

    function positionSpeedBoostIcon() {
    const icon = document.getElementById('speed-boost-icon');
    if (!icon) return;

    const ui = document.getElementById('game-ui');
    let top = 20;
    let left = 20;

    if (ui) {
        const r = ui.getBoundingClientRect();
        top = Math.round(r.bottom + ICON_MARGIN_PX);
        left = Math.round(r.left);
    } else {
        const timer = document.querySelector('.timer');
        const score = document.querySelector('.score');
        const anchor = timer || score;
        if (anchor) {
        const r = anchor.getBoundingClientRect();
        top = Math.round(r.bottom + ICON_MARGIN_PX);
        left = Math.round(r.left);
        }
    }

    icon.style.top = top + 'px';
    icon.style.left = left + 'px';
    }

    function showSpeedBoostIcon() {
        positionSpeedBoostIcon();
        if (speedBoostIcon) speedBoostIcon.style.display = 'flex';
      }
      function hideSpeedBoostIcon() {
        if (speedBoostIcon) speedBoostIcon.style.display = 'none';
      }

      window.addEventListener('resize', positionSpeedBoostIcon);

    

// Continuous platform support with swept landings + "sticky" standing
function checkPlatformCollisions(prevY) {
    // Bull AABB (tune these if your visuals differ)
    const bullHeight = isDucking ? 80 : 140;    // visual-aligned height
    const bullLeft   = positionX + 20;          // inset for nicer feel
    const bullRight  = positionX + 130;         // 150px sprite width -> 20px/20px insets
  
    // Previous and new vertical extents
    const bullBottomPrev = prevY;
    const bullBottomNew  = positionY;
    const bullTopPrev    = prevY + bullHeight;
    const bullTopNew     = positionY + bullHeight;
  
    const H_INSET  = 10;   // avoids snag on pixel corners
    const EPS      = 0.5;  // numeric stability
    const SNAP_TOL = 6;    // snap onto top if within 6px above
    const HANG_TOL = 18;   // allow up to 18px penetration before correcting
  
    let supportTop = null;     // highest valid platform top to stand on this frame
    let hitCeiling = false;    // track ceiling bumps to zero upward velocity
  
    for (const p of platforms) {
      const left   = p.x + PLATFORM_COLLISION_LEFT_INSET;
      const right  = p.x + p.width - PLATFORM_COLLISION_RIGHT_INSET;
      if (bullRight <= left || bullLeft >= right) continue; // no horizontal overlap
  
      const top    = p.y;
      const bottom = p.y - p.height;
  
      // Handle ceiling bump when rising (top crossing platform bottom)
      if (velocityY > 0 &&
          (bullTopPrev - bottom) < -EPS &&
          (bullTopNew  - bottom) >= -EPS) {
        const candidateY = bottom - bullHeight;
        positionY = Math.max(candidateY, FLOOR_HEIGHT);
        hitCeiling = true; // zero vY after loop
        // Do not consider this platform as support for standing
        continue;
      }
  
      // Swept landing: falling and feet cross the platform top this frame
      const crossedTop = (velocityY <= 0) &&
                         ((bullBottomPrev - top) > EPS) &&
                         ((bullBottomNew  - top) <= EPS);
  
      // Sticky standing: feet are within tolerance of the top and moving down/resting
      const stickyTop = (velocityY <= 0) &&
                        (bullBottomNew <= top + SNAP_TOL) &&
                        (bullBottomNew >= top - HANG_TOL);
  
      if (crossedTop || stickyTop) {
        if (supportTop === null || top > supportTop) {
          supportTop = top; // choose the highest top when overlapping multiple platforms
        }
      }
    }
  
    if (hitCeiling) {
      velocityY = 0; // stop upward motion after ceiling resolution
    }
  
    if (supportTop !== null) {
      positionY = supportTop;  // snap to platform top
      velocityY = 0;           // rest on platform
      isOnGround = true;       // treated as ground support
      return true;
    }
  
    return false; // not supported by any platform
  }
  
  


// Keep ground state when supported; do gravity first, then resolve collisions
function updatePosition() {
    // Horizontal input and simple damping
    const moveSpeed = HORIZONTAL_SPEED * (speedBoostActive ? SPEEDBOOST_MULTIPLIER : 1);
    if (isMovingLeft) {
        velocityX = -moveSpeed;
    }   else if (isMovingRight) {
        velocityX = moveSpeed;
    }   else {
        velocityX *= 0.8;
    }

    // After integrating positions each frame, expire boost if time is up:
    if (speedBoostActive && Date.now() >= speedBoostUntil) {
    speedBoostActive = false;
    hideSpeedBoostIcon();
    }
  
    // Integrate vertical motion with gravity every frame
    velocityY += GRAVITY;
  
    // Integrate position
    const prevY = positionY;
    positionX += velocityX;
    positionY += velocityY;
  
    // Resolve platforms (swept + sticky)
    const onPlatform = checkPlatformCollisions(prevY);
  
    // Resolve floor only if not on a platform
    if (!onPlatform) {
      if (positionY <= FLOOR_HEIGHT) {
        positionY = FLOOR_HEIGHT;
        velocityY = 0;
        isOnGround = true;
      } else {
        isOnGround = false;
      }
    }
  
    // Kill tiny downward drift when grounded
    if (isOnGround && velocityY < 0) velocityY = 0;
  
    // Render bull (same as before)
    const bullScreenX = (window.innerWidth / 2) - 75; // sprite is 150px wide
    const scaleX = velocityX < 0 ? 1 : -1;
  
    if (isDucking) {
      bull.style.transform = `translate(${bullScreenX}px, ${-positionY + 30}px) scaleX(${scaleX}) scale(0.6)`;
    } else {
      bull.style.transform = `translate(${bullScreenX}px, ${-positionY}px) scaleX(${scaleX}) scale(1)`;
    }
  
  
    // Animation timing
    if (isDucking || Math.abs(velocityX) > 0.5) {
      frameCounter++;
      if (frameCounter % 10 === 0) switchFrame();
    }
  }
  
  

    function switchFrame() {
        if (isDucking) {
            bull.src = duckFrame;
        } else {
            currentFrame = (currentFrame + 1) % runFrames.length;
            bull.src = runFrames[currentFrame];
        }
    }
    
    function updateFrame() {
        // Immediately switch to correct frame when ducking state changes
        if (isDucking) {
            bull.src = duckFrame;
        } else {
            bull.src = runFrames[currentFrame]; // Use current standing frame
        }
    }
    
    // Removed updateBullSize - keeping all frames the same size
    
    function jump() {
        if (isOnGround) {
            velocityY = JUMP_FORCE;
            isOnGround = false;
            sfx.jump();
            vibrate(10);
        }
    }
    
    // Start game function
    function startGame() {
        gameRunning = true;
        startScreen.style.display = 'none';
        gameContainer.style.display = 'block';
        // Lock page scroll while playing on touch devices
        if (isTouchDevice) {
            document.body.style.overflow = 'hidden';
        }
        ensureAudio();
        if (audioContext && audioContext.state === 'suspended') audioContext.resume();
        sfx.start();
        positionSpeedBoostIcon();
        
        // Reset bull position
        positionX = 0;
        positionY = FLOOR_HEIGHT;
        velocityX = 0;
        velocityY = 0;
        isOnGround = true;
        isDucking = false;
        isMovingLeft = false;
        isMovingRight = false;
        backgroundPosition = 0;
        
        // Reset platforms
        platforms.forEach(platform => platform.element.remove());
        platforms = [];
        nextPlatformX = 500;
        
        // Reset bears
        bears.forEach(bear => bear.element.remove());
        bears = [];
        nextBearSpawn = 200;
        
        // Reset lasers
        lasers.forEach(laser => {
            laser.element.remove();
            // Also remove collision visualizations
            let collisionBox = document.getElementById(`laser-collision-${laser.x}`);
            if (collisionBox) {
                collisionBox.remove();
            }
        });
        lasers = [];
        nextLaserSpawn = 300; // First laser after moving just 300px (even sooner!)

        resetSpeedBoost();
        // Reset laser timelines and caps
        nextLaserSpawn = positionX + 1200; // initial distance gap
        nextSideLaserAt = Date.now() + LASER_SPAWN_GRACE_MS; // respect grace period
        // Clear existing side lasers if any lingering
        for (const l of sideLasers) { if (l.element) l.element.remove(); }
        sideLasers = [];
        
        // Reset game state
        gameActive = false;
        bearsEaten = 0;
        gameTimer = 30;
        
        // Set initial position immediately - on the ground level and perfectly centered
        let initialScreenX = (window.innerWidth / 2) - 75; // Center bull on screen
        bull.style.transform = `translate(${initialScreenX}px, ${-FLOOR_HEIGHT}px) scaleX(-1) scale(1)`;
        bull.style.display = 'block';
        bull.style.visibility = 'visible';
        bull.style.opacity = '1';
        
        
        // Start the game timer
        gameActive = true;
        gameStartTime = Date.now();
        bearsEaten = 0;
        gameEndReason = 'time';
        updateUI();
        
        // Start game loop
        if (gameLoopId) {
            cancelAnimationFrame(gameLoopId);
        }
        gameLoop();
    }
    
    // Handle start button click
    startButton.addEventListener('click', startGame);

    // Mute toggle
    if (muteToggle) {
        muteToggle.addEventListener('click', () => {
            ensureAudio();
            setMuted(!isMuted);
        });
        setMuted(false);
    }

    // Pause/resume on visibility/focus
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            pauseGame('visibility');
        } else if (!document.hidden && gameActive) {
            resumeGame();
        }
    });
    window.addEventListener('blur', () => { if (gameActive) pauseGame('blur'); });
    window.addEventListener('focus', () => { if (gameActive && !gameRunning) resumeGame(); });
    if (pauseOverlay) pauseOverlay.addEventListener('click', () => { if (gameActive && !gameRunning) resumeGame(); });
    
    // Handle key presses (only when game is running)
    document.addEventListener('keydown', (event) => {
        if (!gameRunning) return;
        
        switch(event.key) {
            case 'ArrowUp':
            case ' ': // Spacebar
                event.preventDefault();
                jump();
                break;
            case 'ArrowLeft':
                isMovingLeft = true;
                break;
            case 'ArrowRight':
                isMovingRight = true;
                break;
            case 'ArrowDown':
                event.preventDefault();
                isDucking = true;
                updateFrame(); // Immediately switch to duck frame
                break;
        }
    });
    
    // Handle key releases (only when game is running)
    document.addEventListener('keyup', (event) => {
        if (!gameRunning) return;
        
        switch(event.key) {
            case 'ArrowLeft':
                isMovingLeft = false;
                break;
            case 'ArrowRight':
                isMovingRight = false;
                break;
            case 'ArrowDown':
                isDucking = false;
                updateFrame(); // Immediately switch back to standing frame
                break;
        }
    });
    
    // Touch controls (share the same state flags as keyboard)
    function setupTouchControls() {
        if (!tcLeft || !tcRight || !tcDuck || !tcJump) return;
        let dimTimer = null;
        function undimControls() {
            if (touchControls) touchControls.classList.remove('dimmed');
            if (dimTimer) clearTimeout(dimTimer);
            dimTimer = setTimeout(() => {
                if (touchControls) touchControls.classList.add('dimmed');
            }, 1500);
        }
        const setPressed = (button, pressed) => {
            if (!button) return;
            if (pressed) button.classList.add('is-pressed');
            else button.classList.remove('is-pressed');
        };
        const preventAll = (e) => { e.preventDefault(); e.stopPropagation(); undimControls(); };
        const startLeft = (e) => { preventAll(e); if (!gameRunning) return; isMovingLeft = true; setPressed(tcLeft, true); };
        const endLeft   = (e) => { preventAll(e); isMovingLeft = false; setPressed(tcLeft, false); };
        const startRight= (e) => { preventAll(e); if (!gameRunning) return; isMovingRight = true; setPressed(tcRight, true); };
        const endRight  = (e) => { preventAll(e); isMovingRight = false; setPressed(tcRight, false); };
        const startDuck = (e) => { preventAll(e); if (!gameRunning) return; isDucking = true; updateFrame(); setPressed(tcDuck, true); };
        const endDuck   = (e) => { preventAll(e); isDucking = false; updateFrame(); setPressed(tcDuck, false); };
        const doJump    = (e) => { preventAll(e); if (!gameRunning) return; jump(); setPressed(tcJump, true); setTimeout(() => setPressed(tcJump, false), 120); };

        const opts = { passive: false };
        tcLeft.addEventListener('touchstart', startLeft, opts);
        tcLeft.addEventListener('touchend', endLeft, opts);
        tcLeft.addEventListener('touchcancel', endLeft, opts);

        tcRight.addEventListener('touchstart', startRight, opts);
        tcRight.addEventListener('touchend', endRight, opts);
        tcRight.addEventListener('touchcancel', endRight, opts);

        tcDuck.addEventListener('touchstart', startDuck, opts);
        tcDuck.addEventListener('touchend', endDuck, opts);
        tcDuck.addEventListener('touchcancel', endDuck, opts);

        tcJump.addEventListener('touchstart', doJump, opts);

        // Also support mouse (debugging on desktop)
        tcLeft.addEventListener('mousedown', startLeft);
        window.addEventListener('mouseup', endLeft);
        tcRight.addEventListener('mousedown', startRight);
        window.addEventListener('mouseup', endRight);
        tcDuck.addEventListener('mousedown', startDuck);
        window.addEventListener('mouseup', endDuck);
        tcJump.addEventListener('mousedown', doJump);

        // Start dim timer initially on mobile
        undimControls();
    }
    setupTouchControls();
    
    // Throttled UI updates
    let lastDisplayedBears = -1;
    let lastDisplayedSecond = -1;
    function updateUI() {
        // Update bears eaten counter and timer
        let uiElement = document.getElementById('game-ui');
        if (!uiElement) {
            uiElement = document.createElement('div');
            uiElement.id = 'game-ui';
            uiElement.innerHTML = `
                <div class="score">Bears Eaten: <span id="bear-count">0</span></div>
                <div class="timer">Time: <span id="time-left">30</span>s</div>
            `;
            gameContainer.appendChild(uiElement);
        }
        const bearCountEl = document.getElementById('bear-count');
        if (bearsEaten !== lastDisplayedBears) {
            bearCountEl.textContent = bearsEaten;
            lastDisplayedBears = bearsEaten;
        }
        
        // Update timer
        if (gameActive) {
            let elapsed = (Date.now() - gameStartTime) / 1000;
            let timeLeft = Math.max(0, Math.ceil(gameTimer - elapsed));
            if (timeLeft !== lastDisplayedSecond) {
                document.getElementById('time-left').textContent = timeLeft;
                lastDisplayedSecond = timeLeft;
            }
            
            // Game over when time runs out
            if (timeLeft <= 0) {
                gameActive = false;
                gameRunning = false;
                gameEndReason = 'time';
                showEndScreen();
            }
        }
    }
    
    // Game loop
    function gameLoop() {
        if (gameRunning) {
            updatePosition();
            updateBackground();
            updatePlatforms();
            updateBears();
            updateLasers();
            updateSideLasers();
            updateSpeedOrbs();
            checkSpeedOrbCollisions();
            checkBearCollisions();
            checkLaserCollisions();
            checkSideLaserCollisions();
            updateUI();
            gameLoopId = requestAnimationFrame(gameLoop);
        }
    }
    
    // Laser system functions
    function generateLaser() {
        // Random height between ground and sky
        const minY = FLOOR_HEIGHT + 50;
        const maxY = FLOOR_HEIGHT + 350;
        const laserY = Math.random() * (maxY - minY) + minY;
        
        // Spawn from right side, shoot left
        const laser = {
            x: positionX + window.innerWidth + 50, // Position relative to bull's world position
            y: laserY,
            width: LASER_WIDTH,
            height: LASER_HEIGHT,
            element: null,
            createdAt: Date.now()
        };
        
        laser.element = createLaserElement(laser);
        lasers.push(laser);
        
        // Test laser generation
        if (lasers.length <= 5) {
            console.log('Generated laser #' + lasers.length + ' at X:', laser.x);
        }
    }
    
    function createLaserElement(laser) {
        const laserDiv = document.createElement('div');
        laserDiv.className = 'laser';
        laserDiv.style.width = laser.width + 'px';
        laserDiv.style.height = laser.height + 'px';
        laserDiv.style.position = 'absolute';
        laserDiv.style.pointerEvents = 'none';
        laserDiv.style.display = 'block';
        laserDiv.style.visibility = 'visible';
        laserDiv.style.opacity = '1';
        laserDiv.style.zIndex = '150';
        
        // Add collision box visualization (temporary debug) - smaller collision area
        const collisionDiv = document.createElement('div');
        collisionDiv.style.position = 'absolute';
        collisionDiv.style.width = '150px'; // Collision width
        collisionDiv.style.height = '4px'; // Much smaller collision height (30% of 15px = 4.5px)
        collisionDiv.style.background = 'rgba(255, 255, 0, 0.5)'; // More visible yellow
        collisionDiv.style.border = '1px solid yellow';
        collisionDiv.style.left = '25px'; // Center it within the 200px laser (200-150)/2 = 25
        collisionDiv.style.top = '5.5px'; // Position at 30% up from bottom (15 * 0.3 = 4.5, so 5.5px from top)
        collisionDiv.style.pointerEvents = 'none';
        collisionDiv.style.zIndex = '151';
        laserDiv.appendChild(collisionDiv);
        
        gameContainer.appendChild(laserDiv);
        // Removed laser creation logging to prevent freezing
        return laserDiv;
    }
    
    function updateLasers() {
        // Spawn with grace period and cap count
        if (gameActive && Date.now() - gameStartTime > LASER_SPAWN_GRACE_MS) {
          if (positionX > nextLaserSpawn && lasers.length < MAX_LARGE_LASERS) {
            generateLaser();
            // fewer spawns: increase gap
            nextLaserSpawn = positionX + 1200 + Math.random() * 800;
          }
        }
        
        for (let i = lasers.length - 1; i >= 0; i--) {
          const laser = lasers[i];

          // World -> screen with bull centered; place by TOP-LEFT of the laser AABB
          const left = (window.innerWidth / 2) + (laser.x - positionX);
          const top  = window.innerHeight - (laser.y + laser.height);

          laser.element.style.left = left + 'px';
          laser.element.style.top  = top + 'px';
          laser.element.style.display = 'block';

          // Despawn far behind
          if (laser.x < positionX - 1000) {
            laser.element.remove();
            const box = document.getElementById(`laser-collision-${laser.x}`);
            if (box) box.remove();
            lasers.splice(i, 1);
          }
        }
      }

      // Small side lasers that shoot from screen edges
      function spawnSideLaser() {
        // Decide side
        const fromLeft = Math.random() < 0.5;
        // Aim approximately at bull's current chest height
        const targetY = Math.min(FLOOR_HEIGHT + 380, Math.max(FLOOR_HEIGHT + 50, positionY + (isDucking ? 50 : 90)));
        // Spawn just outside the current camera view in world coords
        const spawnX = fromLeft
          ? positionX - (window.innerWidth / 2) - 60
          : positionX + (window.innerWidth / 2) + 60;
        const vx = fromLeft ? SIDE_LASER_SPEED : -SIDE_LASER_SPEED;

        const laser = { x: spawnX, y: targetY, width: SIDE_LASER_WIDTH, height: SIDE_LASER_HEIGHT, vx, fromLeft, element: null };
        // Element
        const el = document.createElement('div');
        el.className = 'laser';
        el.style.position = 'absolute';
        el.style.width = laser.width + 'px';
        el.style.height = laser.height + 'px';
        el.style.zIndex = '155';
        el.style.pointerEvents = 'none';
        laser.element = el;
        gameContainer.appendChild(el);
        sideLasers.push(laser);
      }

      function updateSideLasers() {
        // Timed spawning
        const elapsedMs = gameActive ? (Date.now() - gameStartTime) : 0;
        const accel = 1 + Math.min(0.8, elapsedMs / 60000); // gentler: up to 1.8x by 60s
        if (gameActive && (Date.now() - gameStartTime) > LASER_SPAWN_GRACE_MS && Date.now() >= nextSideLaserAt) {
          if (sideLasers.length < MAX_SIDE_LASERS) {
            spawnSideLaser();
          }
          const delay = SIDE_LASER_MIN_MS + Math.random() * (SIDE_LASER_MAX_MS - SIDE_LASER_MIN_MS);
          nextSideLaserAt = Date.now() + delay;
        }

        for (let i = sideLasers.length - 1; i >= 0; i--) {
          const l = sideLasers[i];
          // Move with acceleration
          l.x += l.vx * accel;

          // Render (world -> screen)
          const left = (window.innerWidth / 2) + (l.x - positionX);
          const top  = window.innerHeight - (l.y + l.height);
          l.element.style.left = left + 'px';
          l.element.style.top  = top + 'px';

          // Despawn once far outside view window
          if (l.x < positionX - (window.innerWidth / 2) - 200 ||
              l.x > positionX + (window.innerWidth / 2) + 200) {
            l.element.remove();
            sideLasers.splice(i, 1);
          }
        }
      }
      
      
    
      function checkLaserCollisions() {
        // Bull AABB matches platform/bear logic
        const bullLeft   = positionX + 25;
        const bullRight  = positionX + 125;
        const bullBottom = positionY;
        const bullHeight = isDucking ? 80 : 140;
        const bullTop    = positionY + bullHeight;
      
        for (let i = 0; i < lasers.length; i++) {
          const laser = lasers[i];
      
          // Only check nearby lasers
          if (laser.x < positionX - 200 || laser.x > positionX + window.innerWidth + 200) continue;
      
          // Laser AABB with visual insets to match bright core (ignore glow/transparent ends)
          const laserLeft   = laser.x + LASER_HIT_INSET_L;
          const laserRight  = laser.x + laser.width - LASER_HIT_INSET_R;
          const laserBottom = laser.y;                 // bottom in world coords
          const laserTop    = laser.y + laser.height;  // top in world coords
      
          const horizontalOverlap = (bullRight > laserLeft) && (bullLeft < laserRight);
          const verticalOverlap   = (bullBottom < laserTop) && (bullTop > laserBottom);
      
          if (horizontalOverlap && verticalOverlap) {
            gameActive = false;
            gameRunning = false;
            gameEndReason = 'laser';
            sfx.laser();
            vibrate(30);
            showEndScreen();
            return;
          }
        }
      }

      function checkSideLaserCollisions() {
        const bullLeft   = positionX + 25;
        const bullRight  = positionX + 125;
        const bullBottom = positionY;
        const bullHeight = isDucking ? 80 : 140;
        const bullTop    = positionY + bullHeight;

        for (let i = 0; i < sideLasers.length; i++) {
          const l = sideLasers[i];
          const left = l.x;
          const right = l.x + l.width;
          const bottom = l.y;
          const top = l.y + l.height;
          const h = (bullRight > left) && (bullLeft < right);
          const v = (bullBottom < top) && (bullTop > bottom);
          if (h && v) {
            gameActive = false;
            gameRunning = false;
            gameEndReason = 'laser';
            sfx.laser();
            vibrate(30);
            showEndScreen();
            return;
          }
        }
      }
      
    
    
    
    
    
    function showEndScreen() {
        // Show end screen with final score
        document.getElementById('final-bear-count').textContent = bearsEaten;
        
        // Update title and reason based on how the game ended
        const titleElement = document.getElementById('game-over-title');
        const reasonElement = document.getElementById('death-reason');
        
        if (gameEndReason === 'laser') {
            titleElement.textContent = 'You Were Zapped!';
            titleElement.style.color = '#ff4444';
            reasonElement.textContent = 'A red laser took you down!';
            reasonElement.style.color = '#ff4444';
        } else {
            titleElement.textContent = 'Time\'s Up!';
            titleElement.style.color = '#00d4ff';
            reasonElement.textContent = 'You survived the full 30 seconds!';
            reasonElement.style.color = '#00d4ff';
        }
        
        document.getElementById('end-screen').style.display = 'flex';
        document.getElementById('game-container').style.display = 'none';
        
        // Remove game UI
        const gameUI = document.getElementById('game-ui');
        if (gameUI) {
            gameUI.remove();
        }
    }
    
    function restartGame() {
        // Hide end screen and restart
        document.getElementById('end-screen').style.display = 'none';
        
        // Reset movement flags before restarting
        isMovingLeft = false;
        isMovingRight = false;
        
        startGame();
    }
    
    function returnToMainMenu() {
        // Hide end screen and show start screen
        document.getElementById('end-screen').style.display = 'none';
        document.getElementById('game-container').style.display = 'none';
        document.getElementById('start-screen').style.display = 'flex';
        // Restore scrolling
        document.body.style.overflow = '';
        
        // Remove game UI if it exists
        const gameUI = document.getElementById('game-ui');
        if (gameUI) {
            gameUI.remove();
        }
        
        // Clean up all game elements
        platforms.forEach(platform => platform.element.remove());
        bears.forEach(bear => bear.element.remove());
        lasers.forEach(laser => {
            laser.element.remove();
            // Also remove collision visualizations
            let collisionBox = document.getElementById(`laser-collision-${laser.x}`);
            if (collisionBox) {
                collisionBox.remove();
            }
        });
        platforms = [];
        bears = [];
        lasers = [];
        // Clear side lasers
        for (const l of sideLasers) { if (l.element) l.element.remove(); }
        sideLasers = [];

        resetSpeedBoost();
        
        // Remove bull collision box
        let bullCollisionBox = document.getElementById('bull-collision-debug');
        if (bullCollisionBox) {
            bullCollisionBox.remove();
        }
        
        // Reset game state
        gameRunning = false;
        gameActive = false;
        isMovingLeft = false;
        isMovingRight = false;
    }
    
    // End screen button event listeners
    document.getElementById('restart-button').addEventListener('click', restartGame);
    document.getElementById('main-menu-button').addEventListener('click', returnToMainMenu);
    
    // Keyboard shortcuts for end screen
    document.addEventListener('keydown', (event) => {
        // Only process end screen shortcuts when end screen is visible
        if (document.getElementById('end-screen').style.display === 'flex') {
            if (event.code === 'KeyR') {
                restartGame();
            } else if (event.code === 'KeyM') {
                returnToMainMenu();
            }
        }
    });
    
    // Don't start the game automatically - wait for button click
});

