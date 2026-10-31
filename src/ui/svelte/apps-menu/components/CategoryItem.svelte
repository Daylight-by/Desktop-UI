<script lang="ts">
  import { invoke, SeelenCommand } from "@seelen-ui/lib";
  import type { FavFolderItem } from "../state/mod.svelte";
  import { globalState } from "../state/mod.svelte";
  import { t } from "../i18n";
  import { getFolderContextMenu } from "./context-menu.svelte";
  import { FileIcon } from "libs/ui/svelte/components/Icon";
  import FolderModal from "./FolderModal.svelte";

  interface Props {
    folder: FavFolderItem;
  }

  let { folder }: Props = $props();
  let isModalOpen = $state(false);

  const menu = $derived(getFolderContextMenu(folder, $t));
  const expandedItems = $derived(
    folder.itemIds
      .map((id) => ({ id, item: globalState.getMenuItem(id) }))
      .filter((entry) => !!entry.item),
  );

  function openFolder() {
    isModalOpen = true;
  }

  function handleContextMenu() {
    invoke(SeelenCommand.TriggerContextMenu, { menu, forwardTo: null });
  }
</script>

<li
  class="folder category-item"
  role="option"
  aria-selected="false"
  tabindex="0"
  onclick={openFolder}
  onkeydown={(event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openFolder();
    }
  }}
  oncontextmenu={handleContextMenu}
>
  <div class="folder-grid" aria-hidden="true">
    {#each expandedItems.slice(0, 4) as entry (entry.id)}
      {#if entry.item}
        <div class="folder-preview">
          <FileIcon class="folder-preview-icon" path={entry.item.path} umid={entry.item.umid} />
        </div>
      {/if}
    {/each}
  </div>
  <div class="folder-name" title={folder.name || $t("folder")}>
    {folder.name || $t("folder")}
  </div>
</li>

{#if isModalOpen}
  <FolderModal {folder} onClose={() => (isModalOpen = false)} />
{/if}
