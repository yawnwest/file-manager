<script lang="ts">
  import type { Organizer } from "$lib/states/organizer.svelte";

  let {
    organizer,
    action,
  }: {
    organizer: Organizer;
    action: "delete" | "move" | "rename";
  } = $props();
</script>

<section class="entries">
  <p class="entry-count">
    {#if action === "rename"}
      {organizer.renameCount} of {organizer.entryCount} matching
    {:else}
      {organizer.activeCount} of {organizer.entryCount} entries
    {/if}
  </p>
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
      {#each organizer.entries as entry (entry.path)}
        {@const newName = action === "rename" ? organizer.computeNewName(entry) : null}
        <tr class:ignored={entry.ignored}>
          <td class="col-ignore"><input type="checkbox" bind:checked={entry.ignored} /></td>
          <td>{entry.isFile ? "📄" : "📁"} {entry.path}</td>
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
    </tbody>
  </table>
</section>

<style>
  .entry-count {
    margin: 1rem 0.1rem;
    font-size: 0.85em;
    color: color-mix(in srgb, var(--color-foreground) 60%, transparent);
  }

  .entries {
    padding: 0rem 1rem;
  }

  table {
    width: 100%;
    table-layout: fixed;
    border-collapse: collapse;
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

  table tbody tr:nth-child(even) {
    background-color: color-mix(in srgb, var(--color-surface) 95%, var(--color-foreground));
  }

  .col-ignore {
    width: 4rem;
    text-align: center;
  }

  tr.ignored td {
    opacity: 0.4;
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
