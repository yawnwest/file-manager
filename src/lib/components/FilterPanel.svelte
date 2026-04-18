<script lang="ts">
  import type { FilterConfig } from "$lib/states/organizer-types";

  let { filters = $bindable(), disabled }: { filters: FilterConfig; disabled: boolean } = $props();

  function parseList(value: string): string[] {
    return value
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
  }
</script>

<section class="filters">
  <div class="filter-row">
    <label>
      <input type="checkbox" bind:checked={filters.recursive} {disabled} /> Recursive
    </label>
  </div>
  <div class="filter-row">
    <label>
      <input type="checkbox" bind:checked={filters.excludeFiles} {disabled} /> Exclude Files
    </label>
    <label>
      <input type="checkbox" bind:checked={filters.excludeFolders} {disabled} /> Exclude Folders
    </label>
    <label>
      <input type="checkbox" bind:checked={filters.excludeSystemFiles} {disabled} /> Exclude system files
    </label>
    <label>
      <input type="checkbox" bind:checked={filters.isEmpty} {disabled} /> Is empty
    </label>
  </div>
  <div class="filter-row">
    <div class="filter-field">
      <label for="include-patterns">Include</label>
      <input
        id="include-patterns"
        placeholder="*.mkv, src/*, *.test.*"
        {disabled}
        value={filters.includePatterns.join(", ")}
        oninput={(e) => (filters.includePatterns = parseList(e.currentTarget.value))}
      />
    </div>
    <div class="filter-field">
      <label for="filter-exclude-patterns">Exclude</label>
      <input
        id="filter-exclude-patterns"
        placeholder="*.tmp, .git, **/node_modules"
        {disabled}
        value={filters.excludePatterns.join(", ")}
        oninput={(e) => (filters.excludePatterns = parseList(e.currentTarget.value))}
      />
    </div>
  </div>
</section>

<style>
  input:not([type="checkbox"]):not([type="radio"]) {
    flex: 1;
  }

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
</style>
