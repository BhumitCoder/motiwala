import { renderPdfServerFn } from "@/lib/pdfServer";

/** Concatenates every same-origin stylesheet the page has already loaded and
 * parsed, so the headless-rendered copy gets the exact same CSS (including
 * the `@media print` rules) as this document. Reads the already-parsed
 * CSSOM rather than re-fetching the stylesheet file — a fetch of an
 * asset URL can silently fail (CORS, CSP, caching quirks) and there'd be no
 * sign of it beyond a blank/unstyled PDF. */
function collectAppStylesheets(): string {
  const parts: string[] = [];
  for (const sheet of Array.from(document.styleSheets)) {
    try {
      for (const rule of Array.from(sheet.cssRules)) parts.push(rule.cssText);
    } catch {
      // Cross-origin sheet (e.g. a font CDN) — can't read its rules, skip it.
    }
  }
  return parts.join("\n");
}

/** Renders a DOM node to a real, vector-quality PDF server-side (headless
 * Chromium), rather than rasterizing a screenshot — text stays crisp at any
 * zoom and the file is far smaller. The exported markup carries no
 * `<script>` tags, only the printable subtree's HTML plus the app's own
 * compiled CSS, so the server just prints a static page — it never boots
 * the SPA or touches Firestore. */
async function elementToPdfBlob(
  el: HTMLElement,
  orientation: "portrait" | "landscape" = "landscape",
): Promise<Blob> {
  const css = collectAppStylesheets();
  const html =
    "<!DOCTYPE html><html><head><meta charset=\"utf-8\">" +
    `<base href="${window.location.origin}/">` +
    `<style>${css}</style></head><body>${el.outerHTML}</body></html>`;
  const res = await renderPdfServerFn({
    data: { html, landscape: orientation === "landscape" },
  });
  return res.blob();
}

function pdfFilename(name: string): string {
  return name.toLowerCase().endsWith(".pdf") ? name : `${name}.pdf`;
}

function triggerDownload(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Saves a real .pdf file straight to Downloads — no print dialog, no manual
 * "Save as PDF" step. */
export async function downloadElementAsPdf(
  el: HTMLElement,
  filename: string,
  orientation?: "portrait" | "landscape",
) {
  const blob = await elementToPdfBlob(el, orientation);
  triggerDownload(blob, pdfFilename(filename));
}

/** Opens the OS share sheet (WhatsApp/Mail/AirDrop/...) with the PDF
 * attached. Falls back to a plain download when the browser can't share
 * files (most desktop browsers besides recent Safari/Chrome-on-mobile). */
export async function shareElementAsPdf(
  el: HTMLElement,
  filename: string,
  orientation?: "portrait" | "landscape",
): Promise<"shared" | "cancelled" | "downloaded"> {
  const name = pdfFilename(filename);
  const blob = await elementToPdfBlob(el, orientation);
  const file = new File([blob], name, { type: "application/pdf" });
  const nav = navigator as Navigator & { canShare?: (data: { files: File[] }) => boolean };

  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      // `text` is a no-op for targets that accept files, but for a target
      // that only registers as a text share handler (e.g. WhatsApp Desktop
      // on Windows) it's the only part of this call that actually arrives —
      // the OS hands the share off silently, so the web page can't detect
      // or prevent a target dropping the attachment.
      await nav.share({ files: [file], title: name, text: name });
      return "shared";
    } catch (err) {
      if ((err as DOMException)?.name === "AbortError") return "cancelled";
      // Any other failure (e.g. share sheet rejected the file type) — fall
      // through to a plain download so the user still gets the PDF.
    }
  }
  triggerDownload(blob, name);
  return "downloaded";
}
