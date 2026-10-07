// Independent courtyard layers; complete poses stand on one courtyard plane.
// Landscape desktop/iPad drawing still uses the original presentation client.
const clamp = v => Math.max(0, Math.min(1, v));
const mix = (a, b, t) => a + (b - a) * t;
const smooth = v => { const t = clamp(v); return t * t * (3 - 2 * t); };
export const COURTYARD_ART = ['courtyard-background', 'courtyard-machine', 'courtyard-title', ...['ready', 'press-v3', 'point'].map(p => `courtyard-teacher-${p}`)];
const PRESS_FINGER = { x: .03600655, y: .62523191 };
const PRESS_FOOT = .53682488;
export function createPortraitLayout(canvas, ctx, art) {
  const $ = id => document.getElementById(id);
  const stage = $('stage'), title = $('portrait-title'), identity = $('portrait-identity'), bubble = $('portrait-reminder');
  let enabled = false, compact = false, height = 960, q = 1, x = 0, y = 0, safeTop = 0, safeBottom = 0, currentPhase = 'loading';
  const ready = () => COURTYARD_ART.every(name => art[name]);
  function update(on, smallLandscape = compact) {
    enabled = on; compact = smallLandscape && !on;
    const price = $('start').querySelector('img');
    if (price) { const source = compact || enabled ? './assets/compact-price.webp' : './assets/price-button-clean.png'; if (!price.src.endsWith(source.slice(1))) price.src = source; }
    document.documentElement.dataset.layout = enabled ? 'portrait' : compact ? 'compact' : 'landscape';
    title.hidden = !enabled && !compact;
    if (!enabled && !compact) {
      if (canvas.width !== 1205) canvas.width = 1205;
      if (canvas.height !== 960) canvas.height = 960;
      identity.hidden = true; bubble.hidden = true;
      return;
    }
    const width = enabled ? 800 : 1205;
    height = Math.round(width * stage.clientHeight / Math.max(1, stage.clientWidth));
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    if (compact) {
      const unit = 1205 / Math.max(1, stage.clientWidth);
      q = Math.min(1.08, Math.max(.1, (stage.clientHeight - safeTop - safeBottom - 126) * unit / 670));
      x = 602.5 - 615 * q; y = (safeTop + 55) * unit - 150 * q;
      title.style.removeProperty('top');
    }
  }
  function phase(value, model) {
    currentPhase = value; stage.dataset.phase = value;
    identity.hidden = !(enabled || compact) || value !== 'revealed';
    bubble.hidden = !(enabled || compact) || value !== 'reminder';
    if (enabled) {
      const progress = ['screenfade', 'cardfade', 'revealing', 'revealed'].includes(value) ? 1 : value === 'growing' ? smooth((model?.grow || 0) / .7) : 0;
      title.style.top = `${Math.max(safeTop + 16, stage.clientHeight * mix(stage.clientHeight < 600 ? .12 : .20, .09, progress))}px`;
      if (value === 'reminder') bubble.style.top = `${title.getBoundingClientRect().bottom + 14}px`;
    }
    else bubble.style.removeProperty('top');
  }
  function result(rect) {
    if (!enabled && !compact) return rect;
    const unit = canvas.width / Math.max(1, stage.clientWidth);
    const button = $('join'), buttonStyle = getComputedStyle(button);
    const footer = (parseFloat(buttonStyle.height) || 52) + (parseFloat(buttonStyle.bottom) || safeBottom + 16) + (compact ? 16 : 104);
    const topPx = compact ? Math.max(safeTop + 50, title.getBoundingClientRect().bottom + 8) : Math.max(stage.clientHeight * .24, title.getBoundingClientRect().bottom + 14);
    const hPx = Math.max(72, Math.min(stage.clientHeight - topPx - footer, stage.clientWidth * (compact ? .28 : .65) * 1.5));
    const h = hPx * unit, w = h * 2 / 3;
    const target = { x: compact ? 210 : 24, y: topPx * unit, w, h };
    const host = $('result-card-host');
    host.style.left = `${target.x / canvas.width * 100}%`;
    host.style.top = `${target.y / height * 100}%`;
    host.style.width = `${target.w / canvas.width * 100}%`;
    identity.style.top = `${(target.y + h + (compact ? 5 : 12) * unit) / height * 100}%`;
    if (compact) {
      identity.style.left = `${(target.x + w + 20 * unit) / canvas.width * 100}%`;
      identity.style.right = '3%'; identity.style.top = `${Math.max(safeTop + 58, stage.clientHeight * .34)}px`;
      return { x: (target.x - x) / q, y: (target.y - y) / q, w: w / q, h: h / q };
    }
    identity.style.removeProperty('left'); identity.style.removeProperty('right');
    return target;
  }
  function geometry() {
    const unit = 800 / Math.max(1, stage.clientWidth);
    const baseline = height * .715;
    const available = baseline - (title.getBoundingClientRect().bottom + 28) * unit;
    // Approved 853x1844 reference: machine y=.350H..705H, full group nearly
    // spans the width. Limit by complete pose bounds, not the old 520px cap.
    const teacherRatio = .82;
    const press = art['courtyard-teacher-press-v3'];
    const machineAspect = art['courtyard-machine'].width / art['courtyard-machine'].height;
    const pressAspect = press.width / press.height;
    const groupPerHeight = machineAspect * .91 + teacherRatio * pressAspect * (1 - PRESS_FINGER.x);
    const mh = Math.max(80 * unit, Math.min(height * .355, (800 - 32 - 14) / groupPerHeight, available));
    const mw = mh * art['courtyard-machine'].width / art['courtyard-machine'].height;
    const groupWidth = mh * groupPerHeight;
    const machine = { x: (800 - groupWidth - 14) / 2, y: baseline - mh, w: mw, h: mh };
    const button = { x: machine.x + mw * .91, y: machine.y + mh * .638 };
    const th = mh * teacherRatio;
    const tw = th * press.width / press.height;
    const pressLeft = button.x - tw * PRESS_FINGER.x;
    const footX = pressLeft + tw * PRESS_FOOT;
    // The teacher stands a few pixels farther back on the same ground plane;
    // align the whole figure to the actual fingertip without stretching arms.
    const teacherBaseline = button.y + th * (1 - PRESS_FINGER.y);
    return { unit, baseline, teacherBaseline, machine, button, teacherHeight: th, footX, outlet: { x: machine.x + mw * .62, y: machine.y + mh * .787 } };
  }
  function shadow(cx, cy, rx, ry, opacity = .18) {
    ctx.save(); ctx.fillStyle = `rgba(33,70,98,${opacity})`; ctx.filter = 'blur(3px)';
    ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, -.02, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  }
  function character(pose, g, footX, baseline, characterHeight, rotation = 0) {
    const img = art[`courtyard-teacher-${pose === 'reach' || pose === 'press' ? 'press-v3' : pose}`], w = characterHeight * img.width / img.height;
    const anchor = { ready: .51, reach: PRESS_FOOT, press: PRESS_FOOT, point: .58 }[pose];
    const left = footX - w * anchor, top = baseline - characterHeight;
    shadow(footX, baseline - 5, w * .30, 8);
    ctx.save(); ctx.translate(footX, baseline); ctx.rotate(rotation);
    ctx.drawImage(img, left - footX, top - baseline, w, characterHeight); ctx.restore();
    const finger = pose === 'press' ? { x: left + w * PRESS_FINGER.x, y: top + characterHeight * PRESS_FINGER.y } : null;
    return { pose, rect: { x: left, y: top, w, h: characterHeight }, finger };
  }
  function card(image, r, flip = 1, glow = 0) {
    ctx.save(); ctx.translate(r.x + r.w / 2, r.y + r.h / 2); ctx.rotate(r.angle || 0); ctx.scale(Math.max(.012, Math.abs(flip)), 1);
    if (glow) { ctx.shadowColor = `rgba(255,255,255,${glow})`; ctx.shadowBlur = 40; }
    ctx.drawImage(image, -r.w / 2, -r.h / 2, r.w, r.h); ctx.restore();
  }
  function paint(value, model, integrated) {
    if (!enabled) return false;
    phase(value, model); $('teacher-actor').hidden = true;
    if (!ready()) return true;
    const present = ['screenfade', 'cardfade', 'revealing', 'revealed'].includes(value);
    const growth = value === 'growing' ? model.grow : present ? 1 : 0;
    const backdrop = art['courtyard-background'];
    const focus = smooth((growth - .35) / .65);
    const cover = Math.max(800 / backdrop.width, height / backdrop.height) * mix(1, 1.15, focus);
    const backdropY = mix((height - backdrop.height * cover) / 2, height - backdrop.height * cover, focus);
    ctx.drawImage(backdrop, (800 - backdrop.width * cover) / 2, backdropY, backdrop.width * cover, backdrop.height * cover);
    const g = geometry(), target = result({});
    const sceneAlpha = 1 - smooth((growth - .22) / .45);
    if (sceneAlpha > 0) {
      ctx.save(); ctx.globalAlpha = sceneAlpha;
      shadow(g.machine.x + g.machine.w / 2, g.baseline - 6, g.machine.w * .47, 10);
      ctx.drawImage(art['courtyard-machine'], g.machine.x + (model.shakeX || 0), g.machine.y + (model.shakeY || 0), g.machine.w, g.machine.h);
      if (value === 'pressing') {
        const press = Math.sin(Math.PI * (model.press || 0));
        ctx.fillStyle = `rgba(255,222,83,${.16 + .36 * press})`; ctx.beginPath(); ctx.ellipse(g.button.x, g.button.y, g.machine.h * .043, g.machine.h * .051, 0, 0, Math.PI * 2); ctx.fill();
      }
      ctx.restore();
    }
    let pose = 'ready', move = 0;
    if (value === 'approaching') move = 14 * (1 - model.approach);
    else if (value === 'reaching') { pose = 'reach'; move = 14 * (1 - smooth(model.reach)); }
    else if (value === 'pressing') pose = 'press';
    else if (value === 'releasing') { pose = model.reach > .48 ? 'reach' : 'ready'; move = pose === 'reach' ? 14 * (1 - smooth(model.reach)) : 0; }
    const transition = smooth((growth - .38) / .55);
    if (transition > .48 || present) pose = 'point';
    const pointHeight = Math.min(target.h * .41, g.teacherHeight);
    const pointImage = art['courtyard-teacher-point'];
    const pointWidth = pointHeight * pointImage.width / pointImage.height;
    const pointFoot = Math.min(800 - pointWidth * .42 - 16, target.x + target.w + 6 + pointWidth * .58);
    const actor = character(pose, g, mix(g.footX + move, pointFoot, transition), mix(g.teacherBaseline, target.y + target.h, transition), mix(g.teacherHeight, pointHeight, transition), value === 'approaching' ? -.015 * Math.sin(Math.PI * model.approach) : 0);
    const cw = g.machine.h * .135, ch = cw * 1.5;
    const emission = p => ({ x: g.outlet.x - cw / 2, y: g.outlet.y - ch * .7 + g.machine.h * .13 * p, w: cw, h: ch, angle: .035 + .04 * p });
    const falling = p => { const r = emission(1); return { ...r, x: r.x + 10 * p, y: mix(r.y, g.baseline - ch, smooth(p)), angle: .075 + .12 * p }; };
    if (value === 'pushing') {
      ctx.save(); ctx.beginPath(); ctx.rect(g.outlet.x - cw, g.outlet.y - g.machine.h * .02, cw * 2, height); ctx.clip(); card(art['card-back'], emission(model.push)); ctx.restore();
    }
    if (value === 'falling' || value === 'landing') {
      const r = falling(value === 'falling' ? model.fall : 1);
      if (value === 'landing') r.y -= 3 * Math.sin(Math.PI * model.land);
      shadow(r.x + cw / 2, g.baseline, cw * .6, 5, .13); card(art['card-back'], r);
    }
    if (value === 'growing') {
      const start = falling(1), p = model.grow, r = { x: mix(start.x, target.x, smooth(p)), y: mix(start.y, target.y, smooth(p)), w: mix(cw, target.w, p), h: mix(ch, target.h, p), angle: .195 * (1 - p) };
      const flip = clamp(p / .19); card(flip < .5 ? art['card-back'] : art['card-white'], r, Math.cos(flip * Math.PI), flip >= .5 ? 1 : 0);
    }
    if (value === 'screenfade' || value === 'cardfade') card(art['card-white'], target, 1, model.cardGlow);
    if (value === 'revealing' || value === 'revealed') { card(art['card-white'], target); if (!integrated) { ctx.save(); ctx.globalAlpha = model.reveal; card(art['card-art'], target); ctx.restore(); } }
    canvas.dataset.pose = pose;
    canvas.dataset.geometry = JSON.stringify({ machine: g.machine, baseline: g.baseline, teacherBaseline: g.teacherBaseline, button: g.button, actor, result: target, unit: g.unit });
    return true;
  }
  function background(present) {
    if (!compact) return false;
    ctx.fillStyle = '#fffdf4'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.save(); ctx.translate(x, y); ctx.scale(q, q);
    if (!present) { ctx.save(); ctx.beginPath(); ctx.rect(0, 150, 1205, 670); ctx.clip(); ctx.drawImage(art['scene-no-tray'], 0, 0, 1205, 960); ctx.restore(); }
    return true;
  }
  function actor(actor, shift) {
    if (!compact) { actor.style.transform = `translateX(${shift / 1205 * 100}%)`; actor.querySelectorAll('img').forEach(img => img.removeAttribute('style')); return; }
    actor.style.transform = `translateX(${shift * q / 1205 * 100}%)`;
    actor.querySelectorAll('img').forEach(img => { img.style.left = `${(321 * q + x) / 1205 * 100}%`; img.style.top = `${(215 * q + y) / height * 100}%`; img.style.width = `${1075 * q / 1205 * 100}%`; img.style.height = 'auto'; });
  }
  return {
    update, phase, paint, background, actor, result,
    get enabled() { return enabled; }, get compact() { return compact; }, get ready() { return ready(); },
    get size() { return { q, x, y, height }; },
    insets(top, bottom) { safeTop = Number.isFinite(top) ? Math.max(0, Math.min(200, top)) : 0; safeBottom = Number.isFinite(bottom) ? Math.max(0, Math.min(200, bottom)) : 0; document.documentElement.style.setProperty('--portrait-safe-top', `${safeTop}px`); document.documentElement.style.setProperty('--portrait-safe-bottom', `${safeBottom}px`); },
    reminder(text) { bubble.textContent = text; },
    identity(profile) { identity.replaceChildren(); for (const value of [profile.nickname || '未設定暱稱', `${profile.className} (${profile.studentNo}) ${profile.name}`]) { const span = document.createElement('span'); span.textContent = value; identity.append(span); } },
    restore() { if (compact) ctx.restore(); else if (!enabled) { for (const key of ['left', 'top', 'width']) $('result-card-host').style.removeProperty(key); } }
  };
}
