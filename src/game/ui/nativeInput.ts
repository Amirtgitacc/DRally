/**
 * Raise the OS keyboard for a single text value via a transient hidden input.
 * Used where a Phaser scene needs typed text on a touch device. Returns a
 * disposer that removes the element and its listeners.
 */
export function openNativeText(opts: {
  value: string
  maxLength: number
  onChange: (v: string) => void
  onDone: () => void
}): () => void {
  const el = document.createElement('input')
  el.type = 'text'
  el.value = opts.value
  el.maxLength = opts.maxLength
  el.autocapitalize = 'characters'
  el.style.position = 'fixed'
  el.style.opacity = '0'
  el.style.left = '50%'
  el.style.top = '10%'
  el.style.width = '1px'
  el.style.height = '1px'
  el.style.zIndex = '20'
  document.body.appendChild(el)

  const sanitize = (v: string) => v.replace(/[^a-zA-Z0-9 _-]/g, '').slice(0, opts.maxLength)
  const onInput = () => { el.value = sanitize(el.value); opts.onChange(el.value) }
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Enter') el.blur() }
  const onBlur = () => opts.onDone()
  el.addEventListener('input', onInput)
  el.addEventListener('keydown', onKey)
  el.addEventListener('blur', onBlur)

  // focus must run in the tap handler's gesture to open the keyboard
  el.focus()

  return () => {
    el.removeEventListener('input', onInput)
    el.removeEventListener('keydown', onKey)
    el.removeEventListener('blur', onBlur)
    el.remove()
  }
}
