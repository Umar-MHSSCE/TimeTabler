document.addEventListener("DOMContentLoaded", () => {
    const cube = document.querySelector(".cube");
    let isPointerDown = false;
    let startX, startY;
    let currentX = 0;
    let currentY = 0;
    let resumeTimer = null;  // timer to auto-resume rotation after user lifts finger

    // ── DETECT TOUCH DEVICE ──────────────────────────────────────
    const isTouchDevice = () => window.matchMedia("(pointer: coarse)").matches;

    // ── HELPER: get X/Y from either mouse or touch event ─────────
    function getXY(e) {
        if (e.touches && e.touches.length > 0) {
            return { x: e.touches[0].clientX, y: e.touches[0].clientY };
        }
        return { x: e.clientX, y: e.clientY };
    }

    // ── START AUTO-ROTATION ───────────────────────────────────────
    function startRotation() {
        currentX = 0;
        currentY = 0;
        cube.style.transform = "";
        cube.style.animation = "rotate-cube 30s ease-in-out infinite";
    }

    // ── STOP AUTO-ROTATION ────────────────────────────────────────
    function stopRotation() {
        clearTimeout(resumeTimer);  // cancel any pending resume
        cube.style.animation = "none";
    }

    // ── POINTER DOWN (mouse + touch) ──────────────────────────────
    function onPointerDown(e) {
        isPointerDown = true;
        clearTimeout(resumeTimer);  // user touched again, cancel scheduled resume

        const pos = getXY(e);
        startX = pos.x;
        startY = pos.y;
        cube._dragStartX = pos.x;
        cube._dragStartY = pos.y;
        cube._didDrag = false;

        stopRotation();
        cube.style.cursor = "grabbing";
    }

    // ── POINTER MOVE (mouse + touch) ──────────────────────────────
    function onPointerMove(e) {
        if (!isPointerDown) return;

        // Stop page from scrolling while rotating the cube on mobile
        if (e.cancelable) e.preventDefault();

        const pos = getXY(e);
        const deltaX = pos.x - startX;
        const deltaY = pos.y - startY;

        // Mark as drag if moved more than 5px
        const totalDeltaX = pos.x - cube._dragStartX;
        const totalDeltaY = pos.y - cube._dragStartY;
        if (Math.abs(totalDeltaX) > 5 || Math.abs(totalDeltaY) > 5) {
            cube._didDrag = true;
        }

        currentX += deltaY;
        currentY += deltaX;
        cube.style.transform = `rotateX(${-currentX}deg) rotateY(${currentY}deg)`;

        startX = pos.x;
        startY = pos.y;
    }

    // ── POINTER UP / END (mouse + touch) ──────────────────────────
    function onPointerUp() {
        if (!isPointerDown) return;
        isPointerDown = false;
        cube.style.cursor = "grab";

        // Schedule auto-resume 7 seconds after user lifts finger/mouse
        resumeTimer = setTimeout(() => {
            startRotation();
        }, 7000);
    }

    // ── MOUSE EVENTS (desktop) ────────────────────────────────────
    cube.addEventListener("mousedown", onPointerDown);
    document.addEventListener("mousemove", onPointerMove);
    document.addEventListener("mouseup", onPointerUp);

    // ── TOUCH EVENTS (mobile) ─────────────────────────────────────
    cube.addEventListener("touchstart", onPointerDown, { passive: true });
    document.addEventListener("touchmove", onPointerMove, { passive: false });
    document.addEventListener("touchend", onPointerUp);

    // ── DESKTOP: also resume when mouse leaves the container ──────
    const cubeContainer = document.querySelector(".cube-container");
    if (cubeContainer) {
        cubeContainer.addEventListener("mouseleave", () => {
            if (!isPointerDown) {
                clearTimeout(resumeTimer);
                startRotation();
            }
        });
    }
});