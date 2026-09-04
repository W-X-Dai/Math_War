const paths = {
  pause: '<rect x="7" y="5" width="3" height="14" rx="1"/><rect x="14" y="5" width="3" height="14" rx="1"/>',
  play: '<path d="M8 5.8v12.4c0 .9 1 1.4 1.8.9l9-6.2a1.1 1.1 0 0 0 0-1.8l-9-6.2A1.1 1.1 0 0 0 8 5.8Z"/>',
  volume: '<path d="M5 10v4h3l4 3V7L8 10H5Z"/><path d="M15 9c1 .8 1.5 1.8 1.5 3S16 14.2 15 15M17.5 6.8A7 7 0 0 1 20 12a7 7 0 0 1-2.5 5.2" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  muted: '<path d="M5 10v4h3l4 3V7L8 10H5Z"/><path d="m15.5 9 4 6m0-6-4 6" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>',
  restart: '<path d="M19 8V4l-2 2a8 8 0 1 0 2.1 8" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M14 8h5V3" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/>',
  close: '<path d="m7 7 10 10M17 7 7 17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>',
  trash: '<path d="M8 8v10h8V8M6 8h12M10 5h4" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>',
  arrow: '<path d="M5 12h13m-5-5 5 5-5 5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>',
};

export function icon(name, className = '') {
  const body = paths[name] ?? '';
  const fill = body.includes('fill="none"') ? 'none' : 'currentColor';
  return `<svg class="${className}" viewBox="0 0 24 24" aria-hidden="true" fill="${fill}">${body}</svg>`;
}

