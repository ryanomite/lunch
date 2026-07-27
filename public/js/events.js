const _handlers = new Map();

export function on(event, fn) {
  if (!_handlers.has(event)) _handlers.set(event, []);
  _handlers.get(event).push(fn);
  return () => off(event, fn);
}

export function off(event, fn) {
  const list = _handlers.get(event);
  if (list) _handlers.set(event, list.filter(f => f !== fn));
}

export function emit(event, data) {
  const list = _handlers.get(event);
  if (list) list.forEach(fn => fn(data));
}
