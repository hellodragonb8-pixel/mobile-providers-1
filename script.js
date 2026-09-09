const AUTOPLAY_RESUME_DELAY = 3000;

const themeToggle = document.querySelector(".theme-toggle");
const themeToggleLabel = document.querySelector(".theme-toggle__label");
const viewport = document.querySelector(".carousel__viewport");
const track = document.querySelector(".carousel__track");
const carousel = document.querySelector(".carousel");
const pagination = document.querySelector(".carousel__pagination");
const autoplayToggle = document.querySelector(".autoplay-toggle");
const announcement = document.querySelector("[aria-live]");
const cards = [...document.querySelectorAll(".provider-card")];
const dots = [...document.querySelectorAll(".pagination-dot")];
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const pauseReasons = new Set();

let activeIndex = 0;
let pointerStartX = null;
let pointerStartTime = null;
let dragStartPosition = 0;
let isLooping = false;
let resumeTimer = null;

function updateThemeToggle() {
  const currentTheme = document.documentElement.dataset.theme;
  const nextTheme = currentTheme === "light" ? "dark" : "light";
  const label = `Switch to ${nextTheme} theme`;
  document.querySelector('meta[name="theme-color"]:not([media])')?.remove();
  const themeColor = document.createElement("meta");
  themeColor.name = "theme-color";
  themeColor.content = currentTheme === "light" ? "#f9fbfd" : "#0c0e0f";
  document.head.append(themeColor);
  themeToggle.setAttribute("aria-label", label);
  themeToggleLabel.textContent = label;
}

themeToggle.addEventListener("click", () => {
  const nextTheme = document.documentElement.dataset.theme === "light" ? "dark" : "light";
  document.documentElement.dataset.theme = nextTheme;
  localStorage.setItem("subscription-theme", nextTheme);
  updateThemeToggle();
});

updateThemeToggle();

function createClone(card) {
  const clone = document.createElement("div");
  clone.className = card.className;
  clone.innerHTML = card.innerHTML;
  clone.setAttribute("aria-hidden", "true");
  return clone;
}

track.prepend(createClone(cards.at(-1)));
track.append(createClone(cards[0]));

function cardStep() {
  const styles = getComputedStyle(track);
  return cards[0].getBoundingClientRect().width + Number.parseFloat(styles.columnGap);
}

function setTrackPosition(position, animate = true, duration = 900) {
  track.classList.toggle("carousel__track--instant", !animate);
  track.style.transitionDuration = `${duration}ms`;
  track.style.transform = `translateX(${-position * cardStep()}px)`;

  if (!animate) {
    track.getBoundingClientRect();
    track.classList.remove("carousel__track--instant");
  }
}

function restartProgress() {
  if (reducedMotion.matches || pauseReasons.has("user")) {
    return;
  }

  carousel.dataset.playing = "false";
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      carousel.dataset.playing = "true";
    });
  });
}

function updatePausedState() {
  carousel.dataset.paused = String(pauseReasons.size > 0);
}

function setPaused(reason, isPaused) {
  if (isPaused) {
    pauseReasons.add(reason);
  } else {
    pauseReasons.delete(reason);
  }
  updatePausedState();
}

function updateSlideState(announce = false) {
  const focusedCard = cards.find((card) => card.contains(document.activeElement));
  if (focusedCard && focusedCard !== cards[activeIndex]) {
    document.activeElement.blur();
  }

  cards.forEach((card, cardIndex) => {
    const isActive = cardIndex === activeIndex;
    card.setAttribute("aria-hidden", String(!isActive));
    card.tabIndex = isActive ? 0 : -1;
  });

  dots.forEach((dot, dotIndex) => {
    if (dotIndex === activeIndex) {
      dot.setAttribute("aria-current", "true");
    } else {
      dot.removeAttribute("aria-current");
    }
  });

  if (announce) {
    const name = cards[activeIndex].querySelector(".provider-card__name").textContent;
    announcement.textContent = `${name}, slide ${activeIndex + 1} of ${cards.length}`;
  }
}

function selectCard(index, { restart = true, announce = true, duration = 900 } = {}) {
  const loopForward = activeIndex === cards.length - 1 && index >= cards.length;
  const loopBackward = activeIndex === 0 && index < 0;

  activeIndex = (index + cards.length) % cards.length;
  isLooping = loopForward || loopBackward;

  const position = loopForward ? cards.length + 1 : loopBackward ? 0 : activeIndex + 1;
  setTrackPosition(position, true, duration);
  updateSlideState(announce);

  if (restart) {
    restartProgress();
  }
}

function pauseAfterInteraction() {
  window.clearTimeout(resumeTimer);
  setPaused("interaction", true);
  restartProgress();

  resumeTimer = window.setTimeout(() => {
    setPaused("interaction", false);
    restartProgress();
  }, AUTOPLAY_RESUME_DELAY);
}

function finishDrag(event) {
  if (pointerStartX === null) {
    return;
  }

  const distance = event.clientX - pointerStartX;
  const elapsed = performance.now() - pointerStartTime;
  const velocity = Math.abs(distance) / Math.max(elapsed, 1);
  pointerStartX = null;
  pointerStartTime = null;
  viewport.dataset.dragging = "false";
  track.classList.remove("carousel__track--instant");

  if (viewport.hasPointerCapture(event.pointerId)) {
    viewport.releasePointerCapture(event.pointerId);
  }

  const threshold = Math.min(48, cards[0].getBoundingClientRect().width * 0.15);
  const shouldAdvance = event.type !== "pointercancel" && (Math.abs(distance) >= threshold || velocity >= 0.5);
  if (shouldAdvance) {
    const remainingDistance = Math.max(0, cardStep() - Math.abs(distance));
    const duration = Math.max(350, Math.round(900 * (remainingDistance / cardStep())));
    selectCard(activeIndex + (distance < 0 ? 1 : -1), { duration });
  } else {
    const duration = Math.max(220, Math.round(900 * (Math.abs(distance) / cardStep())));
    setTrackPosition(activeIndex + 1, true, duration);
    restartProgress();
  }

  pauseAfterInteraction();
}

track.addEventListener("transitionend", (event) => {
  if (!isLooping || event.propertyName !== "transform") {
    return;
  }

  isLooping = false;
  setTrackPosition(activeIndex + 1, false);
});

dots.forEach((dot, index) => {
  dot.addEventListener("click", () => {
    selectCard(index);
    pauseAfterInteraction();
  });
});

autoplayToggle.addEventListener("click", () => {
  const shouldPause = !pauseReasons.has("user");
  setPaused("user", shouldPause);
  autoplayToggle.setAttribute("aria-pressed", String(shouldPause));
  autoplayToggle.setAttribute("aria-label", shouldPause ? "Start autoplay" : "Stop autoplay");

  if (!shouldPause) {
    restartProgress();
  }
});

viewport.addEventListener("pointerdown", (event) => {
  if (event.button !== 0 || isLooping) {
    return;
  }

  window.clearTimeout(resumeTimer);
  setPaused("interaction", true);
  pointerStartX = event.clientX;
  pointerStartTime = performance.now();
  dragStartPosition = -(activeIndex + 1) * cardStep();
  viewport.dataset.dragging = "true";
  track.classList.add("carousel__track--instant");
  viewport.setPointerCapture(event.pointerId);
});

viewport.addEventListener("pointermove", (event) => {
  if (pointerStartX === null) {
    return;
  }

  const distance = event.clientX - pointerStartX;
  track.style.transform = `translateX(${dragStartPosition + distance}px)`;
});

viewport.addEventListener("pointerup", finishDrag);
viewport.addEventListener("pointercancel", finishDrag);

pagination.addEventListener("animationend", (event) => {
  if (event.animationName === "autoplay-progress") {
    selectCard(activeIndex + 1);
  }
});

carousel.addEventListener("mouseenter", () => setPaused("hover", true));
carousel.addEventListener("mouseleave", () => setPaused("hover", false));
carousel.addEventListener("focusin", (event) => {
  if (event.target.matches(":focus-visible")) {
    setPaused("focus", true);
  }
});
carousel.addEventListener("focusout", (event) => {
  if (!carousel.contains(event.relatedTarget)) {
    setPaused("focus", false);
  }
});

document.addEventListener("visibilitychange", () => {
  setPaused("hidden", document.hidden);
});

reducedMotion.addEventListener("change", () => {
  carousel.dataset.playing = String(!reducedMotion.matches && !pauseReasons.has("user"));
});

window.addEventListener("resize", () => setTrackPosition(activeIndex + 1, false));

setTrackPosition(1, false);
updateSlideState();
carousel.dataset.paused = "false";
carousel.dataset.playing = String(!reducedMotion.matches);
