export function iconifyUrl(slug: string, color = '#1a1a1a'): string {
  return `https://api.iconify.design/simple-icons/${slug}.svg?color=${encodeURIComponent(color)}`;
}
