<script lang="ts">
  import { Organizer } from "$lib/states/organizer.svelte";
  import { open, confirm } from "@tauri-apps/plugin-dialog";

  const organizer = new Organizer();
  const disabled = $derived(organizer.state !== "idle");

  let action = $state<"delete" | "move" | "rename">("delete");

  async function openFolder() {
    const selected = await open({ directory: true });
    if (selected !== null) {
      organizer.path = selected;
    }
  }

  function reloadFolder() {
    organizer.reload();
  }

  function parseList(value: string): string[] {
    return value
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }

  async function deleteAll() {
    const ok = await confirm(
      `Delete ${organizer.deleteCount} of ${organizer.entryCount} entries? This cannot be undone.`,
      {
        title: "Confirm deletion",
        kind: "warning",
      },
    );
    if (ok) await organizer.deleteAll();
  }

  async function openMoveTarget() {
    const selected = await open({ directory: true });
    if (selected !== null) {
      organizer.moveConfig.targetPath = selected;
    }
  }

  async function moveAll() {
    const ok = await confirm(
      `Move ${organizer.deleteCount} of ${organizer.entryCount} entries to "${organizer.moveConfig.targetPath}"?`,
      {
        title: "Confirm move",
        kind: "warning",
      },
    );
    if (ok) await organizer.moveAll();
  }

  async function renameAll() {
    const ok = await confirm(`Rename ${organizer.renameCount} of ${organizer.entryCount} entries?`, {
      title: "Confirm rename",
      kind: "warning",
    });
    if (ok) await organizer.renameAll();
  }
</script>

<section class="folder-selector">
  <div class="field">
    <label for="folder-input">Folder</label>
    <input
      id="folder-input"
      placeholder="Enter a folder path..."
      bind:value={organizer.path}
      class:invalid={!organizer.pathIsValid}
      disabled={disabled && organizer.state !== "scanning"}
    />
    <button onclick={openFolder} {disabled}>Open …</button>
    <button onclick={reloadFolder} {disabled}>↺</button>
  </div>
  <p class="error path-error">{organizer.pathError}</p>
</section>

<section class="filters" class:disabled={organizer.state !== "idle"}>
  <div class="filter-row">
    <label>
      <input type="checkbox" bind:checked={organizer.filters.excludeFiles} {disabled} /> Exclude Files
    </label>
    <label>
      <input type="checkbox" bind:checked={organizer.filters.excludeFolders} {disabled} /> Exclude Folders
    </label>
    <label>
      <input type="checkbox" bind:checked={organizer.filters.excludeSystemFiles} {disabled} /> Exclude system files
    </label>
    <label>
      <input type="checkbox" bind:checked={organizer.filters.recursive} {disabled} /> Recursive
    </label>
  </div>
  <div class="filter-row">
    <div class="filter-field">
      <label for="filter-extensions">Extensions</label>
      <input
        id="filter-extensions"
        placeholder="mkv, rar, txt"
        {disabled}
        value={organizer.filters.extensions.join(", ")}
        oninput={(e) => (organizer.filters.extensions = parseList(e.currentTarget.value))}
      />
    </div>
    <div class="filter-field">
      <label for="include-patterns">Include</label>
      <input
        id="include-patterns"
        placeholder="src/*, *.test.*"
        {disabled}
        value={organizer.filters.includePatterns.join(", ")}
        oninput={(e) => (organizer.filters.includePatterns = parseList(e.currentTarget.value))}
      />
    </div>
    <div class="filter-field">
      <label for="filter-exclude-patterns">Exclude</label>
      <input
        id="filter-exclude-patterns"
        placeholder=".git, node_modules"
        {disabled}
        value={organizer.filters.excludePatterns.join(", ")}
        oninput={(e) => (organizer.filters.excludePatterns = parseList(e.currentTarget.value))}
      />
    </div>
  </div>
</section>

<section class="action-config" class:disabled={organizer.state !== "idle"}>
  <div class="action-row">
    <label>
      <input type="radio" bind:group={action} value="delete" {disabled} /> Delete
    </label>
    <label>
      <input type="radio" bind:group={action} value="move" {disabled} /> Move
    </label>
    <label>
      <input type="radio" bind:group={action} value="rename" {disabled} /> Rename
    </label>
  </div>
  {#if action === "delete"}
    <div class="action-options">
      <label>
        <input type="checkbox" bind:checked={organizer.filters.isEmpty} {disabled} /> Is empty
      </label>
    </div>
    <div class="action-execute">
      <button class="btn-danger" onclick={deleteAll} disabled={disabled || organizer.deleteCount === 0}
        >Delete all</button
      >
    </div>
  {:else if action === "move"}
    <div class="action-options">
      <div class="field">
        <label for="move-target">Target</label>
        <input
          id="move-target"
          placeholder="Enter a target folder path..."
          bind:value={organizer.moveConfig.targetPath}
          class:invalid={organizer.moveConfig.targetPath && !organizer.moveTargetIsValid}
          disabled={disabled && organizer.state !== "scanning"}
        />
        <button onclick={openMoveTarget} {disabled}>Open …</button>
      </div>
    </div>
    {#if organizer.moveTargetError}
      <p class="error">{organizer.moveTargetError}</p>
    {/if}
    <div class="action-execute">
      <button
        onclick={moveAll}
        disabled={disabled ||
          organizer.deleteCount === 0 ||
          !organizer.moveTargetIsValid ||
          !organizer.moveConfig.targetPath}
      >
        Move {organizer.deleteCount} of {organizer.entryCount}
      </button>
    </div>
  {:else if action === "rename"}
    <div class="action-options">
      <div class="filter-field">
        <label for="rename-match-pattern">Match pattern</label>
        <input
          id="rename-match-pattern"
          placeholder="(?<number>\d\d)\..*"
          {disabled}
          bind:value={organizer.renameConfig.matchPattern}
        />
      </div>
      <div class="filter-field">
        <label for="rename-pattern">Rename to</label>
        <input
          id="rename-pattern"
          placeholder="$&lt;number&gt;.new name"
          {disabled}
          bind:value={organizer.renameConfig.renamePattern}
        />
      </div>
    </div>
    {#if organizer.renamePatternError}
      <p class="error">{organizer.renamePatternError}</p>
    {/if}
    <div class="action-execute">
      <button onclick={renameAll} disabled={disabled || organizer.renameCount === 0}>
        Rename {organizer.renameCount} of {organizer.entryCount}
      </button>
    </div>
  {/if}
</section>

<section class="entries">
  <p class="entry-count">
    {#if action === "rename"}
      {organizer.renameCount} of {organizer.entryCount} matching
    {:else}
      {organizer.deleteCount} of {organizer.entryCount} entries
    {/if}
  </p>
  <table>
    <thead>
      <tr>
        <th class="col-ignore">Ignore</th>
        <th>Path</th>
        {#if action === "rename"}<th>New name</th>{/if}
        <th class="col-status">Status</th>
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
  .folder-selector {
    display: flex;
    flex-direction: column;
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

  input {
    flex: 1;
  }

  input,
  button {
    border: 1px solid var(--color-border);
    border-radius: 4px;
    padding: 0.25rem 0.5rem;
  }

  input {
    background-color: var(--color-surface);
    color-scheme: light dark;
  }

  .btn-danger {
    --btn-color: var(--color-destructive);
  }

  button {
    --btn-color: var(--color-primary);
    color: #ffffff;
    background-color: var(--btn-color);
    cursor: pointer;
  }

  button:active:not(:disabled) {
    background-color: color-mix(in srgb, var(--btn-color) 80%, black);
  }

  button:disabled,
  input:disabled {
    opacity: 0.6;
    cursor: not-allowed;
    transition: opacity 0s 150ms;
  }

  /* States */
  .error {
    color: var(--color-destructive);
  }

  .path-error {
    margin: 0.5rem 0 0;
    min-height: 1lh;
  }

  .invalid {
    outline: 2px solid var(--color-destructive);
  }

  /* Filters */
  .filters {
    display: flex;
    flex-direction: column;
    gap: 0.8rem;
    margin: 0.75rem 1rem;
    padding: 0.75rem 1rem;
    background-color: color-mix(in srgb, var(--color-surface) 80%, var(--color-border));
    border-radius: 8px;
  }

  .filter-row {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 0.75rem;
    flex-wrap: wrap;
  }

  .filter-row label {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    white-space: nowrap;
  }

  .filter-field {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    flex: 1 0 14rem;
  }

  /* Action config */
  .action-config {
    display: flex;
    flex-direction: column;
    gap: 0.8rem;
    margin: 0.75rem 1rem;
    padding: 0.75rem 1rem;
    background-color: color-mix(in srgb, var(--color-surface) 80%, var(--color-border));
    border-radius: 8px;
  }

  .action-row {
    display: flex;
    flex-direction: row;
    gap: 1rem;
    align-items: center;
  }

  .action-row label {
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }

  .action-options {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 0.75rem;
    flex-wrap: wrap;
  }

  .action-options label {
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }

  .action-execute {
    display: flex;
    justify-content: flex-end;
  }

  .entry-count {
    margin: 1rem 0.1rem;
    font-size: 0.85em;
    color: color-mix(in srgb, var(--color-foreground) 60%, transparent);
  }

  /* Table */
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
