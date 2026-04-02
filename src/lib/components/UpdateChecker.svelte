<script lang="ts">
  import { confirm, message } from "@tauri-apps/plugin-dialog";
  import { onMount } from "svelte";
  import { check } from "@tauri-apps/plugin-updater";

  onMount(async () => {
    try {
      const update = await check();
      if (update) {
        const install = await confirm(`Version ${update.version} is available. Install now?`, {
          title: "Update available",
        });
        if (install) {
          message("The update is being installed. The app will restart shortly.", {
            title: "Installing update...",
          });
          await update.downloadAndInstall();
        }
      }
    } catch (e) {
      console.error("Update check failed:", e);
    }
  });
</script>
