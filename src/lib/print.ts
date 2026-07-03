// Captured once, from the first call — NOT re-read per call. If each call
// captured "whatever document.title currently is", two prints started in
// quick succession (before the first one's restore fires) would chain: the
// second call's "previous title" would be the first call's temporary
// INV-number, so its restore would clobber the title back to that instead
// of the true original app title.
let originalTitle: string | undefined;

/**
 * Open the print dialog with a meaningful document title — when the user
 * chooses "Save as PDF", the browser suggests this as the filename
 * (e.g. INV-0042.pdf instead of the app name).
 */
export function printWithName(name: string) {
  if (originalTitle === undefined) originalTitle = document.title;
  document.title = name;
  let timer: ReturnType<typeof setTimeout>;
  const restore = () => {
    document.title = originalTitle!;
    window.removeEventListener("afterprint", restore);
    clearTimeout(timer);
  };
  window.addEventListener("afterprint", restore);
  window.print();
  // Fallback for browsers that don't fire afterprint reliably
  timer = setTimeout(restore, 3000);
}
