<script lang="ts">
  import { Watcher, type Operation } from "$lib/states/watcher.svelte";
  import { open } from "@tauri-apps/plugin-dialog";
  import { exists, rename } from "@tauri-apps/plugin-fs";
  import { onDestroy } from "svelte";

  const watcher = new Watcher();
  onDestroy(watcher.cleanup);

  const OPERATION_LABELS: Record<string, string> = {
    rotate_left: "Rotate Left",
    rotate_right: "Rotate Right",
    fix: "Fix",
  };

  let dragOver = $state<Operation | null>(null);

  async function openFolder() {
    const selected = await open({ directory: true });
    if (selected !== null) {
      watcher.path = selected;
    }
  }

  async function handleDrop(e: DragEvent, operation: Operation) {
    e.preventDefault();
    dragOver = null;
    const files = e.dataTransfer?.files;
    if (!files?.length) return;
    for (const file of files) {
      const path = (file as File & { path?: string }).path;
      if (!path) continue;
      let dest = `${watcher.path}/${operation}/${file.name}`;
      if (await exists(dest)) {
        const dot = file.name.lastIndexOf(".");
        const stem = dot !== -1 ? file.name.slice(0, dot) : file.name;
        const ext = dot !== -1 ? file.name.slice(dot) : "";
        let i = 1;
        while (await exists(`${watcher.path}/${operation}/${stem} (${i})${ext}`)) i++;
        dest = `${watcher.path}/${operation}/${stem} (${i})${ext}`;
      }
      await rename(path, dest);
    }
  }
</script>

<div class="view">
  <section class="folder-selector">
    <div class="field">
      <label for="watch-folder">Folder</label>
      <input
        id="watch-folder"
        placeholder="Enter a folder path..."
        bind:value={watcher.path}
        class:invalid={!watcher.pathIsValid}
        aria-invalid={!watcher.pathIsValid || undefined}
      />
      <button onclick={openFolder}>Open …</button>
      <span class="status-badge" class:active={watcher.watching}>
        {watcher.watching ? "● Watching" : "○ Stopped"}
      </span>
    </div>
    <p class="error path-error" aria-live="polite">{watcher.pathError}</p>
  </section>

  {#if watcher.path && watcher.pathIsValid}
    <section class="folders-info">
      {#each ["rotate_left", "rotate_right", "fix"] as Operation[] as op (op)}
        <span
          class="chip input"
          class:drag-over={dragOver === op}
          role="button"
          tabindex="0"
          ondragover={(e) => {
            e.preventDefault();
            dragOver = op;
          }}
          ondragleave={() => {
            dragOver = null;
          }}
          ondrop={(e) => handleDrop(e, op)}>{op}/</span
        >
      {/each}
      <span class="chip output">→ output/</span>
    </section>
  {/if}

  <div class="log-container">
    {#if watcher.log.length === 0}
      <p class="empty-state">
        {watcher.watching
          ? "Watching for files… Drop a video into one of the subfolders."
          : "Set a folder above to start watching."}
      </p>
    {:else}
      <div class="log-header">
        {#if watcher.log.some((e) => e.status === "processing")}
          <button class="btn-cancel" onclick={() => watcher.cancelCurrent()}>Cancel current</button>
        {/if}
        {#if watcher.log.some((e) => e.status === "done" || e.status === "error")}
          <button class="btn-clear" onclick={() => watcher.clearFinished()}>Clear finished</button>
        {/if}
      </div>
      <table class="log-table">
        <thead>
          <tr>
            <th>File</th>
            <th>Operation</th>
            <th>Status</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {#each watcher.log as entry (entry.id)}
            <tr class:row-error={entry.status === "error"} class:row-done={entry.status === "done"}>
              <td class="col-filename" title={entry.filePath}>{entry.filename}</td>
              <td class="col-operation">{OPERATION_LABELS[entry.operation] ?? entry.operation}</td>
              <td class="col-status">
                {#if entry.status === "queued"}
                  <span class="status-queued">Queued</span>
                {:else if entry.status === "processing"}
                  <span class="status-processing">Processing…</span>
                {:else if entry.status === "done"}
                  <span class="status-done" title={entry.message}>
                    {entry.message ? "Done (input not deleted)" : "Done"}
                  </span>
                {:else}
                  <span class="status-error" title={entry.message}>{entry.message ?? "Error"}</span>
                {/if}
              </td>
              <td class="col-actions">
                {#if entry.status === "error"}
                  <button class="btn-retry" onclick={() => watcher.retry(entry)} disabled={entry.status !== "error"}
                    >Retry</button
                  >
                {/if}
              </td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </div>
</div>

<style>
  .view {
    display: flex;
    flex-direction: column;
    flex: 1;
    overflow-y: auto;
    min-height: 0;
  }

  .folder-selector {
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
    padding: 1rem;
  }

  .field {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 0.5rem;
  }

  .field label {
    font-weight: bold;
  }

  .field input {
    flex: 1;
  }

  .path-error {
    margin: 0.5rem 0 0;
    min-height: 1lh;
  }

  .status-badge {
    font-size: 0.85rem;
    color: var(--color-neutral);
    white-space: nowrap;
  }

  .status-badge.active {
    color: var(--color-success);
  }

  .folders-info {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 0.5rem;
    padding: 0 1rem 0.75rem;
    flex-shrink: 0;
    flex-wrap: wrap;
  }

  .chip {
    font-size: 0.8rem;
    padding: 0.2rem 0.5rem;
    border-radius: 4px;
    border: 1px solid var(--color-border);
    font-family: monospace;
    background-color: var(--color-surface);
  }

  .chip.drag-over {
    background-color: var(--color-primary);
    color: #ffffff;
    border-color: var(--color-primary);
  }

  .chip.output {
    color: var(--color-primary);
    border-color: var(--color-primary);
  }

  .log-container {
    flex: 1;
    overflow-y: auto;
    min-height: 0;
    padding: 0 1rem 1rem;
  }

  .empty-state {
    color: var(--color-neutral);
    font-size: 0.9rem;
    margin: 1rem 0;
  }

  .log-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 0.9rem;
  }

  .log-table th {
    text-align: left;
    padding: 0.4rem 0.5rem;
    border-bottom: 1px solid var(--color-border);
    font-weight: bold;
    white-space: nowrap;
  }

  .log-table td {
    padding: 0.35rem 0.5rem;
    border-bottom: 1px solid color-mix(in srgb, var(--color-border) 40%, transparent);
    vertical-align: middle;
  }

  .col-filename {
    font-family: monospace;
    max-width: 260px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .col-operation {
    white-space: nowrap;
  }

  .col-status {
    white-space: nowrap;
  }

  .col-actions {
    width: 1px;
    white-space: nowrap;
  }

  .status-processing {
    color: var(--color-neutral);
  }

  .status-done {
    color: var(--color-success);
  }

  .status-error {
    color: var(--color-destructive);
    max-width: 260px;
    display: inline-block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    vertical-align: bottom;
  }

  .btn-cancel {
    --btn-color: var(--color-destructive);
    font-size: 0.8rem;
    padding: 0.1rem 0.5rem;
  }

  .btn-retry {
    --btn-color: var(--color-neutral);
    font-size: 0.8rem;
    padding: 0.1rem 0.4rem;
  }

  .row-done td {
    opacity: 0.7;
  }
</style>
