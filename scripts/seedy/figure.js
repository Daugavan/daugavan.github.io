const {
  Cam, clamp, fit, proj, rrect, poly, hull, open, fillet,
  mk, solid, put, pointer, register, disposer, spring, stepS, reducedMotion,
} = HL;

function mount({ stage, svg, read }, value) {
  const bag = disposer(), C = Cam(45, 0.5, 1.78);
  const world = (u, z, depth = 16) => [(u + depth) / Math.SQRT2, (depth - u) / Math.SQRT2, z];
  fit(C, [world(-65, 0), world(65, 0), world(-55, 174), world(55, 174)], 200, 163);
  const P = proj(C), point = (u, z, depth = 16) => P(...world(u, z, depth));
  const g = mk("g", {}, svg), lean = spring(-0.8), gaze = spring(0);
  let strength = value, over = null, phase = 0, last = "";
  const armL = solid(g), armR = solid(g), footL = solid(g), footR = solid(g);
  const body = solid(g), seed = solid(g), stem = mk("path", { class: "nf sil" }, g);
  const leafL = solid(g), leafR = solid(g), head = solid(g);
  const face = mk("path", { class: "nf lo" }, g);
  const eyes = [-1, 1].map(() => mk("path", { class: "nf" }, g));

  function draw() {
    const breath = strength > 0 && !reducedMotion() ? Math.sin(phase * 1.5) * 0.85 : 0;
    const flutter = strength > 0 && !reducedMotion() ? Math.sin(phase * 1.2) * 2 : 0;
    const state = [lean.x, gaze.x, breath, flutter].map(n => n.toFixed(3)).join();
    if (state === last) return;
    last = state;
    const Q = (u, z, d = 16) => point(u + lean.x * Math.max(0, z - 14) / 40, z + breath * Math.min(1, z / 60), d);
    function box(el, x0, z0, x1, z1, radius, front, back) {
      const ring = rrect(x0, z0, x1, z1, radius, 10);
      const inset = rrect(x0 + 1.8, z0 + 1.8, x1 - 1.8, z1 - 1.8, Math.max(1, radius - 1.8), 10);
      put(el, {
        sil: poly(hull([...ring.map(q => Q(q.u, q.v, back)), ...ring.map(q => Q(q.u, q.v, front))])),
        crease: poly(inset.map(q => Q(q.u, q.v, front))),
      });
    }
    box(armL, -35, 26, -23, 48, 5, 12, 3);
    box(armR, 23, 26, 35, 48, 5, 12, 3);
    box(footL, -23, 8, -6, 26, 4, 20, 1);
    box(footR, 6, 8, 23, 26, 4, 20, 1);
    box(body, -25, 22, 25, 57, 7, 18, 0);
    const badge = Array.from({ length: 40 }, (_, i) => {
      const a = i * Math.PI / 20;
      return Q(6 * Math.cos(a), 37 + 8 * Math.sin(a), 19);
    });
    put(seed, { sil: poly(badge), crease: open([Q(0, 31, 19), Q(1, 39, 19), Q(0, 43, 19)]) });
    stem.setAttribute("d", open([Q(-1, 111, 4), Q(4, 126, 4), Q(-2, 140, 4), Q(2, 151, 4)]));
    function leaf(el, side) {
      const angle = side * (0.32 + (flutter + gaze.x * 5) / 70);
      const contour = Array.from({ length: 48 }, (_, i) => {
        const a = i * Math.PI / 24, x = 23 * Math.cos(a), z = 9 * Math.sin(a);
        return [side * 23 + x * Math.cos(angle) - z * Math.sin(angle), 153 + x * Math.sin(angle) + z * Math.cos(angle)];
      });
      put(el, {
        sil: poly(hull([...contour.map(([u, z]) => Q(u, z, 5)), ...contour.map(([u, z]) => Q(u, z, 9))])),
        crease: open([Q(side * 5, 148, 10), Q(side * 23, 153, 10), Q(side * 40, 158, 10)]),
      });
    }
    leaf(leafL, -1); leaf(leafR, 1);
    box(head, -53, 57, 53, 119, 15, 22, 0);
    face.setAttribute("d", poly(rrect(-44, 65, 44, 110, 11, 12).map(q => Q(q.u, q.v, 23))));
    eyes.forEach((eye, i) => {
      eye.setAttribute("d", poly(rrect(-2.6, -3.8, 2.6, 3.8, 1.9, 6)
        .map(q => Q((i ? 24 : -24) + gaze.x * 2.5 + q.u, 83 + q.v, 24))));
    });
  }

  const B = register(stage, dt => {
    const ambient = strength > 0 && !reducedMotion();
    if (ambient) phase += dt;
    const moving = stepS(lean, dt) | stepS(gaze, dt);
    draw();
    return ambient || Boolean(moving);
  });
  bag.add(B.unregister);
  function answer(p) {
    over = p && p[0] > 65 && p[0] < 335 && p[1] > 15 && p[1] < 300 ? p : null;
    const x = over ? clamp((over[0] - 200) / 100, -1, 1) : 0;
    gaze.t = x;
    lean.t = over ? x * strength : -0.8;
    leafL.sil.classList.toggle("hi", !over || x <= 0);
    leafR.sil.classList.toggle("hi", Boolean(over && x > 0));
    read.textContent = over ? (x > 0 ? "right leaf" : "left leaf") : "rest";
    B.wake();
  }
  bag.add(pointer(stage, { move: answer, leave: () => answer(null) }));
  bag.add(() => svg.replaceChildren());
  answer(null); draw();
  return {
    set(v) { strength = v; answer(over); },
    destroy: bag.dispose,
  };
}

hairline({
  name: "seedy",
  means: "Seedy, a little round-headed robot with a two-leaf sprout, breathes quietly and leans toward your pointer.",
  rules: [1, 3, 5, 7, 8, 9],
  range: [0, 2, 4],
  tour: [[130, 65], [270, 65], [200, 190], null],
  mount,
});
