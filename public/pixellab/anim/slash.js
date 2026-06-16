// Deterministic sword-slash compositor — exact 8-frame iaido choreography.
// Body stays a STATIC back-view sprite; only the katana + VFX animate, so the
// motion is identical across every lane direction (we just swap the body).
//
// Frame spec (1-based, described facing-away / center):
//   1  right hand crosses to the LEFT hip (no sword)
//   2  sword appears in hand at the hip  + blade GLINT (번쩍)
//   3  windup, just before the swing
//   4  swing to center           — small trail (작은 잔상)
//   5  swing through to the right — big trail   (큰 잔상)
//   6  trail gone, hold frame-5 pose
//   7  = frame 3 (return windup)
//   8  sword gone, hand back to rest
//
// Canvas is 64x64. Screen coords: x+ = viewer right, y+ = down.
// Blade angle: 0° = straight up, + = clockwise toward viewer-right.

;(function (global) {
  const W = 64
  const H = 64

  // hand = sword pivot (right hand). a = blade angle, len = blade length.
  // trail = {from,to,strength}. flash = blade glint on this frame.
  const f = (hand, a, len, trail, flash) => ({ hand, blade: a === null ? null : { a, len }, trail, flash })

  const ATTACK = [
    f([26, 44], null, 0, null, false), //   1  hand to left hip, no sword
    f([26, 44], -118, 14, null, true), //    2  sword drawn at hip + glint
    f([27, 40], -90, 20, null, false), //    3  windup (blade points left)
    f([31, 37], 0, 20, { from: -90, to: 0, strength: 0.4 }, false), //   4  to center, small trail
    f([40, 41], 78, 21, { from: 0, to: 78, strength: 0.7 }, false), //    5  to the right, big trail
    f([40, 41], 78, 21, null, false), //     6  hold, trail gone
    f([27, 40], -90, 20, null, false), //    7  = frame 3
    f([40, 42], null, 0, null, false), //    8  sword gone, hand back to rest
  ]

  const bladeVec = (deg) => {
    const r = (deg * Math.PI) / 180
    return [Math.sin(r), -Math.cos(r)]
  }

  function drawKatana(ctx, hx, hy, deg, len, { alpha = 1, color = '#dcebff', glow = false } = {}) {
    const [dx, dy] = bladeVec(deg)
    const px = -dy // perpendicular, for the gentle katana curve
    const py = dx
    const baseX = hx + dx * 2
    const baseY = hy + dy * 2
    const tipX = hx + dx * len
    const tipY = hy + dy * len
    const midX = hx + dx * len * 0.55 + px * 1.6
    const midY = hy + dy * len * 0.55 + py * 1.6
    ctx.save()
    ctx.globalAlpha = alpha
    ctx.lineCap = 'round'
    // dark handle (tsuka) behind the hand
    ctx.strokeStyle = '#2a2018'
    ctx.lineWidth = 2.4
    ctx.beginPath()
    ctx.moveTo(hx - dx * 4, hy - dy * 4)
    ctx.lineTo(hx, hy)
    ctx.stroke()
    // guard (tsuba)
    ctx.fillStyle = '#d8b24a'
    ctx.fillRect(hx - 1, hy - 1, 2, 2)
    // curved blade body
    if (glow) {
      ctx.shadowColor = '#cfefff'
      ctx.shadowBlur = 5
    }
    ctx.strokeStyle = color
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(baseX, baseY)
    ctx.quadraticCurveTo(midX, midY, tipX, tipY)
    ctx.stroke()
    // bright cutting-edge highlight
    ctx.shadowBlur = 0
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 0.8
    ctx.beginPath()
    ctx.moveTo(baseX, baseY)
    ctx.quadraticCurveTo(midX, midY, tipX, tipY)
    ctx.stroke()
    ctx.restore()
  }

  function drawTrail(ctx, hx, hy, from, to, len, strength) {
    const steps = 7
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    for (let i = 0; i < steps; i++) {
      const t = i / (steps - 1)
      const a = from + (to - from) * t
      const alpha = strength * (0.08 + 0.32 * t) // fades toward the windup, strongest at the leading edge
      drawKatana(ctx, hx, hy, a, len * (0.65 + 0.35 * t), { alpha, color: '#9fd6ff' })
    }
    ctx.restore()
  }

  function drawFlash(ctx, x, y) {
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    ctx.globalAlpha = 0.95
    ctx.shadowColor = '#ffffff'
    ctx.shadowBlur = 5
    ctx.strokeStyle = '#ffffff'
    ctx.lineWidth = 1.1
    const r = 5 // tight glint so the freshly-drawn blade stays visible
    const r2 = 2.2
    ctx.beginPath()
    ctx.moveTo(x - r, y)
    ctx.lineTo(x + r, y)
    ctx.moveTo(x, y - r)
    ctx.lineTo(x, y + r)
    ctx.moveTo(x - r2, y - r2)
    ctx.lineTo(x + r2, y + r2)
    ctx.moveTo(x - r2, y + r2)
    ctx.lineTo(x + r2, y - r2)
    ctx.stroke()
    // hot core
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(x - 0.5, y - 0.5, 1, 1)
    ctx.restore()
  }

  function renderAttack(ctx, base, i) {
    ctx.imageSmoothingEnabled = false
    ctx.clearRect(0, 0, W, H)
    ctx.drawImage(base, 0, 0)
    const fr = ATTACK[i % ATTACK.length]
    if (fr.trail && fr.blade) drawTrail(ctx, fr.hand[0], fr.hand[1], fr.trail.from, fr.trail.to, fr.blade.len, fr.trail.strength)
    if (fr.blade) {
      drawKatana(ctx, fr.hand[0], fr.hand[1], fr.blade.a, fr.blade.len, { glow: fr.flash })
      if (fr.flash) {
        const [dx, dy] = bladeVec(fr.blade.a)
        drawFlash(ctx, fr.hand[0] + dx * fr.blade.len * 0.6, fr.hand[1] + dy * fr.blade.len * 0.6)
      }
    }
  }

  // Forward dodge roll — same tumble for every direction (only the body differs).
  function renderRoll(ctx, base, i, n) {
    ctx.imageSmoothingEnabled = false
    ctx.clearRect(0, 0, W, H)
    const t = i / n
    const ang = -Math.PI * 2 * t
    const bob = -Math.sin(t * Math.PI) * 3
    const s = 0.78 + 0.12 * Math.abs(Math.cos(t * Math.PI)) // tuck into a ball mid-roll
    ctx.save()
    ctx.translate(W / 2, 40 + bob)
    ctx.rotate(ang)
    ctx.scale(s, s)
    ctx.drawImage(base, -W / 2, -40)
    ctx.restore()
  }

  global.SlashAnim = { W, H, ATTACK_FRAMES: ATTACK.length, ROLL_FRAMES: 8, renderAttack, renderRoll }
})(window)
