<script lang="ts">
  import type { Organizer } from "$lib/states/organizer.svelte";
  import { computeNewName } from "$lib/states/organizer-rename";

  let {
    organizer,
    action,
  }: {
    organizer: Organizer;
    action: "delete" | "move" | "rename";
  } = $props();

  const ROW_HEIGHT = 30;
  const OVERSCAN = 5;

  let scrollEl: HTMLElement | undefined = $state();
  let scrollTop = $state(0);
  let containerHeight = $state(400);

  $effect(() => {
    if (!scrollEl) return;
    const ro = new ResizeObserver(() => {
      containerHeight = scrollEl!.clientHeight;
    });
    ro.observe(scrollEl);
    containerHeight = scrollEl.clientHeight;
    return () => ro.disconnect();
  });

  function onScroll(e: Event) {
    scrollTop = (e.currentTarget as HTMLElement).scrollTop;
  }

  const virtualState = $derived.by(() => {
    const entries = organizer.entries;
    const total = entries.length;
    const start = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
    const end = Math.min(total, Math.ceil((scrollTop + containerHeight) / ROW_HEIGHT) + OVERSCAN);
    return {
      start,
      offsetTop: start * ROW_HEIGHT,
      offsetBottom: (total - end) * ROW_HEIGHT,
      visible: entries.slice(start, end),
    };
  });

  const colSpan = $derived(action === "rename" ? 4 : 3);
</script>

<section class="entries">
  <p class="entry-count">
    {#if organizer.state === "scanning"}
      Scanning… {organizer.scanned > 0 ? `${organizer.scanned} entries found` : ""}
    {:else if action === "rename"}
      {organizer.renameCount} of {organizer.entryCount} matching
    {:else}
      {organizer.activeCount} of {organizer.entryCount} entries
    {/if}
  </p>
  <div class="scroll-container" bind:this={scrollEl} onscroll={onScroll}>
    <table>
      <thead>
        <tr>
          <th class="col-ignore" scope="col">Ignore</th>
          <th scope="col">Path</th>
          {#if action === "rename"}<th scope="col">New name</th>{/if}
          <th class="col-status" scope="col">Status</th>
        </tr>
      </thead>
      <tbody>
        {#if virtualState.offsetTop > 0}
          <tr class="spacer" style="height: {virtualState.offsetTop}px"><td colspan={colSpan}></td></tr>
        {/if}
        {#each virtualState.visible as entry, i (entry.path)}
          {@const newName =
            action === "rename"
              ? computeNewName(entry, organizer.renameRegex, organizer.renameConfig.renamePattern)
              : null}
          <tr class:ignored={entry.ignored} class:even={(virtualState.start + i) % 2 === 1}>
            <td class="col-ignore"><input type="checkbox" bind:checked={entry.ignored} /></td>
            <td class="col-path">{entry.isFile ? "📄" : "📁"} {entry.path}</td>
            {#if action === "rename"}
              <td class="col-new-name">
                {#if newName !== null}
                  <span class="new-name">{newName}</span>
                {:else}
                  <span class="no-match">—</span>
                {/if}
              </td>
            {/if}
            <td class="col-status">
              {#if entry.status?.ok === true}
                <span class="status-ok">
                  {action === "rename" ? "Renamed" : action === "move" ? "Moved" : "Deleted"}
                </span>
              {:else if entry.status?.ok === false}
                <span class="status-error">{entry.status.message}</span>
              {/if}
            </td>
          </tr>
        {/each}
        {#if virtualState.offsetBottom > 0}
          <tr class="spacer" style="height: {virtualState.offsetBottom}px"><td colspan={colSpan}></td></tr>
        {/if}
      </tbody>
    </table>
  </div>
</section>

<style>
  .entry-count {
    margin: 1rem 0.1rem;
    font-size: 0.85em;
    color: color-mix(in srgb, var(--color-foreground) 60%, transparent);
  }

  .entries {
    padding: 0 1rem;
    display: flex;
    flex-direction: column;
    flex: 1;
    overflow: hidden;
    min-height: 0;
  }

  .scroll-container {
    flex: 1;
    overflow-y: auto;
    min-height: 0;
  }

  table {
    width: 100%;
    table-layout: fixed;
    border-collapse: collapse;
  }

  thead {
    position: sticky;
    top: 0;
    background-color: var(--color-background);
    z-index: 1;
  }

  table th {
    text-align: left;
    padding: 0.25rem 0.5rem;
    border-bottom: 1px solid var(--color-border);
  }

  table td {
    padding: 0.2rem 0.5rem;
    vertical-align: middle;
    overflow: hidden;
  }

  table tbody tr.even {
    background-color: color-mix(in srgb, var(--color-surface) 95%, var(--color-foreground));
  }

  .spacer td {
    padding: 0;
  }

  .col-ignore {
    width: 4rem;
    text-align: center;
  }

  tr.ignored td {
    opacity: 0.4;
  }

  .col-path {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .col-new-name {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .no-match {
    color: color-mix(in srgb, var(--color-foreground) 35%, transparent);
  }

  .col-status {
    width: 10rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .status-ok {
    color: var(--color-success);
  }

  .status-error {
    color: var(--color-destructive);
  }
</style>
