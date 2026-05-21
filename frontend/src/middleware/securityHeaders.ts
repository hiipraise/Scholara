// src/middleware/securityHeaders.ts
/**
 * Client-side security measures
 * Note: Server-side headers are primary; these are supplementary
 */

/**
 * Prevent clickjacking
 */
export function preventClickjacking() {
  if (window.self !== window.top) {
    window.top!.location.href = window.self.location.href;
  }
}

/**
 * Disable autocomplete on sensitive forms
 */
export function disableAutocompleteSensitiveForms() {
  // Add to your password input:
  // autocomplete="off" | autocomplete="new-password"
  // Example form attribute:
  // <form autoComplete="off">
}

/**
 * Sanitize user input to prevent XSS
 */
export function sanitizeInput(input: string): string {
  const div = document.createElement("div");
  div.textContent = input;
  return div.innerHTML;
}

/**
 * Prevent XSS via localStorage/sessionStorage
 */
export function safeStorageSet(key: string, value: string) {
  // Always stringify to prevent injection
  sessionStorage.setItem(key, JSON.stringify(value));
}

export function safeStorageGet(key: string): string | null {
  const item = sessionStorage.getItem(key);
  if (!item) return null;
  try {
    return JSON.parse(item);
  } catch {
    return item; // Fallback if not JSON
  }
}

/**
 * Implement CSP violations reporting (optional)
 */
export function setupCSPReporting() {
  document.addEventListener("securitypolicyviolation", (event) => {
    console.warn("CSP Violation:", {
      violatedDirective: event.violatedDirective,
      blockedURI: event.blockedURI,
      sourceFile: event.sourceFile,
      lineNumber: event.lineNumber,
    });

    // In production, send to security logging endpoint
    // fetch('/api/security/csp-violation', {
    //   method: 'POST',
    //   body: JSON.stringify({...event})
    // });
  });
}

/**
 * Add security headers to outgoing requests (client-side)
 */
export function getSecurityHeaders() {
  return {
    "X-Requested-With": "XMLHttpRequest",
    "X-Client-Version": "1.0",
    "X-Timestamp": new Date().toISOString(),
  };
}
