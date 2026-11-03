<script lang="ts">
  import { t } from "../i18n";
  import { globalState, type FavFolderItem } from "../state/mod.svelte";
  import CategoryItem from "./CategoryItem.svelte";

  const categories = $derived(
    globalState.pinnedItems.filter(
      (item): item is FavFolderItem => item.type === "folder",
    ),
  );

  function createCategory() {
    globalState.createCategory($t("new_category_name"));
  }
</script>

<div class="categories-view">
  <div class="categories-view-toolbar">
    <button data-skin="default" class="create-category-button" onclick={createCategory}>
      <span aria-hidden="true">＋</span>
      {$t("new_category")}
    </button>
  </div>

  {#if categories.length}
    <ul class="categories-view-list" role="listbox" aria-label={$t("categories")}>
      {#each categories as folder (folder.itemId)}
        <CategoryItem {folder} />
      {/each}
    </ul>
  {:else}
    <div class="categories-view-empty">
      <p>{$t("no_categories")}</p>
    </div>
  {/if}
</div>
