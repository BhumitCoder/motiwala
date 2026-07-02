/**
 * Open the print dialog with a meaningful document title — when the user
 * chooses "Save as PDF", the browser suggests this as the filename
 * (e.g. INV-0042.pdf instead of the app name).
 */
export function printWithName(name: string) {
  const prev = document.title;
  document.title = name;
  const restore = () => {
    document.title = prev;
    window.removeEventListener("afterprint", restore);
  };
  window.addEventListener("afterprint", restore);
  window.print();
  // Fallback for browsers that don't fire afterprint reliably
  setTimeout(restore, 3000);
}
