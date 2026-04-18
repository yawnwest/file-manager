<script lang="ts">
  import type { Organizer } from "$lib/states/organizer.svelte";

  let {
    action = $bindable<"delete" | "move" | "rename">(),
    organizer,
    disabled,
    onDeleteAll,
    onMoveAll,
    onRenameAll,
    onOpenMoveTarget,
  }: {
    action: "delete" | "move" | "rename";
    organizer: Organizer;
    disabled: boolean;
    onDeleteAll: () => void;
    onMoveAll: () => void;
    onRenameAll: () => void;
    onOpenMoveTarget: () => void;
  } = $props();
</script>

<section class="action-config">
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
      <button class="btn-danger" onclick={onDeleteAll} disabled={disabled || organizer.activeCount === 0}
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
        <button onclick={onOpenMoveTarget} {disabled}>Open …</button>
      </div>
    </div>
    {#if organizer.moveTargetError}
      <p class="error">{organizer.moveTargetError}</p>
    {/if}
    <div class="action-execute">
      <button
        onclick={onMoveAll}
        disabled={disabled ||
          organizer.activeCount === 0 ||
          !organizer.moveTargetIsValid ||
          !organizer.moveConfig.targetPath}
      >
        Move {organizer.activeCount} of {organizer.entryCount}
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
      <button onclick={onRenameAll} disabled={disabled || organizer.renameCount === 0}>
        Rename {organizer.renameCount} of {organizer.entryCount}
      </button>
    </div>
  {/if}
</section>

<style>
  .field {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 0.5rem;
  }

  .field label {
    font-weight: bold;
  }

  input,
  button {
    border: 1px solid var(--color-border);
    border-radius: 4px;
    padding: 0.25rem 0.5rem;
  }

  input {
    flex: 1;
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

  .error {
    color: var(--color-destructive);
  }

  .invalid {
    outline: 2px solid var(--color-destructive);
  }

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

  .filter-field {
    display: flex;
    align-items: center;
    gap: 0.4rem;
    flex: 1 0 14rem;
  }
</style>
