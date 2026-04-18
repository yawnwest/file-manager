import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";

export class Zoom {
  value = $state(1);
  readonly cleanup: () => void;

  constructor() {
    this.cleanup = $effect.root(() => {
      $effect(() => {
        getCurrentWebviewWindow().setZoom(this.value).catch(console.error);
      });
      $effect(() => {
        document.addEventListener("wheel", this.handleWheel, { passive: false });
        return () => document.removeEventListener("wheel", this.handleWheel);
      });
    });
  }

  handleKeydown = (event: KeyboardEvent) => {
    if (event.metaKey) {
      if (event.key === "=" || event.key === "+") {
        event.preventDefault();
        this.value = Math.min(+(this.value + 0.1).toFixed(1), 3);
      } else if (event.key === "-") {
        event.preventDefault();
        this.value = Math.max(+(this.value - 0.1).toFixed(1), 0.5);
      } else if (event.key === "0") {
        event.preventDefault();
        this.value = 1;
      }
    }
  };

  handleWheel = (event: WheelEvent) => {
    if (event.metaKey) {
      event.preventDefault();
      const delta = event.deltaY > 0 ? -0.1 : 0.1;
      this.value = Math.min(Math.max(+(this.value + delta).toFixed(1), 0.5), 3);
    }
  };
}
