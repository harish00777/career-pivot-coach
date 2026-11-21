import net from 'node:net';

export function isPrivateOrReservedIp(ip: string): boolean {
  // Handle IPv4-mapped IPv6 like ::ffff:127.0.0.1
  const cleanIp = ip.startsWith('::ffff:') ? ip.slice(7) : ip;

  if (net.isIPv4(cleanIp)) {
    const parts = cleanIp.split('.').map(Number);
    if (parts.length !== 4 || parts.some((n) => Number.isNaN(n) || n < 0 || n > 255)) {
      return true;
    }
    const [a, b] = parts;
    if (a === 0) return true; // 0.0.0.0/8
    if (a === 10) return true; // 10.0.0.0/8
    if (a === 127) return true; // 127.0.0.0/8 loopback
    if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local / cloud metadata
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
    if (a === 192 && b === 168) return true; // 192.168.0.0/16
    if (a === 100 && b >= 64 && b <= 127) return true; // 100.64.0.0/10 CGNAT
    if (a >= 224) return true; // multicast / reserved
    return false;
  }

  if (net.isIPv6(cleanIp)) {
    const lower = cleanIp.toLowerCase();
    if (lower === '::1' || lower === '::') return true;
    if (lower.startsWith('fe80:') || lower.startsWith('fc') || lower.startsWith('fd')) {
      return true;
    }
    return false;
  }

  return true;
}

export function validateExternalJdUrl(rawUrl: string): { valid: boolean; parsed?: URL; reason?: string } {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    return { valid: false, reason: 'Please enter a valid http:// or https:// URL.' };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { valid: false, reason: 'Only http:// and https:// URLs are permitted.' };
  }

  const host = parsed.hostname.toLowerCase();
  if (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host === 'metadata.google.internal'
  ) {
    return { valid: false, reason: 'Local or internal hostnames are not permitted.' };
  }

  if (net.isIP(host) && isPrivateOrReservedIp(host)) {
    return { valid: false, reason: 'Private or loopback IP addresses are not permitted.' };
  }

  return { valid: true, parsed };
}
