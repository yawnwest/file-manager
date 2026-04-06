<script lang="ts">
  import { confirm, message } from "@tauri-apps/plugin-dialog";
  import { onMount } from "svelte";
  import { check } from "@tauri-apps/plugin-updater";
  import { relaunch } from "@tauri-apps/plugin-process";

  let phase: "idle" | "downloading" | "installing" = $state("idle");
  let downloaded = $state(0);
  let total: number | null = $state(null);

  let percent = $derived(total ? Math.round((downloaded / total) * 100) : null);

  onMount(async () => {
    let userConfirmed = false;
    try {
      const update = await check();
      if (update) {
        const install = await confirm(`Version ${update.version} is available. Install now?`, {
          title: "Update available",
        });
        if (install) {
          userConfirmed = true;
          phase = "downloading";
          await update.downloadAndInstall((event) => {
            if (event.event === "Started") {
              total = event.data.contentLength ?? null;
            } else if (event.event === "Progress") {
              downloaded += event.data.chunkLength;
            } else if (event.event === "Finished") {
              phase = "installing";
            }
          });
          await relaunch();
        }
      }
    } catch (e) {
      console.error("Update error:", e);
      phase = "idle";
      if (userConfirmed) {
        await message(e instanceof Error ? e.message : String(e), {
          title: "Update failed",
          kind: "error",
        });
      }
    }
  });
</script>

{#if phase !== "idle"}
  <div class="update-overlay">
    <div class="update-box">
      {#if phase === "downloading"}
        <p>Downloading update…</p>
        {#if percent !== null}
          <div class="progress-bar">
            <div class="progress-fill" style="width: {percent}%"></div>
          </div>
          <span class="progress-label">{percent}%</span>
        {:else}
          <div class="progress-bar indeterminate"></div>
        {/if}
      {:else}
        <p>Installing… The app will restart shortly.</p>
      {/if}
    </div>
  </div>
{/if}

<style>
  .update-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 9999;
  }

  .update-box {
    background: var(--color-surface);
    color: var(--color-foreground);
    border: 1px solid var(--color-border);
    border-radius: 8px;
    padding: 24px 32px;
    min-width: 280px;
    text-align: center;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .update-box p {
    margin: 0;
  }

  .progress-bar {
    height: 6px;
    background: var(--color-border);
    border-radius: 3px;
    overflow: hidden;
  }

  .progress-fill {
    height: 100%;
    background: var(--color-primary);
    border-radius: 3px;
    transition: width 0.2s ease;
  }

  .indeterminate {
    position: relative;
  }

  .indeterminate::after {
    content: "";
    position: absolute;
    top: 0;
    left: -40%;
    width: 40%;
    height: 100%;
    background: var(--color-primary);
    border-radius: 3px;
    animation: slide 1.2s infinite ease-in-out;
  }

  .progress-label {
    font-size: 0.8rem;
    color: var(--color-neutral);
  }

  @keyframes slide {
    0% {
      left: -40%;
    }
    100% {
      left: 100%;
    }
  }
</style>
