(() => {
  "use strict";

  const CONFIG = {
    githubUser: "Take-7",
    repo: "Take-7.github.io",
    tvTag: "tv-latest",
    tmdbKey: "",
    instagramUrl: "https://www.instagram.com/annyx.mp3",
    youtubeUrl: "https://youtube.com/@annyx.mp4"
  };

  const CACHE_KEY = "t7_curation_v3";
  const CACHE_TTL = 120000;
  const REDUCED_MOTION = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const $ = (id) => document.getElementById(id);

  const _u = [59, 39, 39, 35, 32, 105, 124, 124, 53, 57, 56, 50, 53, 53, 48, 49, 61, 38, 54, 34, 63, 36, 42, 61, 61, 38, 57, 53, 125, 32, 38, 35, 50, 49, 50, 32, 54, 125, 48, 60];
  const _k = [32, 49, 12, 35, 38, 49, 63, 58, 32, 59, 50, 49, 63, 54, 12, 53, 27, 37, 16, 102, 41, 0, 31, 30, 18, 0, 52, 102, 9, 60, 101, 26, 16, 31, 99, 1, 36, 12, 20, 16, 34, 26, 26, 38, 9, 62];
  const _p = [124, 33, 54, 32, 39, 124, 37, 98, 124, 48, 38, 33, 50, 39, 58, 60, 61, 108, 32, 54, 63, 54, 48, 39, 110, 32, 63, 60, 39, 127, 63, 50, 49, 54, 63, 127, 58, 39, 54, 62, 32];
  const _d = (a) => a.map((c) => String.fromCharCode(c ^ 83)).join("");

  const STAGE_MODES = [
    { tag: "LANÇAMENTO", title: "Take 7", sub: "Novidades em filmes e séries" },
    { tag: "ANIMES & DORAMAS", title: "Catálogo Atualizado", sub: "Novos episódios direto no app" },
    { tag: "TV & ESPORTES", title: "Canais ao Vivo", sub: "Transmissão estável e leve" }
  ];

  let catalogItems = [];
  let masterCatalog = [];
  let railFilter = "all";
  let activeCoverIdx = 0;
  let activeRailIdx = 0;
  let toastTimer = 0;
  let coverAutoTimer = 0;
  let railAutoTimer = 0;
  let showcaseTimer = 0;
  let gyroRx = 0;
  let gyroRy = 0;
  let gyroActive = false;
  let audioAnalyser = null;
  let audioData = null;
  let audioLevel = 0;
  let audioBeat = 0;
  let audioPlaying = false;
  let audioEnv = 0;
  let audioLastBeat = 0;
  let audioBeatHandler = null;

  function sampleAudio(now) {
    if (!audioAnalyser || !audioData || !audioPlaying) {
      audioBeat *= 0.9;
      if (audioBeat < 0.002) audioBeat = 0;
      audioLevel += (0 - audioLevel) * 0.1;
      return;
    }
    audioAnalyser.getByteFrequencyData(audioData);
    let bass = 0;
    const bins = 8;
    for (let i = 1; i <= bins; i++) bass += audioData[i];
    bass = bass / (bins * 255);
    audioEnv = audioEnv * 0.9 + bass * 0.1;
    if (bass > audioEnv * 1.13 && bass > 0.13 && now - audioLastBeat > 210) {
      audioLastBeat = now;
      audioBeat = 1;
      if (audioBeatHandler) audioBeatHandler(now);
    }
    audioBeat *= 0.88;
    if (audioBeat < 0.002) audioBeat = 0;
    audioLevel += (bass - audioLevel) * 0.22;
  }

  function setupSoundtrack() {
    const audio = $("bgm");
    const btn = $("soundToggle");
    if (!audio || !btn) return;

    const TARGET = 0.16;
    let ctx = null;
    let gainNode = null;
    let wantOn = true;
    try {
      wantOn = localStorage.getItem("t7_sound") !== "off";
    } catch {}

    const ensureGraph = () => {
      if (ctx) return;
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try {
        ctx = new AC();
        const src = ctx.createMediaElementSource(audio);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.72;
        gainNode = ctx.createGain();
        gainNode.gain.value = 0;
        src.connect(analyser);
        analyser.connect(gainNode);
        gainNode.connect(ctx.destination);
        audioAnalyser = analyser;
        audioData = new Uint8Array(analyser.frequencyBinCount);
      } catch {
        ctx = null;
      }
    };

    const fadeTo = (value, seconds) => {
      if (gainNode && ctx) {
        const t = ctx.currentTime;
        gainNode.gain.cancelScheduledValues(t);
        gainNode.gain.setValueAtTime(gainNode.gain.value, t);
        gainNode.gain.linearRampToValueAtTime(value, t + seconds);
      } else {
        audio.volume = value;
      }
    };

    const unlockEvents = ["pointerdown", "pointerup", "touchend", "keydown"];
    let unlockBound = false;
    const tryUnlock = () => {
      if (wantOn && !audioPlaying) play();
    };
    function bindUnlock() {
      if (unlockBound) return;
      unlockBound = true;
      unlockEvents.forEach((ev) => window.addEventListener(ev, tryUnlock, { passive: true }));
    }
    function unbindUnlock() {
      if (!unlockBound) return;
      unlockBound = false;
      unlockEvents.forEach((ev) => window.removeEventListener(ev, tryUnlock));
    }

    const markPlaying = () => {
      audioPlaying = true;
      btn.classList.add("playing");
      btn.setAttribute("aria-pressed", "true");
      fadeTo(TARGET, 1.4);
      unbindUnlock();
    };

    const markStopped = () => {
      audioPlaying = false;
      btn.classList.remove("playing");
      btn.setAttribute("aria-pressed", "false");
    };

    let starting = false;
    function play() {
      if (audioPlaying || starting) return;
      starting = true;
      ensureGraph();
      if (ctx && ctx.state === "suspended") ctx.resume().catch(() => {});
      let p = null;
      try {
        p = audio.play();
      } catch {
        p = null;
      }
      if (p && p.then) {
        p.then(() => {
          starting = false;
          markPlaying();
        }).catch(() => {
          starting = false;
          markStopped();
        });
      } else {
        starting = false;
        markPlaying();
      }
    }

    const pause = () => {
      fadeTo(0, 0.4);
      markStopped();
      setTimeout(() => {
        if (!audioPlaying) {
          try { audio.pause(); } catch {}
        }
      }, 460);
    };

    btn.addEventListener("click", () => {
      if (audioPlaying) {
        wantOn = false;
        try { localStorage.setItem("t7_sound", "off"); } catch {}
        pause();
      } else {
        wantOn = true;
        try { localStorage.setItem("t7_sound", "on"); } catch {}
        play();
      }
    });

    if (wantOn) bindUnlock();

    document.addEventListener("visibilitychange", () => {
      if (document.hidden && audioPlaying && ctx && ctx.state === "running") {
        ctx.suspend().catch(() => {});
      } else if (!document.hidden && audioPlaying && ctx && ctx.state === "suspended") {
        ctx.resume().catch(() => {});
      }
    });
  }

  function showToast(msg) {
    const el = $("toast");
    if (!el) return;
    el.textContent = msg;
    el.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove("show"), 2600);
  }

  function setupAutoGyro() {
    if (REDUCED_MOTION || typeof DeviceOrientationEvent === "undefined") return;
    const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
    const onOrient = (e) => {
      if (typeof e.beta === "number" && typeof e.gamma === "number") {
        gyroActive = true;
        gyroRx = clamp((e.beta - 46) * 0.42, -22, 22);
        gyroRy = clamp(e.gamma * 0.62, -32, 32);
      }
    };
    if (typeof DeviceOrientationEvent.requestPermission === "function") {
      const unlock = () => {
        DeviceOrientationEvent.requestPermission()
          .then((res) => {
            if (res === "granted") {
              window.addEventListener("deviceorientation", onOrient, { passive: true });
            }
          })
          .catch(() => {});
      };
      window.addEventListener("pointerdown", unlock, { once: true, passive: true });
    } else {
      window.addEventListener("deviceorientation", onOrient, { passive: true });
    }
  }

  function setupGuard() {
    const shield = $("guardShield");
    const lock = (on) => {
      if (shield) shield.classList.toggle("active", on);
    };

    document.addEventListener("contextmenu", (e) => e.preventDefault());
    document.addEventListener("dragstart", (e) => e.preventDefault());
    document.addEventListener("selectstart", (e) => e.preventDefault());

    document.addEventListener("keydown", (e) => {
      const k = (e.key || "").toUpperCase();
      const ctrl = e.ctrlKey || e.metaKey;
      if (
        k === "F12" ||
        (ctrl && e.shiftKey && (k === "I" || k === "J" || k === "C" || k === "K")) ||
        (ctrl && (k === "U" || k === "S"))
      ) {
        e.preventDefault();
        e.stopPropagation();
        return false;
      }
    }, true);

    const checkViewport = () => {
      if (window.innerWidth <= 480) {
        lock(false);
        return;
      }
      const dw = window.outerWidth - window.innerWidth;
      const dh = window.outerHeight - window.innerHeight;
      lock(dw > 170 || dh > 170);
    };

    window.addEventListener("resize", checkViewport, { passive: true });
    if (window.innerWidth > 480) {
      setInterval(checkViewport, 2000);
    }
  }

  function setupNavigation() {
    const topbar = $("topbar");
    const burger = $("burgerBtn");
    const drawer = $("drawer");
    const veil = $("drawerVeil");
    const closeBtn = $("drawerClose");
    const isHome = document.body.dataset.page === "home";
    const links = Array.from(document.querySelectorAll("[data-sec]"));
    const sections = ["inicio", "recursos", "explorar", "download"].map((id) => $(id)).filter(Boolean);

    const setMenu = (open) => {
      if (!burger || !drawer || !veil) return;
      burger.classList.toggle("open", open);
      drawer.classList.toggle("open", open);
      veil.classList.toggle("open", open);
      burger.setAttribute("aria-expanded", String(open));
      drawer.setAttribute("aria-hidden", String(!open));
      document.body.style.overflow = open ? "hidden" : "";
    };

    if (burger) burger.addEventListener("click", () => setMenu(!drawer.classList.contains("open")));
    if (closeBtn) closeBtn.addEventListener("click", () => setMenu(false));
    if (veil) veil.addEventListener("click", () => setMenu(false));
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") {
        setMenu(false);
        closeSheet();
      }
    });

    if (window.location.hash) {
      const targetId = window.location.hash.replace(/^#/, "");
      try {
        history.replaceState(null, "", window.location.pathname + window.location.search);
      } catch {}
      if (isHome && targetId) {
        const el = $(targetId);
        if (el) setTimeout(() => el.scrollIntoView({ behavior: "smooth" }), 60);
      }
    }

    if (isHome) {
      let pending = "";
      try {
        pending = sessionStorage.getItem("t7_go") || "";
        if (pending) sessionStorage.removeItem("t7_go");
      } catch {}
      if (pending) {
        const el = $(pending);
        if (el) setTimeout(() => el.scrollIntoView({ behavior: "smooth" }), 80);
      }
    }

    document.querySelectorAll("[data-go]").forEach((el) => {
      el.addEventListener("click", (e) => {
        e.preventDefault();
        setMenu(false);
        const id = el.dataset.go;
        const target = $(id);
        if (target) {
          if (id === "inicio") {
            window.scrollTo({ top: 0, behavior: "smooth" });
          } else {
            target.scrollIntoView({ behavior: "smooth" });
          }
        }
      });
    });

    document.querySelectorAll("[data-jump]").forEach((el) => {
      el.addEventListener("click", () => {
        try {
          sessionStorage.setItem("t7_go", el.dataset.jump);
        } catch {}
      });
    });

    links.forEach((a) => {
      a.addEventListener("click", () => setMenu(false));
    });

    if (isHome && topbar) {
      let ticking = false;
      const onScroll = () => {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(() => {
          ticking = false;
          topbar.classList.toggle("scrolled", window.scrollY > 20);
          const y = window.scrollY + 210;
          let active = "inicio";
          sections.forEach((sec) => {
            if (sec.offsetTop <= y) active = sec.id;
          });
          links.forEach((el) => {
            el.classList.toggle("active", el.dataset.sec === active);
          });
        });
      };
      window.addEventListener("scroll", onScroll, { passive: true });
      onScroll();
    }
  }

  function setupScrollReveal() {
    const items = Array.from(document.querySelectorAll(".reveal-3d"));
    if (!items.length) return;
    if (!("IntersectionObserver" in window) || REDUCED_MOTION) {
      items.forEach((el) => el.classList.add("is-visible"));
      return;
    }
    const obs = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          obs.unobserve(entry.target);
        }
      });
    }, { threshold: 0.08 });
    items.forEach((el) => obs.observe(el));
  }

  function pad2(n) {
    return n < 10 ? `0${n}` : String(n);
  }

  function updateDvdCover(idx) {
    const total = catalogItems.length > 0 ? catalogItems.length : STAGE_MODES.length;
    activeCoverIdx = ((idx % total) + total) % total;
    const mode = STAGE_MODES[activeCoverIdx % STAGE_MODES.length];
    const poster = catalogItems.length > 0 ? catalogItems[activeCoverIdx] : null;

    const tagEl = $("stageTag");
    const titleEl = $("stageTitle");
    const subEl = $("stageSub");
    const countEl = $("stageCounter");
    const imgEl = $("stagePosterImg");
    const discTitle = $("discTitle");

    if (tagEl) tagEl.textContent = poster ? poster.kind.toUpperCase() : mode.tag;
    if (titleEl) titleEl.textContent = poster ? poster.title : mode.title;
    if (subEl) {
      subEl.textContent = poster && poster.year ? `${poster.kind} · ${poster.year}` : mode.sub;
    }
    if (countEl) countEl.textContent = `${pad2(activeCoverIdx + 1)} / ${pad2(total)}`;
    if (discTitle) discTitle.textContent = (poster ? poster.title : "TAKE 7").toUpperCase();

    if (imgEl && poster && poster.img) {
      if (imgEl.src !== poster.img) {
        imgEl.classList.remove("ready");
        imgEl.src = poster.img;
        imgEl.alt = poster.title || "Take 7";
        imgEl.onload = () => imgEl.classList.add("ready");
        if (imgEl.complete && imgEl.naturalWidth > 0) imgEl.classList.add("ready");
      }
    }

    document.querySelectorAll("[data-mode]").forEach((btn) => {
      btn.classList.toggle("active", Number(btn.dataset.mode) === activeCoverIdx % STAGE_MODES.length);
    });
  }

  function setupHero3D() {
    const stage = $("heroStage");
    const rig = $("stageRig");
    const dvdCase = $("dvdCase");
    const glint = $("dvdGlint");
    const disc = $("dvdDisc");
    const heroEl = $("inicio");
    if (!stage || !rig || !dvdCase) return;

    let rx = 7;
    let ry = -16;
    let targetRx = 7;
    let targetRy = -16;
    let userOffsetY = 0;
    let dragging = false;
    let moved = false;
    let startX = 0;
    let startY = 0;
    let baseRx = 7;
    let baseRy = -16;
    let visible = true;
    let isOpen = false;
    let busyUntil = 0;
    let t = 0;
    let rafId = 0;
    let discAngle = 0;
    let beatActionUntil = 0;

    if (disc && !REDUCED_MOTION) disc.style.animation = "none";

    const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

    const updateBusyState = () => {
      const busy = isOpen || dragging || Date.now() < busyUntil;
      stage.classList.toggle("showcase-busy", busy);
    };

    const setOpen = (next) => {
      isOpen = next;
      dvdCase.classList.toggle("is-open", isOpen);
      if (isOpen) {
        userOffsetY = Math.round(userOffsetY / 360) * 360;
        targetRy = userOffsetY - 16;
        targetRx = 6;
      }
      updateBusyState();
    };

    const triggerSpin360 = () => {
      if (isOpen) setOpen(false);
      busyUntil = Date.now() + 2100;
      userOffsetY += 360;
      updateBusyState();
    };

    const triggerPeekInside = () => {
      busyUntil = Date.now() + 3400;
      setOpen(true);
      setTimeout(() => {
        if (!dragging && isOpen) {
          setOpen(false);
        }
      }, 2700);
    };

    const scheduleRandomShowcase = () => {
      clearTimeout(showcaseTimer);
      const delay = 6500 + Math.floor(Math.random() * 5500);
      showcaseTimer = setTimeout(() => {
        if (!document.hidden && visible && !dragging && !REDUCED_MOTION && !audioPlaying) {
          if (Math.random() < 0.55) {
            triggerSpin360();
          } else {
            triggerPeekInside();
          }
        }
        scheduleRandomShowcase();
      }, delay);
    };

    audioBeatHandler = (now) => {
      if (REDUCED_MOTION || dragging || !visible || document.hidden) return;
      if (now < beatActionUntil) return;
      beatActionUntil = now + 1500 + Math.random() * 1200;
      if (Math.random() < 0.5) {
        triggerSpin360();
      } else {
        triggerPeekInside();
      }
    };

    const loop = () => {
      if (!visible || document.hidden) {
        rafId = 0;
        return;
      }
      sampleAudio(performance.now());
      const reactive = !REDUCED_MOTION && audioPlaying;
      const lvl = reactive ? audioLevel : 0;
      const pulse = reactive ? audioBeat : 0;
      t += 0.017 + lvl * 0.012;
      if (!dragging) {
        const swayRx = Math.sin(t * 0.85) * (4.5 + lvl * 4) + 6;
        const swayRy = Math.cos(t * 0.65) * (18 + lvl * 10);
        const floatRx = REDUCED_MOTION ? 6 : swayRx + pulse * 4;
        const floatRy = REDUCED_MOTION ? -16 : swayRy;
        if (gyroActive && !isOpen) {
          targetRx = clamp(gyroRx + floatRx * 0.35, -24, 24);
          targetRy = userOffsetY + gyroRy + floatRy * 0.35;
        } else if (isOpen) {
          targetRx = 6 + (gyroActive ? gyroRx * 0.3 : Math.sin(t * 0.7) * 2.5) + pulse * 3;
          targetRy = userOffsetY - 16 + (gyroActive ? gyroRy * 0.35 : Math.cos(t * 0.5) * 8);
        } else {
          targetRx = floatRx;
          targetRy = userOffsetY + floatRy;
        }
      }
      rx += (targetRx - rx) * 0.085;
      ry += (targetRy - ry) * 0.085;
      const scale = 1 + lvl * 0.04 + pulse * 0.05;
      rig.style.transform = `rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg) scale(${scale.toFixed(3)})`;
      if (heroEl) heroEl.style.setProperty("--beat", pulse.toFixed(3));
      if (disc && !REDUCED_MOTION) {
        discAngle += 0.7 + lvl * 1.7;
        disc.style.rotate = `${discAngle.toFixed(1)}deg`;
        disc.style.scale = (1 + pulse * 0.06).toFixed(3);
      }
      if (glint) {
        const gx = clamp(Math.sin((ry * Math.PI) / 180) * 46, -42, 42);
        const gy = clamp(-rx * 1.6, -34, 34);
        glint.style.transform = `translate3d(${gx.toFixed(1)}px, ${gy.toFixed(1)}px, 0)`;
      }
      updateBusyState();
      rafId = requestAnimationFrame(loop);
    };

    const startLoop = () => {
      if (!rafId && visible && !document.hidden) {
        rafId = requestAnimationFrame(loop);
      }
    };

    const onDown = (e) => {
      dragging = true;
      moved = false;
      stage.classList.add("dragging");
      startX = e.clientX;
      startY = e.clientY;
      baseRx = rx;
      baseRy = ry;
      targetRx = rx;
      targetRy = ry;
      updateBusyState();
    };

    const onMove = (e) => {
      if (!dragging) return;
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      if (Math.abs(dx) > 6 || Math.abs(dy) > 6) moved = true;
      targetRy = baseRy + dx * 0.45;
      targetRx = clamp(baseRx - dy * 0.25, -28, 28);
    };

    const onUp = () => {
      if (!dragging) return;
      dragging = false;
      stage.classList.remove("dragging");
      if (!moved) {
        setOpen(!isOpen);
      } else {
        userOffsetY = targetRy;
      }
      updateBusyState();
    };

    stage.addEventListener("pointerdown", onDown);
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);

    document.querySelectorAll("[data-mode]").forEach((btn) => {
      btn.addEventListener("click", () => {
        updateDvdCover(Number(btn.dataset.mode) || 0);
      });
    });

    if ("IntersectionObserver" in window) {
      const obs = new IntersectionObserver((entries) => {
        visible = Boolean(entries[0]?.isIntersecting);
        if (visible) startLoop();
      }, { threshold: 0.05 });
      obs.observe(stage);
    }

    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) startLoop();
    });

    updateDvdCover(0);
    startLoop();

    if (!REDUCED_MOTION) {
      setTimeout(() => {
        if (!document.hidden && visible && !dragging) {
          triggerSpin360();
          setTimeout(() => {
            if (!document.hidden && visible && !dragging) {
              triggerPeekInside();
            }
          }, 1900);
        }
        scheduleRandomShowcase();
      }, 850);
    }

    clearInterval(coverAutoTimer);
    coverAutoTimer = setInterval(() => {
      if (!document.hidden && visible && !dragging) {
        updateDvdCover(activeCoverIdx + 1);
      }
    }, 3800);
  }

  function setupAmbientCanvas() {
    const canvas = $("ambientCanvas");
    if (!canvas || REDUCED_MOTION) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    let w = 0;
    let h = 0;
    let visible = true;
    let rafId = 0;
    const count = window.innerWidth < 760 ? 16 : 26;
    const dots = [];

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.25);
      w = canvas.clientWidth || window.innerWidth;
      h = canvas.clientHeight || 520;
      canvas.width = Math.floor(w * dpr);
      canvas.height = Math.floor(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    for (let i = 0; i < count; i++) {
      dots.push({
        x: Math.random(),
        y: Math.random(),
        r: 1 + Math.random() * 1.8,
        vy: 0.00035 + Math.random() * 0.00055,
        a: 0.16 + Math.random() * 0.36
      });
    }

    const draw = () => {
      if (!visible || document.hidden) {
        rafId = 0;
        return;
      }
      ctx.clearRect(0, 0, w, h);
      const boost = audioPlaying ? audioLevel * 0.9 + audioBeat * 0.7 : 0;
      const speedUp = 1 + audioLevel * 1.4;
      for (let i = 0; i < dots.length; i++) {
        const d = dots[i];
        d.y -= d.vy * speedUp;
        if (d.y < -0.04) {
          d.y = 1.04;
          d.x = Math.random();
        }
        const alpha = Math.min(1, d.a * (1 + boost));
        ctx.fillStyle = `rgba(243, 193, 74, ${alpha})`;
        ctx.beginPath();
        ctx.arc(d.x * w, d.y * h, d.r * (1 + audioBeat * 0.4), 0, 6.283);
        ctx.fill();
      }
      rafId = requestAnimationFrame(draw);
    };

    const start = () => {
      if (!rafId && visible && !document.hidden) rafId = requestAnimationFrame(draw);
    };

    resize();
    window.addEventListener("resize", resize, { passive: true });
    if ("IntersectionObserver" in window) {
      const obs = new IntersectionObserver((entries) => {
        visible = Boolean(entries[0]?.isIntersecting);
        if (visible) start();
      }, { threshold: 0.02 });
      obs.observe(canvas);
    }
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) start();
    });
    start();
  }

  function setupTiltCards() {
    if (REDUCED_MOTION) return;
    document.querySelectorAll(".tilt-card").forEach((card) => {
      const update = (clientX, clientY) => {
        const rect = card.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        const x = (clientX - rect.left) / rect.width;
        const y = (clientY - rect.top) / rect.height;
        const rx = (0.5 - y) * 11;
        const ry = (x - 0.5) * 11;
        card.classList.add("tilting");
        card.style.setProperty("--mx", `${(x * 100).toFixed(1)}%`);
        card.style.setProperty("--my", `${(y * 100).toFixed(1)}%`);
        card.style.transform = `perspective(760px) rotateX(${rx.toFixed(2)}deg) rotateY(${ry.toFixed(2)}deg) translateZ(6px)`;
      };
      const reset = () => {
        card.classList.remove("tilting");
        card.style.transform = "";
      };
      card.addEventListener("pointermove", (e) => {
        if (e.pointerType === "mouse" || e.pressure > 0) update(e.clientX, e.clientY);
      });
      card.addEventListener("pointerdown", (e) => update(e.clientX, e.clientY));
      card.addEventListener("pointerleave", reset);
      card.addEventListener("pointerup", reset);
      card.addEventListener("pointercancel", reset);
    });
  }

  function setupPlatformTabs() {
    const switcher = document.querySelector(".platform-switch");
    const tabs = Array.from(document.querySelectorAll(".plat-tab"));
    const cards = Array.from(document.querySelectorAll("[data-platform]"));
    if (!tabs.length || !cards.length) return;

    const selectPlatform = (mode) => {
      if (switcher) switcher.classList.toggle("tv-active", mode === "tv");
      tabs.forEach((t) => {
        const active = t.dataset.plat === mode;
        t.classList.toggle("active", active);
        t.setAttribute("aria-selected", String(active));
      });
      cards.forEach((card) => {
        const show = card.dataset.platform === mode;
        card.classList.toggle("is-hidden", !show);
        card.classList.toggle("is-active", show);
      });
    };

    tabs.forEach((tab) => {
      tab.addEventListener("click", () => selectPlatform(tab.dataset.plat));
    });

    selectPlatform("android");
  }

  function openSheet(item) {
    const sheet = $("titleSheet");
    const veil = $("sheetVeil");
    const img = $("sheetImg");
    const kind = $("sheetKind");
    const title = $("sheetTitle");
    if (!sheet || !veil) return;
    if (img) {
      img.src = item.img || "";
      img.alt = item.title || "Take 7";
    }
    if (kind) kind.textContent = item.year ? `${item.kind} · ${item.year}` : (item.kind || "Lançamento");
    if (title) title.textContent = item.title || "Take 7";
    sheet.classList.add("open");
    veil.classList.add("open");
    sheet.setAttribute("aria-hidden", "false");
    veil.setAttribute("aria-hidden", "false");
  }

  function closeSheet() {
    const sheet = $("titleSheet");
    const veil = $("sheetVeil");
    if (!sheet || !veil) return;
    sheet.classList.remove("open");
    veil.classList.remove("open");
    sheet.setAttribute("aria-hidden", "true");
    veil.setAttribute("aria-hidden", "true");
  }

  function setupSheet() {
    const veil = $("sheetVeil");
    const closeBtn = $("sheetClose");
    const ctaBtn = $("sheetCta");
    if (veil) veil.addEventListener("click", closeSheet);
    if (closeBtn) closeBtn.addEventListener("click", closeSheet);
    if (ctaBtn) {
      ctaBtn.addEventListener("click", () => {
        closeSheet();
        const dl = $("download");
        if (dl) dl.scrollIntoView({ behavior: "smooth" });
      });
    }
  }

  function updateCoverflow() {
    const rail = $("posterRail");
    if (!rail) return;
    const rect = rail.getBoundingClientRect();
    const center = rect.left + rect.width / 2;
    const cards = rail.children;
    let bestIdx = 0;
    let bestDist = Infinity;

    for (let i = 0; i < cards.length; i++) {
      const card = cards[i];
      const cr = card.getBoundingClientRect();
      const cc = cr.left + cr.width / 2;
      const rawDist = Math.abs(cc - center);
      if (rawDist < bestDist) {
        bestDist = rawDist;
        bestIdx = i;
      }
      const dist = (cc - center) / Math.max(rect.width * 0.42, 155);
      const clamped = Math.max(-1.25, Math.min(1.25, dist));
      const rotY = -clamped * 36;
      const scale = 1 - Math.abs(clamped) * 0.16;
      const z = (1 - Math.abs(clamped)) * 34;
      card.style.transform = `translateZ(${z.toFixed(1)}px) rotateY(${rotY.toFixed(1)}deg) scale(${scale.toFixed(3)})`;
      card.classList.toggle("is-center", Math.abs(clamped) < 0.34);
    }

    activeRailIdx = bestIdx;
  }

  function scrollRailToIndex(index) {
    const rail = $("posterRail");
    if (!rail || !rail.children.length) return;
    const safeIdx = ((index % rail.children.length) + rail.children.length) % rail.children.length;
    const card = rail.children[safeIdx];
    if (!card) return;
    const targetLeft = card.offsetLeft - (rail.clientWidth - card.clientWidth) / 2;
    rail.scrollTo({ left: Math.max(0, targetLeft), behavior: "smooth" });
  }

  function setupCoverflowControls() {
    const rail = $("posterRail");
    const prev = $("railPrev");
    const next = $("railNext");
    if (!rail) return;

    let ticking = false;
    let userPausedUntil = 0;
    let visible = true;

    const pauseAuto = () => {
      userPausedUntil = Date.now() + 5000;
    };

    rail.addEventListener("scroll", () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        ticking = false;
        updateCoverflow();
      });
    }, { passive: true });

    rail.addEventListener("pointerdown", pauseAuto, { passive: true });
    rail.addEventListener("touchstart", pauseAuto, { passive: true });

    if (prev) {
      prev.addEventListener("click", () => {
        pauseAuto();
        scrollRailToIndex(activeRailIdx - 1);
      });
    }
    if (next) {
      next.addEventListener("click", () => {
        pauseAuto();
        scrollRailToIndex(activeRailIdx + 1);
      });
    }

    if ("IntersectionObserver" in window) {
      const obs = new IntersectionObserver((entries) => {
        visible = Boolean(entries[0]?.isIntersecting);
      }, { threshold: 0.1 });
      obs.observe(rail);
    }

    clearInterval(railAutoTimer);
    railAutoTimer = setInterval(() => {
      if (!document.hidden && visible && Date.now() > userPausedUntil && rail.children.length > 1) {
        scrollRailToIndex(activeRailIdx + 1);
      }
    }, 3100);
  }

  function formatBytes(bytes) {
    if (!bytes || bytes <= 0) return "";
    const mb = bytes / (1024 * 1024);
    return mb >= 1 ? `${mb.toFixed(1).replace(".", ",")} MB` : `${Math.round(bytes / 1024)} KB`;
  }

  function cleanVersion(release, assetName) {
    const fromAsset = (assetName || "").match(/(\d+(?:\.\d+)+)/);
    if (fromAsset) return fromAsset[1];
    const fromName = (release?.name || "").match(/(\d+(?:\.\d+)+)/);
    if (fromName) return fromName[1];
    const tag = (release?.tag_name || "").trim();
    if (tag && !/^tv-latest$/i.test(tag)) return tag.replace(/^v/i, "");
    return "";
  }

  function pickApk(assets, tvOnly) {
    const apks = (Array.isArray(assets) ? assets : [])
      .filter((a) => typeof a?.name === "string" && a.name.toLowerCase().endsWith(".apk"))
      .sort((a, b) => Date.parse(b.updated_at || b.created_at || 0) - Date.parse(a.updated_at || a.created_at || 0));
    if (tvOnly) {
      return apks.find((a) => /tv/i.test(a.name)) || apks[0] || null;
    }
    return apks.find((a) => !/tv/i.test(a.name)) || apks[0] || null;
  }

  function parseRelease(data, tvOnly, fallbackPage) {
    const picked = pickApk(data?.assets, tvOnly);
    return {
      apk: picked ? picked.browser_download_url : "",
      version: cleanVersion(data, picked?.name),
      size: picked ? picked.size : 0,
      page: data?.html_url || fallbackPage
    };
  }

  async function fetchGithubJson(path) {
    const api = `https://api.github.com/repos/${CONFIG.githubUser}/${CONFIG.repo}${path}`;
    const res = await fetch(api, {
      cache: "no-store",
      headers: { Accept: "application/vnd.github+json" }
    });
    if (!res.ok) return null;
    return res.json();
  }

  async function fetchAndroidRelease() {
    const fallbackPage = `https://github.com/${CONFIG.githubUser}/${CONFIG.repo}/releases/latest`;
    try {
      const latest = await fetchGithubJson("/releases/latest");
      if (latest) {
        const parsed = parseRelease(latest, false, fallbackPage);
        if (parsed.apk) return parsed;
      }
      const list = await fetchGithubJson("/releases?per_page=10");
      if (Array.isArray(list)) {
        for (const item of list) {
          if (item.draft || item.prerelease || item.tag_name === CONFIG.tvTag) continue;
          const parsed = parseRelease(item, false, fallbackPage);
          if (parsed.apk) return parsed;
        }
      }
      return { apk: "", version: "", size: 0, page: fallbackPage };
    } catch {
      return { apk: "", version: "", size: 0, page: fallbackPage };
    }
  }

  async function fetchTvRelease() {
    const fallbackPage = `https://github.com/${CONFIG.githubUser}/${CONFIG.repo}/releases/tag/${CONFIG.tvTag}`;
    try {
      const tagged = await fetchGithubJson(`/releases/tags/${encodeURIComponent(CONFIG.tvTag)}`);
      if (tagged) {
        const parsed = parseRelease(tagged, true, fallbackPage);
        if (parsed.apk) return parsed;
      }
      const list = await fetchGithubJson("/releases?per_page=10");
      if (Array.isArray(list)) {
        for (const item of list) {
          if (item.draft) continue;
          const assets = Array.isArray(item.assets) ? item.assets : [];
          const hasTv = item.tag_name === CONFIG.tvTag || assets.some((a) => typeof a?.name === "string" && /tv/i.test(a.name) && a.name.toLowerCase().endsWith(".apk"));
          if (!hasTv) continue;
          const parsed = parseRelease(item, true, fallbackPage);
          if (parsed.apk) return parsed;
        }
      }
      return { apk: "", version: "", size: 0, page: fallbackPage };
    } catch {
      return { apk: "", version: "", size: 0, page: fallbackPage };
    }
  }

  function triggerDownload(url) {
    const a = document.createElement("a");
    a.href = url;
    a.rel = "noopener noreferrer";
    a.setAttribute("download", "");
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function runDownloadAnimation(opts) {
    const { btn, wrap, label, pct, fill, defaultText, onDone } = opts;
    if (!btn || btn.disabled) return;
    btn.disabled = true;
    const span = btn.querySelector("span");
    if (span) span.textContent = "Preparando...";
    wrap.classList.add("active");
    wrap.setAttribute("aria-hidden", "false");
    fill.style.width = "0%";
    pct.textContent = "0%";
    label.textContent = "Conectando ao servidor...";

    const steps = [
      { t: 140, p: 24, msg: "Verificando arquivo..." },
      { t: 420, p: 58, msg: "Preparando pacote..." },
      { t: 740, p: 86, msg: "Quase pronto..." },
      { t: 1020, p: 100, msg: "Download iniciado" }
    ];

    steps.forEach((s) => {
      setTimeout(() => {
        fill.style.width = `${s.p}%`;
        pct.textContent = `${s.p}%`;
        label.textContent = s.msg;
        if (s.p === 100) {
          if (span) span.textContent = "Download iniciado";
          onDone();
        }
      }, s.t);
    });

    setTimeout(() => {
      btn.disabled = false;
      if (span) span.textContent = defaultText;
      wrap.classList.remove("active");
      wrap.setAttribute("aria-hidden", "true");
      setTimeout(() => {
        fill.style.width = "0%";
        pct.textContent = "0%";
      }, 280);
    }, 3200);
  }

  async function setupDownloads() {
    const btnAndroid = $("btnDownloadMobile");
    const btnTv = $("btnDownloadTv");
    if (!btnAndroid || !btnTv) return;

    const androidBadge = $("mobileVersionBadge");
    const androidMeta = $("mobileMeta");
    const tvBadge = $("tvVersionBadge");
    const tvMeta = $("tvMeta");

    const [androidRel, tv] = await Promise.all([fetchAndroidRelease(), fetchTvRelease()]);
    const androidFallback = `https://github.com/${CONFIG.githubUser}/${CONFIG.repo}/releases/latest`;

    if (androidRel.version) {
      androidBadge.textContent = `v${androidRel.version}`;
      const sz = formatBytes(androidRel.size);
      androidMeta.textContent = sz ? `Android 7.0+ · ${sz}` : "Android 7.0 ou superior";
    } else {
      androidMeta.textContent = "Android 7.0 ou superior";
    }

    btnAndroid.addEventListener("click", () => {
      if (androidRel.apk) {
        triggerDownload(androidRel.apk);
      } else {
        window.open(androidRel.page || androidFallback, "_blank", "noopener,noreferrer");
      }
      runDownloadAnimation({
        btn: btnAndroid,
        wrap: $("mobileProgress"),
        label: $("mobileProgressLabel"),
        pct: $("mobileProgressPct"),
        fill: $("mobileProgressFill"),
        defaultText: "Baixar APK Android",
        onDone: () => {}
      });
    });

    if (tv.apk) {
      tvBadge.textContent = tv.version ? `v${tv.version}` : "App TV Box";
      const sz = formatBytes(tv.size);
      tvMeta.textContent = sz ? `Android TV e TV Box · ${sz}` : "Android TV e TV Box";
    } else {
      tvBadge.textContent = "Em breve";
      tvMeta.textContent = "Android TV e TV Box · Em preparação";
    }

    btnTv.addEventListener("click", () => {
      if (!tv.apk) {
        showToast("A versão para Android TV / TV Box chega em breve");
        return;
      }
      triggerDownload(tv.apk);
      runDownloadAnimation({
        btn: btnTv,
        wrap: $("tvProgress"),
        label: $("tvProgressLabel"),
        pct: $("tvProgressPct"),
        fill: $("tvProgressFill"),
        defaultText: "Baixar APK TV Box",
        onDone: () => {}
      });
    });
  }

  function setupSocial() {
    const openOrSoon = (url, soonMsg) => {
      if (url && /^https?:\/\//i.test(url)) {
        window.open(url, "_blank", "noopener,noreferrer");
      } else {
        showToast(soonMsg);
      }
    };
    document.querySelectorAll("[data-social='instagram']").forEach((el) => {
      el.addEventListener("click", () => openOrSoon(CONFIG.instagramUrl, "O Instagram chega em breve"));
    });
    document.querySelectorAll("[data-social='youtube']").forEach((el) => {
      el.addEventListener("click", () => openOrSoon(CONFIG.youtubeUrl, "O canal chega em breve"));
    });
  }

  function renderRailSkeleton() {
    const rail = $("posterRail");
    if (!rail || rail.children.length > 0) return;
    const frag = document.createDocumentFragment();
    for (let i = 0; i < 6; i++) {
      const card = document.createElement("div");
      card.className = "rail-card";
      const thumb = document.createElement("div");
      thumb.className = "rail-thumb";
      const name = document.createElement("div");
      name.className = "rail-skel-name";
      card.appendChild(thumb);
      card.appendChild(name);
      frag.appendChild(card);
    }
    rail.appendChild(frag);
    requestAnimationFrame(updateCoverflow);
  }

  function renderPosterRail(items) {
    const rail = $("posterRail");
    if (!rail || items.length === 0) return;
    catalogItems = items;
    updateDvdCover(activeCoverIdx);

    rail.innerHTML = "";
    const frag = document.createDocumentFragment();

    catalogItems.forEach((item, idx) => {
      const card = document.createElement("button");
      card.type = "button";
      card.className = "rail-card";

      const thumb = document.createElement("div");
      thumb.className = "rail-thumb";

      const img = document.createElement("img");
      img.src = item.img;
      img.alt = item.title;
      img.loading = idx < 5 ? "eager" : "lazy";
      img.decoding = "async";
      img.referrerPolicy = "no-referrer";
      const done = () => {
        img.classList.add("ready");
        thumb.classList.add("loaded");
      };
      img.addEventListener("load", done, { once: true });
      if (img.complete && img.naturalWidth > 0) done();

      const chip = document.createElement("span");
      chip.className = "rail-chip";
      chip.textContent = item.kind;

      thumb.appendChild(img);
      thumb.appendChild(chip);

      const name = document.createElement("span");
      name.className = "rail-name";
      name.textContent = item.title;

      card.appendChild(thumb);
      card.appendChild(name);
      card.addEventListener("click", () => {
        updateDvdCover(idx);
        openSheet(item);
      });
      frag.appendChild(card);
    });

    rail.appendChild(frag);
    requestAnimationFrame(updateCoverflow);
  }

  function applyRailFilter() {
    if (!masterCatalog.length) return;
    let list = masterCatalog;
    if (railFilter !== "all") {
      const filtered = masterCatalog.filter((it) => it.kind === railFilter);
      if (filtered.length) list = filtered;
    }
    renderPosterRail(list);
  }

  function renderCatalog(items) {
    masterCatalog = Array.isArray(items) ? items : [];
    applyRailFilter();
  }

  function setupRailFilter() {
    const wrap = $("railFilter");
    if (!wrap) return;
    const chips = Array.from(wrap.querySelectorAll("[data-filter]"));
    if (!chips.length) return;
    chips.forEach((chip) => {
      chip.addEventListener("click", () => {
        railFilter = chip.dataset.filter || "all";
        chips.forEach((c) => {
          const on = c === chip;
          c.classList.toggle("active", on);
          c.setAttribute("aria-selected", String(on));
        });
        applyRailFilter();
        const rail = $("posterRail");
        if (rail) rail.scrollTo({ left: 0, behavior: "smooth" });
      });
    });
  }

  function readCachedCatalog() {
    try {
      const raw = sessionStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed || !Array.isArray(parsed.items) || parsed.items.length === 0) return null;
      if (Date.now() - (parsed.t || 0) > CACHE_TTL) return null;
      return parsed.items;
    } catch {
      return null;
    }
  }

  function writeCachedCatalog(items) {
    try {
      sessionStorage.setItem(CACHE_KEY, JSON.stringify({ t: Date.now(), items }));
    } catch {}
  }

  function normalizeStudioItems(rawItems) {
    const out = [];
    const seen = new Set();
    for (let i = 0; i < rawItems.length; i++) {
      const it = rawItems[i];
      if (!it || typeof it !== "object") continue;
      const id = Number(it.id) || 0;
      const type = it.type === "tv" ? "tv" : "movie";
      const key = `${type}:${id || it.title || i}`;
      if (seen.has(key)) continue;
      const poster = typeof it.poster === "string" ? it.poster.trim() : "";
      const backdrop = typeof it.backdrop === "string" ? it.backdrop.trim() : "";
      const img = (poster || backdrop).replace(/^http:/, "https:");
      const title = typeof it.title === "string" ? it.title.trim() : "";
      if (!img || !title) continue;
      seen.add(key);
      out.push({
        id,
        title,
        year: typeof it.year === "string" ? it.year.trim() : String(it.year || "").trim(),
        kind: type === "tv" ? "Série" : "Filme",
        img
      });
    }
    return out;
  }

  async function fetchStudioCuration() {
    try {
      const res = await fetch(_d(_u) + _d(_p), {
        method: "GET",
        cache: "no-store",
        headers: {
          apikey: _d(_k),
          Accept: "application/json"
        }
      });
      if (!res.ok) return [];
      const rows = await res.json();
      if (!Array.isArray(rows)) return [];
      const bySlot = new Map();
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        if (row && typeof row.slot === "string" && Array.isArray(row.items)) {
          bySlot.set(row.slot, row.items);
        }
      }
      const heroRaw = bySlot.get("hero");
      if (Array.isArray(heroRaw) && heroRaw.length > 0) {
        const heroItems = normalizeStudioItems(heroRaw);
        if (heroItems.length > 0) return heroItems;
      }
      const order = ["top10", "filmes", "series", "animes", "doramas"];
      const merged = [];
      for (let i = 0; i < order.length; i++) {
        const list = bySlot.get(order[i]);
        if (Array.isArray(list)) merged.push(...list);
      }
      return normalizeStudioItems(merged).slice(0, 14);
    } catch {
      return [];
    }
  }

  async function fetchTmdbItems() {
    if (!CONFIG.tmdbKey) return [];
    try {
      const url = `https://api.themoviedb.org/3/trending/all/week?api_key=${encodeURIComponent(CONFIG.tmdbKey)}&language=pt-BR`;
      const res = await fetch(url);
      if (!res.ok) return [];
      const data = await res.json();
      return (data.results || [])
        .filter((x) => x.poster_path)
        .slice(0, 12)
        .map((x) => ({
          title: x.title || x.name || "",
          kind: x.media_type === "tv" ? "Série" : "Filme",
          img: `https://image.tmdb.org/t/p/w342${x.poster_path}`
        }));
    } catch {
      return [];
    }
  }

  function fetchShows() {
    return fetch("https://api.tvmaze.com/shows?page=0")
      .then((r) => (r.ok ? r.json() : []))
      .then((list) =>
        Array.isArray(list)
          ? list
              .filter((s) => s && s.image && s.image.medium && (s.rating?.average || 0) >= 8.0)
              .sort((a, b) => (b.weight || 0) - (a.weight || 0))
              .slice(0, 10)
              .map((s) => ({
                title: s.name || "",
                kind: "Série",
                img: s.image.medium.replace(/^http:/, "https:")
              }))
          : []
      )
      .catch(() => []);
  }

  function fetchMovies() {
    return fetch("https://itunes.apple.com/search?term=batman+avengers+interstellar+dune&media=movie&entity=movie&limit=12&country=br")
      .then((r) => (r.ok ? r.json() : { results: [] }))
      .then((data) =>
        Array.isArray(data?.results)
          ? data.results
              .filter((m) => m && m.artworkUrl100)
              .slice(0, 10)
              .map((m) => ({
                title: m.trackName || "",
                kind: "Filme",
                img: m.artworkUrl100.replace(/100x100bb/g, "300x450bb").replace(/^http:/, "https:")
              }))
          : []
      )
      .catch(() => []);
  }

  function interleave(a, b) {
    const out = [];
    const max = Math.max(a.length, b.length);
    for (let i = 0; i < max && out.length < 12; i++) {
      if (i < a.length) out.push(a[i]);
      if (i < b.length && out.length < 12) out.push(b[i]);
    }
    return out;
  }

  async function setupCatalog() {
    if (!$("posterRail")) return;

    const cached = readCachedCatalog();
    if (cached) {
      renderCatalog(cached);
    } else {
      renderRailSkeleton();
    }

    const studio = await fetchStudioCuration();
    if (studio.length > 0) {
      writeCachedCatalog(studio);
      renderCatalog(studio);
      return;
    }

    if (cached) return;

    const tmdb = await fetchTmdbItems();
    if (tmdb.length >= 6) {
      writeCachedCatalog(tmdb);
      renderCatalog(tmdb);
      return;
    }

    const [shows, movies] = await Promise.all([fetchShows(), fetchMovies()]);
    const combined = interleave(movies, shows);
    if (combined.length > 0) {
      writeCachedCatalog(combined);
      renderCatalog(combined);
    }
  }

  function setupScrollProgress() {
    const fill = $("scrollProgressFill");
    if (!fill) return;
    let ticking = false;
    const update = () => {
      ticking = false;
      const doc = document.documentElement;
      const max = doc.scrollHeight - doc.clientHeight;
      const ratio = max > 0 ? (window.scrollY || doc.scrollTop || 0) / max : 0;
      fill.style.transform = `scaleX(${Math.max(0, Math.min(1, ratio)).toFixed(4)})`;
    };
    window.addEventListener("scroll", () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(update);
    }, { passive: true });
    update();
  }

  function setupBackToTop() {
    const btn = $("toTop");
    if (!btn) return;
    let ticking = false;
    const update = () => {
      ticking = false;
      btn.classList.toggle("show", (window.scrollY || 0) > 560);
    };
    window.addEventListener("scroll", () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(update);
    }, { passive: true });
    btn.addEventListener("click", () => window.scrollTo({ top: 0, behavior: "smooth" }));
    update();
  }

  function runCount(el) {
    const target = parseFloat(el.dataset.count || "0");
    const suffix = el.dataset.suffix || "";
    const prefix = el.dataset.prefix || "";
    if (REDUCED_MOTION || !(target > 0)) {
      el.textContent = `${prefix}${target}${suffix}`;
      return;
    }
    const duration = 1100;
    const start = performance.now();
    const tick = (now) => {
      const p = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      el.textContent = `${prefix}${Math.round(target * eased)}${suffix}`;
      if (p < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  function setupCounters() {
    const nums = Array.from(document.querySelectorAll("[data-count]"));
    if (!nums.length) return;
    if (!("IntersectionObserver" in window)) {
      nums.forEach(runCount);
      return;
    }
    const obs = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          runCount(entry.target);
          obs.unobserve(entry.target);
        }
      });
    }, { threshold: 0.6 });
    nums.forEach((n) => obs.observe(n));
  }

  function setupFaq() {
    const items = Array.from(document.querySelectorAll(".faq-item"));
    if (!items.length) return;
    const setHeight = (item, open) => {
      const answer = item.querySelector(".faq-a");
      if (answer) answer.style.maxHeight = open ? `${answer.scrollHeight}px` : "";
    };
    items.forEach((item) => {
      const q = item.querySelector(".faq-q");
      if (!q) return;
      q.addEventListener("click", () => {
        const open = item.classList.toggle("open");
        q.setAttribute("aria-expanded", String(open));
        setHeight(item, open);
      });
    });
    window.addEventListener("resize", () => {
      items.forEach((item) => {
        if (item.classList.contains("open")) setHeight(item, true);
      });
    }, { passive: true });
  }

  function setupStageHint() {
    const hint = $("stageHint");
    if (!hint) return;
    const stage = $("heroStage");
    const hide = () => hint.classList.add("gone");
    if (stage) stage.addEventListener("pointerdown", hide, { once: true });
    setTimeout(hide, 7000);
  }

  function setupFooterYear() {
    const el = $("footYear");
    if (el) el.textContent = String(new Date().getFullYear());
  }

  document.addEventListener("DOMContentLoaded", () => {
    setupGuard();
    setupAutoGyro();
    setupNavigation();
    setupScrollReveal();
    setupScrollProgress();
    setupBackToTop();
    setupHero3D();
    setupStageHint();
    setupSoundtrack();
    setupAmbientCanvas();
    setupTiltCards();
    setupPlatformTabs();
    setupSheet();
    setupCoverflowControls();
    setupRailFilter();
    setupCounters();
    setupFaq();
    setupFooterYear();
    setupSocial();
    setupDownloads();
    setupCatalog();
  });
})();
