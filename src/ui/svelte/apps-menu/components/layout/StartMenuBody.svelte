<script lang="ts">
  import { globalState } from "../../state/mod.svelte";
  import { StartView } from "../../constants";
  import PinnedView from "../PinnedView.svelte";
  import AllAppsView from "../AllAppsView.svelte";
  import CategoriesView from "../CategoriesView.svelte";
</script>

<div class="apps-menu-body">
  {#if globalState.view === StartView.Favorites}
    <PinnedView />
  {:else if globalState.view === StartView.All}
    <AllAppsView />
  {:else if globalState.view === StartView.Categories}
    <CategoriesView />
  {/if}
</div>
