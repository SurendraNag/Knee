// QR code for a link, as an inline SVG (black on white so every phone camera reads it). Returns '' when the link is too
// long for a QR code, so callers can simply leave the box empty.
import qrcode from 'qrcode-generator';
export function qrSvg(text) {
  try {
    const q = qrcode(0, 'L'); q.addData(text); q.make();
    return q.createSvgTag({ cellSize: 4, margin: 3, scalable: true, alt: 'QR code of the link' });
  } catch { return ''; }
}
// Larger text for patients: one class on <html>, kept in this browser only (no patient data)
const BIG = 'anatomy-big-text';
export function initBigText(btn, onChange) {
  let on = false; try { on = localStorage.getItem(BIG) === '1'; } catch { /* storage blocked */ }
  const set = (v) => {
    on = v; document.documentElement.classList.toggle('big-text', on); btn?.setAttribute('aria-pressed', String(on));
    try { localStorage.setItem(BIG, on ? '1' : '0'); } catch { /* storage blocked */ }
    onChange?.(on);
  };
  btn?.addEventListener('click', () => set(!on));
  set(on);
  return set;
}
