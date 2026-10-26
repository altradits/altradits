const host = document.querySelector("[data-hero-scene]");
if (host) {
  let started = false;
  const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)");
  const enter = async () => {
    if (started) return;
    started = true;
    try {
      const THREE = await import("/assets/three.module.js");
      const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true, powerPreference: "low-power" });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
      renderer.setClearColor(0x000000, 0);
      renderer.outputColorSpace = THREE.SRGBColorSpace;

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(34, 1, 0.1, 20);
      camera.position.set(0, 0, 6.5);
      scene.add(new THREE.HemisphereLight(0xffffff, 0x274c77, 2.1));
      const key = new THREE.DirectionalLight(0xffffff, 3.2);
      key.position.set(-3, 4, 6);
      scene.add(key);
      const fill = new THREE.PointLight(0xea5158, 18, 8);
      fill.position.set(3, -2, 3);
      scene.add(fill);

      const art = new THREE.Group();
      scene.add(art);
      const coin = new THREE.Group();
      art.add(coin);
      const body = new THREE.Mesh(
        new THREE.CylinderGeometry(1.05, 1.05, 0.2, 96),
        [new THREE.MeshStandardMaterial({ color: 0xf7931a, metalness: 0.28, roughness: 0.34 }), new THREE.MeshStandardMaterial({ color: 0x0f1b2d, metalness: 0.5, roughness: 0.32 }), new THREE.MeshStandardMaterial({ color: 0xf7931a, metalness: 0.28, roughness: 0.34 })],
      );
      body.rotation.x = Math.PI / 2;
      coin.add(body);

      const mark = document.createElement("canvas");
      mark.width = mark.height = 256;
      const ctx = mark.getContext("2d");
      ctx.fillStyle = "#0F1B2D";
      ctx.font = "800 194px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("₿", 128, 132);
      const markTexture = new THREE.CanvasTexture(mark);
      markTexture.colorSpace = THREE.SRGBColorSpace;
      const stamp = new THREE.Mesh(new THREE.CircleGeometry(0.9, 96), new THREE.MeshBasicMaterial({ map: markTexture, transparent: true, toneMapped: false }));
      stamp.position.z = 0.105;
      coin.add(stamp);

      const orbit = new THREE.Mesh(new THREE.TorusGeometry(1.48, 0.035, 12, 128), new THREE.MeshStandardMaterial({ color: 0xea5158, metalness: 0.18, roughness: 0.35 }));
      orbit.rotation.set(0.92, 0.22, -0.42);
      art.add(orbit);
      const orbit2 = new THREE.Mesh(new THREE.TorusGeometry(1.62, 0.018, 8, 128), new THREE.MeshStandardMaterial({ color: 0x274c77, metalness: 0.15, roughness: 0.48, transparent: true, opacity: 0.72 }));
      orbit2.rotation.set(1.04, -0.3, 0.52);
      art.add(orbit2);
      const satellite = new THREE.Mesh(new THREE.SphereGeometry(0.105, 24, 18), new THREE.MeshStandardMaterial({ color: 0xf7931a, metalness: 0.2, roughness: 0.3 }));
      satellite.position.set(1.38, 0.76, 0.44);
      art.add(satellite);

      host.append(renderer.domElement);
      host.querySelector(".hero-scene-fallback").hidden = true;
      const size = () => {
        const width = host.clientWidth;
        if (!width) return;
        renderer.setSize(width, width, false);
        camera.aspect = 1;
        camera.updateProjectionMatrix();
        renderer.render(scene, camera);
      };
      const resize = new ResizeObserver(size);
      resize.observe(host);
      size();

      let inView = false;
      const frame = (time) => {
        const t = time * 0.00022;
        art.rotation.y = Math.sin(t) * 0.17;
        art.rotation.x = Math.sin(t * 0.7) * 0.06;
        coin.rotation.z = Math.sin(t * 0.8) * 0.06;
        renderer.render(scene, camera);
      };
      const sync = () => {
        if (reducedMotion.matches || !inView || document.hidden) {
          renderer.setAnimationLoop(null);
          renderer.render(scene, camera);
        } else renderer.setAnimationLoop(frame);
      };
      const visibility = new IntersectionObserver(([entry]) => { inView = entry.isIntersecting; sync(); }, { rootMargin: "120px" });
      visibility.observe(host);
      reducedMotion.addEventListener("change", sync);
      document.addEventListener("visibilitychange", sync);
      renderer.domElement.addEventListener("webglcontextlost", (event) => {
        event.preventDefault();
        renderer.setAnimationLoop(null);
        renderer.dispose();
        renderer.domElement.remove();
        host.querySelector(".hero-scene-fallback").hidden = false;
      }, { once: true });
    } catch {
      // The branded SVG stays visible when WebGL or the Three.js module is unavailable.
    }
  };
  const load = new IntersectionObserver(([entry]) => {
    if (entry.isIntersecting) {
      load.disconnect();
      enter();
    }
  }, { rootMargin: "160px" });
  load.observe(host);
}
