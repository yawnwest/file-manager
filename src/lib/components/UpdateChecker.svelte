<script lang="ts">
  import { confirm } from "@tauri-apps/plugin-dialog";
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
          await update.downloadAndInstall();
        }
      }
    } catch (e) {
      console.error("Update check failed:", e);
    }
  });
</script>
