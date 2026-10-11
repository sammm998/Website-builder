import * as THREE from "three";
import { boolParam, cssVar, numberParam } from "../util";

/**
 * WebGL effects. Loaded lazily (separate chunk) only when such an element approaches the viewport.
 * Every scene pauses when off-screen or when the tab is hidden, caps DPR at 1.5 and falls back to a
 * static CSS look when WebGL is unavailable.
 */

type Cleanup = () => void;

const NOISE = /* glsl */ `
vec3 mod289(vec3 x){return x-floor(x*(1./289.))*289.;}
vec4 mod289(vec4 x){return x-floor(x*(1./289.))*289.;}
vec4 permute(vec4 x){return mod289(((x*34.)+1.)*x);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159-.85373472095314*r;}
float snoise(vec3 v){const vec2 C=vec2(1./6.,1./3.);const vec4 D=vec4(0.,.5,1.,2.);
vec3 i=floor(v+dot(v,C.yyy));vec3 x0=v-i+dot(i,C.xxx);vec3 g=step(x0.yzx,x0.xyz);vec3 l=1.-g;
vec3 i1=min(g.xyz,l.zxy);vec3 i2=max(g.xyz,l.zxy);vec3 x1=x0-i1+C.xxx;vec3 x2=x0-i2+C.yyy;vec3 x3=x0-D.yyy;
i=mod289(i);vec4 p=permute(permute(permute(i.z+vec4(0.,i1.z,i2.z,1.))+i.y+vec4(0.,i1.y,i2.y,1.))+i.x+vec4(0.,i1.x,i2.x,1.));
float n_=.142857142857;vec3 ns=n_*D.wyz-D.xzx;vec4 j=p-49.*floor(p*ns.z*ns.z);vec4 x_=floor(j*ns.z);vec4 y_=floor(j-7.*x_);
vec4 x=x_*ns.x+ns.yyyy;vec4 y=y_*ns.x+ns.yyyy;vec4 h=1.-abs(x)-abs(y);vec4 b0=vec4(x.xy,y.xy);vec4 b1=vec4(x.zw,y.zw);
vec4 s0=floor(b0)*2.+1.;vec4 s1=floor(b1)*2.+1.;vec4 sh=-step(h,vec4(0.));vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy;vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
vec3 p0=vec3(a0.xy,h.x);vec3 p1=vec3(a0.zw,h.y);vec3 p2=vec3(a1.xy,h.z);vec3 p3=vec3(a1.zw,h.w);
vec4 norm=taylorInvSqrt(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));p0*=norm.x;p1*=norm.y;p2*=norm.z;p3*=norm.w;
vec4 m=max(.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.);m=m*m;
return 42.*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));}
`;

const color = (name: string, fallback: string) => new THREE.Color(cssVar(name, fallback));

function supportsWebGL(): boolean {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") || c.getContext("webgl"));
  } catch {
    return false;
  }
}

interface Stage {
  renderer: THREE.WebGLRenderer;
  canvas: HTMLCanvasElement;
  start: (frame: (t: number, dt: number) => void) => void;
  dispose: Cleanup;
}

/** Creates a canvas covering `host` (behind content) with visibility-aware render loop. */
function stage(host: HTMLElement, opts: { behind: boolean; alpha?: boolean }): Stage {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: opts.alpha ?? true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(1.5, devicePixelRatio || 1));
  const canvas = renderer.domElement;
  canvas.className = opts.behind ? "m-webgl m-webgl-behind" : "m-webgl";
  canvas.setAttribute("aria-hidden", "true");
  if (opts.behind) {
    if (getComputedStyle(host).position === "static") host.style.position = "relative";
    host.style.isolation = "isolate";
    host.prepend(canvas);
  } else host.append(canvas);

  let raf = 0;
  let visible = false;
  let frameFn: ((t: number, dt: number) => void) | null = null;
  let last = performance.now();
  const loop = (now: number) => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    frameFn?.(now / 1000, dt);
    raf = visible && !document.hidden ? requestAnimationFrame(loop) : 0;
  };
  const wake = () => {
    if (!raf && visible && !document.hidden) {
      last = performance.now();
      raf = requestAnimationFrame(loop);
    }
  };
  const io = new IntersectionObserver(([entry]) => {
    visible = !!entry?.isIntersecting;
    wake();
  });
  io.observe(host);
  const onVis = () => wake();
  document.addEventListener("visibilitychange", onVis);
  const resize = () => {
    const r = (opts.behind ? host : canvas).getBoundingClientRect();
    renderer.setSize(Math.max(1, r.width), Math.max(1, r.height), false);
  };
  const ro = new ResizeObserver(resize);
  ro.observe(opts.behind ? host : canvas);
  resize();
  return {
    renderer,
    canvas,
    start: (fn) => {
      frameFn = fn;
      wake();
    },
    dispose: () => {
      cancelAnimationFrame(raf);
      io.disconnect();
      ro.disconnect();
      document.removeEventListener("visibilitychange", onVis);
      renderer.dispose();
      canvas.remove();
    },
  };
}

const pointer = { x: 0, y: 0 };
addEventListener("pointermove", (e) => {
  pointer.x = (e.clientX / innerWidth) * 2 - 1;
  pointer.y = -(e.clientY / innerHeight) * 2 + 1;
}, { passive: true });

export function gradient(host: HTMLElement): Cleanup {
  const speed = numberParam(host, "webgl-gradient", "speed");
  const strength = numberParam(host, "webgl-gradient", "intensity");
  const grain = boolParam(host, "webgl-gradient", "grain");
  const s = stage(host, { behind: true, alpha: false });
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const uniforms = {
    uTime: { value: 0 },
    uPointer: { value: new THREE.Vector2() },
    uRes: { value: new THREE.Vector2(1, 1) },
    uA: { value: color("--color-bg", "#0b0b0f") },
    uB: { value: color("--color-accent", "#4f46e5") },
    uC: { value: color("--color-brand", "#06b6d4") },
    uD: { value: color("--color-surface-2", "#1f2937") },
    uStrength: { value: strength },
    uGrain: { value: grain ? 1 : 0 },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }`,
    fragmentShader: `
      precision highp float; varying vec2 vUv;
      uniform float uTime, uStrength, uGrain; uniform vec2 uPointer, uRes; uniform vec3 uA, uB, uC, uD;
      ${NOISE}
      float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
      void main(){
        vec2 uv = vUv; float aspect = uRes.x / max(uRes.y, 1.);
        vec2 p = vec2(uv.x * aspect, uv.y);
        float t = uTime;
        float n1 = snoise(vec3(p * 1.2 + uPointer * .15, t * .12));
        float n2 = snoise(vec3(p * 2.1 - 3.7, t * .18 + 10.));
        float n3 = snoise(vec3(p * .7 + 7.1, t * .08 + 20.));
        vec3 col = uA;
        col = mix(col, uB, smoothstep(-.2, .8, n1) * uStrength);
        col = mix(col, uC, smoothstep(.0, .9, n2) * uStrength * .85);
        col = mix(col, uD, smoothstep(.2, 1., n3) * .5);
        col += (hash(uv * uRes + t) - .5) * .06 * uGrain;
        gl_FragColor = vec4(col, 1.);
      }`,
  });
  scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material));
  s.start((t) => {
    uniforms.uTime.value = t * speed * 2;
    uniforms.uPointer.value.lerp(new THREE.Vector2(pointer.x, pointer.y), 0.04);
    const size = s.renderer.getSize(new THREE.Vector2());
    uniforms.uRes.value.copy(size);
    s.renderer.render(scene, camera);
  });
  return () => {
    material.dispose();
    s.dispose();
  };
}

export function particles(host: HTMLElement): Cleanup {
  const density = Math.round(numberParam(host, "webgl-particles", "density") * (innerWidth < 768 ? 0.45 : 1));
  const size = numberParam(host, "webgl-particles", "size");
  const depth = numberParam(host, "webgl-particles", "depth");
  const s = stage(host, { behind: true });
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 100);
  camera.position.z = depth;
  const positions = new Float32Array(density * 3);
  const seeds = new Float32Array(density);
  for (let i = 0; i < density; i++) {
    const r = Math.cbrt(Math.random()) * depth * 0.9;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    positions.set([r * Math.sin(phi) * Math.cos(theta), r * Math.sin(phi) * Math.sin(theta) * 0.6, r * Math.cos(phi)], i * 3);
    seeds[i] = Math.random();
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute("aSeed", new THREE.BufferAttribute(seeds, 1));
  const uniforms = {
    uTime: { value: 0 },
    uSize: { value: size * Math.min(1.5, devicePixelRatio || 1) },
    uA: { value: color("--color-accent", "#6366f1") },
    uB: { value: color("--color-brand", "#22d3ee") },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: `
      attribute float aSeed; uniform float uTime, uSize; varying float vSeed; varying float vDepth;
      ${NOISE}
      void main(){
        vec3 p = position;
        p += vec3(snoise(p * .15 + uTime * .05), snoise(p * .15 + 3. + uTime * .05), snoise(p * .15 + 6.)) * .8;
        vec4 mv = modelViewMatrix * vec4(p, 1.);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = uSize * (8. / -mv.z) * (.6 + aSeed);
        vSeed = aSeed; vDepth = clamp(-mv.z / 20., 0., 1.);
      }`,
    fragmentShader: `
      uniform vec3 uA, uB; varying float vSeed; varying float vDepth;
      void main(){
        float d = length(gl_PointCoord - .5);
        float a = smoothstep(.5, .0, d) * (1. - vDepth * .7);
        gl_FragColor = vec4(mix(uA, uB, vSeed), a);
      }`,
  });
  const points = new THREE.Points(geometry, material);
  scene.add(points);
  let scrollRot = 0;
  s.start((t) => {
    const r = s.canvas.getBoundingClientRect();
    camera.aspect = r.width / Math.max(1, r.height);
    camera.updateProjectionMatrix();
    uniforms.uTime.value = t;
    scrollRot = THREE.MathUtils.lerp(scrollRot, scrollY * 0.0006, 0.08);
    points.rotation.y = t * 0.03 + pointer.x * 0.25 + scrollRot;
    points.rotation.x = pointer.y * 0.15;
    s.renderer.render(scene, camera);
  });
  return () => {
    geometry.dispose();
    material.dispose();
    s.dispose();
  };
}

export function blob(host: HTMLElement): Cleanup {
  const speed = numberParam(host, "webgl-blob", "speed");
  const complexity = numberParam(host, "webgl-blob", "complexity");
  const s = stage(host, { behind: true });
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40, 1, 0.1, 50);
  camera.position.z = 6;
  const uniforms = {
    uTime: { value: 0 },
    uComplexity: { value: complexity },
    uA: { value: color("--color-accent", "#7c3aed") },
    uB: { value: color("--color-brand", "#06b6d4") },
    uBg: { value: color("--color-bg", "#0a0a0a") },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: `
      uniform float uTime, uComplexity; varying vec3 vNormal; varying vec3 vView; varying float vNoise;
      ${NOISE}
      void main(){
        float n = snoise(normal * uComplexity + uTime * .35);
        vNoise = n;
        vec3 p = position + normal * n * .35;
        vec4 mv = modelViewMatrix * vec4(p, 1.);
        vNormal = normalize(normalMatrix * normal);
        vView = normalize(-mv.xyz);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `
      uniform vec3 uA, uB, uBg; varying vec3 vNormal; varying vec3 vView; varying float vNoise;
      void main(){
        float fres = pow(1. - max(dot(vNormal, vView), 0.), 2.2);
        vec3 base = mix(uA, uB, smoothstep(-.6, .6, vNoise + vNormal.y * .5));
        vec3 col = mix(base * .85, vec3(1.), fres * .55);
        float spec = pow(max(dot(reflect(-vView, vNormal), normalize(vec3(.4, .8, .6))), 0.), 24.);
        gl_FragColor = vec4(col + spec * .6, 1.);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(1.6, 64), material);
  scene.add(mesh);
  s.start((t) => {
    const r = s.canvas.getBoundingClientRect();
    camera.aspect = r.width / Math.max(1, r.height);
    camera.updateProjectionMatrix();
    mesh.position.x = r.width > 900 ? 1.4 : 0;
    uniforms.uTime.value = t * speed * 2;
    mesh.rotation.y = THREE.MathUtils.lerp(mesh.rotation.y, pointer.x * 0.6 + t * 0.1, 0.05);
    mesh.rotation.x = THREE.MathUtils.lerp(mesh.rotation.x, -pointer.y * 0.4, 0.05);
    s.renderer.render(scene, camera);
  });
  return () => {
    material.dispose();
    s.dispose();
  };
}

export function distort(img: HTMLImageElement): Cleanup {
  const strength = numberParam(img, "webgl-distort", "strength");
  const frame = img.parentElement;
  if (!frame) return () => {};
  const s = stage(frame, { behind: false });
  s.canvas.classList.add("m-webgl-cover");
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const loader = new THREE.TextureLoader();
  loader.setCrossOrigin("anonymous");
  const uniforms = {
    uTex: { value: null as THREE.Texture | null },
    uTime: { value: 0 },
    uStrength: { value: strength },
    uMouse: { value: new THREE.Vector2(0.5, 0.5) },
    uHover: { value: 0 },
    uVelocity: { value: 0 },
    uCover: { value: new THREE.Vector2(1, 1) },
  };
  const material = new THREE.ShaderMaterial({
    uniforms,
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }`,
    fragmentShader: `
      precision highp float; varying vec2 vUv; uniform sampler2D uTex; uniform float uTime, uStrength, uHover, uVelocity; uniform vec2 uMouse, uCover;
      ${NOISE}
      void main(){
        vec2 uv = (vUv - .5) * uCover + .5;
        float d = distance(vUv, uMouse);
        float ripple = smoothstep(.45, 0., d) * uHover;
        float n = snoise(vec3(vUv * 3., uTime * .4));
        vec2 offset = vec2(n) * .03 * uStrength * (ripple + abs(uVelocity));
        float shift = .012 * uStrength * (ripple + abs(uVelocity));
        vec4 c = vec4(texture2D(uTex, uv + offset + vec2(shift, 0.)).r, texture2D(uTex, uv + offset).g, texture2D(uTex, uv + offset - vec2(shift, 0.)).b, 1.);
        gl_FragColor = c;
      }`,
  });
  scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material));
  loader.load(img.currentSrc || img.src, (tex) => {
    tex.colorSpace = THREE.SRGBColorSpace;
    uniforms.uTex.value = tex;
    img.classList.add("m-webgl-hidden-source");
  });
  let lastY = scrollY;
  const enter = () => (hoverTarget = 1);
  const leave = () => (hoverTarget = 0);
  let hoverTarget = 0;
  const move = (e: PointerEvent) => {
    const r = frame.getBoundingClientRect();
    uniforms.uMouse.value.set((e.clientX - r.left) / r.width, 1 - (e.clientY - r.top) / r.height);
  };
  frame.addEventListener("pointerenter", enter);
  frame.addEventListener("pointerleave", leave);
  frame.addEventListener("pointermove", move);
  s.start((t) => {
    if (!uniforms.uTex.value) return;
    const r = frame.getBoundingClientRect();
    const tex = uniforms.uTex.value.image as { width: number; height: number };
    const frameAspect = r.width / Math.max(1, r.height);
    const imgAspect = tex.width / Math.max(1, tex.height);
    uniforms.uCover.value.set(frameAspect > imgAspect ? 1 : frameAspect / imgAspect, frameAspect > imgAspect ? imgAspect / frameAspect : 1);
    uniforms.uTime.value = t;
    uniforms.uHover.value = THREE.MathUtils.lerp(uniforms.uHover.value, hoverTarget, 0.08);
    uniforms.uVelocity.value = THREE.MathUtils.lerp(uniforms.uVelocity.value, (scrollY - lastY) / 60, 0.1);
    lastY = scrollY;
    s.renderer.render(scene, camera);
  });
  return () => {
    frame.removeEventListener("pointerenter", enter);
    frame.removeEventListener("pointerleave", leave);
    frame.removeEventListener("pointermove", move);
    img.classList.remove("m-webgl-hidden-source");
    material.dispose();
    s.dispose();
  };
}

export function mountWebGL(el: HTMLElement, effect: string): Cleanup {
  if (!supportsWebGL()) {
    el.setAttribute("data-webgl-fallback", "");
    return () => {};
  }
  el.setAttribute("data-webgl-ready", "");
  switch (effect) {
    case "webgl-gradient":
      return gradient(el);
    case "webgl-particles":
      return particles(el);
    case "webgl-blob":
      return blob(el);
    case "webgl-distort":
      return el instanceof HTMLImageElement ? distort(el) : () => {};
    default:
      return () => {};
  }
}
