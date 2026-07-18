export function cleanPaste(node: HTMLInputElement) {
  const handler = (event: ClipboardEvent) => {
    const pastedText = event.clipboardData?.getData("text");
    if (pastedText) {
      // Remove single and double quotes from pasted text
      const cleanedText = pastedText.replace(/['\"]/g, "");
      node.value = cleanedText;
      node.dispatchEvent(new Event("input", { bubbles: true }));
      event.preventDefault();
    }
  };

  node.addEventListener("paste", handler);

  return {
    destroy() {
      node.removeEventListener("paste", handler);
    },
  };
}
