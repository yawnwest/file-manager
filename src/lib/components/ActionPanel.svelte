<script lang="ts">
  import type { Organizer } from "$lib/states/organizer.svelte";

  let {
    action = $bindable<"delete" | "move" | "rename">(),
    organizer,
    disabled,
    disabledExecute,
    onDeleteAll,
    onMoveAll,
    onRenameAll,
    onOpenMoveTarget,
  }: {
    action: "delete" | "move" | "rename";
    organizer: Organizer;
    disabled: boolean;
    disabledExecute: boolean;
    onDeleteAll: () => void;
    onMoveAll: () => void;
    onRenameAll: () => void;
    onOpenMoveTarget: () => void;
  } = $props();

  let matchPatternInput = $state<HTMLInputElement>();
  let renamePatternInput = $state<HTMLInputElement>();

  const matchGroups = $derived(
    [...(organizer.renameConfig.matchPattern ?? "").matchAll(/\(\?<(\w+)>/g)].map((m) => m[1]),
  );

  function insertAt(input: HTMLInputElement, get: () => string, set: (v: string) => void, snippet: string) {
    const start = input.selectionStart ?? 0;
    const end = input.selectionEnd ?? 0;
    const value = get() ?? "";
    set(value.slice(0, start) + snippet + value.slice(end));
    input.focus();
    const pos = start + snippet.length;
    requestAnimationFrame(() => input.setSelectionRange(pos, pos));
  }
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
    <div class="action-execute">
      <button class="btn-danger" onclick={onDeleteAll} disabled={disabledExecute || organizer.activeCount === 0}>
        Delete all
      </button>
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
          {disabled}
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
        disabled={disabledExecute ||
          organizer.activeCount === 0 ||
          !organizer.moveTargetIsValid ||
          !organizer.moveConfig.targetPath}
      >
        Move all
      </button>
    </div>
  {:else if action === "rename"}
    <div class="action-options">
      <div class="field-group">
        <div class="field">
          <label for="rename-match-pattern">Match pattern</label>
          <input
            id="rename-match-pattern"
            placeholder="(?<number>\d\d)\..*"
            {disabled}
            bind:this={matchPatternInput}
            bind:value={organizer.renameConfig.matchPattern}
          />
        </div>
        <div class="snippets">
          {#each [".*", "(?<name>.*)"] as snippet (snippet)}
            <button
              class="snippet"
              {disabled}
              onclick={() =>
                insertAt(
                  matchPatternInput!,
                  () => organizer.renameConfig.matchPattern,
                  (v) => (organizer.renameConfig.matchPattern = v),
                  snippet,
                )}>{snippet}</button
            >
          {/each}
        </div>
      </div>
      <div class="field-group">
        <div class="field">
          <label for="rename-pattern">Rename to</label>
          <input
            id="rename-pattern"
            placeholder="$&lt;number&gt;.new name"
            {disabled}
            bind:this={renamePatternInput}
            bind:value={organizer.renameConfig.renamePattern}
          />
        </div>
        <div class="snippets">
          <button
            class="snippet"
            {disabled}
            onclick={() =>
              insertAt(
                renamePatternInput!,
                () => organizer.renameConfig.renamePattern,
                (v) => (organizer.renameConfig.renamePattern = v),
                "$<filename>",
              )}>$&lt;filename&gt;</button
          >
          {#each matchGroups as group (group)}
            <button
              class="snippet"
              {disabled}
              onclick={() =>
                insertAt(
                  renamePatternInput!,
                  () => organizer.renameConfig.renamePattern,
                  (v) => (organizer.renameConfig.renamePattern = v),
                  `$<${group}>`,
                )}>$&lt;{group}&gt;</button
            >
          {/each}
        </div>
      </div>
    </div>
    {#if organizer.renamePatternError}
      <p class="error">{organizer.renamePatternError}</p>
    {/if}
    <div class="action-execute">
      <button onclick={onRenameAll} disabled={disabledExecute || organizer.renameCount === 0}> Rename all </button>
    </div>
  {/if}
</section>

<style>
  .field {
    display: flex;
    flex-direction: row;
    align-items: center;
    gap: 0.5rem;
    flex: 1 0 14rem;
  }

  input:not([type="checkbox"]):not([type="radio"]) {
    flex: 1;
  }

  .field-group {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    flex: 1 0 14rem;
  }

  .field-group .field {
    flex: unset;
  }

  .snippets {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
  }

  .snippet {
    font-size: 0.75rem;
    padding: 0.1rem 0.4rem;
    font-family: monospace;
    cursor: pointer;
    --btn-color: var(--color-neutral);
  }

  .btn-danger {
    --btn-color: var(--color-destructive);
  }

  .action-config {
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
    gap: 0.75rem;
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

  .action-row label,
  .action-options label {
    display: flex;
    align-items: center;
    gap: 0.25rem;
  }

  .action-options {
    display: flex;
    flex-direction: row;
    align-items: flex-start;
    gap: 0.75rem;
    flex-wrap: wrap;
  }

  .action-execute {
    display: flex;
    justify-content: flex-end;
  }
</style>
